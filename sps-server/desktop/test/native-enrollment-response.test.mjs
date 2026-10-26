import assert from "node:assert/strict";
import test from "node:test";
import { parseSpsNativeEnrollmentResponse } from "../src/native-enrollment-response.mjs";

const DEVICE_ID = "deadbeef-cafe-4bad-8dad-0123456789ab";
const ENROLLMENT_ID = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const HOST_ID = "deadbeef-cafe-4bad-8dad-0123456789ab";
const SERVER_PIN = "a".repeat(64);
const ISSUER_PIN = "b".repeat(64);
const SESSION_TOKEN = "A".repeat(64);
const COOKIE = `sps_identity_session=${SESSION_TOKEN}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`;
const JSON_HEADERS = ["Content-Type", "application/json; charset=utf-8", "Cache-Control", "no-store"];

function response(operation, value, options = {}) {
  const body = options.body ?? Buffer.from(JSON.stringify(value), "utf8");
  const headers = options.rawHeaders ?? [
    "Content-Length", String(body.length), ...JSON_HEADERS,
    ...(operation === "exchange" ? ["Set-Cookie", COOKIE] : []),
  ];
  return {
    statusCode: options.statusCode ?? (operation === "exchange" ? 201 : 200),
    rawHeaders: headers,
    body,
  };
}

function expectInvalid(operation, input) {
  assert.throws(() => parseSpsNativeEnrollmentResponse(operation, input), error => {
    assert.equal(error.code, "native_enrollment_response_invalid");
    assert.equal(error.message, "Native enrollment response is invalid.");
    assert.equal(error.cause, undefined);
    assert.deepEqual(Object.keys(error), ["code"]);
    return true;
  });
}

test("Workspace discovery accepts only bounded public ID/name rows and never cookies or credentials", () => {
  const choices = [{ id: DEVICE_ID, name: "개인 Workspace" }];
  const actual = parseSpsNativeEnrollmentResponse("workspaces", response("workspaces", choices));
  assert.deepEqual(actual, choices);
  assert.equal(Object.isFrozen(actual), true);
  assert.equal(Object.isFrozen(actual[0]), true);
  assert.deepEqual(parseSpsNativeEnrollmentResponse("workspaces", response("workspaces", [])), []);
  const unusualNames = ["   ", "x".repeat(301), "line\nbreak\t\u0000\u007f"].map((name, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name,
  }));
  assert.deepEqual(parseSpsNativeEnrollmentResponse("workspaces", response("workspaces", unusualNames)), unusualNames);
  for (const bad of [
    {}, [{ id: "wrong", name: "Workspace" }], [{ id: DEVICE_ID, name: "" }],
    [{ id: DEVICE_ID, name: "Workspace", privateKeyPem: "secret" }], [...choices, ...choices],
    Array.from({ length: 201 }, () => choices[0]),
  ]) expectInvalid("workspaces", response("workspaces", bad));
  const oversized = Buffer.from(JSON.stringify([{ id: DEVICE_ID, name: "x".repeat(256 * 1024) }]), "utf8");
  expectInvalid("workspaces", response("workspaces", choices, { body: oversized }));
  expectInvalid("workspaces", response("workspaces", choices, { body: Buffer.from(` ${JSON.stringify(choices)}`) }));
  const envelope = response("workspaces", choices);
  envelope.rawHeaders.push("Set-Cookie", COOKIE);
  expectInvalid("workspaces", envelope);
});

test("accepts Core exchange, issue, and pending-completion responses as frozen DTOs", () => {
  const exchange = parseSpsNativeEnrollmentResponse("exchange", response("exchange", { expiresInSeconds: 604800 }));
  assert.deepEqual(exchange, { cookie: `sps_identity_session=${SESSION_TOKEN}`, expiresInSeconds: 604800 });
  assert.equal(Object.isFrozen(exchange), true);

  const issued = parseSpsNativeEnrollmentResponse("issue", response("issue", {
    enrollmentId: ENROLLMENT_ID,
    certificate: "MAA",
    issuerCertificate: "MAM",
    expiresAt: "2026-10-26T12:34:56.000Z",
  }));
  assert.deepEqual(issued, {
    enrollmentId: ENROLLMENT_ID,
    certificate: "MAA",
    issuerCertificate: "MAM",
    expiresAt: "2026-10-26T12:34:56.000Z",
  });
  assert.equal(Object.isFrozen(issued), true);

  const completed = parseSpsNativeEnrollmentResponse("complete", response("complete", {
    deviceId: DEVICE_ID,
    status: "pending",
  }));
  assert.deepEqual(completed, { deviceId: DEVICE_ID, status: "pending" });
  assert.equal(Object.isFrozen(completed), true);
});

test("accepts the exact public identity response as a frozen four-field DTO", () => {
  const identity = parseSpsNativeEnrollmentResponse("identity", response("identity", {
    hostId: HOST_ID,
    serverSpkiSha256: SERVER_PIN,
    issuerSpkiSha256: ISSUER_PIN,
    issuerCertificate: "AQID",
  }));
  assert.deepEqual(identity, {
    hostId: HOST_ID,
    serverSpkiSha256: SERVER_PIN,
    issuerSpkiSha256: ISSUER_PIN,
    issuerCertificate: "AQID",
  });
  assert.deepEqual(Object.keys(identity), ["hostId", "serverSpkiSha256", "issuerSpkiSha256", "issuerCertificate"]);
  assert.equal(Object.isFrozen(identity), true);

  const maxBoundCertificate = Buffer.alloc(4096, 0x01).toString("base64url");
  assert.equal(parseSpsNativeEnrollmentResponse("identity", response("identity", {
    hostId: HOST_ID,
    serverSpkiSha256: SERVER_PIN,
    issuerSpkiSha256: ISSUER_PIN,
    issuerCertificate: maxBoundCertificate,
  })).issuerCertificate, maxBoundCertificate);
});

test("identity requires canonical host, pins, certificate encoding, and exact public fields", () => {
  const valid = {
    hostId: HOST_ID,
    serverSpkiSha256: SERVER_PIN,
    issuerSpkiSha256: ISSUER_PIN,
    issuerCertificate: "AQID",
  };
  for (const change of [
    { hostId: HOST_ID.toUpperCase() },
    { hostId: "11111111-1111-4111-8111-11111111111g" },
    { serverSpkiSha256: "A".repeat(64) },
    { serverSpkiSha256: "a".repeat(63) },
    { issuerSpkiSha256: "g".repeat(64) },
    { issuerSpkiSha256: "b".repeat(65) },
    { issuerCertificate: "AQID=" },
    { issuerCertificate: "AR" },
    { issuerCertificate: "AQ+_" },
    { issuerCertificate: "" },
    { issuerCertificate: Buffer.alloc(4097, 0x01).toString("base64url") },
  ]) {
    expectInvalid("identity", response("identity", { ...valid, ...change }));
  }

  for (const extra of [
    { accessToken: "secret" },
    { refreshToken: "secret" },
    { userId: "user-1" },
    { roles: ["admin"] },
  ]) {
    expectInvalid("identity", response("identity", { ...valid, ...extra }));
  }
});

test("identity rejects cookies, wrong status, and accessor-backed envelope fields without invoking getters", () => {
  const value = {
    hostId: HOST_ID,
    serverSpkiSha256: SERVER_PIN,
    issuerSpkiSha256: ISSUER_PIN,
    issuerCertificate: "AQID",
  };
  const base = response("identity", value);
  expectInvalid("Identity", base);
  expectInvalid("identity", { ...base, statusCode: 201 });
  for (const name of ["Set-Cookie", "Cookie"]) {
    expectInvalid("identity", { ...base, rawHeaders: [...base.rawHeaders, name, COOKIE] });
  }

  let getterCalled = false;
  const accessorInput = response("identity", value);
  Object.defineProperty(accessorInput, "statusCode", {
    enumerable: true,
    get() { getterCalled = true; return 200; },
  });
  expectInvalid("identity", accessorInput);
  assert.equal(getterCalled, false);
});

test("accepts case-insensitive standard header names and media/cache values", () => {
  const input = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  input.rawHeaders = [
    "cOnTeNt-LeNgTh", String(input.body.length),
    "content-type", "Application/JSON; Charset=UTF-8",
    "CACHE-control", "No-Store",
  ];
  assert.deepEqual(parseSpsNativeEnrollmentResponse("complete", input), { deviceId: DEVICE_ID, status: "pending" });
});

test("requires exact own-data input and dense rawHeaders without invoking accessors", () => {
  let inputGetterCalled = false;
  const accessorInput = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  Object.defineProperty(accessorInput, "statusCode", { enumerable: true, get() { inputGetterCalled = true; return 200; } });
  expectInvalid("complete", accessorInput);
  assert.equal(inputGetterCalled, false);

  const symbolInput = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  symbolInput[Symbol("extra")] = true;
  expectInvalid("complete", symbolInput);

  const inheritedInput = Object.assign(Object.create({ inherited: true }), response("complete", { deviceId: DEVICE_ID, status: "pending" }));
  expectInvalid("complete", inheritedInput);

  const accessorHeaders = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  let headerGetterCalled = false;
  Object.defineProperty(accessorHeaders.rawHeaders, "0", { enumerable: true, get() { headerGetterCalled = true; return "Content-Length"; } });
  expectInvalid("complete", accessorHeaders);
  assert.equal(headerGetterCalled, false);

  const sparseHeaders = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  delete sparseHeaders.rawHeaders[0];
  expectInvalid("complete", sparseHeaders);

  const symbolHeaders = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  symbolHeaders.rawHeaders[Symbol("extra")] = "x";
  expectInvalid("complete", symbolHeaders);

  const subclassHeaders = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  Object.setPrototypeOf(subclassHeaders.rawHeaders, Object.create(Array.prototype));
  expectInvalid("complete", subclassHeaders);
});

test("rejects wrong operations, status codes, redirects, and noncanonical or mismatched framing", () => {
  expectInvalid("exchange", response("exchange", { expiresInSeconds: 604800 }, { statusCode: 302 }));
  expectInvalid("issue", response("issue", {
    enrollmentId: ENROLLMENT_ID, certificate: "MAA", issuerCertificate: "MAM", expiresAt: "2026-10-26T12:34:56.000Z",
  }, { statusCode: 202 }));
  expectInvalid("complete", response("complete", { deviceId: DEVICE_ID, status: "pending" }, {
    rawHeaders: ["Content-Length", "36", ...JSON_HEADERS, "Location", "/redirect"],
  }));
  expectInvalid("complete", response("complete", { deviceId: DEVICE_ID, status: "pending" }, { statusCode: 301 }));
  expectInvalid("complete", response("complete", { deviceId: DEVICE_ID, status: "pending" }, {
    rawHeaders: ["Content-Length", "000", ...JSON_HEADERS],
  }));

  const ordinary = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  const mismatch = [...ordinary.rawHeaders];
  mismatch[1] = String(ordinary.body.length + 1);
  expectInvalid("complete", { ...ordinary, rawHeaders: mismatch });

  for (const framingHeader of ["Transfer-Encoding", "Content-Encoding"]) {
    expectInvalid("complete", response("complete", { deviceId: DEVICE_ID, status: "pending" }, {
      rawHeaders: [...ordinary.rawHeaders, framingHeader, "chunked"],
    }));
  }
  expectInvalid("complete", response("complete", { deviceId: DEVICE_ID, status: "pending" }, {
    rawHeaders: [...ordinary.rawHeaders, "Cookie", "sps_identity_session=not-a-response-cookie"],
  }));
  expectInvalid("unknown", ordinary);
  expectInvalid("issue", ordinary);
});

test("rejects duplicate security headers case-insensitively", () => {
  const base = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  for (const [name, value] of [
    ["content-length", String(base.body.length)],
    ["CONTENT-TYPE", "application/json; charset=utf-8"],
    ["Cache-Control", "no-store"],
    ["Set-Cookie", "sps_identity_session=other"],
  ]) {
    expectInvalid("complete", { ...base, rawHeaders: [...base.rawHeaders, name, value] });
  }

  const exchange = response("exchange", { expiresInSeconds: 604800 });
  expectInvalid("exchange", { ...exchange, rawHeaders: [...exchange.rawHeaders, "set-cookie", COOKIE] });
});

test("rejects malformed UTF-8, BOM, NUL, replacement characters, and oversized bodies", () => {
  for (const body of [
    Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('{"deviceId":"11111111-1111-4111-8111-111111111111","status":"pending"}')]),
    Buffer.from('{"deviceId":"11111111-1111-4111-8111-111111111111","status":"pending"}\0'),
    Buffer.from('{"deviceId":"11111111-1111-4111-8111-111111111111","status":"pending"}\uFFFD'),
    Buffer.from([0xC3, 0x28]),
    Buffer.alloc(16_385, 0x20),
  ]) {
    const validShape = response("complete", { deviceId: DEVICE_ID, status: "pending" });
    expectInvalid("complete", { ...validShape, body, rawHeaders: ["Content-Length", String(body.length), ...JSON_HEADERS] });
  }
});

test("rejects duplicate, unknown, escaped, noncompact, or noncanonical JSON fields", () => {
  const bodies = [
    Buffer.from(`{"deviceId":"${DEVICE_ID}","deviceId":"${DEVICE_ID}","status":"pending"}`),
    Buffer.from(`{"deviceId":"${DEVICE_ID}","status":"pending","profile":{}}`),
    Buffer.from(`{"\\u0064eviceId":"${DEVICE_ID}","status":"pending"}`),
    Buffer.from(`{ "deviceId":"${DEVICE_ID}","status":"pending"}`),
  ];
  for (const body of bodies) {
    const base = response("complete", { deviceId: DEVICE_ID, status: "pending" });
    expectInvalid("complete", { ...base, body, rawHeaders: ["Content-Length", String(body.length), ...JSON_HEADERS] });
  }
});

test("bounds raw header pair count and UTF-8 byte size", () => {
  const base = response("complete", { deviceId: DEVICE_ID, status: "pending" });
  const tooManyPairs = [...base.rawHeaders];
  for (let pair = tooManyPairs.length / 2; pair < 65; pair++) tooManyPairs.push(`X-Test-${pair}`, "x");
  expectInvalid("complete", { ...base, rawHeaders: tooManyPairs });

  expectInvalid("complete", {
    ...base,
    rawHeaders: [...base.rawHeaders, "X-Oversized", "x".repeat(16_384)],
  });
});

test("requires an exact secure exchange cookie and never accepts cookies on other operations", () => {
  const variants = [
    COOKIE.replace("SameSite=Lax", "Domain=example.test; SameSite=Lax"),
    COOKIE.replace("; Secure", ""),
    COOKIE.replace("Max-Age=604800", "Max-Age=604799"),
    COOKIE.replace("Path=/", "Path=/other"),
    COOKIE.replace("SameSite=Lax", "SameSite=None"),
    `${COOKIE}; Priority=High`,
    `sps_identity_session=${SESSION_TOKEN}; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax`,
  ];
  for (const setCookie of variants) {
    const base = response("exchange", { expiresInSeconds: 604800 });
    const headers = [...base.rawHeaders];
    headers[headers.length - 1] = setCookie;
    expectInvalid("exchange", { ...base, rawHeaders: headers });
  }

  const multipleCookies = response("exchange", { expiresInSeconds: 604800 });
  expectInvalid("exchange", { ...multipleCookies, rawHeaders: [...multipleCookies.rawHeaders, "Set-Cookie", COOKIE] });

  for (const name of ["Set-Cookie", "Cookie"]) {
    const issue = response("issue", {
      enrollmentId: ENROLLMENT_ID, certificate: "MAA", issuerCertificate: "MAM", expiresAt: "2026-10-26T12:34:56.000Z",
    });
    expectInvalid("issue", { ...issue, rawHeaders: [...issue.rawHeaders, name, COOKIE] });
  }
});

test("validates issue fields and exposes no extra response data", () => {
  const valid = {
    enrollmentId: ENROLLMENT_ID, certificate: "MAA", issuerCertificate: "MAM", expiresAt: "2026-10-26T12:34:56.000Z",
  };
  for (const change of [
    { enrollmentId: ENROLLMENT_ID.toUpperCase() },
    { certificate: "MA=" },
    { certificate: "%%%" },
    { certificate: "A".repeat(5464) },
    { issuerCertificate: "" },
    { expiresAt: "2026-10-26T12:34:56Z" },
  ]) {
    const issue = response("issue", { ...valid, ...change });
    expectInvalid("issue", issue);
  }

  const extra = response("issue", { ...valid, grants: ["admin"], auth: { token: "secret" } });
  expectInvalid("issue", extra);
});

test("completion remains pending and rejects approved or malformed device identifiers", () => {
  expectInvalid("complete", response("complete", { deviceId: DEVICE_ID, status: "approved" }));
  expectInvalid("complete", response("complete", { deviceId: DEVICE_ID, status: "revoked" }));
  expectInvalid("complete", response("complete", { deviceId: DEVICE_ID.toUpperCase(), status: "pending" }));
});

test("reconciliation accepts only its three canonical states as a frozen DTO", () => {
  for (const status of ["pending", "approved", "revoked"]) {
    const result = parseSpsNativeEnrollmentResponse("reconcile", response("reconcile", { deviceId: DEVICE_ID, status }));
    assert.deepEqual(result, { deviceId: DEVICE_ID, status });
    assert.deepEqual(Object.keys(result), ["deviceId", "status"]);
    assert.equal(Object.isFrozen(result), true);
  }
});

test("reconciliation preserves strict status, field, header, size, and encoding checks", () => {
  const value = { deviceId: DEVICE_ID, status: "approved" };
  const base = response("reconcile", value);

  expectInvalid("reconcile", { ...base, statusCode: 201 });
  for (const status of ["unknown", "Pending", "APPROVED", "revoked "]) {
    expectInvalid("reconcile", response("reconcile", { ...value, status }));
  }
  expectInvalid("reconcile", response("reconcile", { ...value, extra: true }));

  const duplicateKeyBody = Buffer.from(`{"deviceId":"${DEVICE_ID}","status":"pending","status":"approved"}`);
  expectInvalid("reconcile", {
    ...base,
    body: duplicateKeyBody,
    rawHeaders: ["Content-Length", String(duplicateKeyBody.length), ...JSON_HEADERS],
  });

  for (const rawHeaders of [
    ["Content-Length", String(base.body.length), "Content-Type", "application/json; charset=utf-8"],
    [...base.rawHeaders, "cAcHe-CoNtRoL", "no-store"],
    [...base.rawHeaders, "Set-Cookie", COOKIE],
    [...base.rawHeaders, "Content-Encoding", "gzip"],
  ]) {
    expectInvalid("reconcile", { ...base, rawHeaders });
  }

  const oversizedBody = Buffer.alloc(16_385, 0x20);
  expectInvalid("reconcile", {
    ...base,
    body: oversizedBody,
    rawHeaders: ["Content-Length", String(oversizedBody.length), ...JSON_HEADERS],
  });

  for (const body of [Buffer.from([0xC3, 0x28]), Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), base.body])]) {
    expectInvalid("reconcile", {
      ...base,
      body,
      rawHeaders: ["Content-Length", String(body.length), ...JSON_HEADERS],
    });
  }
});

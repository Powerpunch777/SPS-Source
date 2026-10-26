import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import test from "node:test";
import { createSpsNativeWorkspaceRequestSigner } from "../src/native-workspace-proof.mjs";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";
const COOKIE = `sps_identity_session=${"a".repeat(64)}`;
const KEY = Buffer.alloc(32, 0x5a);
const CERTIFICATE = Buffer.from([0x30, 0x00]);

function fixture(options = {}) {
  let current = true;
  const signer = createSpsNativeWorkspaceRequestSigner({
    hostId: HOST_ID,
    key: KEY,
    assertCurrent() { if (!current) throw new Error("private authority detail"); },
    now: () => 1_798_000_000_000,
    ...options,
  });
  return { signer, invalidate() { current = false; } };
}

function request(overrides = {}) {
  return {
    workspaceId: WORKSPACE_ID,
    method: "GET",
    target: "/api/companies/22222222-2222-4222-8222-222222222222/workspace-shell",
    body: Buffer.alloc(0),
    cookie: COOKIE,
    contentType: "application/json",
    peerCertificateDer: CERTIFICATE,
    ...overrides,
  };
}

function decode(value) {
  const [payload, signature, extra] = value.split(".");
  assert.equal(typeof payload, "string");
  assert.equal(typeof signature, "string");
  assert.equal(extra, undefined);
  const canonical = Buffer.from(payload, "base64url");
  assert.equal(canonical.toString("base64url"), payload);
  const fields = JSON.parse(canonical.toString("utf8"));
  assert.equal(JSON.stringify(fields), canonical.toString("utf8"));
  return { canonical, fields, signature };
}

test("signs the closed ordered request payload with a fresh nonce and exact SHA-256 digest", t => {
  const { signer } = fixture();
  t.after(() => signer.dispose());
  assert.equal(signer.headerName, "X-SPS-Native-Workspace-Proof");
  const body = Buffer.from('{"items":[]}');
  const first = signer.signWorkspaceRequest(request({ method: "PUT", body, contentType: "application/json" }));
  const second = signer.signWorkspaceRequest(request({ method: "PUT", body, contentType: "application/json" }));
  const parsed = decode(first);
  assert.equal(parsed.fields.length, 11);
  assert.deepEqual(parsed.fields, [
    1,
    HOST_ID,
    WORKSPACE_ID,
    "PUT",
    request().target,
    parsed.fields[5],
    1_798_000_000_000,
    createHash("sha256").update(body).digest("hex"),
    COOKIE,
    "application/json",
    CERTIFICATE.toString("base64url"),
  ]);
  assert.match(parsed.fields[5], /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(parsed.fields[5], "base64url").length, 32);
  assert.equal(parsed.signature, createHmac("sha256", KEY).update(parsed.canonical).digest("base64url"));
  assert.notEqual(parsed.fields[5], decode(second).fields[5]);
});

test("rejects unapproved methods, malformed targets, bodies, cookies and TLS certificate inputs", t => {
  const { signer } = fixture();
  t.after(() => signer.dispose());
  const invalid = [
    { method: "POST" },
    { method: "DELETE" },
    { target: "https://example.invalid/api" },
    { target: "//example.invalid/api" },
    { target: "/api/../secrets" },
    { target: "/api/%2e%2e/secrets" },
    { target: "/api/%2fsecrets" },
    { target: "/api/%5csecrets" },
    { target: "/api/items?next=%2fsecret" },
    { target: "/api\\secrets" },
    { target: "/api#fragment" },
    { target: "/api\r\nX-Evil:y" },
    { target: "/api/%Q1" },
    { body: "not bytes" },
    { body: Buffer.alloc(64 * 1024 + 1) },
    { cookie: "sps_identity_session=short" },
    { cookie: `${COOKIE}; other=secret` },
    { contentType: "text/plain" },
    { peerCertificateDer: CERTIFICATE.toString("base64url") },
    { peerCertificateDer: Buffer.alloc(4097) },
    { extra: "not an exact DTO" },
  ];
  for (const input of invalid) {
    assert.throws(() => signer.signWorkspaceRequest(request(input)), error => {
      assert.equal(error.code, "native_workspace_proof_unavailable");
      assert.equal(error.message, "SPS Native Workspace request signing is unavailable.");
      return true;
    });
  }
});

test("rejects accessors and non-record requests without evaluating getters", t => {
  const { signer } = fixture();
  t.after(() => signer.dispose());
  let touched = false;
  const input = request();
  Object.defineProperty(input, "cookie", { enumerable: true, get() { touched = true; return COOKIE; } });
  assert.throws(() => signer.signWorkspaceRequest(input), { code: "native_workspace_proof_unavailable" });
  assert.equal(touched, false);
  assert.throws(() => signer.signWorkspaceRequest(Object.assign(Object.create({ inherited: true }), request())),
    { code: "native_workspace_proof_unavailable" });
});

test("requires synchronous current-authority checks before and after signing", t => {
  let checks = 0;
  const signer = createSpsNativeWorkspaceRequestSigner({
    hostId: HOST_ID,
    key: KEY,
    now: () => 1_798_000_000_000,
    assertCurrent() { checks += 1; if (checks === 2) throw new Error("private detail"); },
  });
  t.after(() => signer.dispose());
  assert.throws(() => signer.signWorkspaceRequest(request()), { code: "native_workspace_proof_unavailable" });
  assert.equal(checks, 2);

  const asyncSigner = createSpsNativeWorkspaceRequestSigner({ hostId: HOST_ID, key: KEY,
    assertCurrent: () => Promise.resolve(undefined) });
  t.after(() => asyncSigner.dispose());
  assert.throws(() => asyncSigner.signWorkspaceRequest(request()), { code: "native_workspace_proof_unavailable" });
});

test("consumes rejected asynchronous authority checks and rejects proofs above the header bound", async t => {
  const unhandled = [];
  const observe = error => unhandled.push(error);
  process.on("unhandledRejection", observe);
  t.after(() => process.off("unhandledRejection", observe));
  const asyncSigner = createSpsNativeWorkspaceRequestSigner({ hostId: HOST_ID, key: KEY,
    assertCurrent: () => Promise.reject(new Error("private authority detail")) });
  t.after(() => asyncSigner.dispose());
  assert.throws(() => asyncSigner.signWorkspaceRequest(request()), { code: "native_workspace_proof_unavailable" });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(unhandled, []);

  const { signer } = fixture();
  t.after(() => signer.dispose());
  assert.throws(() => signer.signWorkspaceRequest(request({
    target: `/${"a".repeat(2047)}`,
    peerCertificateDer: Buffer.alloc(4096),
  })), { code: "native_workspace_proof_unavailable" });
});

test("disposal rejects future signing and clears its private MAC-key copy", () => {
  const supplied = randomBytes(32);
  const signer = createSpsNativeWorkspaceRequestSigner({ hostId: HOST_ID, key: supplied, assertCurrent() {} });
  signer.dispose();
  assert.notDeepEqual(supplied, Buffer.alloc(32));
  assert.throws(() => signer.signWorkspaceRequest(request()), { code: "native_workspace_proof_unavailable" });
});

test("copies the MAC key and rejects accessor-backed constructor authority without evaluating it", t => {
  const supplied = Buffer.alloc(32, 0x4c);
  const original = Buffer.from(supplied);
  const signer = createSpsNativeWorkspaceRequestSigner({ hostId: HOST_ID, key: supplied, assertCurrent() {} });
  t.after(() => signer.dispose());
  supplied.fill(0);
  const parsed = decode(signer.signWorkspaceRequest(request()));
  assert.equal(parsed.signature, createHmac("sha256", original).update(parsed.canonical).digest("base64url"));

  let touched = false;
  const options = { hostId: HOST_ID, key: original };
  Object.defineProperty(options, "assertCurrent", { enumerable: true, get() { touched = true; return () => {}; } });
  assert.throws(() => createSpsNativeWorkspaceRequestSigner(options), { code: "native_workspace_proof_unavailable" });
  assert.equal(touched, false);
});

test("signer rejects invalid construction authority and key sizes", () => {
  for (const options of [
    { hostId: "bad", key: KEY, assertCurrent() {} },
    { hostId: HOST_ID, key: Buffer.alloc(31), assertCurrent() {} },
    { hostId: HOST_ID, key: KEY, assertCurrent() {}, unexpected: true },
  ]) assert.throws(() => createSpsNativeWorkspaceRequestSigner(options), { code: "native_workspace_proof_unavailable" });
});

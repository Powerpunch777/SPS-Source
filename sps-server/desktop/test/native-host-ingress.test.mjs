import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { createServer as createNetServer } from "node:net";
import { checkServerIdentity, connect as tlsConnect } from "node:tls";
import test, { before, after } from "node:test";
import { createSpsNativeHostIngress } from "../src/native-host-ingress.mjs";
import { createSpsNativeHostIdentity, renewSpsNativeHostServerCertificate } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } from "../src/native-member-certificates.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { createSpsNativeEnrollmentBootstrap, createSpsNativeEnrollmentClient,
  createSpsNativeEnrollmentRecoveryClient, createSpsNativeServerCertificateClient } from "../src/native-enrollment-client.mjs";
import { nativeServerCertificateServername } from "../src/native-server-certificate-selection.mjs";
import { NATIVE_NODE_MAX_REQUEST } from "../src/native-node-protocol.mjs";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const DEVICE_KEY_ID = "22222222-2222-4222-8222-222222222222";
const ENROLLMENT_ID = "33333333-3333-4333-8333-333333333333";
const NOW = Math.floor(Date.now() / 1000) * 1000;
const HOST_OPTIONS = { hostId: HOST_ID, hostnames: ["127.0.0.1"], notBefore: NOW - 60_000,
  notAfter: NOW + 3_600_000, issuerNotAfter: NOW + 7_200_000 };
let identity;
let memberKey;
let memberCertificate;
let port;
before(async () => {
  identity = await createSpsNativeHostIdentity(HOST_OPTIONS);
  memberKey = await createSpsNativeMemberKeyRequest({ hostId: HOST_ID, deviceKeyId: DEVICE_KEY_ID });
  memberCertificate = await issueSpsNativeMemberCertificate({ hostIdentity: identity,
    request: { v: 1, kind: "sps.native.member-enrollment-request", hostId: HOST_ID,
      deviceKeyId: DEVICE_KEY_ID, requestPem: memberKey.requestPem },
    notBefore: NOW - 1000, notAfter: NOW + 3_600_000, now: NOW });
  port = await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(() => resolve(value)); });
  });
});

function post(port, { route, body = "", headers = {}, certificate, key, session = false, workspace = false, method, phase,
  ca = identity.server.certificatePem, servername, expectedCertificate } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: "127.0.0.1", port, path: route, method: method ?? (workspace ? "GET" : "POST"), agent: false,
      ca, ...(servername ? { servername, checkServerIdentity(_name, peer) {
        if (checkServerIdentity("127.0.0.1", peer)) return new Error("hostname mismatch");
        if (expectedCertificate && !peer.raw.equals(new X509Certificate(expectedCertificate).raw)) return new Error("certificate mismatch");
        return undefined;
      } } : {}), cert: certificate, key, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
      headers: { ...(method === "PATCH" ? { "Content-Type": "application/json" }
        : !workspace ? { "Content-Type": "application/json; charset=utf-8" } : {}), "Content-Length": String(Buffer.byteLength(body)),
        Connection: "close", ...(session ? { Cookie: `sps_identity_session=${"a".repeat(64)}` } : {}), ...headers } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("end", () => resolve({ statusCode: response.statusCode, headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8") }));
    });
    request.once("error", error => {
      if (!phase) { reject(error); return; }
      const diagnostic = new Error(`${phase}: ${error.message}`, { cause: error });
      diagnostic.code = error.code;
      reject(diagnostic);
    });
    request.end(body);
  });
}

function createIngress(dispatch, options = {}) {
  let current = identity;
  let valid = true;
  const ingress = createSpsNativeHostIngress({ getIdentity: () => current,
    assertCurrent() { if (!valid) throw new Error("authority changed"); }, dispatch,
    cancel: options.cancel, limits: options.limits, dispatchWorkspace: options.dispatchWorkspace });
  return { ingress, invalidate() { valid = false; }, setIdentity(value) { current = value; } };
}

function publicIdentity() {
  const serverCertificate = new X509Certificate(identity.server.certificatePem);
  const issuerCertificate = new X509Certificate(identity.memberIssuer.certificatePem);
  return { hostId: HOST_ID,
    serverSpkiSha256: createHash("sha256").update(serverCertificate.publicKey.export({ type: "spki", format: "der" })).digest("hex"),
    issuerSpkiSha256: createHash("sha256").update(issuerCertificate.publicKey.export({ type: "spki", format: "der" })).digest("hex"),
    issuerCertificate: issuerCertificate.raw.toString("base64url") };
}

test("Native Plugin ingress admits only authenticated fixed POST and signs exact scoped bytes", async t => {
  const calls = [];
  const { ingress } = createIngress(async () => assert.fail("Plugin request must use the Workspace channel"), {
    dispatchWorkspace: async (value, options) => { calls.push(value); options.assertCurrent(); return { data: { ok: true } }; },
  });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const body = JSON.stringify({ pluginId: ENROLLMENT_ID, surface: "widget", surfaceId: "count", revision: "a".repeat(64),
    operation: "data", key: "count", params: {} });
  const input = { route: "/sps-native/v1/plugin-runtime", workspace: true, method: "POST", body, session: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem,
    headers: { "Content-Type": "application/json", "X-SPS-Native-Workspace": DEVICE_KEY_ID } };
  assert.equal((await post(bound.port, input)).statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, DEVICE_KEY_ID);
  assert.equal(calls[0].target, "/sps-native/v1/plugin-runtime");
  assert.equal(calls[0].method, "POST"); assert.equal(calls[0].body.toString(), body);
  assert.equal(calls[0].cookie, `sps_identity_session=${"a".repeat(64)}`);
  assert.deepEqual(calls[0].peerCertificateDer, new X509Certificate(memberCertificate.certificatePem).raw);
  assert.equal((await post(bound.port, { ...input, certificate: undefined, key: undefined })).statusCode, 401);
  assert.equal((await post(bound.port, { ...input, headers: { "Content-Type": "application/json" } })).statusCode, 400);
  assert.equal((await post(bound.port, { ...input, route: "/sps-native/v1/plugin-runtime?other=true" })).statusCode, 404);
  assert.equal((await post(bound.port, { ...input, body: JSON.stringify({ ...JSON.parse(body), url: "http://other" }) })).statusCode, 400);
  assert.equal(calls.length, 1);
});

test("Native Node ingress admits only bounded fixed POST with fresh mTLS and a session", async t => {
  const calls = [];
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity, assertCurrent() {},
    dispatch() { assert.fail("Node requests use the private Workspace authority channel"); },
    async dispatchWorkspace(input, options) {
      options.assertCurrent();
      calls.push(input);
      assert.deepEqual(Object.keys(input).sort(), ["workspaceId", "target", "cookie", "peerCertificateDer", "method", "body"].sort());
      return { data: { accepted: true, size: input.body.length } };
    },
  });
  t.after(() => ingress.dispose());
  const { port } = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const nodeId = "44444444-4444-4444-8444-444444444444";
  const commandId = "55555555-5555-4555-8555-555555555555";
  const body = JSON.stringify({ operation: "command-event", nodeId, resourceId: commandId,
    payload: { timestamp: "2026-10-27T04:00:00.000Z", nonce: "A".repeat(43), signature: "B".repeat(86),
      sequence: 1, stream: "stdout", body: "x".repeat(96 * 1024) } });
  const input = { route: "/sps-native/v1/node-runtime", workspace: true, method: "POST", body, session: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem,
    headers: { "Content-Type": "application/json", "X-SPS-Native-Workspace": DEVICE_KEY_ID } };
  const success = await post(port, { ...input, phase: "authenticated-large-request" });
  assert.equal(success.statusCode, 200, `${success.body}; calls=${calls.length}`);
  assert.deepEqual(JSON.parse(success.body), { data: { accepted: true, size: Buffer.byteLength(body) } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, DEVICE_KEY_ID);
  assert.equal(calls[0].target, "/sps-native/v1/node-runtime");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].body.toString(), body);
  assert.equal(calls[0].cookie, `sps_identity_session=${"a".repeat(64)}`);
  assert.deepEqual(calls[0].peerCertificateDer, new X509Certificate(memberCertificate.certificatePem).raw);
  const missingCertificate = await post(port, { ...input, certificate: undefined, key: undefined, phase: "missing-certificate" })
    .then(response => ({ response }), error => ({ error }));
  if (missingCertificate.response) assert.equal(missingCertificate.response.statusCode, 401);
  else assert.equal(missingCertificate.error?.code, "ECONNRESET");
  assert.equal(calls.length, 1);
  const smallEnvelope = JSON.parse(body);
  smallEnvelope.payload.body = "x";
  const smallInput = { ...input, body: JSON.stringify(smallEnvelope) };
  for (const denied of [
    { request: { ...smallInput, session: false }, expectedStatus: 400 },
    { request: { ...smallInput, route: "/sps-native/v1/node-runtime?extra=1" }, expectedStatus: 404 },
    { request: { ...smallInput, body: JSON.stringify({ ...smallEnvelope, method: "POST" }) }, expectedStatus: 400 },
    { request: { ...smallInput, headers: { "Content-Type": "application/json" } }, expectedStatus: 400 },
    { request: { ...smallInput, headers: { "Content-Type": "application/json", Origin: "https://evil.invalid",
      "X-SPS-Native-Workspace": DEVICE_KEY_ID } }, expectedStatus: 400 },
  ]) assert.equal((await post(port, { ...denied.request, phase: `denied-${denied.expectedStatus}` })).statusCode, denied.expectedStatus);
  const oversizedHeader = await post(port, { ...smallInput, phase: "oversized-authenticated-content-length",
    headers: { ...smallInput.headers, "Content-Length": String(NATIVE_NODE_MAX_REQUEST + 1) } });
  assert.equal(oversizedHeader.statusCode, 413);
  assert.equal(calls.length, 1);
  const oversizedBody = await post(port, { ...input, phase: "oversized-authenticated-request", body: JSON.stringify({ operation: "availability", nodeId,
    resourceId: null, payload: { timestamp: "2026-10-27T04:00:00.000Z", nonce: "A".repeat(43),
      signature: "B".repeat(86), report: "x".repeat(512 * 1024) } }) }).then(response => ({ response }), error => ({ error }));
  if (oversizedBody.response) assert.equal(oversizedBody.response.statusCode, 413);
  else assert.equal(oversizedBody.error?.code, "ECONNRESET");
  assert.equal(calls.length, 1);
  const afterOversized = await post(port, { ...smallInput, phase: "valid-request-after-oversized" });
  assert.equal(afterOversized.statusCode, 200);
  assert.deepEqual(JSON.parse(afterOversized.body), { data: { accepted: true, size: Buffer.byteLength(smallInput.body) } });
  assert.equal(calls.length, 2);
});

test("only exact Native paths and closed canonical requests dispatch over fresh TLS", async t => {
  const calls = [];
  const { ingress } = createIngress(async (operation, input) => {
    const request = { operation, ...input };
    calls.push(request);
    if (operation === "identity") return publicIdentity();
    if (operation === "session.exchange") return { token: "c".repeat(64), expiresInSeconds: 604800 };
    if (operation === "enrollment.issue") return { enrollmentId: ENROLLMENT_ID, certificate: "Y2VydA",
      issuerCertificate: new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url"), expiresAt: new Date(NOW + 100_000).toISOString() };
    return { deviceId: "55555555-5555-4555-8555-555555555555", status: "pending" };
  });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  assert.equal(bound.bindAddress, "127.0.0.1");
  const identityResponse = await post(bound.port, { route: "/sps-native/v1/identity" });
  assert.equal(identityResponse.statusCode, 200);
  assert.equal(JSON.parse(identityResponse.body).hostId, HOST_ID);
  assert.equal(calls[0].operation, "identity");
  assert.equal(calls[0].body, null);
  assert.equal(calls[0].transport.tlsVersion, "TLSv1.3");
  assert.equal(calls[0].transport.sessionReused, false);
  assert.equal("peerCertificateDer" in calls[0].transport, false);

  const exchange = await post(bound.port, { route: "/sps-native/v1/session/exchange",
    headers: { Authorization: `Bearer ${"a.b.c"}` } });
  assert.equal(exchange.statusCode, 201);
  assert.match(exchange.headers["set-cookie"]?.[0], /^sps_identity_session=c{64}; Max-Age=604800; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  assert.deepEqual(calls[1].credential, { accessToken: "a.b.c" });
  assert.equal(calls[1].body, null);

  const issueBody = JSON.stringify({ pairingId: "44444444-4444-4444-8444-444444444444",
    pairingSecret: Buffer.alloc(32, 3).toString("base64url"), deviceKeyId: DEVICE_KEY_ID, requestPem: memberKey.requestPem });
  const issue = await post(bound.port, { route: "/sps-native/v1/enrollment/issue", body: issueBody, session: true });
  assert.equal(issue.statusCode, 200);
  assert.equal(calls[2].operation, "enrollment.issue");
  assert.equal(calls[2].body.requestPem, memberKey.requestPem);
  assert.equal(calls[2].credential.sessionCookie, `sps_identity_session=${"a".repeat(64)}`);
  assert.equal("peerCertificateDer" in calls[2].transport, false);
});

test("retained exact leaf SNI returns only public successor metadata from local TLS", async t => {
  const predecessorIdentity = await createSpsNativeHostIdentity({ hostId: HOST_ID, hostnames: ["127.0.0.1"],
    notBefore: NOW - 80 * 24 * 60 * 60 * 1000, notAfter: NOW + 10 * 24 * 60 * 60 * 1000,
    issuerNotAfter: NOW + 300 * 24 * 60 * 60 * 1000 });
  const renewedIdentity = await renewSpsNativeHostServerCertificate({ identity: predecessorIdentity, now: NOW });
  const predecessor = new X509Certificate(predecessorIdentity.server.certificatePem);
  const successor = new X509Certificate(renewedIdentity.server.certificatePem);
  const dispatched = [];
  const ingress = createSpsNativeHostIngress({ getIdentity: () => renewedIdentity,
    getServerCertificates: () => [predecessorIdentity.server.certificatePem, renewedIdentity.server.certificatePem],
    assertCurrent() {}, dispatch(...args) { dispatched.push(args); assert.fail("public certificate read must remain local"); } });
  t.after(() => ingress.dispose());
  const { port } = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const selectedOldLeaf = await post(port, { route: "/sps-native/v1/server-certificate", ca: predecessorIdentity.server.certificatePem,
    servername: nativeServerCertificateServername(predecessorIdentity.server.certificatePem), expectedCertificate: predecessorIdentity.server.certificatePem });
  assert.equal(selectedOldLeaf.statusCode, 200);
  assert.deepEqual(JSON.parse(selectedOldLeaf.body), { hostId: HOST_ID,
    predecessorCertificateSha256: createHash("sha256").update(predecessor.raw).digest("hex"),
    serverCertificate: successor.raw.toString("base64url"),
    issuerSpkiSha256: createHash("sha256").update(new X509Certificate(renewedIdentity.memberIssuer.certificatePem)
      .publicKey.export({ type: "spki", format: "der" })).digest("hex") });
  const context = { identityIssuer: "https://identity.example.test", subject: "fixture-member", hostId: HOST_ID,
    deviceKeyId: DEVICE_KEY_ID,
    serverSpkiSha256: createHash("sha256").update(predecessor.publicKey.export({ type: "spki", format: "der" })).digest("hex"),
    issuerSpkiSha256: createHash("sha256").update(new X509Certificate(predecessorIdentity.memberIssuer.certificatePem)
      .publicKey.export({ type: "spki", format: "der" })).digest("hex") };
  const publicClient = createSpsNativeServerCertificateClient({ target: { v: 1, kind: "sps.native.member-host-target", context,
    origin: `https://127.0.0.1:${port}`, serverCertificatePem: predecessorIdentity.server.certificatePem },
    context, timeoutMs: 3000, assertCurrent() {} });
  t.after(() => publicClient.dispose());
  const clientValue = await publicClient.getServerCertificate();
  assert.equal(clientValue.predecessorCertificateSha256, createHash("sha256").update(predecessor.raw).digest("hex"));
  assert.equal(clientValue.serverCertificate, successor.raw.toString("base64url"));
  const latestDefault = await post(port, { route: "/sps-native/v1/server-certificate", ca: renewedIdentity.server.certificatePem,
    expectedCertificate: renewedIdentity.server.certificatePem });
  assert.equal(latestDefault.statusCode, 200);
  assert.equal(JSON.parse(latestDefault.body).predecessorCertificateSha256, createHash("sha256").update(successor.raw).digest("hex"));
  const denied = await post(port, { route: "/sps-native/v1/server-certificate", ca: renewedIdentity.server.certificatePem,
    servername: nativeServerCertificateServername(renewedIdentity.server.certificatePem), headers: { Authorization: "Bearer a.b.c" } });
  assert.equal(denied.statusCode, 400);
  assert.deepEqual(dispatched, []);
  await assert.rejects(post(port, { route: "/sps-native/v1/server-certificate", ca: predecessorIdentity.server.certificatePem,
    servername: `${"0".repeat(32)}.${"0".repeat(32)}.sps-native.invalid` }));
});

test("Host history rejects a same-Host replacement key before binding", async () => {
  const wrongKeyIdentity = await createSpsNativeHostIdentity({ ...HOST_OPTIONS, hostId: HOST_ID });
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity,
    getServerCertificates: () => [identity.server.certificatePem, wrongKeyIdentity.server.certificatePem],
    assertCurrent() {}, dispatch() {} });
  await assert.rejects(ingress.start({ bindAddress: "127.0.0.1", port: 0 }));
  assert.equal(ingress.inspect().state, "disabled");
  await ingress.dispose();
});

test("workspace inbox state PATCH requires fresh mTLS, exact route, cookie and canonical bounded JSON", async t => {
  const calls = [];
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity, assertCurrent() {},
    dispatch() { assert.fail("Inbox state PATCH must not use enrollment dispatch"); },
    async dispatchWorkspace(input, options) { options.assertCurrent(); calls.push(input); return { ok: true }; },
  });
  t.after(() => ingress.dispose());
  const { port } = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const workspaceId = "44444444-4444-4444-8444-444444444444";
  const itemId = "55555555-5555-4555-8555-555555555555";
  const route = `/api/companies/${workspaceId}/workspace-inbox/${itemId}`;
  const body = JSON.stringify({ read: true, archived: false });
  const valid = { route, body, method: "PATCH", workspace: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem, session: true };
  const success = await post(port, valid);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(calls, [{ workspaceId, target: route, cookie: `sps_identity_session=${"a".repeat(64)}`,
    peerCertificateDer: new X509Certificate(memberCertificate.certificatePem).raw, method: "PATCH", body: Buffer.from(body) }]);
  for (const denied of [
    { ...valid, certificate: undefined, key: undefined },
    { ...valid, session: false },
    { ...valid, method: "PUT" },
    { ...valid, route: `/api/companies/${workspaceId}/workspace-inbox/${itemId}?x=1` },
    { ...valid, route: `/api/companies/${workspaceId}/workspace-inbox` },
    { ...valid, route: `/api/companies/${workspaceId}/workspace-shell/${itemId}` },
    { ...valid, body: "{}" },
    { ...valid, body: "null" },
    { ...valid, body: "[]" },
    { ...valid, body: "true" },
    { ...valid, body: "{\"read\":true, \"archived\":false}" },
    { ...valid, body: "{\"read\":1}" },
    { ...valid, body: "{\"read\":true,\"extra\":false}" },
    { ...valid, body: `{"read":true} ` + " ".repeat(118) },
    { ...valid, body: "{\"read\":true}", headers: { Origin: "https://evil.invalid" } },
    { ...valid, body: "{\"read\":true}", headers: { "X-SPS-Desktop-Owner-Bootstrap": "owner" } },
    { ...valid, body: "{\"read\":true}", headers: { "X-SPS-Native-Workspace-Proof": "forged" } },
  ]) assert.notEqual((await post(port, denied)).statusCode, 200);
  assert.equal(calls.length, 1);
});

test("explicit Workspace surface forwarding requires actual fresh mTLS and a session without Owner proof", async t => {
  const calls = [];
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity, assertCurrent() {},
    dispatch() { assert.fail("Workspace requests must not use the enrollment dispatcher"); },
    async dispatchWorkspace(input, options) {
      options.assertCurrent();
      calls.push(input);
      return { mode: "neutral" };
    },
  });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const workspaceId = "44444444-4444-4444-8444-444444444444";
  const input = { route: `/api/companies/${workspaceId}/workspace-shell`, workspace: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem, session: true };
  const success = await post(bound.port, input);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(JSON.parse(success.body), { mode: "neutral" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workspaceId, workspaceId);
  assert.equal(calls[0].target, input.route);
  assert.equal(calls[0].cookie, `sps_identity_session=${"a".repeat(64)}`);
  assert.deepEqual(calls[0].peerCertificateDer, new X509Certificate(memberCertificate.certificatePem).raw);
  for (const denied of [
    { ...input, certificate: undefined, key: undefined },
    { ...input, session: false },
    { ...input, body: "{}" },
    { ...input, headers: { "X-SPS-Desktop-Owner-Bootstrap": "owner" } },
    { ...input, headers: { "X-SPS-Native-Workspace-Proof": "forged" } },
    { ...input, headers: { Origin: "https://evil.invalid" } },
    { ...input, route: "/api/companies" },
    { ...input, route: `/api/companies/${workspaceId}/workspace-shell?archived=true` },
    { ...input, route: `/api/companies/${workspaceId}/workspace-inbox?archived=true&extra=true` },
  ]) {
    const response = await post(bound.port, denied);
    assert.notEqual(response.statusCode, 200);
  }
  assert.equal(calls.length, 1);
});

test("Workspace bootstrap requires fresh mTLS, session and an exact body-free GET", async t => {
  const calls = [];
  const workspaceId = "44444444-4444-4444-8444-444444444444";
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity, assertCurrent() {},
    dispatch() { assert.fail("Bootstrap cannot use enrollment authority"); },
    async dispatchWorkspace(input) { calls.push(input); return { workspace: { id: workspaceId } }; },
  });
  t.after(() => ingress.dispose());
  const { port } = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const input = { route: `/api/companies/${workspaceId}/workspace-bootstrap`, workspace: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem, session: true };
  assert.equal((await post(port, input)).statusCode, 200);
  assert.equal(calls[0].workspaceId, workspaceId);
  assert.equal(calls[0].target, input.route);
  for (const invalid of [{ ...input, certificate: undefined, key: undefined }, { ...input, session: false },
    { ...input, body: "{}" }, { ...input, workspace: false }, { ...input, route: `${input.route}?all=true` },
    { ...input, headers: { "X-SPS-Desktop-Owner-Bootstrap": "forbidden" } }]) {
    assert.notEqual((await post(port, invalid)).statusCode, 200);
  }
  assert.equal(calls.length, 1);
});

test("Workspace discovery accepts only the exact GET with fresh mTLS and an SPS session", async t => {
  const calls = [];
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity, assertCurrent() {},
    dispatch() { assert.fail("Workspace requests must not use the enrollment dispatcher"); },
    async dispatchWorkspace(input, options) { options.assertCurrent(); calls.push(input); return [{ id: "44444444-4444-4444-8444-444444444444", name: "Main" }]; },
  });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const input = { route: "/sps-native/v1/workspaces", workspace: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem, session: true };
  const success = await post(bound.port, input);
  assert.equal(success.statusCode, 200);
  assert.deepEqual(JSON.parse(success.body), [{ id: "44444444-4444-4444-8444-444444444444", name: "Main" }]);
  assert.deepEqual(calls.map(({ workspaceId, target }) => ({ workspaceId, target })), [
    { workspaceId: null, target: "/sps-native/v1/workspaces" },
  ]);
  for (const denied of [
    { ...input, certificate: undefined, key: undefined },
    { ...input, session: false },
    { ...input, body: "{}" },
    { ...input, headers: { "X-SPS-Desktop-Owner-Bootstrap": "owner" } },
    { ...input, headers: { "X-SPS-Native-Workspace-Proof": "forged" } },
    { ...input, headers: { Origin: "https://evil.invalid" } },
    { ...input, route: "/sps-native/v1/workspaces?x=1" },
    { ...input, route: "/sps-native/v1/workspaces/44444444-4444-4444-8444-444444444444" },
  ]) assert.notEqual((await post(bound.port, denied)).statusCode, 200);
  assert.equal(calls.length, 1);
});

test("Workspace paths stay unmounted unless the private dispatcher is explicitly supplied", async t => {
  const ingress = createSpsNativeHostIngress({ getIdentity: () => identity, assertCurrent() {}, dispatch() { assert.fail(); } });
  t.after(() => ingress.dispose());
  const { port } = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const response = await post(port, { route: "/api/companies/44444444-4444-4444-8444-444444444444/workspace-shell",
    workspace: true, certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem, session: true });
  assert.equal(response.statusCode, 404);
});

test("production bootstrap, enrollment and recovery clients interoperate end-to-end over the ingress", async t => {
  const operations = [];
  const { ingress } = createIngress(async (operation, input, options) => {
    assert.equal(options.assertCurrent(), undefined, "Parent IPC guard contract must be synchronous void.");
    operations.push({ operation, ...input });
    if (operation === "identity") return {
      hostId: HOST_ID,
      serverSpkiSha256: createHash("sha256").update(new X509Certificate(identity.server.certificatePem).publicKey.export({ type: "spki", format: "der" })).digest("hex"),
      issuerSpkiSha256: createHash("sha256").update(new X509Certificate(identity.memberIssuer.certificatePem).publicKey.export({ type: "spki", format: "der" })).digest("hex"),
      issuerCertificate: new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url"),
    };
    if (operation === "session.exchange") return { token: "f".repeat(64), expiresInSeconds: 604800 };
    if (operation === "enrollment.issue") return {
      enrollmentId: ENROLLMENT_ID,
      certificate: new X509Certificate(memberCertificate.certificatePem).raw.toString("base64url"),
      issuerCertificate: new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url"),
      expiresAt: new Date(NOW + 3_000_000).toISOString(),
    };
    return { deviceId: "55555555-5555-4555-8555-555555555555", status: operation.endsWith("reconcile") ? "approved" : "pending" };
  });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const serverCertificate = new X509Certificate(identity.server.certificatePem);
  const serverPin = createHash("sha256").update(serverCertificate.publicKey.export({ type: "spki", format: "der" })).digest("hex");
  const issuerPin = createHash("sha256").update(new X509Certificate(identity.memberIssuer.certificatePem).publicKey.export({ type: "spki", format: "der" })).digest("hex");
  const expiresAt = NOW + 3_000_000;
  const invitationCode = createSpsNativeInviteCode({ v: 2, kind: "sps.native-lan.pairing", hostId: HOST_ID,
    origin: `https://127.0.0.1:${bound.port}`, spkiSha256: serverPin,
    serverCertificate: serverCertificate.raw.toString("base64url"), pairingId: "44444444-4444-4444-8444-444444444444",
    pairingSecret: Buffer.alloc(32, 3).toString("base64url"), issuedAt: NOW - 1000, expiresAt });
  const context = { identityIssuer: "https://identity.example.test", subject: "fixture-member", hostId: HOST_ID,
    deviceKeyId: DEVICE_KEY_ID, serverSpkiSha256: serverPin, issuerSpkiSha256: issuerPin };
  const bootstrap = createSpsNativeEnrollmentBootstrap({ invitationCode, timeoutMs: 5000, assertCurrent() {} });
  const metadata = await bootstrap.inspect();
  assert.equal(metadata.hostId, HOST_ID);
  assert.equal(metadata.issuerSpkiSha256, issuerPin);
  bootstrap.dispose();

  const enrollment = createSpsNativeEnrollmentClient({ invitationCode, context, timeoutMs: 5000, assertCurrent() {} });
  const session = await enrollment.exchange("fixture.header.signature");
  assert.equal(session.state, "session_prepared");
  const issuance = await enrollment.issue(memberKey);
  const completed = await enrollment.complete({ keyRequest: memberKey, issuance, displayName: "Loopback fixture" });
  assert.equal(completed.status, "pending");
  enrollment.dispose();

  const target = { v: 1, kind: "sps.native.member-host-target", context,
    origin: `https://127.0.0.1:${bound.port}`, serverCertificatePem: identity.server.certificatePem };
  const recovery = createSpsNativeEnrollmentRecoveryClient({ target, context, timeoutMs: 5000, assertCurrent() {} });
  await recovery.exchange("fixture.header.signature");
  const reconciled = await recovery.reconcile({ keyRequest: memberKey, issuance });
  assert.equal(reconciled.status, "approved");
  recovery.dispose();
  assert.deepEqual(operations.map(item => item.operation), ["identity", "session.exchange", "enrollment.issue",
    "enrollment.complete", "session.exchange", "enrollment.reconcile"]);
  assert.deepEqual(operations[2].credential, { sessionCookie: `sps_identity_session=${"f".repeat(64)}` });
  assert.equal(operations[2].body.pairingSecret, Buffer.alloc(32, 3).toString("base64url"));
  assert.equal(operations[3].transport.peerCertificateDer, new X509Certificate(memberCertificate.certificatePem).raw.toString("base64url"));
  assert.equal(operations[5].body.enrollmentId, ENROLLMENT_ID);
  assert.equal("peerCertificateDer" in operations[5].transport, true);
  assert.equal(operations[0].credential, undefined);
});

test("complete and reconcile require an authorized presented leaf and dispatch its DER", async t => {
  const calls = [];
  const { ingress } = createIngress(async (operation, input) => {
    calls.push({ operation, ...input });
    return { deviceId: "55555555-5555-4555-8555-555555555555", status: "pending" };
  });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const completeBody = JSON.stringify({ pairingId: "44444444-4444-4444-8444-444444444444",
    pairingSecret: Buffer.alloc(32, 3).toString("base64url"), enrollmentId: ENROLLMENT_ID, displayName: "Fixture device" });
  const complete = await post(bound.port, { route: "/sps-native/v1/enrollment/complete", body: completeBody,
    session: true, certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem });
  assert.equal(complete.statusCode, 200);
  assert.equal(calls[0].operation, "enrollment.complete");
  const expectedDer = new X509Certificate(memberCertificate.certificatePem).raw.toString("base64url");
  assert.equal(calls[0].transport.peerCertificateDer, expectedDer);
  assert.equal(calls[0].body.displayName, "Fixture device");

  const reconcile = await post(bound.port, { route: "/sps-native/v1/enrollment/reconcile",
    body: JSON.stringify({ enrollmentId: ENROLLMENT_ID }), session: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem });
  assert.equal(reconcile.statusCode, 200);
  assert.equal(calls[1].operation, "enrollment.reconcile");
  assert.equal(calls[1].body.enrollmentId, ENROLLMENT_ID);
});

test("renewal requires a fresh mTLS peer, session cookie and exact same-key CSR body", async t => {
  const calls = [];
  const result = { renewalId: ENROLLMENT_ID, deviceId: "55555555-5555-4555-8555-555555555555",
    predecessorCertificateSha256: "a".repeat(64),
    certificate: new X509Certificate(memberCertificate.certificatePem).raw.toString("base64url"),
    issuerCertificate: new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url"),
    certificateNotBefore: new Date(Date.parse(new X509Certificate(memberCertificate.certificatePem).validFrom)).toISOString(),
    certificateNotAfter: new Date(Date.parse(new X509Certificate(memberCertificate.certificatePem).validTo)).toISOString() };
  const { ingress } = createIngress(async (operation, input) => { calls.push({ operation, ...input }); return result; });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const body = JSON.stringify({ deviceKeyId: DEVICE_KEY_ID, requestPem: memberKey.requestPem });
  const renewed = await post(bound.port, { route: "/sps-native/v1/enrollment/renew", body, session: true,
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem });
  assert.equal(renewed.statusCode, 200);
  assert.deepEqual(JSON.parse(renewed.body), result);
  assert.equal(calls[0].operation, "enrollment.renew");
  assert.deepEqual(calls[0].body, { deviceKeyId: DEVICE_KEY_ID, requestPem: memberKey.requestPem });
  assert.equal(calls[0].transport.peerCertificateDer,
    new X509Certificate(memberCertificate.certificatePem).raw.toString("base64url"));
  assert.equal(calls[0].credential.sessionCookie, `sps_identity_session=${"a".repeat(64)}`);

  const before = calls.length;
  const extraField = await post(bound.port, { route: "/sps-native/v1/enrollment/renew",
    body: JSON.stringify({ deviceKeyId: DEVICE_KEY_ID, requestPem: memberKey.requestPem, deviceId: DEVICE_KEY_ID }),
    session: true, certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem });
  assert.equal(extraField.statusCode, 400);
  assert.equal(calls.length, before);
});

test("complete rejects a missing client certificate and identity rejects any presented one", async t => {
  let dispatched = 0;
  const { ingress } = createIngress(async () => { dispatched++; return {}; });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const missing = await post(bound.port, { route: "/sps-native/v1/enrollment/reconcile",
    body: JSON.stringify({ enrollmentId: ENROLLMENT_ID }), session: true });
  assert.equal(missing.statusCode, 401);
  const unexpected = await post(bound.port, { route: "/sps-native/v1/identity",
    certificate: memberCertificate.certificatePem, key: memberKey.privateKeyPem });
  assert.equal(unexpected.statusCode, 401);
  assert.equal(dispatched, 0);
});

test("private or extra Core identity result fields never reach the HTTP response", async t => {
  const privateMarker = "fixture-private-key-material-must-not-escape";
  const { ingress } = createIngress(async () => ({ ...publicIdentity(), serverPrivateKeyPem: privateMarker }));
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const response = await post(bound.port, { route: "/sps-native/v1/identity" });
  assert.equal(response.statusCode, 502);
  assert.equal(response.body.includes(privateMarker), false);
  assert.deepEqual(JSON.parse(response.body), { error: "native_enrollment_unavailable" });
});

test("rejects browser metadata, extra headers, malformed JSON and unknown paths before dispatch", async t => {
  let dispatched = 0;
  const { ingress } = createIngress(async () => { dispatched++; return {}; });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  for (const input of [
    { route: "/sps-native/v1/identity", headers: { Origin: "https://example.invalid" } },
    { route: "/sps-native/v1/identity", headers: { "X-Forwarded-For": "127.0.0.1" } },
    { route: "/sps-native/v1/identity?x=1" },
    { route: "/sps-native/v1/identity", body: "{}" },
    { route: "/sps-native/v1/session/exchange", headers: { Authorization: "Bearer invalid" } },
  ]) {
    const response = await post(bound.port, input);
    assert.notEqual(response.statusCode, 200);
  }
  assert.equal(dispatched, 0);
});

test("bind requires a literal certificate-covered IP and current identity", async t => {
  const { ingress } = createIngress(async () => ({}));
  t.after(() => ingress.dispose());
  await assert.rejects(ingress.start({ bindAddress: "localhost", port: 0 }), /literal IP/);
  await assert.rejects(ingress.start({ bindAddress: "::1", port: 0 }), /does not cover/);
});

test("failed listen remains observable as failed and can be disposed without an unhandled error", async t => {
  const occupied = await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
  const bound = occupied.address();
  const { ingress } = createIngress(async () => ({}));
  t.after(() => new Promise(resolve => occupied.close(() => resolve())));
  await assert.rejects(ingress.start({ bindAddress: "127.0.0.1", port: bound.port }));
  assert.deepEqual(ingress.inspect(), { state: "failed" });
  await ingress.dispose();
  assert.deepEqual(ingress.inspect(), { state: "disposed" });
});

test("identity rotation fences requests and disposal closes owned sockets", async t => {
  let resolveDispatch;
  const { ingress, setIdentity } = createIngress(() => new Promise(resolve => { resolveDispatch = resolve; }));
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const pending = post(bound.port, { route: "/sps-native/v1/identity" });
  await new Promise(resolve => setTimeout(resolve, 150));
  setIdentity(await createSpsNativeHostIdentity({ ...HOST_OPTIONS, hostId: "66666666-6666-4666-8666-666666666666" }));
  resolveDispatch?.({ hostId: HOST_ID });
  const response = await pending;
  assert.notEqual(response.statusCode, 200);
  await ingress.dispose();
  await assert.rejects(post(bound.port, { route: "/sps-native/v1/identity" }));
});

test("operation timeout aborts transport but retains its concurrency slot until dispatch settles", async t => {
  let resolveDispatch;
  let observedSignal;
  let callCount = 0;
  const finalResult = publicIdentity();
  const { ingress } = createIngress((_operation, _request, { signal }) => {
    callCount++;
    if (callCount > 1) return finalResult;
    observedSignal = signal;
    return new Promise(resolve => { resolveDispatch = resolve; });
  }, { limits: { maxOperations: 1, operationTimeoutMs: 1000 } });
  t.after(() => { resolveDispatch?.(finalResult); });
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const first = post(bound.port, { route: "/sps-native/v1/identity" }).catch(() => null);
  for (let attempt = 0; attempt < 50 && !observedSignal; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(observedSignal, "dispatch was not started");
  const timedOut = await first;
  assert.equal(timedOut.statusCode, 504);
  assert.equal(observedSignal.aborted, true);
  const second = await post(bound.port, { route: "/sps-native/v1/identity" });
  assert.equal(second.statusCode, 429);
  resolveDispatch(finalResult);
  for (let attempt = 0; attempt < 50; attempt++) {
    const third = await post(bound.port, { route: "/sps-native/v1/identity" });
    if (third.statusCode !== 429) {
      assert.equal(third.statusCode, 200);
      await ingress.dispose();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await ingress.dispose();
  assert.fail("The dispatch slot did not release after its operation settled.");
});

test("socket read-idle timeout ends after the body so the operation deadline governs dispatch", async t => {
  let resolveDispatch;
  let observedSignal;
  let finishTimer;
  const { ingress } = createIngress((_operation, _request, { signal }) => {
    observedSignal = signal;
    return new Promise(resolve => {
      resolveDispatch = resolve;
      finishTimer = setTimeout(() => resolve(publicIdentity()), 1250);
    });
  }, { limits: { readTimeoutMs: 1000, operationTimeoutMs: 3000 } });
  t.after(() => { clearTimeout(finishTimer); resolveDispatch?.(publicIdentity()); });
  t.after(() => ingress.dispose());
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const response = await post(bound.port, { route: "/sps-native/v1/identity" });
  assert.equal(response.statusCode, 200);
  assert.ok(observedSignal, "dispatch was not started");
  assert.equal(observedSignal.aborted, false);
});

test("socket disconnect aborts dispatch and releases the slot only after actual settlement", async t => {
  let resolveDispatch;
  let observedSignal;
  let callCount = 0;
  const { ingress } = createIngress((_operation, _request, { signal }) => {
    if (++callCount > 1) return publicIdentity();
    observedSignal = signal;
    return new Promise(resolve => { resolveDispatch = resolve; });
  }, { limits: { maxOperations: 1 } });
  t.after(() => { resolveDispatch?.(publicIdentity()); });
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const socket = tlsConnect({ host: "127.0.0.1", port: bound.port, ca: identity.server.certificatePem,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3" });
  t.after(() => socket.destroy());
  await new Promise((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
  socket.write("POST /sps-native/v1/identity HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  for (let attempt = 0; attempt < 50 && !observedSignal; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(observedSignal);
  socket.destroy();
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(observedSignal.aborted, true);
  const blocked = await post(bound.port, { route: "/sps-native/v1/identity" });
  assert.equal(blocked.statusCode, 429);
  resolveDispatch(publicIdentity());
  for (let attempt = 0; attempt < 50; attempt++) {
    const next = await post(bound.port, { route: "/sps-native/v1/identity" });
    if (next.statusCode !== 429) {
      assert.equal(next.statusCode, 200);
      await ingress.dispose();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  await ingress.dispose();
  assert.fail("The disconnected operation retained its slot after dispatch settled.");
});

test("dispose closes owned TLS sockets, aborts dispatch and suppresses late HTTP results", async t => {
  let resolveDispatch;
  let observedSignal;
  const { ingress } = createIngress((_operation, _request, { signal }) => {
    observedSignal = signal;
    return new Promise(resolve => { resolveDispatch = resolve; });
  });
  const bound = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const socket = tlsConnect({ host: "127.0.0.1", port: bound.port, ca: identity.server.certificatePem,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3" });
  const received = [];
  socket.on("data", chunk => received.push(chunk));
  await new Promise((resolve, reject) => { socket.once("secureConnect", resolve); socket.once("error", reject); });
  socket.write("POST /sps-native/v1/identity HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
  for (let attempt = 0; attempt < 50 && !observedSignal; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(observedSignal);
  await ingress.dispose();
  assert.equal(observedSignal.aborted, true);
  if (!socket.destroyed) await Promise.race([new Promise(resolve => socket.once("close", resolve)), new Promise(resolve => setTimeout(resolve, 2000))]);
  assert.equal(socket.destroyed, true);
  resolveDispatch(publicIdentity());
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(Buffer.concat(received).length, 0);
  socket.destroy();
});

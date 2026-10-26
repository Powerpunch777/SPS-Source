import assert from "node:assert/strict";
import { constants, createHash, X509Certificate } from "node:crypto";
import { createServer } from "node:https";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate,
  publicSpsNativeMemberEnrollmentRequest } from "../src/native-member-certificates.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { createSpsNativeEnrollmentBootstrap, createSpsNativeEnrollmentClient,
  createSpsNativeEnrollmentRecoveryClient } from "../src/native-enrollment-client.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const DEVICE = "22222222-2222-4222-8222-222222222222";
const PAIRING = "33333333-3333-4333-8333-333333333333";
const ENROLLMENT = "44444444-4444-4444-8444-444444444444";
const TOKEN = "fixture.header.signature", COOKIE = `sps_identity_session=${"x".repeat(64)}`;
const spki = pem => createHash("sha256").update(new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" })).digest("hex");
let host, other, keyRequest, certificate;
before(async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const options = { hostId: HOST, hostnames: ["127.0.0.1"], notBefore: now - 60_000,
    notAfter: now + 86_400_000, issuerNotAfter: now + 2 * 86_400_000 };
  host = await createSpsNativeHostIdentity(options);
  other = await createSpsNativeHostIdentity(options);
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  certificate = await issueSpsNativeMemberCertificate({ hostIdentity: host,
    request: await publicSpsNativeMemberEnrollmentRequest(keyRequest), notBefore: now - 1000,
    notAfter: now + 120_000, now });
});

async function fixture(t, { identity = host, respond, version = "TLSv1.3" } = {}) {
  const requests = [], sockets = new Set();
  let notify;
  const received = new Promise(resolve => { notify = resolve; });
  const expiresAt = Date.now() + 60_000;
  const issuance = { enrollmentId: ENROLLMENT,
    certificate: new X509Certificate(certificate.certificatePem).raw.toString("base64url"),
    issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url"),
    expiresAt: new Date(expiresAt).toISOString() };
  const server = createServer({ key: identity.server.privateKeyPem, cert: identity.server.certificatePem,
    ca: host.memberIssuer.certificatePem, requestCert: true, rejectUnauthorized: false,
    minVersion: version, maxVersion: version, secureOptions: constants.SSL_OP_NO_TICKET }, (req, res) => {
    const chunks = [];
    req.on("error", () => {});
    res.on("error", () => {});
    req.on("data", chunk => chunks.push(chunk));
    req.once("end", () => {
      const item = { path: req.url, method: req.method, authorization: req.headers.authorization,
        cookie: req.headers.cookie, body: Buffer.concat(chunks).toString("utf8"),
        protocol: req.socket.getProtocol(), resumed: req.socket.isSessionReused(), authorized: req.socket.authorized,
        peer: req.socket.getPeerCertificate().raw };
      requests.push(item); notify();
      const exchange = req.url === "/sps-native/v1/session/exchange";
      const value = req.url === "/sps-native/v1/identity" ? { hostId: HOST,
        serverSpkiSha256: spki(host.server.certificatePem), issuerSpkiSha256: spki(host.memberIssuer.certificatePem),
        issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url") }
        : exchange ? { expiresInSeconds: 604800 }
        : req.url.endsWith("/issue") ? issuance : { deviceId: DEVICE, status: "pending" };
      const send = (data = value, status = exchange ? 201 : 200, extraHeaders = {}) => {
        if (res.destroyed) return;
        const bytes = Buffer.from(typeof data === "string" ? data : JSON.stringify(data));
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": bytes.length,
          "Cache-Control": "no-store", Connection: "close",
          ...(exchange ? { "Set-Cookie": `${COOKIE}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax` } : {}), ...extraHeaders });
        res.end(bytes);
      };
      if (respond) respond({ req, res, item, send, value }); else send();
    });
  });
  server.on("tlsClientError", () => {});
  server.on("connection", socket => {
    sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket));
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const code = createSpsNativeInviteCode({ v: 2, kind: "sps.native-lan.pairing", hostId: HOST,
    origin: `https://127.0.0.1:${server.address().port}`, spkiSha256: spki(host.server.certificatePem),
    serverCertificate: new X509Certificate(host.server.certificatePem).raw.toString("base64url"),
    pairingId: PAIRING, pairingSecret: Buffer.alloc(32, 7).toString("base64url"), issuedAt: Date.now() - 1000, expiresAt });
  const context = { identityIssuer: "https://identity.example.test", subject: "fixture-member", hostId: HOST,
    deviceKeyId: DEVICE, serverSpkiSha256: spki(host.server.certificatePem), issuerSpkiSha256: spki(host.memberIssuer.certificatePem) };
  function client(overrides = {}) {
    const result = createSpsNativeEnrollmentClient({ invitationCode: code, context, timeoutMs: 3000,
      assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  function bootstrap(overrides = {}) {
    const result = createSpsNativeEnrollmentBootstrap({ invitationCode: code, timeoutMs: 3000, assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  const target = { v: 1, kind: "sps.native.member-host-target", context,
    origin: `https://127.0.0.1:${server.address().port}`, serverCertificatePem: host.server.certificatePem };
  function recovery(overrides = {}) {
    const result = createSpsNativeEnrollmentRecoveryClient({ target, context, timeoutMs: 3000,
      assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  return { requests, received, issuance, context, code, client, bootstrap, recovery, target,
    replaceIdentity(identity) { server.setSecureContext({ key: identity.server.privateKeyPem,
      cert: identity.server.certificatePem, ca: host.memberIssuer.certificatePem }); } };
}

function safe(error) {
  assert.match(error.code, /^native_enrollment_client_/);
  assert.doesNotMatch(error.message, /PRIVATE KEY|fixture\.header|sps_identity_session|C:\\|127\.0\.0\.1|fixture-member/);
  assert.equal(Object.hasOwn(error, "cause"), false);
  return true;
}

test("uses three fresh pinned TLS connections and keeps tokens/cookies out of returned DTOs", async t => {
  const f = await fixture(t), client = f.client();
  assert.equal(Object.isFrozen(client), true);
  const acknowledgement = await client.exchange(TOKEN);
  assert.deepEqual(Object.keys(acknowledgement), ["state", "expiresAt"]);
  assert.equal(acknowledgement.state, "session_prepared");
  const issued = await client.issue(keyRequest);
  assert.deepEqual(issued, f.issuance);
  const completed = await client.complete({ keyRequest, issuance: issued, displayName: "Fixture PC" });
  assert.deepEqual(completed, { deviceId: DEVICE, status: "pending" });
  assert.equal(f.requests.length, 3);
  assert.ok(f.requests.every(row => row.method === "POST" && row.protocol === "TLSv1.3" && !row.resumed));
  assert.equal(f.requests[0].authorization, `Bearer ${TOKEN}`);
  assert.equal(f.requests[0].cookie, undefined);
  assert.equal(f.requests[0].body, "");
  for (const row of f.requests.slice(1)) {
    assert.equal(row.cookie, COOKIE); assert.equal(row.authorization, undefined);
    assert.doesNotMatch(row.body, /PRIVATE KEY|fixture\.header|sps_identity_session|userId|subject/);
  }
  assert.deepEqual(Object.keys(JSON.parse(f.requests[1].body)), ["pairingId", "pairingSecret", "deviceKeyId", "requestPem"]);
  assert.equal(f.requests[2].authorized, true);
  assert.ok(f.requests[2].peer.equals(new X509Certificate(certificate.certificatePem).raw));
  assert.doesNotMatch(JSON.stringify({ acknowledgement, issued, completed, client }), /sps_identity_session|PRIVATE KEY|fixture\.header/);
  await assert.rejects(client.issue(keyRequest), safe);
});

test("a different actual TLS peer receives no HTTP Authorization or pairing secret", async t => {
  const f = await fixture(t, { identity: other });
  await assert.rejects(f.client().exchange(TOKEN), safe);
  assert.equal(f.requests.length, 0);
});

test("strict factory scope and hostile getters fail before any request", async t => {
  const f = await fixture(t);
  for (const change of [{ timeoutMs: Infinity }, { timeoutMs: 0 }, { timeoutMs: 60001 }, { timeoutMs: 1.5 },
    { assertCurrent: undefined }, { context: { ...f.context, hostId: DEVICE } },
    { context: { ...f.context, serverSpkiSha256: "0".repeat(64) } }]) {
    assert.throws(() => f.client(change), safe);
  }
  let getterRead = false;
  const input = Object.defineProperty({}, "timeoutMs", { enumerable: true, get() { getterRead = true; return 100; } });
  assert.throws(() => createSpsNativeEnrollmentClient(input), safe);
  assert.equal(getterRead, false);
  const client = f.client();
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  await assert.rejects(client.exchange(TOKEN, { extra: 1 }), safe);
  assert.equal(f.requests.length, 0);
});

test("current account/Host guard is checked before connecting and before accepting a late session", async t => {
  let sendResponse, current = true;
  const f = await fixture(t, { respond({ send }) { sendResponse = send; } });
  const client = f.client({ assertCurrent() { if (!current) throw new Error("private account/path detail"); } });
  const exchanging = client.exchange(TOKEN);
  const rejected = assert.rejects(exchanging, safe);
  await f.received;
  current = false;
  sendResponse();
  await rejected;
  await assert.rejects(client.issue(keyRequest), safe);
  current = true;
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 1);
});

test("overlap is rejected, cancellation closes the owned socket and never retries", async t => {
  const f = await fixture(t, { respond() {} }), client = f.client();
  const controller = new AbortController();
  const exchanging = client.exchange(TOKEN, { signal: controller.signal });
  const rejected = assert.rejects(exchanging, { code: "native_enrollment_client_cancelled" });
  await f.received;
  await assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_busy" });
  controller.abort();
  await rejected;
  assert.equal(f.requests.length, 1);
});

test("dispose cancels an active request and rejects every later operation", async t => {
  const f = await fixture(t, { respond() {} }), client = f.client();
  const rejected = assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_disposed" });
  await f.received;
  client.dispose(); client.dispose();
  await rejected;
  await assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_disposed" });
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_disposed" });
  assert.equal(f.requests.length, 1);
});

test("bounded timeout fails a response stall with one request, not an automatic retry", async t => {
  const f = await fixture(t, { respond() {} });
  await assert.rejects(f.client({ timeoutMs: 150 }).exchange(TOKEN), { code: "native_enrollment_client_timeout" });
  assert.equal(f.requests.length, 1);
});

test("redirect and truncated or oversized responses never create a usable session", async t => {
  for (const respond of [
    ({ send, value }) => send(value, 302, { Location: "https://not-followed.example.test" }),
    ({ send }) => send('{"expiresInSeconds":'),
    ({ send }) => send("x".repeat(16_385)),
    ({ send, value }) => send(value, 201, { "Set-Cookie": [`${COOKIE}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`, "other=unsafe"] }),
  ]) {
    const f = await fixture(t, { respond }), client = f.client();
    await assert.rejects(client.exchange(TOKEN), safe);
    await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
    assert.equal(f.requests.length, 1);
  }
});

test("issuer mismatch and wrong local key cannot progress to the certificate-bearing request", async t => {
  const f = await fixture(t), client = f.client({ context: { ...f.context, issuerSpkiSha256: "0".repeat(64) } });
  await client.exchange(TOKEN);
  await assert.rejects(client.issue(keyRequest), safe);
  await assert.rejects(client.complete({ keyRequest, issuance: f.issuance, displayName: "Fixture PC" }), safe);
  assert.equal(f.requests.length, 2);
  const good = f.client();
  await good.exchange(TOKEN);
  await assert.rejects(good.issue({ ...keyRequest, deviceKeyId: HOST }), safe);
  assert.equal(f.requests.length, 3);
});

test("caller aborting inside its synchronous guard prevents HTTP credential delivery", async t => {
  const f = await fixture(t), controller = new AbortController();
  const client = f.client({ assertCurrent() { controller.abort(); } });
  await assert.rejects(client.exchange(TOKEN, { signal: controller.signal }), { code: "native_enrollment_client_cancelled" });
  assert.equal(f.requests.length, 0);
});

test("guard failure after a prepared session clears it rather than resurrecting credentials", async t => {
  let current = true;
  const f = await fixture(t), client = f.client({ assertCurrent() {
    if (!current) throw new Error("private former account details");
  } });
  await client.exchange(TOKEN);
  current = false;
  await assert.rejects(client.issue(keyRequest), safe);
  current = true;
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 1);
});

test("certificate validation does not pin a later connection by hostname or origin alone", async t => {
  const f = await fixture(t), client = f.client();
  await client.exchange(TOKEN);
  f.replaceIdentity(other);
  await assert.rejects(client.issue(keyRequest), safe);
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 1);
});

test("TLS 1.2 cannot receive Identity or pairing credentials", async t => {
  const f = await fixture(t, { version: "TLSv1.2" });
  await assert.rejects(f.client().exchange(TOKEN), safe);
  assert.equal(f.requests.length, 0);
});

test("losing account scope after certificate verification still prevents HTTP headers from flushing", async t => {
  let checks = 0;
  const f = await fixture(t), client = f.client({ assertCurrent() {
    // Initial operation, pre-request and certificate callbacks have passed.
    if (++checks === 4) throw new Error("fixture account generation lost after handshake");
  } });
  await assert.rejects(client.exchange(TOKEN), safe);
  assert.equal(checks, 4);
  assert.equal(f.requests.length, 0);
});

test("bootstrap learns only public issuer context on the pinned connection without credentials or session methods", async t => {
  const f = await fixture(t), bootstrap = f.bootstrap();
  assert.deepEqual(Object.keys(bootstrap), ["inspect", "dispose"]);
  const metadata = await bootstrap.inspect();
  assert.deepEqual(metadata, { hostId: HOST, serverSpkiSha256: f.context.serverSpkiSha256,
    issuerSpkiSha256: f.context.issuerSpkiSha256, issuerCertificatePem: host.memberIssuer.certificatePem });
  assert.equal(Object.isFrozen(metadata), true);
  assert.deepEqual(f.requests.map(({ path, authorization, cookie, body }) => ({ path, authorization, cookie, body })),
    [{ path: "/sps-native/v1/identity", authorization: undefined, cookie: undefined, body: "" }]);
  const client = f.client({ context: { ...f.context, issuerSpkiSha256: metadata.issuerSpkiSha256 } });
  await client.exchange(TOKEN);
  const issuance = await client.issue(keyRequest);
  assert.equal((await client.complete({ keyRequest, issuance, displayName: "Fixture PC" })).status, "pending");
});

test("bootstrap rejects mismatched Host/server/issuer metadata and non-issuer certificates", async t => {
  for (const update of [value => ({ ...value, hostId: DEVICE }), value => ({ ...value, serverSpkiSha256: "0".repeat(64) }),
    value => ({ ...value, issuerSpkiSha256: "0".repeat(64) }),
    value => ({ ...value, issuerCertificate: new X509Certificate(host.server.certificatePem).raw.toString("base64url"),
      issuerSpkiSha256: spki(host.server.certificatePem) }),
    value => ({ ...value, issuerCertificate: new X509Certificate(other.memberIssuer.certificatePem).raw.toString("base64url") }),
  ]) {
    const f = await fixture(t, { respond({ send, value }) { send(update(value)); } });
    await assert.rejects(f.bootstrap().inspect(), safe);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].authorization, undefined);
    assert.equal(f.requests[0].cookie, undefined);
  }
});

test("bootstrap never contacts a different actual peer and disposal rejects a later public read", async t => {
  const bad = await fixture(t, { identity: other });
  await assert.rejects(bad.bootstrap().inspect(), safe);
  assert.equal(bad.requests.length, 0);
  const good = await fixture(t), bootstrap = good.bootstrap();
  bootstrap.dispose();
  await assert.rejects(bootstrap.inspect(), { code: "native_enrollment_client_disposed" });
  assert.equal(good.requests.length, 0);
  assert.throws(() => good.bootstrap({ context: good.context }), safe);
});

test("recovery uses the retained peer and existing issued key without an invitation or enrollment methods", async t => {
  const f = await fixture(t), first = f.client();
  await first.exchange(TOKEN);
  const issuance = await first.issue(keyRequest);
  await first.complete({ keyRequest, issuance, displayName: "Fixture PC" });
  first.dispose();
  const recovered = f.recovery();
  assert.deepEqual(Object.keys(recovered), ["exchange", "reconcile", "dispose"]);
  assert.equal(Object.isFrozen(recovered), true);
  const expiredPairing = { ...issuance, expiresAt: new Date(Date.now() - 1000).toISOString() };
  await recovered.exchange(TOKEN);
  assert.deepEqual(await recovered.reconcile({ keyRequest, issuance: expiredPairing }), { deviceId: DEVICE, status: "pending" });
  const request = f.requests.at(-1);
  assert.equal(request.path, "/sps-native/v1/enrollment/reconcile");
  assert.equal(request.authorized, true);
  assert.equal(request.resumed, false);
  assert.equal(request.protocol, "TLSv1.3");
  assert.ok(request.peer.equals(new X509Certificate(certificate.certificatePem).raw));
  assert.equal(request.cookie, COOKIE);
  assert.equal(request.authorization, undefined);
  assert.deepEqual(JSON.parse(request.body), { enrollmentId: ENROLLMENT });
  assert.doesNotMatch(request.body, /pairing|PRIVATE KEY|subject|userId|displayName/);
  await recovered.reconcile({ keyRequest, issuance: expiredPairing });
  assert.equal(f.requests.filter(row => row.path.endsWith("/issue") || row.path.endsWith("/complete")).length, 2);
});

test("recovery observes pending, approved and revoked without interpreting them as enrollment permission", async t => {
  for (const status of ["pending", "approved", "revoked"]) {
    const f = await fixture(t, { respond({ item, send, value }) {
      send(item.path.endsWith("/reconcile") ? { deviceId: DEVICE, status } : value);
    } });
    const client = f.recovery();
    await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_session_required" });
    await client.exchange(TOKEN);
    assert.deepEqual(await client.reconcile({ keyRequest, issuance: f.issuance }), { deviceId: DEVICE, status });
    assert.deepEqual(f.requests.map(row => row.path), ["/sps-native/v1/session/exchange", "/sps-native/v1/enrollment/reconcile"]);
  }
});

test("recovery rejects changed scope, pins, issuer and local key without replaying pairing", async t => {
  const f = await fixture(t);
  for (const changes of [{ context: { ...f.context, subject: "another-account" } },
    { target: { ...f.target, serverCertificatePem: other.server.certificatePem } },
    { target: { ...f.target, origin: "https://wrong.example.test" } }, { invitationCode: f.code }]) {
    assert.throws(() => f.recovery(changes), safe);
  }
  const client = f.recovery();
  await client.exchange(TOKEN);
  await assert.rejects(client.reconcile({ keyRequest: { ...keyRequest, deviceKeyId: HOST }, issuance: f.issuance }), safe);
  assert.equal(f.requests.length, 1);
  await client.exchange(TOKEN);
  await assert.rejects(client.reconcile({ keyRequest, issuance: { ...f.issuance,
    issuerCertificate: new X509Certificate(other.memberIssuer.certificatePem).raw.toString("base64url") } }), safe);
  assert.equal(f.requests.length, 2);
  const badPeer = await fixture(t, { identity: other });
  await assert.rejects(badPeer.recovery().exchange(TOKEN), safe);
  assert.equal(badPeer.requests.length, 0);
});

test("recovery cancellation or lost current account cannot accept late results or silently retry", async t => {
  let deliver, current = true;
  async function waitForResponse() {
    const deadline = Date.now() + 2000;
    while (!deliver && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(typeof deliver, "function", "The owned fixture must receive the request before its deadline.");
  }
  const f = await fixture(t, { respond({ item, send }) {
    if (item.path.endsWith("/reconcile")) deliver = send;
    else send();
  } });
  const client = f.recovery({ assertCurrent() { if (!current) throw new Error("private former account"); } });
  await client.exchange(TOKEN);
  const controller = new AbortController();
  const running = client.reconcile({ keyRequest, issuance: f.issuance }, { signal: controller.signal });
  const rejected = assert.rejects(running, { code: "native_enrollment_client_cancelled" });
  await waitForResponse();
  await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_busy" });
  controller.abort();
  await rejected;
  deliver();
  assert.equal(f.requests.length, 2);
  await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_session_required" });
  deliver = null;
  await client.exchange(TOKEN);
  const late = assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), safe);
  await waitForResponse();
  current = false;
  deliver();
  await late;
  current = true;
  await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 4);
  client.dispose();
  await assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_disposed" });
});

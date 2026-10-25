import assert from "node:assert/strict";
import { createServer as createTcpServer } from "node:net";
import { createServer as createTlsServer } from "node:tls";
import test, { after, before } from "node:test";
import { X509Certificate } from "node:crypto";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { probeSpsNativeServerTls, verifySpsNativeInvitationCertificate } from "../src/native-connection-tls.mjs";
import { createNativeTlsFixture } from "./helpers/native-tls-fixtures.mjs";

const fixtures = [];
let valid;
let other;
let expired;
let wrongName;
let clientOnly;
let ca;

before(async () => {
  for (const options of [{}, {}, { expired: true }, { san: "DNS:wrong.example.test" }, { usage: "clientAuth" }, { ca: true }]) {
    fixtures.push(await createNativeTlsFixture(options));
  }
  [valid, other, expired, wrongName, clientOnly, ca] = fixtures;
});

after(async () => {
  for (const fixture of fixtures) await fixture.dispose();
});

function invite(fixture = valid, origin = "https://127.0.0.1:31311", fields = {}) {
  return createSpsNativeInviteCode({
    v: 2,
    kind: "sps.native-lan.pairing",
    hostId: "11111111-1111-4111-8111-111111111111",
    origin,
    spkiSha256: fixture.spkiSha256,
    serverCertificate: fixture.serverCertificate,
    pairingId: "22222222-2222-4222-8222-222222222222",
    pairingSecret: Buffer.alloc(32, 47).toString("base64url"),
    issuedAt: Date.now() - 1_000,
    expiresAt: Date.now() + 60_000,
    ...fields,
  });
}

async function listener(t, fixture = valid, { silent = false, version = "TLSv1.3" } = {}) {
  const sockets = new Set();
  const stats = { connections: 0, applicationBytes: 0 };
  const server = silent ? createTcpServer() : createTlsServer({
    key: fixture.keyPem, cert: fixture.certPem, minVersion: version, maxVersion: version,
  }, socket => socket.on("data", bytes => { stats.applicationBytes += bytes.length; }));
  server.on("tlsClientError", () => {});
  server.on("connection", socket => {
    stats.connections++;
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  return { server, stats, origin: `https://127.0.0.1:${server.address().port}` };
}

test("validates only the invitation certificate without returning the pairing secret", () => {
  const result = verifySpsNativeInvitationCertificate(invite());
  assert.equal(result.spkiSha256, valid.spkiSha256);
  assert.equal(new X509Certificate(result.certificatePem).raw.toString("base64url"), valid.serverCertificate);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.hasOwn(result, "pairingSecret"), false);
  assert.equal(Object.hasOwn(result, "authorized"), false);
});

test("rejects expired/future invitations and invalid verification clock input", () => {
  assert.throws(() => verifySpsNativeInvitationCertificate(invite(valid, undefined, { issuedAt: 1, expiresAt: 2 })), { code: "native_invitation_expired" });
  assert.throws(() => verifySpsNativeInvitationCertificate(invite(valid, undefined, {
    issuedAt: Date.now() + 60_000, expiresAt: Date.now() + 120_000,
  })), { code: "native_invitation_not_yet_valid" });
  for (const now of [NaN, Infinity, -1, 0, 1.5, "1", null, {}]) {
    assert.throws(() => verifySpsNativeInvitationCertificate(invite(), now), { code: "native_connection_invalid_options" });
  }
});

test("rejects malformed DER, extra certificate bytes and mismatched SPKI before connecting", async t => {
  const target = await listener(t);
  const invalidSignature = Buffer.from(valid.serverCertificate, "base64url");
  invalidSignature[invalidSignature.length - 1] ^= 1;
  for (const fields of [
    { serverCertificate: Buffer.from("not a certificate").toString("base64url") },
    { serverCertificate: Buffer.concat([Buffer.from(valid.serverCertificate, "base64url"), Buffer.from([0])]).toString("base64url") },
    { serverCertificate: invalidSignature.toString("base64url") },
    { spkiSha256: other.spkiSha256 },
  ]) {
    await assert.rejects(probeSpsNativeServerTls(invite(valid, target.origin, fields)));
  }
  assert.equal(target.stats.connections, 0);
});

test("does not accept a Member-purpose certificate or CA certificate as the server identity", () => {
  for (const fixture of [clientOnly, ca]) {
    assert.throws(() => verifySpsNativeInvitationCertificate(invite(fixture)), { code: "native_server_certificate_invalid" });
  }
});

test("requires SAN address matching and valid certificate dates", () => {
  assert.throws(() => verifySpsNativeInvitationCertificate(invite(wrongName)), { code: "native_server_name_mismatch" });
  const cert = new X509Certificate(valid.certPem);
  const afterExpiry = Date.parse(cert.validTo) + 1;
  const beforeStart = Date.parse(cert.validFrom) - 1;
  for (const [now, code] of [[afterExpiry, "native_server_certificate_expired"], [beforeStart, "native_server_certificate_not_yet_valid"]]) {
    const encoded = invite(valid, undefined, { issuedAt: now - 100, expiresAt: now + 60_000 });
    assert.throws(() => verifySpsNativeInvitationCertificate(encoded, now), { code });
  }
  assert.throws(() => verifySpsNativeInvitationCertificate(invite(expired)));
});

test("authenticates the exact pinned TLS 1.3 peer and sends no application bytes", async t => {
  const target = await listener(t);
  const result = await probeSpsNativeServerTls(invite(valid, target.origin));
  assert.equal(result.state, "tls_peer_verified");
  assert.equal(result.origin, target.origin);
  assert.equal(result.protocol, "TLSv1.3");
  assert.equal(result.spkiSha256, valid.spkiSha256);
  assert.ok(Number.isFinite(Date.parse(result.observedAt)));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.hasOwn(result, "pairingSecret"), false);
  assert.equal(Object.hasOwn(result, "authorized"), false);
  assert.equal(target.stats.connections, 1);
  assert.equal(target.stats.applicationBytes, 0);
});

test("rejects a different actual server certificate without a fallback or credential exchange", async t => {
  const target = await listener(t, other);
  await assert.rejects(probeSpsNativeServerTls(invite(valid, target.origin)), { code: "native_connection_failed" });
  assert.equal(target.stats.connections, 1);
  assert.equal(target.stats.applicationBytes, 0);
});

test("rechecks invitation expiry after a real TLS handshake before reporting success", async t => {
  const target = await listener(t);
  const realNow = Date.now;
  const expiresAt = realNow() + 60_000;
  let now = realNow();
  const encoded = invite(valid, target.origin, { issuedAt: now - 1_000, expiresAt });
  target.server.once("connection", () => { now = expiresAt; });
  Date.now = () => now;
  try {
    await assert.rejects(probeSpsNativeServerTls(encoded), { code: "native_invitation_expired" });
    assert.equal(target.stats.connections, 1);
    assert.equal(target.stats.applicationBytes, 0);
  } finally {
    Date.now = realNow;
  }
});

test("does not downgrade to TLS 1.2", async t => {
  const target = await listener(t, valid, { version: "TLSv1.2" });
  await assert.rejects(probeSpsNativeServerTls(invite(valid, target.origin)), { code: "native_connection_failed" });
  assert.equal(target.stats.applicationBytes, 0);
});

test("bounds a nonresponsive TLS handshake and closes the socket", async t => {
  const target = await listener(t, valid, { silent: true });
  await assert.rejects(probeSpsNativeServerTls(invite(valid, target.origin), { timeoutMs: 50 }), { code: "native_connection_timeout" });
  assert.equal(target.stats.connections, 1);
});

test("cancels a pending handshake and never connects for an already-aborted request", async t => {
  const target = await listener(t, valid, { silent: true });
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(probeSpsNativeServerTls(invite(valid, target.origin), { signal: stopped.signal }), { code: "native_connection_cancelled" });
  assert.equal(target.stats.connections, 0);
  const pending = new AbortController();
  const connected = new Promise(resolve => target.server.once("connection", resolve));
  const operation = probeSpsNativeServerTls(invite(valid, target.origin), { signal: pending.signal });
  const outcome = assert.rejects(operation, { code: "native_connection_cancelled" });
  await connected;
  pending.abort();
  await outcome;
});

test("rejects invalid options and unavailable peers with safe errors", async t => {
  for (const timeoutMs of [Infinity, NaN, 0, -1, 1.1, "10", null, 30_001]) {
    await assert.rejects(probeSpsNativeServerTls(invite(), { timeoutMs }), { code: "native_connection_invalid_options" });
  }
  for (const options of [null, [], { origin: "https://other.example.test" }, { signal: {} }]) {
    await assert.rejects(probeSpsNativeServerTls(invite(), options), { code: "native_connection_invalid_options" });
  }
  const target = await listener(t);
  const origin = target.origin;
  await new Promise(resolve => target.server.close(resolve));
  await assert.rejects(probeSpsNativeServerTls(invite(valid, origin)), error => {
    assert.equal(error.code, "native_connection_failed");
    assert.equal(error.message.includes(origin), false);
    assert.equal(Object.hasOwn(error, "cause"), false);
    return true;
  });
});

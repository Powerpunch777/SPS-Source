import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { createServer } from "node:tls";
import test, { before } from "node:test";
import { defaultSpsNativeCertificateValidity } from "../src/native-connection-policy.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { probeSpsNativeServerTls, verifySpsNativeInvitationCertificate } from "../src/native-connection-tls.mjs";
import {
  createSpsNativeHostIdentity, inspectSpsNativeHostIdentity,
  renewSpsNativeHostServerCertificate, requireCurrentSpsNativeHostIdentity,
  validateSpsNativeHostIdentity, validateSpsNativeServerCertificateTransition,
} from "../src/native-identity-certificates.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const START = Math.floor(Date.now() / 1000) * 1000 - 1000;
const options = {
  hostId: HOST, hostnames: ["127.0.0.1", "::1", "sps.test"],
  notBefore: START, notAfter: START + 3_600_000, issuerNotAfter: START + 7_200_000,
};
let identity;
let other;
before(async () => {
  identity = await createSpsNativeHostIdentity(options);
  other = await createSpsNativeHostIdentity(options);
});

function clone() { return structuredClone(identity); }

function invite(value, origin, overrides = {}) {
  const certificate = new X509Certificate(value.server.certificatePem);
  return createSpsNativeInviteCode({
    v: 2, kind: "sps.native-lan.pairing", hostId: HOST, origin,
    spkiSha256: createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("hex"),
    serverCertificate: certificate.raw.toString("base64url"),
    pairingId: "22222222-2222-4222-8222-222222222222",
    pairingSecret: Buffer.alloc(32, 3).toString("base64url"),
    issuedAt: START, expiresAt: START + 60_000,
    ...overrides,
  });
}

test("generates two distinct purpose-limited P-256 keys without a subprocess or OS store", () => {
  const server = new X509Certificate(identity.server.certificatePem);
  const issuer = new X509Certificate(identity.memberIssuer.certificatePem);
  assert.equal(server.ca, false);
  assert.equal(issuer.ca, true);
  assert.deepEqual(server.keyUsage, ["1.3.6.1.5.5.7.3.1"]);
  assert.equal(issuer.keyUsage, undefined);
  for (const [certificate, pair] of [[server, identity.server], [issuer, identity.memberIssuer]]) {
    assert.equal(certificate.publicKey.asymmetricKeyDetails.namedCurve, "prime256v1");
    assert.equal(certificate.verify(certificate.publicKey), true);
    assert.equal(certificate.publicKey.export({ type: "spki", format: "pem" }),
      createPublicKey(createPrivateKey(pair.privateKeyPem)).export({ type: "spki", format: "pem" }));
  }
  assert.notEqual(identity.server.privateKeyPem, identity.memberIssuer.privateKeyPem);
  assert.notEqual(identity.server.privateKeyPem, other.server.privateKeyPem);
  assert.notEqual(server.serialNumber, new X509Certificate(other.server.certificatePem).serialNumber);
  assert.equal(server.checkIP("127.0.0.1"), "127.0.0.1");
  assert.ok(server.checkIP("::1"));
  assert.equal(server.checkHost("sps.test"), "sps.test");
  assert.equal(Object.isFrozen(identity), true);
  assert.equal(Object.isFrozen(identity.server), true);
});

test("requires explicit exact dates, Host ID and SANs rather than silently choosing policy", async () => {
  const invalid = [
    {}, { ...options, extra: true }, { ...options, hostId: `${HOST}\n` },
    { ...options, notBefore: undefined }, { ...options, notBefore: START + 0.5 },
    { ...options, notBefore: Infinity }, { ...options, notBefore: START + 1 },
    { ...options, notBefore: options.notAfter }, { ...options, notAfter: options.issuerNotAfter + 1000 },
    { ...options, hostnames: [] }, { ...options, hostnames: ["*.sps.test"] },
    { ...options, hostnames: ["127.000.0.1"] }, { ...options, hostnames: ["SPS.test"] },
    { ...options, hostnames: ["sps.test", "sps.test"] }, { ...options, hostnames: ["sps.test\n"] },
    { ...options, hostnames: ["https://sps.test"] }, { ...options, hostnames: ["[::1]"] },
    { ...options, hostnames: ["sps.test,IP:127.0.0.1"] },
  ];
  for (const value of invalid) {
    await assert.rejects(createSpsNativeHostIdentity(value), { code: "native_identity_invalid_options" });
  }
  let invoked = false;
  const accessor = { ...options };
  Object.defineProperty(accessor, "hostId", { enumerable: true, get() { invoked = true; return HOST; } });
  await assert.rejects(createSpsNativeHostIdentity(accessor), { code: "native_identity_invalid_options" });
  assert.equal(invoked, false);
});

test("the approved lifetime policy composes with certificate creation without changing units", async () => {
  const server = defaultSpsNativeCertificateValidity("server", START);
  const issuer = defaultSpsNativeCertificateValidity("issuer-ca", START);
  const created = await createSpsNativeHostIdentity({
    hostId: HOST, hostnames: ["127.0.0.1"], notBefore: server.notBeforeEpochSeconds * 1000,
    notAfter: server.notAfterEpochSeconds * 1000, issuerNotAfter: issuer.notAfterEpochSeconds * 1000,
  });
  const status = inspectSpsNativeHostIdentity(created, START);
  assert.equal(status.serverNotAfter - status.serverNotBefore, 90 * 86_400_000);
  assert.equal(status.memberIssuerNotAfter - status.memberIssuerNotBefore, 365 * 86_400_000);
});

test("Host server renewal is explicit, same-key, same-SAN, pre-expiry, and keeps the issuer unchanged", async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const saved = await createSpsNativeHostIdentity({ hostId: HOST, hostnames: ["localhost", "127.0.0.1"],
    notBefore: now - 60_000, notAfter: now + 90 * 86_400_000, issuerNotAfter: now + 365 * 86_400_000 });
  const renewalNow = new Date(now + 80 * 86_400_000);
  const renewed = await renewSpsNativeHostServerCertificate({ identity: saved, now: renewalNow.getTime() });
  const before = new X509Certificate(saved.server.certificatePem), after = new X509Certificate(renewed.server.certificatePem);
  assert.equal(renewed.hostId, saved.hostId);
  assert.equal(renewed.server.privateKeyPem, saved.server.privateKeyPem);
  assert.deepEqual(renewed.memberIssuer, saved.memberIssuer);
  assert.equal(after.verify(after.publicKey), true);
  assert.deepEqual(after.subjectAltName, before.subjectAltName);
  assert.equal(Date.parse(after.validFrom), Math.floor(renewalNow.getTime() / 1000) * 1000);
  assert.ok(Date.parse(after.validTo) > Date.parse(before.validTo));
  assert.equal(validateSpsNativeServerCertificateTransition({ hostId: HOST,
    predecessorCertificatePem: saved.server.certificatePem, certificatePem: renewed.server.certificatePem }).raw.equals(after.raw), true);
  await assert.rejects(renewSpsNativeHostServerCertificate({ identity: saved, now }), { code: "native_identity_renewal_not_due" });
  await assert.rejects(renewSpsNativeHostServerCertificate({ identity: saved, now: Date.parse(before.validTo) }), { code: "native_identity_not_current" });
});

test("server transition rejects changed key, SAN, Host, overlapping expiry and oversized lifetime", () => {
  const predecessor = identity.server.certificatePem;
  for (const input of [
    { hostId: HOST, predecessorCertificatePem: predecessor, certificatePem: other.server.certificatePem },
    { hostId: "22222222-2222-4222-8222-222222222222", predecessorCertificatePem: predecessor, certificatePem: predecessor },
    { hostId: HOST, predecessorCertificatePem: predecessor, certificatePem: predecessor },
  ]) assert.throws(() => validateSpsNativeServerCertificateTransition(input), { code: "native_identity_invalid" });
});

test("status is a frozen public projection, not connection or approval readiness", () => {
  const status = inspectSpsNativeHostIdentity(identity, START + 1);
  assert.equal(status.state, "identity_prepared");
  assert.equal(status.hostId, HOST);
  assert.match(status.serverSpkiSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(status.serverSpkiSha256, status.memberIssuerSpkiSha256);
  assert.deepEqual(Object.keys(status), ["state", "hostId", "serverSpkiSha256", "memberIssuerSpkiSha256",
    "serverNotBefore", "serverNotAfter", "memberIssuerNotBefore", "memberIssuerNotAfter"]);
  assert.equal(Object.isFrozen(status), true);
  assert.doesNotMatch(JSON.stringify(status), /PRIVATE KEY|CERTIFICATE|approved|authorized|connected|ready/);
});

test("expired identities stay parseable for recovery but cannot be used silently", () => {
  const time = options.notAfter;
  assert.equal(validateSpsNativeHostIdentity(identity).hostId, HOST);
  assert.equal(inspectSpsNativeHostIdentity(identity, time).state, "identity_not_current");
  assert.throws(() => requireCurrentSpsNativeHostIdentity(identity, time), { code: "native_identity_not_current" });
  assert.throws(() => requireCurrentSpsNativeHostIdentity(identity, START - 1), { code: "native_identity_not_current" });
  assert.equal(requireCurrentSpsNativeHostIdentity(identity, START).hostId, HOST);
  for (const clock of [0, -1, NaN, Infinity, "1", null, 1.5]) {
    assert.throws(() => inspectSpsNativeHostIdentity(identity, clock), { code: "native_identity_invalid" });
  }
});

test("rejects swapped purpose, mismatched private keys, Host substitution and extra fields", () => {
  const mutations = [
    value => { [value.server, value.memberIssuer] = [value.memberIssuer, value.server]; },
    value => { value.server.privateKeyPem = other.server.privateKeyPem; },
    value => { value.memberIssuer.privateKeyPem = other.memberIssuer.privateKeyPem; },
    value => { value.hostId = "22222222-2222-4222-8222-222222222222"; },
    value => { value.extra = "secret"; }, value => { value.server.extra = true; },
    value => { value.memberIssuer = { ...value.server }; },
    value => { value.server.certificatePem += value.memberIssuer.certificatePem; },
    value => { value.server.certificatePem += "\n"; },
    value => { value.server.privateKeyPem += "hidden-value"; },
    value => { value.server.privateKeyPem = value.server.privateKeyPem.replaceAll("\n", "\r\n"); },
    value => { value.server.certificatePem = "X".repeat(8193); },
  ];
  for (const mutate of mutations) {
    const value = clone();
    mutate(value);
    assert.throws(() => validateSpsNativeHostIdentity(value), { code: "native_identity_invalid" });
  }
  let invoked = false;
  const accessor = clone();
  Object.defineProperty(accessor.server, "privateKeyPem", { enumerable: true, get() { invoked = true; throw new Error("private"); } });
  assert.throws(() => validateSpsNativeHostIdentity(accessor), { code: "native_identity_invalid" });
  assert.equal(invoked, false);
});

test("new server certificates satisfy the existing invitation verifier but CA certificates do not", () => {
  const encoded = invite(identity, "https://127.0.0.1:31311");
  assert.equal(verifySpsNativeInvitationCertificate(encoded, START + 1).spkiSha256,
    inspectSpsNativeHostIdentity(identity, START + 1).serverSpkiSha256);
  const issuer = new X509Certificate(identity.memberIssuer.certificatePem);
  assert.throws(() => verifySpsNativeInvitationCertificate(invite(identity, "https://127.0.0.1:31311", {
    serverCertificate: issuer.raw.toString("base64url"),
    spkiSha256: createHash("sha256").update(issuer.publicKey.export({ type: "spki", format: "der" })).digest("hex"),
  }), START + 1), { code: "native_server_certificate_invalid" });
});

test("generated credentials prove a real loopback TLS 1.3 handshake without sending pairing credentials", async t => {
  let applicationBytes = 0;
  const sockets = new Set();
  const server = createServer({
    key: identity.server.privateKeyPem, cert: identity.server.certificatePem,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
  }, socket => socket.on("data", data => { applicationBytes += data.length; }));
  server.on("tlsClientError", () => {});
  server.on("connection", socket => {
    sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket));
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject); server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const origin = `https://127.0.0.1:${server.address().port}`;
  const result = await probeSpsNativeServerTls(invite(identity, origin));
  assert.equal(result.state, "tls_peer_verified");
  assert.equal(applicationBytes, 0);
  await assert.rejects(probeSpsNativeServerTls(invite(other, origin)), { code: "native_connection_failed" });
  assert.equal(applicationBytes, 0);
});

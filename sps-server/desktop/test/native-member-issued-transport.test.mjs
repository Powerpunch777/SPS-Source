import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { connect, createServer } from "node:tls";
import test from "node:test";
import { createSpsNativeHostIdentity, inspectSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate, publicSpsNativeMemberEnrollmentRequest } from "../src/native-member-certificates.mjs";
import { createSpsNativeMemberPendingKeyStore } from "../src/native-member-pending-store.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function fixtureEncryption() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(value) {
      const nonce = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, nonce);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decryptString(value) {
      const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12));
      decipher.setAuthTag(value.subarray(12, 28));
      return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

async function withStoredCredential(action) {
  const temp = await realpath(os.tmpdir()), root = await mkdtemp(path.join(temp, "sps-issued-transport-"));
  const canonical = await realpath(root), original = await lstat(root, { bigint: true });
  try {
    const userDataDirectory = path.join(canonical, "user-data"), vaultDirectory = path.join(canonical, "vault");
    await mkdir(userDataDirectory); await mkdir(vaultDirectory);
    const now = Math.floor(Date.now() / 1000) * 1000;
    const host = await createSpsNativeHostIdentity({ hostId: randomUUID(), hostnames: ["127.0.0.1"],
      notBefore: now - 1000, notAfter: now + 300_000, issuerNotAfter: now + 600_000 });
    const details = inspectSpsNativeHostIdentity(host), deviceKeyId = randomUUID();
    const key = await createSpsNativeMemberKeyRequest({ hostId: host.hostId, deviceKeyId });
    const certificate = await issueSpsNativeMemberCertificate({ hostIdentity: host,
      request: await publicSpsNativeMemberEnrollmentRequest(key), notBefore: now, notAfter: now + 120_000, now });
    const context = { identityIssuer: "https://identity.example.test", subject: "fixture-member", hostId: host.hostId,
      deviceKeyId, serverSpkiSha256: details.serverSpkiSha256, issuerSpkiSha256: details.memberIssuerSpkiSha256 };
    const options = { userDataDirectory, vaultDirectory, context, safeStorage: fixtureEncryption(), platform: "win32" };
    const store = createSpsNativeMemberPendingKeyStore(options);
    await store.create(key);
    await store.createIssued({ enrollmentId: randomUUID(), certificate: new X509Certificate(certificate.certificatePem).raw.toString("base64url"),
      issuerCertificate: new X509Certificate(certificate.issuerCertificatePem).raw.toString("base64url"), expiresAt: new Date(now + 60_000).toISOString() });
    const reloaded = await createSpsNativeMemberPendingKeyStore(options).readIssued();
    assert.equal(reloaded.credential.privateKeyPem, key.privateKeyPem);
    await action({ host, now, options, reloaded, key });
  } finally {
    const current = await lstat(root, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(current.dev, original.dev); assert.equal(current.ino, original.ino); assert.equal(current.birthtimeNs, original.birthtimeNs);
    assert.equal(await realpath(root), canonical); assert.equal(path.dirname(canonical), temp);
    assert.ok(path.basename(canonical).startsWith("sps-issued-transport-"));
    await rm(canonical, { recursive: true });
  }
}

async function handshake(host, credential) {
  const sockets = new Set();
  const server = createServer({ key: host.server.privateKeyPem, cert: host.server.certificatePem,
    ca: host.memberIssuer.certificatePem, requestCert: true, rejectUnauthorized: true,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3", handshakeTimeout: 2000 });
  const observe = socket => { sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket)); };
  server.on("connection", observe);
  server.on("tlsClientError", () => {});
  let timer;
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const outcome = new Promise((resolve, reject) => {
      server.once("secureConnection", socket => resolve({ accepted: true, authorized: socket.authorized,
        resumed: socket.isSessionReused(), protocol: socket.getProtocol(), fingerprint: hash(socket.getPeerX509Certificate().raw) }));
      server.once("tlsClientError", () => resolve({ accepted: false }));
      timer = setTimeout(() => reject(new Error("Fixture TLS handshake timed out")), 3000);
    });
    const socket = connect({ host: "127.0.0.1", port: server.address().port,
      ca: host.server.certificatePem, cert: credential.certificatePem, key: credential.privateKeyPem,
      minVersion: "TLSv1.3", maxVersion: "TLSv1.3" });
    observe(socket);
    return await outcome;
  } finally {
    clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Fixture TLS cleanup timed out")), 3000);
      server.close(error => { clearTimeout(timeout); error ? reject(error) : resolve(); });
    });
  }
}

test("a reloaded issued companion uses the original key in a fresh authorized TLS 1.3 handshake", { timeout: 12_000 }, async () => {
  await withStoredCredential(async ({ host, reloaded }) => {
    assert.deepEqual(await handshake(host, reloaded.credential), { accepted: true, authorized: true, resumed: false,
      protocol: "TLSv1.3", fingerprint: hash(new X509Certificate(reloaded.credential.certificatePem).raw) });
  });
});

test("readable local credentials cannot authenticate to a newly prepared Host identity", { timeout: 12_000 }, async () => {
  await withStoredCredential(async ({ now, options, reloaded }) => {
    const fresh = await createSpsNativeHostIdentity({ hostId: randomUUID(), hostnames: ["127.0.0.1"],
      notBefore: now - 1000, notAfter: now + 300_000, issuerNotAfter: now + 600_000 });
    const details = inspectSpsNativeHostIdentity(fresh);
    assert.deepEqual(await handshake(fresh, reloaded.credential), { accepted: false });
    const changed = createSpsNativeMemberPendingKeyStore({ ...options, context: { ...options.context,
      serverSpkiSha256: details.serverSpkiSha256, issuerSpkiSha256: details.memberIssuerSpkiSha256 } });
    await assert.rejects(changed.readIssued(), { code: "ERR_SPS_NATIVE_MEMBER_PENDING_STORE_CORRUPT" });
    assert.ok(await createSpsNativeMemberPendingKeyStore(options).readIssued());
  });
});

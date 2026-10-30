import assert from "node:assert/strict";
import { randomUUID, X509Certificate } from "node:crypto";
import { createSpsNativeMemberKeyRequest, publicSpsNativeMemberEnrollmentRequest } from "../../src/native-member-certificates.mjs";
import { validateSpsNativeMemberCredential } from "../../src/native-member-credential.mjs";

const pending = new Map();
const coreClient = process.argv[2] ? (await import(process.argv[2])).createSpsNativeParentSignerClient(process) : null;
process.on("message", message => {
  if (message?.kind !== "sps.native.signer.response") return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id); clearTimeout(entry.timer);
  message.ok ? entry.resolve(message.result) : entry.reject(new Error("Fixture signing denied"));
});
function call(operation, payload) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Fixture IPC timed out")); }, 5000);
    pending.set(id, { resolve, reject, timer });
    process.send({ v: 1, kind: "sps.native.signer.request", id, operation, ...(payload ? { payload } : {}) });
  });
}
try {
  const details = coreClient ? await coreClient.inspect() : await call("inspect");
  const keyRequest = await createSpsNativeMemberKeyRequest({ hostId: details.hostId, deviceKeyId: randomUUID() });
  const request = await publicSpsNativeMemberEnrollmentRequest(keyRequest);
  const notBefore = Math.floor(Date.now() / 1000) * 1000;
  const payload = { hostId: details.hostId, serverSpkiSha256: details.serverSpkiSha256,
    issuerSpkiSha256: details.issuerSpkiSha256, deviceKeyId: request.deviceKeyId, requestPem: request.requestPem,
    notBefore, notAfter: notBefore + 60_000 };
  const signed = coreClient ? await coreClient.sign(payload) : await call("sign", payload);
  const issuerPem = new X509Certificate(Buffer.from(details.issuerCertificate, "base64url")).toString();
  const credential = await validateSpsNativeMemberCredential({ keyRequest,
    certificate: { v: 1, kind: "sps.native.member-certificate", hostId: details.hostId, deviceKeyId: request.deviceKeyId,
      certificatePem: new X509Certificate(Buffer.from(signed.certificate, "base64url")).toString(), issuerCertificatePem: issuerPem },
    issuerCertificatePem: issuerPem, issuerSpkiSha256: details.issuerSpkiSha256, now: Date.now() });
  assert.equal(credential.privateKeyPem, keyRequest.privateKeyPem);
  assert.deepEqual(Object.keys(signed).sort(), ["certificate", "requestSha256"]);
  console.log(JSON.stringify({ realChildIpc: true, coreClientUsed: Boolean(coreClient), receivedPublicOnly: true, signedCredentialMatchesChildKey: true }));
  coreClient?.dispose();
  process.disconnect();
} catch {
  console.error("native_signer_child_fixture_failed");
  coreClient?.dispose();
  process.exitCode = 1;
  process.disconnect();
}

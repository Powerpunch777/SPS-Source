import assert from "node:assert/strict";
import { randomBytes, randomUUID, X509Certificate } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Cross-repository protocol contract only. This script is never imported by Main.
if (process.argv.length !== 3 || process.argv[2] !== "--isolated-native-workspace-proof") {
  console.error("Use the explicit isolated Native Workspace proof contract command.");
  process.exit(2);
}

const { createSpsNativeHostIdentity } = await import("../src/native-identity-certificates.mjs");
const { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } = await import("../src/native-member-certificates.mjs");
const { createSpsNativeWorkspaceRequestSigner } = await import("../src/native-workspace-proof.mjs");

const coreRoot = path.resolve(import.meta.dirname, "../../../external/sps-core");
const loadCore = relative => import(pathToFileURL(path.join(coreRoot, relative)).href);
const { createSpsNativeWorkspaceProofVerifier } = await loadCore("server/src/services/sps-native-workspace-proof.ts");

const now = Math.floor(Date.now() / 1000) * 1000;
const hostId = randomUUID();
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const key = randomBytes(32);
const cookie = `sps_identity_session=${randomBytes(48).toString("base64url")}`;
const hostIdentity = await createSpsNativeHostIdentity({
  hostId,
  hostnames: ["127.0.0.1"],
  notBefore: now - 300_000,
  notAfter: now + 86_400_000,
  issuerNotAfter: now + 2 * 86_400_000,
});

async function issueMember({ issuedAt = now, notBefore = issuedAt - 1_000, notAfter = issuedAt + 60_000 } = {}) {
  const request = await createSpsNativeMemberKeyRequest({ hostId, deviceKeyId: randomUUID() });
  return issueSpsNativeMemberCertificate({ hostIdentity,
    request: { v: 1, kind: "sps.native.member-enrollment-request", hostId,
      deviceKeyId: request.deviceKeyId, requestPem: request.requestPem },
    now: issuedAt, notBefore, notAfter });
}

const member = await issueMember();
const clientDer = new X509Certificate(member.certificatePem).raw;
const serverDer = new X509Certificate(hostIdentity.server.certificatePem).raw;
const expired = await issueMember({ issuedAt: now - 120_000, notBefore: now - 180_000, notAfter: now - 60_000 });
const expiredDer = new X509Certificate(expired.certificatePem).raw;
const target = `/api/companies/${workspaceId}/workspace-shell`;
const body = Buffer.alloc(0);
const request = (overrides = {}) => ({ method: "GET", target, body, cookie,
  contentType: "", ...overrides });
const current = { value: true };
const signer = createSpsNativeWorkspaceRequestSigner({ hostId, key, now: () => now,
  assertCurrent() { if (!current.value) throw new Error("stale account"); } });
const verifier = createSpsNativeWorkspaceProofVerifier({ hostId, key, now: () => now,
  assertCurrent() { if (!current.value) throw new Error("stale account"); } });
const signerFor = (options = {}) => createSpsNativeWorkspaceRequestSigner({ hostId, key, now: () => now,
  assertCurrent() {}, ...options });
const sign = (activeSigner = signer, options = {}) => activeSigner.signWorkspaceRequest({
  workspaceId, method: "GET", target, body, cookie, contentType: "",
  peerCertificateDer: clientDer, ...options,
});
const expectReject = fn => assert.throws(fn, /Native Workspace request proof is unavailable\./);
const expectSignerReject = fn => assert.throws(fn, /SPS Native Workspace request signing is unavailable\./);

const success = verifier.verify(sign(), request());
assert.equal(success.hostId, hostId);
assert.equal(success.workspaceId, workspaceId);
assert.deepEqual(success.peerCertificateDer, clientDer);
const returnedCertificate = success.peerCertificateDer;
returnedCertificate.fill(0);
assert.deepEqual(success.peerCertificateDer, clientDer, "Core returns a defensive DER copy");

for (const actual of [
  request({ cookie: `sps_identity_session=${"b".repeat(64)}` }),
  request({ target: `/api/companies/${workspaceId}/other` }),
  request({ method: "PATCH" }),
  request({ contentType: "application/json" }),
  request({ body: Buffer.from("different") }),
]) {
  expectReject(() => verifier.verify(sign(), actual));
}

const alterSignedClaim = (header, index, value) => {
  const [payload, mac] = header.split(".");
  const fields = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  fields[index] = value;
  return `${Buffer.from(JSON.stringify(fields)).toString("base64url")}.${mac}`;
};
const validHeader = sign();
expectReject(() => verifier.verify(alterSignedClaim(validHeader, 1, randomUUID()), request()));
expectReject(() => verifier.verify(alterSignedClaim(validHeader, 2, otherWorkspaceId), request()));
const otherHostSigner = signerFor({ hostId: randomUUID() });
expectReject(() => verifier.verify(sign(otherHostSigner), request()));
otherHostSigner.dispose();

const wrongKeyVerifier = createSpsNativeWorkspaceProofVerifier({ hostId, key: randomBytes(32), now: () => now,
  assertCurrent() {} });
expectReject(() => wrongKeyVerifier.verify(sign(), request()));
wrongKeyVerifier.dispose();

const oldSigner = signerFor({ now: () => now - 31_000 });
expectReject(() => verifier.verify(sign(oldSigner), request()));
oldSigner.dispose();

const replayHeader = sign();
verifier.verify(replayHeader, request());
expectReject(() => verifier.verify(replayHeader, request()));

expectReject(() => verifier.verify(sign(signer, { peerCertificateDer: expiredDer }), request()));
expectReject(() => verifier.verify(sign(signer, { peerCertificateDer: serverDer }), request()));

current.value = false;
expectSignerReject(() => sign());
expectReject(() => verifier.verify(validHeader, request()));
current.value = true;
signer.dispose();
verifier.dispose();
expectSignerReject(() => sign());
const finalSigner = signerFor();
const finalHeader = sign(finalSigner);
expectReject(() => verifier.verify(finalHeader, request()));
finalSigner.dispose();

console.log("Native Workspace proof contract passed: Main signer, Core verifier, real client/server certificates, and rejection cases.");

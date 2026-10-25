import assert from "node:assert/strict";
import { randomUUID, X509Certificate } from "node:crypto";
import { before, test } from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, publicSpsNativeMemberEnrollmentRequest } from "../src/native-member-certificates.mjs";
import { validateSpsNativeMemberCredential } from "../src/native-member-credential.mjs";
import { createSpsNativeMemberMainSigner } from "../src/native-member-main-signer.mjs";

let identity, keyRequest, request;
const at = Math.floor(Date.now() / 1000) * 1000;
before(async () => {
  identity = await createSpsNativeHostIdentity({ hostId: randomUUID(), hostnames: ["127.0.0.1"], notBefore: at,
    notAfter: at + 86_400_000, issuerNotAfter: at + 2 * 86_400_000 });
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: identity.hostId, deviceKeyId: randomUUID() });
  request = await publicSpsNativeMemberEnrollmentRequest(keyRequest);
});
function setup(overrides = {}) {
  let current = { ownerSubject: "fixture-owner", userDataDirectory: "fixture-userdata", vaultDirectory: "fixture-vault", generation: 0n };
  let stored = identity, auth = 0, reads = 0;
  const signer = createSpsNativeMemberMainSigner({ getAuthority: () => current,
    authenticateHost: async () => { auth++; }, getStore: () => ({ read: async () => { reads++; return stored; } }), ...overrides });
  return { signer, setAuthority: value => { current = value; }, authority: () => current, setIdentity: value => { stored = value; }, counts: () => ({ auth, reads }) };
}
const input = details => ({ hostId: details.hostId, serverSpkiSha256: details.serverSpkiSha256,
  issuerSpkiSha256: details.issuerSpkiSha256, deviceKeyId: request.deviceKeyId, requestPem: request.requestPem,
  notBefore: at, notAfter: at + 60_000 });

test("Main signs only after inspection and returns only the public request-bound certificate", async () => {
  const value = setup();
  await assert.rejects(value.signer.sign({}), { code: "native_signer_unavailable" });
  const details = await value.signer.inspect();
  assert.deepEqual(Object.keys(details).sort(), ["hostId", "issuerCertificate", "issuerSpkiSha256", "serverSpkiSha256"]);
  const result = await value.signer.sign(input(details));
  assert.deepEqual(Object.keys(result).sort(), ["certificate", "requestSha256"]);
  const credential = await validateSpsNativeMemberCredential({ keyRequest,
    certificate: { v: 1, kind: "sps.native.member-certificate", hostId: details.hostId, deviceKeyId: request.deviceKeyId,
      certificatePem: new X509Certificate(Buffer.from(result.certificate, "base64url")).toString(),
      issuerCertificatePem: identity.memberIssuer.certificatePem },
    issuerCertificatePem: identity.memberIssuer.certificatePem, issuerSpkiSha256: details.issuerSpkiSha256, now: Date.now() });
  assert.equal(credential.privateKeyPem, keyRequest.privateKeyPem);
  for (const secret of [identity.server.privateKeyPem, identity.memberIssuer.privateKeyPem, keyRequest.privateKeyPem, "fixture-owner", "fixture-vault"])
    assert.ok(!JSON.stringify({ details, result }).includes(secret));
  assert.deepEqual(value.counts(), { auth: 3, reads: 3 });
});

test("Main refuses wrong Host/pins/device/CSR purpose and never invokes input accessors", async () => {
  const value = setup(), details = await value.signer.inspect();
  for (const patch of [{ hostId: randomUUID() }, { serverSpkiSha256: "b".repeat(64) }, { issuerSpkiSha256: "c".repeat(64) },
    { deviceKeyId: randomUUID() }, { requestPem: request.requestPem.replace("REQUEST", "KEY") }, { privateKeyPem: keyRequest.privateKeyPem }]) {
    await assert.rejects(value.signer.sign({ ...input(details), ...patch }), { code: "native_signer_unavailable" });
  }
  let invoked = false;
  const hostile = Object.defineProperty({ ...input(details) }, "requestPem", { enumerable: true, get() { invoked = true; throw new Error("fixture secret"); } });
  await assert.rejects(value.signer.sign(hostile), { code: "native_signer_unavailable" });
  assert.equal(invoked, false);
});

test("Main refuses restored, changed-account, changed-generation and disposed authority", async () => {
  const value = setup(), details = await value.signer.inspect(), original = value.authority();
  for (const current of [null, { ...original, ownerSubject: "other-owner" }, { ...original, vaultDirectory: "other-vault" }, { ...original, generation: 1n }]) {
    value.setAuthority(current);
    await assert.rejects(value.signer.sign(input(details)), { code: "native_signer_unavailable" });
  }
  value.setAuthority(original); value.signer.dispose();
  await assert.rejects(value.signer.inspect(), { code: "native_signer_unavailable" });
  await assert.rejects(value.signer.sign(input(details)), { code: "native_signer_unavailable" });
});

test("Main detects identity replacement even when the account and Vault path stay unchanged", async () => {
  const value = setup(), details = await value.signer.inspect();
  value.setIdentity(null);
  await assert.rejects(value.signer.sign(input(details)), { code: "native_signer_unavailable" });
});

test("authority changes during async authentication withhold signing and redact errors", async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  let wait = false;
  const value = setup({ authenticateHost: async () => { if (wait) await held; } });
  const details = await value.signer.inspect(); wait = true;
  const result = value.signer.sign(input(details));
  value.setAuthority({ ...value.authority(), generation: 1n }); release();
  await assert.rejects(result, { code: "native_signer_unavailable" });
  const bad = setup({ authenticateHost: async () => { throw new Error(identity.memberIssuer.privateKeyPem); } });
  await assert.rejects(bad.signer.inspect(), error => error.code === "native_signer_unavailable" && !error.message.includes("PRIVATE KEY") && error.cause === undefined);
});

test("abort after asynchronous signing cannot publish a certificate", async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  let started; const begun = new Promise(resolve => { started = resolve; });
  const value = setup({ issueCertificate: async () => { started(); await held; return { certificatePem: identity.server.certificatePem }; } });
  const details = await value.signer.inspect(), controller = new AbortController();
  const result = value.signer.sign(input(details), { signal: controller.signal });
  await begun; controller.abort(); release();
  await assert.rejects(result, { code: "native_signer_unavailable" });
});

test("post-crypto storage and account-generation changes withhold a completed result", async () => {
  for (const change of [value => value.setIdentity(null), value => value.setAuthority({ ...value.authority(), generation: 2n })]) {
    let release, started;
    const held = new Promise(resolve => { release = resolve; });
    const begun = new Promise(resolve => { started = resolve; });
    const value = setup({ issueCertificate: async () => { started(); await held; return { certificatePem: identity.server.certificatePem }; } });
    const details = await value.signer.inspect();
    const outcome = value.signer.sign(input(details)).then(() => ({ passed: true }), error => ({ passed: false, error }));
    await begun;
    change(value);
    release();
    const result = await outcome;
    assert.equal(result.passed, false);
    assert.equal(result.error.code, "native_signer_unavailable");
  }
});

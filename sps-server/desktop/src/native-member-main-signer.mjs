import { createHash, X509Certificate } from "node:crypto";
import { inspectSpsNativeHostIdentity, requireCurrentSpsNativeHostIdentity } from "./native-identity-certificates.mjs";
import { issueSpsNativeMemberCertificate } from "./native-member-certificates.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid, nativeCertificateDate as date } from "./native-certificate-primitives.mjs";

const unavailable = () => Object.assign(new Error("The Native Host signing channel is unavailable."), { code: "native_signer_unavailable" });
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const AUTHORITY_FIELDS = ["ownerSubject", "userDataDirectory", "vaultDirectory", "generation"];
const SIGN_FIELDS = ["hostId", "serverSpkiSha256", "issuerSpkiSha256", "deviceKeyId", "requestPem", "notBefore", "notAfter"];

function authority(input) {
  const value = record(input, AUTHORITY_FIELDS);
  if (AUTHORITY_FIELDS.slice(0, 3).some(key => typeof value[key] !== "string" || !value[key])
    || typeof value.generation !== "bigint" || value.generation < 0n) throw unavailable();
  return Object.freeze(value);
}

// One instance per directly owned Core child. Not a renderer/SDK/HTTP authority.
// There is no generation, replacement, key export or general-purpose signing API.
export function createSpsNativeMemberMainSigner({ getAuthority, authenticateHost, getStore, now = Date.now, issueCertificate = issueSpsNativeMemberCertificate }) {
  if ([getAuthority, authenticateHost, getStore, now, issueCertificate].some(value => typeof value !== "function")) throw unavailable();
  let binding = null;
  let disposed = false;
  function check(expected, signal) {
    if (disposed || signal?.aborted) throw unavailable();
    const current = authority(getAuthority());
    if (AUTHORITY_FIELDS.some(key => current[key] !== expected[key])) throw unavailable();
  }
  async function readCurrent(expected, signal) {
    check(expected, signal);
    await authenticateHost();
    check(expected, signal);
    const identity = requireCurrentSpsNativeHostIdentity(await getStore(expected).read(), now());
    check(expected, signal);
    const details = inspectSpsNativeHostIdentity(identity, now());
    const publicIdentity = Object.freeze({ hostId: identity.hostId, serverSpkiSha256: details.serverSpkiSha256,
      issuerSpkiSha256: details.memberIssuerSpkiSha256,
      issuerCertificate: new X509Certificate(identity.memberIssuer.certificatePem).raw.toString("base64url") });
    if (binding && (AUTHORITY_FIELDS.some(key => binding.authority[key] !== expected[key])
      || Object.keys(publicIdentity).some(key => binding.publicIdentity[key] !== publicIdentity[key]))) throw unavailable();
    return { identity, publicIdentity };
  }
  return Object.freeze({
    async inspect({ signal } = {}) {
      try {
        if (signal !== undefined && !(signal instanceof AbortSignal)) throw unavailable();
        const expected = authority(getAuthority());
        const { publicIdentity } = await readCurrent(expected, signal);
        binding ??= Object.freeze({ authority: expected, publicIdentity });
        check(expected, signal);
        return publicIdentity;
      } catch { throw unavailable(); }
    },
    async sign(input, { signal } = {}) {
      try {
        if (!binding || signal !== undefined && !(signal instanceof AbortSignal)) throw unavailable();
        const value = record(input, SIGN_FIELDS);
        uuid(value.hostId); uuid(value.deviceKeyId); date(value.notBefore); date(value.notAfter);
        if (value.hostId !== binding.publicIdentity.hostId || value.serverSpkiSha256 !== binding.publicIdentity.serverSpkiSha256
          || value.issuerSpkiSha256 !== binding.publicIdentity.issuerSpkiSha256
          || typeof value.requestPem !== "string" || value.requestPem.length > 3000
          || value.notAfter - value.notBefore > 90 * 86_400_000) throw unavailable();
        const expected = binding.authority;
        const { identity } = await readCurrent(expected, signal);
        const issued = await issueCertificate({ hostIdentity: identity,
          request: { v: 1, kind: "sps.native.member-enrollment-request", hostId: value.hostId, deviceKeyId: value.deviceKeyId, requestPem: value.requestPem },
          notBefore: value.notBefore, notAfter: value.notAfter, now: now() });
        check(expected, signal);
        // Re-read storage after asynchronous crypto: a changed/removed identity
        // cannot publish even when the original in-memory key could still sign.
        await readCurrent(expected, signal);
        check(expected, signal);
        return Object.freeze({ certificate: new X509Certificate(issued.certificatePem).raw.toString("base64url"), requestSha256: hash(value.requestPem) });
      } catch { throw unavailable(); }
    },
    dispose() { disposed = true; binding = null; },
  });
}

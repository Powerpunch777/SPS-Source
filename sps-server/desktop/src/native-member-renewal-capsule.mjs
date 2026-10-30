import { X509Certificate } from "node:crypto";
import { createSpsNativeMemberIssuedCapsule } from "./native-member-issued-capsule.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

const KIND = "sps.native.member-renewal-capsule";
const INNER_KIND = "sps.native.member-renewal";
const RESPONSE_KEYS = ["renewalId", "deviceId", "predecessorCertificateSha256", "certificate", "issuerCertificate", "certificateNotBefore", "certificateNotAfter"];
const OUTER_KEYS = ["v", "kind", "ciphertext"];
const INNER_KEYS = ["v", "kind", "context", "response", "issuedCapsule"];
const MAX_BYTES = 96 * 1024;
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const invalid = () => Object.assign(new Error("The Native Member renewal capsule is invalid or does not match the expected context."),
  { code: "ERR_SPS_NATIVE_MEMBER_RENEWAL_CAPSULE_INVALID" });

function method(target, name) {
  for (let current = target; current != null; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return Object.hasOwn(descriptor, "value") && typeof descriptor.value === "function" ? descriptor.value : null;
  }
  return null;
}

function der(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 5500) throw new Error("der");
  const bytes = Buffer.from(value, "base64url");
  if (!bytes.length || bytes.length > 4096 || bytes.toString("base64url") !== value) throw new Error("der");
  return value;
}

function iso(value) {
  if (typeof value !== "string" || value.length !== 24) throw new Error("date");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new Error("date");
  return value;
}

export function validateSpsNativeMemberRenewalResponse(input) {
  const value = record(input, RESPONSE_KEYS);
  uuid(value.renewalId); uuid(value.deviceId);
  if (typeof value.predecessorCertificateSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.predecessorCertificateSha256)) throw new Error("hash");
  const certificate = der(value.certificate), issuerCertificate = der(value.issuerCertificate);
  const certificateNotBefore = iso(value.certificateNotBefore), certificateNotAfter = iso(value.certificateNotAfter);
  if (Date.parse(certificateNotBefore) >= Date.parse(certificateNotAfter)) throw new Error("dates");
  return Object.freeze({ renewalId: value.renewalId, deviceId: value.deviceId,
    predecessorCertificateSha256: value.predecessorCertificateSha256, certificate, issuerCertificate,
    certificateNotBefore, certificateNotAfter });
}

function validateProjection(response, issuance, credential) {
  if (response.certificate !== issuance.certificate || response.issuerCertificate !== issuance.issuerCertificate) throw new Error("certificate");
  const leaf = new X509Certificate(credential.certificatePem), issuer = new X509Certificate(credential.issuerCertificatePem);
  if (new Date(leaf.validFrom).toISOString() !== response.certificateNotBefore
    || new Date(leaf.validTo).toISOString() !== response.certificateNotAfter
    || issuer.publicKey.asymmetricKeyType !== "ec") throw new Error("dates");
}

function decodeCiphertext(value) {
  if (typeof value !== "string" || !value.length || value.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("base64");
  const bytes = Buffer.from(value, "base64");
  if (!bytes.length || bytes.length > MAX_CIPHERTEXT_BYTES || bytes.toString("base64") !== value) throw new Error("base64");
  return bytes;
}

function parseOuter(serialized) {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized) > MAX_BYTES) throw new Error("size");
  const value = record(JSON.parse(serialized), OUTER_KEYS);
  if (value.v !== 1 || value.kind !== KIND || typeof value.ciphertext !== "string") throw new Error("outer");
  if (JSON.stringify({ v: 1, kind: KIND, ciphertext: value.ciphertext }) !== serialized) throw new Error("canonical");
  return decodeCiphertext(value.ciphertext);
}

export function createSpsNativeMemberRenewalCapsule(options) {
  let safeStorage, platform;
  try {
    const value = record(options, Object.hasOwn(options ?? {}, "platform") ? ["safeStorage", "platform"] : ["safeStorage"]);
    safeStorage = value.safeStorage; platform = value.platform ?? process.platform;
    if (platform !== "win32") throw new Error("platform");
  } catch { throw Object.assign(new Error("Native Member renewal capsules are supported only on Windows."), { code: "ERR_SPS_NATIVE_MEMBER_RENEWAL_CAPSULE_OPTIONS" }); }
  const encrypt = method(safeStorage, "encryptString"), decrypt = method(safeStorage, "decryptString"), available = method(safeStorage, "isEncryptionAvailable");
  try { if (!encrypt || !decrypt || !available || available.call(safeStorage) !== true) throw new Error("encryption"); }
  catch { throw Object.assign(new Error("Windows Native Member renewal capsule encryption is unavailable."), { code: "ERR_SPS_NATIVE_MEMBER_RENEWAL_CAPSULE_ENCRYPTION_UNAVAILABLE" }); }
  const issued = createSpsNativeMemberIssuedCapsule({ safeStorage, platform });
  async function seal(input, historical = false) {
    try {
      const value = record(input, ["context", "keyRequest", "baseIssuance", "response"]);
      const context = validateSpsNativeMemberPendingContext(value.context), response = validateSpsNativeMemberRenewalResponse(value.response);
      const issuance = Object.freeze({ enrollmentId: value.baseIssuance.enrollmentId, expiresAt: value.baseIssuance.expiresAt,
        certificate: response.certificate, issuerCertificate: response.issuerCertificate });
      const issuedCapsule = await issued.seal({ context, keyRequest: value.keyRequest, issuance });
      if (historical) await issued.openHistorical(issuedCapsule, context, value.keyRequest);
      const plaintext = JSON.stringify({ v: 1, kind: INNER_KIND, context, response, issuedCapsule });
      if (Buffer.byteLength(plaintext) > MAX_BYTES - 128) throw new Error("size");
      const encrypted = encrypt.call(safeStorage, plaintext);
      if (!(Buffer.isBuffer(encrypted) || encrypted instanceof Uint8Array) || !encrypted.length || encrypted.length > MAX_CIPHERTEXT_BYTES) throw new Error("ciphertext");
      const serialized = JSON.stringify({ v: 1, kind: KIND, ciphertext: Buffer.from(encrypted).toString("base64") });
      if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error("size");
      return serialized;
    } catch { throw invalid(); }
  }
  async function open(serialized, expectedInput, keyRequest, historical = false) {
    try {
      const expected = validateSpsNativeMemberPendingContext(expectedInput);
      const plaintext = decrypt.call(safeStorage, parseOuter(serialized));
      if (typeof plaintext !== "string" || Buffer.byteLength(plaintext) > MAX_BYTES - 128) throw new Error("size");
      const value = record(JSON.parse(plaintext), INNER_KEYS);
      if (value.v !== 1 || value.kind !== INNER_KIND || JSON.stringify(value.context) !== JSON.stringify(expected)) throw new Error("context");
      const response = validateSpsNativeMemberRenewalResponse(value.response);
      if (JSON.stringify({ v: 1, kind: INNER_KIND, context: expected, response, issuedCapsule: value.issuedCapsule }) !== plaintext) throw new Error("canonical");
      const result = historical ? await issued.openHistorical(value.issuedCapsule, expected, keyRequest) : await issued.open(value.issuedCapsule, expected, keyRequest);
      validateProjection(response, result.issuance, result.credential);
      return Object.freeze({ response, issuance: result.issuance, credential: result.credential });
    } catch { throw invalid(); }
  }
  return Object.freeze({
    async seal(input) { return seal(input); },
    async open(serialized, context, keyRequest) { return open(serialized, context, keyRequest); },
    async openHistorical(serialized, context, keyRequest) { return open(serialized, context, keyRequest, true); },
  });
}

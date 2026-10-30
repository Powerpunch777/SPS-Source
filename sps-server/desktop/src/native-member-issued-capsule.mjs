import { X509Certificate } from "node:crypto";
import {
  validateSpsNativeMemberPendingContext,
} from "./native-member-pending-capsule.mjs";
import { validateSpsNativeMemberCredential } from "./native-member-credential.mjs";
import {
  nativeCertificateRecord as record,
  nativeCertificateUuid as uuid,
  encodeNativeCertificatePem as encodePem,
} from "./native-certificate-primitives.mjs";

const KIND = "sps.native.member-issued-capsule";
const INNER_KIND = "sps.native.member-issued";
const ISSUANCE_KEYS = ["enrollmentId", "certificate", "issuerCertificate", "expiresAt"];
const OUTER_KEYS = ["v", "kind", "ciphertext"];
const INNER_KEYS = ["v", "kind", "context", "issuance"];
const MAX_PLAINTEXT_BYTES = 32 * 1024;
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 96 * 1024;
const MAX_DER_BYTES = 4096;
const ERRORS = Object.freeze({
  options: ["ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_OPTIONS", "Native Member issued capsule options are invalid."],
  platform: ["ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_UNSUPPORTED_PLATFORM", "Native Member issued capsules are supported only on Windows."],
  encryption: ["ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_ENCRYPTION_UNAVAILABLE", "Windows Native Member issued capsule encryption is unavailable."],
  invalid: ["ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_INVALID", "The Native Member issued capsule is invalid or does not match the expected context."],
});
const failure = type => Object.assign(new Error(ERRORS[type][1]), { code: ERRORS[type][0] });

function optionalOptions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("options");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => typeof key !== "string" || !["safeStorage", "platform"].includes(key))
    || !descriptors.safeStorage?.enumerable || !Object.hasOwn(descriptors.safeStorage, "value")
    || (descriptors.platform && (!descriptors.platform.enumerable || !Object.hasOwn(descriptors.platform, "value")))) {
    throw new Error("options");
  }
  return {
    safeStorage: descriptors.safeStorage.value,
    platform: descriptors.platform ? descriptors.platform.value : process.platform,
  };
}

function method(target, name) {
  if (target === null || !["object", "function"].includes(typeof target)) return null;
  for (let current = target; current !== null; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor) return Object.hasOwn(descriptor, "value") && typeof descriptor.value === "function"
      ? descriptor.value : null;
  }
  return null;
}

function decodeDer(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > Math.ceil(MAX_DER_BYTES * 4 / 3)
    || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("der");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length === 0 || bytes.length > MAX_DER_BYTES || bytes.toString("base64url") !== value) throw new Error("der");
  return bytes;
}

function validateIssuance(input) {
  const value = record(input, ISSUANCE_KEYS);
  uuid(value.enrollmentId);
  const certificate = decodeDer(value.certificate);
  const issuerCertificate = decodeDer(value.issuerCertificate);
  if (typeof value.expiresAt !== "string" || value.expiresAt.length > 24) throw new Error("date");
  const expiry = new Date(value.expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== value.expiresAt) throw new Error("date");
  return Object.freeze({
    enrollmentId: value.enrollmentId,
    certificate: certificate.toString("base64url"),
    issuerCertificate: issuerCertificate.toString("base64url"),
    expiresAt: value.expiresAt,
  });
}

function pem(bytes) {
  return encodePem(bytes, "CERTIFICATE");
}

function historicalValidationTime(certificatePem, issuerCertificatePem) {
  const leaf = new X509Certificate(certificatePem), issuer = new X509Certificate(issuerCertificatePem);
  const start = Math.max(Date.parse(leaf.validFrom), Date.parse(issuer.validFrom));
  const end = Math.min(Date.parse(leaf.validTo), Date.parse(issuer.validTo));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error("dates");
  return Math.min(Math.max(Date.now(), start), end - 1);
}

async function validateCredential(context, keyRequest, issuance, historical = false) {
  const issuerCertificatePem = pem(decodeDer(issuance.issuerCertificate));
  const certificate = Object.freeze({
    v: 1,
    kind: "sps.native.member-certificate",
    hostId: context.hostId,
    deviceKeyId: context.deviceKeyId,
    certificatePem: pem(decodeDer(issuance.certificate)),
    issuerCertificatePem,
  });
  const validationAt = historical ? historicalValidationTime(certificate.certificatePem, issuerCertificatePem) : Date.now();
  const credential = await validateSpsNativeMemberCredential({
    keyRequest,
    certificate,
    issuerCertificatePem,
    issuerSpkiSha256: context.issuerSpkiSha256,
    now: validationAt,
  });
  const checkedAt = historical ? validationAt : Date.now();
  const leaf = new X509Certificate(credential.certificatePem);
  const issuer = new X509Certificate(credential.issuerCertificatePem);
  const leafNotBefore = Date.parse(leaf.validFrom), leafNotAfter = Date.parse(leaf.validTo);
  const issuerNotBefore = Date.parse(issuer.validFrom), issuerNotAfter = Date.parse(issuer.validTo);
  if (![leafNotBefore, leafNotAfter, issuerNotBefore, issuerNotAfter].every(Number.isFinite)
    || leafNotBefore > checkedAt || leafNotAfter <= checkedAt
    || issuerNotBefore > checkedAt || issuerNotAfter <= checkedAt) throw new Error("expired");
  return credential;
}

function canonicalOuter(serialized) {
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) throw new Error("size");
  const value = record(JSON.parse(serialized), OUTER_KEYS);
  if (value.v !== 1 || value.kind !== KIND || typeof value.ciphertext !== "string") throw new Error("outer");
  const canonical = JSON.stringify({ v: 1, kind: KIND, ciphertext: value.ciphertext });
  if (canonical !== serialized) throw new Error("canonical");
  return value.ciphertext;
}

function decodeCiphertext(encoded) {
  if (!encoded.length || encoded.length > Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("base64");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_CIPHERTEXT_BYTES || bytes.toString("base64") !== encoded) throw new Error("base64");
  return bytes;
}

function canonicalInner(plaintext) {
  if (typeof plaintext !== "string" || Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) throw new Error("size");
  const value = record(JSON.parse(plaintext), INNER_KEYS);
  if (value.v !== 1 || value.kind !== INNER_KIND) throw new Error("inner");
  return {
    context: validateSpsNativeMemberPendingContext(value.context),
    issuance: validateIssuance(value.issuance),
  };
}

// Context pins are trusted caller scope, not values adopted from the certificate response.
export function createSpsNativeMemberIssuedCapsule(options) {
  let config;
  try { config = optionalOptions(options); } catch { throw failure("options"); }
  if (config.platform !== "win32") throw failure("platform");
  let available, encrypt, decrypt;
  try {
    available = method(config.safeStorage, "isEncryptionAvailable");
    encrypt = method(config.safeStorage, "encryptString");
    decrypt = method(config.safeStorage, "decryptString");
    if (!available || !encrypt || !decrypt || available.call(config.safeStorage) !== true) throw new Error("encryption");
  } catch { throw failure("encryption"); }

  return Object.freeze({
    async seal(input) {
      try {
        const value = record(input, ["context", "keyRequest", "issuance"]);
        const context = validateSpsNativeMemberPendingContext(value.context);
        const issuance = validateIssuance(value.issuance);
        await validateCredential(context, value.keyRequest, issuance);
        const plaintext = JSON.stringify({ v: 1, kind: INNER_KIND, context, issuance });
        if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) throw new Error("size");
        const encrypted = encrypt.call(config.safeStorage, plaintext);
        if (!(Buffer.isBuffer(encrypted) || encrypted instanceof Uint8Array)
          || encrypted.byteLength === 0 || encrypted.byteLength > MAX_CIPHERTEXT_BYTES) throw new Error("ciphertext");
        const serialized = JSON.stringify({ v: 1, kind: KIND, ciphertext: Buffer.from(encrypted).toString("base64") });
        if (Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) throw new Error("size");
        return serialized;
      } catch { throw failure("invalid"); }
    },
    async open(serialized, expectedInput, keyRequest) {
      try {
        const expectedContext = validateSpsNativeMemberPendingContext(expectedInput);
        const encrypted = decodeCiphertext(canonicalOuter(serialized));
        const plaintext = decrypt.call(config.safeStorage, encrypted);
        const parsed = canonicalInner(plaintext);
        if (JSON.stringify(parsed.context) !== JSON.stringify(expectedContext)) throw new Error("context");
        const credential = await validateCredential(parsed.context, keyRequest, parsed.issuance);
        const canonical = JSON.stringify({ v: 1, kind: INNER_KIND, ...parsed });
        if (canonical !== plaintext) throw new Error("canonical");
        return Object.freeze({ issuance: parsed.issuance, credential });
      } catch { throw failure("invalid"); }
    },
    // Historical credentials are only used to validate an append-only renewal
    // chain. Operational callers must use open(), which requires current dates.
    async openHistorical(serialized, expectedInput, keyRequest) {
      try {
        const expectedContext = validateSpsNativeMemberPendingContext(expectedInput);
        const encrypted = decodeCiphertext(canonicalOuter(serialized));
        const plaintext = decrypt.call(config.safeStorage, encrypted);
        const parsed = canonicalInner(plaintext);
        if (JSON.stringify(parsed.context) !== JSON.stringify(expectedContext)) throw new Error("context");
        const credential = await validateCredential(parsed.context, keyRequest, parsed.issuance, true);
        const canonical = JSON.stringify({ v: 1, kind: INNER_KIND, ...parsed });
        if (canonical !== plaintext) throw new Error("canonical");
        return Object.freeze({ issuance: parsed.issuance, credential });
      } catch { throw failure("invalid"); }
    },
  });
}

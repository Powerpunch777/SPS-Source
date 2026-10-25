const SPS_NATIVE_INVITE_PREFIX = "SPSLAN2-";
const MAX_NATIVE_INVITE_CODE_LENGTH = 8192;
const MAX_SERVER_CERTIFICATE_BYTES = 4096;
const MAX_SERVER_CERTIFICATE_LENGTH = 5462;
const NATIVE_INVITE_KEYS = Object.freeze([
  "v",
  "kind",
  "hostId",
  "origin",
  "spkiSha256",
  "serverCertificate",
  "pairingId",
  "pairingSecret",
  "issuedAt",
  "expiresAt",
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SPKI_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

// This is an untrusted invitation codec, not TLS, pairing, or device authentication.
// The certificate is opaque public DER here: X.509 parsing, pin matching, validity-time
// and authority checks, trusted transfer, and server-side expiry/one-time use remain
// prerequisites. A valid code is not proof of an authenticated server or approved device.

function requirePlainDataRecord(record) {
  if (record === null || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("Invalid record");
  }

  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Invalid record");

  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length !== NATIVE_INVITE_KEYS.length) throw new TypeError("Invalid record");
  for (const key of ownKeys) {
    if (typeof key !== "string" || !NATIVE_INVITE_KEYS.includes(key)) throw new TypeError("Invalid record");
  }

  const values = Object.create(null);
  for (const key of NATIVE_INVITE_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) {
      throw new TypeError("Invalid record");
    }
    values[key] = descriptor.value;
  }
  return values;
}

function validatePrimitives(record) {
  if (record.v !== 2 || record.kind !== "sps.native-lan.pairing") throw new TypeError("Invalid record");
  if (typeof record.hostId !== "string" || !UUID_PATTERN.test(record.hostId)) throw new TypeError("Invalid record");
  if (typeof record.origin !== "string" || record.origin.length > MAX_NATIVE_INVITE_CODE_LENGTH) {
    throw new TypeError("Invalid record");
  }
  if (typeof record.spkiSha256 !== "string" || !SPKI_SHA256_PATTERN.test(record.spkiSha256)) {
    throw new TypeError("Invalid record");
  }
  if (
    typeof record.serverCertificate !== "string" ||
    record.serverCertificate.length === 0 ||
    record.serverCertificate.length > MAX_SERVER_CERTIFICATE_LENGTH ||
    !BASE64URL_PATTERN.test(record.serverCertificate)
  ) {
    throw new TypeError("Invalid record");
  }
  const serverCertificate = Buffer.from(record.serverCertificate, "base64url");
  if (
    serverCertificate.length === 0 ||
    serverCertificate.length > MAX_SERVER_CERTIFICATE_BYTES ||
    serverCertificate.toString("base64url") !== record.serverCertificate
  ) {
    throw new TypeError("Invalid record");
  }
  if (typeof record.pairingId !== "string" || !UUID_PATTERN.test(record.pairingId)) {
    throw new TypeError("Invalid record");
  }
  if (
    typeof record.pairingSecret !== "string" ||
    record.pairingSecret.length !== 43 ||
    !BASE64URL_PATTERN.test(record.pairingSecret)
  ) {
    throw new TypeError("Invalid record");
  }
  if (typeof record.issuedAt !== "number" || !Number.isSafeInteger(record.issuedAt) || record.issuedAt <= 0) {
    throw new TypeError("Invalid record");
  }
  if (typeof record.expiresAt !== "number" || !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= 0) {
    throw new TypeError("Invalid record");
  }
  if (record.expiresAt <= record.issuedAt) throw new TypeError("Invalid record");

  const secret = Buffer.from(record.pairingSecret, "base64url");
  if (secret.length !== 32 || secret.toString("base64url") !== record.pairingSecret) {
    throw new TypeError("Invalid record");
  }
}

function validateCanonicalOrigin(origin) {
  if (/\s|\\/.test(origin)) throw new TypeError("Invalid origin");

  const parsed = new URL(origin);
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.pathname !== "/" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    parsed.origin !== origin
  ) {
    throw new TypeError("Invalid origin");
  }
}

function makeOrderedRecord(values) {
  return {
    v: values.v,
    kind: values.kind,
    hostId: values.hostId,
    origin: values.origin,
    spkiSha256: values.spkiSha256,
    serverCertificate: values.serverCertificate,
    pairingId: values.pairingId,
    pairingSecret: values.pairingSecret,
    issuedAt: values.issuedAt,
    expiresAt: values.expiresAt,
  };
}

export function createSpsNativeInviteCode(record) {
  try {
    const values = requirePlainDataRecord(record);
    validatePrimitives(values);
    validateCanonicalOrigin(values.origin);

    const code = SPS_NATIVE_INVITE_PREFIX + Buffer.from(JSON.stringify(makeOrderedRecord(values)), "utf8").toString("base64url");
    if (code.length > MAX_NATIVE_INVITE_CODE_LENGTH) throw new TypeError("Invalid record");
    return code;
  } catch {
    throw new TypeError("Invalid SPS native invitation record");
  }
}

export function parseSpsNativeInviteCode(input) {
  if (typeof input !== "string" || input.length > MAX_NATIVE_INVITE_CODE_LENGTH || !/^[\x00-\x7f]*$/.test(input)) {
    return null;
  }
  if (!input.startsWith(SPS_NATIVE_INVITE_PREFIX)) return null;

  const encoded = input.slice(SPS_NATIVE_INVITE_PREFIX.length);
  if (!BASE64URL_PATTERN.test(encoded)) return null;

  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) return null;
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (json.includes("\0") || json.includes("\uFFFD")) return null;

    const parsed = JSON.parse(json);
    const values = requirePlainDataRecord(parsed);
    validatePrimitives(values);
    validateCanonicalOrigin(values.origin);

    const canonicalJson = JSON.stringify(makeOrderedRecord(values));
    if (!Buffer.from(canonicalJson, "utf8").equals(bytes)) return null;
    return Object.freeze(makeOrderedRecord(values));
  } catch {
    return null;
  }
}

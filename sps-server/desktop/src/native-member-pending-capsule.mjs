import { publicSpsNativeMemberEnrollmentRequest } from "./native-member-certificates.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

const KIND = "sps.native.member-pending-capsule";
const INNER_KIND = "sps.native.member-pending";
const CONTEXT_KEYS = ["identityIssuer", "subject", "hostId", "deviceKeyId", "serverSpkiSha256", "issuerSpkiSha256"];
const KEY_KEYS = ["v", "kind", "hostId", "deviceKeyId", "requestPem", "privateKeyPem"];
const OUTER_KEYS = ["v", "kind", "ciphertext"];
const INNER_KEYS = ["v", "kind", "context", "keyRequest"];
const MAX_PLAINTEXT_BYTES = 32 * 1024;
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 96 * 1024;
const ERRORS = Object.freeze({
  options: ["ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_OPTIONS", "Native Member pending capsule options are invalid."],
  platform: ["ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_UNSUPPORTED_PLATFORM", "Native Member pending capsules are supported only on Windows."],
  encryption: ["ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_ENCRYPTION_UNAVAILABLE", "Windows Native Member pending capsule encryption is unavailable."],
  invalid: ["ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_INVALID", "The Native Member pending capsule is invalid or does not match the expected context."],
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
  return { safeStorage: descriptors.safeStorage.value,
    platform: descriptors.platform ? descriptors.platform.value : process.platform };
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

export function validateSpsNativeMemberPendingContext(input) {
  const value = record(input, CONTEXT_KEYS);
  if (typeof value.identityIssuer !== "string" || value.identityIssuer.length > 2048) throw new Error("issuer");
  const issuer = new URL(value.identityIssuer);
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.pathname !== "/"
    || issuer.search || issuer.hash || issuer.origin !== value.identityIssuer) throw new Error("issuer");
  if (typeof value.subject !== "string" || value.subject.length === 0 || value.subject.length > 200
    || value.subject.trim() !== value.subject || /\p{Cc}/u.test(value.subject)) throw new Error("subject");
  uuid(value.hostId);
  uuid(value.deviceKeyId);
  for (const name of ["serverSpkiSha256", "issuerSpkiSha256"]) {
    if (typeof value[name] !== "string" || value[name].length !== 64 || !/^[0-9a-f]{64}$/.test(value[name])) throw new Error("pin");
  }
  return Object.freeze({ identityIssuer: value.identityIssuer, subject: value.subject, hostId: value.hostId,
    deviceKeyId: value.deviceKeyId, serverSpkiSha256: value.serverSpkiSha256, issuerSpkiSha256: value.issuerSpkiSha256 });
}
const validateContext = validateSpsNativeMemberPendingContext;

async function validateKeyRequest(input, context) {
  const value = record(input, KEY_KEYS);
  if (value.v !== 1 || value.kind !== "sps.native.member-key-request"
    || value.hostId !== context.hostId || value.deviceKeyId !== context.deviceKeyId) throw new Error("scope");
  await publicSpsNativeMemberEnrollmentRequest(value);
  return Object.freeze({ v: 1, kind: "sps.native.member-key-request", hostId: value.hostId,
    deviceKeyId: value.deviceKeyId, requestPem: value.requestPem, privateKeyPem: value.privateKeyPem });
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
  const context = validateContext(value.context);
  const keyRequest = value.keyRequest;
  return { context, keyRequest };
}

// Pins and issuer are trusted caller-supplied scope data only; this primitive does not authenticate them.
export function createSpsNativeMemberPendingCapsule(options) {
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
        const value = record(input, ["context", "keyRequest"]);
        const context = validateContext(value.context);
        const keyRequest = await validateKeyRequest(value.keyRequest, context);
        const plaintext = JSON.stringify({ v: 1, kind: INNER_KIND, context, keyRequest });
        if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) throw new Error("size");
        const encrypted = encrypt.call(config.safeStorage, plaintext);
        if (!(Buffer.isBuffer(encrypted) || encrypted instanceof Uint8Array)
          || encrypted.byteLength === 0 || encrypted.byteLength > MAX_CIPHERTEXT_BYTES) throw new Error("ciphertext");
        const ciphertext = Buffer.from(encrypted).toString("base64");
        const serialized = JSON.stringify({ v: 1, kind: KIND, ciphertext });
        if (Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) throw new Error("size");
        return serialized;
      } catch { throw failure("invalid"); }
    },
    async open(input, expectedInput) {
      try {
        const expectedContext = validateContext(expectedInput);
        const encrypted = decodeCiphertext(canonicalOuter(input));
        const plaintext = decrypt.call(config.safeStorage, encrypted);
        const parsed = canonicalInner(plaintext);
        const context = parsed.context;
        if (JSON.stringify(context) !== JSON.stringify(expectedContext)) throw new Error("context");
        const keyRequest = await validateKeyRequest(parsed.keyRequest, context);
        const canonical = JSON.stringify({ v: 1, kind: INNER_KIND, context, keyRequest });
        if (canonical !== plaintext) throw new Error("canonical");
        return keyRequest;
      } catch { throw failure("invalid"); }
    },
  });
}

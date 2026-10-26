import { createHash } from "node:crypto";
import { isIP } from "node:net";
import {
  nativeCertificateRecord as record,
  nativeCertificatePublicDer as publicDer,
  decodeNativeCertificatePem as decodePem,
} from "./native-certificate-primitives.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";
import { validateSpsNativeServerCertificate } from "./native-identity-certificates.mjs";
import { normalizeSpsNativeMemberKeyIndex } from "./native-member-key-index.mjs";

const KIND = "sps.native.member-host-target-capsule";
const INNER_KIND = "sps.native.member-host-target";
const TARGET_KEYS = ["v", "kind", "context", "origin", "serverCertificatePem"];
const OUTER_KEYS = ["v", "kind", "ciphertext"];
const INNER_KEYS = ["v", "kind", "context", "target"];
const MAX_PLAINTEXT_BYTES = 32 * 1024;
const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 96 * 1024;
const MAX_PEM_BYTES = 8192;
const ERRORS = Object.freeze({
  options: ["ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_OPTIONS", "Native Member target capsule options are invalid."],
  platform: ["ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_UNSUPPORTED_PLATFORM", "Native Member target capsules are supported only on Windows."],
  encryption: ["ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_ENCRYPTION_UNAVAILABLE", "Windows Native Member target capsule encryption is unavailable."],
  invalid: ["ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_INVALID", "The Native Member target capsule is invalid or does not match the expected context."],
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

function canonicalOrigin(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048
    || /[\u0000-\u0020\u007f\\]/.test(value)) throw new Error("origin");
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/"
    || parsed.search || parsed.hash || !parsed.hostname || parsed.origin !== value) throw new Error("origin");
  return parsed;
}

export function validateSpsNativeMemberHostTarget(input, expectedContextInput, now = Date.now()) {
  try {
    const value = record(input, TARGET_KEYS);
    if (value.v !== 1 || value.kind !== INNER_KIND) throw new Error("kind");
    const expectedContext = validateSpsNativeMemberPendingContext(expectedContextInput);
    const context = validateSpsNativeMemberPendingContext(value.context);
    if (JSON.stringify(context) !== JSON.stringify(expectedContext)) throw new Error("context");
    if (typeof value.serverCertificatePem !== "string"
      || Buffer.byteLength(value.serverCertificatePem, "utf8") > MAX_PEM_BYTES) throw new Error("pem-size");

    const origin = value.origin;
    const parsedOrigin = canonicalOrigin(origin);
    const certificate = validateSpsNativeServerCertificate(value.serverCertificatePem, context.hostId, now);
    const spkiSha256 = createHash("sha256").update(publicDer(certificate.publicKey)).digest("hex");
    if (spkiSha256 !== context.serverSpkiSha256 || spkiSha256 === context.issuerSpkiSha256) throw new Error("pin");
    const host = parsedOrigin.hostname.startsWith("[") && parsedOrigin.hostname.endsWith("]")
      ? parsedOrigin.hostname.slice(1, -1) : parsedOrigin.hostname;
    if (!(isIP(host) ? certificate.checkIP(host) : certificate.checkHost(host, { subject: "never" }))) throw new Error("san");
    decodePem(value.serverCertificatePem, "CERTIFICATE");
    return Object.freeze({
      v: 1,
      kind: INNER_KIND,
      context,
      origin,
      serverCertificatePem: value.serverCertificatePem,
    });
  } catch {
    throw Object.assign(new Error("The Native Member Host target is invalid."), {
      code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
    });
  }
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
  const context = validateSpsNativeMemberPendingContext(value.context);
  const target = validateSpsNativeMemberHostTarget(value.target, context);
  const canonical = JSON.stringify({ v: 1, kind: INNER_KIND, context, target });
  if (canonical !== plaintext) throw new Error("canonical");
  return { context, target };
}

function expectedScope(input) {
  return normalizeSpsNativeMemberKeyIndex({ v: 1, entries: [input] }).entries[0];
}

function scopeForContext(context) {
  return {
    identityIssuer: context.identityIssuer,
    subject: context.subject,
    hostId: context.hostId,
    deviceKeyId: context.deviceKeyId,
  };
}

// This Main-process primitive stores only the public Host target; safeStorage owns encryption.
export function createSpsNativeMemberTargetCapsule(options) {
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
        const value = record(input, ["context", "target"]);
        const context = validateSpsNativeMemberPendingContext(value.context);
        const target = validateSpsNativeMemberHostTarget(value.target, context);
        const plaintext = JSON.stringify({ v: 1, kind: INNER_KIND, context, target });
        if (Buffer.byteLength(plaintext, "utf8") > MAX_PLAINTEXT_BYTES) throw new Error("size");
        const encrypted = encrypt.call(config.safeStorage, plaintext);
        if (!(Buffer.isBuffer(encrypted) || encrypted instanceof Uint8Array)
          || encrypted.byteLength === 0 || encrypted.byteLength > MAX_CIPHERTEXT_BYTES) throw new Error("ciphertext");
        const serialized = JSON.stringify({ v: 1, kind: KIND, ciphertext: Buffer.from(encrypted).toString("base64") });
        if (Buffer.byteLength(serialized, "utf8") > MAX_FILE_BYTES) throw new Error("size");
        return serialized;
      } catch { throw failure("invalid"); }
    },
    async open(serialized, expectedScopeInput) {
      try {
        const trustedScope = expectedScope(expectedScopeInput);
        const encrypted = decodeCiphertext(canonicalOuter(serialized));
        const plaintext = decrypt.call(config.safeStorage, encrypted);
        const parsed = canonicalInner(plaintext);
        if (JSON.stringify(scopeForContext(parsed.context)) !== JSON.stringify(trustedScope)) throw new Error("scope");
        return parsed.target;
      } catch { throw failure("invalid"); }
    },
  });
}

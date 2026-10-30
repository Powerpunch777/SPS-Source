import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes, createDecipheriv, X509Certificate } from "node:crypto";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity, validateSpsNativeServerCertificate } from "../src/native-identity-certificates.mjs";
import {
  createSpsNativeMemberTargetCapsule,
  validateSpsNativeMemberHostTarget,
} from "../src/native-member-target-capsule.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const OTHER_DEVICE = "44444444-4444-4444-8444-444444444444";
const NOW = Math.floor(Date.now() / 1000) * 1000;
const INVALID_CODE = "ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_INVALID";
const INVALID_MESSAGE = "The Native Member target capsule is invalid or does not match the expected context.";
let host, otherKey, otherHost, wrongName, expired, ipv6, CONTEXT;

function spkiSha256(certificatePem) {
  const certificate = new X509Certificate(certificatePem);
  return createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("hex");
}

function contextFor(identity, overrides = {}) {
  return {
    identityIssuer: "https://identity.example.test",
    subject: "member@example.test",
    hostId: identity.hostId,
    deviceKeyId: DEVICE,
    serverSpkiSha256: spkiSha256(identity.server.certificatePem),
    issuerSpkiSha256: spkiSha256(identity.memberIssuer.certificatePem),
    ...overrides,
  };
}

function scopeFor(context, overrides = {}) {
  return {
    identityIssuer: context.identityIssuer,
    subject: context.subject,
    hostId: context.hostId,
    deviceKeyId: context.deviceKeyId,
    ...overrides,
  };
}

function targetFor(identity = host, context = CONTEXT, origin = "https://host.example.test:31311") {
  return {
    v: 1,
    kind: "sps.native.member-host-target",
    context,
    origin,
    serverCertificatePem: identity.server.certificatePem,
  };
}

function makeSafeStorage({ failDecrypt = false, onEncrypt = () => {}, ciphertext = null } = {}) {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(plaintext) {
      onEncrypt(plaintext);
      if (ciphertext !== null) return ciphertext;
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), body]);
    },
    decryptString(bytes) {
      if (failDecrypt || bytes.length < 28) throw new Error("fixture decryption failure");
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

function capsuleFor(safeStorage = makeSafeStorage()) {
  return { safeStorage, capsule: createSpsNativeMemberTargetCapsule({ safeStorage, platform: "win32" }) };
}

function outer(ciphertext, kind = "sps.native.member-host-target-capsule") {
  return JSON.stringify({ v: 1, kind, ciphertext });
}

function encryptRaw(safeStorage, plaintext, kind) {
  return outer(safeStorage.encryptString(plaintext).toString("base64"), kind);
}

function assertStaticInvalid(error) {
  assert.equal(error.code, INVALID_CODE);
  assert.equal(error.message, INVALID_MESSAGE);
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.doesNotMatch(error.message, /member@example|PRIVATE KEY|access_token|[A-Z]:\\/);
  return true;
}

before(async () => {
  host = await createSpsNativeHostIdentity({
    hostId: HOST, hostnames: ["host.example.test"],
    notBefore: NOW - 60_000, notAfter: NOW + 30 * 86_400_000, issuerNotAfter: NOW + 365 * 86_400_000,
  });
  otherKey = await createSpsNativeHostIdentity({
    hostId: HOST, hostnames: ["host.example.test"],
    notBefore: NOW - 60_000, notAfter: NOW + 30 * 86_400_000, issuerNotAfter: NOW + 365 * 86_400_000,
  });
  otherHost = await createSpsNativeHostIdentity({
    hostId: OTHER_HOST, hostnames: ["host.example.test"],
    notBefore: NOW - 60_000, notAfter: NOW + 30 * 86_400_000, issuerNotAfter: NOW + 365 * 86_400_000,
  });
  wrongName = await createSpsNativeHostIdentity({
    hostId: HOST, hostnames: ["other.example.test"],
    notBefore: NOW - 60_000, notAfter: NOW + 30 * 86_400_000, issuerNotAfter: NOW + 365 * 86_400_000,
  });
  expired = await createSpsNativeHostIdentity({
    hostId: HOST, hostnames: ["host.example.test"],
    notBefore: NOW - 180_000, notAfter: NOW - 60_000, issuerNotAfter: NOW + 365 * 86_400_000,
  });
  ipv6 = await createSpsNativeHostIdentity({
    hostId: HOST, hostnames: ["::1"],
    notBefore: NOW - 60_000, notAfter: NOW + 30 * 86_400_000, issuerNotAfter: NOW + 365 * 86_400_000,
  });
  CONTEXT = Object.freeze(contextFor(host));
});

test("requires Windows and available safeStorage methods without invoking accessors", () => {
  assert.throws(() => createSpsNativeMemberTargetCapsule({ platform: "linux", safeStorage: makeSafeStorage() }), {
    code: "ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_UNSUPPORTED_PLATFORM",
  });
  for (const safeStorage of [
    { isEncryptionAvailable: () => false, encryptString() {}, decryptString() {} },
    { isEncryptionAvailable: () => true, encryptString() {} },
    { isEncryptionAvailable: () => true, decryptString() {} },
    undefined,
    null,
  ]) assert.throws(() => createSpsNativeMemberTargetCapsule({ platform: "win32", safeStorage }), {
    code: "ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_ENCRYPTION_UNAVAILABLE",
  });

  let getterCalls = 0;
  const safeStorage = {
    get isEncryptionAvailable() { getterCalls += 1; return () => true; },
    encryptString() {}, decryptString() {},
  };
  assert.throws(() => createSpsNativeMemberTargetCapsule({ platform: "win32", safeStorage }), {
    code: "ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_ENCRYPTION_UNAVAILABLE",
  });
  const options = { safeStorage: makeSafeStorage() };
  Object.defineProperty(options, "platform", { enumerable: true, get() { getterCalls += 1; return "win32"; } });
  assert.throws(() => createSpsNativeMemberTargetCapsule(options), {
    code: "ERR_SPS_NATIVE_MEMBER_TARGET_CAPSULE_OPTIONS",
  });
  assert.equal(getterCalls, 0);
});

test("validates and freezes only the canonical public Host target projection", () => {
  const target = validateSpsNativeMemberHostTarget(targetFor(), CONTEXT, NOW);
  assert.deepEqual(Object.keys(target), ["v", "kind", "context", "origin", "serverCertificatePem"]);
  assert.equal(target.v, 1);
  assert.equal(target.kind, "sps.native.member-host-target");
  assert.deepEqual(target.context, CONTEXT);
  assert.equal(Object.isFrozen(target), true);
  assert.equal(Object.isFrozen(target.context), true);
  assert.deepEqual(validateSpsNativeMemberHostTarget(target, CONTEXT, NOW), target);
  assert.equal(validateSpsNativeServerCertificate(host.server.certificatePem, HOST, NOW).subject,
    new X509Certificate(host.server.certificatePem).subject);
  const ipv6Context = contextFor(ipv6);
  assert.equal(validateSpsNativeMemberHostTarget(
    targetFor(ipv6, ipv6Context, "https://[::1]:31311"), ipv6Context, NOW,
  ).origin, "https://[::1]:31311");
});

test("seals the target with Windows safeStorage and opens it using the four-field restart scope", async () => {
  let plaintext;
  const { capsule } = capsuleFor(makeSafeStorage({ onEncrypt: value => { plaintext = value; } }));
  const serialized = await capsule.seal({ context: CONTEXT, target: targetFor() });
  const outerValue = JSON.parse(serialized);
  assert.deepEqual(Object.keys(outerValue), ["v", "kind", "ciphertext"]);
  assert.equal(outerValue.kind, "sps.native.member-host-target-capsule");
  const inner = JSON.parse(plaintext);
  assert.deepEqual(Object.keys(inner), ["v", "kind", "context", "target"]);
  assert.deepEqual(Object.keys(inner.target), ["v", "kind", "context", "origin", "serverCertificatePem"]);
  assert.equal(inner.kind, "sps.native.member-host-target");
  assert.doesNotMatch(plaintext, /pairingSecret|inviteCode|access_token|privateKeyPem|PRIVATE KEY|requestPem/);
  assert.doesNotMatch(serialized, /CERTIFICATE|host\.example\.test|member@example\.test/);

  const opened = await capsule.open(serialized, scopeFor(CONTEXT));
  assert.deepEqual(Object.keys(opened), ["v", "kind", "context", "origin", "serverCertificatePem"]);
  assert.equal(Object.isFrozen(opened), true);
  assert.equal(Object.isFrozen(opened.context), true);
  assert.deepEqual(opened, validateSpsNativeMemberHostTarget(targetFor(), CONTEXT, NOW));
});

test("binds the restart scope while retaining encrypted server and issuer pins as authoritative", async () => {
  const { capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, target: targetFor() });
  for (const scope of [
    scopeFor(CONTEXT, { identityIssuer: "https://other.example.test" }),
    scopeFor(CONTEXT, { subject: "other@example.test" }),
    scopeFor(CONTEXT, { hostId: OTHER_HOST }),
    scopeFor(CONTEXT, { deviceKeyId: OTHER_DEVICE }),
  ]) await assert.rejects(capsule.open(serialized, scope), assertStaticInvalid);

  await assert.rejects(capsule.open(serialized, CONTEXT), assertStaticInvalid);
  await assert.rejects(capsule.seal({
    context: { ...CONTEXT, serverSpkiSha256: spkiSha256(otherKey.server.certificatePem) },
    target: targetFor(),
  }), assertStaticInvalid);
  await assert.rejects(capsule.seal({
    context: CONTEXT,
    target: targetFor(otherKey, { ...CONTEXT, serverSpkiSha256: spkiSha256(otherKey.server.certificatePem) }),
  }), assertStaticInvalid);
  await assert.rejects(capsule.seal({ context: CONTEXT, target: targetFor(otherHost, CONTEXT) }), assertStaticInvalid);

  const { safeStorage, capsule: pinCapsule } = capsuleFor();
  const changedPins = { ...CONTEXT, serverSpkiSha256: spkiSha256(otherKey.server.certificatePem) };
  const changedTarget = { ...validateSpsNativeMemberHostTarget(targetFor(), CONTEXT, NOW), context: changedPins };
  const changedPlaintext = JSON.stringify({
    v: 1, kind: "sps.native.member-host-target", context: changedPins, target: changedTarget,
  });
  await assert.rejects(pinCapsule.open(
    encryptRaw(safeStorage, changedPlaintext), scopeFor(CONTEXT),
  ), assertStaticInvalid);
});

test("requires the pinned Host server profile, matching SAN, distinct issuer pin, and current validity", () => {
  assert.throws(() => validateSpsNativeMemberHostTarget(targetFor(otherKey), CONTEXT, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });

  const wrongNameContext = contextFor(wrongName);
  assert.throws(() => validateSpsNativeMemberHostTarget(targetFor(wrongName, wrongNameContext), wrongNameContext, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });

  const samePins = { ...CONTEXT, issuerSpkiSha256: CONTEXT.serverSpkiSha256 };
  assert.throws(() => validateSpsNativeMemberHostTarget(targetFor(host, samePins), samePins, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });

  const caTarget = targetFor(host, CONTEXT);
  caTarget.serverCertificatePem = host.memberIssuer.certificatePem;
  assert.throws(() => validateSpsNativeMemberHostTarget(caTarget, CONTEXT, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });

  const expiredContext = contextFor(expired);
  assert.throws(() => validateSpsNativeMemberHostTarget(targetFor(expired, expiredContext), expiredContext, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });
  assert.throws(() => validateSpsNativeServerCertificate(expired.server.certificatePem, HOST, NOW), {
    code: "native_identity_invalid",
  });
});

test("rejects noncanonical origins, extra fields, oversized PEM, and hostile data accessors", () => {
  for (const origin of [
    "http://host.example.test", "https://user@host.example.test", "https://host.example.test/",
    "https://host.example.test/path", "https://host.example.test?x=1", "https://host.example.test#x",
    " https://host.example.test", `https://${"a".repeat(2040)}.test`,
  ]) assert.throws(() => validateSpsNativeMemberHostTarget(targetFor(host, CONTEXT, origin), CONTEXT, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });

  assert.throws(() => validateSpsNativeMemberHostTarget({ ...targetFor(), token: "forbidden" }, CONTEXT, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });
  const missingVersion = { ...targetFor() };
  delete missingVersion.v;
  assert.throws(() => validateSpsNativeMemberHostTarget(missingVersion, CONTEXT, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });
  assert.throws(() => validateSpsNativeMemberHostTarget({ ...targetFor(), kind: "sps.native.member-pending" }, CONTEXT, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });
  assert.throws(() => validateSpsNativeMemberHostTarget({
    ...targetFor(), serverCertificatePem: "x".repeat(8193),
  }, CONTEXT, NOW), { code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID" });

  let getterCalls = 0;
  const accessorTarget = targetFor();
  Object.defineProperty(accessorTarget, "origin", {
    enumerable: true, get() { getterCalls += 1; return "https://host.example.test:31311"; },
  });
  const accessorContext = { ...CONTEXT };
  Object.defineProperty(accessorContext, "subject", {
    enumerable: true, get() { getterCalls += 1; return CONTEXT.subject; },
  });
  assert.throws(() => validateSpsNativeMemberHostTarget(accessorTarget, CONTEXT, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });
  assert.throws(() => validateSpsNativeMemberHostTarget(targetFor(), accessorContext, NOW), {
    code: "ERR_SPS_NATIVE_MEMBER_HOST_TARGET_INVALID",
  });
  assert.equal(getterCalls, 0);
});

test("rejects duplicate and noncanonical outer or encrypted JSON, invalid ciphertext, and oversized input", async () => {
  const { safeStorage, capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, target: targetFor() });
  for (const invalid of [
    "{", serialized.replace('"v":1', '"v":1,"v":1'), serialized.replace('"v":1', '"\\u0076":1'),
    ` ${serialized}`, JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(serialized)).reverse())),
    " ".repeat(96 * 1024 + 1), outer("not-base64!"), outer("A".repeat(90_000)),
    outer(JSON.parse(serialized).ciphertext, "sps.native.member-issued-capsule"),
  ]) await assert.rejects(capsule.open(invalid, scopeFor(CONTEXT)), assertStaticInvalid);

  const plaintext = JSON.stringify({
    v: 1, kind: "sps.native.member-host-target", context: CONTEXT,
    target: validateSpsNativeMemberHostTarget(targetFor(), CONTEXT, NOW),
  });
  for (const invalidPlaintext of [
    plaintext.replace('"v":1', '"v":1,"v":1'), plaintext.replace('"v":1', '"\\u0076":1'), ` ${plaintext}`,
    JSON.stringify({ ...JSON.parse(plaintext), extra: true }), "x".repeat(32 * 1024 + 1),
  ]) await assert.rejects(capsule.open(encryptRaw(safeStorage, invalidPlaintext), scopeFor(CONTEXT)), assertStaticInvalid);
});

test("fails closed when encryption output or decryption is unavailable", async () => {
  const invalidEncryption = createSpsNativeMemberTargetCapsule({
    platform: "win32", safeStorage: makeSafeStorage({ ciphertext: "not-bytes" }),
  });
  await assert.rejects(invalidEncryption.seal({ context: CONTEXT, target: targetFor() }), assertStaticInvalid);

  const { capsule } = capsuleFor(makeSafeStorage({ failDecrypt: true }));
  await assert.rejects(capsule.open(outer(Buffer.from("ciphertext").toString("base64")), scopeFor(CONTEXT)), assertStaticInvalid);
});

import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import test from "node:test";
import { createSpsNativeMemberKeyRequest } from "../src/native-member-certificates.mjs";
import { createSpsNativeMemberPendingCapsule } from "../src/native-member-pending-capsule.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const OTHER_DEVICE = "44444444-4444-4444-8444-444444444444";
const CONTEXT = Object.freeze({
  identityIssuer: "https://identity.example.test",
  subject: "member@example.test",
  hostId: HOST,
  deviceKeyId: DEVICE,
  serverSpkiSha256: "a".repeat(64),
  issuerSpkiSha256: "b".repeat(64),
});
const ERROR_CODE = "ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_INVALID";
let keyRequest;

function makeSafeStorage({ failDecrypt = false, onEncrypt = () => {} } = {}) {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(plaintext) {
      onEncrypt(plaintext);
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]);
    },
    decryptString(bytes) {
      if (failDecrypt || bytes.length < 28) throw new Error("fixture authentication failure");
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

function capsuleFor(safeStorage = makeSafeStorage()) {
  return { safeStorage, capsule: createSpsNativeMemberPendingCapsule({ safeStorage, platform: "win32" }) };
}

function assertStaticInvalid(error) {
  assert.equal(error.code, ERROR_CODE);
  assert.equal(error.message, "The Native Member pending capsule is invalid or does not match the expected context.");
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.doesNotMatch(error.message, /PRIVATE KEY|customer|access_token|[A-Za-z]:\\/);
  return true;
}

function outer(ciphertext) {
  return JSON.stringify({ v: 1, kind: "sps.native.member-pending-capsule", ciphertext });
}

async function encryptRaw(safeStorage, plaintext) {
  return outer(safeStorage.encryptString(plaintext).toString("base64"));
}

test("requires Windows safeStorage with an available encrypt/decrypt API", () => {
  assert.throws(() => createSpsNativeMemberPendingCapsule({ platform: "linux", safeStorage: makeSafeStorage() }), {
    code: "ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_UNSUPPORTED_PLATFORM",
  });
  for (const safeStorage of [
    { isEncryptionAvailable: () => false, encryptString() {}, decryptString() {} },
    { isEncryptionAvailable: () => true, encryptString() {} },
    { isEncryptionAvailable: () => true, decryptString() {} },
  ]) {
    assert.throws(() => createSpsNativeMemberPendingCapsule({ platform: "win32", safeStorage }), {
      code: "ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_ENCRYPTION_UNAVAILABLE",
    });
  }
  for (const safeStorage of [undefined, null, 1, "invalid"]) {
    assert.throws(() => createSpsNativeMemberPendingCapsule({ platform: "win32", safeStorage }), {
      code: "ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_ENCRYPTION_UNAVAILABLE",
    });
  }
  let methodGetterCalls = 0;
  const accessorSafeStorage = {
    get isEncryptionAvailable() { methodGetterCalls += 1; return () => true; },
    encryptString() {},
    decryptString() {},
  };
  assert.throws(() => createSpsNativeMemberPendingCapsule({ platform: "win32", safeStorage: accessorSafeStorage }), {
    code: "ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_ENCRYPTION_UNAVAILABLE",
  });
  assert.equal(methodGetterCalls, 0);
});

test("seals and opens a real local Member key request using the injected Windows API boundary", async () => {
  // AES-GCM here only exercises the injected SafeStorage contract; it is not a DPAPI proof.
  let plaintext;
  const { capsule } = capsuleFor(makeSafeStorage({ onEncrypt: value => { plaintext = value; } }));
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest });
  const outerValue = JSON.parse(serialized);
  assert.deepEqual(Object.keys(outerValue), ["v", "kind", "ciphertext"]);
  assert.equal(outerValue.v, 1);
  assert.equal(outerValue.kind, "sps.native.member-pending-capsule");
  assert.doesNotMatch(serialized, /PRIVATE KEY|member@example\.test|11111111-1111-4111-8111-111111111111/);
  assert.equal(Buffer.byteLength(plaintext, "utf8") <= 32 * 1024, true);

  const opened = await capsule.open(serialized, CONTEXT);
  assert.deepEqual(opened, keyRequest);
  assert.deepEqual(Object.keys(opened), ["v", "kind", "hostId", "deviceKeyId", "requestPem", "privateKeyPem"]);
  assert.equal(Object.isFrozen(opened), true);
});

test("opens only the retained context for an indexed account/device scope without returning private key data", async () => {
  const { capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest });
  const retained = await capsule.openContext(serialized, {
    identityIssuer: CONTEXT.identityIssuer,
    subject: CONTEXT.subject,
    hostId: CONTEXT.hostId,
    deviceKeyId: CONTEXT.deviceKeyId,
  });
  assert.deepEqual(retained, CONTEXT);
  assert.equal(Object.isFrozen(retained), true);
  assert.deepEqual(Object.keys(retained).sort(), Object.keys(CONTEXT).sort());
  assert.equal(Object.hasOwn(retained, "privateKeyPem"), false);
  await assert.rejects(capsule.openContext(serialized, {
    identityIssuer: CONTEXT.identityIssuer,
    subject: "other@example.test",
    hostId: CONTEXT.hostId,
    deviceKeyId: CONTEXT.deviceKeyId,
  }), assertStaticInvalid);
});

test("binds every expected context field and does not adopt an embedded context", async () => {
  const { capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest });
  for (const [name, value] of [
    ["subject", "other@example.test"],
    ["identityIssuer", "https://other.example.test"],
    ["hostId", OTHER_HOST],
    ["deviceKeyId", OTHER_DEVICE],
    ["serverSpkiSha256", "c".repeat(64)],
    ["issuerSpkiSha256", "d".repeat(64)],
  ]) {
    await assert.rejects(capsule.open(serialized, { ...CONTEXT, [name]: value }), assertStaticInvalid);
  }

  const otherSerialized = await capsule.seal({ context: { ...CONTEXT, subject: "other@example.test" }, keyRequest });
  const swappedCiphertext = outer(JSON.parse(otherSerialized).ciphertext);
  await assert.rejects(capsule.open(swappedCiphertext, CONTEXT), assertStaticInvalid);
});

test("rejects a local key request outside the trusted Host/device scope before encryption", async () => {
  let encryptCalls = 0;
  const { capsule } = capsuleFor(makeSafeStorage({ onEncrypt: () => { encryptCalls += 1; } }));
  const otherHostKey = await createSpsNativeMemberKeyRequest({ hostId: OTHER_HOST, deviceKeyId: DEVICE });
  const otherDeviceKey = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: OTHER_DEVICE });
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest: otherHostKey }), assertStaticInvalid);
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest: otherDeviceKey }), assertStaticInvalid);
  assert.equal(encryptCalls, 0);
});

test("rejects failed decryption and malformed, noncanonical, duplicate-key, or oversized envelopes", async () => {
  const { capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest });
  await assert.rejects(capsuleFor(makeSafeStorage({ failDecrypt: true })).capsule.open(serialized, CONTEXT), assertStaticInvalid);
  for (const invalid of [
    "{",
    serialized.replace('"v":1', '"v":1,"v":1'),
    serialized.replace('"v":1', '"\\u0076":1'),
    ` ${serialized}`,
    JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(serialized)).reverse())),
    " ".repeat(96 * 1024 + 1),
    outer("not-base64!"),
    outer("A".repeat(90_000)),
  ]) await assert.rejects(capsule.open(invalid, CONTEXT), assertStaticInvalid);

  const { safeStorage: innerStorage, capsule: innerCapsule } = capsuleFor();
  const validInner = JSON.stringify({ v: 1, kind: "sps.native.member-pending", context: CONTEXT, keyRequest });
  for (const malformed of [
    validInner.replace('"v":1', '"v":1,"v":1'),
    validInner.replace('"v":1', '"\\u0076":1'),
    ` ${validInner}`,
    JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(validInner)).reverse())),
    validInner.replace('"kind":', '"extra":true,"kind":'),
  ]) {
    await assert.rejects(innerCapsule.open(await encryptRaw(innerStorage, malformed), CONTEXT), assertStaticInvalid);
  }
  await assert.rejects(innerCapsule.open(await encryptRaw(innerStorage, "x".repeat(32 * 1024 + 1)), CONTEXT), assertStaticInvalid);
});

test("enforces canonical trusted context fields and does not execute accessors", async () => {
  const { capsule } = capsuleFor();
  for (const [name, value] of [
    ["identityIssuer", "http://identity.example.test"],
    ["identityIssuer", "https://user@identity.example.test"],
    ["identityIssuer", "https://identity.example.test/path"],
    ["identityIssuer", "https://identity.example.test?query=1"],
    ["identityIssuer", `https://${"a".repeat(2048)}.example.test`],
    ["subject", " member@example.test"],
    ["subject", ""],
    ["subject", "a\nb"],
    ["subject", "x".repeat(201)],
    ["hostId", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa".toUpperCase()],
    ["hostId", `${HOST}\n`],
    ["deviceKeyId", "not-a-uuid"],
    ["serverSpkiSha256", "A".repeat(64)],
    ["serverSpkiSha256", `${"a".repeat(64)}\n`],
    ["issuerSpkiSha256", "b".repeat(63)],
    ["issuerSpkiSha256", `${"b".repeat(64)}\n`],
  ]) await assert.rejects(capsule.seal({ context: { ...CONTEXT, [name]: value }, keyRequest }), assertStaticInvalid);

  let getterCalls = 0;
  const accessorContext = { ...CONTEXT };
  Object.defineProperty(accessorContext, "subject", { enumerable: true, get() { getterCalls += 1; return CONTEXT.subject; } });
  const accessorKey = { ...keyRequest };
  Object.defineProperty(accessorKey, "privateKeyPem", { enumerable: true, get() { getterCalls += 1; return keyRequest.privateKeyPem; } });
  const accessorExpected = { ...CONTEXT };
  Object.defineProperty(accessorExpected, "subject", { enumerable: true, get() { getterCalls += 1; return CONTEXT.subject; } });
  await assert.rejects(capsule.seal({ context: accessorContext, keyRequest }), assertStaticInvalid);
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest: accessorKey }), assertStaticInvalid);
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest });
  await assert.rejects(capsule.open(serialized, accessorExpected), assertStaticInvalid);
  assert.equal(getterCalls, 0);
});

test("exposes only static safeStorage configuration errors without causes", () => {
  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, "safeStorage", { enumerable: true, get() { getterCalls += 1; return makeSafeStorage(); } });
  assert.throws(() => createSpsNativeMemberPendingCapsule(options), {
    code: "ERR_SPS_NATIVE_MEMBER_PENDING_CAPSULE_OPTIONS",
    message: "Native Member pending capsule options are invalid.",
  });
  assert.equal(getterCalls, 0);
});

test("requires the exact key request shape and rejects malformed key material", async () => {
  const { capsule } = capsuleFor();
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest: { ...keyRequest, extra: true } }), assertStaticInvalid);
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest: { ...keyRequest, requestPem: "not a CSR" } }), assertStaticInvalid);
});

test.before(async () => {
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
});

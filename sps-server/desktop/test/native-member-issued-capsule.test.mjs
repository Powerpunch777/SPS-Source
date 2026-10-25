import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, randomBytes, webcrypto, X509Certificate } from "node:crypto";
import test, { before } from "node:test";
import "reflect-metadata";
import {
  AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension,
  KeyUsageFlags, KeyUsagesExtension, SubjectKeyIdentifierExtension,
  X509Certificate as ParsedCertificate, X509CertificateGenerator,
} from "@peculiar/x509";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } from "../src/native-member-certificates.mjs";
import { createSpsNativeMemberIssuedCapsule } from "../src/native-member-issued-capsule.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const NOW = Math.floor(Date.now() / 1000) * 1000;
const MS_PER_DAY = 86_400_000;
const KEY_ALGORITHM = Object.freeze({ name: "ECDSA", namedCurve: "P-256" });
const SIGNING_ALGORITHM = Object.freeze({ name: "ECDSA", hash: "SHA-256" });
let CONTEXT = Object.freeze({
  identityIssuer: "https://identity.example.test",
  subject: "member@example.test",
  hostId: HOST,
  deviceKeyId: DEVICE,
  serverSpkiSha256: "a".repeat(64),
  issuerSpkiSha256: "b".repeat(64),
});
const INVALID_CODE = "ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_INVALID";
let host, keyRequest, certificate, issuerSpkiSha256, issuance;

function encodePem(bytes, label) {
  const lines = Buffer.from(bytes).toString("base64").match(/.{1,64}/g);
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function spkiSha256(certificatePem) {
  const parsed = new X509Certificate(certificatePem);
  return createHash("sha256").update(parsed.publicKey.export({ type: "spki", format: "der" })).digest("hex");
}

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
      if (failDecrypt || bytes.length < 28) throw new Error("fixture decryption failure");
      const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
    },
  };
}

function capsuleFor(safeStorage = makeSafeStorage()) {
  return { safeStorage, capsule: createSpsNativeMemberIssuedCapsule({ safeStorage, platform: "win32" }) };
}

function assertStaticInvalid(error) {
  assert.equal(error.code, INVALID_CODE);
  assert.equal(error.message, "The Native Member issued capsule is invalid or does not match the expected context.");
  assert.equal(Object.hasOwn(error, "cause"), false);
  assert.doesNotMatch(error.message, /PRIVATE KEY|member@example|access_token|[A-Za-z]:\\/);
  return true;
}

function outer(ciphertext, kind = "sps.native.member-issued-capsule") {
  return JSON.stringify({ v: 1, kind, ciphertext });
}

async function encryptRaw(safeStorage, plaintext, kind) {
  return outer(safeStorage.encryptString(plaintext).toString("base64"), kind);
}

async function signLeaf({ eku = ExtendedKeyUsage.clientAuth, notBefore = NOW - 1000, notAfter = NOW + 60_000 } = {}) {
  const issuer = new ParsedCertificate(host.memberIssuer.certificatePem);
  const issuerKeyBytes = Buffer.from(createPrivateKey(host.memberIssuer.privateKeyPem)
    .export({ type: "pkcs8", format: "der" }));
  let signingKey, leafPublicKey;
  try {
    signingKey = await webcrypto.subtle.importKey("pkcs8", issuerKeyBytes, KEY_ALGORITHM, false, ["sign"]);
    leafPublicKey = await webcrypto.subtle.importKey("spki",
      createPublicKey(createPrivateKey(keyRequest.privateKeyPem)).export({ type: "spki", format: "der" }),
      KEY_ALGORITHM, true, ["verify"]);
  } finally {
    issuerKeyBytes.fill(0);
  }
  const serial = randomBytes(20);
  serial[0] = (serial[0] & 0x7f) | 1;
  const generated = await X509CertificateGenerator.create({
    subject: `CN=SPS Member Device ${DEVICE},OU=SPS Native Host ${HOST}`,
    issuer: issuer.subjectName,
    publicKey: leafPublicKey,
    signingKey,
    signingAlgorithm: SIGNING_ALGORITHM,
    serialNumber: serial.toString("hex"),
    notBefore: new Date(notBefore),
    notAfter: new Date(notAfter),
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([eku], true),
      await SubjectKeyIdentifierExtension.create(leafPublicKey, false, webcrypto),
      await AuthorityKeyIdentifierExtension.create(issuer.publicKey, false, webcrypto),
    ],
  }, webcrypto);
  return encodePem(generated.rawData, "CERTIFICATE");
}

function issuanceFor(certificatePem = certificate.certificatePem, expiresAt = new Date(NOW - MS_PER_DAY).toISOString()) {
  return {
    enrollmentId: "abcdefab-cdef-4abc-8def-abcdefabcdef",
    certificate: new X509Certificate(certificatePem).raw.toString("base64url"),
    issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url"),
    expiresAt,
  };
}

before(async () => {
  host = await createSpsNativeHostIdentity({
    hostId: HOST,
    hostnames: ["127.0.0.1"],
    notBefore: NOW - 60_000,
    notAfter: NOW + 90 * MS_PER_DAY,
    issuerNotAfter: NOW + 365 * MS_PER_DAY,
  });
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  certificate = await issueSpsNativeMemberCertificate({
    hostIdentity: host,
    request: {
      v: 1,
      kind: "sps.native.member-enrollment-request",
      hostId: HOST,
      deviceKeyId: DEVICE,
      requestPem: keyRequest.requestPem,
    },
    notBefore: NOW - 1000,
    notAfter: NOW + 60_000,
    now: NOW,
  });
  issuerSpkiSha256 = spkiSha256(host.memberIssuer.certificatePem);
  CONTEXT = Object.freeze({ ...CONTEXT, issuerSpkiSha256 });
  issuance = issuanceFor();
});

test("requires Windows and available safeStorage methods without invoking accessors", () => {
  assert.throws(() => createSpsNativeMemberIssuedCapsule({ platform: "linux", safeStorage: makeSafeStorage() }), {
    code: "ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_UNSUPPORTED_PLATFORM",
  });
  for (const safeStorage of [
    { isEncryptionAvailable: () => false, encryptString() {}, decryptString() {} },
    { isEncryptionAvailable: () => true, encryptString() {} },
    { isEncryptionAvailable: () => true, decryptString() {} },
    undefined,
    null,
  ]) assert.throws(() => createSpsNativeMemberIssuedCapsule({ platform: "win32", safeStorage }), {
    code: "ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_ENCRYPTION_UNAVAILABLE",
  });

  let getterCalls = 0;
  const safeStorage = {
    get isEncryptionAvailable() { getterCalls++; return () => true; },
    encryptString() {},
    decryptString() {},
  };
  assert.throws(() => createSpsNativeMemberIssuedCapsule({ platform: "win32", safeStorage }), {
    code: "ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_ENCRYPTION_UNAVAILABLE",
  });
  const options = { safeStorage: makeSafeStorage() };
  Object.defineProperty(options, "platform", { enumerable: true, get() { getterCalls++; return "win32"; } });
  assert.throws(() => createSpsNativeMemberIssuedCapsule(options), {
    code: "ERR_SPS_NATIVE_MEMBER_ISSUED_CAPSULE_OPTIONS",
  });
  assert.equal(getterCalls, 0);
});

test("seals the exact public issuance projection and revalidates it with the trusted local key", async () => {
  let plaintext;
  const { capsule } = capsuleFor(makeSafeStorage({ onEncrypt: value => { plaintext = value; } }));
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest, issuance });
  const outerValue = JSON.parse(serialized);
  assert.deepEqual(Object.keys(outerValue), ["v", "kind", "ciphertext"]);
  assert.equal(outerValue.kind, "sps.native.member-issued-capsule");
  const inner = JSON.parse(plaintext);
  assert.deepEqual(Object.keys(inner), ["v", "kind", "context", "issuance"]);
  assert.equal(inner.kind, "sps.native.member-issued");
  assert.deepEqual(Object.keys(inner.issuance), ["enrollmentId", "certificate", "issuerCertificate", "expiresAt"]);
  assert.doesNotMatch(plaintext, /privateKeyPem|requestPem|PRIVATE KEY|CERTIFICATE REQUEST|pairingSecret/);
  assert.doesNotMatch(serialized, /member@example\.test|PRIVATE KEY|CERTIFICATE REQUEST/);

  const opened = await capsule.open(serialized, CONTEXT, keyRequest);
  assert.equal(Object.isFrozen(opened), true);
  assert.equal(Object.isFrozen(opened.issuance), true);
  assert.equal(Object.isFrozen(opened.credential), true);
  assert.deepEqual(opened.issuance, issuance);
  assert.equal(opened.credential.kind, "sps.native.member-credential");
  assert.equal(opened.credential.privateKeyPem, keyRequest.privateKeyPem);
  assert.equal(opened.credential.certificatePem, certificate.certificatePem);
});

test("binds the expected identity, Host pins, and local key request", async () => {
  const { capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest, issuance });
  for (const [name, value] of [
    ["subject", "other@example.test"],
    ["identityIssuer", "https://other.example.test"],
    ["hostId", OTHER_HOST],
    ["serverSpkiSha256", "c".repeat(64)],
    ["issuerSpkiSha256", "d".repeat(64)],
  ]) await assert.rejects(capsule.open(serialized, { ...CONTEXT, [name]: value }, keyRequest), assertStaticInvalid);

  const otherKey = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  await assert.rejects(capsule.open(serialized, CONTEXT, otherKey), assertStaticInvalid);
  await assert.rejects(capsule.seal({ context: { ...CONTEXT, issuerSpkiSha256: "c".repeat(64) }, keyRequest, issuance }), assertStaticInvalid);
});

test("accepts canonical expired invitation metadata but rejects expired leaf certificates", async () => {
  const { capsule } = capsuleFor();
  const expiredInvite = issuanceFor(certificate.certificatePem, new Date(NOW - 30 * MS_PER_DAY).toISOString());
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest, issuance: expiredInvite });
  const opened = await capsule.open(serialized, CONTEXT, keyRequest);
  assert.equal(opened.issuance.expiresAt, expiredInvite.expiresAt);

  const expiredLeaf = await signLeaf({ notBefore: NOW - 120_000, notAfter: NOW - 60_000 });
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest, issuance: issuanceFor(expiredLeaf) }), assertStaticInvalid);
});

test("rechecks certificate validity after asynchronous credential validation", async () => {
  const { capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest, issuance });
  const validFrom = Date.parse(new X509Certificate(certificate.certificatePem).validFrom);
  const expiredAt = Date.parse(new X509Certificate(certificate.certificatePem).validTo);
  const realNow = Date.now;
  let nowCalls = 0;
  Date.now = () => ++nowCalls === 1 ? validFrom + 1000 : expiredAt;
  try {
    await assert.rejects(capsule.open(serialized, CONTEXT, keyRequest), assertStaticInvalid);
    assert.ok(nowCalls >= 2);
  } finally {
    Date.now = realNow;
  }
});

test("rejects wrong EKU and malformed certificate DER despite canonical base64url", async () => {
  const { capsule } = capsuleFor();
  const serverAuth = await signLeaf({ eku: ExtendedKeyUsage.serverAuth });
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest, issuance: issuanceFor(serverAuth) }), assertStaticInvalid);
  await assert.rejects(capsule.seal({
    context: CONTEXT,
    keyRequest,
    issuance: { ...issuance, certificate: Buffer.from("not a DER certificate").toString("base64url") },
  }), assertStaticInvalid);
});

test("rejects duplicate, unknown, noncanonical, oversized, malformed, and cross-kind envelopes", async () => {
  const { safeStorage, capsule } = capsuleFor();
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest, issuance });
  for (const invalid of [
    "{",
    serialized.replace('"v":1', '"v":1,"v":1'),
    serialized.replace('"v":1', '"\\u0076":1'),
    ` ${serialized}`,
    JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(serialized)).reverse())),
    " ".repeat(96 * 1024 + 1),
    outer("not-base64!"),
    outer("A".repeat(90_000)),
    outer(JSON.parse(serialized).ciphertext, "sps.native.member-pending-capsule"),
  ]) await assert.rejects(capsule.open(invalid, CONTEXT, keyRequest), assertStaticInvalid);

  const inner = JSON.stringify({ v: 1, kind: "sps.native.member-issued", context: CONTEXT, issuance });
  for (const invalidPlaintext of [
    inner.replace('"v":1', '"v":1,"v":1'),
    inner.replace('"v":1', '"\\u0076":1'),
    ` ${inner}`,
    JSON.stringify({ v: 1, kind: "sps.native.member-pending", context: CONTEXT, issuance }),
    JSON.stringify({ v: 1, kind: "sps.native.member-issued", context: CONTEXT, issuance, keyRequest }),
    "x".repeat(32 * 1024 + 1),
  ]) await assert.rejects(capsule.open(await encryptRaw(safeStorage, invalidPlaintext), CONTEXT, keyRequest), assertStaticInvalid);
});

test("rejects malformed issuance metadata and accessor records without evaluating getters", async () => {
  const { capsule } = capsuleFor();
  for (const value of [
    { ...issuance, enrollmentId: issuance.enrollmentId.toUpperCase() },
    { ...issuance, certificate: `${issuance.certificate}=` },
    { ...issuance, issuerCertificate: "%%%" },
    { ...issuance, expiresAt: "2026-01-01T00:00:00Z" },
    { ...issuance, expiresAt: "not a date" },
    { ...issuance, extra: true },
  ]) await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest, issuance: value }), assertStaticInvalid);

  let getterCalls = 0;
  const accessorContext = { ...CONTEXT };
  Object.defineProperty(accessorContext, "subject", { enumerable: true, get() { getterCalls++; return CONTEXT.subject; } });
  const accessorIssuance = { ...issuance };
  Object.defineProperty(accessorIssuance, "certificate", { enumerable: true, get() { getterCalls++; return issuance.certificate; } });
  const accessorKey = { ...keyRequest };
  Object.defineProperty(accessorKey, "privateKeyPem", { enumerable: true, get() { getterCalls++; return keyRequest.privateKeyPem; } });
  await assert.rejects(capsule.seal({ context: accessorContext, keyRequest, issuance }), assertStaticInvalid);
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest, issuance: accessorIssuance }), assertStaticInvalid);
  await assert.rejects(capsule.seal({ context: CONTEXT, keyRequest: accessorKey, issuance }), assertStaticInvalid);
  const serialized = await capsule.seal({ context: CONTEXT, keyRequest, issuance });
  await assert.rejects(capsule.open(serialized, accessorContext, keyRequest), assertStaticInvalid);
  assert.equal(getterCalls, 0);
});

test("exposes only static configuration and decryption errors", async () => {
  const { capsule } = capsuleFor(makeSafeStorage({ failDecrypt: true }));
  await assert.rejects(capsule.open(outer(Buffer.from("ciphertext").toString("base64")), CONTEXT, keyRequest), error => {
    assert.equal(error.code, INVALID_CODE);
    assert.equal(error.message, "The Native Member issued capsule is invalid or does not match the expected context.");
    assert.equal(Object.hasOwn(error, "cause"), false);
    assert.doesNotMatch(error.message, /fixture|PRIVATE KEY/);
    return true;
  });
});

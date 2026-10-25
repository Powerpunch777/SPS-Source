import assert from "node:assert/strict";
import { createHash, createPrivateKey, createPublicKey, randomBytes, webcrypto, X509Certificate } from "node:crypto";
import test, { before } from "node:test";
import "reflect-metadata";
import {
  AuthorityKeyIdentifierExtension, BasicConstraintsExtension, CertificatePolicyExtension, ExtendedKeyUsage,
  ExtendedKeyUsageExtension, KeyUsageFlags, KeyUsagesExtension, SubjectKeyIdentifierExtension,
  X509Certificate as ParsedCertificate, X509CertificateGenerator,
} from "@peculiar/x509";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import {
  createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate, publicSpsNativeMemberEnrollmentRequest,
} from "../src/native-member-certificates.mjs";
import {
  inspectSpsNativeMemberCredential, validateSpsNativeMemberCredential,
} from "../src/native-member-credential.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const OTHER_DEVICE = "44444444-4444-4444-8444-444444444444";
const NOW = Math.floor(Date.now() / 1000) * 1000;
const MS_PER_DAY = 86_400_000;
const SIGNING_ALGORITHM = Object.freeze({ name: "ECDSA", hash: "SHA-256" });
const KEY_ALGORITHM = Object.freeze({ name: "ECDSA", namedCurve: "P-256" });
let host, otherHost, keyRequest, certificate, issuerSpkiSha256, otherHostCertificate;

function encodePem(bytes, label) {
  const lines = Buffer.from(bytes).toString("base64").match(/.{1,64}/g);
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function spkiSha256(certificatePem) {
  const certificate = new X509Certificate(certificatePem);
  return createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("hex");
}

function options(overrides = {}) {
  return {
    keyRequest,
    certificate,
    issuerCertificatePem: host.memberIssuer.certificatePem,
    issuerSpkiSha256,
    now: NOW,
    ...overrides,
  };
}

function staticError(error) {
  assert.equal(error.code, "native_member_credential_invalid");
  assert.doesNotMatch(error.message, /PRIVATE KEY|private-path|customer|access_token|[A-Za-z]:\\/);
  assert.equal(Object.hasOwn(error, "cause"), false);
  return true;
}

async function rejectBoth(input) {
  await assert.rejects(validateSpsNativeMemberCredential(input), staticError);
  await assert.rejects(inspectSpsNativeMemberCredential(input), staticError);
}

async function signLeaf(overrides = {}) {
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
  const certificateBytes = await X509CertificateGenerator.create({
    subject: overrides.subject ?? `CN=SPS Member Device ${DEVICE},OU=SPS Native Host ${HOST}`,
    issuer: issuer.subjectName,
    publicKey: leafPublicKey,
    signingKey,
    signingAlgorithm: SIGNING_ALGORITHM,
    serialNumber: serial.toString("hex"),
    notBefore: new Date(overrides.notBefore ?? NOW - 1_000),
    notAfter: new Date(overrides.notAfter ?? NOW + 60_000),
    extensions: [
      new BasicConstraintsExtension(overrides.ca ?? false, overrides.ca ? 0 : undefined, true),
      new KeyUsagesExtension(overrides.ca ? KeyUsageFlags.keyCertSign : KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([overrides.eku ?? ExtendedKeyUsage.clientAuth], true),
      overrides.skiId ? new SubjectKeyIdentifierExtension(overrides.skiId, false)
        : await SubjectKeyIdentifierExtension.create(leafPublicKey, false, webcrypto),
      overrides.akiId ? new AuthorityKeyIdentifierExtension(overrides.akiId, false)
        : await AuthorityKeyIdentifierExtension.create(issuer.publicKey, false, webcrypto),
      ...(overrides.extraExtension ? [overrides.extraExtension] : []),
    ],
  }, webcrypto);

  return {
    ...certificate,
    certificatePem: encodePem(certificateBytes.rawData, "CERTIFICATE"),
  };
}

before(async () => {
  const identityOptions = {
    hostnames: ["127.0.0.1"],
    notBefore: NOW - 60_000,
    notAfter: NOW + 90 * MS_PER_DAY,
    issuerNotAfter: NOW + 365 * MS_PER_DAY,
  };
  host = await createSpsNativeHostIdentity({ ...identityOptions, hostId: HOST });
  otherHost = await createSpsNativeHostIdentity({ ...identityOptions, hostId: OTHER_HOST });
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  const publicRequest = await publicSpsNativeMemberEnrollmentRequest(keyRequest);
  certificate = await issueSpsNativeMemberCertificate({
    hostIdentity: host,
    request: publicRequest,
    notBefore: NOW - 1_000,
    notAfter: NOW + 60_000,
    now: NOW,
  });
  issuerSpkiSha256 = spkiSha256(host.memberIssuer.certificatePem);

  const otherKeyRequest = await createSpsNativeMemberKeyRequest({ hostId: OTHER_HOST, deviceKeyId: DEVICE });
  const otherPublicRequest = await publicSpsNativeMemberEnrollmentRequest(otherKeyRequest);
  otherHostCertificate = await issueSpsNativeMemberCertificate({
    hostIdentity: otherHost,
    request: otherPublicRequest,
    notBefore: NOW - 1_000,
    notAfter: NOW + 60_000,
    now: NOW,
  });
});

test("accepts an issued credential and exposes only frozen public inspection metadata", async () => {
  const credential = await validateSpsNativeMemberCredential(options());
  assert.equal(Object.isFrozen(credential), true);
  assert.deepEqual(Object.keys(credential), [
    "v", "kind", "hostId", "deviceKeyId", "certificatePem", "privateKeyPem", "issuerCertificatePem",
  ]);
  assert.equal(credential.v, 1);
  assert.equal(credential.kind, "sps.native.member-credential");
  assert.equal(credential.hostId, HOST);
  assert.equal(credential.deviceKeyId, DEVICE);
  assert.equal(credential.certificatePem, certificate.certificatePem);
  assert.equal(credential.privateKeyPem, keyRequest.privateKeyPem);
  assert.equal(credential.issuerCertificatePem, host.memberIssuer.certificatePem);
  assert.equal(new X509Certificate(credential.certificatePem).verify(new X509Certificate(credential.issuerCertificatePem).publicKey), true);

  const details = await inspectSpsNativeMemberCredential(options());
  assert.equal(Object.isFrozen(details), true);
  assert.deepEqual(Object.keys(details), [
    "state", "hostId", "deviceKeyId", "certificateSha256", "spkiSha256", "issuerSpkiSha256", "notBefore", "notAfter",
  ]);
  assert.equal(details.state, "credential_prepared");
  assert.equal(details.hostId, HOST);
  assert.equal(details.deviceKeyId, DEVICE);
  assert.equal(details.certificateSha256, createHash("sha256").update(new X509Certificate(certificate.certificatePem).raw).digest("hex"));
  assert.equal(details.spkiSha256, spkiSha256(certificate.certificatePem));
  assert.equal(details.issuerSpkiSha256, issuerSpkiSha256);
  assert.equal(details.notBefore, Date.parse(new X509Certificate(certificate.certificatePem).validFrom));
  assert.equal(details.notAfter, Date.parse(new X509Certificate(certificate.certificatePem).validTo));
  assert.doesNotMatch(JSON.stringify(details), /-----BEGIN|PRIVATE KEY|privateKeyPem|certificatePem|private-path|approved|approval|grant|userId|workspace|nodeId/);
});

test("rejects an issuer PEM or a well-formed but incorrect pinned issuer SPKI", async () => {
  await rejectBoth(options({ issuerSpkiSha256: issuerSpkiSha256 === "a".repeat(64) ? "b".repeat(64) : "a".repeat(64) }));
  await rejectBoth(options({
    issuerCertificatePem: otherHost.memberIssuer.certificatePem,
    issuerSpkiSha256: spkiSha256(otherHost.memberIssuer.certificatePem),
  }));
  await rejectBoth(options({ issuerCertificatePem: "-----BEGIN CERTIFICATE-----\nnot-this-issuer\n-----END CERTIFICATE-----\n" }));
});

test("rejects a valid certificate chain issued by a different Host", async () => {
  await rejectBoth(options({
    keyRequest: await createSpsNativeMemberKeyRequest({ hostId: OTHER_HOST, deviceKeyId: DEVICE }),
    certificate: otherHostCertificate,
  }));
});

test("binds the leaf to the exact local key and Host/device RDN", async () => {
  const differentLocalKey = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  await rejectBoth(options({ keyRequest: differentLocalKey }));

  await rejectBoth(options({ keyRequest: { ...keyRequest, hostId: OTHER_HOST } }));
  await rejectBoth(options({ keyRequest: { ...keyRequest, deviceKeyId: OTHER_DEVICE } }));
  await rejectBoth(options({ certificate: { ...certificate, hostId: OTHER_HOST } }));
  await rejectBoth(options({ certificate: { ...certificate, deviceKeyId: OTHER_DEVICE } }));

  for (const subject of [
    `CN=SPS Member Device ${OTHER_DEVICE},OU=SPS Native Host ${HOST}`,
    `CN=SPS Member Device ${DEVICE},OU=SPS Native Host ${OTHER_HOST}`,
    `CN=SPS Member Device ${DEVICE},OU=SPS Native Host ${HOST},O=unexpected`,
  ]) {
    await rejectBoth(options({ certificate: { ...certificate, certificatePem: (await signLeaf({ subject })).certificatePem } }));
  }
  const extraExtension = await signLeaf({ extraExtension: new CertificatePolicyExtension(["1.3.6.1.4.1.55555.1"]) });
  await rejectBoth(options({ certificate: { ...certificate, certificatePem: extraExtension.certificatePem } }));
});

test("rejects expired and future leaf certificates while their issuer remains current", async () => {
  const expired = await signLeaf({ notBefore: NOW - 120_000, notAfter: NOW - 60_000 });
  const future = await signLeaf({ notBefore: NOW + 60_000, notAfter: NOW + 120_000 });
  assert.equal(Date.parse(new X509Certificate(host.memberIssuer.certificatePem).validTo) > NOW, true);
  await rejectBoth(options({ certificate: { ...certificate, certificatePem: expired.certificatePem } }));
  await rejectBoth(options({ certificate: { ...certificate, certificatePem: future.certificatePem } }));
});

test("rejects a serverAuth leaf and a CA leaf even when signed by the pinned issuer", async () => {
  const serverAuth = await signLeaf({ eku: ExtendedKeyUsage.serverAuth });
  const caLeaf = await signLeaf({ ca: true });
  await rejectBoth(options({ certificate: { ...certificate, certificatePem: serverAuth.certificatePem } }));
  await rejectBoth(options({ certificate: { ...certificate, certificatePem: caLeaf.certificatePem } }));
});

test("rejects malformed and oversized PEM, extra fields, and accessors without invoking getters", async () => {
  await rejectBoth(options({ certificate: { ...certificate, certificatePem: "not a certificate" } }));
  await rejectBoth(options({ certificate: { ...certificate, certificatePem: `-----BEGIN CERTIFICATE-----\n${"A".repeat(8200)}\n-----END CERTIFICATE-----\n` } }));
  await rejectBoth(options({ issuerCertificatePem: `-----BEGIN CERTIFICATE-----\n${"A".repeat(8200)}\n-----END CERTIFICATE-----\n` }));

  let invoked = 0;
  const extra = options({ extra: true });
  await rejectBoth(extra);

  const accessorOptions = options();
  Object.defineProperty(accessorOptions, "now", { enumerable: true, get() { invoked++; return NOW; } });
  await rejectBoth(accessorOptions);

  const accessorCertificate = { ...certificate };
  Object.defineProperty(accessorCertificate, "certificatePem", { enumerable: true, get() { invoked++; return certificate.certificatePem; } });
  await rejectBoth(options({ certificate: accessorCertificate }));
  assert.equal(invoked, 0);
});

test("rejects signed wrong SKI/AKI, duplicate extensions and excessive Member validity", async () => {
  for (const overrides of [{ skiId: "ab".repeat(20) }, { akiId: "cd".repeat(20) },
    { extraExtension: new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true) },
    { notBefore: NOW, notAfter: NOW + 90 * MS_PER_DAY + 1000 }]) {
    await rejectBoth(options({ certificate: await signLeaf(overrides) }));
  }
});

test("requires an explicit valid clock and canonical exact trusted issuer pin", async () => {
  for (const now of [undefined, NaN, Infinity, -1, 0, "123", Number.MAX_SAFE_INTEGER]) await rejectBoth(options({ now }));
  for (const issuerSpkiSha256 of ["", "ab", "a".repeat(63) + "\n", "A".repeat(64)]) {
    await rejectBoth(options({ issuerSpkiSha256 }));
  }
});

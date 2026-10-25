import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createPrivateKey, createPublicKey, webcrypto, X509Certificate } from "node:crypto";
import test, { before } from "node:test";
import { fromBER, Null } from "asn1js";
import "reflect-metadata";
import {
  AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ChallengePasswordAttribute,
  ExtendedKeyUsage, ExtendedKeyUsageExtension, KeyUsageFlags, KeyUsagesExtension,
  Pkcs10CertificateRequest, Pkcs10CertificateRequestGenerator, SubjectKeyIdentifierExtension,
  X509Certificate as ParsedCertificate,
} from "@peculiar/x509";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { defaultSpsNativeCertificateValidity } from "../src/native-connection-policy.mjs";
import {
  createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate, publicSpsNativeMemberEnrollmentRequest,
} from "../src/native-member-certificates.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const DEVICE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const NOW = Math.floor(Date.now() / 1000) * 1000;
const SUBJECT = `CN=SPS Member Device ${DEVICE},OU=SPS Native Host ${HOST}`;
const encode = (bytes, label) => `-----BEGIN ${label}-----\n${Buffer.from(bytes).toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;
let host, local, request;
before(async () => {
  host = await createSpsNativeHostIdentity({ hostId: HOST, hostnames: ["127.0.0.1"],
    notBefore: NOW - 1000, notAfter: NOW + 90 * 86_400_000, issuerNotAfter: NOW + 365 * 86_400_000 });
  local = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  request = await publicSpsNativeMemberEnrollmentRequest(local);
});
const issue = (overrides = {}) => issueSpsNativeMemberCertificate({
  hostIdentity: host, request, notBefore: NOW, notAfter: NOW + 60_000, now: NOW, ...overrides,
});
function staticError(code) {
  return value => {
    assert.equal(value.code, code);
    assert.doesNotMatch(value.message, /PRIVATE KEY|private-path|customer|access_token/);
    assert.equal(Object.hasOwn(value, "cause"), false);
    return true;
  };
}
async function customRequest(options = {}) {
  const curve = options.curve ?? "P-256";
  const keys = options.keys ?? await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: curve }, true, ["sign", "verify"]);
  const csr = await Pkcs10CertificateRequestGenerator.create({
    name: options.subject ?? SUBJECT, keys,
    signingAlgorithm: { name: "ECDSA", hash: options.hash ?? "SHA-256" },
    attributes: options.attributes, extensions: options.extensions,
  }, webcrypto);
  return { ...request, requestPem: encode(csr.rawData, "CERTIFICATE REQUEST") };
}

test("creates a separate P-256 key and signed PKCS#10 request with public-only enrollment projection", async () => {
  const csr = new Pkcs10CertificateRequest(local.requestPem);
  assert.equal(await csr.verify(webcrypto), true);
  assert.equal(csr.attributes.length, 0);
  assert.equal(csr.extensions.length, 0);
  const key = createPrivateKey(local.privateKeyPem);
  assert.equal(key.asymmetricKeyDetails.namedCurve, "prime256v1");
  assert.equal(createPublicKey(key).export({ type: "spki", format: "der" }).toString("hex"), Buffer.from(csr.publicKey.rawData).toString("hex"));
  assert.equal(Object.isFrozen(local), true);
  assert.equal(Object.isFrozen(request), true);
  assert.deepEqual(Object.keys(request), ["v", "kind", "hostId", "deviceKeyId", "requestPem"]);
  assert.doesNotMatch(JSON.stringify(request), /PRIVATE KEY|privateKeyPem|approved|userId|workspace|nodeId/);
  const another = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  assert.notEqual(another.privateKeyPem, local.privateKeyPem);
  assert.notEqual(local.privateKeyPem, host.server.privateKeyPem);
  assert.notEqual(local.privateKeyPem, host.memberIssuer.privateKeyPem);
});

test("issues only an issuer-signed non-CA digitalSignature clientAuth certificate", async () => {
  const result = await issue();
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.hostId, HOST);
  assert.equal(result.deviceKeyId, DEVICE);
  assert.equal(result.issuerCertificatePem, host.memberIssuer.certificatePem);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|privateKeyPem|approved|userId|workspace|nodeId/);
  const leaf = new X509Certificate(result.certificatePem);
  const parsed = new ParsedCertificate(result.certificatePem);
  const issuer = new X509Certificate(result.issuerCertificatePem);
  assert.equal(leaf.verify(issuer.publicKey), true);
  assert.equal(leaf.verify(new X509Certificate(host.server.certificatePem).publicKey), false);
  assert.equal(leaf.ca, false);
  assert.equal(leaf.issuer, issuer.subject);
  assert.deepEqual(leaf.keyUsage, [ExtendedKeyUsage.clientAuth]);
  assert.equal(parsed.getExtension(BasicConstraintsExtension).critical, true);
  assert.equal(parsed.getExtension(BasicConstraintsExtension).pathLength, undefined);
  assert.equal(parsed.getExtension(KeyUsagesExtension).usages, KeyUsageFlags.digitalSignature);
  assert.equal(parsed.getExtension(KeyUsagesExtension).critical, true);
  assert.equal(parsed.getExtension(ExtendedKeyUsageExtension).critical, true);
  assert.equal(parsed.getExtension(SubjectKeyIdentifierExtension).critical, false);
  assert.equal(parsed.getExtension(AuthorityKeyIdentifierExtension).critical, false);
  assert.deepEqual(Array.from(parsed.extensions, value => value.type).sort(), ["2.5.29.14", "2.5.29.15", "2.5.29.19", "2.5.29.35", "2.5.29.37"].sort());
  assert.equal(parsed.getExtension(AuthorityKeyIdentifierExtension).keyId,
    new ParsedCertificate(result.issuerCertificatePem).getExtension(SubjectKeyIdentifierExtension).keyId);
  assert.equal(Date.parse(leaf.validFrom), NOW);
  assert.equal(Date.parse(leaf.validTo), NOW + 60_000);
  assert.equal(leaf.publicKey.export({ type: "spki", format: "pem" }), createPublicKey(createPrivateKey(local.privateKeyPem)).export({ type: "spki", format: "pem" }));
});

test("supports the approved explicit 90-day Member validity without choosing it implicitly", async () => {
  const validity = defaultSpsNativeCertificateValidity("member-device", NOW);
  const result = await issue({ notBefore: validity.notBeforeEpochSeconds * 1000, notAfter: validity.notAfterEpochSeconds * 1000 });
  assert.equal(Date.parse(new X509Certificate(result.certificatePem).validTo) - NOW, 90 * 86_400_000);
  await assert.rejects(issue({ notAfter: NOW + 90 * 86_400_000 + 1000 }), staticError("native_member_issuance_invalid"));
});

test("rejects invalid, extra, accessor and non-data generation arguments before running getters", async () => {
  let called = false;
  const getter = Object.defineProperty({ deviceKeyId: DEVICE }, "hostId", { enumerable: true, get() { called = true; return HOST; } });
  for (const value of [undefined, {}, { hostId: HOST, deviceKeyId: DEVICE, path: "private-path" }, { hostId: HOST + "\n", deviceKeyId: DEVICE },
    { hostId: HOST, deviceKeyId: "not-a-uuid" }, getter, Object.create({ hostId: HOST, deviceKeyId: DEVICE })]) {
    await assert.rejects(createSpsNativeMemberKeyRequest(value), staticError("native_member_request_invalid"));
  }
  assert.equal(called, false);
});

test("projection rejects mismatched private keys, changed scope and extra private metadata", async () => {
  for (const value of [{ ...local, privateKeyPem: host.server.privateKeyPem }, { ...local, hostId: OTHER },
    { ...local, deviceKeyId: OTHER }, { ...local, userId: "customer" }, { ...local, privateKeyPem: "private-path" }]) {
    await assert.rejects(publicSpsNativeMemberEnrollmentRequest(value), staticError("native_member_request_invalid"));
  }
});

test("rejects wrong Host/key subject, requested extensions, attributes, curve or signature hash", async () => {
  for (const options of [
    { subject: `CN=SPS Member Device ${OTHER},OU=SPS Native Host ${HOST}` },
    { subject: `CN=SPS Member Device ${DEVICE},OU=SPS Native Host ${OTHER}` },
    { subject: SUBJECT + ",O=unexpected" }, { subject: SUBJECT + `,CN=SPS Member Device ${DEVICE}` },
    { subject: SUBJECT + `,OU=SPS Native Host ${HOST}` }, { curve: "P-384" }, { hash: "SHA-384" },
    { extensions: [new BasicConstraintsExtension(true, 0, true)] },
    { attributes: [new ChallengePasswordAttribute("unexpected")] },
  ]) await assert.rejects(issue({ request: await customRequest(options) }), staticError("native_member_issuance_invalid"));
});

test("does not reuse either Host server or Member issuer key for a Member certificate", async () => {
  for (const pair of [host.server, host.memberIssuer]) {
    const privateKey = await webcrypto.subtle.importKey("pkcs8", createPrivateKey(pair.privateKeyPem).export({ type: "pkcs8", format: "der" }), { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const publicKey = await webcrypto.subtle.importKey("spki", createPublicKey(createPrivateKey(pair.privateKeyPem)).export({ type: "spki", format: "der" }), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
    await assert.rejects(issue({ request: await customRequest({ keys: { publicKey, privateKey } }) }), staticError("native_member_issuance_invalid"));
  }
});

test("rejects tampered signatures, trailing ASN.1 bytes, malformed wrapping and oversized requests", async () => {
  const original = Buffer.from(local.requestPem.split("\n").slice(1, -2).join(""), "base64");
  const tampered = Buffer.from(original); tampered[tampered.length - 1] ^= 1;
  const lengthBytes = original[1] < 128 ? 1 : 1 + (original[1] & 0x7f);
  const indefinite = Buffer.concat([Buffer.from([0x30, 0x80]), original.subarray(1 + lengthBytes), Buffer.from([0, 0])]);
  for (const requestPem of [encode(tampered, "CERTIFICATE REQUEST"), encode(Buffer.concat([original, Buffer.from([0])]), "CERTIFICATE REQUEST"),
    encode(indefinite, "CERTIFICATE REQUEST"), local.requestPem.replaceAll("\n", "\r\n"), local.requestPem + "\n",
    encode(Buffer.alloc(4097), "CERTIFICATE REQUEST"), "PRIVATE KEY customer"]) {
    await assert.rejects(issue({ request: { ...request, requestPem } }), staticError("native_member_issuance_invalid"));
  }
});

test("rejects unsigned extra outer fields and unexpected ECDSA algorithm parameters", async () => {
  const original = Buffer.from(new Pkcs10CertificateRequest(local.requestPem).rawData);
  const extra = fromBER(original).result;
  extra.valueBlock.value.push(new Null());
  const parameters = fromBER(original).result;
  parameters.valueBlock.value[1].valueBlock.value.push(new Null());
  for (const bytes of [extra.toBER(false), parameters.toBER(false)]) {
    await assert.rejects(issue({ request: { ...request, requestPem: encode(bytes, "CERTIFICATE REQUEST") } }),
      staticError("native_member_issuance_invalid"));
  }
});

test("rejects expired/not-yet-current Host identity, invalid clock or unsupported validity windows", async () => {
  for (const overrides of [{ now: undefined }, { now: Infinity }, { now: -1 }, { notBefore: NOW + 1000 },
    { notAfter: NOW }, { notBefore: NOW - 2000 }, { notBefore: NOW + 1 }, { notAfter: NOW + 60_001 },
    { now: NOW + 90 * 86_400_000 }, { now: NOW - 2000 }]) {
    await assert.rejects(issue(overrides), staticError("native_member_issuance_invalid"));
  }
  const shortIssuer = await createSpsNativeHostIdentity({ hostId: HOST, hostnames: ["127.0.0.1"],
    notBefore: NOW - 1000, notAfter: NOW + 30_000, issuerNotAfter: NOW + 40_000 });
  await assert.rejects(issue({ hostIdentity: shortIssuer }), staticError("native_member_issuance_invalid"));
});

test("issuance rejects extra fields and never accepts a private-key-bearing enrollment DTO", async () => {
  await assert.rejects(issue({ unexpected: true }), staticError("native_member_issuance_invalid"));
  await assert.rejects(issue({ request: { ...request, privateKeyPem: local.privateKeyPem } }), staticError("native_member_issuance_invalid"));
  await assert.rejects(issue({ request: { ...request, hostId: OTHER } }), staticError("native_member_issuance_invalid"));
});

test("the Member PKI remains an inactive primitive without disk, subprocess, listener or renderer callsites", async () => {
  const source = await readFile(new URL("../src/native-member-certificates.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:(?:fs|child_process|tls|http)|safeStorage|\.listen\(|console\./);
  for (const file of ["../src/main.mjs", "../src/preload.cjs", "../src/core-settings-preload.cjs"]) {
    assert.doesNotMatch(await readFile(new URL(file, import.meta.url), "utf8"), /native-member-certificates|issueSpsNativeMemberCertificate/);
  }
});

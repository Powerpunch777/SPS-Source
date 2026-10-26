import "reflect-metadata";
import { createHash, createPrivateKey, createPublicKey, randomBytes, webcrypto, X509Certificate } from "node:crypto";
import {
  AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension,
  KeyUsageFlags, KeyUsagesExtension, Name, Pkcs10CertificateRequest, Pkcs10CertificateRequestGenerator,
  SubjectKeyIdentifierExtension, X509Certificate as ParsedCertificate, X509CertificateGenerator,
} from "@peculiar/x509";
import { requireCurrentSpsNativeHostIdentity } from "./native-identity-certificates.mjs";
import { SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS } from "./native-connection-policy.mjs";
import {
  nativeCertificateRecord as record, nativeCertificateUuid as uuid, nativeCertificateDate as date,
  decodeNativeCertificatePem as pem, encodeNativeCertificatePem as encodePem, nativeCertificatePublicDer as publicDer,
  parseBoundedNativeCertificateDer, NATIVE_CERTIFICATE_PARSE_OPTIONS as PARSE_OPTIONS,
} from "./native-certificate-primitives.mjs";

const KEY_ALGORITHM = Object.freeze({ name: "ECDSA", namedCurve: "P-256" });
const SIGNING_ALGORITHM = Object.freeze({ name: "ECDSA", hash: "SHA-256" });
const MESSAGES = Object.freeze({
  native_member_request_invalid: "The Native Member certificate request is invalid.",
  native_member_key_generation_failed: "The Native Member key request could not be created.",
  native_member_issuance_invalid: "The Native Member certificate issuance context is invalid.",
  native_member_issuance_failed: "The Native Member certificate could not be issued.",
});
const failure = code => Object.assign(new Error(MESSAGES[code]), { code });
const memberSubject = (hostId, deviceKeyId) => `CN=SPS Member Device ${deviceKeyId},OU=SPS Native Host ${hostId}`;

function requireP256(key) {
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("curve");
  return key;
}

async function parseRequest(input) {
  const value = record(input, ["v", "kind", "hostId", "deviceKeyId", "requestPem"]);
  if (value.v !== 1 || value.kind !== "sps.native.member-enrollment-request") throw new Error("kind");
  uuid(value.hostId); uuid(value.deviceKeyId);
  const bytes = pem(value.requestPem, "CERTIFICATE REQUEST");
  const der = parseBoundedNativeCertificateDer(bytes);
  const parts = der.valueBlock.value;
  const info = parts?.[0]?.valueBlock.value;
  if (!Array.isArray(parts) || parts.length !== 3 || !Array.isArray(info) || info.length !== 4
    || info[0].valueBlock.valueDec !== 0 || !Buffer.from(info[0].valueBlock.valueHexView).equals(Buffer.from([0]))
    || parts[1].valueBlock.value?.length !== 1 || parts[2].valueBlock.unusedBits !== 0
    || info[3].idBlock.tagClass !== 3 || info[3].idBlock.tagNumber !== 0
    || !info[3].idBlock.isConstructed || info[3].valueBlock.value?.length !== 0) throw new Error("profile");
  const request = new Pkcs10CertificateRequest(bytes, PARSE_OPTIONS);
  const publicKeyBytes = Buffer.from(request.publicKey.rawData);
  const publicKey = requireP256(createPublicKey({ key: publicKeyBytes, format: "der", type: "spki" }));
  if (!publicDer(publicKey).equals(publicKeyBytes)
    || !Buffer.from(request.subjectName.toArrayBuffer()).equals(Buffer.from(new Name(memberSubject(value.hostId, value.deviceKeyId)).toArrayBuffer()))
    || request.attributes.length || request.extensions.length
    || request.signatureAlgorithm.name !== "ECDSA" || request.signatureAlgorithm.hash?.name !== "SHA-256"
    || !await request.verify(webcrypto)) throw new Error("request");
  return { value: Object.freeze(value), request, publicKey };
}

// This signs only a PKCS#10 request. It is not a live TLS proof, user login or approval.
export async function createSpsNativeMemberKeyRequest(options) {
  let value;
  try {
    value = record(options, ["hostId", "deviceKeyId"]);
    uuid(value.hostId); uuid(value.deviceKeyId);
  } catch { throw failure("native_member_request_invalid"); }
  try {
    const keys = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ["sign", "verify"]);
    const request = await Pkcs10CertificateRequestGenerator.create({
      name: memberSubject(value.hostId, value.deviceKeyId), keys, signingAlgorithm: SIGNING_ALGORITHM,
    }, webcrypto);
    const privateBytes = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", keys.privateKey));
    try {
      return Object.freeze({ v: 1, kind: "sps.native.member-key-request", ...value,
        requestPem: encodePem(request.rawData, "CERTIFICATE REQUEST"), privateKeyPem: encodePem(privateBytes, "PRIVATE KEY") });
    } finally { privateBytes.fill(0); }
  } catch { throw failure("native_member_key_generation_failed"); }
}

// Public, bounded PKCS#10 inspection for the Main signing boundary. No key is
// generated or returned; renewal uses the already protected original request.
export async function inspectSpsNativeMemberEnrollmentRequest(input) {
  try {
    const parsed = await parseRequest(input);
    return Object.freeze({ hostId: parsed.value.hostId, deviceKeyId: parsed.value.deviceKeyId,
      spkiSha256: createHash("sha256").update(publicDer(parsed.publicKey)).digest("hex"),
      requestSha256: createHash("sha256").update(parsed.value.requestPem).digest("hex") });
  } catch { throw failure("native_member_request_invalid"); }
}

export async function publicSpsNativeMemberEnrollmentRequest(input) {
  try {
    const value = record(input, ["v", "kind", "hostId", "deviceKeyId", "requestPem", "privateKeyPem"]);
    if (value.v !== 1 || value.kind !== "sps.native.member-key-request") throw new Error("kind");
    const parsed = await parseRequest({ v: 1, kind: "sps.native.member-enrollment-request",
      hostId: value.hostId, deviceKeyId: value.deviceKeyId, requestPem: value.requestPem });
    const privateBytes = pem(value.privateKeyPem, "PRIVATE KEY");
    try {
      if (privateBytes.length > 2048) throw new Error("size");
      const privateKey = requireP256(createPrivateKey({ key: privateBytes, type: "pkcs8", format: "der" }));
      if (!privateKey.export({ type: "pkcs8", format: "der" }).equals(privateBytes)
        || !publicDer(createPublicKey(privateKey)).equals(publicDer(parsed.publicKey))) throw new Error("pair");
      return parsed.value;
    } finally { privateBytes.fill(0); }
  } catch { throw failure("native_member_request_invalid"); }
}

// Internal signing primitive, not an authorization endpoint. The trusted caller must
// bind login, current TLS possession, invitation consumption and pending registration.
export async function issueSpsNativeMemberCertificate(options) {
  let value, host, parsed, notBefore, notAfter;
  try {
    value = record(options, ["hostIdentity", "request", "notBefore", "notAfter", "now"]);
    if (!Number.isSafeInteger(value.now) || value.now <= 0) throw new Error("clock");
    host = requireCurrentSpsNativeHostIdentity(value.hostIdentity, value.now);
    notBefore = date(value.notBefore); notAfter = date(value.notAfter);
    const issuer = new X509Certificate(host.memberIssuer.certificatePem);
    if (notBefore.getTime() > value.now || notAfter.getTime() <= value.now || notBefore >= notAfter
      || notAfter - notBefore > SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS * 86_400_000
      || notBefore.getTime() < Date.parse(issuer.validFrom) || notAfter.getTime() > Date.parse(issuer.validTo)) throw new Error("dates");
    parsed = await parseRequest(value.request);
    if (parsed.value.hostId !== host.hostId || publicDer(parsed.publicKey).equals(publicDer(issuer.publicKey))
      || publicDer(parsed.publicKey).equals(publicDer(new X509Certificate(host.server.certificatePem).publicKey))) throw new Error("scope");
  } catch { throw failure("native_member_issuance_invalid"); }
  try {
    const issuer = new ParsedCertificate(host.memberIssuer.certificatePem);
    const privateBytes = pem(host.memberIssuer.privateKeyPem, "PRIVATE KEY");
    let signingKey;
    try { signingKey = await webcrypto.subtle.importKey("pkcs8", privateBytes, KEY_ALGORITHM, false, ["sign"]); }
    finally { privateBytes.fill(0); }
    const serial = randomBytes(20);
    serial[0] = (serial[0] & 0x7f) | 1;
    const publicKey = await parsed.request.publicKey.export(webcrypto);
    const certificate = await X509CertificateGenerator.create({
      subject: memberSubject(host.hostId, parsed.value.deviceKeyId), issuer: issuer.subjectName,
      publicKey, signingKey, signingAlgorithm: SIGNING_ALGORITHM, serialNumber: serial.toString("hex"),
      notBefore, notAfter, extensions: [
        new BasicConstraintsExtension(false, undefined, true),
        new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
        new ExtendedKeyUsageExtension([ExtendedKeyUsage.clientAuth], true),
        await SubjectKeyIdentifierExtension.create(publicKey, false, webcrypto),
        await AuthorityKeyIdentifierExtension.create(issuer.publicKey, false, webcrypto),
      ],
    }, webcrypto);
    const certificatePem = encodePem(certificate.rawData, "CERTIFICATE");
    const leaf = new X509Certificate(certificatePem);
    if (leaf.ca || !leaf.verify(new X509Certificate(host.memberIssuer.certificatePem).publicKey)
      || !publicDer(leaf.publicKey).equals(publicDer(parsed.publicKey))) throw new Error("generated");
    return Object.freeze({ v: 1, kind: "sps.native.member-certificate", hostId: host.hostId,
      deviceKeyId: parsed.value.deviceKeyId, certificatePem, issuerCertificatePem: host.memberIssuer.certificatePem });
  } catch { throw failure("native_member_issuance_failed"); }
}

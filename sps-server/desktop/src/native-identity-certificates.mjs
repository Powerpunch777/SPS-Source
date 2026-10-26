import "reflect-metadata";
import { createHash, createPrivateKey, createPublicKey, randomBytes, webcrypto, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import {
  BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension,
  KeyUsageFlags, KeyUsagesExtension, SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension, X509Certificate as ParsedCertificate, X509CertificateGenerator,
} from "@peculiar/x509";
import {
  nativeCertificateRecord as record, nativeCertificateUuid as uuid, nativeCertificateDate as date,
  decodeNativeCertificatePem as pem, encodeNativeCertificatePem as encodePem, nativeCertificatePublicDer as publicDer,
  parseBoundedNativeCertificateDer, NATIVE_CERTIFICATE_PARSE_OPTIONS,
} from "./native-certificate-primitives.mjs";

const SIGNING_ALGORITHM = Object.freeze({ name: "ECDSA", hash: "SHA-256" });
const KEY_ALGORITHM = Object.freeze({ name: "ECDSA", namedCurve: "P-256" });
const MESSAGES = Object.freeze({
  native_identity_invalid: "The SPS native Host identity is invalid. Existing credentials were not replaced.",
  native_identity_invalid_options: "The SPS native identity creation options are invalid.",
  native_identity_generation_failed: "The SPS native Host identity could not be created.",
  native_identity_not_current: "The SPS native Host identity is not currently valid. Explicit recovery is required.",
});

function failure(code) {
  return Object.assign(new Error(MESSAGES[code]), { code });
}

function hostname(value) {
  if (typeof value !== "string" || !value || value.length > 253 || value !== value.toLowerCase()
    || /[^a-z0-9.:-]/.test(value)) throw new Error("hostname");
  if (isIP(value)) return value;
  if (!value.split(".").every(label => label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new Error("hostname");
  }
  // Do not reinterpret malformed dotted IP addresses as DNS identifiers.
  if (/^[0-9.]+$/.test(value)) throw new Error("hostname");
  return value;
}

function names(values) {
  if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype
    || values.length < 1 || values.length > 16) throw new Error("names");
  const descriptors = Object.getOwnPropertyDescriptors(values);
  const keys = Array.from({ length: values.length }, (_, index) => String(index));
  if (Reflect.ownKeys(descriptors).length !== keys.length + 1
    || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new Error("names");
  const snapshot = keys.map(key => hostname(descriptors[key].value));
  if (new Set(snapshot).size !== snapshot.length) throw new Error("names");
  return snapshot;
}

function checkCertificate(certificatePem, hostId, issuer) {
  const der = pem(certificatePem, "CERTIFICATE");
  parseBoundedNativeCertificateDer(der);
  const certificate = new X509Certificate(der);
  const parsed = new ParsedCertificate(der, NATIVE_CERTIFICATE_PARSE_OPTIONS);
  if (parsed.signatureAlgorithm.name !== "ECDSA" || parsed.signatureAlgorithm.hash?.name !== "SHA-256"
    || !certificate.raw.equals(der)
    || certificate.subject !== `CN=SPS ${issuer ? "Member Issuer" : "Native Host"} ${hostId}`
    || certificate.subject !== certificate.issuer || !certificate.verify(certificate.publicKey)
    || certificate.publicKey.asymmetricKeyType !== "ec"
    || certificate.publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("certificate");
  const before = Date.parse(certificate.validFrom);
  const after = Date.parse(certificate.validTo);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before >= after) throw new Error("dates");
  const basic = parsed.getExtension(BasicConstraintsExtension);
  const usage = parsed.getExtension(KeyUsagesExtension);
  const extended = parsed.getExtension(ExtendedKeyUsageExtension);
  const san = parsed.getExtension(SubjectAlternativeNameExtension);
  const ids = parsed.extensions.map(extension => extension.type);
  const allowedIds = ["2.5.29.19", "2.5.29.15", "2.5.29.14", ...(issuer ? [] : ["2.5.29.37", "2.5.29.17"])];
  const ski = parsed.getExtension(SubjectKeyIdentifierExtension);
  if (ids.length !== allowedIds.length || new Set(ids).size !== ids.length || ids.some(id => !allowedIds.includes(id))
    || !ski || ski.critical
    || !basic?.critical || basic.ca !== issuer || certificate.ca !== issuer
    || !usage?.critical || usage.usages !== (issuer ? KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign : KeyUsageFlags.digitalSignature)) {
    throw new Error("purpose");
  }
  if (issuer) {
    if (basic.pathLength !== 0 || extended || san) throw new Error("issuer");
  } else {
    if (basic.pathLength !== undefined || !extended?.critical || extended.usages.length !== 1
      || extended.usages[0] !== ExtendedKeyUsage.serverAuth || !san || san.critical) throw new Error("server");
    const entries = san.names.items;
    const values = names(entries.map(entry => entry.value));
    if (entries.some((entry, index) => entry.type !== (isIP(values[index]) ? "ip" : "dns"))) throw new Error("san");
  }
  return { certificate, parsed, before, after };
}

function checkPair(input, hostId, issuer) {
  const pair = record(input, ["certificatePem", "privateKeyPem"]);
  const details = checkCertificate(pair.certificatePem, hostId, issuer);
  const privateDer = pem(pair.privateKeyPem, "PRIVATE KEY");
  try {
    if (privateDer.length > 2048) throw new Error("size");
    const privateKey = createPrivateKey({ key: privateDer, type: "pkcs8", format: "der" });
    if (!privateKey.export({ type: "pkcs8", format: "der" }).equals(privateDer)
      || privateKey.asymmetricKeyType !== "ec" || privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
      || !publicDer(details.certificate.publicKey).equals(publicDer(createPublicKey(privateKey)))) throw new Error("pair");
    return { ...details, pair: Object.freeze(pair) };
  } finally { privateDer.fill(0); }
}

// Public material only. The caller supplies the Host identity learned over pinned TLS.
export function validateSpsNativeMemberIssuerCertificate(certificatePem, hostId, now) {
  try {
    uuid(hostId);
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("clock");
    const details = checkCertificate(certificatePem, hostId, true);
    if (now < details.before || now >= details.after) throw new Error("validity");
    return details.certificate;
  } catch { throw failure("native_identity_invalid"); }
}

// Public material only. The certificate must be the current SPS Native Host server profile.
export function validateSpsNativeServerCertificate(certificatePem, hostId, now) {
  try {
    uuid(hostId);
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("clock");
    const details = checkCertificate(certificatePem, hostId, false);
    if (now < details.before || now >= details.after) throw new Error("validity");
    return details.certificate;
  } catch { throw failure("native_identity_invalid"); }
}

function parseIdentity(input) {
  const value = record(input, ["v", "kind", "hostId", "server", "memberIssuer"]);
  if (value.v !== 1 || value.kind !== "sps.native.host-identity") throw new Error("identity");
  uuid(value.hostId);
  const server = checkPair(value.server, value.hostId, false);
  const issuer = checkPair(value.memberIssuer, value.hostId, true);
  if (publicDer(server.certificate.publicKey).equals(publicDer(issuer.certificate.publicKey))
    || issuer.before > server.before || issuer.after < server.after) throw new Error("separation");
  return {
    value: Object.freeze({ ...value, server: server.pair, memberIssuer: issuer.pair }),
    server, issuer,
  };
}

// Structural/cryptographic validation also permits expired records for explicit recovery.
// A caller must separately require current validity before any TLS use or issuance.
export function validateSpsNativeHostIdentity(input) {
  try { return parseIdentity(input).value; }
  catch { throw failure("native_identity_invalid"); }
}

// No private key, certificate PEM, filesystem path or user identity reaches a status DTO.
export function inspectSpsNativeHostIdentity(input, now = Date.now()) {
  try {
    if (!Number.isSafeInteger(now) || now <= 0) throw new Error("clock");
    const { value, server, issuer } = parseIdentity(input);
    const current = now >= server.before && now < server.after && now >= issuer.before && now < issuer.after;
    return Object.freeze({
      state: current ? "identity_prepared" : "identity_not_current",
      hostId: value.hostId,
      serverSpkiSha256: createHash("sha256").update(publicDer(server.certificate.publicKey)).digest("hex"),
      memberIssuerSpkiSha256: createHash("sha256").update(publicDer(issuer.certificate.publicKey)).digest("hex"),
      serverNotBefore: server.before, serverNotAfter: server.after,
      memberIssuerNotBefore: issuer.before, memberIssuerNotAfter: issuer.after,
    });
  } catch { throw failure("native_identity_invalid"); }
}

export function requireCurrentSpsNativeHostIdentity(input, now = Date.now()) {
  const identity = validateSpsNativeHostIdentity(input);
  if (inspectSpsNativeHostIdentity(identity, now).state !== "identity_prepared") throw failure("native_identity_not_current");
  return identity;
}

async function selfSignedPair(hostId, hostnames, notBefore, notAfter, issuer) {
  const keys = await webcrypto.subtle.generateKey(KEY_ALGORITHM, true, ["sign", "verify"]);
  const serial = randomBytes(20);
  serial[0] = (serial[0] & 0x7f) | 1;
  const extensions = [
    new BasicConstraintsExtension(issuer, issuer ? 0 : undefined, true),
    new KeyUsagesExtension(issuer ? KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign : KeyUsageFlags.digitalSignature, true),
    await SubjectKeyIdentifierExtension.create(keys.publicKey, false, webcrypto),
  ];
  if (!issuer) extensions.push(
    new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth], true),
    new SubjectAlternativeNameExtension(hostnames.map(value => ({ type: isIP(value) ? "ip" : "dns", value }))),
  );
  const certificate = await X509CertificateGenerator.createSelfSigned({
    name: `CN=SPS ${issuer ? "Member Issuer" : "Native Host"} ${hostId}`,
    serialNumber: serial.toString("hex"), notBefore, notAfter, keys,
    signingAlgorithm: SIGNING_ALGORITHM, extensions,
  }, webcrypto);
  const exported = Buffer.from(await webcrypto.subtle.exportKey("pkcs8", keys.privateKey));
  try {
    return { certificatePem: encodePem(certificate.rawData, "CERTIFICATE"), privateKeyPem: encodePem(exported, "PRIVATE KEY") };
  } finally { exported.fill(0); }
}

// Inactive Main-process primitive. No implicit lifetime, disk write, OS trust or listener.
// DPAPI protection is provided separately; JS-exportable keys are not TPM attestation.
export async function createSpsNativeHostIdentity(options) {
  let value;
  try {
    value = record(options, ["hostId", "hostnames", "notBefore", "notAfter", "issuerNotAfter"]);
    uuid(value.hostId);
    value.hostnames = names(value.hostnames);
    value.notBefore = date(value.notBefore);
    value.notAfter = date(value.notAfter);
    value.issuerNotAfter = date(value.issuerNotAfter);
    if (value.notBefore >= value.notAfter || value.notAfter > value.issuerNotAfter) throw new Error("dates");
  } catch { throw failure("native_identity_invalid_options"); }
  try {
    const server = await selfSignedPair(value.hostId, value.hostnames, value.notBefore, value.notAfter, false);
    const memberIssuer = await selfSignedPair(value.hostId, [], value.notBefore, value.issuerNotAfter, true);
    return validateSpsNativeHostIdentity({ v: 1, kind: "sps.native.host-identity", hostId: value.hostId, server, memberIssuer });
  } catch { throw failure("native_identity_generation_failed"); }
}

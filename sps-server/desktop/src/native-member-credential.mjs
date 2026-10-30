import { createHash, createPrivateKey, createPublicKey, X509Certificate, webcrypto } from "node:crypto";
import { loadNativeCertificateLibrary } from "./native-certificate-library.mjs";
import { validateSpsNativeMemberIssuerCertificate } from "./native-identity-certificates.mjs";
import { publicSpsNativeMemberEnrollmentRequest } from "./native-member-certificates.mjs";
import { SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS } from "./native-connection-policy.mjs";
import {
  nativeCertificateRecord as record, decodeNativeCertificatePem as pem, nativeCertificatePublicDer as publicDer,
  parseBoundedNativeCertificateDer, NATIVE_CERTIFICATE_PARSE_OPTIONS,
} from "./native-certificate-primitives.mjs";

const invalid = () => Object.assign(new Error("The Native Member credential is invalid or does not match the trusted Host and local key."),
  { code: "native_member_credential_invalid" });
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

// The expected issuer and pin must come from the trusted pinned-Host exchange,
// never merely from the certificate response being inspected. This grants no access.
export async function validateSpsNativeMemberCredential(options) {
  try {
    const value = record(options, ["keyRequest", "certificate", "issuerCertificatePem", "issuerSpkiSha256", "now"]);
    if (!Number.isSafeInteger(value.now) || value.now <= 0 || !Number.isFinite(new Date(value.now).getTime())
      || typeof value.issuerSpkiSha256 !== "string" || value.issuerSpkiSha256.length !== 64
      || !/^[0-9a-f]{64}$/.test(value.issuerSpkiSha256)) throw new Error("context");
    const key = record(value.keyRequest, ["v", "kind", "hostId", "deviceKeyId", "requestPem", "privateKeyPem"]);
    const certificate = record(value.certificate, ["v", "kind", "hostId", "deviceKeyId", "certificatePem", "issuerCertificatePem"]);
    const request = await publicSpsNativeMemberEnrollmentRequest(key);
    if (certificate.v !== 1 || certificate.kind !== "sps.native.member-certificate"
      || certificate.hostId !== request.hostId || certificate.deviceKeyId !== request.deviceKeyId
      || certificate.issuerCertificatePem !== value.issuerCertificatePem) throw new Error("scope");
    const issuer = validateSpsNativeMemberIssuerCertificate(value.issuerCertificatePem, request.hostId, value.now);
    if (digest(publicDer(issuer.publicKey)) !== value.issuerSpkiSha256) throw new Error("pin");
    const der = pem(certificate.certificatePem, "CERTIFICATE");
    parseBoundedNativeCertificateDer(der);
    const leaf = new X509Certificate(der);
    const {
      AuthorityKeyIdentifierExtension, BasicConstraintsExtension, ExtendedKeyUsage, ExtendedKeyUsageExtension,
      KeyUsageFlags, KeyUsagesExtension, Name, SubjectKeyIdentifierExtension,
      X509Certificate: ParsedCertificate,
    } = loadNativeCertificateLibrary();
    const parsed = new ParsedCertificate(der, NATIVE_CERTIFICATE_PARSE_OPTIONS);
    const expectedName = new Name(`CN=SPS Member Device ${request.deviceKeyId},OU=SPS Native Host ${request.hostId}`);
    const issuerParsed = new ParsedCertificate(issuer.raw, NATIVE_CERTIFICATE_PARSE_OPTIONS);
    const privateKey = createPrivateKey(key.privateKeyPem);
    if (!leaf.raw.equals(der) || leaf.ca || !leaf.verify(issuer.publicKey) || !leaf.checkIssued(issuer)
      || !Buffer.from(parsed.subjectName.toArrayBuffer()).equals(Buffer.from(expectedName.toArrayBuffer()))
      || !Buffer.from(parsed.issuerName.toArrayBuffer()).equals(Buffer.from(issuerParsed.subjectName.toArrayBuffer()))
      || leaf.publicKey.asymmetricKeyType !== "ec" || leaf.publicKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
      || !publicDer(leaf.publicKey).equals(publicDer(createPublicKey(privateKey)))
      || publicDer(leaf.publicKey).equals(publicDer(issuer.publicKey))
      || parsed.signatureAlgorithm.name !== "ECDSA" || parsed.signatureAlgorithm.hash?.name !== "SHA-256") throw new Error("leaf");
    const notBefore = Date.parse(leaf.validFrom), notAfter = Date.parse(leaf.validTo);
    if (!Number.isSafeInteger(notBefore) || !Number.isSafeInteger(notAfter) || notBefore > value.now || notAfter <= value.now
      || notBefore >= notAfter || notAfter - notBefore > SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS * 86_400_000
      || notBefore < Date.parse(issuer.validFrom) || notAfter > Date.parse(issuer.validTo)) throw new Error("validity");
    const allowed = ["2.5.29.19", "2.5.29.15", "2.5.29.37", "2.5.29.14", "2.5.29.35"];
    const ids = Array.from(parsed.extensions, extension => extension.type);
    const basic = parsed.getExtension(BasicConstraintsExtension), usage = parsed.getExtension(KeyUsagesExtension);
    const extended = parsed.getExtension(ExtendedKeyUsageExtension), ski = parsed.getExtension(SubjectKeyIdentifierExtension);
    const aki = parsed.getExtension(AuthorityKeyIdentifierExtension), issuerSki = issuerParsed.getExtension(SubjectKeyIdentifierExtension);
    const expectedSki = await SubjectKeyIdentifierExtension.create(await parsed.publicKey.export(webcrypto), false, webcrypto);
    const expectedIssuerSki = await SubjectKeyIdentifierExtension.create(await issuerParsed.publicKey.export(webcrypto), false, webcrypto);
    if (ids.length !== allowed.length || new Set(ids).size !== ids.length || ids.some(id => !allowed.includes(id))
      || !basic?.critical || basic.ca || basic.pathLength !== undefined
      || !usage?.critical || usage.usages !== KeyUsageFlags.digitalSignature
      || !extended?.critical || extended.usages.length !== 1 || extended.usages[0] !== ExtendedKeyUsage.clientAuth
      || !ski || ski.critical || ski.keyId !== expectedSki.keyId
      || !aki || aki.critical || aki.certId !== undefined || aki.keyId !== issuerSki?.keyId
      || issuerSki.keyId !== expectedIssuerSki.keyId) throw new Error("purpose");
    return Object.freeze({ v: 1, kind: "sps.native.member-credential", hostId: request.hostId, deviceKeyId: request.deviceKeyId,
      certificatePem: certificate.certificatePem, privateKeyPem: key.privateKeyPem, issuerCertificatePem: value.issuerCertificatePem });
  } catch { throw invalid(); }
}

export async function inspectSpsNativeMemberCredential(options) {
  const credential = await validateSpsNativeMemberCredential(options);
  const certificate = new X509Certificate(credential.certificatePem);
  return Object.freeze({ state: "credential_prepared", hostId: credential.hostId, deviceKeyId: credential.deviceKeyId,
    certificateSha256: digest(certificate.raw), spkiSha256: digest(publicDer(certificate.publicKey)),
    issuerSpkiSha256: digest(publicDer(new X509Certificate(credential.issuerCertificatePem).publicKey)),
    notBefore: Date.parse(certificate.validFrom), notAfter: Date.parse(certificate.validTo) });
}

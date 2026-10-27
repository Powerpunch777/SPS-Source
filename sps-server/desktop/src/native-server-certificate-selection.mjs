import { createHash, X509Certificate } from "node:crypto";

const PREFIX = ".sps-native.invalid";
const ALIAS = /^([0-9a-f]{32})\.([0-9a-f]{32})\.sps-native\.invalid$/;

export function nativeServerCertificateServername(certificatePem) {
  if (typeof certificatePem !== "string" || !certificatePem.length || certificatePem.length > 16_384) {
    throw new TypeError("Invalid SPS Native server certificate.");
  }
  const certificate = new X509Certificate(certificatePem);
  const hash = createHash("sha256").update(certificate.raw).digest("hex");
  return `${hash.slice(0, 32)}.${hash.slice(32)}${PREFIX}`;
}

export function parseNativeServerCertificateServername(servername) {
  if (typeof servername !== "string" || !servername.toLowerCase().includes(PREFIX)) return null;
  const match = ALIAS.exec(servername);
  if (!match || servername !== servername.toLowerCase()) return Object.freeze({ reserved: true, valid: false });
  return Object.freeze({ reserved: true, valid: true, certificateSha256: `${match[1]}${match[2]}` });
}

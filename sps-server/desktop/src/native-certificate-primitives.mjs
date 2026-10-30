import { loadNativeAsn1Library } from "./native-certificate-library.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const NATIVE_CERTIFICATE_PARSE_OPTIONS = Object.freeze({ berOptions: Object.freeze({ maxDepth: 16, maxNodes: 256, maxContentLength: 4096 }) });

export function nativeCertificateRecord(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("record");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length
    || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], "value"))
    || Reflect.ownKeys(descriptors).some(key => typeof key !== "string" || !keys.includes(key))) throw new Error("record");
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}

export function nativeCertificateUuid(value) {
  if (typeof value !== "string" || value.length !== 36 || !UUID.test(value)) throw new Error("uuid");
  return value;
}

export function nativeCertificateDate(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || value % 1000 !== 0
    || !Number.isFinite(new Date(value).getTime()) || new Date(value).getUTCFullYear() > 9999) throw new Error("date");
  return new Date(value);
}

export function encodeNativeCertificatePem(bytes, label) {
  const lines = Buffer.from(bytes).toString("base64").match(/.{1,64}/g);
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export function decodeNativeCertificatePem(value, label) {
  if (typeof value !== "string" || value.length > 8192) throw new Error("pem");
  const match = new RegExp(`^-----BEGIN ${label}-----\\n([A-Za-z0-9+/=\\n]+)-----END ${label}-----\\n$`).exec(value);
  if (!match) throw new Error("pem");
  const encoded = match[1].replaceAll("\n", "");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.toString("base64") !== encoded || encodeNativeCertificatePem(bytes, label) !== value) throw new Error("pem");
  return bytes;
}

export function nativeCertificatePublicDer(key) {
  return key.export({ type: "spki", format: "der" });
}

export function parseBoundedNativeCertificateDer(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length || bytes.length > 4096) throw new Error("size");
  const { fromBER } = loadNativeAsn1Library();
  const complete = fromBER(bytes, NATIVE_CERTIFICATE_PARSE_OPTIONS.berOptions);
  if (complete.offset !== bytes.length || complete.result.error || complete.result.warnings.length) throw new Error("asn1");
  const pending = [complete.result];
  while (pending.length) {
    const node = pending.pop();
    if (node.lenBlock?.isIndefiniteForm || node.valueBlock?.error
      || [node, node.idBlock, node.lenBlock].some(block => block?.error || block?.warnings?.length)) throw new Error("der");
    if (node.idBlock.isConstructed && Array.isArray(node.valueBlock?.value)) pending.push(...node.valueBlock.value);
  }
  if (!Buffer.from(complete.result.toBER(false)).equals(bytes)) throw new Error("der");
  return complete.result;
}

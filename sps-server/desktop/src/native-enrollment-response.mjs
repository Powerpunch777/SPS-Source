import { TextDecoder } from "node:util";
import {
  nativeCertificateRecord as record,
  nativeCertificateUuid as uuid,
} from "./native-certificate-primitives.mjs";

const MAX_BODY_BYTES = 16_384;
const MAX_HEADER_PAIRS = 64;
const MAX_HEADER_BYTES = 16_384;
const MAX_DER_BYTES = 4096;
const MAX_BASE64URL_LENGTH = Math.ceil(MAX_DER_BYTES * 4 / 3);
const EXPECTED_STATUS = Object.freeze({ exchange: 201, issue: 200, complete: 200, reconcile: 200, identity: 200, workspaces: 200 });
const RESPONSE_KEYS = Object.freeze({
  exchange: ["expiresInSeconds"],
  issue: ["enrollmentId", "certificate", "issuerCertificate", "expiresAt"],
  complete: ["deviceId", "status"],
  reconcile: ["deviceId", "status"],
  identity: ["hostId", "serverSpkiSha256", "issuerSpkiSha256", "issuerCertificate"],
});
const SENSITIVE_HEADERS = new Set([
  "cache-control", "content-encoding", "content-length", "content-type",
  "cookie", "location", "set-cookie", "transfer-encoding",
]);
const INVALID_CODE = "native_enrollment_response_invalid";
const INVALID_MESSAGE = "Native enrollment response is invalid.";

function reject() {
  throw new Error("invalid");
}

function invalidResponseError() {
  const error = new Error(INVALID_MESSAGE);
  error.code = INVALID_CODE;
  return error;
}

function readRawHeaders(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) reject();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value") || lengthDescriptor.enumerable) reject();
  const length = lengthDescriptor.value;
  if (!Number.isSafeInteger(length) || length % 2 !== 0 || length / 2 > MAX_HEADER_PAIRS
    || Reflect.ownKeys(descriptors).length !== length + 1) reject();

  const headers = new Map();
  let totalBytes = 0;
  for (let index = 0; index < length; index += 2) {
    const nameDescriptor = descriptors[String(index)];
    const valueDescriptor = descriptors[String(index + 1)];
    if (!nameDescriptor?.enumerable || !Object.hasOwn(nameDescriptor, "value")
      || !valueDescriptor?.enumerable || !Object.hasOwn(valueDescriptor, "value")) reject();
    const name = nameDescriptor.value;
    const headerValue = valueDescriptor.value;
    if (typeof name !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)
      || typeof headerValue !== "string" || /[\r\n\0]/.test(headerValue)
      || name.length > MAX_HEADER_BYTES || headerValue.length > MAX_HEADER_BYTES) reject();

    totalBytes += Buffer.byteLength(name, "utf8") + Buffer.byteLength(headerValue, "utf8") + 4;
    if (totalBytes > MAX_HEADER_BYTES) reject();
    const normalizedName = name.toLowerCase();
    const existing = headers.get(normalizedName);
    if (existing && SENSITIVE_HEADERS.has(normalizedName)) reject();
    if (existing) existing.push(headerValue);
    else headers.set(normalizedName, [headerValue]);
  }
  return headers;
}

function oneHeader(headers, name) {
  const values = headers.get(name);
  if (!values || values.length !== 1) reject();
  return values[0];
}

function validateHeaders(headers, operation, bodyLength) {
  const contentLength = oneHeader(headers, "content-length");
  if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength)) reject();
  const declaredLength = Number(contentLength);
  const maximum = operation === "workspaces" ? 256 * 1024 : MAX_BODY_BYTES;
  if (!Number.isSafeInteger(declaredLength) || declaredLength > maximum || declaredLength !== bodyLength) reject();

  const contentType = oneHeader(headers, "content-type");
  if (!/^[ \t]*application\/json[ \t]*;[ \t]*charset[ \t]*=[ \t]*utf-8[ \t]*$/i.test(contentType)) reject();
  if (!/^[ \t]*no-store[ \t]*$/i.test(oneHeader(headers, "cache-control"))) reject();
  if (headers.has("transfer-encoding") || headers.has("content-encoding") || headers.has("location")
    || headers.has("cookie")) reject();

  if (operation === "exchange") {
    const setCookie = oneHeader(headers, "set-cookie");
    const match = /^sps_identity_session=([A-Za-z0-9_-]{64}); Max-Age=604800; Path=\/; HttpOnly; Secure; SameSite=Lax$/.exec(setCookie);
    if (!match) reject();
    return match[1];
  }
  if (headers.has("set-cookie")) reject();
  return null;
}

function parseCanonicalBody(body, keys) {
  if (!Buffer.isBuffer(body) || body.length > MAX_BODY_BYTES) reject();
  const snapshot = Buffer.from(body);
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(snapshot);
  if (text.includes("\uFEFF") || text.includes("\0") || text.includes("\uFFFD")) reject();
  const parsed = JSON.parse(text);
  const value = record(parsed, keys);
  if (JSON.stringify(parsed) !== text) reject();
  return value;
}

function decodeCanonicalBase64Url(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_BASE64URL_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)) reject();
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length === 0 || bytes.length > MAX_DER_BYTES || bytes.toString("base64url") !== value) reject();
  return bytes.toString("base64url");
}

function validateIssue(value) {
  uuid(value.enrollmentId);
  const certificate = decodeCanonicalBase64Url(value.certificate);
  const issuerCertificate = decodeCanonicalBase64Url(value.issuerCertificate);
  if (typeof value.expiresAt !== "string" || value.expiresAt.length !== 24) reject();
  const expiry = new Date(value.expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== value.expiresAt) reject();
  return Object.freeze({
    enrollmentId: value.enrollmentId,
    certificate,
    issuerCertificate,
    expiresAt: value.expiresAt,
  });
}

function validateIdentity(value) {
  uuid(value.hostId);
  if (typeof value.serverSpkiSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.serverSpkiSha256)
    || typeof value.issuerSpkiSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.issuerSpkiSha256)) reject();
  const issuerCertificate = decodeCanonicalBase64Url(value.issuerCertificate);
  return Object.freeze({
    hostId: value.hostId,
    serverSpkiSha256: value.serverSpkiSha256,
    issuerSpkiSha256: value.issuerSpkiSha256,
    issuerCertificate,
  });
}

function validateBody(operation, value, cookie) {
  if (operation === "exchange") {
    if (value.expiresInSeconds !== 604800) reject();
    return Object.freeze({ cookie: `sps_identity_session=${cookie}`, expiresInSeconds: 604800 });
  }
  if (operation === "issue") return validateIssue(value);
  if (operation === "identity") return validateIdentity(value);
  if (operation === "complete" || operation === "reconcile") {
    uuid(value.deviceId);
    if (operation === "complete" ? value.status !== "pending"
      : !["pending", "approved", "revoked"].includes(value.status)) reject();
    return Object.freeze({ deviceId: value.deviceId, status: value.status });
  }
  reject();
}

function parseWorkspaceChoices(body) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
  if (text.includes("\uFEFF") || text.includes("\0") || text.includes("\uFFFD")) reject();
  const choices = JSON.parse(text);
  if (!Array.isArray(choices) || choices.length > 200 || JSON.stringify(choices) !== text) reject();
  const seen = new Set();
  return Object.freeze(choices.map(input => {
    const value = record(input, ["id", "name"]);
    uuid(value.id);
    if (seen.has(value.id) || typeof value.name !== "string" || !value.name.trim() || value.name.length > 300
      || /[\u0000-\u001f\u007f]/.test(value.name)) reject();
    seen.add(value.id);
    return Object.freeze({ id: value.id, name: value.name });
  }));
}

export function parseSpsNativeEnrollmentResponse(operation, input) {
  try {
    if (typeof operation !== "string" || !Object.hasOwn(EXPECTED_STATUS, operation)) reject();
    const envelope = record(input, ["statusCode", "rawHeaders", "body"]);
    if (envelope.statusCode !== EXPECTED_STATUS[operation]) reject();
    const headers = readRawHeaders(envelope.rawHeaders);
    const body = envelope.body;
    if (!Buffer.isBuffer(body) || body.length > (operation === "workspaces" ? 256 * 1024 : MAX_BODY_BYTES)) reject();
    const cookie = validateHeaders(headers, operation, body.length);
    if (operation === "workspaces") return parseWorkspaceChoices(body);
    const value = parseCanonicalBody(body, RESPONSE_KEYS[operation]);
    return validateBody(operation, value, cookie);
  } catch {
    throw invalidResponseError();
  }
}

import { TextDecoder } from "node:util";
import {
  nativeCertificateRecord as record,
  nativeCertificateUuid as uuid,
} from "./native-certificate-primitives.mjs";

const MAX_BODY_BYTES = 16_384;
const MAX_HEADER_PAIRS = 64;
const MAX_HEADER_BYTES = 16_384;
const MAX_WORKSPACE_JSON_DEPTH = 32;
const MAX_WORKSPACE_JSON_NODES = 10_000;
const MAX_DER_BYTES = 4096;
const MAX_BASE64URL_LENGTH = Math.ceil(MAX_DER_BYTES * 4 / 3);
const EXPECTED_STATUS = Object.freeze({ exchange: 201, issue: 200, complete: 200, reconcile: 200, identity: 200,
  renewal: 200, workspaces: 200, workspaceBootstrap: 200 });
const RESPONSE_KEYS = Object.freeze({
  exchange: ["expiresInSeconds"],
  issue: ["enrollmentId", "certificate", "issuerCertificate", "expiresAt"],
  complete: ["deviceId", "status"],
  reconcile: ["deviceId", "status"],
  identity: ["hostId", "serverSpkiSha256", "issuerSpkiSha256", "issuerCertificate"],
  renewal: ["renewalId", "deviceId", "predecessorCertificateSha256", "certificate", "issuerCertificate",
    "certificateNotBefore", "certificateNotAfter"],
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
  const maximum = operation === "workspaces" || operation === "workspaceBootstrap" || operation === "workspaceSurface"
    ? 256 * 1024 : MAX_BODY_BYTES;
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

function validateRenewal(value) {
  uuid(value.renewalId);
  uuid(value.deviceId);
  if (typeof value.predecessorCertificateSha256 !== "string" || !/^[0-9a-f]{64}$/.test(value.predecessorCertificateSha256)) reject();
  const certificate = decodeCanonicalBase64Url(value.certificate);
  const issuerCertificate = decodeCanonicalBase64Url(value.issuerCertificate);
  for (const field of ["certificateNotBefore", "certificateNotAfter"]) {
    if (typeof value[field] !== "string" || value[field].length !== 24) reject();
    const date = new Date(value[field]);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value[field]) reject();
  }
  if (Date.parse(value.certificateNotBefore) >= Date.parse(value.certificateNotAfter)) reject();
  return Object.freeze({ renewalId: value.renewalId, deviceId: value.deviceId,
    predecessorCertificateSha256: value.predecessorCertificateSha256, certificate, issuerCertificate,
    certificateNotBefore: value.certificateNotBefore, certificateNotAfter: value.certificateNotAfter });
}

function validateBody(operation, value, cookie) {
  if (operation === "exchange") {
    if (value.expiresInSeconds !== 604800) reject();
    return Object.freeze({ cookie: `sps_identity_session=${cookie}`, expiresInSeconds: 604800 });
  }
  if (operation === "issue") return validateIssue(value);
  if (operation === "identity") return validateIdentity(value);
  if (operation === "renewal") return validateRenewal(value);
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
  const choices = JSON.parse(text);
  if (!Array.isArray(choices) || choices.length > 200 || JSON.stringify(choices) !== text) reject();
  const seen = new Set();
  return Object.freeze(choices.map(input => {
    const value = record(input, ["id", "name"]);
    uuid(value.id);
    if (seen.has(value.id) || typeof value.name !== "string" || value.name.length === 0) reject();
    seen.add(value.id);
    return Object.freeze({ id: value.id, name: value.name });
  }));
}

const WORKSPACE_BOOTSTRAP_CAPABILITIES = Object.freeze([
  "workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read",
]);
const INBOX_STATE_CAPABILITY = "workspace.inbox.state.write";

function exactCapabilities(input) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) reject();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const length = descriptors.length;
  if (!length || !Object.hasOwn(length, "value") || length.enumerable
    || ![WORKSPACE_BOOTSTRAP_CAPABILITIES.length, WORKSPACE_BOOTSTRAP_CAPABILITIES.length + 1].includes(length.value)
    || Reflect.ownKeys(descriptors).length !== length.value + 1) reject();
  for (let index = 0; index < WORKSPACE_BOOTSTRAP_CAPABILITIES.length; index++) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")
      || descriptor.value !== WORKSPACE_BOOTSTRAP_CAPABILITIES[index]) reject();
  }
  const output = [...WORKSPACE_BOOTSTRAP_CAPABILITIES];
  if (length.value === output.length + 1) {
    const extra = descriptors[String(output.length)];
    if (!extra?.enumerable || !Object.hasOwn(extra, "value") || extra.value !== INBOX_STATE_CAPABILITY) reject();
    output.push(INBOX_STATE_CAPABILITY);
  }
  return Object.freeze(output);
}

export function validateSpsNativeInboxStateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) reject();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (!keys.includes("itemId") || keys.length < 2 || keys.some(key => !["itemId", "read", "archived"].includes(key))) reject();
  for (const key of keys) if (!descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")) reject();
  uuid(descriptors.itemId.value);
  const result = { itemId: descriptors.itemId.value };
  for (const key of ["read", "archived"]) if (Object.hasOwn(descriptors, key)) {
    if (typeof descriptors[key].value !== "boolean") reject();
    result[key] = descriptors[key].value;
  }
  return Object.freeze(result);
}

export function validateSpsNativeInboxState(input) {
  const value = record(input, ["readAt", "archivedAt"]);
  for (const field of ["readAt", "archivedAt"]) {
    if (value[field] === null) continue;
    if (typeof value[field] !== "string" || value[field].length !== 24) reject();
    const time = new Date(value[field]);
    if (!Number.isFinite(time.getTime()) || time.toISOString() !== value[field]) reject();
  }
  return Object.freeze({ readAt: value.readAt, archivedAt: value.archivedAt });
}

export function parseSpsNativeInboxStateResponse(input) {
  try {
    const envelope = record(input, ["statusCode", "rawHeaders", "body"]);
    if (envelope.statusCode !== 200 || !Buffer.isBuffer(envelope.body) || envelope.body.length > 256) reject();
    validateHeaders(readRawHeaders(envelope.rawHeaders), "inboxState", envelope.body.length);
    return validateSpsNativeInboxState(parseCanonicalBody(envelope.body, ["readAt", "archivedAt"]));
  } catch { throw invalidResponseError(); }
}

export function validateSpsNativeWorkspaceBootstrap(input) {
  const value = record(input, ["v", "kind", "workspace", "member", "capabilities"]);
  if (value.v !== 1 || value.kind !== "sps.native.workspace.bootstrap") reject();
  const workspace = record(value.workspace, ["id", "name", "issuePrefix"]);
  uuid(workspace.id);
  if (typeof workspace.name !== "string" || workspace.name.length === 0
    || typeof workspace.issuePrefix !== "string" || workspace.issuePrefix.length === 0) reject();
  const member = record(value.member, ["userId"]);
  if (typeof member.userId !== "string" || member.userId.length === 0 || member.userId.length > 200
    || /[\u0000-\u001f\u007f]/.test(member.userId)) reject();
  const capabilities = exactCapabilities(value.capabilities);
  return Object.freeze({ v: 1, kind: "sps.native.workspace.bootstrap",
    workspace: Object.freeze({ id: workspace.id, name: workspace.name, issuePrefix: workspace.issuePrefix }),
    member: Object.freeze({ userId: member.userId }), capabilities: Object.freeze(capabilities) });
}

function parseWorkspaceBootstrap(body) {
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
  const parsed = JSON.parse(text);
  if (JSON.stringify(parsed) !== text) reject();
  return validateSpsNativeWorkspaceBootstrap(parsed);
}

function plainJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) reject();
  return value;
}

function cloneBoundedJson(input) {
  let nodes = 0;
  const active = new WeakSet();
  function visit(value, depth) {
    if (++nodes > MAX_WORKSPACE_JSON_NODES || depth > MAX_WORKSPACE_JSON_DEPTH) reject();
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) reject();
      return value;
    }
    if (typeof value !== "object" || active.has(value)) reject();
    active.add(value);
    try {
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) reject();
        const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
        if (!lengthDescriptor || !Object.hasOwn(lengthDescriptor, "value")
          || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value > MAX_WORKSPACE_JSON_NODES) reject();
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const length = descriptors.length;
        if (!length || !Object.hasOwn(length, "value") || length.enumerable
          || !Number.isSafeInteger(length.value) || length.value < 0
          || Reflect.ownKeys(descriptors).length !== length.value + 1) reject();
        const result = new Array(length.value);
        for (let index = 0; index < length.value; index++) {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) reject();
          result[index] = visit(descriptor.value, depth + 1);
        }
        return Object.freeze(result);
      }
      plainJsonObject(value);
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string")) reject();
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) reject();
        Object.defineProperty(result, key, { value: visit(descriptor.value, depth + 1), enumerable: true });
      }
      return Object.freeze(result);
    } finally { active.delete(value); }
  }
  return visit(input, 0);
}

export function validateSpsNativeWorkspaceSurface(surface, workspaceId, input) {
  uuid(workspaceId);
  if (!["shell", "providers", "dashboard", "inbox"].includes(surface)) reject();
  if (surface === "shell") {
    const shell = record(input, ["mode", "providerPluginId", "providerPluginKey", "shell", "fallbackReason"]);
    if (!["neutral", "plugin"].includes(shell.mode)
      || shell.providerPluginId !== null && typeof shell.providerPluginId !== "string"
      || shell.providerPluginKey !== null && typeof shell.providerPluginKey !== "string"
      || shell.fallbackReason !== null && typeof shell.fallbackReason !== "string"
      || shell.mode === "neutral" && shell.shell !== null
      || shell.mode === "plugin" && (!shell.shell || typeof shell.shell !== "object" || Array.isArray(shell.shell))) reject();
    return cloneBoundedJson(shell);
  }
  if (surface === "providers") {
    if (!Array.isArray(input)) reject();
    return cloneBoundedJson(input);
  }
  if (surface === "dashboard") {
    const dashboard = record(input, ["widgets"]);
    if (!Array.isArray(dashboard.widgets)) reject();
    return cloneBoundedJson(dashboard);
  }
  const inbox = record(input, ["items"]);
  if (!Array.isArray(inbox.items)) reject();
  for (const item of inbox.items) {
    plainJsonObject(item);
    const descriptor = Object.getOwnPropertyDescriptor(item, "companyId");
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || descriptor.value !== workspaceId) reject();
  }
  return cloneBoundedJson(inbox);
}

export function parseSpsNativeWorkspaceSurfaceResponse(surface, workspaceId, input) {
  try {
    if (!["shell", "providers", "dashboard", "inbox"].includes(surface)) reject();
    uuid(workspaceId);
    const envelope = record(input, ["statusCode", "rawHeaders", "body"]);
    if (envelope.statusCode !== 200) reject();
    const headers = readRawHeaders(envelope.rawHeaders);
    const body = envelope.body;
    if (!Buffer.isBuffer(body) || body.length > 256 * 1024) reject();
    validateHeaders(headers, "workspaceSurface", body.length);
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(body);
    const parsed = JSON.parse(text);
    if (JSON.stringify(parsed) !== text) reject();
    return validateSpsNativeWorkspaceSurface(surface, workspaceId, parsed);
  } catch { throw invalidResponseError(); }
}

export function parseSpsNativeEnrollmentResponse(operation, input) {
  try {
    if (typeof operation !== "string" || !Object.hasOwn(EXPECTED_STATUS, operation)) reject();
    const envelope = record(input, ["statusCode", "rawHeaders", "body"]);
    if (envelope.statusCode !== EXPECTED_STATUS[operation]) reject();
    const headers = readRawHeaders(envelope.rawHeaders);
    const body = envelope.body;
    if (!Buffer.isBuffer(body) || body.length > (operation === "workspaces" || operation === "workspaceBootstrap" ? 256 * 1024 : MAX_BODY_BYTES)) reject();
    const cookie = validateHeaders(headers, operation, body.length);
    if (operation === "workspaces") return parseWorkspaceChoices(body);
    if (operation === "workspaceBootstrap") return parseWorkspaceBootstrap(body);
    const value = parseCanonicalBody(body, RESPONSE_KEYS[operation]);
    return validateBody(operation, value, cookie);
  } catch {
    throw invalidResponseError();
  }
}

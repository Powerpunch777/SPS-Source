import { createHash, randomBytes, sign } from "node:crypto";
import { TextDecoder } from "node:util";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

export const NATIVE_NODE_TARGET = "/sps-native/v1/node-runtime";
export const NATIVE_NODE_MAX_REQUEST = 512 * 1024;
export const NATIVE_NODE_MAX_RESPONSE = 1024 * 1024;
const OPERATIONS = new Map([
  ["register", { node: false, resource: false }],
  ["heartbeat", { node: true, resource: false }],
  ["availability", { node: true, resource: false }],
  ["claim-command", { node: true, resource: false }],
  ["claim-plugin-run", { node: true, resource: false }],
  ["command-lease", { node: true, resource: true }],
  ["command-event", { node: true, resource: true }],
  ["command-complete", { node: true, resource: true }],
  ["plugin-lease", { node: true, resource: true }],
  ["plugin-event", { node: true, resource: true }],
  ["plugin-complete", { node: true, resource: true }],
  ["source-route", { node: true, resource: true }],
]);
const MAX_DEPTH = 32;
const MAX_NODES = 20_000;
const ERROR = "The Native Node request is invalid or unavailable.";
const fail = () => Object.assign(new Error(ERROR), { code: "native_node_protocol_invalid" });

function snapshot(value, maximum = NATIVE_NODE_MAX_REQUEST) {
  let nodes = 0, characters = 0;
  const ancestors = new Set();
  function visit(input, depth) {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new Error();
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number") { if (!Number.isFinite(input)) throw new Error(); return input; }
    if (typeof input === "string") { characters += input.length; if (characters > maximum) throw new Error(); return input; }
    if (typeof input !== "object" || ancestors.has(input)) throw new Error();
    ancestors.add(input);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(input);
      if (Array.isArray(input)) {
        if (Object.getPrototypeOf(input) !== Array.prototype || input.length > MAX_NODES
          || Reflect.ownKeys(descriptors).length !== input.length + 1) throw new Error();
        const result = [];
        for (let index = 0; index < input.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error();
          result.push(visit(descriptor.value, depth + 1));
        }
        return result;
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new Error();
      const result = Object.create(null);
      for (const key of Reflect.ownKeys(descriptors)) {
        const descriptor = descriptors[key];
        if (typeof key !== "string" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new Error();
        characters += key.length;
        if (characters > maximum) throw new Error();
        result[key] = visit(descriptor.value, depth + 1);
      }
      return result;
    } finally { ancestors.delete(input); }
  }
  const result = visit(value, 0);
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > maximum) throw new Error();
  return JSON.parse(JSON.stringify(result));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort((a, b) => a.localeCompare(b))
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function timestamp(value) {
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value)
    || !Number.isFinite(Date.parse(value))) throw new Error();
  return value;
}

function signedProof(value) {
  const proof = record(value, ["timestamp", "nonce", "signature"]);
  timestamp(proof.timestamp);
  if (typeof proof.nonce !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(proof.nonce)
    || typeof proof.signature !== "string" || proof.signature.length < 64 || proof.signature.length > 2048
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(proof.signature)) throw new Error();
  return proof;
}

/** Validate the fixed Native Node envelope and return a detached safe snapshot. */
export function requireSpsNativeNodeRequest(input) {
  try {
    const value = record(input, ["operation", "nodeId", "resourceId", "payload"]);
    if (JSON.stringify(Reflect.ownKeys(input)) !== JSON.stringify(["operation", "nodeId", "resourceId", "payload"])) throw new Error();
    const spec = OPERATIONS.get(value.operation);
    if (!spec) throw new Error();
    if (spec.node) uuid(value.nodeId); else if (value.nodeId !== null) throw new Error();
    if (spec.resource) uuid(value.resourceId); else if (value.resourceId !== null) throw new Error();
    const payload = snapshot(value.payload);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    if (value.operation === "register") {
      const body = record(payload, ["registration", "proof"]);
      const registration = snapshot(body.registration);
      if (!registration || typeof registration !== "object" || Array.isArray(registration)) throw new Error();
      signedProof(body.proof);
      return Object.freeze({ operation: value.operation, nodeId: null, resourceId: null,
        payload: Object.freeze({ registration, proof: Object.freeze({ ...body.proof }) }) });
    }
    const proof = signedProof(Object.fromEntries(["timestamp", "nonce", "signature"].map(key => [key, payload[key]])));
    if ((value.operation === "claim-command" || value.operation === "claim-plugin-run" || value.operation === "command-lease"
      || value.operation === "plugin-lease" || value.operation === "source-route")
      && Reflect.ownKeys(payload).some(key => !["timestamp", "nonce", "signature"].includes(key))) throw new Error();
    return Object.freeze({ operation: value.operation, nodeId: value.nodeId, resourceId: value.resourceId,
      payload: Object.freeze({ ...payload, ...proof }) });
  } catch { throw fail(); }
}

/** Parse the fixed success response `{data}` with bounded, getter-free JSON. */
export function parseSpsNativeNodeResponse(envelope) {
  try {
    if (envelope.statusCode !== 200 || !Buffer.isBuffer(envelope.body) || envelope.body.length > NATIVE_NODE_MAX_RESPONSE) throw new Error();
    const headers = envelope.rawHeaders;
    if (!Array.isArray(headers) || headers.length > 64 || headers.length % 2) throw new Error();
    const values = new Map();
    for (let index = 0; index < headers.length; index += 2) {
      const name = headers[index]?.toLowerCase(), value = headers[index + 1];
      if (!name || typeof value !== "string" || values.has(name)) throw new Error();
      values.set(name, value);
    }
    if (!/^application\/json(?:; charset=utf-8)?$/.test(values.get("content-type") ?? "")
      || values.get("cache-control") !== "no-store" || values.get("content-length") !== String(envelope.body.length)
      || values.has("set-cookie") || values.has("location") || values.has("content-encoding") || values.has("transfer-encoding")) throw new Error();
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(envelope.body);
    const parsed = JSON.parse(text);
    const response = record(parsed, ["data"]);
    if (JSON.stringify(parsed) !== text) throw new Error();
    return Object.freeze({ data: snapshot(response.data, NATIVE_NODE_MAX_RESPONSE) });
  } catch { throw fail(); }
}

/** Main-only Ed25519 proof of possession for an immutable Native Node binding. */
export function createSignedSpsNativeNodeRegistration({ identity, hostId, workspaceId, deviceId, registration,
  timestamp: suppliedTimestamp = new Date().toISOString(), nonce = randomBytes(32).toString("base64url") } = {}) {
  try {
    uuid(hostId); uuid(workspaceId); uuid(deviceId);
    if (!identity || typeof identity.privateKeyPem !== "string" || identity.privateKeyPem.length > 8192) throw new Error();
    const safeRegistration = snapshot(registration);
    if (!safeRegistration || typeof safeRegistration !== "object" || Array.isArray(safeRegistration)) throw new Error();
    const issuedAt = timestamp(suppliedTimestamp);
    if (typeof nonce !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(nonce)) throw new Error();
    const digest = createHash("sha256").update(canonicalJson(safeRegistration), "utf8").digest("hex");
    const message = `SPS-NATIVE-NODE-REGISTER-V1\n${hostId}\n${workspaceId}\n${deviceId}\n${issuedAt}\n${nonce}\n${digest}`;
    const signature = sign(null, Buffer.from(message, "utf8"), identity.privateKeyPem).toString("base64");
    return Object.freeze({ registration: safeRegistration, proof: Object.freeze({ timestamp: issuedAt, nonce, signature }) });
  } catch { throw fail(); }
}

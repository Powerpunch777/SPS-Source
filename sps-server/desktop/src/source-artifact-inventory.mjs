import { createHash } from "node:crypto";

const FAILURE_CODE = "SPS_SOURCE_ARTIFACT_INVENTORY_UNAVAILABLE";
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const MAX_SOURCES = 4096;
const MAX_GRANTS = 16384;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ROOT_KEYS = ["sources", "grants", "fingerprint"];
const SOURCE_KEYS = ["kind", "id", "workspaceId", "resourceId", "status", "routeFingerprint", "revision"];
const GRANT_KEYS = ["kind", "id", "workspaceId", "sourceId", "nodeId", "revokedAt", "revision"];

function fail() {
  const error = new Error("SPS source artifact inventory is unavailable.");
  error.code = FAILURE_CODE;
  throw error;
}

function exactRecord(value, keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== "string" || !keys.includes(key))) fail();
  const result = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    result[key] = descriptor.value;
  }
  return result;
}

function denseValues(value, maximum) {
  if (!Array.isArray(value)) fail();
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  const length = lengthDescriptor?.value;
  if (!lengthDescriptor || lengthDescriptor.enumerable || !Object.hasOwn(lengthDescriptor, "value")
    || !Number.isSafeInteger(length) || length < 0 || length > maximum) fail();
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || keys.some(key => key !== "length"
    && (typeof key !== "string" || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length))) fail();
  const values = [];
  for (let index = 0; index < length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail();
    values.push(descriptor.value);
  }
  return values;
}

function uuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

function isoDate(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !ISO_UTC.test(value)) fail();
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) fail();
  return value;
}

function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pairKey(kind, id) {
  return `${kind}:${id}`;
}

function normalize(value) {
  const root = exactRecord(value, ROOT_KEYS);
  const sourceValues = denseValues(root.sources, MAX_SOURCES);
  const grantValues = denseValues(root.grants, MAX_GRANTS);
  const sources = sourceValues.map(value => {
    const row = exactRecord(value, SOURCE_KEYS);
    if (row.kind !== "workspace" && row.kind !== "project") fail();
    const id = uuid(row.id);
    const workspaceId = uuid(row.workspaceId);
    const resourceId = uuid(row.resourceId);
    if (row.kind === "workspace" && resourceId !== id) fail();
    if (typeof row.status !== "string" || row.status.length === 0 || row.status.length > 64
      || /[\u0000-\u001f\u007f\ufffd]/.test(row.status)) fail();
    if (row.routeFingerprint !== null && (typeof row.routeFingerprint !== "string" || !SHA256.test(row.routeFingerprint))) fail();
    if (row.kind === "project" && row.routeFingerprint === null) fail();
    return {
      kind: row.kind,
      id,
      workspaceId,
      resourceId,
      status: row.status,
      routeFingerprint: row.routeFingerprint,
      revision: isoDate(row.revision),
    };
  });
  sources.sort((left, right) => codepointCompare(pairKey(left.kind, left.id), pairKey(right.kind, right.id)));

  const bySource = new Map();
  const sourceResourceKeys = new Set();
  for (const source of sources) {
    const key = pairKey(source.kind, source.id);
    const resourceKey = `${source.kind}:${source.workspaceId}:${source.resourceId}`;
    if (bySource.has(key) || sourceResourceKeys.has(resourceKey)) fail();
    bySource.set(key, source);
    sourceResourceKeys.add(resourceKey);
  }

  const grants = grantValues.map(value => {
    const row = exactRecord(value, GRANT_KEYS);
    if (row.kind !== "workspace" && row.kind !== "project") fail();
    return {
      kind: row.kind,
      id: uuid(row.id),
      workspaceId: uuid(row.workspaceId),
      sourceId: uuid(row.sourceId),
      nodeId: uuid(row.nodeId),
      revokedAt: isoDate(row.revokedAt, true),
      revision: isoDate(row.revision),
    };
  });
  grants.sort((left, right) => codepointCompare(pairKey(left.kind, left.id), pairKey(right.kind, right.id)));

  const grantIds = new Set();
  const grantBindings = new Set();
  for (const grant of grants) {
    const parent = bySource.get(pairKey(grant.kind, grant.sourceId));
    const idKey = pairKey(grant.kind, grant.id);
    const bindingKey = `${grant.kind}:${grant.sourceId}:${grant.nodeId}`;
    if (!parent || parent.workspaceId !== grant.workspaceId || grantIds.has(idKey) || grantBindings.has(bindingKey)) fail();
    grantIds.add(idKey);
    grantBindings.add(bindingKey);
  }

  const fingerprint = root.fingerprint;
  if (typeof fingerprint !== "string" || !SHA256.test(fingerprint)) fail();
  const fingerprintBytes = JSON.stringify([sources, grants]);
  const expectedFingerprint = createHash("sha256").update(fingerprintBytes, "utf8").digest("hex");
  if (fingerprint !== expectedFingerprint) fail();

  const body = { sources, grants, fingerprint };
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_BODY_BYTES) fail();

  for (const source of sources) Object.freeze(source);
  for (const grant of grants) Object.freeze(grant);
  Object.freeze(sources);
  Object.freeze(grants);
  return Object.freeze(body);
}

export function requireSpsSourceArtifactInventory(value) {
  try {
    return normalize(value);
  } catch {
    return fail();
  }
}

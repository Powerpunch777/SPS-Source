import { randomUUID } from "node:crypto";
import { nativeCertificateRecord as record } from "./native-certificate-primitives.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";

const MAX_ENTRIES = 1024;
const INDEX_KEYS = ["v", "entries"];
const ENTRY_KEYS = ["identityIssuer", "subject", "hostId", "deviceKeyId"];
const SCOPE_KEYS = ["identityIssuer", "subject", "hostId"];
const DUMMY_DEVICE_KEY_ID = "00000000-0000-4000-8000-000000000000";
const DUMMY_SERVER_PIN = "0".repeat(64);
const DUMMY_ISSUER_PIN = "1".repeat(64);

function invalid(message = "SPS Native Member key index input is invalid.") {
  return new TypeError(message);
}

function validateScope(input) {
  try {
    const scope = record(input, SCOPE_KEYS);
    const checked = validateSpsNativeMemberPendingContext({
      ...scope,
      deviceKeyId: DUMMY_DEVICE_KEY_ID,
      serverSpkiSha256: DUMMY_SERVER_PIN,
      issuerSpkiSha256: DUMMY_ISSUER_PIN,
    });
    return Object.freeze({ identityIssuer: checked.identityIssuer, subject: checked.subject, hostId: checked.hostId });
  } catch {
    throw invalid("SPS Native Member key index scope is invalid.");
  }
}

function validateEntry(input) {
  try {
    const entry = record(input, ENTRY_KEYS);
    const checked = validateSpsNativeMemberPendingContext({
      ...entry,
      serverSpkiSha256: DUMMY_SERVER_PIN,
      issuerSpkiSha256: DUMMY_ISSUER_PIN,
    });
    return {
      identityIssuer: checked.identityIssuer,
      subject: checked.subject,
      hostId: checked.hostId,
      deviceKeyId: checked.deviceKeyId,
    };
  } catch {
    throw invalid("SPS Native Member key index entry is invalid.");
  }
}

function denseArrayValues(input) {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const length = descriptors.length;
  if (!length || length.enumerable || !Object.hasOwn(length, "value")
    || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > MAX_ENTRIES
    || Reflect.ownKeys(descriptors).length !== length.value + 1) throw invalid();

  const values = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw invalid();
    values.push(descriptor.value);
  }
  return values;
}

function scopeKey(value) {
  return JSON.stringify([value.identityIssuer, value.subject, value.hostId]);
}

function compareEntries(left, right) {
  for (const key of SCOPE_KEYS) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

function freezeIndex(entries) {
  const frozenEntries = entries.slice().sort(compareEntries).map(entry => Object.freeze({
    identityIssuer: entry.identityIssuer,
    subject: entry.subject,
    hostId: entry.hostId,
    deviceKeyId: entry.deviceKeyId,
  }));
  return Object.freeze({ v: 1, entries: Object.freeze(frozenEntries) });
}

function normalize(input) {
  const value = record(input, INDEX_KEYS);
  if (value.v !== 1) throw invalid();
  const values = denseArrayValues(value.entries);
  const entries = values.map(validateEntry);
  const scopes = new Set();
  const deviceKeyIds = new Set();
  for (const entry of entries) {
    const key = scopeKey(entry);
    if (scopes.has(key) || deviceKeyIds.has(entry.deviceKeyId)) throw invalid();
    scopes.add(key);
    deviceKeyIds.add(entry.deviceKeyId);
  }
  return freezeIndex(entries);
}

/** Validate and return a fresh, deeply frozen v1 index. An empty index is explicit: { v: 1, entries: [] }. */
export function normalizeSpsNativeMemberKeyIndex(input) {
  try {
    return normalize(input);
  } catch {
    throw invalid();
  }
}

function allocationOptions(input) {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    if (!Object.hasOwn(descriptors, "maxEntries")
      || keys.some(key => typeof key !== "string" || !["maxEntries", "createDeviceKeyId"].includes(key))) {
      throw invalid();
    }
    const hasGenerator = Object.hasOwn(descriptors, "createDeviceKeyId");
    const value = record(input, hasGenerator ? ["maxEntries", "createDeviceKeyId"] : ["maxEntries"]);
    if (!Number.isSafeInteger(value.maxEntries) || value.maxEntries < 1 || value.maxEntries > MAX_ENTRIES
      || (hasGenerator && typeof value.createDeviceKeyId !== "function")) throw invalid();
    return { maxEntries: value.maxEntries, createDeviceKeyId: hasGenerator ? value.createDeviceKeyId : randomUUID };
  } catch {
    throw invalid("SPS Native Member key index allocation options are invalid.");
  }
}

/**
 * Return { index, deviceKeyId, created }. maxEntries is mandatory (1..1024);
 * createDeviceKeyId is an optional synchronous UUID factory. Existing mappings
 * are stable and never replaced. A generated collision fails without retrying.
 */
export function allocateSpsNativeMemberKeyIndex(input, scopeInput, options) {
  const config = allocationOptions(options);
  const index = normalizeSpsNativeMemberKeyIndex(input);
  const scope = validateScope(scopeInput);
  if (index.entries.length > config.maxEntries) throw invalid("SPS Native Member key index exceeds maxEntries.");

  const existing = index.entries.find(entry => scopeKey(entry) === scopeKey(scope));
  if (existing) return Object.freeze({ index, deviceKeyId: existing.deviceKeyId, created: false });
  if (index.entries.length >= config.maxEntries) throw invalid("SPS Native Member key index is full.");

  const deviceKeyId = config.createDeviceKeyId();
  const entry = validateEntry({ ...scope, deviceKeyId });
  if (index.entries.some(existingEntry => existingEntry.deviceKeyId === entry.deviceKeyId)) {
    throw invalid("SPS Native Member deviceKeyId collision.");
  }
  const nextIndex = freezeIndex([...index.entries, entry]);
  return Object.freeze({ index: nextIndex, deviceKeyId: entry.deviceKeyId, created: true });
}

import { createHash } from "node:crypto";

const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const PIN = /^[0-9a-f]{64}$/;
const FIELDS = ["ownerSubject", "userDataDirectory", "vaultDirectory", "generation"];
const failure = () => new Error("Native device management is unavailable. Refresh the current Host and retry.");
const snapshot = (state, devices = []) => Object.freeze({ state, lanEnabled: false, devices: Object.freeze(devices) });

// Matches the private Core SPS Identity mapping, not a renderer-selected user ID.
export function nativeHostCoreOwnerUserId(subject) {
  if (typeof subject !== "string" || !subject.trim()) throw failure();
  return `sps_identity_${createHash("sha256").update(subject).digest("base64url")}`;
}

function authority(value) {
  if (!value || FIELDS.slice(0, 3).some(key => typeof value[key] !== "string" || !value[key])
    || typeof value.generation !== "bigint") throw failure();
  return Object.freeze(Object.fromEntries(FIELDS.map(key => [key, value[key]])));
}
function binding(value) {
  if (!value || typeof value.hostId !== "string" || !UUID.test(value.hostId)
    || typeof value.serverSpkiSha256 !== "string" || !PIN.test(value.serverSpkiSha256)) throw failure();
  return Object.freeze({ hostId: value.hostId, serverSpkiSha256: value.serverSpkiSha256 });
}
function sameBinding(a, b) { return a.hostId === b.hostId && a.serverSpkiSha256 === b.serverSpkiSha256; }

export function requireNativeDeviceActionInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) throw new TypeError("One Native device ID is required.");
  const fields = Object.getOwnPropertyDescriptors(input), descriptor = fields.deviceId;
  if (Reflect.ownKeys(fields).length !== 1 || !descriptor?.enumerable || !("value" in descriptor)
    || typeof descriptor.value !== "string" || !UUID.test(descriptor.value)) throw new TypeError("One Native device ID is required.");
  return Object.freeze({ deviceId: descriptor.value });
}

function devices(value) {
  if (!Array.isArray(value) || value.length > 200) throw failure();
  const ids = new Set();
  return value.map(row => {
    if (!row || typeof row.id !== "string" || !UUID.test(row.id) || ids.has(row.id)
      || typeof row.displayName !== "string" || !row.displayName.trim() || row.displayName.length > 120
      || /[\u0000-\u001f\u007f]/.test(row.displayName)
      || !["pending", "approved", "revoked"].includes(row.status)
      || typeof row.certificateSha256 !== "string" || !PIN.test(row.certificateSha256)
      || typeof row.certificateNotAfter !== "string" || row.certificateNotAfter.length !== 24
      || !Number.isFinite(Date.parse(row.certificateNotAfter))
      || new Date(row.certificateNotAfter).toISOString() !== row.certificateNotAfter
      || !Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision > 2_147_483_647) throw failure();
    ids.add(row.id);
    return Object.freeze({ id: row.id, displayName: row.displayName, status: row.status,
      certificateSha256: row.certificateSha256, certificateNotAfter: row.certificateNotAfter, revision: row.revision });
  });
}

// Main-private local management; never a remote URL, key export or grant API.
export function createNativeDeviceManagementController({ getAuthority, authenticateHost, getIdentity, getHostBinding, listDevices, mutateDevice }) {
  if ([getAuthority, authenticateHost, getIdentity, getHostBinding, listDevices, mutateDevice].some(fn => typeof fn !== "function")) throw new TypeError("Invalid Native device management configuration.");
  let changing = false;
  function check(expected, assertRequester) {
    assertRequester?.();
    const current = authority(getAuthority());
    if (FIELDS.some(key => current[key] !== expected[key])) throw failure();
  }
  async function identity(expected, assertRequester) {
    check(expected, assertRequester);
    const current = binding(await getIdentity(expected));
    check(expected, assertRequester);
    return current;
  }
  async function capture(assertRequester) {
    const expected = authority(getAuthority());
    check(expected, assertRequester);
    await authenticateHost();
    check(expected, assertRequester);
    const local = await identity(expected, assertRequester);
    const host = binding(await getHostBinding());
    check(expected, assertRequester);
    if (!sameBinding(local, host)) throw failure();
    return { expected, local };
  }
  async function read(captured, assertRequester) {
    const rows = devices(await listDevices());
    check(captured.expected, assertRequester);
    if (!sameBinding(captured.local, await identity(captured.expected, assertRequester))) throw failure();
    return snapshot("available", rows);
  }
  return Object.freeze({
    async list() {
      if (!getAuthority()) return snapshot("host_required");
      try { return await read(await capture()); }
      catch (error) {
        if (!getAuthority()) return snapshot("host_required");
        if (error?.code === "native_identity_unavailable") return snapshot("identity_required");
        return snapshot(error?.status === 404 ? "host_restart_required" : "unavailable");
      }
    },
    async change(action, input, { assertRequester, confirm } = {}) {
      const { deviceId } = requireNativeDeviceActionInput(input);
      if (!["approve", "revoke"].includes(action) || typeof assertRequester !== "function" || typeof confirm !== "function") throw failure();
      if (changing) throw failure();
      changing = true;
      try {
        const captured = await capture(assertRequester);
        const current = await read(captured, assertRequester), device = current.devices.find(row => row.id === deviceId);
        if (!device || action === "approve" && (device.status === "revoked" || Date.parse(device.certificateNotAfter) <= Date.now())) throw failure();
        const confirmed = await confirm(device);
        check(captured.expected, assertRequester);
        const latest = await read(captured, assertRequester);
        if (confirmed !== true) return latest;
        const target = latest.devices.find(row => row.id === deviceId);
        if (!target || Object.keys(device).some(key => device[key] !== target[key])
          || action === "approve" && Date.parse(target.certificateNotAfter) <= Date.now()) throw failure();
        check(captured.expected, assertRequester);
        await mutateDevice(action, deviceId);
        check(captured.expected, assertRequester);
        return await read(captured, assertRequester);
      } catch { throw failure(); }
      finally { changing = false; }
    },
  });
}

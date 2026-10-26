const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const FIELDS = ["ownerSubject", "userDataDirectory", "vaultDirectory", "generation"];
const INVITATION_FIELDS = ["id", "status", "createdAt", "expiresAt", "failedAttempts", "maxAttempts",
  "issuedByUserId", "consumedByUserId", "consumedDeviceSnapshotId", "target"];
const STATUSES = new Set(["pending", "expired", "identity_changed", "consumed", "revoked", "exhausted"]);
const failure = () => new Error("Native Host invitations are unavailable. Refresh the current Host and retry.");
const snapshot = (state, invitations = []) => Object.freeze({ state, invitations: Object.freeze(invitations) });

function exactRecord(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => {
    const descriptor = descriptors[key];
    return !descriptor?.enumerable || !("value" in descriptor);
  })) return null;
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}

function authority(value) {
  const record = exactRecord(value, FIELDS);
  if (!record || FIELDS.slice(0, 3).some(key => typeof record[key] !== "string" || !record[key])
    || typeof record.generation !== "bigint") throw failure();
  return Object.freeze(record);
}

function hostBinding(value) {
  const record = exactRecord(value, ["hostId", "serverSpkiSha256"]);
  if (!record || typeof record.hostId !== "string" || !UUID.test(record.hostId)
    || typeof record.serverSpkiSha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.serverSpkiSha256)) throw failure();
  return Object.freeze(record);
}

function sameBinding(left, right) {
  return left.hostId === right.hostId && left.serverSpkiSha256 === right.serverSpkiSha256;
}

function canonicalTime(value) {
  if (typeof value !== "string" || value.length !== 24 || !Number.isFinite(Date.parse(value))) return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}

function invitations(value) {
  if (!Array.isArray(value) || value.length > 200) throw failure();
  const seen = new Set();
  return value.map(candidate => {
    const row = exactRecord(candidate, INVITATION_FIELDS);
    if (!row || typeof row.id !== "string" || !UUID.test(row.id) || seen.has(row.id)
      || !STATUSES.has(row.status) || !canonicalTime(row.createdAt) || !canonicalTime(row.expiresAt)
      || Date.parse(row.expiresAt) <= Date.parse(row.createdAt)
      || !Number.isSafeInteger(row.failedAttempts) || row.failedAttempts < 0 || row.failedAttempts > 20
      || !Number.isSafeInteger(row.maxAttempts) || row.maxAttempts < 1 || row.maxAttempts > 20
      || row.failedAttempts > row.maxAttempts
      || typeof row.issuedByUserId !== "string" || !row.issuedByUserId || row.issuedByUserId.length > 200
      || /[\u0000-\u001f\u007f]/.test(row.issuedByUserId)
      || !(row.consumedByUserId === null || typeof row.consumedByUserId === "string" && row.consumedByUserId.length > 0 && row.consumedByUserId.length <= 200
        && !/[\u0000-\u001f\u007f]/.test(row.consumedByUserId))
      || !(row.consumedDeviceSnapshotId === null || typeof row.consumedDeviceSnapshotId === "string" && UUID.test(row.consumedDeviceSnapshotId))
      || !["any_verified_user", "verified_email"].includes(row.target)) throw failure();
    seen.add(row.id);
    // Core's exact metadata projection contains no pairing secret. Do not send
    // account identifiers or consumed device IDs into the renderer either.
    return Object.freeze({ id: row.id, status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt,
      failedAttempts: row.failedAttempts, maxAttempts: row.maxAttempts, target: row.target });
  });
}

export function requireNativeInvitationRevokeInput(input) {
  const record = exactRecord(input, ["invitationId"]);
  if (!record || typeof record.invitationId !== "string" || !UUID.test(record.invitationId)) {
    throw new TypeError("One Native invitation ID is required.");
  }
  return Object.freeze({ invitationId: record.invitationId });
}

// Main-private Owner management over the directly owned Core API. This never
// issues or returns an invitation code; only an explicit confirmed revoke writes.
export function createNativeInvitationManagementController({ getAuthority, authenticateHost, getIdentity,
  getHostBinding, listInvitations, revokeInvitation }) {
  if ([getAuthority, authenticateHost, getIdentity, getHostBinding, listInvitations, revokeInvitation]
    .some(callback => typeof callback !== "function")) throw new TypeError("Invalid Native invitation management configuration.");
  let changing = false;

  function check(expected, assertRequester) {
    assertRequester?.();
    const current = authority(getAuthority());
    if (FIELDS.some(key => current[key] !== expected[key])) throw failure();
  }

  async function identity(expected, assertRequester) {
    check(expected, assertRequester);
    const current = hostBinding(await getIdentity(expected));
    check(expected, assertRequester);
    return current;
  }

  async function capture(assertRequester) {
    const expected = authority(getAuthority());
    check(expected, assertRequester);
    await authenticateHost();
    check(expected, assertRequester);
    const local = await identity(expected, assertRequester);
    const core = hostBinding(await getHostBinding());
    check(expected, assertRequester);
    if (!sameBinding(local, core)) throw failure();
    return { expected, local };
  }

  async function read(captured, assertRequester) {
    const rows = invitations(await listInvitations());
    check(captured.expected, assertRequester);
    if (!sameBinding(captured.local, await identity(captured.expected, assertRequester))) throw failure();
    return snapshot("available", rows);
  }

  return Object.freeze({
    async list({ assertRequester } = {}) {
      if (!getAuthority()) return snapshot("host_required");
      try { return await read(await capture(assertRequester), assertRequester); }
      catch (error) {
        if (!getAuthority()) return snapshot("host_required");
        if (error?.code === "native_identity_unavailable") return snapshot("identity_required");
        return snapshot(error?.status === 404 ? "host_restart_required" : "unavailable");
      }
    },

    async revoke(input, { assertRequester, confirm } = {}) {
      const { invitationId } = requireNativeInvitationRevokeInput(input);
      if (typeof assertRequester !== "function" || typeof confirm !== "function") throw failure();
      if (changing) throw failure();
      changing = true;
      try {
        const captured = await capture(assertRequester);
        const current = await read(captured, assertRequester);
        const invitation = current.invitations.find(row => row.id === invitationId);
        if (!invitation || invitation.status !== "pending" || Date.parse(invitation.expiresAt) <= Date.now()) throw failure();
        const confirmed = await confirm(invitation);
        check(captured.expected, assertRequester);
        const latest = await read(captured, assertRequester);
        const target = latest.invitations.find(row => row.id === invitationId);
        if (!target || Object.keys(invitation).some(key => invitation[key] !== target[key])
          || target.status !== "pending" || Date.parse(target.expiresAt) <= Date.now()) throw failure();
        if (confirmed !== true) return latest;
        check(captured.expected, assertRequester);
        const result = invitations([await revokeInvitation(invitationId)])[0];
        check(captured.expected, assertRequester);
        if (result.id !== invitationId || result.status !== "revoked") throw failure();
        return await read(captured, assertRequester);
      } catch { throw failure(); }
      finally { changing = false; }
    },
  });
}

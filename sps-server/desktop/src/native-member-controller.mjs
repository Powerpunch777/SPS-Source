import { allocateSpsNativeMemberKeyIndex, normalizeSpsNativeMemberKeyIndex } from "./native-member-key-index.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";
import { createSpsNativeEnrollmentBootstrap, createSpsNativeEnrollmentClient,
  createSpsNativeEnrollmentRecoveryClient, createSpsNativeMemberWorkspaceClient } from "./native-enrollment-client.mjs";
import { createSpsNativeMemberKeyRequest } from "./native-member-certificates.mjs";
import { parseSpsNativeInviteCode } from "./native-connection-invite.mjs";
import { verifySpsNativeInvitationCertificate } from "./native-connection-tls.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";

const MESSAGES = Object.freeze({
  account_required: "Sign in to the current SPS account before connecting a Native device.",
  changed: "The account or connection changed. No Native result was accepted.",
  busy: "Another Native Member operation is in progress.",
  unavailable: "The Native operation could not complete. Existing credentials were preserved.",
  recovery_required: "Existing Native credentials need recovery and were not replaced.",
  invalid: "The Native Member request is invalid.",
  disposed: "The Native Member controller is closed.",
});
const failure = kind => Object.assign(new Error(MESSAGES[kind]), { code: `native_member_${kind}` });
const KEYS = ["identityIssuer", "subject", "userDataDirectory", "vaultDirectory", "generation"];

function authority(input) {
  const value = record(input, KEYS);
  // Reuse the persisted scope contract, including canonical issuer and subject.
  validateSpsNativeMemberPendingContext({ identityIssuer: value.identityIssuer, subject: value.subject,
    hostId: "00000000-0000-4000-8000-000000000001", deviceKeyId: "00000000-0000-4000-8000-000000000002",
    serverSpkiSha256: "0".repeat(64), issuerSpkiSha256: "1".repeat(64) });
  if (!(typeof value.generation === "bigint" ? value.generation >= 0n : Number.isSafeInteger(value.generation) && value.generation >= 0)
    || ["userDataDirectory", "vaultDirectory"].some(key => typeof value[key] !== "string" || !value[key])) throw new Error();
  return Object.freeze(value);
}

export function requireSpsNativeMemberEnrollmentInput(input) {
  try {
    const value = record(input, ["invitationCode", "displayName"]);
    if (typeof value.invitationCode !== "string" || value.invitationCode.length > 16384
      || !parseSpsNativeInviteCode(value.invitationCode)
      || typeof value.displayName !== "string" || !value.displayName.trim() || value.displayName.length > 120
      || /[\u0000-\u001f\u007f]/.test(value.displayName)) throw new Error();
    verifySpsNativeInvitationCertificate(value.invitationCode);
    return Object.freeze(value);
  } catch { throw failure("invalid"); }
}

export function requireSpsNativeMemberRecoveryInput(input) {
  try { const value = record(input, ["hostId"]); uuid(value.hostId); return Object.freeze(value); }
  catch { throw failure("invalid"); }
}

// Electron Main owns this composition. Callers supply current account/session
// authority; no token, private key, certificate or stored pin is returned to UI.
// Network operations are explicit and never retried automatically.
export function createSpsNativeMemberController({ getAuthority, getIndex, saveIndex, getStore, getTargetReader,
  getPublicationRecovery, authenticate, maxEntries = 128, timeoutMs = 15000,
  createKey = createSpsNativeMemberKeyRequest, createBootstrap = createSpsNativeEnrollmentBootstrap,
  createEnrollment = createSpsNativeEnrollmentClient, createRecovery = createSpsNativeEnrollmentRecoveryClient,
  createWorkspace = createSpsNativeMemberWorkspaceClient }) {
  let busy = false, disposed = false;
  const clients = new Set();
  function capture() {
    if (disposed) throw failure("disposed");
    try { return authority(getAuthority()); } catch { throw failure("account_required"); }
  }
  function guard(expected, assertRequester) {
    if (disposed) throw failure("disposed");
    assertRequester?.();
    let current;
    try { current = capture(); } catch { throw failure("changed"); }
    if (KEYS.some(key => current[key] !== expected[key])) throw failure("changed");
  }
  function indexFor(expected) {
    guard(expected);
    return normalizeSpsNativeMemberKeyIndex(getIndex());
  }
  async function run(options, action) {
    if (disposed) throw failure("disposed");
    if (busy) throw failure("busy");
    busy = true;
    const owned = [];
    try {
      const expected = capture();
      const check = () => guard(expected, options.assertRequester);
      check();
      const use = client => { clients.add(client); owned.push(client); return client; };
      const result = await action(expected, check, use);
      check();
      return result;
    } catch (error) {
      if (Object.keys(MESSAGES).some(key => error?.code === `native_member_${key}`)) throw failure(error.code.slice(14));
      throw failure("unavailable");
    } finally {
      for (const client of owned) { clients.delete(client); client.dispose(); }
      busy = false;
    }
  }
  function observation(hostId, value) {
    const result = record(value, ["deviceId", "status"]);
    uuid(result.deviceId);
    if (!["pending", "approved", "revoked"].includes(result.status)) throw failure("unavailable");
    return Object.freeze({ hostId, deviceId: result.deviceId, status: result.status });
  }
  async function exchange(client, check) {
    const token = await authenticate();
    check();
    await client.exchange(token);
    check();
  }
  return Object.freeze({
    list() {
      const expected = capture();
      const entries = indexFor(expected).entries.filter(entry => entry.identityIssuer === expected.identityIssuer
        && entry.subject === expected.subject).map(entry => Object.freeze({ hostId: entry.hostId }));
      guard(expected);
      return Object.freeze(entries);
    },
    enroll(input, options = {}) {
      const value = requireSpsNativeMemberEnrollmentInput(input);
      return run(options, async (expected, check, use) => {
        const invitation = parseSpsNativeInviteCode(value.invitationCode);
        const server = verifySpsNativeInvitationCertificate(value.invitationCode);
        if (typeof options.confirm !== "function") throw failure("invalid");
        const confirmed = await options.confirm(Object.freeze({ hostId: invitation.hostId, origin: server.origin,
          serverSpkiSha256: server.spkiSha256 }));
        check();
        if (confirmed !== true) return Object.freeze({ cancelled: true });
        const bootstrap = use(createBootstrap({ invitationCode: value.invitationCode, timeoutMs, assertCurrent: check }));
        const identity = await bootstrap.inspect();
        check();
        const allocation = allocateSpsNativeMemberKeyIndex(indexFor(expected), {
          identityIssuer: expected.identityIssuer, subject: expected.subject, hostId: invitation.hostId,
        }, { maxEntries });
        const context = validateSpsNativeMemberPendingContext({ identityIssuer: expected.identityIssuer, subject: expected.subject,
          hostId: invitation.hostId, deviceKeyId: allocation.deviceKeyId, serverSpkiSha256: server.spkiSha256,
          issuerSpkiSha256: identity.issuerSpkiSha256 });
        const store = getStore({ ...expected, context });
        let key;
        if (allocation.created) {
          // Reserve the stable ID first. A failure after this point is preserved
          // as recovery-required, never repaired by generating another key.
          await saveIndex(allocation.index, { beforeCommit: check });
          check();
          key = await createKey({ hostId: context.hostId, deviceKeyId: context.deviceKeyId });
          check();
          await store.create(key, { beforeCommit: check });
          check();
          await store.createTarget({ v: 1, kind: "sps.native.member-host-target", context,
            origin: server.origin, serverCertificatePem: server.certificatePem }, { beforeCommit: check });
        } else {
          const target = await store.readTarget();
          check();
          if (!target || target.origin !== server.origin || target.serverCertificatePem !== server.certificatePem) throw failure("recovery_required");
          key = await store.read();
          if (!key) throw failure("recovery_required");
        }
        check();
        // An issued identity is recovered through reconcile, never submitted to
        // another invite or silently overwritten.
        if (await store.readIssued()) throw failure("recovery_required");
        check();
        const client = use(createEnrollment({ invitationCode: value.invitationCode, context, timeoutMs, assertCurrent: check }));
        await exchange(client, check);
        const issuance = await client.issue(key);
        check();
        await store.createIssued(issuance, { beforeCommit: check });
        check();
        const result = await client.complete({ keyRequest: key, issuance, displayName: value.displayName });
        check();
        return observation(context.hostId, result);
      });
    },
    recover(input, options = {}) {
      const value = requireSpsNativeMemberRecoveryInput(input);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await getTargetReader({ ...expected, scope }).read();
        check();
        if (!target) throw failure("recovery_required");
        const store = getStore({ ...expected, context: target.context });
        const key = await store.read();
        check();
        const stored = await store.readIssued();
        check();
        const issuance = stored?.issuance;
        if (!key || !issuance) throw failure("recovery_required");
        const client = use(createRecovery({ target, context: target.context, timeoutMs, assertCurrent: check }));
        await exchange(client, check);
        const result = await client.reconcile({ keyRequest: key, issuance });
        check();
        return observation(scope.hostId, result);
      });
    },
    listWorkspaces(input, options = {}) {
      const value = requireSpsNativeMemberRecoveryInput(input);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await getTargetReader({ ...expected, scope }).read();
        check();
        if (!target) throw failure("recovery_required");
        const store = getStore({ ...expected, context: target.context });
        const key = await store.read();
        check();
        if (!key) throw failure("recovery_required");
        const stored = await store.readIssued();
        check();
        if (!stored?.issuance) throw failure("recovery_required");
        const client = use(createWorkspace({ target, context: target.context, timeoutMs, assertCurrent: check }));
        await exchange(client, check);
        const choices = await client.listAvailableWorkspaces({ keyRequest: key, issuance: stored.issuance });
        check();
        if (!Array.isArray(choices) || choices.length > 200) throw failure("unavailable");
        const seen = new Set();
        return Object.freeze(choices.map(input => {
          const row = record(input, ["id", "name"]);
          uuid(row.id);
          if (seen.has(row.id) || typeof row.name !== "string" || !row.name.trim() || row.name.length > 300
            || /[\u0000-\u001f\u007f]/.test(row.name)) throw failure("unavailable");
          seen.add(row.id);
          return Object.freeze({ id: row.id, name: row.name });
        }));
      });
    },
    repair(input, options = {}) {
      const value = requireSpsNativeMemberRecoveryInput(input);
      return run(options, async (expected, check) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) throw failure("recovery_required");
        if (typeof options.confirm !== "function" || typeof getPublicationRecovery !== "function") throw failure("invalid");
        const confirmed = await options.confirm(Object.freeze({ hostId: value.hostId }));
        check();
        if (confirmed !== true) return Object.freeze({ cancelled: true });
        const result = await getPublicationRecovery({ ...expected, scope }).recoverInterruptedPublications({ beforeCommit: check });
        check();
        const valueRecord = record(result, ["recovered"]);
        if (!Array.isArray(valueRecord.recovered) || valueRecord.recovered.length > 3
          || new Set(valueRecord.recovered).size !== valueRecord.recovered.length
          || valueRecord.recovered.some(kind => !["pending", "issued", "target"].includes(kind))) throw failure("unavailable");
        return Object.freeze({ hostId: scope.hostId, recovered: Object.freeze([...valueRecord.recovered]) });
      });
    },
    dispose() { disposed = true; for (const client of clients) client.dispose(); clients.clear(); },
  });
}

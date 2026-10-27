import { createHash, X509Certificate } from "node:crypto";
import { allocateSpsNativeMemberKeyIndex, normalizeSpsNativeMemberKeyIndex } from "./native-member-key-index.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";
import { createSpsNativeEnrollmentBootstrap, createSpsNativeEnrollmentClient,
  createSpsNativeEnrollmentRecoveryClient, createSpsNativeMemberWorkspaceClient,
  createSpsNativeMemberRenewalClient } from "./native-enrollment-client.mjs";
import { createSpsNativeMemberKeyRequest } from "./native-member-certificates.mjs";
import { parseSpsNativeInviteCode } from "./native-connection-invite.mjs";
import { verifySpsNativeInvitationCertificate } from "./native-connection-tls.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";
import { inspectSpsNativeMemberCredential } from "./native-member-credential.mjs";
import { validateSpsNativeMemberHostTarget } from "./native-member-target-capsule.mjs";
import { validateSpsNativeServerCertificateTransition } from "./native-identity-certificates.mjs";
import { requireSpsNativePluginRequest } from "./native-plugin-protocol.mjs";
import { validateSpsNativeWorkspaceBootstrap, validateSpsNativeWorkspaceSurface,
  validateSpsNativeInboxStateInput, validateSpsNativeInboxState } from "./native-enrollment-response.mjs";

const MESSAGES = Object.freeze({
  account_required: "Sign in to the current SPS account before connecting a Native device.",
  changed: "The account or connection changed. No Native result was accepted.",
  busy: "Another Native Member operation is in progress.",
  unavailable: "The Native operation could not complete. Existing credentials were preserved.",
  recovery_required: "Existing Native credentials need recovery and were not replaced.",
  renewal_not_due: "This Native Member certificate is outside its renewal window.",
  invalid: "The Native Member request is invalid.",
  disposed: "The Native Member controller is closed.",
});
const failure = kind => Object.assign(new Error(MESSAGES[kind]), { code: `native_member_${kind}` });
const KEYS = ["identityIssuer", "subject", "userDataDirectory", "vaultDirectory", "generation"];
const WORKSPACE_SURFACES = new Set(["shell", "providers", "dashboard", "inbox"]);

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

function issuedMetadata(input) {
  const value = record(input, ["state", "certificateNotBefore", "certificateNotAfter"]);
  if (!["current", "expired"].includes(value.state)) throw failure("unavailable");
  for (const field of ["certificateNotBefore", "certificateNotAfter"]) {
    if (typeof value[field] !== "string" || value[field].length !== 24) throw failure("unavailable");
    const parsed = new Date(value[field]);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value[field]) throw failure("unavailable");
  }
  const notBefore = Date.parse(value.certificateNotBefore), notAfter = Date.parse(value.certificateNotAfter);
  if (notBefore >= notAfter || (value.state === "expired") !== (notAfter <= Date.now())) throw failure("unavailable");
  const windowMs = Math.min(30 * 86_400_000, Math.floor((notAfter - notBefore) / 3));
  return Object.freeze({ state: value.state, certificateNotBefore: value.certificateNotBefore,
    certificateNotAfter: value.certificateNotAfter,
    renewalAvailableAt: value.state === "expired" ? null : new Date(notAfter - windowMs).toISOString() });
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

export function requireSpsNativeMemberWorkspaceBootstrapInput(input) {
  try {
    const value = record(input, ["hostId", "workspaceId"]);
    uuid(value.hostId);
    uuid(value.workspaceId);
    return Object.freeze(value);
  } catch { throw failure("invalid"); }
}

export function requireSpsNativeMemberWorkspaceSurfaceInput(input) {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const hasArchived = Object.hasOwn(descriptors, "archived");
    const value = record(input, hasArchived
      ? ["hostId", "workspaceId", "surface", "archived"]
      : ["hostId", "workspaceId", "surface"]);
    uuid(value.hostId);
    uuid(value.workspaceId);
    if (!WORKSPACE_SURFACES.has(value.surface)) throw new Error();
    if (value.surface === "inbox") {
      if (hasArchived && typeof value.archived !== "boolean") throw new Error();
    } else if (hasArchived) throw new Error();
    return Object.freeze(value);
  } catch { throw failure("invalid"); }
}

// Electron Main owns this composition. Callers supply current account/session
// authority; no token, private key, certificate or stored pin is returned to UI.
// Network operations are explicit and never retried automatically.
export function createSpsNativeMemberController({ getAuthority, getIndex, saveIndex, getStore, getTargetReader,
  getPublicationRecovery, authenticate, maxEntries = 128, timeoutMs = 15000,
  createKey = createSpsNativeMemberKeyRequest, createBootstrap = createSpsNativeEnrollmentBootstrap,
  createEnrollment = createSpsNativeEnrollmentClient, createRecovery = createSpsNativeEnrollmentRecoveryClient,
  createWorkspace = createSpsNativeMemberWorkspaceClient, createRenewal = createSpsNativeMemberRenewalClient,
  createServerCertificate = null,
  inspectCredential = inspectSpsNativeMemberCredential }) {
  let busy = false, disposed = false;
  let pluginTail = Promise.resolve(), pendingPlugins = 0;
  const clients = new Set();
  function capture() {
    if (disposed) throw failure("disposed");
    try { return authority(getAuthority()); } catch { throw failure("account_required"); }
  }
  function guard(expected, assertRequester, signal) {
    if (disposed) throw failure("disposed");
    if (signal?.aborted) throw failure("changed");
    assertRequester?.();
    let current;
    try { current = capture(); } catch { throw failure("changed"); }
    if (signal?.aborted || KEYS.some(key => current[key] !== expected[key])) throw failure("changed");
  }
  function indexFor(expected) {
    guard(expected);
    return normalizeSpsNativeMemberKeyIndex(getIndex());
  }
  async function run(options, action) {
    if (disposed) throw failure("disposed");
    if (busy) throw failure("busy");
    if (options?.signal !== undefined && !(options.signal instanceof AbortSignal)) throw failure("invalid");
    busy = true;
    const owned = [];
    try {
      const expected = capture();
      const check = () => guard(expected, options?.assertRequester, options?.signal);
      check();
      const use = client => { clients.add(client); owned.push(client); return client; };
      const result = await action(expected, check, use);
      check();
      return result;
    } catch (error) {
      if (options?.signal?.aborted) throw failure("changed");
      if (Object.keys(MESSAGES).some(key => error?.code === `native_member_${key}`)) throw failure(error.code.slice(14));
      throw failure("unavailable");
    } finally {
      for (const client of owned) { clients.delete(client); client.dispose(); }
      busy = false;
    }
  }
  // One saved-credential operation owns the controller at a time. Browser module
  // and CSS requests may arrive together; keep their bounded queue outside run's
  // single-flight gate instead of retrying a possibly dispatched action.
  function runPlugin(options, action) {
    if (pendingPlugins >= 12 || disposed) return Promise.reject(failure("busy"));
    if (options?.signal !== undefined && !(options.signal instanceof AbortSignal)) return Promise.reject(failure("invalid"));
    const expected = capture();
    guard(expected, options?.assertRequester, options?.signal);
    let cancelled = false, started = false, timer;
    let rejectWaiting;
    const waiting = new Promise((_, reject) => { rejectWaiting = reject; });
    const abort = () => { cancelled = true; rejectWaiting(failure("changed")); };
    options?.signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => { if (!started) abort(); }, timeoutMs);
    pendingPlugins++;
    const result = pluginTail.then(() => {
      if (cancelled) throw failure("changed");
      guard(expected, options?.assertRequester, options?.signal);
      started = true; clearTimeout(timer);
      return run(options, action);
    });
    pluginTail = result.then(() => { pendingPlugins--; }, () => { pendingPlugins--; });
    return Promise.race([result, waiting]).finally(() => {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", abort);
    });
  }
  function observation(hostId, value) {
    const result = record(value, ["deviceId", "status"]);
    uuid(result.deviceId);
    if (!["pending", "approved", "revoked"].includes(result.status)) throw failure("unavailable");
    return Object.freeze({ hostId, deviceId: result.deviceId, status: result.status });
  }
  async function exchange(client, check, signal) {
    const token = await authenticate();
    check();
    await client.exchange(token, signal ? { signal } : undefined);
    check();
  }
  async function readSavedTarget(expected, scope, check, use, options, refresh = true) {
    const target = await getTargetReader({ ...expected, scope }).read();
    check();
    if (!target || !refresh || createServerCertificate === null) return target;
    if (typeof createServerCertificate !== "function") throw failure("unavailable");
    const client = use(createServerCertificate({ target, context: target.context, timeoutMs, assertCurrent: check }));
    // This fixed public read authenticates the exact retained server leaf. No
    // Member key, account token or session cookie is sent before continuity is checked.
    const response = await client.getServerCertificate(options?.signal ? { signal: options.signal } : {});
    check();
    // Older Hosts can explicitly lack this optional public route. The transport
    // recognizes only their exact authenticated 404; TLS and other errors fail.
    if (response === null) return target;
    const result = record(response,
      ["hostId", "predecessorCertificateSha256", "serverCertificate", "issuerSpkiSha256"]);
    check();
    const previous = new X509Certificate(target.serverCertificatePem);
    if (result.hostId !== target.context.hostId || result.issuerSpkiSha256 !== target.context.issuerSpkiSha256
      || result.predecessorCertificateSha256 !== createHash("sha256").update(previous.raw).digest("hex")
      || typeof result.serverCertificate !== "string" || result.serverCertificate.length > 5462
      || !/^[A-Za-z0-9_-]+$/.test(result.serverCertificate)) throw failure("unavailable");
    const bytes = Buffer.from(result.serverCertificate, "base64url");
    if (!bytes.length || bytes.length > 4096 || bytes.toString("base64url") !== result.serverCertificate) throw failure("unavailable");
    const certificate = new X509Certificate(bytes);
    if (!certificate.raw.equals(bytes)) throw failure("unavailable");
    const successor = validateSpsNativeMemberHostTarget({ ...target, serverCertificatePem: certificate.toString() }, target.context);
    if (certificate.raw.equals(previous.raw)) return target;
    validateSpsNativeServerCertificateTransition({ hostId: target.context.hostId,
      predecessorCertificatePem: target.serverCertificatePem, certificatePem: successor.serverCertificatePem });
    const store = getStore({ ...expected, context: target.context });
    if (typeof store.publishServerCertificate !== "function") throw failure("unavailable");
    await store.publishServerCertificate(Object.freeze(result), { beforeCommit: check });
    check();
    const committed = validateSpsNativeMemberHostTarget(await store.readTarget(), target.context);
    check();
    if (committed.origin !== target.origin || !new X509Certificate(committed.serverCertificatePem).raw.equals(certificate.raw)) throw failure("unavailable");
    return committed;
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
        const target = await readSavedTarget(expected, scope, check, use, options);
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
    inspectCertificate(input, options = {}) {
      const value = requireSpsNativeMemberRecoveryInput(input);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) return null;
        const target = await readSavedTarget(expected, scope, check, use, options, false);
        check();
        if (!target) return null;
        const store = getStore({ ...expected, context: target.context });
        const key = await store.read();
        check();
        if (!key) return null;
        if (typeof store.inspectIssued !== "function") throw failure("unavailable");
        const metadata = await store.inspectIssued();
        check();
        if (metadata === null) return null;
        const inspected = issuedMetadata(metadata);
        return Object.freeze({ hostId: scope.hostId, ...inspected });
      });
    },
    renew(input, options = {}) {
      const value = requireSpsNativeMemberRecoveryInput(input);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await readSavedTarget(expected, scope, check, use, options);
        check();
        if (!target) throw failure("recovery_required");
        const store = getStore({ ...expected, context: target.context });
        if (typeof store.inspectIssued !== "function") throw failure("unavailable");
        const metadata = await store.inspectIssued();
        check();
        if (metadata === null) throw failure("recovery_required");
        const certificateMetadata = issuedMetadata(metadata);
        if (certificateMetadata.state === "expired") throw failure("recovery_required");
        const key = await store.read();
        check();
        const stored = await store.readIssued();
        check();
        if (!key || !stored?.issuance || !stored?.credential || typeof store.publishRenewal !== "function") throw failure("recovery_required");
        let current;
        try {
          current = await inspectCredential({ keyRequest: key,
            certificate: { v: 1, kind: "sps.native.member-certificate", hostId: target.context.hostId,
              deviceKeyId: target.context.deviceKeyId, certificatePem: stored.credential.certificatePem,
              issuerCertificatePem: stored.credential.issuerCertificatePem },
            issuerCertificatePem: stored.credential.issuerCertificatePem,
            issuerSpkiSha256: target.context.issuerSpkiSha256, now: Date.now() });
        } catch (error) {
          try { if (Date.parse(new X509Certificate(stored.credential.certificatePem).validTo) <= Date.now()) throw failure("recovery_required"); }
          catch (expiryError) { if (expiryError?.code === "native_member_recovery_required") throw expiryError; }
          throw error;
        }
        check();
        const renewalWindowMs = Math.min(30 * 86_400_000, Math.floor((current.notAfter - current.notBefore) / 3));
        if (current.notAfter <= Date.now()) throw failure("recovery_required");
        if (current.notAfter - Date.now() > renewalWindowMs) throw failure("renewal_not_due");
        if (typeof options.confirm !== "function") throw failure("invalid");
        const confirmed = await options.confirm(Object.freeze({ hostId: value.hostId,
          certificateNotAfter: new Date(current.notAfter).toISOString() }));
        check();
        if (confirmed !== true) return Object.freeze({ cancelled: true });
        const clientFactory = createRenewal;
        if (typeof clientFactory !== "function") throw failure("unavailable");
        const client = use(clientFactory({ target, context: target.context, timeoutMs, assertCurrent: check }));
        await exchange(client, check, options.signal);
        const renewal = await client.renew({ keyRequest: key, issuance: stored.issuance },
          options.signal ? { signal: options.signal } : undefined);
        check();
        const result = record(renewal, ["renewalId", "deviceId", "predecessorCertificateSha256", "certificate",
          "issuerCertificate", "certificateNotBefore", "certificateNotAfter"]);
        uuid(result.renewalId); uuid(result.deviceId);
        await store.publishRenewal(Object.freeze(result), { beforeCommit: check });
        check();
        const committed = await store.readIssued();
        check();
        if (!committed?.credential) throw failure("unavailable");
        const published = await inspectCredential({ keyRequest: key,
          certificate: { v: 1, kind: "sps.native.member-certificate", hostId: target.context.hostId,
            deviceKeyId: target.context.deviceKeyId, certificatePem: committed.credential.certificatePem,
            issuerCertificatePem: committed.credential.issuerCertificatePem },
          issuerCertificatePem: committed.credential.issuerCertificatePem,
          issuerSpkiSha256: target.context.issuerSpkiSha256, now: Date.now() });
        check();
        if (new Date(published.notAfter).toISOString() !== result.certificateNotAfter
          || !new X509Certificate(committed.credential.certificatePem).raw.equals(Buffer.from(result.certificate, "base64url"))
          || !new X509Certificate(committed.credential.issuerCertificatePem).raw.equals(Buffer.from(result.issuerCertificate, "base64url"))) throw failure("unavailable");
        return Object.freeze({ hostId: scope.hostId, deviceId: result.deviceId, status: "approved",
          certificateNotAfter: result.certificateNotAfter });
      });
    },
    listWorkspaces(input, options = {}) {
      const value = requireSpsNativeMemberRecoveryInput(input);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await readSavedTarget(expected, scope, check, use, options);
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
          if (seen.has(row.id) || typeof row.name !== "string" || row.name.length === 0) throw failure("unavailable");
          seen.add(row.id);
          return Object.freeze({ id: row.id, name: row.name });
        }));
      });
    },
    getWorkspaceBootstrap(input, options = {}) {
      const value = requireSpsNativeMemberWorkspaceBootstrapInput(input);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await readSavedTarget(expected, scope, check, use, options);
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
        await exchange(client, check, options?.signal);
        const result = validateSpsNativeWorkspaceBootstrap(await client.getWorkspaceBootstrap({ workspaceId: value.workspaceId,
          keyRequest: key, issuance: stored.issuance }, options?.signal ? { signal: options.signal } : undefined));
        check();
        if (result.workspace.id !== value.workspaceId) throw failure("unavailable");
        return result;
      });
    },
    readWorkspaceSurface(input, options = {}) {
      const value = requireSpsNativeMemberWorkspaceSurfaceInput(input);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === value.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await readSavedTarget(expected, scope, check, use, options);
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
        await exchange(client, check, options?.signal);
        const request = { workspaceId: value.workspaceId, surface: value.surface,
          ...(Object.hasOwn(value, "archived") ? { archived: value.archived } : {}),
          keyRequest: key, issuance: stored.issuance };
        const raw = await client.readWorkspaceSurface(request, options?.signal ? { signal: options.signal } : undefined);
        const result = validateSpsNativeWorkspaceSurface(value.surface, value.workspaceId, raw);
        check();
        return result;
      });
    },
    updateInboxState(input, options = {}) {
      const value = record(input, ["hostId", "workspaceId", "state"]);
      const selected = requireSpsNativeMemberWorkspaceBootstrapInput({ hostId: value.hostId, workspaceId: value.workspaceId });
      const state = validateSpsNativeInboxStateInput(value.state);
      return run(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === selected.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await readSavedTarget(expected, scope, check, use, options); check();
        if (!target) throw failure("recovery_required");
        const store = getStore({ ...expected, context: target.context });
        const key = await store.read(); check();
        if (!key) throw failure("recovery_required");
        const stored = await store.readIssued(); check();
        if (!stored?.issuance) throw failure("recovery_required");
        const client = use(createWorkspace({ target, context: target.context, timeoutMs, assertCurrent: check }));
        await exchange(client, check, options?.signal);
        const result = validateSpsNativeInboxState(await client.updateInboxState({ workspaceId: selected.workspaceId,
          state, keyRequest: key, issuance: stored.issuance }, options?.signal ? { signal: options.signal } : undefined));
        check();
        return result;
      });
    },
    async invokePlugin(input, options = {}) {
      const value = record(input, ["hostId", "workspaceId", "pluginId", "surface", "surfaceId", "revision", "operation", "key", "params"]);
      const selected = requireSpsNativeMemberWorkspaceBootstrapInput({ hostId: value.hostId, workspaceId: value.workspaceId });
      const request = requireSpsNativePluginRequest({ pluginId: value.pluginId, surface: value.surface,
        surfaceId: value.surfaceId, revision: value.revision, operation: value.operation, key: value.key, params: value.params });
      return runPlugin(options, async (expected, check, use) => {
        const scope = indexFor(expected).entries.find(entry => entry.identityIssuer === expected.identityIssuer
          && entry.subject === expected.subject && entry.hostId === selected.hostId);
        if (!scope) throw failure("recovery_required");
        const target = await readSavedTarget(expected, scope, check, use, options); check();
        if (!target) throw failure("recovery_required");
        const store = getStore({ ...expected, context: target.context });
        const key = await store.read(); check();
        const stored = await store.readIssued(); check();
        if (!key || !stored?.issuance) throw failure("recovery_required");
        const client = use(createWorkspace({ target, context: target.context, timeoutMs, assertCurrent: check }));
        await exchange(client, check, options?.signal);
        const result = await client.invokePlugin({ workspaceId: selected.workspaceId, request,
          keyRequest: key, issuance: stored.issuance }, options?.signal ? { signal: options.signal } : undefined);
        check();
        return result;
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
        if (!Array.isArray(valueRecord.recovered) || valueRecord.recovered.length > 5
          || new Set(valueRecord.recovered).size !== valueRecord.recovered.length
          || valueRecord.recovered.some(kind => !["pending", "issued", "target", "renewal", "server-certificate"].includes(kind))) throw failure("unavailable");
        return Object.freeze({ hostId: scope.hostId, recovered: Object.freeze([...valueRecord.recovered]) });
      });
    },
    dispose() { disposed = true; for (const client of clients) client.dispose(); clients.clear(); },
  });
}

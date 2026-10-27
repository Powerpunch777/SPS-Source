import { createNodeIdentity, createSignedHeartbeat, createSignedNodeRequest, executeSpsNodeCommand,
  scanLocalCapabilities, scanLocalRunnerProfiles } from "@sps/desktop-node";
import { createSignedSpsNativeNodeRegistration, requireSpsNativeNodeRequest } from "./native-node-protocol.mjs";
import { nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";
import { requireSpsNativeMemberWorkspaceBootstrapInput } from "./native-member-controller.mjs";
import { normalizeSpsNativeNodeState, nativeNodeScopeKey, nativeNodeIdentityCapsule,
  readNativeNodeIdentityCapsule, validateSpsNativeNodeIdentity } from "./native-node-state.mjs";

const fail = () => new Error("The Native Node is unavailable. Check the connection and current Host approval, then reconnect explicitly.");
const accountFields = ["identityIssuer", "subject", "userDataDirectory", "vaultDirectory", "generation"];
const operationPaths = {
  availability: () => "runners/availability", "claim-command": () => "commands/claim-next",
  "claim-plugin-run": () => "plugin-runs/claim-next", "source-route": id => `workspace-sources/${id}/claim-route`,
  "command-lease": id => `commands/${id}/lease`, "command-event": id => `commands/${id}/events`,
  "command-complete": id => `commands/${id}/complete`, "plugin-lease": id => `plugin-runs/${id}/lease`,
  "plugin-event": id => `plugin-runs/${id}/events`, "plugin-complete": id => `plugin-runs/${id}/complete`,
};

/** Main-only lifecycle owner. Renderer never chooses a command, signed payload,
 * key, endpoint or Source path. Commands are claimed only from the current Host. */
export function createSpsNativeNodeController({ getAuthority, getState, saveState, encrypt, decrypt,
  getMember, confirm, displayName = "SPS Native Node", platform = process.platform, appVersion,
  createIdentity = createNodeIdentity, scanCapabilities = scanLocalCapabilities, scanRunners = scanLocalRunnerProfiles,
  execute = executeSpsNodeCommand, cancelCommand = null, pollMs = 3000,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let disposed = false, busy = false;
  const launches = new Map();
  const stopping = new Set();
  const selectionRevisions = new Map();
  let lifecycleRevision = 0;
  let resumedAccount = null;
  const selectionKey = (authority, selected) => JSON.stringify([
    ...accountFields.slice(0, 4).map(key => authority[key]), selected.hostId, selected.workspaceId,
  ]);
  function account() {
    const value = getAuthority();
    if (disposed || !value || accountFields.slice(0, 4).some(key => typeof value[key] !== "string" || !value[key])) throw fail();
    return Object.freeze({ ...value });
  }
  function check(launch) {
    const value = account();
    if (launch.closed || launch.abort.signal.aborted || accountFields.some(key => launch.account[key] !== value[key])
      || (selectionRevisions.get(launch.selectionKey) ?? 0) !== launch.selectionRevision) throw fail();
  }
  function publicStatus(launch) {
    return Object.freeze({ nodeId: launch?.nodeId ?? null, state: launch?.state ?? "off",
      activeRun: Boolean(launch?.running), error: Boolean(launch?.failed) });
  }
  async function updateSaved(launch, patch) {
    check(launch);
    const current = normalizeSpsNativeNodeState(getState());
    const index = current.entries.findIndex(entry => nativeNodeScopeKey(entry) === nativeNodeScopeKey(launch.scope));
    const entry = { ...(index < 0 ? launch.scope : current.entries[index]), ...patch };
    const entries = [...current.entries];
    if (index < 0) entries.push(entry); else entries[index] = entry;
    await saveState(normalizeSpsNativeNodeState({ v: 1, entries }), { beforeCommit: () => check(launch) });
    check(launch);
  }
  async function invoke(launch, operation, resourceId = null, payload = {}) {
    check(launch);
    let request;
    if (operation === "register") request = { operation, nodeId: null, resourceId: null, payload };
    else {
      uuid(launch.nodeId);
      if (resourceId !== null) uuid(resourceId);
      const signed = operation === "heartbeat" ? createSignedHeartbeat({ identity: launch.identity, nodeId: launch.nodeId })
        : createSignedNodeRequest({ identity: launch.identity, nodeId: launch.nodeId, method: "POST",
          path: `/sps-nodes/${launch.nodeId}/${operationPaths[operation]?.(resourceId) ?? (() => { throw fail(); })()}`, payload });
      request = { operation, nodeId: launch.nodeId, resourceId, payload: signed };
    }
    const result = await getMember().invokeNode({ hostId: launch.scope.hostId, workspaceId: launch.scope.workspaceId,
      request: requireSpsNativeNodeRequest(request) }, { signal: launch.abort.signal, assertRequester: () => check(launch) });
    if (typeof result.origin === "string") launch.origin = result.origin;
    check(launch); return result.data;
  }
  function schedule(launch) {
    if (launch.closed || launch.abort.signal.aborted) return;
    launch.timer = setTimer(() => { launch.timer = null; void tick(launch); }, pollMs);
    launch.timer?.unref?.();
  }
  async function heartbeat(launch) {
    const node = await invoke(launch, "heartbeat");
    if (!node || node.id !== launch.nodeId || node.companyId !== launch.scope.workspaceId
      || !["active", "pending"].includes(node.status)) throw fail();
    launch.state = node.status; launch.lastHeartbeat = Date.now();
    return node;
  }
  async function failExecution(launch) {
    if (!launch.closed) { launch.failed = true; launch.state = "unavailable"; }
    launch.abort.abort();
    if (launch.running && typeof cancelCommand === "function") {
      const commandId = launch.running;
      try {
        await cancelCommand(commandId, launch.commandOwnership);
        if (launch.running === commandId) launch.running = null;
      } catch { /* Retain exact command for stop retry. */ }
    }
  }
  function keepExecutionAlive(launch) {
    let stopped = false, timer = null, inFlight = null;
    function scheduleHeartbeat() {
      if (stopped || launch.closed || launch.abort.signal.aborted) return;
      timer = setTimer(() => {
        timer = null;
        if (stopped || launch.closed || launch.abort.signal.aborted) return;
        inFlight = (async () => {
          try {
            const node = await heartbeat(launch);
            if (node.status !== "active") throw fail();
          } catch { await failExecution(launch); }
        })();
        void inFlight.then(scheduleHeartbeat);
      }, 30000);
      timer?.unref?.();
    }
    scheduleHeartbeat();
    return async () => {
      stopped = true;
      if (timer) clearTimer(timer);
      await inFlight;
    };
  }
  async function tick(launch) {
    if (launch.working) return;
    const work = (async () => {
      try {
        check(launch);
        if (!launch.lastHeartbeat || Date.now() - launch.lastHeartbeat >= 30000 || launch.state !== "active") {
          await heartbeat(launch);
        }
        if (launch.state !== "active") return;
        let kind = "command", command = await invoke(launch, "claim-command");
        if (!command) { kind = "plugin"; command = await invoke(launch, "claim-plugin-run"); }
        if (!command) return;
        uuid(command.id);
        if (command.nodeId !== launch.nodeId || command.companyId !== launch.scope.workspaceId
          || command.status !== "claimed") throw fail();
        check(launch);
        launch.running = command.id;
        const sourceRoute = ({ sourceId }) => invoke(launch, "source-route", sourceId);
        // Native provides the closed Node transport. General Agent/MCP API
        // requests are not proxied by a Node grant or by this renderer bridge.
        if (command.env?.SPS_MARKETPLACE_MCP_REQUIRED === "1" || !launch.origin) throw fail();
        const stopHeartbeat = keepExecutionAlive(launch);
        try {
          await execute({ command, hubUrl: launch.origin, nodeId: launch.nodeId,
            ownership: launch.commandOwnership,
            identity: launch.identity, profile: { connectionKind: "remote" },
            claimWorkspaceSourceRoute: sourceRoute,
            checkCommandLease: ({ commandId }) => invoke(launch, `${kind}-lease`, commandId),
            appendCommandEvent: ({ commandId, sequence, stream, body }) => invoke(launch, `${kind}-event`, commandId, { sequence, stream, body }),
            completeCommand: ({ commandId, completion }) => invoke(launch, `${kind}-complete`, commandId, completion),
          });
        } finally { await stopHeartbeat(); }
        check(launch);
      } catch {
        // Never retry an ambiguous claim/action or select another backend.
        await failExecution(launch);
      }
      if (!launch.failed) launch.running = null;
    })();
    launch.working = work;
    await work;
    if (launch.working === work) launch.working = null;
    if (!launch.failed) schedule(launch);
  }
  function close(launch) {
    if (launch.closing) return launch.closing;
    launch.closed = true; launch.abort.abort();
    if (launch.timer) clearTimer(launch.timer);
    launch.timer = null;
    const work = (async () => {
      if (launch.running) {
        // Cancellation is scoped to this exact owned command, never all Nodes.
        if (typeof cancelCommand !== "function") throw fail();
        await cancelCommand(launch.running, launch.commandOwnership);
        launch.running = null;
      }
      await launch.working;
      if (launches.get(launch.key) === launch) launches.delete(launch.key);
    })();
    launch.closing = work; stopping.add(work);
    void work.then(() => stopping.delete(work), () => { stopping.delete(work); launch.closing = null; });
    return work;
  }
  async function connect(input, options = {}) {
    const selected = requireSpsNativeMemberWorkspaceBootstrapInput(input);
    if (busy) throw fail();
    busy = true;
    let launch;
    try {
      const captured = account();
      const selectedKey = selectionKey(captured, selected);
      const selectedRevision = selectionRevisions.get(selectedKey) ?? 0;
      const assertRequester = () => {
        options.assertRequester?.();
        if (options.signal?.aborted || accountFields.some(key => captured[key] !== account()[key])
          || (selectionRevisions.get(selectedKey) ?? 0) !== selectedRevision) throw fail();
      };
      assertRequester();
      if (!options.resume) {
        if (typeof confirm !== "function" || await confirm(selected) !== true) return Object.freeze({ cancelled: true });
        assertRequester();
      }
      const recovered = await getMember().recover({ hostId: selected.hostId }, { assertRequester, signal: options.signal });
      assertRequester();
      if (recovered.status !== "approved") throw fail();
      uuid(recovered.deviceId);
      const scope = { identityIssuer: captured.identityIssuer, subject: captured.subject, ...selected, deviceId: recovered.deviceId };
      const key = nativeNodeScopeKey(scope);
      const existing = launches.get(key);
      if (existing && !existing.closed && !existing.failed
        && accountFields.every(field => existing.account[field] === captured[field])) return publicStatus(existing);
      if (existing) await close(existing);
      if (launches.size >= 4) throw fail();
      const saved = normalizeSpsNativeNodeState(getState()).entries.find(entry => nativeNodeScopeKey(entry) === key);
      if (options.resume && !saved?.enabled) throw fail();
      const identity = saved ? readNativeNodeIdentityCapsule(scope, decrypt(saved.encryptedIdentity))
        : validateSpsNativeNodeIdentity(createIdentity());
      assertRequester();
      launch = { account: captured, scope, key, identity, nodeId: saved?.nodeId ?? null,
        selectionKey: selectedKey, selectionRevision: selectedRevision,
        commandOwnership: Symbol("Native Node command owner"),
        closed: false, abort: new AbortController(), failed: false, state: "pending", timer: null,
        running: null, working: null, closing: null, lastHeartbeat: null };
      launches.set(key, launch);
      // Persist before network dispatch so response loss never replaces the key.
      await updateSaved(launch, { nodeId: launch.nodeId, encryptedIdentity: saved?.encryptedIdentity
        ?? encrypt(nativeNodeIdentityCapsule(scope, identity)), enabled: true });
      const [capabilities, runners] = await Promise.all([scanCapabilities(), scanRunners()]);
      assertRequester(); check(launch);
      const registration = { displayName, publicKey: identity.publicKeyPem, platform, appVersion,
        capabilities, runners, transportPublicKey: identity.transportPublicKeyPem };
      const node = await invoke(launch, "register", null, createSignedSpsNativeNodeRegistration({
        identity, hostId: scope.hostId, workspaceId: scope.workspaceId, deviceId: scope.deviceId, registration }));
      if (!node || node.companyId !== scope.workspaceId || !["pending", "active"].includes(node.status)) throw fail();
      if (saved?.nodeId && saved.nodeId !== node.id) throw fail();
      uuid(node.id); launch.nodeId = node.id; launch.state = node.status;
      await updateSaved(launch, { nodeId: node.id });
      assertRequester();
      // Complete first heartbeat before returning pending/active status.
      await heartbeat(launch);
      schedule(launch); return publicStatus(launch);
    } catch {
      if (launch) { launch.failed = true; launch.state = "unavailable"; await close(launch).catch(() => {}); }
      throw fail();
    } finally { busy = false; }
  }
  return Object.freeze({
    connect,
    status(input) {
      const selected = requireSpsNativeMemberWorkspaceBootstrapInput(input), captured = account();
      const current = [...launches.values()].find(launch => accountFields.slice(0, 4).every(key => captured[key] === launch.account[key])
        && launch.scope.hostId === selected.hostId && launch.scope.workspaceId === selected.workspaceId);
      if (current && (current.closed || accountFields.some(key => current.account[key] !== captured[key]))) {
        return Object.freeze({ nodeId: current.nodeId, state: "unavailable", activeRun: Boolean(current.running), error: true });
      }
      return publicStatus(current);
    },
    async disconnect(input) {
      const selected = requireSpsNativeMemberWorkspaceBootstrapInput(input), captured = account();
      const selectedKey = selectionKey(captured, selected);
      selectionRevisions.set(selectedKey, ++lifecycleRevision);
      const selectedEntries = normalizeSpsNativeNodeState(getState()).entries.filter(entry => entry.identityIssuer === captured.identityIssuer
        && entry.subject === captured.subject && entry.hostId === selected.hostId && entry.workspaceId === selected.workspaceId);
      const entries = normalizeSpsNativeNodeState(getState()).entries;
      // Compare scope keys: normalization returns new immutable records.
      const keys = new Set(selectedEntries.map(nativeNodeScopeKey));
      try {
        await saveState(normalizeSpsNativeNodeState({ v: 1, entries: entries.map(entry => keys.has(nativeNodeScopeKey(entry))
          ? { ...entry, enabled: false } : entry) }), { beforeCommit: () => {
          if (accountFields.some(key => account()[key] !== captured[key])) throw fail();
        } });
      } finally {
        // Disk failure cannot leave the explicitly disconnected local work running.
        await Promise.all([...launches.values()].filter(launch => launch.selectionKey === selectedKey).map(close));
      }
      return publicStatus(null);
    },
    async resume() {
      const captured = account();
      if (resumedAccount && accountFields.every(key => resumedAccount[key] === captured[key])) return;
      if (busy) return;
      resumedAccount = captured;
      const entries = normalizeSpsNativeNodeState(getState()).entries.filter(entry => entry.enabled
        && entry.identityIssuer === captured.identityIssuer && entry.subject === captured.subject);
      for (const entry of entries) {
        if (accountFields.some(key => account()[key] !== captured[key])) break;
        await connect({ hostId: entry.hostId, workspaceId: entry.workspaceId }, { resume: true }).catch(() => {});
      }
    },
    invalidate() { resumedAccount = null; return Promise.all([...launches.values()].map(close)); },
    async dispose() { disposed = true; await Promise.all([...launches.values()].map(close)); await Promise.all([...stopping]); },
  });
}

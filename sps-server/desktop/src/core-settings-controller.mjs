import { pathToFileURL } from "node:url";
import { createSpsSetupWindowPreferences } from "./window-security.mjs";
import { requireSpsNativeIdentityPreparationInput } from "./native-identity-controller.mjs";
import { requireSpsNativeMemberEnrollmentInput, requireSpsNativeMemberRecoveryInput,
  requireSpsNativeMemberWorkspaceBootstrapInput } from "./native-member-controller.mjs";
import { parseSpsNativeInviteCode } from "./native-connection-invite.mjs";
import { requireSpsNativeHostListenInput } from "./native-host-controller.mjs";
import { requireNativeInvitationRevokeInput } from "./native-invitation-management-controller.mjs";

export const SPS_CORE_SETTINGS_SHORTCUT = "CommandOrControl+Alt+S";
const NATIVE_DEVICE_STATES = new Set(["available", "host_required", "identity_required", "host_restart_required", "unavailable"]);
const NATIVE_DEVICE_STATUSES = new Set(["pending", "approved", "revoked"]);
const NATIVE_DEVICE_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const NATIVE_DEVICE_FINGERPRINT = /^[0-9a-f]{64}$/;
const MAX_NATIVE_DEVICES = 200;
const MAX_NATIVE_MEMBER_WORKSPACES = 200;
const UNAVAILABLE_NATIVE_DEVICES = Object.freeze({ state: "unavailable", lanEnabled: false, devices: Object.freeze([]) });
const NATIVE_INVITATION_STATES = new Set(["available", "host_required", "identity_required", "host_restart_required", "unavailable"]);
const NATIVE_INVITATION_STATUSES = new Set(["pending", "expired", "identity_changed", "consumed", "revoked", "exhausted"]);
const NATIVE_INVITATION_TARGETS = new Set(["any_verified_user", "verified_email"]);
const NATIVE_INVITATION_ID = NATIVE_DEVICE_ID;
const MAX_NATIVE_INVITATIONS = 200;
const UNAVAILABLE_NATIVE_INVITATIONS = Object.freeze({ state: "unavailable", invitations: Object.freeze([]) });

function exactDataRecord(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== "string" || !keys.includes(key))) return null;
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function validateNativeDeviceInput(input) {
  const record = exactDataRecord(input, ["deviceId"]);
  if (!record || typeof record.deviceId !== "string" || !NATIVE_DEVICE_ID.test(record.deviceId)) {
    throw new TypeError("Native device actions require one canonical device UUID.");
  }
  return Object.freeze({ deviceId: record.deviceId });
}

function validateNativeInvitationInput(input) {
  const record = requireNativeInvitationRevokeInput(input);
  return record;
}

function sanitizeNativeInvitationsSnapshot(value) {
  try {
    const snapshot = exactDataRecord(value, ["state", "invitations"]);
    if (!snapshot || !NATIVE_INVITATION_STATES.has(snapshot.state) || !Array.isArray(snapshot.invitations)
      || snapshot.invitations.length > MAX_NATIVE_INVITATIONS
      || snapshot.state !== "available" && snapshot.invitations.length !== 0) return null;
    const ids = new Set();
    const invitations = [];
    for (const candidate of snapshot.invitations) {
      const invitation = exactDataRecord(candidate, ["id", "status", "createdAt", "expiresAt", "failedAttempts", "maxAttempts", "target"]);
      if (!invitation || typeof invitation.id !== "string" || !NATIVE_INVITATION_ID.test(invitation.id) || ids.has(invitation.id)
        || !NATIVE_INVITATION_STATUSES.has(invitation.status)
        || typeof invitation.createdAt !== "string" || invitation.createdAt.length !== 24
        || typeof invitation.expiresAt !== "string" || invitation.expiresAt.length !== 24
        || !Number.isFinite(Date.parse(invitation.createdAt)) || !Number.isFinite(Date.parse(invitation.expiresAt))
        || new Date(invitation.createdAt).toISOString() !== invitation.createdAt
        || new Date(invitation.expiresAt).toISOString() !== invitation.expiresAt
        || Date.parse(invitation.expiresAt) <= Date.parse(invitation.createdAt)
        || !Number.isSafeInteger(invitation.failedAttempts) || invitation.failedAttempts < 0 || invitation.failedAttempts > 20
        || !Number.isSafeInteger(invitation.maxAttempts) || invitation.maxAttempts < 1 || invitation.maxAttempts > 20
        || invitation.failedAttempts > invitation.maxAttempts || !NATIVE_INVITATION_TARGETS.has(invitation.target)) return null;
      ids.add(invitation.id);
      invitations.push(Object.freeze({ ...invitation }));
    }
    return Object.freeze({ state: snapshot.state, invitations: Object.freeze(invitations) });
  } catch { return null; }
}

function memberObservation(value, hostId, allowCancellation = false) {
  const cancelled = allowCancellation && exactDataRecord(value, ["cancelled"]);
  if (cancelled?.cancelled === true) return Object.freeze({ cancelled: true });
  const result = exactDataRecord(value, ["hostId", "deviceId", "status"]);
  if (!result || result.hostId !== hostId || typeof result.deviceId !== "string" || !NATIVE_DEVICE_ID.test(result.deviceId)
    || !NATIVE_DEVICE_STATUSES.has(result.status)) throw new Error("Native Member status is unavailable.");
  return Object.freeze(result);
}

function memberRegistrations(value) {
  if (!Array.isArray(value) || value.length > 128) throw new Error("Native Member registrations are unavailable.");
  const ids = new Set();
  return Object.freeze(value.map(item => {
    const entry = exactDataRecord(item, ["hostId"]);
    if (!entry || typeof entry.hostId !== "string" || !NATIVE_DEVICE_ID.test(entry.hostId) || ids.has(entry.hostId)) throw new Error("Native Member registrations are unavailable.");
    ids.add(entry.hostId);
    return Object.freeze(entry);
  }));
}

function memberWorkspaces(value) {
  if (!Array.isArray(value) || value.length > MAX_NATIVE_MEMBER_WORKSPACES) throw new Error("Native Member Workspaces are unavailable.");
  const ids = new Set();
  return Object.freeze(value.map(item => {
    const entry = exactDataRecord(item, ["id", "name"]);
    if (!entry || typeof entry.id !== "string" || !NATIVE_DEVICE_ID.test(entry.id) || ids.has(entry.id)
      || typeof entry.name !== "string" || entry.name.length === 0) throw new Error("Native Member Workspaces are unavailable.");
    ids.add(entry.id);
    return Object.freeze({ id: entry.id, name: entry.name });
  }));
}

function sanitizeNativeDevicesSnapshot(value) {
  try {
    const snapshot = exactDataRecord(value, ["state", "lanEnabled", "devices"]);
    if (!snapshot || !NATIVE_DEVICE_STATES.has(snapshot.state) || snapshot.lanEnabled !== false
      || !Array.isArray(snapshot.devices) || snapshot.devices.length > MAX_NATIVE_DEVICES
      || snapshot.state !== "available" && snapshot.devices.length !== 0) return null;
    const ids = new Set();
    const devices = [];
    for (const candidate of snapshot.devices) {
      const device = exactDataRecord(candidate, ["id", "displayName", "status", "certificateSha256", "certificateNotAfter", "revision"]);
      if (!device || typeof device.id !== "string" || !NATIVE_DEVICE_ID.test(device.id) || ids.has(device.id)
        || typeof device.displayName !== "string" || device.displayName.length > 120
        || !device.displayName.trim() || /[\u0000-\u001f\u007f]/.test(device.displayName)
        || !NATIVE_DEVICE_STATUSES.has(device.status)
        || typeof device.certificateSha256 !== "string" || !NATIVE_DEVICE_FINGERPRINT.test(device.certificateSha256)
        || typeof device.certificateNotAfter !== "string" || device.certificateNotAfter.length !== 24
        || !Number.isSafeInteger(device.revision) || device.revision <= 0 || device.revision > 2_147_483_647) return null;
      const expiry = new Date(device.certificateNotAfter);
      if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== device.certificateNotAfter) return null;
      ids.add(device.id);
      devices.push(Object.freeze({
        id: device.id,
        displayName: device.displayName,
        status: device.status,
        certificateSha256: device.certificateSha256,
        certificateNotAfter: device.certificateNotAfter,
        revision: device.revision,
      }));
    }
    return Object.freeze({ state: snapshot.state, lanEnabled: false, devices: Object.freeze(devices) });
  } catch {
    return null;
  }
}

function validateRecoveryInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).join(",") !== "disabled" || typeof input.disabled !== "boolean") {
    throw new TypeError("Core recovery accepts only a disabled boolean.");
  }
  return input.disabled;
}

export function createCoreSettingsController({
  BrowserWindow,
  globalShortcut,
  rendererFile,
  preloadFile,
  getStatus,
  authorizeMutation,
  setPluginsDisabled,
  confirmRestart,
  restartHost,
  openWorkspace,
  checkUpdates,
  exportHost,
  inspectTransfer,
  confirmNativeIdentity,
  prepareNativeIdentity,
  renewNativeIdentity,
  repairNativeIdentityPublication,
  confirmNativeIdentityRenewal,
  confirmNativeIdentityRepair,
  listNativeDevices,
  approveNativeDevice,
  revokeNativeDevice,
  confirmNativeDeviceAction,
  listNativeInvitations,
  revokeNativeInvitation,
  confirmNativeInvitationRevoke,
  listNativeRegistrations,
  listNativeMemberWorkspaces,
  openNativeMemberWorkspace,
  nativeNodeStatus,
  connectNativeNode,
  disconnectNativeNode,
  enrollNativeMember,
  recoverNativeMember,
  inspectNativeMemberCertificate,
  renewNativeMemberCertificate,
  repairNativeMemberStorage,
  confirmNativeMember,
  confirmNativeMemberRepair,
  confirmNativeMemberRenewal,
  startNativeHostListener,
  stopNativeHostListener,
  confirmNativeHostListener,
  copyNativeHostInvitation,
  confirmNativeHostInvitation,
  requestQuit,
}) {
  let window = null;
  let registered = false;
  let showing = null;
  let mutation = null;
  const trustedUrl = pathToFileURL(rendererFile).href;

  function assertSender(event) {
    if (!window || window.isDestroyed() || event.sender !== window.webContents
      || !event.senderFrame || event.senderFrame !== window.webContents.mainFrame
      || event.senderFrame.url !== trustedUrl || window.webContents.getURL() !== trustedUrl) {
      throw new Error("Core Settings requests require its own trusted Native window.");
    }
  }

  async function awaitAndAssertSender(event, action) {
    let value;
    let failure;
    try { value = await action(); } catch (error) { failure = error; }
    assertSender(event);
    if (failure) throw failure;
    return value;
  }

  async function status() {
    return { ...await getStatus(), shortcut: { registered, accelerator: SPS_CORE_SETTINGS_SHORTCUT } };
  }

  async function show() {
    if (showing) return showing;
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      return;
    }
    showing = (async () => {
      const current = new BrowserWindow({
        title: "SPS Core Settings", width: 1000, height: 760, minWidth: 600, minHeight: 540,
        backgroundColor: "#f7f8fa", show: false, autoHideMenuBar: true,
        webPreferences: { ...createSpsSetupWindowPreferences(preloadFile), partition: "sps-core-settings" },
      });
      window = current;
      current.setMenu(null);
      current.setMenuBarVisibility?.(false);
      current.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      current.webContents.on("will-navigate", event => event.preventDefault());
      current.webContents.on("will-attach-webview", event => event.preventDefault());
      current.on("closed", () => { if (window === current) window = null; });
      try {
        await current.loadFile(rendererFile);
        if (!current.isDestroyed()) current.show();
      } catch (error) {
        if (window === current) window = null;
        if (!current.isDestroyed()) current.destroy();
        throw error;
      }
    })();
    try { await showing; } finally { showing = null; }
  }

  async function mutate(action) {
    if (mutation) throw new Error("Another Core Settings operation is already in progress.");
    const pending = Promise.resolve().then(action);
    mutation = pending;
    try { return await pending; } finally { if (mutation === pending) mutation = null; }
  }

  function registerIpc(ipcMain) {
    const bind = (name, action, { writes = false, input = false, authorizeBeforeAction = writes } = {}) => {
      ipcMain.handle(`desktop:core-settings-${name}`, async (event, ...args) => {
        assertSender(event);
        if ((!input && args.length !== 0) || (input && args.length !== 1)) throw new Error("Unexpected Core Settings arguments.");
        if (authorizeBeforeAction) await authorizeMutation();
        const run = () => action(args[0], event);
        try { return await (writes ? mutate(run) : run()); }
        catch (error) {
          if (error instanceof TypeError) throw error;
          throw new Error("The Core Settings action could not complete. Check the local Host status and retry.");
        }
      });
    };
    bind("get-status", status);
    bind("set-plugins-disabled", async input => {
      const disabled = validateRecoveryInput(input);
      await setPluginsDisabled(disabled);
      return status();
    }, { writes: true, input: true });
    bind("restart-host", async () => {
      if (await confirmRestart(window)) {
        // Account ownership may change while the Native confirmation is open.
        await authorizeMutation();
        await restartHost();
      }
      return status();
    }, { writes: true });
    bind("open-workspace", async () => { await openWorkspace(); return status(); });
    bind("check-updates", async () => { await checkUpdates(); return status(); });
    bind("export-host", async () => { await exportHost(); }, { writes: true });
    bind("inspect-transfer", async () => { await inspectTransfer(); });
    bind("quit-desktop", async (_input, event) => {
      assertSender(event);
      if (typeof requestQuit !== "function") throw new Error("Desktop quit is unavailable.");
      try {
        await awaitAndAssertSender(event, () => requestQuit());
      } catch {
        throw new Error("Desktop quit could not be requested.");
      }
      return { requested: true };
    }, { writes: true, authorizeBeforeAction: false });
    bind("prepare-native-identity", async (input, event) => {
      const validated = requireSpsNativeIdentityPreparationInput(input);
      if (typeof confirmNativeIdentity !== "function" || typeof prepareNativeIdentity !== "function") {
        throw new Error("Native identity preparation is unavailable.");
      }
      if (await confirmNativeIdentity(window, validated)) {
        assertSender(event);
        await authorizeMutation();
        assertSender(event);
        await prepareNativeIdentity(validated, { assertRequester: () => assertSender(event) });
      }
      return status();
    }, { writes: true, input: true });
    for (const [name, callback, confirm] of [
      ["renew-native-identity", renewNativeIdentity, confirmNativeIdentityRenewal],
      ["repair-native-identity-publication", repairNativeIdentityPublication, confirmNativeIdentityRepair],
    ]) bind(name, async (_input, event) => {
      if (typeof callback !== "function" || typeof confirm !== "function") throw new Error("Native Host certificate maintenance is unavailable.");
      assertSender(event);
      await awaitAndAssertSender(event, () => callback({
        assertRequester: () => assertSender(event),
        confirm: async preview => {
          if (name === "renew-native-identity") {
            const value = exactDataRecord(preview, ["hostId", "serverNotAfter"]);
            if (!value || !NATIVE_DEVICE_ID.test(value.hostId) || !Number.isSafeInteger(value.serverNotAfter)
              || value.serverNotAfter <= Date.now()) throw new Error("Invalid Host certificate preview.");
            preview = value;
          } else if (preview !== undefined) throw new Error("Unexpected Host repair preview.");
          await awaitAndAssertSender(event, () => authorizeMutation());
          const confirmed = await awaitAndAssertSender(event, () => confirm(window, preview));
          await awaitAndAssertSender(event, () => authorizeMutation());
          return confirmed === true;
        },
      }));
      return status();
    }, { writes: true });
    const bindNativeDeviceAction = (name, action, callback) => bind(name, async (input, event) => {
      const validated = validateNativeDeviceInput(input);
      if (typeof callback !== "function" || typeof confirmNativeDeviceAction !== "function") {
        throw new Error("Native device management is unavailable.");
      }
      if (typeof authorizeMutation !== "function") throw new Error("Native device management is unavailable.");
      await awaitAndAssertSender(event, () => authorizeMutation());
      let value;
      try {
        value = await awaitAndAssertSender(event,
          () => callback(validated, {
            assertRequester: () => assertSender(event),
            confirm: async device => {
              const target = sanitizeNativeDevicesSnapshot({ state: "available", lanEnabled: false, devices: [device] })?.devices[0];
              if (!target || target.id !== validated.deviceId) throw new Error("Native device action could not be confirmed.");
              await awaitAndAssertSender(event, () => authorizeMutation());
              const confirmed = await awaitAndAssertSender(event,
                () => confirmNativeDeviceAction(window, { action, deviceId: validated.deviceId, device: target }));
              await awaitAndAssertSender(event, () => authorizeMutation());
              return confirmed === true;
            },
          }));
      } catch {
        throw new Error("Native device action could not complete.");
      }
      const snapshot = sanitizeNativeDevicesSnapshot(value);
      if (!snapshot) throw new Error("Native device action returned an invalid status.");
      return snapshot;
    }, { writes: true, input: true, authorizeBeforeAction: false });

    bind("list-native-devices", async (_input, event) => listNativeDevicesFor(event));
    bind("list-native-registrations", async (_input, event) => {
      if (typeof listNativeRegistrations !== "function") throw new Error("Native Member registration is unavailable.");
      return memberRegistrations(await awaitAndAssertSender(event, () => listNativeRegistrations()));
    });
    bind("list-native-member-workspaces", async (input, event) => {
      const validated = requireSpsNativeMemberRecoveryInput(input);
      if (typeof listNativeMemberWorkspaces !== "function") throw new Error("Native Member Workspaces are unavailable.");
      const result = await awaitAndAssertSender(event, () => listNativeMemberWorkspaces(validated, {
        assertRequester: () => assertSender(event),
      }));
      return memberWorkspaces(result);
    }, { writes: true, input: true, authorizeBeforeAction: false });
    bind("open-native-member-workspace", async (input, event) => {
      const validated = requireSpsNativeMemberWorkspaceBootstrapInput(input);
      if (typeof openNativeMemberWorkspace !== "function") throw new Error("Native Workspace opening is unavailable.");
      const result = await awaitAndAssertSender(event, () => openNativeMemberWorkspace(validated, {
        assertRequester: () => assertSender(event),
      }));
      if (exactDataRecord(result, ["opened"])?.opened !== true) throw new Error("Native Workspace opening is unavailable.");
      return Object.freeze({ opened: true });
    }, { writes: true, input: true, authorizeBeforeAction: false });
    for (const [name, callback] of [["native-node-status", nativeNodeStatus], ["connect-native-node", connectNativeNode],
      ["disconnect-native-node", disconnectNativeNode]]) {
      bind(name, async (input, event) => {
        const selected = requireSpsNativeMemberWorkspaceBootstrapInput(input);
        if (typeof callback !== "function") throw new Error("Native Node management is unavailable.");
        const result = await awaitAndAssertSender(event, () => callback(selected, { assertRequester: () => assertSender(event) }));
        if (exactDataRecord(result, ["cancelled"])?.cancelled === true) return { cancelled: true };
        const value = exactDataRecord(result, ["nodeId", "state", "activeRun", "error"]);
        if (!value || value.nodeId !== null && (typeof value.nodeId !== "string" || !NATIVE_DEVICE_ID.test(value.nodeId))
          || !["off", "pending", "active", "unavailable"].includes(value.state)
          || typeof value.activeRun !== "boolean" || typeof value.error !== "boolean") throw new Error("Native Node management is unavailable.");
        return value;
      }, { writes: true, input: true, authorizeBeforeAction: false });
    }
    bind("start-native-host-listener", async (input, event) => {
      const validated = requireSpsNativeHostListenInput(input);
      if (typeof startNativeHostListener !== "function" || typeof confirmNativeHostListener !== "function") throw new Error("Native Host connectivity is unavailable.");
      await awaitAndAssertSender(event, () => startNativeHostListener(validated, {
        assertRequester: () => assertSender(event),
        confirm: target => awaitAndAssertSender(event, () => confirmNativeHostListener(window, target)),
      }));
      return status();
    }, { writes: true, input: true });
    bind("stop-native-host-listener", async (_input, event) => {
      if (typeof stopNativeHostListener !== "function") throw new Error("Native Host connectivity is unavailable.");
      await awaitAndAssertSender(event, () => stopNativeHostListener());
      return status();
    }, { writes: true });
    bind("copy-native-host-invitation", async (_input, event) => {
      if (typeof copyNativeHostInvitation !== "function" || typeof confirmNativeHostInvitation !== "function") throw new Error("Native Host invitations are unavailable.");
      const result = await awaitAndAssertSender(event, () => copyNativeHostInvitation({
        assertRequester: () => assertSender(event),
        confirm: target => awaitAndAssertSender(event, () => confirmNativeHostInvitation(window, target)),
      }));
      if (exactDataRecord(result, ["cancelled"])?.cancelled === true) return { cancelled: true };
      const value = exactDataRecord(result, ["copied", "expiresAt"]);
      if (!value || value.copied !== true || typeof value.expiresAt !== "string" || new Date(value.expiresAt).toISOString() !== value.expiresAt) throw new Error("Native invitation delivery is unavailable.");
      return value;
    }, { writes: true });
    bind("enroll-native-member", async (input, event) => {
      const validated = requireSpsNativeMemberEnrollmentInput(input);
      if (typeof enrollNativeMember !== "function" || typeof confirmNativeMember !== "function") throw new Error("Native Member registration is unavailable.");
      const result = await awaitAndAssertSender(event, () => enrollNativeMember(validated, {
        assertRequester: () => assertSender(event),
        confirm: target => awaitAndAssertSender(event, () => confirmNativeMember(window, target)),
      }));
      return memberObservation(result, parseSpsNativeInviteCode(validated.invitationCode).hostId, true);
    }, { writes: true, input: true, authorizeBeforeAction: false });
    bind("recover-native-member", async (input, event) => {
      const validated = requireSpsNativeMemberRecoveryInput(input);
      if (typeof recoverNativeMember !== "function") throw new Error("Native Member recovery is unavailable.");
      const result = await awaitAndAssertSender(event, () => recoverNativeMember(validated, { assertRequester: () => assertSender(event) }));
      return memberObservation(result, validated.hostId);
    }, { writes: true, input: true, authorizeBeforeAction: false });
    bind("inspect-native-member-certificate", async (input, event) => {
      const selected = requireSpsNativeMemberRecoveryInput(input);
      if (typeof inspectNativeMemberCertificate !== "function") throw new Error("Native certificate information is unavailable.");
      const result = await awaitAndAssertSender(event, () => inspectNativeMemberCertificate(selected,
        { assertRequester: () => assertSender(event) }));
      const value = exactDataRecord(result, ["hostId", "state", "certificateNotBefore", "certificateNotAfter", "renewalAvailableAt"]);
      if (!value || value.hostId !== selected.hostId || !["current", "expired"].includes(value.state)
        || ["certificateNotBefore", "certificateNotAfter"].some(key => typeof value[key] !== "string"
          || value[key].length !== 24 || !Number.isFinite(Date.parse(value[key])) || new Date(value[key]).toISOString() !== value[key])
        || Date.parse(value.certificateNotAfter) <= Date.parse(value.certificateNotBefore)
        || (value.state === "expired" ? value.renewalAvailableAt !== null
          : typeof value.renewalAvailableAt !== "string" || value.renewalAvailableAt.length !== 24
            || !Number.isFinite(Date.parse(value.renewalAvailableAt))
            || new Date(value.renewalAvailableAt).toISOString() !== value.renewalAvailableAt
            || Date.parse(value.renewalAvailableAt) < Date.parse(value.certificateNotBefore)
            || Date.parse(value.renewalAvailableAt) >= Date.parse(value.certificateNotAfter))) throw new Error("Native certificate information is unavailable.");
      return Object.freeze(value);
    }, { input: true, authorizeBeforeAction: false });
    bind("renew-native-member-certificate", async (input, event) => {
      const selected = requireSpsNativeMemberRecoveryInput(input);
      if (typeof renewNativeMemberCertificate !== "function" || typeof confirmNativeMemberRenewal !== "function") throw new Error("Native certificate renewal is unavailable.");
      const result = await awaitAndAssertSender(event, () => renewNativeMemberCertificate(selected, {
        assertRequester: () => assertSender(event),
        confirm: target => awaitAndAssertSender(event, () => confirmNativeMemberRenewal(window, target)),
      }));
      if (exactDataRecord(result, ["cancelled"])?.cancelled === true) return Object.freeze({ cancelled: true });
      const value = exactDataRecord(result, ["hostId", "deviceId", "status", "certificateNotAfter"]);
      if (!value || value.hostId !== selected.hostId || typeof value.deviceId !== "string" || !NATIVE_DEVICE_ID.test(value.deviceId) || value.status !== "approved"
        || typeof value.certificateNotAfter !== "string" || value.certificateNotAfter.length !== 24
        || !Number.isFinite(Date.parse(value.certificateNotAfter))
        || new Date(value.certificateNotAfter).toISOString() !== value.certificateNotAfter
        || Date.parse(value.certificateNotAfter) <= Date.now()) throw new Error("Native certificate renewal is unavailable.");
      return Object.freeze(value);
    }, { writes: true, input: true, authorizeBeforeAction: false });
    bind("repair-native-member-storage", async (input, event) => {
      const validated = requireSpsNativeMemberRecoveryInput(input);
      if (typeof repairNativeMemberStorage !== "function" || typeof confirmNativeMemberRepair !== "function") throw new Error("Native Member recovery is unavailable.");
      const result = await awaitAndAssertSender(event, () => repairNativeMemberStorage(validated, {
        assertRequester: () => assertSender(event),
        confirm: target => awaitAndAssertSender(event, () => confirmNativeMemberRepair(window, target)),
      }));
      if (exactDataRecord(result, ["cancelled"])?.cancelled === true) return Object.freeze({ cancelled: true });
      const value = exactDataRecord(result, ["hostId", "recovered"]);
      if (!value || value.hostId !== validated.hostId || !Array.isArray(value.recovered) || value.recovered.length > 5
        || new Set(value.recovered).size !== value.recovered.length
        || value.recovered.some(kind => !["pending", "issued", "target", "renewal", "server-certificate"].includes(kind))) throw new Error("Native Member local recovery is unavailable.");
      return Object.freeze({ hostId: value.hostId, recovered: Object.freeze([...value.recovered]) });
    }, { writes: true, input: true, authorizeBeforeAction: false });
    bindNativeDeviceAction("approve-native-device", "approve", approveNativeDevice);
    bindNativeDeviceAction("revoke-native-device", "revoke", revokeNativeDevice);
    bind("list-native-invitations", async (_input, event) => listNativeInvitationsFor(event));
    bind("revoke-native-invitation", async (input, event) => {
      const validated = validateNativeInvitationInput(input);
      if (typeof revokeNativeInvitation !== "function" || typeof confirmNativeInvitationRevoke !== "function") {
        throw new Error("Native invitation management is unavailable.");
      }
      if (typeof authorizeMutation !== "function") throw new Error("Native invitation management is unavailable.");
      await awaitAndAssertSender(event, () => authorizeMutation());
      const value = await awaitAndAssertSender(event, () => revokeNativeInvitation(validated, {
        assertRequester: () => assertSender(event),
        confirm: async invitation => {
          const target = sanitizeNativeInvitationsSnapshot({ state: "available", invitations: [invitation] })?.invitations[0];
          if (!target || target.id !== validated.invitationId || target.status !== "pending") {
            throw new Error("The current Native invitation is unavailable.");
          }
          await awaitAndAssertSender(event, () => authorizeMutation());
          const confirmed = await awaitAndAssertSender(event,
            () => confirmNativeInvitationRevoke(window, target));
          await awaitAndAssertSender(event, () => authorizeMutation());
          return confirmed === true;
        },
      }));
      if (exactDataRecord(value, ["cancelled"])?.cancelled === true) return Object.freeze({ cancelled: true });
      const snapshot = sanitizeNativeInvitationsSnapshot(value);
      if (!snapshot) throw new Error("Native invitation action returned an invalid status.");
      return snapshot;
    }, { writes: true, input: true, authorizeBeforeAction: false });
  }

  async function listNativeDevicesFor(event) {
    assertSender(event);
    if (typeof authorizeMutation !== "function") throw new Error("Native device management is unavailable.");
    await awaitAndAssertSender(event, () => authorizeMutation());
    if (typeof listNativeDevices !== "function") return UNAVAILABLE_NATIVE_DEVICES;
    let value;
    try { value = await awaitAndAssertSender(event, () => listNativeDevices()); }
    catch { throw new Error("Native device list is unavailable."); }
    return sanitizeNativeDevicesSnapshot(value) ?? UNAVAILABLE_NATIVE_DEVICES;
  }

  async function listNativeInvitationsFor(event) {
    assertSender(event);
    if (typeof authorizeMutation !== "function") throw new Error("Native invitation management is unavailable.");
    await awaitAndAssertSender(event, () => authorizeMutation());
    if (typeof listNativeInvitations !== "function") return UNAVAILABLE_NATIVE_INVITATIONS;
    let value;
    try {
      value = await awaitAndAssertSender(event, () => listNativeInvitations({ assertRequester: () => assertSender(event) }));
    } catch { throw new Error("Native invitation list is unavailable."); }
    return sanitizeNativeInvitationsSnapshot(value) ?? UNAVAILABLE_NATIVE_INVITATIONS;
  }

  function registerShortcut() {
    if (registered) return true;
    try { registered = globalShortcut.register(SPS_CORE_SETTINGS_SHORTCUT, () => { void show().catch(() => {}); }); }
    catch { registered = false; }
    return registered;
  }

  function dispose() {
    if (registered) globalShortcut.unregister(SPS_CORE_SETTINGS_SHORTCUT);
    registered = false;
  }

  const hideMenuBar = () => window?.setMenuBarVisibility?.(false);
  return { show, registerIpc, registerShortcut, dispose, getStatus: status, getWindow: () => window, hideMenuBar };
}

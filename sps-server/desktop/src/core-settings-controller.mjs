import { pathToFileURL } from "node:url";
import { createSpsSetupWindowPreferences } from "./window-security.mjs";
import { requireSpsNativeIdentityPreparationInput } from "./native-identity-controller.mjs";
import { requireSpsNativeMemberEnrollmentInput, requireSpsNativeMemberRecoveryInput } from "./native-member-controller.mjs";
import { parseSpsNativeInviteCode } from "./native-connection-invite.mjs";
import { requireSpsNativeHostListenInput } from "./native-host-controller.mjs";

export const SPS_CORE_SETTINGS_SHORTCUT = "CommandOrControl+Alt+S";
const NATIVE_DEVICE_STATES = new Set(["available", "host_required", "identity_required", "host_restart_required", "unavailable"]);
const NATIVE_DEVICE_STATUSES = new Set(["pending", "approved", "revoked"]);
const NATIVE_DEVICE_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const NATIVE_DEVICE_FINGERPRINT = /^[0-9a-f]{64}$/;
const MAX_NATIVE_DEVICES = 200;
const UNAVAILABLE_NATIVE_DEVICES = Object.freeze({ state: "unavailable", lanEnabled: false, devices: Object.freeze([]) });

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
  listNativeDevices,
  approveNativeDevice,
  revokeNativeDevice,
  confirmNativeDeviceAction,
  listNativeRegistrations,
  enrollNativeMember,
  recoverNativeMember,
  repairNativeMemberStorage,
  confirmNativeMember,
  confirmNativeMemberRepair,
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
    bind("repair-native-member-storage", async (input, event) => {
      const validated = requireSpsNativeMemberRecoveryInput(input);
      if (typeof repairNativeMemberStorage !== "function" || typeof confirmNativeMemberRepair !== "function") throw new Error("Native Member recovery is unavailable.");
      const result = await awaitAndAssertSender(event, () => repairNativeMemberStorage(validated, {
        assertRequester: () => assertSender(event),
        confirm: target => awaitAndAssertSender(event, () => confirmNativeMemberRepair(window, target)),
      }));
      if (exactDataRecord(result, ["cancelled"])?.cancelled === true) return Object.freeze({ cancelled: true });
      const value = exactDataRecord(result, ["hostId", "recovered"]);
      if (!value || value.hostId !== validated.hostId || !Array.isArray(value.recovered) || value.recovered.length > 3
        || new Set(value.recovered).size !== value.recovered.length
        || value.recovered.some(kind => !["pending", "issued", "target"].includes(kind))) throw new Error("Native Member local recovery is unavailable.");
      return Object.freeze({ hostId: value.hostId, recovered: Object.freeze([...value.recovered]) });
    }, { writes: true, input: true, authorizeBeforeAction: false });
    bindNativeDeviceAction("approve-native-device", "approve", approveNativeDevice);
    bindNativeDeviceAction("revoke-native-device", "revoke", revokeNativeDevice);
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
  return { show, registerIpc, registerShortcut, dispose, getStatus: status, hideMenuBar };
}

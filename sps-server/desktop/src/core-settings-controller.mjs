import { pathToFileURL } from "node:url";
import { createSpsSetupWindowPreferences } from "./window-security.mjs";
import { requireSpsNativeIdentityPreparationInput } from "./native-identity-controller.mjs";

export const SPS_CORE_SETTINGS_SHORTCUT = "CommandOrControl+Alt+S";

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
    const bind = (name, action, { writes = false, input = false } = {}) => {
      ipcMain.handle(`desktop:core-settings-${name}`, async (event, ...args) => {
        assertSender(event);
        if ((!input && args.length !== 0) || (input && args.length !== 1)) throw new Error("Unexpected Core Settings arguments.");
        if (writes) await authorizeMutation();
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
    bind("open-workspace", async () => { await openWorkspace(); });
    bind("check-updates", async () => { await checkUpdates(); return status(); });
    bind("export-host", async () => { await exportHost(); }, { writes: true });
    bind("inspect-transfer", async () => { await inspectTransfer(); });
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

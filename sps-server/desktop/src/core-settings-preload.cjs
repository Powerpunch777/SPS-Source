const { contextBridge, ipcRenderer } = require("electron");
const nativeDeviceIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;

function nativeDeviceInput(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)
      || (Object.getPrototypeOf(input) !== null && Object.getPrototypeOf(Object.getPrototypeOf(input)) !== null)) throw new TypeError();
    const keys = Reflect.ownKeys(input);
    const descriptor = Object.getOwnPropertyDescriptor(input, "deviceId");
    if (keys.length !== 1 || keys[0] !== "deviceId" || !descriptor?.enumerable
      || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string"
      || !nativeDeviceIdPattern.test(descriptor.value)) throw new TypeError();
    return { deviceId: descriptor.value };
  } catch {
    throw new TypeError("deviceId must be one canonical UUID");
  }
}

const coreSettingsApi = Object.freeze({
  getStatus: () => ipcRenderer.invoke("desktop:core-settings-get-status"),
  setPluginsDisabled: (input) => {
    if (!input || typeof input.disabled !== "boolean") {
      return Promise.reject(new TypeError("disabled must be a boolean"));
    }
    return ipcRenderer.invoke("desktop:core-settings-set-plugins-disabled", { disabled: input.disabled });
  },
  restartHost: () => ipcRenderer.invoke("desktop:core-settings-restart-host"),
  openWorkspace: async () => {
    return await ipcRenderer.invoke("desktop:core-settings-open-workspace");
  },
  checkUpdates: () => ipcRenderer.invoke("desktop:core-settings-check-updates"),
  exportHost: async () => {
    await ipcRenderer.invoke("desktop:core-settings-export-host");
  },
  inspectTransfer: async () => {
    await ipcRenderer.invoke("desktop:core-settings-inspect-transfer");
  },
  quitDesktop: (...args) => {
    if (args.length !== 0) return Promise.reject(new TypeError("quitDesktop accepts no arguments."));
    return ipcRenderer.invoke("desktop:core-settings-quit-desktop");
  },
  prepareNativeIdentity: (input) => {
    if (!input || typeof input.serverAddress !== "string") {
      return Promise.reject(new TypeError("A private certificate address is required."));
    }
    return ipcRenderer.invoke("desktop:core-settings-prepare-native-identity", { serverAddress: input.serverAddress });
  },
  listNativeDevices: () => ipcRenderer.invoke("desktop:core-settings-list-native-devices"),
  approveNativeDevice: input => {
    let validated;
    try { validated = nativeDeviceInput(input); }
    catch (error) { return Promise.reject(error); }
    return ipcRenderer.invoke("desktop:core-settings-approve-native-device", validated);
  },
  revokeNativeDevice: input => {
    let validated;
    try { validated = nativeDeviceInput(input); }
    catch (error) { return Promise.reject(error); }
    return ipcRenderer.invoke("desktop:core-settings-revoke-native-device", validated);
  },
});

contextBridge.exposeInMainWorld("spsCoreSettings", coreSettingsApi);

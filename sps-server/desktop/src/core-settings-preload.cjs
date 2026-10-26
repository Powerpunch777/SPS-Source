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

function nativeInvitationInput(input) {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)
      || (Object.getPrototypeOf(input) !== null && Object.getPrototypeOf(Object.getPrototypeOf(input)) !== null)) throw new TypeError();
    const keys = Reflect.ownKeys(input);
    const descriptor = Object.getOwnPropertyDescriptor(input, "invitationId");
    if (keys.length !== 1 || keys[0] !== "invitationId" || !descriptor?.enumerable
      || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string"
      || !nativeDeviceIdPattern.test(descriptor.value)) throw new TypeError();
    return { invitationId: descriptor.value };
  } catch {
    throw new TypeError("invitationId must be one canonical UUID");
  }
}

function nativeMemberInput(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || (Object.getPrototypeOf(input) !== null && Object.getPrototypeOf(Object.getPrototypeOf(input)) !== null)) throw new TypeError("Invalid Native Member request.");
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) throw new TypeError("Invalid Native Member request.");
  const value = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") throw new TypeError("Invalid Native Member request.");
    value[key] = descriptor.value;
  }
  return value;
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
  listNativeInvitations: () => ipcRenderer.invoke("desktop:core-settings-list-native-invitations"),
  revokeNativeInvitation: input => {
    let validated;
    try { validated = nativeInvitationInput(input); }
    catch (error) { return Promise.reject(error); }
    return ipcRenderer.invoke("desktop:core-settings-revoke-native-invitation", validated);
  },
  startNativeHostListener: input => {
    let value;
    try {
      const descriptors = Object.getOwnPropertyDescriptors(input ?? {});
      if (Reflect.ownKeys(descriptors).length !== 2 || typeof descriptors.bindAddress?.value !== "string"
        || descriptors.bindAddress.value.length > 45 || !Number.isSafeInteger(descriptors.port?.value)) throw new TypeError("Select a private network address and port.");
      value = { bindAddress: descriptors.bindAddress.value, port: descriptors.port.value };
    } catch (error) { return Promise.reject(error); }
    return ipcRenderer.invoke("desktop:core-settings-start-native-host-listener", value);
  },
  stopNativeHostListener: () => ipcRenderer.invoke("desktop:core-settings-stop-native-host-listener"),
  copyNativeHostInvitation: () => ipcRenderer.invoke("desktop:core-settings-copy-native-host-invitation"),
  listNativeRegistrations: () => ipcRenderer.invoke("desktop:core-settings-list-native-registrations"),
  enrollNativeMember: input => {
    let value;
    try {
      value = nativeMemberInput(input, ["invitationCode", "displayName"]);
      if (!value.invitationCode || value.invitationCode.length > 8192 || !value.displayName.trim() || value.displayName.length > 120) throw new TypeError("A Native invitation and device name are required.");
    } catch (error) { return Promise.reject(error); }
    return ipcRenderer.invoke("desktop:core-settings-enroll-native-member", value);
  },
  recoverNativeMember: input => {
    let value;
    try { value = nativeMemberInput(input, ["hostId"]); if (!nativeDeviceIdPattern.test(value.hostId)) throw new TypeError("A Native Host ID is required."); }
    catch (error) { return Promise.reject(error); }
    return ipcRenderer.invoke("desktop:core-settings-recover-native-member", value);
  },
  repairNativeMemberStorage: input => {
    let value;
    try { value = nativeMemberInput(input, ["hostId"]); if (!nativeDeviceIdPattern.test(value.hostId)) throw new TypeError("A Native Host ID is required."); }
    catch (error) { return Promise.reject(error); }
    return ipcRenderer.invoke("desktop:core-settings-repair-native-member-storage", value);
  },
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

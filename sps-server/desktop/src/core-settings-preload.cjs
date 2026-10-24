const { contextBridge, ipcRenderer } = require("electron");

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
    await ipcRenderer.invoke("desktop:core-settings-open-workspace");
  },
  checkUpdates: () => ipcRenderer.invoke("desktop:core-settings-check-updates"),
  exportHost: async () => {
    await ipcRenderer.invoke("desktop:core-settings-export-host");
  },
  inspectTransfer: async () => {
    await ipcRenderer.invoke("desktop:core-settings-inspect-transfer");
  },
});

contextBridge.exposeInMainWorld("spsCoreSettings", coreSettingsApi);

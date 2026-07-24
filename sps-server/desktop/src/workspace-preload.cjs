const { contextBridge, ipcRenderer } = require("electron");

// Attached only to the local Owner Host Workspace. It never exposes Google
// credentials, access tokens, filesystem APIs, or arbitrary IPC.
contextBridge.exposeInMainWorld("spsDesktopWorkspace", {
  getDesktopAccount: () => ipcRenderer.invoke("desktop:workspace-account"),
  signOutDesktopAccount: () => ipcRenderer.invoke("desktop:workspace-sign-out"),
  openPluginRegistries: () => ipcRenderer.invoke("desktop:workspace-open-plugin-registries"),
});

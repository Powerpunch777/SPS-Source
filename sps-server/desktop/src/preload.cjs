const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spsDesktop", {
  getStatus: () => ipcRenderer.invoke("desktop:status"),
  checkHub: (input) => ipcRenderer.invoke("desktop:check-hub", input),
  checkUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  downloadUpdate: () => ipcRenderer.invoke("desktop:download-update"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  saveProfile: (input) => ipcRenderer.invoke("desktop:save-profile", input),
  saveProjectWorkspace: (input) => ipcRenderer.invoke("desktop:save-project-workspace", input),
  chooseProjectWorkspace: () => ipcRenderer.invoke("desktop:choose-project-workspace"),
  refreshProjects: () => ipcRenderer.invoke("desktop:refresh-projects"),
  setLaunchAtLogin: (input) => ipcRenderer.invoke("desktop:set-launch-at-login", input),
  openInvite: (input) => ipcRenderer.invoke("desktop:open-invite", input),
  startAuth: () => ipcRenderer.invoke("desktop:start-auth"),
  pollAuth: () => ipcRenderer.invoke("desktop:poll-auth"),
  scanCapabilities: () => ipcRenderer.invoke("desktop:scan-capabilities"),
  connectNode: () => ipcRenderer.invoke("desktop:connect-node"),
  disconnectNode: () => ipcRenderer.invoke("desktop:disconnect-node"),
  openWorkspace: () => ipcRenderer.invoke("desktop:open-workspace"),
  openSetup: () => ipcRenderer.invoke("desktop:open-setup"),
  signOut: () => ipcRenderer.invoke("desktop:sign-out"),
  readyForJoinLink: () => ipcRenderer.invoke("desktop:ready-for-join-link"),
  onJoinLink: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("desktop:join-link", handler);
    return () => ipcRenderer.removeListener("desktop:join-link", handler);
  },
});

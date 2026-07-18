import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("spsDesktop", {
  getStatus: () => ipcRenderer.invoke("desktop:status"),
  saveProfile: (input) => ipcRenderer.invoke("desktop:save-profile", input),
  openInvite: (input) => ipcRenderer.invoke("desktop:open-invite", input),
  startAuth: () => ipcRenderer.invoke("desktop:start-auth"),
  pollAuth: () => ipcRenderer.invoke("desktop:poll-auth"),
  scanCapabilities: () => ipcRenderer.invoke("desktop:scan-capabilities"),
  connectNode: () => ipcRenderer.invoke("desktop:connect-node"),
  signOut: () => ipcRenderer.invoke("desktop:sign-out"),
  onJoinLink: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("desktop:join-link", handler);
    return () => ipcRenderer.removeListener("desktop:join-link", handler);
  },
});

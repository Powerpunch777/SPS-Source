const { contextBridge, ipcRenderer } = require("electron");

// Attached only to the local Owner Host Workspace. It never exposes Google
// credentials, access tokens, filesystem APIs, or arbitrary IPC.
contextBridge.exposeInMainWorld("spsDesktopWorkspace", {
  getDesktopAccount: () => ipcRenderer.invoke("desktop:workspace-account"),
  signOutDesktopAccount: () => ipcRenderer.invoke("desktop:workspace-sign-out"),
  getServerSettings: () => ipcRenderer.invoke("desktop:workspace-server-settings"),
  enablePrivateTeamAccess: (input) => ipcRenderer.invoke("desktop:workspace-enable-private-team-access", input),
  disablePrivateTeamAccess: () => ipcRenderer.invoke("desktop:workspace-disable-private-team-access"),
  installAgentRuntimePack: () => ipcRenderer.invoke("desktop:workspace-install-agent-runtime-pack"),
  createMemberInvite: () => ipcRenderer.invoke("desktop:workspace-create-member-invite"),
  listMemberInvites: () => ipcRenderer.invoke("desktop:workspace-list-member-invites"),
  revokeMemberInvite: (input) => ipcRenderer.invoke("desktop:workspace-revoke-member-invite", input),
  openPluginRegistries: () => ipcRenderer.invoke("desktop:workspace-open-plugin-registries"),
  // This Host-only bridge never exists on a Member Desktop or in a browser.
  listHostProjectSources: () => ipcRenderer.invoke("desktop:workspace-host-project-sources"),
  chooseHostProjectSource: (input) => ipcRenderer.invoke("desktop:workspace-choose-host-project-source", input),
  clearHostProjectSource: (input) => ipcRenderer.invoke("desktop:workspace-clear-host-project-source", input),
  manageHostProjectSource: (input) => ipcRenderer.invoke("desktop:workspace-manage-host-project-source", input),
  listHostWorkspaceSources: () => ipcRenderer.invoke("desktop:workspace-host-workspace-sources"),
  chooseHostWorkspaceSource: () => ipcRenderer.invoke("desktop:workspace-choose-host-workspace-source"),
  renameHostWorkspaceSource: (input) => ipcRenderer.invoke("desktop:workspace-rename-host-workspace-source", input),
  removeHostWorkspaceSource: (input) => ipcRenderer.invoke("desktop:workspace-remove-host-workspace-source", input),
});

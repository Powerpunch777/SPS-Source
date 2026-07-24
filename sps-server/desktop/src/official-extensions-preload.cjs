const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spsOfficialExtensions", {
  loadCatalog: () => ipcRenderer.invoke("desktop:official-extensions-load-catalog"),
  openInstallReview: () => ipcRenderer.invoke("desktop:official-extensions-open-install-review"),
});

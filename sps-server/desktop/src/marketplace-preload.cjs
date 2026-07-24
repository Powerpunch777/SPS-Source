const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spsMarketplace", {
  loadCatalog: () => ipcRenderer.invoke("desktop:marketplace-load-catalog"),
  openInstallReview: () => ipcRenderer.invoke("desktop:marketplace-open-install-review"),
});

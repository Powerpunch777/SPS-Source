const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spsRegistry", {
  listSources: () => ipcRenderer.invoke("desktop:registry-list-sources"),
  chooseLocalSource: () => ipcRenderer.invoke("desktop:registry-choose-local-source"),
  addSource: (input) => ipcRenderer.invoke("desktop:registry-add-source", input),
  removeSource: (input) => ipcRenderer.invoke("desktop:registry-remove-source", input),
  inspectSource: (input) => ipcRenderer.invoke("desktop:registry-inspect-source", input),
  stageRelease: (input) => ipcRenderer.invoke("desktop:registry-stage-release", input),
  enableStage: (input) => ipcRenderer.invoke("desktop:registry-enable-stage", input),
});

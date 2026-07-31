const { contextBridge, ipcRenderer } = require("electron");

const fixture = ipcRenderer.sendSync("desktop:plugin-preview-fixture");
if (fixture) {
  contextBridge.exposeInMainWorld("__SPS_PLUGIN_PREVIEW_FIXTURE_V1__", fixture);
}

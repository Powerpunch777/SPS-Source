const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spsNativeWorkspace", Object.freeze({
  getBootstrap: (...args) => args.length
    ? Promise.reject(new TypeError("Workspace bootstrap accepts no arguments."))
    : ipcRenderer.invoke("desktop:native-workspace-bootstrap"),
  readSurface: (...args) => {
    try {
      if (args.length !== 1) throw new TypeError();
      const input = args[0];
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError();
      const descriptors = Object.getOwnPropertyDescriptors(input);
      const keys = Reflect.ownKeys(descriptors);
      if (!keys.includes("surface") || keys.some(key => !["surface", "archived"].includes(key))
        || keys.some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError();
      const surface = descriptors.surface.value;
      if (!["shell", "providers", "dashboard", "inbox"].includes(surface)) throw new TypeError();
      const value = { surface };
      if (Object.hasOwn(descriptors, "archived")) {
        if (surface !== "inbox" || typeof descriptors.archived.value !== "boolean") throw new TypeError();
        value.archived = descriptors.archived.value;
      }
      return ipcRenderer.invoke("desktop:native-workspace-read", value);
    } catch { return Promise.reject(new TypeError("Invalid Workspace surface request.")); }
  },
}));

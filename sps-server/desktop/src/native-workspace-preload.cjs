const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("spsNativeWorkspace", Object.freeze({
  updateInboxState: (...args) => {
    try {
      if (args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0])) throw new TypeError();
      const fields = Object.getOwnPropertyDescriptors(args[0]);
      const keys = Reflect.ownKeys(fields);
      if (!keys.includes("itemId") || keys.length < 2 || keys.some(key => !["itemId", "read", "archived"].includes(key))
        || keys.some(key => !fields[key].enumerable || !Object.hasOwn(fields[key], "value"))
        || typeof fields.itemId.value !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(fields.itemId.value)) throw new TypeError();
      const result = { itemId: fields.itemId.value };
      for (const key of ["read", "archived"]) if (Object.hasOwn(fields, key)) {
        if (typeof fields[key].value !== "boolean") throw new TypeError();
        result[key] = fields[key].value;
      }
      return ipcRenderer.invoke("desktop:native-workspace-inbox-state", result);
    } catch { return Promise.reject(new TypeError("Invalid Inbox state request.")); }
  },
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
  openPlugin: (...args) => {
    try {
      if (args.length !== 1 || !args[0] || typeof args[0] !== "object" || Array.isArray(args[0])) throw new TypeError();
      const descriptors = Object.getOwnPropertyDescriptors(args[0]);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.length !== 3 || keys.some(key => !["pluginId", "surface", "surfaceId"].includes(key))
        || keys.some(key => !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw new TypeError();
      const { pluginId, surface, surfaceId } = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
      if (typeof pluginId !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(pluginId)
        || !["shell", "widget"].includes(surface) || typeof surfaceId !== "string" || !surfaceId
        || surfaceId.length > 200 || /[\x00-\x1f\x7f]/.test(surfaceId)) throw new TypeError();
      return ipcRenderer.invoke("desktop:native-workspace-open-plugin", { pluginId, surface, surfaceId });
    } catch { return Promise.reject(new TypeError("Invalid Native Plugin selection.")); }
  },
}));

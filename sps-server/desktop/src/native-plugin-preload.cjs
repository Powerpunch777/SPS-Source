const { contextBridge, ipcRenderer } = require("electron");

function snapshot(value, state, depth = 0) {
  if (++state.nodes > 8192 || depth > 24) throw new TypeError();
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError();
    return value;
  }
  if (typeof value === "string") {
    state.characters += value.length;
    if (state.characters > 64 * 1024) throw new TypeError();
    return value;
  }
  if (!value || typeof value !== "object" || state.parents.has(value)) throw new TypeError();
  state.parents.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype || value.length > 8192) throw new TypeError();
      const descriptors = Object.getOwnPropertyDescriptors(value);
      if (Reflect.ownKeys(descriptors).length !== value.length + 1) throw new TypeError();
      return Array.from({ length: value.length }, (_, index) => {
        const descriptor = descriptors[String(index)];
        if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError();
        return snapshot(descriptor.value, state, depth + 1);
      });
    }
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== "string" || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError();
      state.characters += key.length;
      if (state.characters > 64 * 1024) throw new TypeError();
      result[key] = snapshot(descriptor.value, state, depth + 1);
    }
    return result;
  } finally { state.parents.delete(value); }
}

function params(value) {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError();
    const result = snapshot(value, { nodes: 0, characters: 0, parents: new Set() });
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 64 * 1024) throw new TypeError();
    return result;
  } catch { throw new TypeError("Invalid Native Plugin parameters."); }
}

function invoke(channel, args) {
  try {
    if ((args.length !== 1 && args.length !== 2) || typeof args[0] !== "string" || !args[0] || args[0].length > 200
      || /[\x00-\x1f\x7f]/.test(args[0])) throw new TypeError();
    return ipcRenderer.invoke(channel, { key: args[0], params: params(args[1] === undefined ? {} : args[1]) });
  } catch { return Promise.reject(new TypeError("Invalid Native Plugin request.")); }
}

contextBridge.exposeInMainWorld("spsNativePlugin", Object.freeze({
  bootstrap: (...args) => args.length
    ? Promise.reject(new TypeError("Plugin bootstrap accepts no arguments."))
    : ipcRenderer.invoke("desktop:native-plugin-bootstrap"),
  getData: (...args) => invoke("desktop:native-plugin-data", args),
  performAction: (...args) => invoke("desktop:native-plugin-action", args),
}));

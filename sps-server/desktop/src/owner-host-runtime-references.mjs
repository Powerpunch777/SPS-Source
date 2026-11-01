import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const unavailable = Object.freeze({ available: false, references: Object.freeze([]) });
const singlePaths = Object.freeze([
  ["PAPERCLIP_CONFIG", "file"], ["PAPERCLIP_DB_BACKUP_DIR", "directory"],
  ["PAPERCLIP_STORAGE_LOCAL_DIR", "directory"], ["PAPERCLIP_SECRETS_MASTER_KEY_FILE", "file"],
  ["PAPERCLIP_PROJECTS_ROOT", "directory"], ["PAPERCLIP_AGENT_RUNTIME_PACKS_DIR", "directory"],
  ["SPS_MARKETPLACE_CATALOG_PATH", "file"], ["SPS_PLUGIN_NODE_COMMAND", "file"], ["SPS_PLUGIN_NPM_CLI", "file"],
]);
const pathLists = Object.freeze(["SPS_BUNDLED_PLUGIN_PATHS", "SPS_BUNDLED_PLUGIN_REFRESH_PATHS", "PAPERCLIP_BUNDLED_PLUGIN_PATHS"]);

function plain(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** Snapshot the actual launch inputs, never arbitrary environment values in a
 * public DTO. Unsupported launch shapes keep ordinary startup, but cannot
 * provide complete private cleanup references. */
export function captureSpsOwnerHostRuntimeReferences(value, baseEnvironment = {}) {
  try {
    // Node's actual process.env has a special prototype. Accept that exact
    // object, not arbitrary class instances; its own values are still copied
    // through the same descriptor/string checks before any asynchronous work.
    if (!plain(value) || !plain(baseEnvironment) && baseEnvironment !== process.env) return { runtime: value, snapshot: unavailable };
    const fields = Object.getOwnPropertyDescriptors(value);
    if (["command", "args", "cwd", "environment", "kind"].some(key => fields[key] && !("value" in fields[key]))) {
      return { runtime: value, snapshot: unavailable };
    }
    const args = fields.args?.value;
    const environment = fields.environment?.value ?? {};
    if (!Array.isArray(args) || args.length > 32 || Reflect.ownKeys(args).length !== args.length + 1
      || !plain(environment)) return { runtime: value, snapshot: unavailable };
    const copiedArgs = [];
    for (let index = 0; index < args.length; index++) {
      const field = Object.getOwnPropertyDescriptor(args, index);
      if (!field?.enumerable || !("value" in field) || typeof field.value !== "string"
        || field.value.length > 32_768 || /[\u0000-\u001f\u007f]/.test(field.value)) return { runtime: value, snapshot: unavailable };
      copiedArgs.push(field.value);
    }
    const copiedEnvironment = Object.create(null);
    for (const source of [baseEnvironment, environment]) {
      const keys = Reflect.ownKeys(source);
      if (keys.length > 2048) return { runtime: value, snapshot: unavailable };
      for (const key of keys) {
        const field = Object.getOwnPropertyDescriptor(source, key);
        if (typeof key !== "string" || !field?.enumerable || !("value" in field)
          || typeof field.value !== "string") return { runtime: value, snapshot: unavailable };
        copiedEnvironment[key] = field.value;
      }
    }
    const runtime = Object.freeze({ command: fields.command?.value, cwd: fields.cwd?.value,
      args: Object.freeze(copiedArgs), environment: Object.freeze(copiedEnvironment), kind: fields.kind?.value });
    const localPath = value => typeof value === "string" && value.length > 0 && value.length <= 32_768
      && !/[\u0000-\u001f\u007f]/.test(value) && path.isAbsolute(value) && path.resolve(value) === value
      && (process.platform === "win32" ? /^[A-Za-z]:\\$/.test(path.parse(value).root) : path.parse(value).root === "/");
    if (!localPath(runtime.command) || !localPath(runtime.cwd)) return { runtime: value, snapshot: unavailable };
    const ownerId = randomUUID();
    const references = [];
    const add = (label, referencePath, kind) => {
      if (!localPath(referencePath) || references.length >= 256) throw new Error("Unavailable runtime artifact path.");
      references.push(Object.freeze({ source: "desktop-owned-runtime", ownerId: `${ownerId}:${label}`,
        state: "retained", path: referencePath, kind }));
    };
    add("command", runtime.command, "file");
    add("cwd", runtime.cwd, "directory");
    if (runtime.kind === "packaged-owner-runtime") {
      if (copiedArgs.length !== 1 || copiedArgs[0] !== "sps-owner-host-bootstrap.mjs") throw new Error("Unsupported runtime args.");
      add("bootstrap", path.join(runtime.cwd, copiedArgs[0]), "file");
    } else if (runtime.kind === "development-core") {
      if (![8, 10].includes(copiedArgs.length) || copiedArgs[0] !== "--require" || copiedArgs[2] !== "--import"
        || copiedArgs[5] !== "run" || copiedArgs[6] !== "--instance") throw new Error("Unsupported runtime args.");
      const loaderUrl = new URL(copiedArgs[3]);
      if (loaderUrl.protocol !== "file:" || loaderUrl.search || loaderUrl.hash
        || !/^[A-Za-z0-9._-]{1,64}$/.test(copiedArgs[7])) throw new Error("Unsupported runtime args.");
      add("preflight", copiedArgs[1], "file");
      add("loader", fileURLToPath(loaderUrl), "file");
      add("entry", copiedArgs[4], "file");
      if (copiedArgs.length === 10) {
        if (copiedArgs[8] !== "--config") throw new Error("Unsupported runtime args.");
        add("config-argument", copiedArgs[9], "file");
      }
    } else throw new Error("Unsupported runtime kind.");
    const effectiveEnvironment = Object.create(null);
    // Match Node's first case-insensitive key selection on Windows; do not
    // silently invent different environment precedence for launch or capture.
    for (const key of Object.keys(copiedEnvironment).sort()) {
      const normalized = process.platform === "win32" ? key.toUpperCase() : key;
      if (!Object.hasOwn(effectiveEnvironment, normalized)) effectiveEnvironment[normalized] = copiedEnvironment[key];
    }
    for (const [key, kind] of singlePaths) {
      const selected = effectiveEnvironment[key];
      if (selected !== undefined && selected !== "") add(key, selected, kind);
    }
    for (const key of pathLists) {
      const selected = effectiveEnvironment[key];
      if (selected !== undefined && selected !== "") selected.split(path.delimiter).forEach((entry, index) => add(`${key}:${index}`, entry, "directory"));
    }
    return { runtime, copiedEnvironment: true,
      snapshot: Object.freeze({ available: true, references: Object.freeze(references) }) };
  } catch { return { runtime: value, snapshot: unavailable }; }
}

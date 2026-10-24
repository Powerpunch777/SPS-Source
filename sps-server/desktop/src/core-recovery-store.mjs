import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const FILE_NAME = "core-recovery.json";
const MAX_BYTES = 4096;
const queues = new Map();

function rootPath(userDataPath) {
  if (typeof userDataPath !== "string" || !path.isAbsolute(userDataPath)) {
    throw new TypeError("Core recovery storage requires an absolute application data path.");
  }
  return path.resolve(userDataPath);
}

async function safeDirectory(root, create = false) {
  const parsed = path.parse(root);
  let current = parsed.root;
  for (const segment of root.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create) return false;
      await fs.mkdir(current);
      stat = await fs.lstat(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Core recovery storage is not a regular directory.");
  }
  return true;
}

async function safeFile(file) {
  try {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_BYTES) {
      throw new Error("Core recovery settings are not a bounded regular file.");
    }
    return stat;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function loadCoreRecoverySettings({ userDataPath }) {
  const root = rootPath(userDataPath);
  try {
    if (!await safeDirectory(root)) return { pluginsDisabled: false, storageError: null };
    const file = path.join(root, FILE_NAME);
    if (!await safeFile(file)) return { pluginsDisabled: false, storageError: null };
    const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let raw;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_BYTES) throw new Error("Invalid recovery file.");
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
      if (bytesRead > MAX_BYTES) throw new Error("Recovery file is too large.");
      raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, bytesRead));
    } finally {
      await handle.close();
    }
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== "pluginsDisabled,schemaVersion,updatedAt"
      || value.schemaVersion !== 1 || typeof value.pluginsDisabled !== "boolean"
      || typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
      throw new Error("Invalid recovery settings.");
    }
    return { pluginsDisabled: value.pluginsDisabled, storageError: null };
  } catch {
    // A damaged recovery preference must never silently re-enable plugin code.
    return { pluginsDisabled: true, storageError: "Core recovery settings could not be read. Plugin startup is blocked until these settings are repaired." };
  }
}

export async function saveCoreRecoverySettings({ userDataPath, disabled }) {
  if (typeof disabled !== "boolean") throw new TypeError("Plugin recovery mode must be a boolean.");
  const root = rootPath(userDataPath);
  const previous = queues.get(root) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    await safeDirectory(root, true);
    const file = path.join(root, FILE_NAME);
    await safeFile(file);
    const temporary = path.join(root, `.core-recovery-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, pluginsDisabled: disabled, updatedAt: new Date().toISOString() })}\n`, { flag: "wx", mode: 0o600 });
      await safeDirectory(root);
      await safeFile(file);
      await fs.rename(temporary, file);
    } finally {
      await fs.unlink(temporary).catch(() => {});
    }
    return loadCoreRecoverySettings({ userDataPath: root });
  });
  queues.set(root, operation);
  try {
    return await operation;
  } finally {
    if (queues.get(root) === operation) queues.delete(root);
  }
}

export function coreRecoveryEnvironment(settings) {
  return { SPS_PLUGIN_RECOVERY_MODE: settings?.pluginsDisabled === false ? "" : "all-disabled" };
}

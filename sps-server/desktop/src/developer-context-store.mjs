import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, rename, rm, lstat } from "node:fs/promises";
import path from "node:path";

const SCHEMA_VERSION = 1;
const MAX_BINDINGS = 256;
const MAX_STORE_BYTES = 128 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const PROJECT_ID_PATTERN = /^dev-([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/i;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const vaultQueues = new Map();

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function assertAbsoluteVaultRoot(vaultRoot) {
  if (typeof vaultRoot !== "string" || vaultRoot.length === 0 || !path.isAbsolute(vaultRoot)) {
    throw new Error("Developer context vault root must be an absolute path");
  }
  return path.resolve(vaultRoot);
}

export function normalizeDeveloperContext(input) {
  if (!hasExactKeys(input, ["companyId", "pluginId", "contextId"])) {
    throw new Error("Developer context must contain exactly companyId, pluginId, and contextId");
  }
  if (typeof input.companyId !== "string" || !UUID_PATTERN.test(input.companyId)
    || typeof input.contextId !== "string" || !UUID_PATTERN.test(input.contextId)) {
    throw new Error("Developer context companyId and contextId must be UUIDs");
  }
  if (typeof input.pluginId !== "string" || !PLUGIN_ID_PATTERN.test(input.pluginId)) {
    throw new Error("Developer context pluginId is invalid");
  }
  return {
    companyId: input.companyId.toLowerCase(),
    pluginId: input.pluginId,
    contextId: input.contextId.toLowerCase(),
  };
}

function contextKey(context) {
  return JSON.stringify([context.companyId, context.pluginId, context.contextId]);
}

function normalizeProjectId(projectId) {
  if (typeof projectId !== "string") throw new Error("Developer context projectId is invalid");
  const match = PROJECT_ID_PATTERN.exec(projectId);
  if (!match) throw new Error("Developer context projectId must be a dev-UUID");
  return `dev-${match[1].toLowerCase()}`;
}

function normalizeTimestamp(value) {
  const timestamp = value instanceof Date
    ? (Number.isFinite(value.getTime()) ? value.toISOString() : null)
    : value;
  if (typeof timestamp !== "string" || !ISO_TIMESTAMP_PATTERN.test(timestamp)
    || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new Error("Developer context updatedAt must be a canonical ISO timestamp");
  }
  return timestamp;
}

function normalizeNow(now) {
  return normalizeTimestamp(now === undefined ? new Date() : now);
}

function normalizeBinding(value) {
  const keys = ["companyId", "pluginId", "contextId", "projectId", "updatedAt"];
  if (!hasExactKeys(value, keys)) throw new Error("Developer context binding has unknown or missing fields");
  const context = normalizeDeveloperContext({
    companyId: value.companyId,
    pluginId: value.pluginId,
    contextId: value.contextId,
  });
  const projectId = normalizeProjectId(value.projectId);
  const updatedAt = normalizeTimestamp(value.updatedAt);
  if (context.companyId !== value.companyId || context.contextId !== value.contextId || projectId !== value.projectId) {
    throw new Error("Developer context binding identifiers must be canonical");
  }
  return { ...context, projectId, updatedAt };
}

function normalizeStore(value) {
  if (!hasExactKeys(value, ["schemaVersion", "bindings"]) || value.schemaVersion !== SCHEMA_VERSION
    || !Array.isArray(value.bindings) || value.bindings.length > MAX_BINDINGS) {
    throw new Error("Developer context link store schema is invalid");
  }
  const bindings = value.bindings.map(normalizeBinding);
  const seen = new Set();
  for (const binding of bindings) {
    const key = contextKey(binding);
    if (seen.has(key)) throw new Error("Developer context link store contains duplicate contexts");
    seen.add(key);
  }
  return { schemaVersion: SCHEMA_VERSION, bindings };
}

function pathsFor(vaultRoot) {
  const root = assertAbsoluteVaultRoot(vaultRoot);
  const directory = path.join(root, "developer-mode");
  return { root, directory, store: path.join(directory, "context-links.json") };
}

async function lstatOrMissing(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function assertRealDirectory(stats, label) {
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`Developer context ${label} must be a real directory`);
  }
}

function assertRegularStoreFile(stats) {
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error("Developer context link store must be a regular file");
  }
  if (stats.size > MAX_STORE_BYTES) throw new Error("Developer context link store exceeds 128 KiB");
}

function sameFile(expected, actual) {
  if (!actual.isFile() || expected.size !== actual.size || expected.mtimeMs !== actual.mtimeMs
    || expected.ctimeMs !== actual.ctimeMs) return false;
  for (const key of ["dev", "ino"]) {
    const first = expected[key];
    const second = actual[key];
    if (Number.isFinite(first) && Number.isFinite(second) && first !== 0 && second !== 0 && first !== second) return false;
  }
  return true;
}

async function inspectRoot(root) {
  const stats = await lstatOrMissing(root);
  if (!stats) return null;
  assertRealDirectory(stats, "vault root");
  return await realpath(root);
}

async function inspectDirectory(root, directory, { create = false } = {}) {
  const rootRealPath = await inspectRoot(root);
  if (!rootRealPath) return null;
  let stats = await lstatOrMissing(directory);
  if (!stats && create) {
    await mkdir(directory);
    stats = await lstat(directory);
  }
  if (!stats) return null;
  assertRealDirectory(stats, "store directory");
  const directoryRealPath = await realpath(directory);
  const relative = path.relative(rootRealPath, directoryRealPath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Developer context link directory escapes the vault root");
  }
  return { rootRealPath, directoryRealPath };
}

async function readStore(paths) {
  const directory = await inspectDirectory(paths.root, paths.directory);
  if (!directory) return null;
  const pathStats = await lstatOrMissing(paths.store);
  if (!pathStats) return null;
  assertRegularStoreFile(pathStats);

  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  const handle = await open(paths.store, constants.O_RDONLY | noFollow);
  let stream;
  try {
    const openedStats = await handle.stat();
    assertRegularStoreFile(openedStats);
    if (!sameFile(pathStats, openedStats)) throw new Error("Developer context link store changed while opening");
    stream = handle.createReadStream({ autoClose: false, highWaterMark: 16 * 1024 });
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > MAX_STORE_BYTES) throw new Error("Developer context link store exceeds 128 KiB");
      chunks.push(chunk);
    }
    const finalHandleStats = await handle.stat();
    const finalPathStats = await lstat(paths.store);
    assertRegularStoreFile(finalPathStats);
    if (!sameFile(openedStats, finalHandleStats) || !sameFile(openedStats, finalPathStats) || size !== openedStats.size) {
      throw new Error("Developer context link store changed while reading");
    }
    const bytes = Buffer.concat(chunks, size);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return normalizeStore(JSON.parse(text));
  } finally {
    stream?.destroy();
    await handle.close();
  }
}

async function ensureDirectory(paths) {
  const rootRealPath = await inspectRoot(paths.root);
  if (!rootRealPath) throw new Error("Developer context vault root does not exist");
  const directory = await inspectDirectory(paths.root, paths.directory, { create: true });
  if (!directory || directory.rootRealPath !== rootRealPath) throw new Error("Developer context vault changed while opening its store");
  return directory;
}

async function writeStore(paths, store) {
  const directory = await ensureDirectory(paths);
  const bytes = Buffer.from(`${JSON.stringify(normalizeStore(store), null, 2)}\n`, "utf8");
  if (bytes.length > MAX_STORE_BYTES) throw new Error("Developer context link store exceeds 128 KiB");

  const existingStats = await lstatOrMissing(paths.store);
  if (existingStats) assertRegularStoreFile(existingStats);
  const temporaryPath = path.join(paths.directory, `.context-links-${process.pid}-${randomUUID()}.tmp`);
  const temporary = await open(temporaryPath, "wx", 0o600);
  try {
    try {
      await temporary.writeFile(bytes);
      await temporary.sync();
    } finally {
      await temporary.close();
    }
    const beforeRename = await inspectDirectory(paths.root, paths.directory);
    if (!beforeRename || beforeRename.directoryRealPath !== directory.directoryRealPath) {
      throw new Error("Developer context link directory changed before save");
    }
    const targetStats = await lstatOrMissing(paths.store);
    if (targetStats) assertRegularStoreFile(targetStats);
    await rename(temporaryPath, paths.store);
  } finally {
    const currentDirectory = await inspectDirectory(paths.root, paths.directory).catch(() => null);
    if (currentDirectory?.directoryRealPath === directory.directoryRealPath) {
      await rm(temporaryPath, { force: true });
    }
  }
}

function serializeByVault(vaultRoot, operation) {
  const paths = pathsFor(vaultRoot);
  const previous = vaultQueues.get(paths.root) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(() => operation(paths));
  vaultQueues.set(paths.root, current);
  return current.finally(() => {
    if (vaultQueues.get(paths.root) === current) vaultQueues.delete(paths.root);
  });
}

export async function loadDeveloperContextLinks({ vaultRoot } = {}) {
  return await serializeByVault(vaultRoot, async paths => await readStore(paths) ?? { schemaVersion: SCHEMA_VERSION, bindings: [] });
}

export async function setDeveloperContextLink({ vaultRoot, context, projectId, now } = {}) {
  const normalizedContext = normalizeDeveloperContext(context);
  const normalizedProjectId = normalizeProjectId(projectId);
  const updatedAt = normalizeNow(now);
  const binding = { ...normalizedContext, projectId: normalizedProjectId, updatedAt };
  return await serializeByVault(vaultRoot, async paths => {
    const store = await readStore(paths) ?? { schemaVersion: SCHEMA_VERSION, bindings: [] };
    const key = contextKey(normalizedContext);
    const index = store.bindings.findIndex(entry => contextKey(entry) === key);
    if (index === -1 && store.bindings.length >= MAX_BINDINGS) {
      throw new Error("Developer context link store is at capacity");
    }
    const bindings = [...store.bindings];
    if (index === -1) bindings.push(binding);
    else bindings[index] = binding;
    const next = normalizeStore({ schemaVersion: SCHEMA_VERSION, bindings });
    await writeStore(paths, next);
    return binding;
  });
}

export async function clearDeveloperContextLink({ vaultRoot, context } = {}) {
  const normalizedContext = normalizeDeveloperContext(context);
  return await serializeByVault(vaultRoot, async paths => {
    const store = await readStore(paths);
    if (!store) return false;
    const key = contextKey(normalizedContext);
    const bindings = store.bindings.filter(entry => contextKey(entry) !== key);
    if (bindings.length === store.bindings.length) return false;
    await writeStore(paths, { schemaVersion: SCHEMA_VERSION, bindings });
    return true;
  });
}

export async function getDeveloperContextLink({ vaultRoot, context } = {}) {
  const normalizedContext = normalizeDeveloperContext(context);
  return await serializeByVault(vaultRoot, async paths => {
    const store = await readStore(paths);
    if (!store) return null;
    const key = contextKey(normalizedContext);
    return store.bindings.find(entry => contextKey(entry) === key) ?? null;
  });
}

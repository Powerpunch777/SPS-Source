import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const LIMIT = 128 * 1024;
const failure = () => new Error("Runtime configuration references are unavailable or changed; preserve all package files.");
const fields = ["dev", "ino", "birthtimeNs", "size", "mtimeNs", "ctimeNs"];
const same = (a, b, names = fields) => names.every(key => a[key] === b[key]);
const plain = value => value && typeof value === "object" && !Array.isArray(value);
const localPath = value => typeof value === "string" && value.length > 0 && value.length <= 32_768
  && !/[\u0000-\u001f\u007f\uFFFD]/.test(value) && path.isAbsolute(value) && path.resolve(value) === value
  && (process.platform === "win32" ? /^[A-Za-z]:\\$/.test(path.parse(value).root) : path.parse(value).root === "/");

async function ancestry(file, fsApi) {
  const entries = [];
  for (let directory = path.dirname(file);; directory = path.dirname(directory)) {
    if (entries.length >= 1024) throw failure();
    const stats = await fsApi.lstat(directory, { bigint: true });
    if (!stats.isDirectory() || stats.isSymbolicLink() || stats.dev === 0n || stats.ino === 0n) throw failure();
    entries.push({ directory, stats });
    if (path.dirname(directory) === directory) return entries;
  }
}

async function snapshot(file, fsApi) {
  const parents = await ancestry(file, fsApi);
  const before = await fsApi.lstat(file, { bigint: true });
  const regular = info => info.isFile() && !info.isSymbolicLink() && info.nlink === 1n
    && info.dev !== 0n && info.ino !== 0n && info.birthtimeNs !== 0n && info.size <= BigInt(LIMIT);
  if (!regular(before)) throw failure();
  const handle = await fsApi.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let bytes;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!regular(opened) || !same(before, opened)) throw failure();
    const buffer = Buffer.alloc(LIMIT + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    bytes = buffer.subarray(0, offset);
    const after = await handle.stat({ bigint: true });
    if (offset > LIMIT || BigInt(offset) !== before.size || !regular(after) || !same(before, after)) throw failure();
  } finally { await handle.close(); }
  const after = await fsApi.lstat(file, { bigint: true });
  const currentParents = await ancestry(file, fsApi);
  if (!regular(after) || !same(before, after) || parents.length !== currentParents.length
    || parents.some((entry, index) => entry.directory !== currentParents[index].directory
      || !same(entry.stats, currentParents[index].stats, ["dev", "ino", "birthtimeNs"]))) throw failure();
  return { bytes, identity: before, parents };
}

function parse(bytes) {
  let text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  if (/[\u0000\uFFFD\uFEFF]/.test(text)) throw failure();
  const value = JSON.parse(text);
  const canonical = JSON.stringify(value, null, 2);
  const normalized = text.replace(/\r\n/g, "\n");
  // Canonical text also rejects duplicate/escaped duplicate keys rather than
  // trusting the last value retained by JSON.parse.
  if (!plain(value) || normalized !== canonical && normalized !== `${canonical}\n`) throw failure();
  return value;
}

/** Private read-only path references, not config contents or cleanup authority. */
export async function readSpsRuntimeConfigArtifactReferences({ configPath, kind, fsApi = fs } = {}) {
  if (!localPath(configPath) || !["core", "memory"].includes(kind)) throw failure();
  const initial = await snapshot(configPath, fsApi);
  let config;
  try { config = parse(initial.bytes); } catch { throw failure(); }
  const references = [];
  const add = (label, value, type) => {
    if (!localPath(value)) throw failure();
    references.push(Object.freeze({ source: "desktop-runtime-config", ownerId: `${kind}:${label}`,
      state: "retained", path: value, kind: type }));
  };
  add("config", configPath, "file");
  if (kind === "core") {
    if (config.database?.mode !== "embedded-postgres" || config.logging?.mode !== "file"
      || config.storage?.provider !== "local_disk" || config.secrets?.provider !== "local_encrypted") throw failure();
    add("database", config.database.embeddedPostgresDataDir, "directory");
    add("logs", config.logging.logDir, "directory");
    add("storage", config.storage.localDisk?.baseDir, "directory");
    add("secrets", config.secrets.localEncrypted?.keyFilePath, "file");
    if (config.database.backup?.dir !== undefined) add("backups", config.database.backup.dir, "directory");
  } else {
    const relative = value => {
      if (typeof value !== "string" || !value || value.startsWith("~") || /[\u0000-\u001f\u007f\uFFFD]/.test(value)
        || value.length > 32_768 || process.platform === "win32" && /^[A-Za-z]:[^\\/]/.test(value)) throw failure();
      if (path.isAbsolute(value)) return value;
      return path.resolve(path.dirname(configPath), value);
    };
    add("data", relative(config.dataDir ?? "./data"), "directory");
    if (config.journalRoot !== undefined) add("journal-root", relative(config.journalRoot), "directory");
    const journals = config.journals ?? [];
    if (!Array.isArray(journals) || journals.length > 128) throw failure();
    journals.forEach((journal, index) => {
      if (!plain(journal)) throw failure();
      add(`journal:${index}`, relative(journal.path), "file");
    });
  }
  return Object.freeze({ references: Object.freeze(references), async assertCurrent() {
    const current = await snapshot(configPath, fsApi);
    if (!same(initial.identity, current.identity) || !initial.bytes.equals(current.bytes)
      || initial.parents.length !== current.parents.length
      || initial.parents.some((entry, index) => entry.directory !== current.parents[index].directory
        || !same(entry.stats, current.parents[index].stats, ["dev", "ino", "birthtimeNs"]))) throw failure();
    return true;
  } });
}

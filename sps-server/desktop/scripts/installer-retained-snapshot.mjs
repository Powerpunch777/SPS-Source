import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { assertPlainDirectory } from "./installer-ci-safety.mjs";

const FAILURE = "Installer snapshot is unavailable.";
const MAX_ENTRIES = 100000;
const MAX_BYTES = 4 * 1024 ** 3;
const MAX_TIMEOUT = 120000;
const MAX_DEPTH = 64;
const CHUNK_SIZE = 64 * 1024;
const fail = () => new Error(FAILURE);

function validOptions({ maxEntries, maxBytes, timeoutMs }) {
  return Number.isSafeInteger(maxEntries) && maxEntries >= 1 && maxEntries <= MAX_ENTRIES
    && Number.isSafeInteger(maxBytes) && maxBytes >= 1 && maxBytes <= MAX_BYTES
    && Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= MAX_TIMEOUT;
}

function identity(stat) {
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || ![stat.dev, stat.ino, stat.birthtimeNs].every(value => typeof value === "bigint" && value >= 0n)) throw fail();
  return { dev: String(stat.dev), ino: String(stat.ino), birthtimeNs: String(stat.birthtimeNs) };
}

function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs;
}

function stamp(stat, type) {
  if (stat.isSymbolicLink() || (type === "file" && (!stat.isFile() || stat.nlink !== 1n))
    || (type === "directory" && !stat.isDirectory())) throw fail();
  return [stat.dev, stat.ino, stat.birthtimeNs, stat.size, stat.mtimeNs, stat.ctimeNs, stat.nlink].join(":");
}

async function canonicalRoot(root) {
  return assertPlainDirectory(root);
}

export async function captureInstallerSnapshot(root, {
  maxEntries = MAX_ENTRIES, maxBytes = MAX_BYTES, timeoutMs = MAX_TIMEOUT,
} = {}) {
  try {
    if (typeof root !== "string" || !path.isAbsolute(root) || /[\0\r\n]/.test(root)) throw fail();
    if (!validOptions({ maxEntries, maxBytes, timeoutMs })) throw fail();
    const started = performance.now();
    const checkTime = () => { if (performance.now() - started > timeoutMs) throw fail(); };
    const canonical = await canonicalRoot(root);
    const rootStat = await lstat(canonical, { bigint: true });
    const rootIdentity = identity(rootStat);
    const files = [];
    const directories = [];
    const records = new Map();
    let bytes = 0;
    let entries = 0;

    const accountEntry = () => {
      if (++entries > maxEntries) throw fail();
      checkTime();
    };
    const verifyAncestor = async directory => {
      if (await assertPlainDirectory(directory) !== directory) throw fail();
    };

    async function walk(directory, relativeDirectory, depth, collect) {
      checkTime();
      const directoryStat = await lstat(directory, { bigint: true });
      const directoryStamp = stamp(directoryStat, "directory");
      accountEntry();
      if (collect) {
        directories.push({ path: relativeDirectory || "." });
      }
      records.set(relativeDirectory || ".", { type: "directory", stamp: directoryStamp });
      await verifyAncestor(directory);
      const names = await readdir(directory);
      names.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      for (const name of names) {
        checkTime();
        const full = path.join(directory, name);
        const relative = relativeDirectory ? `${relativeDirectory}/${name}` : name;
        const details = await lstat(full, { bigint: true });
        if (details.isSymbolicLink()) throw fail();
        if (details.isDirectory()) {
          if (depth >= MAX_DEPTH) throw fail();
          await walk(full, relative, depth + 1, collect);
          continue;
        }
        const beforeStamp = stamp(details, "file");
        accountEntry();
        if (!collect) {
          records.set(relative, { type: "file", stamp: beforeStamp });
          continue;
        }
        if (details.size > BigInt(maxBytes) - BigInt(bytes)) throw fail();
        await verifyAncestor(directory);
        const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
        const handle = await open(full, flags);
        let digest;
        try {
          const openedBefore = await handle.stat({ bigint: true });
          if (stamp(openedBefore, "file") !== beforeStamp) throw fail();
          const hash = createHash("sha256");
          const buffer = Buffer.allocUnsafe(CHUNK_SIZE);
          let position = 0;
          while (position < Number(openedBefore.size)) {
            checkTime();
            const length = Math.min(buffer.length, Number(openedBefore.size) - position);
            const { bytesRead } = await handle.read(buffer, 0, length, position);
            if (bytesRead === 0) throw fail();
            hash.update(buffer.subarray(0, bytesRead));
            position += bytesRead;
          }
          const openedAfter = await handle.stat({ bigint: true });
          if (stamp(openedAfter, "file") !== beforeStamp) throw fail();
          digest = hash.digest("hex");
        } finally {
          await handle.close();
        }
        await verifyAncestor(directory);
        const after = await lstat(full, { bigint: true });
        if (stamp(after, "file") !== beforeStamp) throw fail();
        bytes += Number(details.size);
        files.push({ path: relative, size: Number(details.size), sha256: digest });
        records.set(relative, { type: "file", stamp: beforeStamp });
      }
      const afterDirectory = await lstat(directory, { bigint: true });
      if (stamp(afterDirectory, "directory") !== directoryStamp) throw fail();
    }

    await walk(canonical, "", 0, true);
    checkTime();
    const originalRecords = new Map(records);
    records.clear();
    entries = 0;
    await walk(canonical, "", 0, false);
    if (records.size !== originalRecords.size) throw fail();
    for (const [name, record] of originalRecords) {
      const current = records.get(name);
      if (!current || current.type !== record.type || current.stamp !== record.stamp) throw fail();
    }
    if (await canonicalRoot(root) !== canonical) throw fail();
    const finalRoot = identity(await lstat(canonical, { bigint: true }));
    if (!sameIdentity(rootIdentity, finalRoot)) throw fail();

    const canonicalEntries = [
      ...files.map(file => ({ path: file.path, type: "file", size: file.size, sha256: file.sha256 })),
      ...directories.map(directory => ({ path: directory.path, type: "directory", size: 0, sha256: "" })),
    ].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
    const sha256 = createHash("sha256").update(JSON.stringify(canonicalEntries)).digest("hex");
    checkTime();
    return { rootIdentity, files, directories, bytes, sha256 };
  } catch {
    throw fail();
  }
}

export async function assertInstallerSnapshot(root, snapshot) {
  try {
    const current = await captureInstallerSnapshot(root);
    if (!snapshot || typeof snapshot !== "object"
      || !sameIdentity(current.rootIdentity, snapshot.rootIdentity)
      || current.bytes !== snapshot.bytes || current.sha256 !== snapshot.sha256
      || JSON.stringify(current.files) !== JSON.stringify(snapshot.files)
      || JSON.stringify(current.directories) !== JSON.stringify(snapshot.directories)) throw fail();
    return true;
  } catch {
    throw fail();
  }
}

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { c as createTar, t as listTar, x as extractTar } from "tar";

export const SPS_OWNER_HOST_RUNTIME_ARCHIVE = "sps-owner-host-runtime.tgz";
export const SPS_OWNER_HOST_RUNTIME_PACKAGE_MANIFEST = "sps-owner-host-runtime-package.json";
export const SPS_REQUEST_HOSTNAME_RUNTIME_PATH = "node_modules/@paperclipai/server/dist/middleware/request-hostname.js";
const MATERIALIZED_MARKER = ".sps-runtime-materialized.json";
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_RUNTIME_BYTES = 3 * 1024 * 1024 * 1024;
const MAX_RUNTIME_FILES = 60_000;
const REQUIRED_RUNTIME_FILES = [
  "sps-owner-host-runtime.json",
  "sps-release-baseline.json",
  "sps-owner-host-bootstrap.mjs",
  "sps-owner-host-restore.mjs",
  "package.json",
  "bin/node.exe",
  "dist/index.js",
  "ui-dist/index.html",
  "node_modules/tsx/dist/loader.mjs",
  SPS_REQUEST_HOSTNAME_RUNTIME_PATH,
];
const CRITICAL_RUNTIME_FILES = [SPS_REQUEST_HOSTNAME_RUNTIME_PATH];

function asPositiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
    throw new Error(`SPS Owner Host runtime ${label} is outside the supported limit.`);
  }
  return value;
}

function normalizeArchiveEntry(value) {
  const input = String(value || "").replaceAll("\\", "/");
  if (!input || input.includes("\0") || input.startsWith("/") || input.startsWith("//") || /^[A-Za-z]:/.test(input)) {
    throw new Error("SPS Owner Host runtime archive contains an unsafe path.");
  }
  const segments = input.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..")) {
    throw new Error("SPS Owner Host runtime archive contains a path traversal.");
  }
  return segments.join("/") || ".";
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

async function collectRuntimeFiles(root, { fsApi = fs } = {}) {
  const files = [];
  async function visit(directory, relativeDirectory = "") {
    const entries = await fsApi.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const details = await fsApi.lstat(absolute);
      if (details.isSymbolicLink() || (!details.isFile() && !details.isDirectory())) {
        throw new Error(`SPS Owner Host runtime contains an unsupported filesystem entry: ${relative}`);
      }
      if (details.isDirectory()) {
        await visit(absolute, relative);
      } else {
        files.push({ path: relative.replaceAll("\\", "/"), size: details.size });
      }
      if (files.length > MAX_RUNTIME_FILES) {
        throw new Error("SPS Owner Host runtime contains too many files.");
      }
    }
  }
  await visit(root);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_RUNTIME_BYTES) {
    throw new Error("SPS Owner Host runtime is too large.");
  }
  return { files, totalBytes };
}

function validatePackageManifest(value) {
  if (!value || value.format !== 1 || value.kind !== "sps-owner-host-runtime") {
    throw new Error("SPS Owner Host runtime package manifest is invalid.");
  }
  if (value.archive?.file !== SPS_OWNER_HOST_RUNTIME_ARCHIVE || !/^[a-f0-9]{64}$/.test(value.archive?.sha256 || "")) {
    throw new Error("SPS Owner Host runtime package archive identity is invalid.");
  }
  if (!/^[a-f0-9]{64}$/.test(value.runtime?.manifestSha256 || "")) {
    throw new Error("SPS Owner Host runtime manifest identity is invalid.");
  }
  if (!value.runtime?.criticalFiles || typeof value.runtime.criticalFiles !== "object" || Array.isArray(value.runtime.criticalFiles)) {
    throw new Error("SPS Owner Host runtime critical-file identity is invalid.");
  }
  for (const relative of CRITICAL_RUNTIME_FILES) {
    if (!/^[a-f0-9]{64}$/.test(value.runtime.criticalFiles[relative] || "")) {
      throw new Error(`SPS Owner Host runtime critical-file identity is invalid: ${relative}`);
    }
  }
  asPositiveInteger(value.archive.sizeBytes, "archive size", MAX_ARCHIVE_BYTES);
  asPositiveInteger(value.runtime.fileCount, "file count", MAX_RUNTIME_FILES);
  asPositiveInteger(value.runtime.sizeBytes, "expanded size", MAX_RUNTIME_BYTES);
  return value;
}

async function criticalRuntimeFilesMatch(runtimeRoot, expected) {
  try {
    for (const relative of CRITICAL_RUNTIME_FILES) {
      if (await sha256File(path.join(runtimeRoot, relative)) !== expected?.[relative]) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function readSpsOwnerHostRuntimePackage(packageRoot, { fsApi = fs } = {}) {
  const manifestPath = path.join(packageRoot, SPS_OWNER_HOST_RUNTIME_PACKAGE_MANIFEST);
  const archivePath = path.join(packageRoot, SPS_OWNER_HOST_RUNTIME_ARCHIVE);
  const manifest = validatePackageManifest(JSON.parse((await fsApi.readFile(manifestPath, "utf8")).replace(/^\uFEFF/, "")));
  const archive = await fsApi.stat(archivePath);
  if (!archive.isFile() || archive.size !== manifest.archive.sizeBytes || archive.size > MAX_ARCHIVE_BYTES) {
    throw new Error("SPS Owner Host runtime archive size does not match its package manifest.");
  }
  if (await sha256File(archivePath) !== manifest.archive.sha256) {
    throw new Error("SPS Owner Host runtime archive failed SHA-256 verification.");
  }
  return { manifest, manifestPath, archivePath };
}

export async function inspectSpsOwnerHostRuntimeArchive({ archivePath, expected, tarList = listTar } = {}) {
  const files = [];
  let totalBytes = 0;
  await tarList({
    file: archivePath,
    strict: true,
    onentry: (entry) => {
      const normalized = normalizeArchiveEntry(entry.path);
      if (entry.type === "Directory") return;
      if (entry.type !== "File" && entry.type !== "OldFile" && entry.type !== "ContiguousFile") {
        throw new Error(`SPS Owner Host runtime archive contains an unsupported entry type: ${entry.type}`);
      }
      const size = asPositiveInteger(entry.size, "entry size", MAX_RUNTIME_BYTES);
      files.push({ path: normalized, size });
      totalBytes += size;
      if (files.length > MAX_RUNTIME_FILES || totalBytes > MAX_RUNTIME_BYTES) {
        throw new Error("SPS Owner Host runtime archive exceeds its extraction limits.");
      }
    },
  });
  if (expected && (files.length !== expected.fileCount || totalBytes !== expected.sizeBytes)) {
    throw new Error("SPS Owner Host runtime archive contents do not match its package manifest.");
  }
  const paths = new Set(files.map((file) => file.path));
  for (const required of REQUIRED_RUNTIME_FILES) {
    if (!paths.has(required)) throw new Error(`SPS Owner Host runtime archive is missing ${required}.`);
  }
  return { files, totalBytes };
}

export async function createSpsOwnerHostRuntimePackage({
  runtimeRoot,
  packageRoot,
  fsApi = fs,
  tarCreate = createTar,
} = {}) {
  if (!runtimeRoot || !packageRoot) throw new Error("SPS Owner Host runtime package paths are required.");
  const runtime = await collectRuntimeFiles(runtimeRoot, { fsApi });
  for (const required of REQUIRED_RUNTIME_FILES) {
    if (!runtime.files.some((file) => file.path === required)) {
      throw new Error(`SPS Owner Host runtime is missing ${required}.`);
    }
  }
  await fsApi.rm(packageRoot, { recursive: true, force: true });
  await fsApi.mkdir(packageRoot, { recursive: true });
  const archivePath = path.join(packageRoot, SPS_OWNER_HOST_RUNTIME_ARCHIVE);
  const disabledHardlinkCache = {
    get: () => undefined,
    set: () => disabledHardlinkCache,
  };
  await tarCreate({
    cwd: runtimeRoot,
    file: archivePath,
    gzip: { level: 6 },
    jobs: 1,
    linkCache: disabledHardlinkCache,
    noMtime: true,
    portable: true,
    strict: true,
  }, ["."]);
  const archive = await fsApi.stat(archivePath);
  if (!archive.isFile() || archive.size > MAX_ARCHIVE_BYTES) {
    throw new Error("SPS Owner Host runtime archive is too large.");
  }
  const runtimeManifestPath = path.join(runtimeRoot, "sps-owner-host-runtime.json");
  const manifest = {
    format: 1,
    kind: "sps-owner-host-runtime",
    archive: {
      file: SPS_OWNER_HOST_RUNTIME_ARCHIVE,
      sizeBytes: archive.size,
      sha256: await sha256File(archivePath),
    },
    runtime: {
      fileCount: runtime.files.length,
      sizeBytes: runtime.totalBytes,
      manifestSha256: await sha256File(runtimeManifestPath),
      criticalFiles: Object.fromEntries(await Promise.all(CRITICAL_RUNTIME_FILES.map(async (relative) => [
        relative,
        await sha256File(path.join(runtimeRoot, relative)),
      ]))),
    },
  };
  await fsApi.writeFile(
    path.join(packageRoot, SPS_OWNER_HOST_RUNTIME_PACKAGE_MANIFEST),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

async function runtimeIsReady(targetRuntimeRoot, packageManifest, { fsApi = fs } = {}) {
  try {
    const marker = JSON.parse((await fsApi.readFile(path.join(targetRuntimeRoot, MATERIALIZED_MARKER), "utf8")).replace(/^\uFEFF/, ""));
    if (marker.archiveSha256 !== packageManifest.archive.sha256) return false;
    if (await sha256File(path.join(targetRuntimeRoot, "sps-owner-host-runtime.json")) !== packageManifest.runtime.manifestSha256) return false;
    if (!await criticalRuntimeFilesMatch(targetRuntimeRoot, packageManifest.runtime.criticalFiles)) return false;
    await Promise.all(REQUIRED_RUNTIME_FILES.map((relative) => fsApi.access(path.join(targetRuntimeRoot, relative))));
    return true;
  } catch {
    return false;
  }
}

export function isRuntimePreparationLockOwnerGone(owner, { probe = (pid) => process.kill(pid, 0) } = {}) {
  if (!Number.isSafeInteger(owner?.pid) || owner.pid <= 0 || owner.pid === process.pid) return false;
  try {
    probe(owner.pid);
    return false;
  } catch (error) {
    // Age and probe failures such as EPERM are not evidence that the owner
    // stopped. A reused live PID conservatively keeps the preparation locked.
    return error?.code === "ESRCH";
  }
}

async function acquireRuntimeLock(lockPath, { fsApi = fs, delay, targetRuntimeRoot, packageManifest } = {}) {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const handle = await fsApi.open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
      return handle;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (await runtimeIsReady(targetRuntimeRoot, packageManifest, { fsApi })) return null;
      const details = await fsApi.stat(lockPath).catch(() => null);
      if (details && details.size <= 4096 && Date.now() - details.mtimeMs > 15 * 60_000) {
        const owner = await fsApi.readFile(lockPath, "utf8")
          .then((value) => JSON.parse(value.replace(/^\uFEFF/, "")))
          .catch(() => null);
        if (isRuntimePreparationLockOwnerGone(owner)) {
          // Recheck the file observed before the process probe; another
          // preparation may have replaced it while that probe was pending.
          const currentDetails = await fsApi.stat(lockPath).catch(() => null);
          if (currentDetails && ["dev", "ino", "size", "mtimeMs", "ctimeMs"]
            .every((key) => currentDetails[key] === details[key])) {
            await fsApi.rm(lockPath, { force: true }).catch(() => undefined);
            continue;
          }
        }
      }
      await delay(500);
    }
  }
  throw new Error("SPS Owner Host runtime preparation is already running for too long.");
}

async function renameRuntimeDirectory(fsApi, source, destination, delay) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fsApi.rename(source, destination);
      return;
    } catch (error) {
      if (attempt >= 4 || !["EPERM", "EBUSY"].includes(error?.code)) throw error;
      await delay(100 * (attempt + 1));
    }
  }
}

export async function materializeSpsOwnerHostRuntimePackage({
  packageRoot,
  targetRuntimeRoot,
  fsApi = fs,
  tarList = listTar,
  tarExtract = extractTar,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!packageRoot || !targetRuntimeRoot) return null;
  const runtimePackage = await readSpsOwnerHostRuntimePackage(packageRoot, { fsApi });
  if (await runtimeIsReady(targetRuntimeRoot, runtimePackage.manifest, { fsApi })) return targetRuntimeRoot;
  await inspectSpsOwnerHostRuntimeArchive({
    archivePath: runtimePackage.archivePath,
    expected: runtimePackage.manifest.runtime,
    tarList,
  });
  await fsApi.mkdir(path.dirname(targetRuntimeRoot), { recursive: true });
  const lockPath = `${targetRuntimeRoot}.lock`;
  const lock = await acquireRuntimeLock(lockPath, {
    fsApi,
    delay,
    targetRuntimeRoot,
    packageManifest: runtimePackage.manifest,
  });
  if (!lock) return targetRuntimeRoot;
  const stagingRoot = `${targetRuntimeRoot}.staging-${process.pid}-${Date.now()}`;
  let staleTarget = null;
  try {
    if (await runtimeIsReady(targetRuntimeRoot, runtimePackage.manifest, { fsApi })) return targetRuntimeRoot;
    await fsApi.rm(stagingRoot, { recursive: true, force: true });
    await fsApi.mkdir(stagingRoot, { recursive: true });
    await tarExtract({
      cwd: stagingRoot,
      file: runtimePackage.archivePath,
      preservePaths: false,
      strict: true,
      filter: (entryPath, entry) => {
        normalizeArchiveEntry(entryPath);
        return entry.type === "Directory" || entry.type === "File" || entry.type === "OldFile" || entry.type === "ContiguousFile";
      },
    });
    const expanded = await collectRuntimeFiles(stagingRoot, { fsApi });
    const criticalFilesMatch = await criticalRuntimeFilesMatch(stagingRoot, runtimePackage.manifest.runtime.criticalFiles);
    if (
      expanded.files.length !== runtimePackage.manifest.runtime.fileCount
      || expanded.totalBytes !== runtimePackage.manifest.runtime.sizeBytes
      || await sha256File(path.join(stagingRoot, "sps-owner-host-runtime.json")) !== runtimePackage.manifest.runtime.manifestSha256
      || !criticalFilesMatch
    ) {
      throw new Error("SPS Owner Host runtime failed post-extraction verification.");
    }
    await fsApi.writeFile(path.join(stagingRoot, MATERIALIZED_MARKER), `${JSON.stringify({
      format: 1,
      archiveSha256: runtimePackage.manifest.archive.sha256,
      materializedAt: new Date().toISOString(),
    }, null, 2)}\n`, "utf8");
    try {
      const previousRuntimeRoot = `${targetRuntimeRoot}.stale-${process.pid}-${Date.now()}`;
      await renameRuntimeDirectory(fsApi, targetRuntimeRoot, previousRuntimeRoot, delay);
      staleTarget = previousRuntimeRoot;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      staleTarget = null;
    }
    await renameRuntimeDirectory(fsApi, stagingRoot, targetRuntimeRoot, delay);
    if (staleTarget) void fsApi.rm(staleTarget, { recursive: true, force: true }).catch(() => undefined);
    return targetRuntimeRoot;
  } catch (error) {
    if (staleTarget) {
      try {
        let destinationExists = false;
        try {
          await fsApi.lstat(targetRuntimeRoot);
          destinationExists = true;
        } catch (lookupError) {
          if (lookupError?.code !== "ENOENT") throw lookupError;
        }
        if (destinationExists) throw new Error("Runtime replacement destination is occupied; refusing rollback overwrite.");
        await renameRuntimeDirectory(fsApi, staleTarget, targetRuntimeRoot, delay);
      } catch (restoreError) {
        // Preserve both paths if rollback cannot be proved. Never discard the
        // only previous runtime or overwrite an unexpected destination.
        throw new AggregateError([error, restoreError],
          `SPS Owner Host runtime replacement and rollback failed. Preserved previous runtime at ${staleTarget} and candidate at ${stagingRoot}.`);
      }
    }
    await fsApi.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    await lock.close().catch(() => undefined);
    await fsApi.rm(lockPath, { force: true }).catch(() => undefined);
  }
}

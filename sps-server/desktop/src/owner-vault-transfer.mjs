import fs from "node:fs/promises";
import path from "node:path";

export const SPS_OWNER_TRANSFER_FORMAT = "sps-owner-vault-transfer";
export const SPS_OWNER_TRANSFER_VERSION = 1;
export const SPS_OWNER_RESTORE_MODE = "fresh-host-only";

const INCLUDED_PATHS = [
  "database/owner-host.sql.gz",
  "storage",
  "instances",
  "projects",
  "memory/data",
  "memory/journals",
];
const INCLUDED_PATH_SET = new Set(INCLUDED_PATHS);
const TRANSFER_MANIFEST_NAME = "sps-transfer.json";

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function transferTimestamp(now) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function manifestPath(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isAllowedBundleEntry(entry) {
  return entry === "database" || entry === "database/owner-host.sql.gz" ||
    entry === "memory" || entry === "memory/data" || entry.startsWith("memory/data/") ||
    entry === "memory/journals" || entry.startsWith("memory/journals/") ||
    entry === "storage" || entry.startsWith("storage/") ||
    entry === "instances" || entry.startsWith("instances/") ||
    entry === "projects" || entry.startsWith("projects/");
}

async function listBundleEntries(root, fsApi, relativeRoot = "") {
  const entries = [];
  const current = relativeRoot ? path.join(root, relativeRoot) : root;
  const children = await fsApi.readdir(current, { withFileTypes: true });
  for (const child of children) {
    const relativePath = manifestPath(path.join(relativeRoot, child.name));
    if (relativePath === TRANSFER_MANIFEST_NAME) continue;
    const childPath = path.join(root, relativePath);
    const stat = await lstatRequired(childPath, fsApi, "SPS transfer encountered an unreadable path.");
    entries.push(relativePath);
    if (stat.isDirectory()) entries.push(...await listBundleEntries(root, fsApi, relativePath));
  }
  return entries;
}

async function lstatRequired(target, fsApi, message) {
  let stat;
  try {
    stat = await fsApi.lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(message);
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`SPS transfer refuses symbolic links or reparse points: ${target}`);
  return stat;
}

async function assertSafeTree(root, fsApi) {
  const rootStat = await lstatRequired(root, fsApi, `SPS transfer path does not exist: ${root}`);
  if (!rootStat.isDirectory()) throw new Error(`SPS transfer path is not a directory: ${root}`);

  const entries = await fsApi.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    const entryStat = await lstatRequired(entryPath, fsApi, "SPS transfer encountered an unreadable path.");
    if (entryStat.isDirectory()) await assertSafeTree(entryPath, fsApi);
  }
}

async function assertSafeDirectory(directory, fsApi) {
  const stat = await lstatRequired(directory, fsApi, `SPS transfer path does not exist: ${directory}`);
  if (!stat.isDirectory()) throw new Error(`SPS transfer path is not a directory: ${directory}`);
}

async function assertSafeFile(filePath, fsApi, missingMessage) {
  const stat = await lstatRequired(filePath, fsApi, missingMessage);
  if (!stat.isFile()) throw new Error(`SPS transfer path is not a file: ${filePath}`);
}

async function assertWithinRealRoot(root, candidate, fsApi, message) {
  const realRoot = await fsApi.realpath(root);
  const realCandidate = await fsApi.realpath(candidate);
  if (!isInside(realRoot, realCandidate)) throw new Error(message);
}

export function createSpsOwnerTransferName(now = new Date()) {
  return `SPS-transfer-${transferTimestamp(now)}`;
}

async function inspectFreshVaultEntries(root, fsApi, relativeRoot = "") {
  const entries = [];
  for (const child of await fsApi.readdir(path.join(root, relativeRoot), { withFileTypes: true })) {
    const relativePath = manifestPath(path.join(relativeRoot, child.name));
    const target = path.join(root, relativePath);
    const stat = await lstatRequired(target, fsApi, "SPS restore target contains an unreadable path.");
    if (stat.isDirectory()) {
      entries.push(...await inspectFreshVaultEntries(root, fsApi, relativePath));
    } else {
      entries.push(relativePath);
    }
  }
  return entries;
}

/**
 * Checks whether a vault is safe to receive a Host restore. Existing Host
 * state is never merged or replaced; only an absent or bootstrap-only vault
 * is accepted.
 */
export async function inspectSpsOwnerVaultRestoreTarget({ vaultRoot, fsApi = fs } = {}) {
  if (!vaultRoot) throw new Error("SPS Owner Vault restore target is required.");
  const root = path.resolve(vaultRoot);
  try {
    const stat = await fsApi.lstat(root);
    if (stat.isSymbolicLink()) throw new Error("SPS restore refuses a symbolic-link Host Vault.");
    if (!stat.isDirectory()) return { root, fresh: false, entries: ["<not-a-directory>"] };
  } catch (error) {
    if (error?.code === "ENOENT") return { root, fresh: true, entries: [], reason: "vault-does-not-exist" };
    throw error;
  }
  const entries = await inspectFreshVaultEntries(root, fsApi);
  const dataEntries = entries.filter((entry) => entry !== "config.json");
  return {
    root,
    fresh: dataEntries.length === 0,
    entries,
    reason: dataEntries.length === 0 ? "bootstrap-only" : "existing-host-data",
  };
}

export async function assertSpsOwnerVaultRestoreTarget(options = {}) {
  const inspection = await inspectSpsOwnerVaultRestoreTarget(options);
  if (!inspection.fresh) {
    throw new Error("SPS Host restore is allowed only into a fresh Host Vault. Existing Host data cannot be merged or replaced.");
  }
  return inspection;
}

async function copyDirectoryIfPresent(source, destination, fsApi, included, label) {
  try {
    const stat = await fsApi.lstat(source);
    if (stat.isSymbolicLink()) throw new Error(`SPS transfer refuses symbolic links or reparse points: ${source}`);
    if (!stat.isDirectory()) return;
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  await assertSafeTree(source, fsApi);
  await fsApi.cp(source, destination, { recursive: true, errorOnExist: true });
  included.push(label);
}

async function requireBackupFile(vaultRoot, backupFile, fsApi) {
  const backupRoot = path.join(vaultRoot, "backups");
  const resolvedBackup = path.resolve(backupFile);
  if (!isInside(backupRoot, resolvedBackup) || !resolvedBackup.toLowerCase().endsWith(".sql.gz")) {
    throw new Error("SPS transfer requires a database backup created inside this Owner Vault.");
  }
  await assertSafeFile(resolvedBackup, fsApi, "The SPS database backup file is not readable.");
  await assertWithinRealRoot(backupRoot, resolvedBackup, fsApi, "SPS transfer backup path escapes the Owner Vault.");
  return resolvedBackup;
}

export async function exportSpsOwnerVaultTransfer({
  vaultRoot,
  backupFile,
  destinationRoot,
  now = new Date(),
  fsApi = fs,
} = {}) {
  if (!vaultRoot || !backupFile || !destinationRoot) {
    throw new Error("SPS transfer export requires an Owner Vault, database backup, and destination folder.");
  }
  const root = path.resolve(vaultRoot);
  const destination = path.resolve(destinationRoot);
  await assertSafeDirectory(root, fsApi);
  await assertSafeDirectory(destination, fsApi);
  const databaseBackup = await requireBackupFile(root, backupFile, fsApi);
  const bundleRoot = path.join(destination, createSpsOwnerTransferName(now));
  if (!isInside(destination, bundleRoot)) throw new Error("SPS transfer destination is invalid.");

  try {
    await fsApi.mkdir(bundleRoot, { recursive: false });
  } catch (error) {
    if (error?.code === "EEXIST") throw new Error("An SPS transfer with this timestamp already exists. Choose a different folder.");
    throw error;
  }

  const included = ["database/owner-host.sql.gz"];
  try {
    const databaseDestination = path.join(bundleRoot, "database", "owner-host.sql.gz");
    await fsApi.mkdir(path.dirname(databaseDestination), { recursive: true });
    await fsApi.copyFile(databaseBackup, databaseDestination);

    await copyDirectoryIfPresent(path.join(root, "storage"), path.join(bundleRoot, "storage"), fsApi, included, "storage");
    await copyDirectoryIfPresent(path.join(root, "instances"), path.join(bundleRoot, "instances"), fsApi, included, "instances");
    await copyDirectoryIfPresent(path.join(root, "projects"), path.join(bundleRoot, "projects"), fsApi, included, "projects");
    await copyDirectoryIfPresent(path.join(root, "memory", "data"), path.join(bundleRoot, "memory", "data"), fsApi, included, "memory/data");
    await copyDirectoryIfPresent(path.join(root, "memory", "journals"), path.join(bundleRoot, "memory", "journals"), fsApi, included, "memory/journals");

    const manifest = {
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: SPS_OWNER_TRANSFER_VERSION,
      createdAt: now.toISOString(),
      databaseBackup: "database/owner-host.sql.gz",
      included,
      entries: await listBundleEntries(bundleRoot, fsApi),
      excluded: [
        "secrets",
        "desktop SPS account credentials",
        "memory sidecar token and configuration",
        "live embedded database files",
        "logs",
      ],
    };
    const manifestPath = path.join(bundleRoot, "sps-transfer.json");
    await fsApi.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await inspectSpsOwnerVaultTransfer({ bundleRoot, fsApi });
    return { bundleRoot, manifestPath, manifest };
  } catch (error) {
    await fsApi.rm(bundleRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function inspectSpsOwnerVaultTransfer({ bundleRoot, fsApi = fs } = {}) {
  if (!bundleRoot) throw new Error("Choose an SPS transfer folder first.");
  const root = path.resolve(bundleRoot);
  const manifestPath = path.join(root, TRANSFER_MANIFEST_NAME);
  let manifest;
  try {
    manifest = JSON.parse(await fsApi.readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("This folder is not a readable SPS transfer bundle.");
  }
  if (manifest?.format !== SPS_OWNER_TRANSFER_FORMAT || manifest?.version !== SPS_OWNER_TRANSFER_VERSION) {
    throw new Error("This SPS transfer bundle uses an unsupported format.");
  }
  await assertSafeTree(root, fsApi);
  if (!Array.isArray(manifest.included) || manifest.included.some((entry) => typeof entry !== "string")) {
    throw new Error("This SPS transfer bundle has an invalid included manifest.");
  }
  const included = manifest.included;
  if (new Set(included).size !== included.length) {
    throw new Error("This SPS transfer bundle lists a duplicate included path.");
  }
  if (included.some((entry) => !INCLUDED_PATH_SET.has(entry))) {
    throw new Error("This SPS transfer bundle lists an unknown included path.");
  }
  let expectedEntries = null;
  if (manifest.entries !== undefined) {
    if (!Array.isArray(manifest.entries) || manifest.entries.some((entry) => typeof entry !== "string")) {
      throw new Error("This SPS transfer bundle has an invalid entries manifest.");
    }
    expectedEntries = manifest.entries.map((entry) => entry.replaceAll("\\", "/"));
    if (new Set(expectedEntries).size !== expectedEntries.length) {
      throw new Error("This SPS transfer bundle lists a duplicate entry path.");
    }
    if (expectedEntries.some((entry) => !entry || path.posix.isAbsolute(entry) || entry.includes(":") || entry.startsWith("../") || entry.includes("/../") || entry.includes("/./") || entry.endsWith("/..") || entry === ".")) {
      throw new Error("This SPS transfer bundle has an invalid entry path.");
    }
    if (expectedEntries.some((entry) => !isAllowedBundleEntry(entry))) {
      throw new Error("This SPS transfer bundle contains an entry outside its allowlist.");
    }
  }
  if (!included.includes("database/owner-host.sql.gz")) {
    throw new Error("This SPS transfer bundle is missing its database backup entry.");
  }
  const databaseBackup = typeof manifest.databaseBackup === "string" ? manifest.databaseBackup : "";
  if (databaseBackup !== "database/owner-host.sql.gz") {
    throw new Error("This SPS transfer bundle has an invalid database backup reference.");
  }
  const backupPath = path.resolve(root, databaseBackup);
  if (!databaseBackup || !isInside(root, backupPath) || !backupPath.toLowerCase().endsWith(".sql.gz")) {
    throw new Error("This SPS transfer bundle has an invalid database backup reference.");
  }
  await assertSafeFile(backupPath, fsApi, "This SPS transfer bundle is missing its database backup.");

  for (const relativePath of INCLUDED_PATHS) {
    const target = path.join(root, relativePath);
    let exists = true;
    try {
      await lstatRequired(target, fsApi, "This SPS transfer bundle is missing an included path.");
    } catch (error) {
      if (error?.message === "This SPS transfer bundle is missing an included path.") exists = false;
      else throw error;
    }
    const listed = included.includes(relativePath);
    if (listed && !exists) throw new Error(`This SPS transfer bundle is missing included path: ${relativePath}`);
    if (!listed && exists) throw new Error(`This SPS transfer bundle omitted existing path: ${relativePath}`);
    if (exists && relativePath !== "database/owner-host.sql.gz") {
      const stat = await fsApi.lstat(target);
      if (!stat.isDirectory()) throw new Error(`This SPS transfer path is not a directory: ${target}`);
    }
  }
  const actualEntries = (await listBundleEntries(root, fsApi)).sort();
  if (actualEntries.some((entry) => !isAllowedBundleEntry(entry))) {
    throw new Error("This SPS transfer bundle contains an entry outside its allowlist.");
  }
  const listedEntries = expectedEntries ? [...expectedEntries].sort() : null;
  if (listedEntries && (actualEntries.length !== listedEntries.length || actualEntries.some((entry, index) => entry !== listedEntries[index]))) {
    throw new Error("This SPS transfer bundle contains a file or directory missing from its manifest.");
  }
  return { bundleRoot: root, manifest, databaseBackup: backupPath };
}

/**
 * Stages a validated transfer bundle into an empty Owner Vault. Database
 * restoration is deliberately separate: the caller must initialize the
 * embedded database and invoke Core's restore primitive before promoting the
 * staged vault to the live Owner Vault.
 */
export async function importSpsOwnerVaultTransfer({ bundleRoot, vaultRoot, fsApi = fs } = {}) {
  const inspected = await inspectSpsOwnerVaultTransfer({ bundleRoot, fsApi });
  await assertSpsOwnerVaultRestoreTarget({ vaultRoot, fsApi });

  const root = path.resolve(vaultRoot);
  await fsApi.mkdir(root, { recursive: true });
  const databaseDestination = path.join(root, "backups", "owner-host.sql.gz");
  await fsApi.mkdir(path.dirname(databaseDestination), { recursive: true });
  await fsApi.copyFile(inspected.databaseBackup, databaseDestination);

  for (const relativePath of inspected.manifest.included.filter(
    (entry) => entry !== "database/owner-host.sql.gz",
  )) {
    const source = path.join(inspected.bundleRoot, relativePath);
    const destination = path.join(root, relativePath);
    await assertWithinRealRoot(inspected.bundleRoot, source, fsApi, "SPS transfer source escapes the bundle root.");
    await fsApi.cp(source, destination, { recursive: true, errorOnExist: true });
  }

  return {
    vaultRoot: root,
    backupFile: databaseDestination,
    manifest: inspected.manifest,
  };
}

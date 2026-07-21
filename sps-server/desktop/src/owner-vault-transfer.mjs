import fs from "node:fs/promises";
import path from "node:path";

export const SPS_OWNER_TRANSFER_FORMAT = "sps-owner-vault-transfer";
export const SPS_OWNER_TRANSFER_VERSION = 1;

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function transferTimestamp(now) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function createSpsOwnerTransferName(now = new Date()) {
  return `SPS-transfer-${transferTimestamp(now)}`;
}

async function copyDirectoryIfPresent(source, destination, fsApi, included, label) {
  try {
    const stat = await fsApi.stat(source);
    if (!stat.isDirectory()) return;
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  await fsApi.cp(source, destination, { recursive: true, errorOnExist: true });
  included.push(label);
}

async function requireBackupFile(vaultRoot, backupFile, fsApi) {
  const backupRoot = path.join(vaultRoot, "backups");
  const resolvedBackup = path.resolve(backupFile);
  if (!isInside(backupRoot, resolvedBackup) || !resolvedBackup.toLowerCase().endsWith(".sql.gz")) {
    throw new Error("SPS transfer requires a database backup created inside this Owner Vault.");
  }
  const stat = await fsApi.stat(resolvedBackup);
  if (!stat.isFile()) throw new Error("The SPS database backup file is not readable.");
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
      excluded: [
        "secrets",
        "desktop Google account credentials",
        "memory sidecar token and configuration",
        "live embedded database files",
        "logs",
      ],
    };
    const manifestPath = path.join(bundleRoot, "sps-transfer.json");
    await fsApi.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    return { bundleRoot, manifestPath, manifest };
  } catch (error) {
    await fsApi.rm(bundleRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

export async function inspectSpsOwnerVaultTransfer({ bundleRoot, fsApi = fs } = {}) {
  if (!bundleRoot) throw new Error("Choose an SPS transfer folder first.");
  const root = path.resolve(bundleRoot);
  const manifestPath = path.join(root, "sps-transfer.json");
  let manifest;
  try {
    manifest = JSON.parse(await fsApi.readFile(manifestPath, "utf8"));
  } catch {
    throw new Error("This folder is not a readable SPS transfer bundle.");
  }
  if (manifest?.format !== SPS_OWNER_TRANSFER_FORMAT || manifest?.version !== SPS_OWNER_TRANSFER_VERSION) {
    throw new Error("This SPS transfer bundle uses an unsupported format.");
  }
  const databaseBackup = typeof manifest.databaseBackup === "string" ? manifest.databaseBackup : "";
  const backupPath = path.resolve(root, databaseBackup);
  if (!databaseBackup || !isInside(root, backupPath) || !backupPath.toLowerCase().endsWith(".sql.gz")) {
    throw new Error("This SPS transfer bundle has an invalid database backup reference.");
  }
  const backupStat = await fsApi.stat(backupPath);
  if (!backupStat.isFile()) throw new Error("This SPS transfer bundle is missing its database backup.");
  return { bundleRoot: root, manifest, databaseBackup: backupPath };
}

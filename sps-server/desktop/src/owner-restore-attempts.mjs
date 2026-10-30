import { promises as fs } from "node:fs";
import path from "node:path";
import { readSpsOwnerVaultRestoreReceipt } from "./owner-vault-restore-receipt.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_ATTEMPTS = 128;

export function normalizeSpsOwnerRestoreAttempts(value = []) {
  if (!Array.isArray(value) || value.length > MAX_ATTEMPTS) throw new Error("SPS preserved restore records require recovery.");
  const seen = new Set();
  return value.map(entry => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || Object.keys(entry).some(key => !["id", "ownerSubject", "createdAt"].includes(key))
      || typeof entry.id !== "string" || !UUID.test(entry.id) || seen.has(entry.id)
      || typeof entry.ownerSubject !== "string" || !entry.ownerSubject.trim()
      || entry.ownerSubject !== entry.ownerSubject.trim() || entry.ownerSubject.length > 512
      || typeof entry.createdAt !== "string" || entry.createdAt.length > 64 || !Number.isFinite(Date.parse(entry.createdAt))) {
      throw new Error("SPS preserved restore records are malformed. Existing data was not changed.");
    }
    seen.add(entry.id);
    return { id: entry.id, ownerSubject: entry.ownerSubject, createdAt: entry.createdAt };
  });
}

export function ownerRestoreAttemptsForAccount(value, subject) {
  return normalizeSpsOwnerRestoreAttempts(value).filter(entry => entry.ownerSubject === subject)
    .map(({ id, createdAt }) => ({ id, createdAt }));
}

export async function resolveSpsOwnerRestoreAttemptDirectory({ userDataPath, id, ownerSubject, promotedVaultRoot }) {
  if (typeof id !== "string" || !UUID.test(id)) throw new Error("Invalid SPS restore record.");
  const root = path.resolve(userDataPath);
  const directory = path.join(root, `owner-vault.restore-${id}`);
  let directoryIdentity;
  let rootIdentity;
  let current = directory;
  try {
    while (true) {
      const info = await fs.lstat(current, { bigint: true });
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("SPS restore recovery refuses a linked or replaced directory.");
      if (current === directory) directoryIdentity = info;
      if (current === root) rootIdentity = info;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      if (promotedVaultRoot) {
        const receipt = await readSpsOwnerVaultRestoreReceipt({ vaultRoot: promotedVaultRoot });
        if (receipt?.restoreId === id && receipt.ownerSubject === ownerSubject) return fs.realpath(promotedVaultRoot);
      }
      throw new Error("This restore folder is no longer in staging. Its data may already have been restored; no files were changed.");
    }
    throw error;
  }
  const canonicalRoot = await fs.realpath(root);
  const canonical = await fs.realpath(directory);
  const same = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
  const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs;
  const currentDirectory = await fs.lstat(directory, { bigint: true });
  const currentRoot = await fs.lstat(root, { bigint: true });
  if (!same(canonical, path.join(canonicalRoot, `owner-vault.restore-${id}`))
    || !sameIdentity(directoryIdentity, currentDirectory) || !sameIdentity(rootIdentity, currentRoot)
    || currentDirectory.isSymbolicLink() || currentRoot.isSymbolicLink()) throw new Error("SPS restore recovery path changed; no files were changed.");
  return canonical;
}

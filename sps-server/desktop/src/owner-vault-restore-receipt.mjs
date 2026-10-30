import { promises as fs } from "node:fs";
import path from "node:path";

const NAME = "sps-desktop-restore.json";
const MAX_BYTES = 4096;
const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs;

function validate(value) {
  if (!value || value.format !== "sps-desktop-owner-restore" || value.version !== 1
    || typeof value.ownerSubject !== "string" || !value.ownerSubject.trim()
    || value.ownerSubject !== value.ownerSubject.trim() || value.ownerSubject.length > 512
    || typeof value.restoreId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.restoreId)
    || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new Error("SPS restored Host ownership metadata is invalid; data was preserved.");
  }
  return { format: value.format, version: 1, ownerSubject: value.ownerSubject, restoreId: value.restoreId, createdAt: value.createdAt };
}

async function plainRoot(root) {
  let current = root;
  while (true) {
    const info = await fs.lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("SPS restore ownership refuses a linked Vault path.");
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return fs.lstat(root, { bigint: true });
}

function regular(info) {
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1n) {
    throw new Error("SPS restore ownership requires a private regular metadata file.");
  }
}

// This is Desktop-local ownership metadata, not a signature, OS sandbox or
// ownership inferred from a transfer bundle. The transfer allowlist excludes it.
export async function writeSpsOwnerVaultRestoreReceipt({ vaultRoot, ownerSubject, restoreId, beforeCommit = () => {} }) {
  if (typeof beforeCommit !== "function") throw new TypeError("Invalid SPS restore ownership guard.");
  const guard = () => {
    const result = beforeCommit();
    if (result !== undefined) {
      if (result instanceof Promise) void result.catch(() => {});
      throw new TypeError("SPS restore ownership guards must be synchronous.");
    }
  };
  const value = validate({ format: "sps-desktop-owner-restore", version: 1, ownerSubject, restoreId, createdAt: new Date().toISOString() });
  const root = path.resolve(vaultRoot);
  const rootIdentity = await plainRoot(root);
  guard();
  const file = path.join(root, NAME);
  const handle = await fs.open(file, "wx", 0o600);
  try {
    regular(await handle.stat({ bigint: true }));
    await handle.writeFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
    guard();
    if (!sameIdentity(rootIdentity, await plainRoot(root))) throw new Error("The SPS restore Vault changed; data was preserved.");
    const owned = await handle.stat({ bigint: true });
    const leaf = await fs.lstat(file, { bigint: true });
    regular(leaf);
    if (!sameIdentity(owned, leaf)) throw new Error("SPS restore ownership metadata changed; data was preserved.");
  } finally { await handle.close(); }
  // A partial write is deliberately preserved in unpromoted staging on error.
  return value;
}

export async function readSpsOwnerVaultRestoreReceipt({ vaultRoot }) {
  const root = path.resolve(vaultRoot);
  const file = path.join(root, NAME);
  let leaf;
  try { leaf = await fs.lstat(file, { bigint: true }); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  regular(leaf);
  if (leaf.size > BigInt(MAX_BYTES)) throw new Error("SPS restore ownership metadata is too large; data was preserved.");
  const rootIdentity = await plainRoot(root);
  const handle = await fs.open(file, "r");
  try {
    const opened = await handle.stat({ bigint: true });
    regular(opened);
    if (!sameIdentity(opened, leaf)) throw new Error("SPS restore ownership metadata changed; data was preserved.");
    const buffer = Buffer.alloc(MAX_BYTES + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
      if (!bytesRead) break;
      count += bytesRead;
    }
    if (count > MAX_BYTES) throw new Error("SPS restore ownership metadata is too large; data was preserved.");
    const current = await fs.lstat(file, { bigint: true });
    regular(current);
    if (!sameIdentity(opened, current) || !sameIdentity(rootIdentity, await plainRoot(root))) {
      throw new Error("The SPS restore Vault changed; data was preserved.");
    }
    return validate(JSON.parse(buffer.subarray(0, count).toString("utf8")));
  } finally { await handle.close(); }
}

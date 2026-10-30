import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SPS_OWNER_TRANSFER_FORMAT,
  assertSpsOwnerVaultRestoreTarget,
  createSpsOwnerTransferName,
  exportSpsOwnerVaultTransfer,
  importSpsOwnerVaultTransfer,
  inspectSpsOwnerVaultRestoreTarget,
  inspectSpsOwnerVaultTransfer,
} from "../src/owner-vault-transfer.mjs";

test("allows Host restore only into an absent or bootstrap-only vault", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-restore-"));
  try {
    const absent = path.join(root, "absent");
    assert.equal((await inspectSpsOwnerVaultRestoreTarget({ vaultRoot: absent })).fresh, true);
    await assertSpsOwnerVaultRestoreTarget({ vaultRoot: absent });

    const bootstrap = path.join(root, "bootstrap");
    await fs.mkdir(path.join(bootstrap, "database"), { recursive: true });
    await fs.mkdir(path.join(bootstrap, "storage"), { recursive: true });
    await fs.writeFile(path.join(bootstrap, "config.json"), "{}\n");
    assert.equal((await inspectSpsOwnerVaultRestoreTarget({ vaultRoot: bootstrap })).fresh, true);
    await assertSpsOwnerVaultRestoreTarget({ vaultRoot: bootstrap });

    await fs.writeFile(path.join(bootstrap, "storage", "attachment.txt"), "existing");
    const occupied = await inspectSpsOwnerVaultRestoreTarget({ vaultRoot: bootstrap });
    assert.equal(occupied.fresh, false);
    await assert.rejects(
      assertSpsOwnerVaultRestoreTarget({ vaultRoot: bootstrap }),
      /only into a fresh Host Vault/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("exports a portable Owner Vault transfer without secrets or live database files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const vault = path.join(root, "owner-vault");
    const exports = path.join(root, "exports");
    const backup = path.join(vault, "backups", "sps-test.sql.gz");
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.mkdir(path.join(vault, "storage"), { recursive: true });
    await fs.mkdir(path.join(vault, "instances"), { recursive: true });
    await fs.mkdir(path.join(vault, "memory", "data"), { recursive: true });
    await fs.mkdir(path.join(vault, "secrets"), { recursive: true });
    await fs.mkdir(path.join(vault, "database"), { recursive: true });
    await fs.mkdir(exports);
    await fs.writeFile(backup, "database");
    const restoreReceipt = path.join(vault, "sps-desktop-restore.json");
    const receiptBytes = `${JSON.stringify({
      format: "sps-desktop-owner-restore",
      version: 1,
      ownerSubject: "owner-a",
      restoreId: "00000000-0000-4000-8000-000000000001",
      createdAt: "2026-07-21T03:04:05.000Z",
    })}\n`;
    await fs.writeFile(restoreReceipt, receiptBytes);
    await fs.writeFile(path.join(vault, "storage", "attachment.txt"), "asset");
    await fs.writeFile(path.join(vault, "instances", "room.md"), "room");
    await fs.writeFile(path.join(vault, "memory", "data", "memory.json"), "memory");
    await fs.writeFile(path.join(vault, "secrets", "master.key"), "secret");
    await fs.writeFile(path.join(vault, "database", "live.data"), "live");

    const now = new Date("2026-07-21T03:04:05.000Z");
    const exported = await exportSpsOwnerVaultTransfer({ vaultRoot: vault, backupFile: backup, destinationRoot: exports, now });
    const inspected = await inspectSpsOwnerVaultTransfer({ bundleRoot: exported.bundleRoot });

    assert.equal(path.basename(exported.bundleRoot), createSpsOwnerTransferName(now));
    assert.equal(inspected.manifest.format, SPS_OWNER_TRANSFER_FORMAT);
    assert.ok(inspected.manifest.entries.includes("storage/attachment.txt"));
    assert.equal(await fs.readFile(restoreReceipt, "utf8"), receiptBytes);
    await assert.rejects(fs.access(path.join(exported.bundleRoot, "sps-desktop-restore.json")));
    assert.equal(await fs.readFile(path.join(exported.bundleRoot, "storage", "attachment.txt"), "utf8"), "asset");
    assert.equal(await fs.readFile(path.join(exported.bundleRoot, "instances", "room.md"), "utf8"), "room");
    assert.equal(await fs.readFile(path.join(exported.bundleRoot, "memory", "data", "memory.json"), "utf8"), "memory");
    await assert.rejects(fs.access(path.join(exported.bundleRoot, "secrets", "master.key")));
    await assert.rejects(fs.access(path.join(exported.bundleRoot, "database", "live.data")));

    const imported = await importSpsOwnerVaultTransfer({
      bundleRoot: exported.bundleRoot,
      vaultRoot: path.join(root, "restored-vault"),
    });
    assert.equal(await fs.readFile(restoreReceipt, "utf8"), receiptBytes);
    await assert.rejects(fs.access(path.join(imported.vaultRoot, "sps-desktop-restore.json")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("imports only into an empty staging vault and keeps excluded data out", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-import-"));
  try {
    const vault = path.join(root, "owner-vault");
    const exports = path.join(root, "exports");
    const target = path.join(root, "staging-vault");
    const backup = path.join(vault, "backups", "sps-test.sql.gz");
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.mkdir(path.join(vault, "storage"), { recursive: true });
    await fs.mkdir(exports);
    await fs.writeFile(backup, "database");
    await fs.writeFile(path.join(vault, "storage", "attachment.txt"), "asset");

    const exported = await exportSpsOwnerVaultTransfer({
      vaultRoot: vault,
      backupFile: backup,
      destinationRoot: exports,
    });
    const imported = await importSpsOwnerVaultTransfer({ bundleRoot: exported.bundleRoot, vaultRoot: target });

    assert.equal(await fs.readFile(imported.backupFile, "utf8"), "database");
    assert.equal(await fs.readFile(path.join(target, "storage", "attachment.txt"), "utf8"), "asset");
    await assert.rejects(fs.access(path.join(target, "secrets")));
    await assert.rejects(
      importSpsOwnerVaultTransfer({ bundleRoot: exported.bundleRoot, vaultRoot: target }),
      /only into a fresh Host Vault/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects a database backup from outside the Owner Vault", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const vault = path.join(root, "owner-vault");
    const backup = path.join(root, "outside.sql.gz");
    const exports = path.join(root, "exports");
    await fs.mkdir(vault);
    await fs.mkdir(exports);
    await fs.writeFile(backup, "database");
    await assert.rejects(
      exportSpsOwnerVaultTransfer({ vaultRoot: vault, backupFile: backup, destinationRoot: exports }),
      /created inside this Owner Vault/,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects a symlinked Owner Vault directory before it can be copied", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const vault = path.join(root, "owner-vault");
    const outside = path.join(root, "outside");
    const exports = path.join(root, "exports");
    const backup = path.join(vault, "backups", "sps-test.sql.gz");
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.mkdir(outside);
    await fs.mkdir(exports);
    await fs.writeFile(backup, "database");
    await fs.symlink(outside, path.join(vault, "storage"), "junction");
    await assert.rejects(
      exportSpsOwnerVaultTransfer({ vaultRoot: vault, backupFile: backup, destinationRoot: exports }),
      /symbolic links or reparse points/,
    );
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") return;
    throw error;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ignores links in excluded Vault directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const vault = path.join(root, "owner-vault");
    const outside = path.join(root, "outside");
    const exports = path.join(root, "exports");
    const backup = path.join(vault, "backups", "sps-test.sql.gz");
    await fs.mkdir(path.dirname(backup), { recursive: true });
    await fs.mkdir(outside);
    await fs.mkdir(exports);
    await fs.writeFile(backup, "database");
    await fs.mkdir(path.join(vault, "logs"));
    await fs.symlink(outside, path.join(vault, "logs", "external"), "junction");
    const exported = await exportSpsOwnerVaultTransfer({ vaultRoot: vault, backupFile: backup, destinationRoot: exports });
    assert.equal(exported.manifest.included.includes("logs"), false);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") return;
    throw error;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects a symlink inside a transfer bundle during inspection", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "database");
    await fs.writeFile(path.join(bundle, "sps-transfer.json"), JSON.stringify({
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: 1,
      databaseBackup: "database/owner-host.sql.gz",
      included: ["database/owner-host.sql.gz", "storage"],
      entries: ["database", "database/owner-host.sql.gz", "storage"],
    }));
    await fs.symlink(root, path.join(bundle, "storage"), "junction");
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /symbolic links or reparse points/);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") return;
    throw error;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects unknown, duplicate, and missing included manifest entries", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "database");
    const manifestPath = path.join(bundle, "sps-transfer.json");
    const base = {
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: 1,
      databaseBackup: "database/owner-host.sql.gz",
      entries: ["database", "database/owner-host.sql.gz"],
    };
    await fs.writeFile(manifestPath, JSON.stringify({ ...base, included: ["database/owner-host.sql.gz", "unknown"] }));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /unknown included path/);
    await fs.writeFile(manifestPath, JSON.stringify({ ...base, included: ["database/owner-host.sql.gz", 42] }));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /invalid included manifest/);
    await fs.writeFile(manifestPath, JSON.stringify({ ...base, included: ["database/owner-host.sql.gz", "database/owner-host.sql.gz"] }));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /duplicate included path/);
    await fs.writeFile(manifestPath, JSON.stringify({ ...base, included: ["storage"] }));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /missing its database backup entry/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects a transfer manifest that escapes the bundle root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "database");
    await fs.writeFile(path.join(bundle, "sps-transfer.json"), JSON.stringify({
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: 1,
      databaseBackup: "../outside.sql.gz",
      included: ["database/owner-host.sql.gz"],
      entries: ["database", "database/owner-host.sql.gz"],
    }));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /invalid database backup reference/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects an included directory that is missing from the bundle", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "database");
    await fs.writeFile(path.join(bundle, "sps-transfer.json"), JSON.stringify({
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: 1,
      databaseBackup: "database/owner-host.sql.gz",
      included: ["database/owner-host.sql.gz", "storage"],
      entries: ["database", "database/owner-host.sql.gz", "storage"],
    }));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /missing included path: storage/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects extra files or directories not listed in the bundle manifest", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.mkdir(path.join(bundle, "storage"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "database");
    await fs.writeFile(path.join(bundle, "storage", "attachment.txt"), "asset");
    await fs.writeFile(path.join(bundle, "sps-transfer.json"), JSON.stringify({
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: 1,
      databaseBackup: "database/owner-host.sql.gz",
      included: ["database/owner-host.sql.gz", "storage"],
      entries: ["database", "database/owner-host.sql.gz", "storage", "storage/attachment.txt"],
    }));
    await fs.writeFile(path.join(bundle, "unexpected.txt"), "unexpected");
    await fs.mkdir(path.join(bundle, "unexpected-directory"));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /outside its allowlist/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("keeps legacy v1 bundles readable while enforcing the path allowlist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.mkdir(path.join(bundle, "storage"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "database");
    await fs.writeFile(path.join(bundle, "storage", "attachment.txt"), "asset");
    await fs.writeFile(path.join(bundle, "sps-transfer.json"), JSON.stringify({
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: 1,
      databaseBackup: "database/owner-host.sql.gz",
      included: ["database/owner-host.sql.gz", "storage"],
    }));

    const inspected = await inspectSpsOwnerVaultTransfer({ bundleRoot: bundle });
    assert.equal(inspected.manifest.entries, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects entries listed outside the allowed transfer directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-transfer-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "database");
    await fs.writeFile(path.join(bundle, "unexpected.txt"), "unexpected");
    await fs.writeFile(path.join(bundle, "sps-transfer.json"), JSON.stringify({
      format: SPS_OWNER_TRANSFER_FORMAT,
      version: 1,
      databaseBackup: "database/owner-host.sql.gz",
      included: ["database/owner-host.sql.gz"],
      entries: ["database", "database/owner-host.sql.gz", "unexpected.txt"],
    }));
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /outside its allowlist/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

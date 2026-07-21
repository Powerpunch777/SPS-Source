import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  SPS_OWNER_TRANSFER_FORMAT,
  createSpsOwnerTransferName,
  exportSpsOwnerVaultTransfer,
  inspectSpsOwnerVaultTransfer,
} from "../src/owner-vault-transfer.mjs";

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
    assert.equal(await fs.readFile(path.join(exported.bundleRoot, "storage", "attachment.txt"), "utf8"), "asset");
    assert.equal(await fs.readFile(path.join(exported.bundleRoot, "instances", "room.md"), "utf8"), "room");
    assert.equal(await fs.readFile(path.join(exported.bundleRoot, "memory", "data", "memory.json"), "utf8"), "memory");
    await assert.rejects(fs.access(path.join(exported.bundleRoot, "secrets", "master.key")));
    await assert.rejects(fs.access(path.join(exported.bundleRoot, "database", "live.data")));
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

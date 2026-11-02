import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { calculateStaticCapabilitiesDigest } from "@sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs";
import {
  exportSpsOwnerVaultTransfer,
  importSpsOwnerVaultTransfer,
  inspectSpsOwnerVaultTransfer,
} from "../src/owner-vault-transfer.mjs";
import { rebaseRestoredRegistryStages } from "../src/owner-vault-registry-transfer.mjs";

function makeStage(packageRoot, overrides = {}) {
  const pluginId = "com.example.inert";
  const version = "1.2.3";
  const artifactSha256 = "a".repeat(64);
  const staticManifest = {
    schemaVersion: 1,
    plugin: { id: pluginId, version, apiVersion: "1" },
    runtime: { manifestEntry: "worker.mjs", manifestSha256: "d".repeat(64) },
    capabilities: [],
    permissionsDigest: calculateStaticCapabilitiesDigest([]),
  };
  return {
    stageId: createHash("sha256").update(`${pluginId}\n${version}\n${artifactSha256}`).digest("hex").slice(0, 32),
    pluginId,
    version,
    packageName: "@example/inert-plugin",
    packageRoot,
    artifactSha256,
    staticManifest,
    source: { registryId: "official-registry", kind: "official", releaseLocator: "releases/1" },
    status: "registered",
    review: null,
    stagedAt: "2026-10-29T12:34:56.000Z",
    ...overrides,
  };
}

async function createVault(root, { packageRoot = "owned-package", withIndex = true } = {}) {
  const vault = path.join(root, "source-vault");
  const backup = path.join(vault, "backups", "host.sql.gz");
  const packages = path.join(vault, "registry-staging", "packages");
  const ownedPackage = path.join(packages, packageRoot);
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.mkdir(ownedPackage, { recursive: true });
  await fs.mkdir(path.join(root, "exports"), { recursive: true });
  await fs.writeFile(backup, "database-backup");
  await fs.writeFile(path.join(ownedPackage, "package.json"), JSON.stringify({ name: "@example/inert-plugin", version: "1.2.3" }));
  await fs.writeFile(path.join(ownedPackage, "sps-plugin.json"), JSON.stringify(makeStage(ownedPackage).staticManifest));
  await fs.writeFile(path.join(ownedPackage, "worker.mjs"), "export default {};\n");
  const marker = path.join(ownedPackage, "executed.marker");
  await fs.writeFile(path.join(ownedPackage, "never-run.mjs"), `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "executed");\n`);
  if (withIndex) {
    const index = [makeStage(ownedPackage, { review: { requestedAt: "2026-10-29T12:00:00.000Z" } })];
    await fs.writeFile(path.join(vault, "registry-staging", "registry-stages.json"), `${JSON.stringify(index)}\n`);
  }
  return { vault, backup, ownedPackage, marker, exports: path.join(root, "exports") };
}

test("v2 roundtrip preserves SPS Registry bytes inertly, resets stage review, and rebases without writing destination", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-"));
  try {
    const source = await createVault(root);
    const exported = await exportSpsOwnerVaultTransfer({ vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports });
    assert.equal(exported.manifest.version, 2);
    assert.ok(exported.manifest.registryInventory.some((entry) => entry.path === "registry-staging/registry-stages.json"));
    const bundleIndex = JSON.parse(await fs.readFile(path.join(exported.bundleRoot, "registry-staging", "registry-stages.json"), "utf8"));
    const portableStage = bundleIndex[0];
    assert.equal(portableStage.packageRoot, "packages/owned-package");
    assert.equal(portableStage.status, "staged");
    assert.equal(portableStage.review, null);
    assert.deepEqual(portableStage.staticManifest, makeStage(source.ownedPackage).staticManifest);
    assert.deepEqual(portableStage.source, {
      registryId: "sps.owner.transfer",
      kind: "local",
      releaseLocator: `restored-transfer/${portableStage.stageId}`,
    });
    assert.deepEqual(Object.keys(portableStage).sort(), [
      "artifactSha256", "packageName", "packageRoot", "pluginId", "review", "source",
      "stageId", "stagedAt", "staticManifest", "status", "version",
    ].sort());

    const stagedVault = path.join(root, "staged-vault");
    await importSpsOwnerVaultTransfer({ bundleRoot: exported.bundleRoot, vaultRoot: stagedVault });
    const destination = path.join(root, "final-host-vault");
    await rebaseRestoredRegistryStages({ vaultRoot: stagedVault, destinationVaultRoot: destination });
    const restoredIndex = JSON.parse(await fs.readFile(path.join(stagedVault, "registry-staging", "registry-stages.json"), "utf8"));
    assert.equal(restoredIndex[0].packageRoot, path.join(destination, "registry-staging", "packages", "owned-package"));
    assert.equal(restoredIndex[0].status, "staged");
    assert.equal(await fs.readFile(path.join(stagedVault, "registry-staging", "packages", "owned-package", "package.json"), "utf8"), await fs.readFile(path.join(source.ownedPackage, "package.json"), "utf8"));
    await assert.rejects(fs.access(destination));
    await assert.rejects(fs.access(source.marker));
    await assert.rejects(fs.access(path.join(stagedVault, "registry-staging", "packages", "owned-package", "executed.marker")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("accepts old v1 bundles unchanged and rejects Registry extras in v1", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-v1-"));
  try {
    const bundle = path.join(root, "bundle");
    await fs.mkdir(path.join(bundle, "database"), { recursive: true });
    await fs.writeFile(path.join(bundle, "database", "owner-host.sql.gz"), "db");
    await fs.writeFile(path.join(bundle, "sps-transfer.json"), JSON.stringify({
      format: "sps-owner-vault-transfer",
      version: 1,
      databaseBackup: "database/owner-host.sql.gz",
      included: ["database/owner-host.sql.gz"],
    }));
    assert.equal((await inspectSpsOwnerVaultTransfer({ bundleRoot: bundle })).manifest.version, 1);
    await fs.mkdir(path.join(bundle, "registry-staging", "packages"), { recursive: true });
    await fs.writeFile(path.join(bundle, "registry-staging", "packages", "payload.bin"), "x");
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: bundle }), /outside its allowlist/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects modified Registry bytes after export", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-tamper-"));
  try {
    const source = await createVault(root);
    const exported = await exportSpsOwnerVaultTransfer({ vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports });
    await fs.appendFile(path.join(exported.bundleRoot, "registry-staging", "packages", "owned-package", "package.json"), "tampered");
    await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: exported.bundleRoot }), /checksum does not match/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects non-portable packageRoot aliases even when the bundle inventory is updated", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-portable-path-"));
  try {
    const source = await createVault(root);
    const exported = await exportSpsOwnerVaultTransfer({ vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports });
    const indexPath = path.join(exported.bundleRoot, "registry-staging", "registry-stages.json");
    const manifestPath = path.join(exported.bundleRoot, "sps-transfer.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const invalidPaths = ["packages", "packages/../owned-package", "packages/C:/external", "packages/\0name", "C:/external"];
    for (const invalidPath of invalidPaths) {
      const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
      index[0].packageRoot = invalidPath;
      const bytes = `${JSON.stringify(index, null, 2)}\n`;
      await fs.writeFile(indexPath, bytes);
      const indexInventory = manifest.registryInventory.find((entry) => entry.path === "registry-staging/registry-stages.json");
      indexInventory.sizeBytes = Buffer.byteLength(bytes);
      indexInventory.sha256 = createHash("sha256").update(bytes).digest("hex");
      await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      await assert.rejects(inspectSpsOwnerVaultTransfer({ bundleRoot: exported.bundleRoot }), /safe portable path/);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects non-Core stage records and invalid static manifests", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-stage-shape-"));
  try {
    const source = await createVault(root, { withIndex: false });
    const indexPath = path.join(source.vault, "registry-staging", "registry-stages.json");
    const valid = makeStage(source.ownedPackage);
    for (const invalidStage of [
      { ...valid, extraTrustField: true },
      { ...valid, stageId: "0".repeat(32) },
      { ...valid, packageName: "x".repeat(215) },
      { ...valid, version: "2.0.0" },
    ]) {
      await fs.writeFile(indexPath, JSON.stringify([invalidStage]));
      await assert.rejects(exportSpsOwnerVaultTransfer({
        vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports,
      }), /invalid stage record/);
    }

    const invalidManifestStage = makeStage(source.ownedPackage, {
      staticManifest: { ...valid.staticManifest, permissionsDigest: "f".repeat(64) },
    });
    await fs.writeFile(indexPath, JSON.stringify([invalidManifestStage]));
    await assert.rejects(exportSpsOwnerVaultTransfer({
      vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports,
    }), /static manifest is invalid/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects malformed and traversal Registry package roots and case aliases", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-path-"));
  try {
    for (const packageRoot of [path.join(root, "outside-package"), path.join("C:\\not-a-real-root", "package")]) {
      const source = await createVault(root, { withIndex: false });
      const staging = path.join(source.vault, "registry-staging");
      await fs.writeFile(path.join(staging, "registry-stages.json"), JSON.stringify([makeStage(packageRoot)]));
      await assert.rejects(exportSpsOwnerVaultTransfer({
        vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports,
      }), /outside the current Owner Vault package directory/);
      await fs.rm(root, { recursive: true, force: true });
      await fs.mkdir(root, { recursive: true });
    }

    const aliasSource = await createVault(root, { packageRoot: "Owned-Package", withIndex: false });
    await fs.writeFile(path.join(aliasSource.vault, "registry-staging", "registry-stages.json"), JSON.stringify([
      makeStage(path.join(aliasSource.vault, "registry-staging", "packages", "owned-package")),
    ]));
    await assert.rejects(exportSpsOwnerVaultTransfer({
      vaultRoot: aliasSource.vault, backupFile: aliasSource.backup, destinationRoot: aliasSource.exports,
    }), /path alias/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("preserves package bytes without inventing stages when the old staging index is absent", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-no-index-"));
  try {
    const source = await createVault(root, { withIndex: false });
    const exported = await exportSpsOwnerVaultTransfer({ vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports });
    assert.equal(exported.manifest.included.includes("registry-staging/packages"), true);
    assert.equal(exported.manifest.included.includes("registry-staging/registry-stages.json"), false);
    assert.equal(exported.manifest.registryInventory.some((entry) => entry.path.endsWith("registry-stages.json")), false);
    const stagedVault = path.join(root, "staged-vault");
    await importSpsOwnerVaultTransfer({ bundleRoot: exported.bundleRoot, vaultRoot: stagedVault });
    const destination = path.join(root, "final-vault");
    assert.deepEqual(await rebaseRestoredRegistryStages({ vaultRoot: stagedVault, destinationVaultRoot: destination }), {
      indexPath: path.join(stagedVault, "registry-staging", "registry-stages.json"),
      stages: 0,
    });
    await assert.rejects(fs.access(path.join(stagedVault, "registry-staging", "registry-stages.json")));
    assert.equal(await fs.readFile(path.join(stagedVault, "registry-staging", "packages", "owned-package", "package.json"), "utf8"),
      await fs.readFile(path.join(source.ownedPackage, "package.json"), "utf8"));
    await assert.rejects(fs.access(destination));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects links in registry package trees", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-link-"));
  try {
    const source = await createVault(root);
    const outside = path.join(root, "outside");
    await fs.mkdir(outside);
    await fs.symlink(outside, path.join(source.ownedPackage, "linked"), "junction");
    await assert.rejects(exportSpsOwnerVaultTransfer({
      vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports,
    }), /symbolic links or reparse points/);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") return;
    throw error;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects registry-staging ancestor junctions during export and rebase", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-registry-transfer-ancestor-link-"));
  try {
    const source = await createVault(root, { withIndex: false });
    const externalStaging = path.join(root, "external-staging");
    await fs.mkdir(path.join(externalStaging, "packages", "owned-package"), { recursive: true });
    await fs.writeFile(path.join(externalStaging, "packages", "owned-package", "payload.bin"), "external");
    await fs.rm(path.join(source.vault, "registry-staging"), { recursive: true, force: true });
    await fs.symlink(externalStaging, path.join(source.vault, "registry-staging"), "junction");
    await assert.rejects(exportSpsOwnerVaultTransfer({
      vaultRoot: source.vault, backupFile: source.backup, destinationRoot: source.exports,
    }), /symbolic links or reparse points/);

    const stagedVault = path.join(root, "staged-vault");
    await fs.mkdir(stagedVault);
    await fs.symlink(externalStaging, path.join(stagedVault, "registry-staging"), "junction");
    await assert.rejects(rebaseRestoredRegistryStages({
      vaultRoot: stagedVault, destinationVaultRoot: path.join(root, "final-vault"),
    }), /symbolic links or reparse points/);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EACCES") return;
    throw error;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

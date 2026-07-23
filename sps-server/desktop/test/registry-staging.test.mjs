import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  describeSpsPluginArchive,
  ownerVaultRegistryLayout,
  stageSpsPluginArchive,
} from "../src/registry-staging.mjs";

test("places Registry extraction inside the Owner Vault and registers it only after extraction", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-vault-"));
  try {
    const archivePath = path.join(vaultRoot, "weather.spsplugin");
    await writeFile(archivePath, "test-release", "utf8");
    const calls = [];
    const result = await stageSpsPluginArchive({
      vaultRoot,
      archivePath,
      source: { registryId: "io.sps.local", kind: "local", releaseLocator: "weather.spsplugin" },
      randomId: () => "fixed-stage",
      extractArchive: async ({ destinationRoot }) => ({
        extracted: true,
        destinationRoot,
        inspection: { valid: true },
      }),
      registerStage: async (input) => {
        calls.push(input);
        return { stageId: "stage-1", status: "staged" };
      },
    });

    assert.equal(result.staged, true);
    assert.equal(result.stage.stageId, "stage-1");
    assert.equal(calls.length, 1);
    assert.match(calls[0].packageRoot, /registry-staging[\\/]packages[\\/]/);
    assert.equal(calls[0].artifactSha256.length, 64);
    assert.deepEqual(ownerVaultRegistryLayout(vaultRoot).root, path.join(vaultRoot, "registry-staging"));
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("does not register an archive when safe extraction rejects it", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-vault-"));
  try {
    const archivePath = path.join(vaultRoot, "invalid.spsplugin");
    await writeFile(archivePath, "invalid", "utf8");
    let registered = false;
    const result = await stageSpsPluginArchive({
      vaultRoot,
      archivePath,
      source: { registryId: "io.sps.local", kind: "local", releaseLocator: "invalid.spsplugin" },
      extractArchive: async () => ({ extracted: false, errors: ["not a ZIP"], inspection: null }),
      registerStage: async () => { registered = true; },
    });

    assert.equal(result.staged, false);
    assert.equal(registered, false);
    assert.deepEqual(result.errors, ["not a ZIP"]);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("hashes only regular archive files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-registry-vault-"));
  try {
    const archivePath = path.join(root, "release.spsplugin");
    await writeFile(archivePath, "release", "utf8");
    const description = await describeSpsPluginArchive(archivePath);
    assert.equal(description.artifact.sizeBytes, 7);
    assert.equal(description.artifact.sha256.length, 64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

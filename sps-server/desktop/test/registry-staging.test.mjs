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

test("refuses to extract when the supplied release tuple differs from the archive", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-vault-"));
  try {
    const archivePath = path.join(vaultRoot, "release.spsplugin");
    await writeFile(archivePath, "release", "utf8");
    await assert.rejects(
      () => stageSpsPluginArchive({
        vaultRoot,
        archivePath,
        source: { registryId: "io.sps.local", kind: "local", releaseLocator: "release.spsplugin" },
        expectedArtifact: { sha256: "a".repeat(64), sizeBytes: 7 },
        extractArchive: async () => {
          throw new Error("The extractor must not run for an invalid release tuple.");
        },
        registerStage: async () => {
          throw new Error("The stage API must not run for an invalid release tuple.");
        },
      }),
      /release record/i,
    );
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("does not register when static package permissions differ from the signed release preview", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-vault-"));
  try {
    const archivePath = path.join(vaultRoot, "release.spsplugin");
    await writeFile(archivePath, "release", "utf8");
    let registered = false;
    await assert.rejects(
      () => stageSpsPluginArchive({
        vaultRoot,
        archivePath,
        source: { registryId: "io.sps.local", kind: "local", releaseLocator: "release.spsplugin" },
        expectedRelease: {
          pluginId: "com.example.weather",
          version: "1.0.0",
          permissionsDigest: "a".repeat(64),
          capabilities: ["plugin.state.read"],
        },
        extractArchive: async ({ destinationRoot }) => ({
          extracted: true,
          destinationRoot,
          inspection: {
            package: {
              staticManifest: {
                plugin: { id: "com.example.weather", version: "1.0.0" },
                permissionsDigest: "a".repeat(64),
                capabilities: ["plugin.state.write"],
              },
            },
          },
        }),
        registerStage: async () => { registered = true; },
      }),
      /capabilities do not match/i,
    );
    assert.equal(registered, false);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("does not register when the package API differs from the signed compatibility contract", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-vault-"));
  try {
    const archivePath = path.join(vaultRoot, "release.spsplugin");
    await writeFile(archivePath, "release", "utf8");
    let registered = false;
    await assert.rejects(
      () => stageSpsPluginArchive({
        vaultRoot,
        archivePath,
        source: { registryId: "io.sps.local", kind: "local", releaseLocator: "release.spsplugin" },
        expectedRelease: {
          pluginId: "com.example.weather",
          version: "1.0.0",
          permissionsDigest: "a".repeat(64),
          capabilities: ["plugin.state.read"],
          compatibility: { pluginApi: 2 },
        },
        extractArchive: async ({ destinationRoot }) => ({
          extracted: true,
          destinationRoot,
          inspection: {
            package: {
              staticManifest: {
                plugin: { id: "com.example.weather", version: "1.0.0", apiVersion: "1" },
                permissionsDigest: "a".repeat(64),
                capabilities: ["plugin.state.read"],
              },
            },
          },
        }),
        registerStage: async () => { registered = true; },
      }),
      /plugin API does not match/i,
    );
    assert.equal(registered, false);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

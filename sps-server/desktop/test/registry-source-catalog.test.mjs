import assert from "node:assert/strict";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createPluginTemplate,
  generatePluginSigningKeyPair,
  publishPluginToLocalRegistry,
} from "@sonparkserver/plugin-sdk/authoring/plugin-package-v1.mjs";
import { buildPluginWorker } from "@sonparkserver/plugin-sdk/authoring/worker-bundle-v1.mjs";
import {
  acquireRegistryRelease,
  addRegistrySource,
  inspectRegistrySource,
  isBundledRegistrySource,
  loadRegistrySources,
  removeRegistrySource,
  SPS_OFFICIAL_REGISTRY_SOURCE,
} from "../src/registry-source-catalog.mjs";
import { stageSpsPluginArchive } from "../src/registry-staging.mjs";

test("keeps the SPS Official Registry bundled while storing and removing Owner-trusted sources", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-sources-"));
  try {
    const source = { id: "io.sps.local", kind: "local", displayName: "Team Registry", localPath: path.join(vaultRoot, "registry") };
    const initial = await loadRegistrySources({ vaultRoot });
    assert.deepEqual(initial.sources, [SPS_OFFICIAL_REGISTRY_SOURCE]);
    assert.equal(isBundledRegistrySource(initial.sources[0]), true);
    await addRegistrySource({ vaultRoot, source });
    const loaded = await loadRegistrySources({ vaultRoot });
    assert.deepEqual(loaded.sources.map((entry) => entry.id), ["io.sps.official", source.id]);
    await assert.rejects(
      () => removeRegistrySource({ vaultRoot, sourceId: SPS_OFFICIAL_REGISTRY_SOURCE.id }),
      /cannot be removed/i,
    );
    await removeRegistrySource({ vaultRoot, sourceId: source.id });
    assert.deepEqual((await loadRegistrySources({ vaultRoot })).sources, [SPS_OFFICIAL_REGISTRY_SOURCE]);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("keeps the bundled Official Registry separate from the product source repository", () => {
  assert.equal(
    SPS_OFFICIAL_REGISTRY_SOURCE.indexUrl,
    "https://raw.githubusercontent.com/Powerpunch777/SPS-Official-Extensions/main/registry.json",
  );
  assert.doesNotMatch(SPS_OFFICIAL_REGISTRY_SOURCE.indexUrl, /Powerpunch777\/SPS\//);
});

test("rejects third-party remote Registry sources before they can be inspected or saved", async () => {
  const remote = {
    id: "io.sps.example",
    kind: "official",
    displayName: "Example Registry",
    indexUrl: "https://registry.example.test/registry.json",
    trustedRoot: {
      keyId: "ed25519:example-root",
      publicKey: "-----BEGIN PUBLIC KEY-----\nexample\n-----END PUBLIC KEY-----\n",
    },
  };
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-policy-"));
  try {
    await assert.rejects(
      () => inspectRegistrySource(remote),
      /only the bundled SPS Official Registry and Owner-selected local development Registries/i,
    );
    await assert.rejects(
      () => addRegistrySource({ vaultRoot, source: remote }),
      /only the bundled SPS Official Registry and Owner-selected local development Registries/i,
    );
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("stages a local release published by the Plugin Kit without executing it", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-local-registry-flow-"));
  try {
    const sourceDirectory = path.join(root, "plugin");
    const registryDirectory = path.join(root, "registry");
    const vaultRoot = path.join(root, "owner-vault");
    await createPluginTemplate({
      directory: sourceDirectory,
      pluginId: "com.example.weather",
      packageName: "@example/weather",
      displayName: "Weather",
      version: "1.0.0",
    });
    await cp(
      path.resolve("node_modules", "@sonparkserver", "plugin-sdk"),
      path.join(sourceDirectory, "node_modules", "@sonparkserver", "plugin-sdk"),
      { recursive: true },
    );
    await buildPluginWorker({ sourceDirectory });
    const publisher = generatePluginSigningKeyPair();
    const registryRoot = generatePluginSigningKeyPair();
    await publishPluginToLocalRegistry({
      sourceDirectory,
      registryDirectory,
      registryId: "io.sps.example",
      displayName: "Example Registry",
      publisherId: "example-studio",
      publisherKeyId: "ed25519:example-publisher",
      publisherPrivateKey: publisher.privateKey,
      registryRootKeyId: "ed25519:example-root",
      registryRootPrivateKey: registryRoot.privateKey,
      publishedAt: "2026-07-23T00:00:00.000Z",
      catalog: {
        displayName: "Weather",
        summary: "A signed local release.",
        documentationUrl: "https://docs.example.test/weather",
      },
      publisherProfile: {
        displayName: "Example Studio",
        websiteUrl: "https://example.test",
      },
    });

    const source = {
      id: "io.sps.example",
      kind: "local",
      displayName: "Example Registry",
      localPath: registryDirectory,
    };
    const report = await inspectRegistrySource(source);
    assert.equal(report.valid, true);
    assert.equal(report.releases[0].catalog.displayName, "Weather");
    assert.equal(report.releases[0].publisherProfile.displayName, "Example Studio");
    assert.deepEqual(report.releases[0].compatibility, {
      sps: ">=0.4.0 <0.5.0",
      pluginApi: 1,
      extensionProfile: "2.0",
    });
    const acquired = await acquireRegistryRelease({
      vaultRoot,
      source,
      pluginId: "com.example.weather",
      version: "1.0.0",
    });
    const registered = [];
    const staged = await stageSpsPluginArchive({
      vaultRoot,
      archivePath: acquired.archivePath,
      expectedArtifact: acquired.artifact,
      expectedRelease: acquired.release,
      source: acquired.source,
      registerStage: async (input) => {
        registered.push(input);
        return { stageId: "stage-1", status: "staged" };
      },
    });
    assert.equal(staged.staged, true);
    assert.equal(staged.stage.stageId, "stage-1");
    assert.equal(registered.length, 1);
    assert.equal(registered[0].source.registryId, "io.sps.example");
    assert.equal(registered[0].artifactSha256, acquired.artifact.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

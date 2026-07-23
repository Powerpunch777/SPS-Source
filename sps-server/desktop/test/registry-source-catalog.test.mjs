import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalizeRegistryIndex,
  canonicalizeReleaseRecord,
} from "@sps/plugin-platform/registry/release-record-v1.mjs";
import {
  createPluginTemplate,
  generatePluginSigningKeyPair,
  publishPluginToLocalRegistry,
} from "@sps/plugin-platform/authoring/plugin-package-v1.mjs";
import {
  acquireRegistryRelease,
  addRegistrySource,
  inspectRegistrySource,
  loadRegistrySources,
  removeRegistrySource,
} from "../src/registry-source-catalog.mjs";
import { stageSpsPluginArchive } from "../src/registry-staging.mjs";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function signJson(value, privateKey, canonicalize) {
  return sign(null, Buffer.from(canonicalize(value)), privateKey).toString("base64");
}

function makeRemoteFixture() {
  const root = generateKeyPairSync("ed25519");
  const publisher = generateKeyPairSync("ed25519");
  const artifact = Buffer.from("sps-test-plugin-package");
  const release = {
    registrySchemaVersion: 1,
    plugin: { id: "com.example.weather", version: "1.0.0" },
    artifact: { url: "packages/weather.spsplugin", sha256: sha256(artifact), sizeBytes: artifact.length },
    publisher: { id: "example-studio", keyId: "ed25519:example-publisher" },
    signature: { algorithm: "ed25519", value: "" },
    compatibility: { sps: ">=0.4.0", pluginApi: 1 },
    visibility: "public",
    catalog: {
      displayName: "Example Weather",
      summary: "A signed weather summary.",
      documentationUrl: "https://docs.example.test/weather",
    },
    permissionsDigest: "a".repeat(64),
    publishedAt: "2026-07-23T00:00:00Z",
  };
  release.signature.value = signJson(release, publisher.privateKey, canonicalizeReleaseRecord);
  const index = {
    registrySchemaVersion: 1,
    registryId: "io.sps.example",
    displayName: "Example Registry",
    updatedAt: "2026-07-23T00:00:00Z",
    publisherKeys: [{
      keyId: "ed25519:example-publisher",
      algorithm: "ed25519",
      publicKey: publisher.publicKey.export({ type: "spki", format: "pem" }),
    }],
    publishers: [{
      id: "example-studio",
      displayName: "Example Studio",
      websiteUrl: "https://example.test",
    }],
    plugins: [{ id: "com.example.weather", latest: "1.0.0", releases: ["releases/weather.json"] }],
    signature: { keyId: "ed25519:example-root", algorithm: "ed25519", value: "" },
  };
  index.signature.value = signJson(index, root.privateKey, canonicalizeRegistryIndex);
  const source = {
    id: "io.sps.example",
    kind: "official",
    displayName: "Example Registry",
    indexUrl: "https://registry.example.test/registry.json",
    trustedRoot: {
      keyId: "ed25519:example-root",
      publicKey: root.publicKey.export({ type: "spki", format: "pem" }),
    },
  };
  const fetchImpl = async (url) => {
    const body = url.endsWith("registry.json")
      ? JSON.stringify(index)
      : url.endsWith("releases/weather.json")
        ? JSON.stringify(release)
        : url.endsWith("packages/weather.spsplugin")
          ? artifact
          : null;
    return body === null
      ? new Response("missing", { status: 404 })
      : new Response(body, { status: 200, headers: { "content-length": String(Buffer.byteLength(body)) } });
  };
  return { artifact, source, fetchImpl };
}

test("stores and removes Owner-trusted Registry source definitions", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-sources-"));
  try {
    const source = { id: "io.sps.local", kind: "local", displayName: "Team Registry", localPath: path.join(vaultRoot, "registry") };
    await addRegistrySource({ vaultRoot, source });
    const loaded = await loadRegistrySources({ vaultRoot });
    assert.deepEqual(loaded.sources, [source]);
    await removeRegistrySource({ vaultRoot, sourceId: source.id });
    assert.deepEqual((await loadRegistrySources({ vaultRoot })).sources, []);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("verifies a signed remote source before exposing its release", async () => {
  const { source, fetchImpl } = makeRemoteFixture();
  const report = await inspectRegistrySource(source, { fetchImpl });
  assert.equal(report.valid, true);
  assert.equal(report.trust, "pinned-remote-root");
  assert.deepEqual(report.releases.map((release) => [release.pluginId, release.version]), [["com.example.weather", "1.0.0"]]);
  assert.deepEqual(report.releases[0].catalog, {
    displayName: "Example Weather",
    summary: "A signed weather summary.",
    documentationUrl: "https://docs.example.test/weather",
  });
  assert.deepEqual(report.releases[0].publisherProfile, {
    id: "example-studio",
    displayName: "Example Studio",
    websiteUrl: "https://example.test",
  });
});

test("downloads a verified remote artifact into the Owner Vault without executing it", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-acquire-"));
  try {
    const { artifact, source, fetchImpl } = makeRemoteFixture();
    const acquired = await acquireRegistryRelease({
      vaultRoot,
      source,
      pluginId: "com.example.weather",
      version: "1.0.0",
      fetchImpl,
      randomId: () => "fixed",
    });
    assert.equal(acquired.cleanupArchive, true);
    assert.deepEqual(await (await import("node:fs/promises")).readFile(acquired.archivePath), artifact);
    assert.deepEqual(acquired.source, {
      registryId: "io.sps.example",
      kind: "official",
      releaseLocator: "releases/weather.json",
    });
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

test("rejects a remote artifact that differs from its signed release size", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-registry-acquire-"));
  try {
    const { source, fetchImpl } = makeRemoteFixture();
    await assert.rejects(
      () => acquireRegistryRelease({
        vaultRoot,
        source,
        pluginId: "com.example.weather",
        version: "1.0.0",
        fetchImpl: async (url, options) => {
          const response = await fetchImpl(url, options);
          return url.endsWith("weather.spsplugin")
            ? new Response("tampered", { status: 200, headers: { "content-length": "8" } })
            : response;
        },
      }),
      /size|SHA-256/i,
    );
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

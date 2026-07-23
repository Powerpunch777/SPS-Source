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
  acquireRegistryRelease,
  addRegistrySource,
  inspectRegistrySource,
  loadRegistrySources,
  removeRegistrySource,
} from "../src/registry-source-catalog.mjs";

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

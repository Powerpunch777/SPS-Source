import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  BUNDLED_REVIEW_MANIFESTS,
  assertManifestCurrent,
  createStaticManifest,
} from "../scripts/sync-bundled-review-manifests.mjs";
import {
  calculateStaticCapabilitiesDigest,
  validateStaticPluginManifest,
} from "@sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs";

const fixture = () => {
  const capabilities = ["events.subscribe", "memory.providers.register"];
  return {
    expectedPluginId: "sps.default-memory",
    packageJson: {
      name: "sps-default-memory",
      version: "0.1.0",
      spsPlugin: { id: "sps.default-memory", manifest: "./dist/manifest.js" },
    },
    runtimeManifest: { id: "sps.default-memory", version: "0.1.0", apiVersion: 1, capabilities },
    manifestBytes: Buffer.from("export default { id: 'sps.default-memory' };\n"),
  };
};

test("limits generation to the two fixed first-party bundles", () => {
  assert.deepEqual(BUNDLED_REVIEW_MANIFESTS, [
    { directory: "sps-default-memory", packageName: "sps-default-memory", pluginId: "sps.default-memory" },
    { directory: "sps-plugin-discovery", packageName: "sps-plugin-discovery", pluginId: "sps.plugin-discovery" },
  ]);
});

test("runtime Main never references the build-time generator", async () => {
  const mainSource = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(mainSource, /sync-bundled-review-manifests|createStaticManifest/);
});

test("creates SDK-valid metadata from exact runtime manifest bytes", () => {
  const input = fixture();
  const generated = createStaticManifest(input);
  assert.deepEqual(validateStaticPluginManifest(generated), { valid: true, errors: [] });
  assert.equal(generated.runtime.manifestEntry, "dist/manifest.js");
  assert.equal(generated.runtime.manifestSha256, createHash("sha256").update(input.manifestBytes).digest("hex"));
  assert.equal(generated.permissionsDigest, calculateStaticCapabilitiesDigest(input.runtimeManifest.capabilities));
  assert.deepEqual(generated.capabilities, input.runtimeManifest.capabilities);
});

test("rejects runtime identity and version mismatches", () => {
  const input = fixture();
  assert.throws(() => createStaticManifest({
    ...input,
    runtimeManifest: { ...input.runtimeManifest, id: "sps.other-plugin" },
  }), /id\/version must match/);
  assert.throws(() => createStaticManifest({
    ...input,
    runtimeManifest: { ...input.runtimeManifest, version: "0.1.1" },
  }), /id\/version must match/);
  assert.throws(() => createStaticManifest({
    ...input,
    packageJson: { ...input.packageJson, version: "0.1.1" },
  }), /id\/version must match/);
});

test("rejects stale generated output without rewriting it", () => {
  const input = fixture();
  const expected = createStaticManifest(input);
  const stale = { ...expected, runtime: { ...expected.runtime, manifestSha256: "0".repeat(64) } };
  assert.throws(() => assertManifestCurrent(stale, expected), /is stale/);
  assert.doesNotThrow(() => assertManifestCurrent(expected, expected));
});

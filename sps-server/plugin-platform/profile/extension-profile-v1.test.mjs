import assert from "node:assert/strict";
import test from "node:test";
import { inspectSpsExtensionProfile } from "./extension-profile-v1.mjs";

async function loadManifest(relativePath) {
  return (await import(new URL(relativePath, import.meta.url).href)).default;
}

test("accepts the bundled SPS Team Workplane profile", async () => {
  const manifest = await loadManifest("../../sps-room-chat/src/manifest.js");
  const result = inspectSpsExtensionProfile(manifest);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.deepEqual(result.extension, {
    contractVersion: "1.0",
    kind: "workplane",
    profileKey: "sps-lead-worker",
  });
  assert.equal(manifest.companyActivation?.defaultEnabled, false);
  assert.deepEqual(result.features, ["surface", "automation"]);
});

test("accepts SPS Default Memory as a store provider", async () => {
  const manifest = await loadManifest("../../sps-default-memory/dist/manifest.js");
  const result = inspectSpsExtensionProfile(manifest);

  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.extension?.kind, "store_provider");
  assert.deepEqual(result.features, ["tool", "automation"]);
  assert.equal(manifest.companyActivation?.defaultEnabled, false);
  assert.equal(manifest.memoryProvider.defaultForNewCompanies, false);
});

test("reports legacy-compatible manifests without rejecting them", async () => {
  const result = inspectSpsExtensionProfile({
    id: "com.example.legacy",
    version: "1.0.0",
    entrypoints: { worker: "./dist/worker.js" },
    capabilities: ["agent.tools.register"],
    tools: [{ name: "hello" }],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.warnings, ["Legacy-compatible manifest: no agentPlatform extension declaration."]);
});

test("rejects an incomplete workplane declaration", () => {
  const result = inspectSpsExtensionProfile({
    id: "com.example.incomplete-workplane",
    version: "1.0.0",
    entrypoints: { worker: "./dist/worker.js" },
    capabilities: ["issues.read", "projects.read"],
    agentPlatform: {
      contractVersion: "1.0",
      kind: "workplane",
      profileKey: "example",
    },
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("Workplane extensions require agent.sessions.send."));
});

test("rejects a tool declaration without the Core tool capability", () => {
  const result = inspectSpsExtensionProfile({
    id: "com.example.missing-tool-capability",
    version: "1.0.0",
    entrypoints: { worker: "./dist/worker.js" },
    capabilities: [],
    tools: [{ name: "hello" }],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("Tool declarations require agent.tools.register."));
});

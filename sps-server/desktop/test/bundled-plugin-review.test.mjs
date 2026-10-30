import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { calculateStaticCapabilitiesDigest } from "@sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import { createChecklistPackage } from "../scripts/no-ai-checklist-package.mjs";
import { listRestoredBundledPluginReviews, stageRestoredBundledPluginReview } from "../src/bundled-plugin-review.mjs";

async function fixture(t) {
  const owned = await createWorkspaceE2eFixture();
  t.after(() => owned.remove());
  const pluginId = "sps.bundle-review-fixture";
  const directory = path.join(owned.directory, "bundle");
  const { manifest } = await createChecklistPackage(directory, { id: pluginId, withUi: false });
  const packageFile = path.join(directory, "package.json");
  const pkg = JSON.parse(await readFile(packageFile, "utf8"));
  pkg.spsPlugin.id = pluginId;
  await writeFile(packageFile, JSON.stringify(pkg));
  const marker = path.join(owned.directory, "must-not-import.txt");
  const entry = path.join(directory, "dist", "manifest.js");
  const bytes = `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'imported');\n${await readFile(entry, "utf8")}`;
  await writeFile(entry, bytes);
  await writeFile(path.join(directory, "sps-plugin.json"), JSON.stringify({
    schemaVersion: 1, plugin: { id: pluginId, version: manifest.version, apiVersion: "1" },
    runtime: { manifestEntry: "dist/manifest.js", manifestSha256: createHash("sha256").update(bytes).digest("hex") },
    capabilities: manifest.capabilities, permissionsDigest: calculateStaticCapabilitiesDigest(manifest.capabilities),
  }));
  return { owned, pluginId, directory, marker, bundles: [{ pluginId, directory }],
    records: [{ pluginKey: pluginId, status: "uninstalled", packagePath: null }] };
}

test("current-app bundle inspection and explicit staging never import code or approve a stage", async t => {
  const context = await fixture(t);
  const [review] = await listRestoredBundledPluginReviews(context);
  assert.equal(review.pluginId, context.pluginId);
  assert.equal(review.version, "0.1.0");
  assert.ok(review.capabilities.length);
  assert.equal(Object.hasOwn(review, "directory"), false);
  await assert.rejects(lstat(context.marker), { code: "ENOENT" });
  let registered;
  const result = await stageRestoredBundledPluginReview({ ...context, vaultRoot: path.join(context.owned.directory, "vault"),
    assertCurrent: () => {}, registerStage: async body => { registered = body; return { stageId: "fixture-stage", status: "staged" }; },
  });
  assert.equal(result.stage.status, "staged");
  assert.equal(registered.source.kind, "local");
  assert.equal(registered.source.registryId, "io.sps.current-app-bundles");
  assert.equal(registered.artifactSha256, result.artifact.sha256);
  await assert.rejects(lstat(context.marker), { code: "ENOENT" });
});

test("only restored pathless configured records can request a current-app bundle stage", async t => {
  const context = await fixture(t);
  for (const record of [
    { ...context.records[0], status: "ready" },
    { ...context.records[0], packagePath: context.directory },
  ]) {
    const input = { ...context, records: [record] };
    assert.deepEqual(await listRestoredBundledPluginReviews(input), []);
    await assert.rejects(stageRestoredBundledPluginReview({ ...input, pluginId: context.pluginId }), /not waiting/);
  }
  await assert.rejects(stageRestoredBundledPluginReview({ ...context, pluginId: "local.unconfigured" }), /not waiting/);
});

test("stale runtime bytes and contradictory declarative identity fail before registration", async t => {
  const context = await fixture(t);
  await assert.rejects(listRestoredBundledPluginReviews({ bundles: [{ pluginId: "local.wrong", directory: context.directory }],
    records: [{ pluginKey: "local.wrong", status: "uninstalled", packagePath: null }] }), /identity/);
  await writeFile(path.join(context.directory, "dist/manifest.js"), "throw new Error('must not run');");
  await assert.rejects(listRestoredBundledPluginReviews(context), /static package verification/);
  await assert.rejects(lstat(context.marker), { code: "ENOENT" });
});

test("a retired account/Host scope prevents package staging", async t => {
  const context = await fixture(t);
  await assert.rejects(stageRestoredBundledPluginReview({ ...context, pluginId: context.pluginId,
    assertCurrent: () => { throw new Error("stale Host scope"); },
  }), /stale Host scope/);
});

test("all shipped first-party bundle sidecars are code-free SDK-valid review inputs", async () => {
  const bundles = [
    { pluginId: "sps.default-memory", directory: path.resolve(import.meta.dirname, "../../sps-default-memory") },
    { pluginId: "sps.plugin-discovery", directory: path.resolve(import.meta.dirname, "../../sps-plugin-discovery") },
    { pluginId: "local.room-chat", directory: path.resolve(import.meta.dirname, "../../sps-room-chat") },
  ];
  const records = bundles.map(bundle => ({ pluginKey: bundle.pluginId, status: "uninstalled", packagePath: null }));
  const reviews = await listRestoredBundledPluginReviews({ bundles, records });
  assert.deepEqual(reviews.map(review => review.pluginId), bundles.map(bundle => bundle.pluginId));
});

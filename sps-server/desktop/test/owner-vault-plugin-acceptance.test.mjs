import assert from "node:assert/strict";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import { createLifecycleRegistryFixture } from "../scripts/plugin-package-lifecycle-acceptance.mjs";

test("transfer package import probe stays inert through public SDK build/pack and observes a genuine later import", { timeout: 45_000 }, async t => {
  const fixture = await createWorkspaceE2eFixture();
  t.after(() => fixture.remove());
  const probe = path.join(fixture.directory, "owned-import-probe.txt");
  const registry = await createLifecycleRegistryFixture(fixture.directory, { manifestImportProbe: probe });
  await assert.rejects(lstat(probe), { code: "ENOENT" });
  const manifest = path.join(registry.directory, "source", "0.1.0", "dist", "manifest.js");
  const loaded = await import(pathToFileURL(manifest).href);
  assert.equal(loaded.default.id, "local.core-package-lifecycle");
  assert.equal(await readFile(probe, "utf8"), "manifest-imported\n");
});

test("actual Main restores only inert stages with final-Host paths before promotion and startup", async () => {
  const source = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function restoreOwnerServerFromTransferLocked(");
  const end = source.indexOf("async function revealOwnerRestoreAttempt(", start);
  assert.ok(start >= 0 && end > start);
  const restore = source.slice(start, end);
  const sql = restore.indexOf("await runOwnerHostRestoreProcess({");
  const rebase = restore.indexOf("await rebaseRestoredRegistryStages({ vaultRoot: stagingRoot, destinationVaultRoot: targetRoot });");
  const receipt = restore.indexOf("await writeSpsOwnerVaultRestoreReceipt(");
  const promote = restore.indexOf("await fs.rename(stagingRoot, targetRoot);");
  const activate = restore.indexOf("await startOwnerHost({ activate: true");
  assert.ok(sql >= 0 && rebase > sql && receipt > rebase && promote > receipt && activate > promote);
  assert.match(restore, /Restored Registry packages remain inactive/);
});

test("transfer acceptance retains two real Worker states, demands new Host review and verifies post-restart data", async () => {
  const source = await readFile(new URL("../scripts/owner-vault-plugin-acceptance.mjs", import.meta.url), "utf8");
  for (const proof of [
    'dialog.message() !== confirmation', 'await dialog.accept()',
    'record.status, "uninstalled"', 'record.packagePath, null',
    'stage?.status, "staged"', 'stage.review, null',
    'Restore/startup imported code before new-Host review',
    'assert.notEqual(packageRoot, await realpath(evidence.originalPackagePath))',
    'assert.deepEqual(data, evidence.expected[index])',
  ]) assert.ok(source.includes(proof), `Missing transfer acceptance assertion: ${proof}`);
  assert.doesNotMatch(source, /approvedCapabilityEscalation|approvedDataMigrationPlanHash|SPS_DESKTOP_E2E_SKIP/);
  const main = await readFile(new URL("../scripts/smoke-owner-vault-transfer-desktop.mjs", import.meta.url), "utf8");
  const stoppedSource = main.indexOf("await stop(source.app);");
  const resetProbe = main.indexOf("await resetTransferPluginImportProbe(", stoppedSource);
  const restore = main.indexOf("window.spsDesktop.restoreOwnerServer()", resetProbe);
  assert.ok(stoppedSource >= 0 && resetProbe > stoppedSource && restore > resetProbe);
  const restart = main.indexOf('"reopen restored Workspace"');
  assert.ok(restart >= 0 && main.indexOf("await assertRestoredTransferPluginData(", restart) > restart);
});

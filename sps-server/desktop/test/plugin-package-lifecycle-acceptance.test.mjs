import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { inspectLocalRegistry } from "@sonparkserver/plugin-sdk/registry/local-registry-v1.mjs";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import { createLifecycleRegistryFixture } from "../scripts/plugin-package-lifecycle-acceptance.mjs";

test("lifecycle fixture builds three genuinely signed packages and detects changed archive bytes", { timeout: 45_000 }, async t => {
  const owned = await createWorkspaceE2eFixture();
  t.after(() => owned.remove());
  const fixture = await createLifecycleRegistryFixture(owned.directory);
  const report = await inspectLocalRegistry(fixture.directory);
  assert.equal(report.valid, true, JSON.stringify(report.errors));
  assert.deepEqual(report.releases.map(release => release.version).sort(), ["0.1.0", "0.2.0", "0.3.0"]);
  assert.equal(new Set(fixture.artifacts.map(artifact => artifact.sha256)).size, 3);
  const archive = path.join(fixture.directory, "artifacts", "0.2.0.spsplugin");
  const bytes = await readFile(archive);
  bytes[bytes.length - 1] ^= 1;
  await writeFile(archive, bytes);
  const modified = await inspectLocalRegistry(fixture.directory);
  assert.equal(modified.valid, false);
  assert.ok(modified.errors.some(error => /sha-?256|hash/i.test(error)));
});

test("actual Desktop lifecycle acceptance uses exact Host confirmation and verifies failed activation, rollback and restart", async () => {
  const source = await readFile(new URL("../scripts/plugin-package-lifecycle-acceptance.mjs", import.meta.url), "utf8");
  for (const proof of [
    'await apply("0.2.0")', 'await apply("0.3.0", { failure: true })',
    'assert.equal(rolledBack.packagePath, updated.packagePath',
    'registry.expectConfirmation(confirmation)', 'registry.assertConfirmationHandled()',
    'assert.deepEqual(version.data, { version: "0.1.0" })', 'secondCompany',
  ]) assert.ok(source.includes(proof), `Missing lifecycle acceptance assertion: ${proof}`);
  assert.doesNotMatch(source, /approvedCapabilityEscalation|approvedDataMigrationPlanHash|SPS_DESKTOP_E2E_SKIP|--live-agent/);
  const noAi = await readFile(new URL("../scripts/no-ai-checklist-acceptance.mjs", import.meta.url), "utf8");
  const restarted = noAi.indexOf("workspace = await restart(");
  assert.ok(restarted >= 0 && noAi.indexOf("await verifyPackageLifecycleAfterRestart(workspace)") > restarted);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("historical backup acceptance uses actual fresh-Host Main restore and checks both Workspaces after restart", async () => {
  const source = await readFile(new URL("../scripts/smoke-owner-vault-transfer-desktop.mjs", import.meta.url), "utf8");
  for (const proof of ['process.argv.includes("--historical-core-backup")',
    'await prepareHistoricalOwnerTransfer({ fixture, destinationRoot: exportDirectory })',
    'window.spsDesktop.restoreOwnerServer()', 'window.spsDesktop.openWorkspace()',
    'historicalEvidence.secondCompany.id', 'assert.equal(oldProject.description, project.description)',
    'historical-core-data-and-file-retained-after-current-main-restart',
    'historicalInstalledDatabaseMigrationQualified: false', 'process.stdout.write',
    'if (ownedJobCleanupPending) process.exit(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE)',
  ]) assert.ok(source.includes(proof), `Missing historical Main acceptance assertion: ${proof}`);
  assert.doesNotMatch(source, /SPS_DESKTOP_E2E_SKIP|approvedDataMigrationPlanHash|DATABASE_URL\s*=/);
});

test("hosted Windows requires historical Main backup acceptance with the normal reduced-token Job gate", async () => {
  const workflow = await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8");
  const wrapper = await readFile(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url), "utf8");
  const start = workflow.indexOf("- name: Verify historical Core backup through actual Desktop Main restore");
  const end = workflow.indexOf("\n      - name:", start + 1);
  assert.ok(start >= 0 && end > start);
  const step = workflow.slice(start, end);
  for (const value of ['timeout-minutes: 20', 'shell: powershell', 'SPS_DESKTOP_E2E_SOURCE: "1"',
    'run: .\\scripts\\run-windows-ci-e2e.ps1 -Mode owner-vault-historical-core']) assert.ok(step.includes(value));
  assert.doesNotMatch(step, /continue-on-error|RUNNER_ENVIRONMENT\s*:/);
  assert.ok(wrapper.includes("$Mode -ceq 'owner-vault-historical-core'"));
  assert.ok(runner.includes('if (mode == "owner-vault-historical-core") return RunNode(node, directory, "smoke-owner-vault-transfer-desktop.mjs", "--historical-core-backup", OwnedJobCleanupArgument);'));
  assert.ok(runner.slice(runner.indexOf("static bool OwnedJobGateMode"), runner.indexOf("static int OwnedJobWaitMilliseconds")).includes('value == "owner-vault-historical-core"'));
});

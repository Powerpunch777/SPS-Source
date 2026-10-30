import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const script = new URL("../scripts/smoke-historical-core-migration.mjs", import.meta.url);

test("historical schema acceptance rejects external database arguments and unowned delegated cleanup before creating a DB", async () => {
  for (const args of [["--database=postgres://fixture.invalid"], ["--owned-job-cleanup-pending"]]) {
    await assert.rejects(exec(process.execPath, [fileURLToPath(script), ...args], {
      env: { ...process.env, GITHUB_ACTIONS: "false" }, timeout: 10_000, windowsHide: true,
    }), error => {
      assert.match(error.stderr, /accepts no external database|requires the owned hosted-Windows launcher/);
      assert.doesNotMatch(error.stdout, /historicalSchemaStage/);
      return true;
    });
  }
});

test("historical schema acceptance uses actual pinned SQL, data snapshots, backup restore and owned cleanup", async () => {
  const source = await readFile(script, "utf8");
  const pin = source.indexOf("await stageHistoricalCoreSchema(");
  const old = source.indexOf("await migrate(drizzle(client(oldUrl))");
  const populated = source.indexOf("await seed(old)");
  const backup = source.indexOf("await db.runDatabaseBackup(");
  const upgrade = source.indexOf("await db.applyPendingMigrations(oldUrl)");
  const restore = source.indexOf("await db.runDatabaseRestore(");
  const restoredUpgrade = source.indexOf("await db.applyPendingMigrations(restoredUrl)");
  assert.ok(pin >= 0 && old > pin && populated > old && backup > populated && upgrade > backup);
  assert.ok(restore > upgrade && restoredUpgrade > restore);
  assert.match(source, /assert\.equal\(pending\.pendingMigrations\.length, 19\)/);
  assert.match(source, /assert\.deepEqual\(await snapshot\(old, columns\), before\)/);
  assert.match(source, /assert\.deepEqual\(await snapshot\(restored, columns\), before\)/);
  assert.match(source, /assert\.deepEqual\(await history\(restored\), oldHistory\)/);
  assert.match(source, /backupEngine: "javascript"/);
  assert.match(source, /await cluster\.cleanup\(\)/);
  assert.match(source, /if \(!cleanupErrors\.length\) await fixture\.remove\(\)/);
  assert.match(source, /if \(failure \|\| cleanupErrors\.length\) throw new AggregateError/);
  assert.match(source, /historicalApplicationExecuted: false/);
  assert.match(source, /installedDatabaseMigrationQualified: false/);
  assert.match(source, /if \(pendingJobCleanup\) process\.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
  assert.doesNotMatch(source, /DATABASE_URL|process\.argv\[\d+\].*postgres|runNsis|electron\.launch|catch\s*\{\s*\}/);
});

test("historical schema CI requires hosted reduced-token ownership and natural whole-Job cleanup", async () => {
  const wrapper = await readFile(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8");
  const guard = wrapper.indexOf("if ($Mode -ceq 'historical-core-migration' -and $env:RUNNER_ENVIRONMENT -cne 'github-hosted')");
  assert.ok(guard >= 0 && guard < wrapper.indexOf("$phase = 'compile'"));
  assert.match(runner, /if \(mode == "historical-core-migration"\) return RunNode\(node, directory, "smoke-historical-core-migration\.mjs", OwnedJobCleanupArgument\);/);
  const start = workflow.indexOf("- name: Verify pinned historical Core schema upgrade and backup recovery");
  const end = workflow.indexOf("\n      - name:", start + 1);
  assert.ok(start >= 0 && end > start);
  const block = workflow.slice(start, end);
  assert.match(block, /timeout-minutes: 20/);
  assert.match(block, /shell: powershell/);
  assert.match(block, /run: \.\\scripts\\run-windows-ci-e2e\.ps1 -Mode historical-core-migration/);
  assert.doesNotMatch(block, /continue-on-error|RUNNER_ENVIRONMENT\s*:|GITHUB_ACTIONS\s*:/);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
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
  assert.match(source, /await new Promise\(\(resolve, reject\) => process\.stdout\.write/);
  assert.match(source, /if \(pendingJobCleanup\) process\.exit\(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE\)/);
  assert.doesNotMatch(source, /DATABASE_URL|process\.argv\[\d+\].*postgres|runNsis|electron\.launch|catch\s*\{\s*\}/);
});

test("historical acceptance flushes actual evidence and preserves pending exit despite the vendor beforeExit hook", async () => {
  const source = await readFile(script, "utf8");
  const start = source.lastIndexOf("const evidence = {");
  assert.ok(start > source.indexOf("if (failure || cleanupErrors.length) throw new AggregateError"));
  const require = createRequire(new URL("../../../external/sps-core/server/package.json", import.meta.url));
  const hookPath = createRequire(require.resolve("embedded-postgres")).resolve("async-exit-hook");
  const entry = `import { createRequire } from 'node:module';
    const require = createRequire(import.meta.url);
    const hook = require(${JSON.stringify(hookPath)}); hook(done => { if (typeof done === 'function') done(); });
    const pendingJobCleanup = true;
    const OWNED_JOB_CLEANUP_PENDING_EXIT_CODE = 76;
    const HISTORICAL_CORE_SCHEMA_BASELINE = { coreCommit: 'a'.repeat(40), journalSha256: 'b'.repeat(64), sqlSha256: 'c'.repeat(64) };
    const phases = ['fixture-cleanup-completed']; const records = Array(12);
    ${source.slice(start)}`;
  const naturalExit = await exec(process.execPath, ["--input-type=module", "-e",
    entry.replace("process.exit(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE)", "process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE")], {
    timeout: 10_000, windowsHide: true, maxBuffer: 16_384,
  });
  assert.equal(naturalExit.stderr, "");
  assert.equal(JSON.parse(naturalExit.stdout).ownedJobCleanup, "pending-external-observation");
  await assert.rejects(exec(process.execPath, ["--input-type=module", "-e", entry], {
    timeout: 10_000, windowsHide: true, maxBuffer: 16_384,
  }), error => {
    assert.equal(error.code, 76);
    assert.equal(error.stderr, "");
    const evidence = JSON.parse(error.stdout);
    assert.equal(evidence.ownedJobCleanup, "pending-external-observation");
    assert.equal(evidence.recordsVerified, 12);
    assert.deepEqual(evidence.phases, ["fixture-cleanup-completed"]);
    return true;
  });
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

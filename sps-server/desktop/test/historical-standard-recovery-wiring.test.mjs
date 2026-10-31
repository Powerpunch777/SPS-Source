import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runnerUrl = new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url);
const wrapperUrl = new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url);
const workflowUrl = new URL("../../../.github/workflows/sps-installer-diagnostics.yml", import.meta.url);

test("historical standard recovery is hosted-only before helper compilation and child dispatch", async () => {
  const wrapper = await readFile(wrapperUrl, "utf8");
  const guard = wrapper.indexOf("if ($Mode -ceq 'historical-standard-recovery'");
  const compile = wrapper.indexOf("$phase = 'compile'");
  assert.ok(guard >= 0 && compile > guard);
  assert.match(wrapper, /ValidateSet\([^\n]*'historical-standard-recovery'/);

  const runner = await readFile(runnerUrl, "utf8");
  const mode = runner.indexOf('if (mode == "historical-standard-recovery")');
  const hostedGuard = runner.indexOf('Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted"', mode);
  const dispatch = runner.indexOf('return RunNode(node, directory, "smoke-historical-uninstaller-diagnostic.mjs", OwnedJobCleanupArgument);', mode);
  assert.ok(mode >= 0 && hostedGuard > mode && dispatch > hostedGuard);
  assert.match(runner, /Environment\.SetEnvironmentVariable\("SPS_INSTALLER_DIAGNOSTIC_RECOVERY", "standard-uninstall"\)/);
  assert.doesNotMatch(runner.slice(runner.indexOf("static IntPtr EnvironmentBlock()"), runner.indexOf("static int RunNode(")), /SPS_INSTALLER_DIAGNOSTIC_RECOVERY/);
});

test("recovery retains the eight-minute owned observation and cleanup path", async () => {
  const runner = await readFile(runnerUrl, "utf8");
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery" \? 8u \* 60u \* 1000u/);
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery" \|\| mode == "probe-installer-command-exit"\s*\? WaitWithOwnedCommandObservations/);
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery" \|\| mode == "probe-timeout"/);
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery" \|\| mode == "probe-installer-dialog"/);
  assert.match(runner, /value == "historical-uninstaller-compact-control" \|\| value == "historical-standard-recovery" \|\| value == "probe-installer-command-exit"/);
});

test("diagnostic workflow adds a bounded recovery-only job without build or artifact publication", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const start = workflow.indexOf("  historical-standard-recovery:");
  const end = workflow.indexOf("\n  owned-command-classification:", start);
  const job = workflow.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(job, /timeout-minutes: 10/);
  assert.match(job, /run-windows-ci-e2e\.ps1 -Mode historical-standard-recovery/);
  assert.doesNotMatch(job, /artifact|electron-builder|npm (?:install|ci)|sync:|real.?profile/i);
});

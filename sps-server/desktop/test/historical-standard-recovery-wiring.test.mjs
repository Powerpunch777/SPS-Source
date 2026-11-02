import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { load } from "js-yaml";

const runnerUrl = new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url);
const wrapperUrl = new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url);
const workflowUrl = new URL("../../../.github/workflows/sps-installer-diagnostics.yml", import.meta.url);

test("both recovery stages are hosted-only before helper compilation and child dispatch", async () => {
  const wrapper = await readFile(wrapperUrl, "utf8");
  const guard = wrapper.indexOf("if (($Mode -ceq 'historical-standard-recovery-prepare'");
  const compile = wrapper.indexOf("$phase = 'compile'");
  assert.ok(guard >= 0 && compile > guard);
  assert.match(wrapper, /historical-standard-recovery-prepare'[^\n]*'historical-standard-recovery'/);
  assert.match(wrapper, /ValidateSet\([^\n]*'historical-standard-recovery'/);

  const runner = await readFile(runnerUrl, "utf8");
  assert.match(runner, /value == "historical-standard-recovery-prepare" \|\| value == "historical-standard-recovery"/);
  assert.match(runner, /static bool OwnedJobGateMode\(string value\)[\s\S]*?value == "historical-standard-recovery-prepare" \|\| value == "historical-standard-recovery"/);
  const mode = runner.indexOf('if (mode == "historical-standard-recovery-prepare" || mode == "historical-standard-recovery")');
  const hostedGuard = runner.indexOf('Environment.GetEnvironmentVariable("RUNNER_ENVIRONMENT") != "github-hosted"', mode);
  const flag = runner.indexOf('Environment.SetEnvironmentVariable("SPS_INSTALLER_DIAGNOSTIC_RECOVERY",', mode);
  const dispatch = runner.indexOf('return RunNode(node, directory, "smoke-historical-uninstaller-diagnostic.mjs", OwnedJobCleanupArgument);', mode);
  assert.ok(mode >= 0 && hostedGuard > mode && flag > hostedGuard && dispatch > flag);
  assert.match(runner, /mode == "historical-standard-recovery-prepare" \? "standard-uninstall-prepare" : "standard-uninstall-complete"/);
  assert.doesNotMatch(wrapper, /SPS_INSTALLER_DIAGNOSTIC_RECOVERY/);
  assert.doesNotMatch(runner.slice(runner.indexOf("static IntPtr EnvironmentBlock()"), runner.indexOf("static int RunNode(")), /SPS_INSTALLER_DIAGNOSTIC_RECOVERY/);
});

test("each recovery stage retains its own eight-minute owned observation and cleanup path", async () => {
  const runner = await readFile(runnerUrl, "utf8");
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery-prepare" \|\| mode == "historical-standard-recovery" \? 8u \* 60u \* 1000u/);
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery-prepare" \|\| mode == "historical-standard-recovery" \|\| mode == "probe-installer-command-exit"\s*\? WaitWithOwnedCommandObservations/);
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery-prepare" \|\| mode == "historical-standard-recovery" \|\| mode == "probe-timeout"/);
  assert.match(runner, /mode == "historical-uninstaller-compact-control" \|\| mode == "historical-standard-recovery-prepare" \|\| mode == "historical-standard-recovery" \|\| mode == "probe-installer-dialog"/);
  assert.match(runner, /value == "historical-uninstaller-compact-control" \|\| value == "historical-standard-recovery-prepare" \|\| value == "historical-standard-recovery" \|\| value == "probe-installer-command-exit"/);
});

test("workflow preserves only the bounded private package inventory between the unchanged recovery stages", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const start = workflow.indexOf("  historical-standard-recovery:");
  const end = workflow.indexOf("\n  owned-command-classification:", start);
  const job = workflow.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(job, /timeout-minutes: 20/);
  assert.match(job, /node-version: 22/);
  const prepare = job.indexOf("run: .\\scripts\\run-windows-ci-e2e.ps1 -Mode historical-standard-recovery-prepare");
  const complete = job.indexOf("run: .\\scripts\\run-windows-ci-e2e.ps1 -Mode historical-standard-recovery", prepare + 1);
  assert.ok(prepare >= 0 && complete > prepare);
  assert.equal((job.match(/timeout-minutes: 10/g) ?? []).length, 2);
  const parsed = load(workflow).jobs["historical-standard-recovery"];
  assert.equal(parsed.steps.length, 5);
  const upload = parsed.steps[3];
  assert.equal(parsed.steps[2].run, ".\\scripts\\run-windows-ci-e2e.ps1 -Mode historical-standard-recovery-prepare");
  assert.equal(parsed.steps[4].run, ".\\scripts\\run-windows-ci-e2e.ps1 -Mode historical-standard-recovery");
  assert.equal(upload.uses, "actions/upload-artifact@v4");
  assert.deepEqual(upload.with, {
    name: "sps-legacy-program-inventory-${{ github.run_id }}-${{ github.run_attempt }}",
    path: "sps-server/desktop/dist/sps-legacy-program-inventory-0.4.86.json",
    "if-no-files-found": "error", "retention-days": 2,
  });
  assert.ok(parsed.steps.every(step => step.if === undefined && step["continue-on-error"] === undefined));
  const otherSteps = parsed.steps.filter(step => step !== upload);
  assert.doesNotMatch(JSON.stringify(otherSteps), /retry|artifact|electron-builder|npm (?:install|ci)|sync:|real.?profile/i);
  const stages = await readFile(new URL("../scripts/historical-standard-recovery-stages.mjs", import.meta.url), "utf8");
  const installed = stages.indexOf("await run(nsisInvocation(staged.path, installation))");
  const verified = stages.indexOf("await verifyOld()", installed);
  const inventory = stages.indexOf("encodeLegacyProgramInventory(await captureInstallerSnapshot(installation))", verified);
  const checkpoint = stages.indexOf('await writeFile(checkpointPath, encoded, { flag: "wx"', inventory);
  assert.ok(installed >= 0 && verified > installed && inventory > verified && checkpoint > inventory);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { dump, load } from "js-yaml";

const workflowPath = fileURLToPath(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url));
const desktopPath = new URL("../", import.meta.url);

const recoveryGates = [
  ["historical-standard-recovery-prepare", 10],
  ["installer-operator-upgrade", 20],
  ["historical-standard-recovery", 10],
  ["installer-operator-reinstall", 10],
];

function validateWorkflow(source) {
  const workflow = load(source);
  const desktopJob = workflow.jobs.desktop;
  const recoveryJob = workflow.jobs["legacy-installer-recovery"];
  const uploadSteps = desktopJob.steps.filter((step) => step.uses === "actions/upload-artifact@v4");
  assert.equal(uploadSteps.length, 1, "desktop must upload exactly one installer input artifact");
  const uploadStep = uploadSteps[0];

  assert.equal(uploadStep.with.name, "sps-installer-input-${{ github.run_id }}-${{ github.run_attempt }}");
  assert.deepEqual(uploadStep.with.path.trim().split(/\r?\n/), [
    "sps-server/desktop/dist/SPS-Desktop-Setup-*.exe",
    "sps-server/desktop/dist/win-unpacked/**",
    "sps-server/desktop/.owner-host-runtime/sps-release-baseline.json",
  ]);
  assert.equal(uploadStep.with["include-hidden-files"], true);
  assert.equal(uploadStep.with["if-no-files-found"], "error");
  assert.equal(uploadStep.with["retention-days"], 2);

  const currentGateIndex = desktopJob.steps.findIndex((step) => step.run?.includes("-Mode installer-current-preservation"));
  assert.ok(currentGateIndex >= 0, "current installer preservation gate must remain explicit");
  assert.ok(desktopJob.steps.indexOf(uploadStep) < currentGateIndex, "upload inputs before the current installer gate can fail");

  assert.equal(recoveryJob.needs, "desktop");
  assert.equal(recoveryJob.if, "${{ !cancelled() }}");
  assert.equal(recoveryJob["runs-on"], "windows-latest");
  assert.equal(recoveryJob["timeout-minutes"], 55);
  assert.equal(recoveryJob.strategy, undefined, "recovery gates must not be hidden behind a matrix");
  assert.equal(recoveryJob["continue-on-error"], undefined);

  const checkout = recoveryJob.steps.find((step) => step.uses === "actions/checkout@v5");
  assert.ok(checkout);
  assert.equal(checkout.with.submodules, "recursive");
  assert.equal(checkout.with.token, "${{ secrets.SPS_SOURCE_READ_TOKEN || github.token }}");
  const setupNode = recoveryJob.steps.find((step) => step.uses === "actions/setup-node@v6");
  assert.ok(setupNode);
  assert.equal(setupNode.with["node-version"], 22);

  const download = recoveryJob.steps.find((step) => step.uses === "actions/download-artifact@v5");
  assert.ok(download);
  assert.equal(download.with.name, uploadStep.with.name);
  assert.equal(download.with.path, "sps-server/desktop");
  const installIndex = recoveryJob.steps.findIndex((step) => step.run === "npm ci");
  const syncIndex = recoveryJob.steps.findIndex((step) => step.run === "npm run sync:desktop-node");
  assert.ok(installIndex > recoveryJob.steps.indexOf(download), "dependencies install after artifact download");
  assert.ok(syncIndex > installIndex, "Desktop Node sync follows dependency installation");

  const gates = recoveryJob.steps.filter((step) => step.run?.includes("run-windows-ci-e2e.ps1 -Mode"));
  assert.deepEqual(gates.map((step) => step.run), recoveryGates.map(([mode]) =>
    `.\\scripts\\run-windows-ci-e2e.ps1 -Mode ${mode}`,
  ));
  assert.ok(recoveryJob.steps.indexOf(gates[0]) > syncIndex, "the first mutation follows dependency and runtime preparation");
  for (const [index, [mode, timeout]] of recoveryGates.entries()) {
    const gate = gates[index];
    assert.equal(gate["timeout-minutes"], timeout, `${mode} timeout`);
    assert.equal(gate.shell, "powershell", `${mode} shell`);
    assert.equal(gate["working-directory"], "sps-server/desktop", `${mode} working directory`);
    assert.equal(gate.if, undefined, `${mode} must not be skippable`);
    assert.equal(gate["continue-on-error"], undefined, `${mode} must be mandatory`);
    assert.doesNotMatch(gate.run, /retry/i, `${mode} must not retry`);
  }
  assert.ok(recoveryJob.steps.every((step) => step["continue-on-error"] === undefined));
  assert.ok(recoveryJob.steps.every((step) => step.if === undefined));
  for (const scope of [recoveryJob, ...recoveryJob.steps]) {
    for (const name of ["SPS_INSTALLER_VALIDATION_KIND", "SPS_INSTALLER_DIAGNOSTIC_RECOVERY"]) {
      assert.equal(Object.hasOwn(scope.env ?? {}, name), false, "only native fixed dispatch may set installer mode flags");
    }
  }
}

test("mandatory installer recovery workflow contract is newline-independent and rejects regressions", async () => {
  const source = await readFile(workflowPath, "utf8");
  validateWorkflow(source.replace(/\r?\n/g, "\n"));
  validateWorkflow(source.replace(/\r?\n/g, "\r\n"));

  const parsed = load(source);
  const rejects = (mutate) => {
    const changed = structuredClone(parsed);
    mutate(changed);
    assert.throws(() => validateWorkflow(dump(changed)));
  };
  rejects((workflow) => {
    workflow.jobs["legacy-installer-recovery"].steps = workflow.jobs["legacy-installer-recovery"].steps.filter(
      (step) => !step.run?.includes("-Mode installer-operator-upgrade"),
    );
  });
  rejects((workflow) => {
    const gates = workflow.jobs["legacy-installer-recovery"].steps.filter((step) =>
      step.run?.includes("run-windows-ci-e2e.ps1 -Mode"),
    );
    [gates[0].run, gates[1].run] = [gates[1].run, gates[0].run];
  });
  rejects((workflow) => {
    const gate = workflow.jobs["legacy-installer-recovery"].steps.find((step) =>
      step.run?.includes("-Mode installer-operator-upgrade"),
    );
    gate["timeout-minutes"] = 19;
  });
  rejects((workflow) => {
    const upload = workflow.jobs.desktop.steps.find((step) => step.uses === "actions/upload-artifact@v4");
    upload.with.path = ".";
  });
  rejects((workflow) => {
    workflow.jobs["legacy-installer-recovery"].env = { SPS_INSTALLER_VALIDATION_KIND: "current" };
  });
  rejects((workflow) => {
    workflow.jobs["legacy-installer-recovery"].steps.at(-1).if = "${{ always() }}";
  });
});

test("fixed installer modes set scoped flags and preserve default full/current and historical behavior", async () => {
  const [runner, wrapper] = await Promise.all([
    readFile(new URL("scripts/windows-e2e/RestrictedE2eRunner.cs", desktopPath), "utf8"),
    readFile(new URL("scripts/run-windows-ci-e2e.ps1", desktopPath), "utf8"),
  ]);

  for (const mode of ["installer-current-preservation", "installer-operator-upgrade", "installer-operator-reinstall"]) {
    assert.match(runner, new RegExp(`value == "${mode}"`));
    assert.match(wrapper, new RegExp(`'${mode}'`));
  }
  assert.match(runner, /Environment\.SetEnvironmentVariable\("SPS_INSTALLER_VALIDATION_KIND", "current"\)/);
  assert.match(runner, /Environment\.SetEnvironmentVariable\("SPS_INSTALLER_DIAGNOSTIC_RECOVERY",\s*mode == "installer-operator-upgrade" \? "operator-upgrade" : "operator-reinstall"\)/);
  assert.match(runner, /return RunNode\(node, directory, "smoke-installer-data-preservation\.mjs", OwnedJobCleanupArgument\);/);
  assert.match(runner, /return RunNode\(node, directory, "smoke-historical-uninstaller-diagnostic\.mjs", OwnedJobCleanupArgument\);/);
  assert.match(runner, /mode == "installer-operator-reinstall" \? 8u \* 60u \* 1000u/);
  assert.match(runner, /installer-operator-upgrade" \|\| mode == "installer-operator-reinstall"/);
  assert.doesNotMatch(runner.slice(runner.indexOf("static IntPtr EnvironmentBlock()"), runner.indexOf("static int RunNode(")), /SPS_INSTALLER_(?:VALIDATION_KIND|DIAGNOSTIC_RECOVERY)/);

  assert.match(wrapper, /if \(\(\$Mode -ceq 'installer-current-preservation' -or \$Mode -ceq 'installer-operator-upgrade' -or \$Mode -ceq 'installer-operator-reinstall'\)[\s\S]*?RUNNER_ENVIRONMENT -cne 'github-hosted'/);
  const guard = wrapper.indexOf("Installer preservation and recovery E2Es require a GitHub-hosted runner.");
  assert.ok(guard >= 0 && wrapper.indexOf("$phase = 'compile'") > guard);
  assert.match(runner, /value == "installer-data-preservation"/);
  assert.match(runner, /mode == "installer-data-preservation"\)[\s\S]*?smoke-installer-data-preservation\.mjs/);
  assert.match(runner, /mode == "historical-standard-recovery-prepare" \? "standard-uninstall-prepare" : "standard-uninstall-complete"/);
});

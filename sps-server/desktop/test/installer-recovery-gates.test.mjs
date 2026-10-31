import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workflowPath = fileURLToPath(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url));
const desktopPath = new URL("../", import.meta.url);

test("mandatory installer recovery job consumes only this attempt's private installer artifact in order", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const desktopJob = workflow.slice(workflow.indexOf("  desktop:"), workflow.indexOf("  legacy-installer-recovery:"));
  const recoveryJob = workflow.slice(workflow.indexOf("  legacy-installer-recovery:"));

  assert.match(desktopJob, /uses: actions\/upload-artifact@v4[\s\S]*?name: sps-installer-input-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  const uploadIndex = desktopJob.indexOf("uses: actions/upload-artifact@v4");
  const currentIndex = desktopJob.indexOf("-Mode installer-current-preservation");
  assert.ok(uploadIndex > 0 && currentIndex > uploadIndex, "upload inputs before the current installer gate can fail");
  assert.match(desktopJob, /path:[\s\S]*?sps-server\/desktop\/dist\/SPS-Desktop-Setup-\*\.exe[\s\S]*?sps-server\/desktop\/dist\/win-unpacked\/\*\*[\s\S]*?sps-server\/desktop\/\.owner-host-runtime\/sps-release-baseline\.json/);
  assert.match(desktopJob, /include-hidden-files: true[\s\S]*?if-no-files-found: error[\s\S]*?retention-days: 2/);
  assert.doesNotMatch(desktopJob, /actions\/upload-artifact@v4[\s\S]*?path:[\s\S]*?(?:^|\n)\s*\.\s*$/m);

  assert.match(recoveryJob, /needs: desktop/);
  assert.match(recoveryJob, /if: \$\{\{ !cancelled\(\) \}\}/);
  assert.match(recoveryJob, /timeout-minutes: 55/);
  assert.match(recoveryJob, /uses: actions\/checkout@v5[\s\S]*?submodules: recursive[\s\S]*?token: \$\{\{ secrets\.SPS_SOURCE_READ_TOKEN \|\| github\.token \}\}/);
  assert.match(recoveryJob, /uses: actions\/setup-node@v6[\s\S]*?node-version: 22/);
  assert.match(recoveryJob, /uses: actions\/download-artifact@v5[\s\S]*?name: sps-installer-input-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}[\s\S]*?path: sps-server\/desktop/);
  assert.match(recoveryJob, /npm ci[\s\S]*?npm run sync:desktop-node/);

  const gates = [
    ["historical-standard-recovery-prepare", 10],
    ["installer-operator-upgrade", 20],
    ["historical-standard-recovery", 10],
    ["installer-operator-reinstall", 10],
  ];
  let previous = -1;
  for (const [mode, timeout] of gates) {
    const position = recoveryJob.indexOf(`-Mode ${mode}\n`);
    assert.ok(position > previous, `${mode} must follow the preceding mandatory gate`);
    previous = position;
    const stepStart = recoveryJob.lastIndexOf("      - name:", position);
    const stepEnd = recoveryJob.indexOf("\n      - name:", position);
    const block = recoveryJob.slice(stepStart, stepEnd < 0 ? undefined : stepEnd);
    assert.match(block, new RegExp(`timeout-minutes: ${timeout}`));
    assert.match(block, /shell: powershell/);
    assert.match(block, /working-directory: sps-server\/desktop/);
    assert.doesNotMatch(block, /\n\s+if:|continue-on-error:|retry/i);
  }
  assert.doesNotMatch(recoveryJob, /continue-on-error:|if:\s*always\(\)|if:\s*\$\{\{\s*success\(\)\s*\}\}/);
  assert.doesNotMatch(recoveryJob, /SPS_INSTALLER_(?:VALIDATION_KIND|DIAGNOSTIC_RECOVERY)\s*:/);
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

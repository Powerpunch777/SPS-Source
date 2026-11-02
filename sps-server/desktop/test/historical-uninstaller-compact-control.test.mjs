import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const diagnosticUrl = new URL("../scripts/smoke-historical-uninstaller-diagnostic.mjs", import.meta.url);
const runnerUrl = new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url);
const nativeRunnerUrl = new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url);
const workflowUrl = new URL("../../../.github/workflows/sps-installer-diagnostics.yml", import.meta.url);

test("compact control is a fixed hosted-only workflow mode without changing the baseline job", async () => {
  const [workflow, wrapper, nativeRunner] = await Promise.all([
    readFile(workflowUrl, "utf8"), readFile(runnerUrl, "utf8"), readFile(nativeRunnerUrl, "utf8"),
  ]);
  const baselineStart = workflow.indexOf("  historical-uninstaller:");
  const compactStart = workflow.indexOf("  historical-compact-control:");
  const nextJob = workflow.indexOf("\n  owned-command-classification:", compactStart);
  assert.ok(baselineStart >= 0 && compactStart > baselineStart && nextJob > compactStart);
  const baselineJob = workflow.slice(baselineStart, compactStart);
  const compactJob = workflow.slice(compactStart, nextJob);
  assert.match(baselineJob, /-Mode historical-uninstaller-diagnostic/);
  assert.doesNotMatch(baselineJob, /compact-control|SPS_INSTALLER_DIAGNOSTIC_PATH_VARIANT/);
  assert.match(compactJob, /-Mode historical-uninstaller-compact-control/);
  assert.doesNotMatch(compactJob, /(?:-Path|--path|fixture|installation)=/i);

  assert.match(wrapper, /'historical-uninstaller-compact-control'/);
  assert.match(wrapper, /historical-uninstaller-compact-control[\s\S]*?RUNNER_ENVIRONMENT -cne 'github-hosted'/);
  assert.match(nativeRunner, /historical-uninstaller-compact-control/);
  assert.match(nativeRunner, /Environment\.SetEnvironmentVariable\("SPS_INSTALLER_DIAGNOSTIC_PATH_VARIANT", "compact-control"\)/);
  assert.match(nativeRunner, /static bool OwnedJobGateMode\(string value\)[\s\S]*?historical-uninstaller-compact-control/);
  assert.match(nativeRunner, /historical-uninstaller-compact-control[\s\S]*?8u \* 60u \* 1000u/);
  assert.match(nativeRunner, /historical-uninstaller-diagnostic[\s\S]*?8u \* 60u \* 1000u/);
  assert.match(nativeRunner, /historical-uninstaller-compact-control[\s\S]*?WaitWithOwnedCommandObservations/);
  assert.match(nativeRunner, /historical-uninstaller-compact-control[\s\S]*?github-hosted/);
  assert.match(nativeRunner, /: 18u \* 60u \* 1000u;/);
});

test("native diagnostic accepts only the fixed compact variant after the hosted guard", async () => {
  const source = await readFile(diagnosticUrl, "utf8");
  const hostedGuard = source.indexOf("assertHostedInstallerCi();");
  const variantRead = source.indexOf("process.env.SPS_INSTALLER_DIAGNOSTIC_PATH_VARIANT");
  const appDataRead = source.indexOf("process.env.APPDATA");
  const originalFixture = source.indexOf('"sps-installer-data-uninstaller-diagnostic-"');
  const compactFixture = source.indexOf('"sps-installer-data-"');
  assert.ok(hostedGuard >= 0 && variantRead > hostedGuard && appDataRead > variantRead);
  assert.match(source, /pathVariant === undefined \|\| pathVariant === "compact-control"/);
  assert.ok(originalFixture > appDataRead && compactFixture > appDataRead);
  assert.match(source, /compactControl\s*\?\s*await mkdtemp\(path\.join\(temporaryRoot, "sps-installer-data-"\)\)\s*:\s*await mkdtemp\(path\.join\(temporaryRoot, "sps-installer-data-uninstaller-diagnostic-"\)\)/);
  assert.match(source, /compactControl\s*\?\s*"SPS"\s*:\s*"SPS Desktop"/);

  const install = source.indexOf("const installInvocation = nsisInvocation(historicalInstaller, installation)");
  const registrationCheck = source.indexOf("const installed = await registrations()", install);
  const census = source.indexOf("const preUninstallCensus = await collectInstallerPathCensus(installation)", registrationCheck);
  const uninstallerCopy = source.indexOf("await copyFile(path.join(installation, \"Uninstall SPS Desktop.exe\")", census);
  const uninstallSpawn = source.indexOf("spawn(invocation.executable, invocation.args", uninstallerCopy);
  assert.ok(install >= 0 && registrationCheck > install && census > registrationCheck
    && uninstallerCopy > census && uninstallSpawn > uninstallerCopy);
  assert.match(source, /HISTORICAL_INSTALLER_BASELINE\.version/);
  assert.match(source, /args: \["\/S", "\/KEEP_APP_DATA", "\/currentuser", "--updated", baseInvocation\.args\.at\(-1\)\]/);
  assert.match(source, /assert\.equal\(preUninstallCensus\.complete, true/);
  assert.match(source, /assert\.equal\(preUninstallCensus\.over259Paths, 0/);
  assert.match(source, /candidateUpgradeQualified: false, previousStableUpgradeQualified: false/);
  assert.match(source, /longPathQualified: false/);
});

test("compact mode still fails first in a real non-hosted Node invocation", async () => {
  const source = await readFile(diagnosticUrl, "utf8");
  const hostedGuard = source.indexOf("assertHostedInstallerCi();");
  const variantRead = source.indexOf("process.env.SPS_INSTALLER_DIAGNOSTIC_PATH_VARIANT");
  assert.ok(hostedGuard >= 0 && variantRead > hostedGuard);

  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(diagnosticUrl)], {
    env: {
      ...process.env,
      GITHUB_ACTIONS: "false",
      RUNNER_OS: "",
      RUNNER_ENVIRONMENT: "",
      SPS_INSTALLER_DIAGNOSTIC_PATH_VARIANT: "compact-control",
    },
    timeout: 10000,
    maxBuffer: 32768,
  }), failure => {
    assert.equal(failure.code, 1);
    assert.match(failure.stderr, /Installer data preservation requires the owned GitHub-hosted Windows CI launcher/);
    assert.doesNotMatch(failure.stderr, /Unknown historical diagnostic path variant|does not provide an export|ERR_MODULE_NOT_FOUND/);
    assert.equal(failure.stdout, "");
    return true;
  });
});

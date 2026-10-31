import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("historical NSIS upgrade is exercised before candidate repair and never launches the withdrawn app", async () => {
  const source = await readFile(new URL("../scripts/smoke-installer-data-preservation.mjs", import.meta.url), "utf8");
  const guard = source.indexOf("assertHostedInstallerCi();");
  const profileRead = source.indexOf("const appData =");
  const emptyRegistry = source.indexOf('assert.deepEqual(await registryInstallations(), []');
  const stage = source.indexOf("await stageHistoricalInstaller(fixture)");
  const sentinelWrite = source.indexOf("await writeFile(file, bytes");
  const freshInstall = source.indexOf("await runNsis(installer)", sentinelWrite);
  const firstFrame = source.indexOf("await checkInstalledFirstFrame()", freshInstall);
  const uninstall = source.indexOf('await uninstallOwnedCandidate("owned-uninstaller-before-historical.exe")', firstFrame);
  const oldInstall = source.indexOf("await runNsis(historicalInstaller)");
  const oldCheck = source.indexOf("await checkHistoricalInstallation()", oldInstall);
  const newInstall = source.indexOf("await runNsis(installer)", oldCheck);
  const newCheck = source.indexOf("await checkInstalledPackage()", newInstall);
  const launch = source.indexOf("await checkInstalledFirstFrame()", newCheck);
  const repair = source.indexOf('phase = "in-place-reinstall"', launch);
  assert.ok(guard >= 0 && profileRead > guard && emptyRegistry > profileRead && stage > emptyRegistry);
  assert.ok(sentinelWrite > stage && freshInstall > sentinelWrite && firstFrame > freshInstall && uninstall > firstFrame);
  assert.ok(oldInstall > uninstall && oldCheck > oldInstall);
  assert.ok(newInstall > oldCheck && newCheck > newInstall && launch > newCheck && repair > launch);
  assert.doesNotMatch(source.slice(oldInstall, newInstall), /electron\.launch|checkInstalledFirstFrame/);
  assert.match(source, /historicalInstallerUpgradeQualified: true/);
  for (const field of ["previousStableUpgradeQualified", "applicationDataMigrationQualified", "normalUserProfileStartupQualified", "signedInstallerQualified"]) {
    assert.match(source, new RegExp(`${field}: false`));
  }
  assert.match(source, /applicationLaunched: false/);
  assert.match(source, /assert\.notEqual\(await hashFile\(path\.join\(installation, "resources\/app\.asar"\)\), expected\.get\("resources\/app\.asar"\)/);
  assert.match(source, /process\.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
});

test("installer diagnostics identify blocking boundaries without printing fixture paths or weakening the hosted guard", async () => {
  const source = await readFile(new URL("../scripts/smoke-installer-data-preservation.mjs", import.meta.url), "utf8");
  const guard = source.indexOf("assertHostedInstallerCi();");
  const firstTrace = source.indexOf('traceInstallerStage("begin")');
  const firstProfileRead = source.indexOf("const appData =");
  assert.ok(guard >= 0 && firstTrace > guard && firstProfileRead > firstTrace);
  for (const [before, operation, after] of [
    ['traceInstallerStage("registry-query-start")', "await queryInstallerRegistrations()", 'traceInstallerStage("registry-query-done"'],
    ['traceInstallerStage("process-query-start")', 'await queryInstallerProcesses()', 'traceInstallerStage("process-query-done")'],
    ['traceInstallerStage("historical-download-start")', "await stageHistoricalInstaller(fixture)", 'traceInstallerStage("historical-download-verified")'],
    ['traceInstallerStage("isolated-first-frame-start")', "await exec(process.execPath", 'traceInstallerStage("isolated-first-frame-verified")'],
  ]) {
    const start = source.indexOf(before);
    const call = source.indexOf(operation, start);
    const finish = source.indexOf(after, call);
    assert.ok(start >= 0 && call > start && finish > call, operation);
  }
  const traceStart = source.indexOf("function traceInstallerStage(");
  const traceEnd = source.indexOf('\ntraceInstallerStage("begin")', traceStart);
  const trace = source.slice(traceStart, traceEnd);
  assert.match(trace, /installerPhase: phase, installerStage: stage/);
  assert.doesNotMatch(trace, /fixture|appData|process\.env|installation|executable|\.path/);
  assert.match(source, /traceInstallerStage\("nsis-close", \{ code, signal, elapsedMs: Date\.now\(\) - started \}\)/);
  assert.match(source, /assert\.equal\(signal, null\); assert\.equal\(code, 0, "NSIS operation failed\."\)/);
  assert.match(source, /assert\.equal\(result\.count, 0, "An SPS Desktop process is present; refusing installer mutation\."\)/);
  assert.doesNotMatch(source, /Get-CimInstance/);
});

test("current package replacement is independently measured before the withdrawn predecessor", async () => {
  const source = await readFile(new URL("../scripts/smoke-installer-data-preservation.mjs", import.meta.url), "utf8");
  const fresh = source.indexOf('phase = "fresh-install"');
  const replacement = source.indexOf('phase = "current-package-replacement"', fresh);
  const historical = source.indexOf('phase = "uninstall-before-historical-input"', replacement);
  assert.ok(fresh >= 0 && replacement > fresh && historical > replacement);
  const handoff = source.slice(replacement, historical);
  assert.match(handoff, /await runNsis\(installer\)/);
  assert.match(handoff, /await checkInstalledPackage\(\)/);
  assert.match(handoff, /await checkInstalledFirstFrame\(\)/);
  assert.match(handoff, /traceInstallerStage\("current-package-replacement-verified"\)/);
  assert.doesNotMatch(handoff, /uninstallOwnedCandidate|copyFile|rm\(|--updated|catch/);
  assert.match(source, /currentPackageReplacementQualified: true/);
  assert.match(source, /historicalInstallerUpgradeQualified: true/);
});

test("failed automatic replacement requires complete historical bytes and user data, then still fails", async () => {
  const source = await readFile(new URL("../scripts/smoke-installer-data-preservation.mjs", import.meta.url), "utf8");
  const oldCheck = source.indexOf("await checkHistoricalInstallation();");
  const snapshot = source.indexOf("await captureInstallerSnapshot(installation)", oldCheck);
  const upgrade = source.indexOf('phase = "historical-version-upgrade"', snapshot);
  const catchStart = source.indexOf("} catch (error) {", upgrade);
  const rethrow = source.indexOf("throw error;", catchStart);
  assert.ok(oldCheck >= 0 && snapshot > oldCheck && upgrade > snapshot && catchStart > upgrade && rethrow > catchStart);
  const failed = source.slice(catchStart, rethrow);
  assert.match(failed, /await assertNoDesktopProcess\(\)/);
  assert.match(failed, /await checkRetainedData\(\)/);
  assert.match(failed, /await checkHistoricalInstallation\(\)/);
  assert.match(failed, /await assertInstallerSnapshot\(installation, historicalSnapshot\)/);
  assert.match(failed, /automaticUpgradeQualified: false, operatorRecoveryStarted: false/);
  assert.doesNotMatch(failed, /uninstallOwnedCandidate|runNsis\(|rm\(|writeFile\(|copyFile\(/);
});

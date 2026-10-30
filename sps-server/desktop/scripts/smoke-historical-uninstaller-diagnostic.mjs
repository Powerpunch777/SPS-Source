import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { lstat, mkdir, mkdtemp, copyFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertHostedInstallerCi, assertPlainDirectory, assertContained, nsisInvocation } from "./installer-ci-safety.mjs";
import { queryInstallerRegistrations } from "./installer-registry-query.mjs";
import { queryInstallerProcesses } from "./installer-process-query.mjs";
import { OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";
import { HISTORICAL_INSTALLER_BASELINE, stageHistoricalInstaller } from "./historical-installer-baseline.mjs";

assertHostedInstallerCi();

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(desktop, "package.json"), "utf8"));
assert.equal(manifest.build.productName, "SPS Desktop");
assert.equal(manifest.name, "@sps/desktop");

let phase = "prerequisites";
function trace(stage, detail = {}) {
  console.log(JSON.stringify({ diagnosticStage: stage, ...detail }));
}
async function missing(file) {
  try {
    await lstat(file);
    return false;
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }
}
async function assertNoSpsProcess() {
  trace("process-query-start");
  const result = await queryInstallerProcesses();
  assert.equal(result.count, 0);
  trace("process-query-done");
}
async function registrations() {
  trace("registry-query-start");
  const result = await queryInstallerRegistrations();
  trace("registry-query-done");
  return result;
}

try {
  assert.deepEqual(await registrations(), []);
  await assertNoSpsProcess();

  const appData = await assertPlainDirectory(process.env.APPDATA);
  const dataAliases = [...new Set([
    path.join(appData, manifest.name.replaceAll("/", "")),
    path.join(appData, manifest.build.productName),
    path.join(appData, manifest.name),
  ])];
  assert.equal(dataAliases.length, 3);
  for (const alias of dataAliases) {
    assertContained(appData, alias);
    assert.equal(await missing(alias), true);
    try {
      await assertPlainDirectory(path.dirname(alias));
    } catch (error) {
      if (error.code !== "ENOENT" || path.dirname(path.dirname(alias)) !== appData
        || !await missing(path.dirname(alias))) throw error;
    }
  }

  phase = "fixture-create";
  const temporaryRoot = await assertPlainDirectory(os.tmpdir());
  const fixture = await mkdtemp(path.join(temporaryRoot, "sps-installer-data-uninstaller-diagnostic-"));
  assertContained(temporaryRoot, fixture);
  const canonicalFixture = await assertPlainDirectory(fixture);
  assert.equal(canonicalFixture.toLowerCase(), path.resolve(fixture).toLowerCase());
  assert.equal(path.dirname(canonicalFixture).toLowerCase(), temporaryRoot.toLowerCase());
  const fixtureDetails = await lstat(fixture, { bigint: true });
  assert.equal(fixtureDetails.isDirectory() && !fixtureDetails.isSymbolicLink(), true);
  const fixtureIdentity = [fixtureDetails.dev, fixtureDetails.ino, fixtureDetails.birthtimeNs].join(":");
  async function verifyFixture() {
    assertContained(temporaryRoot, fixture);
    assert.equal(await assertPlainDirectory(fixture), canonicalFixture);
    const details = await lstat(fixture, { bigint: true });
    assert.equal(details.isDirectory() && !details.isSymbolicLink(), true);
    assert.equal([details.dev, details.ino, details.birthtimeNs].join(":"), fixtureIdentity);
  }

  const installation = path.join(fixture, "SPS Desktop");
  assertContained(fixture, installation);
  await verifyFixture();
  await mkdir(installation);

  phase = "historical-download";
  trace("historical-download-start");
  await verifyFixture();
  const { path: historicalInstaller } = await stageHistoricalInstaller(fixture);
  await verifyFixture();
  trace("historical-download-verified");

  phase = "historical-install";
  await verifyFixture();
  await assertPlainDirectory(installation);
  await assertNoSpsProcess();
  const installInvocation = nsisInvocation(historicalInstaller, installation);
  const installStarted = Date.now();
  trace("historical-install-start");
  const installChild = spawn(installInvocation.executable, installInvocation.args, {
    ...installInvocation.options, cwd: fixture, stdio: "ignore",
  });
  const installResult = await new Promise((resolve, reject) => {
    installChild.once("error", reject);
    installChild.once("close", (code, signal) => resolve({ code, signal, elapsedMs: Date.now() - installStarted }));
  });
  trace("historical-install-close", installResult);
  assert.equal(installResult.signal, null);
  assert.equal(installResult.code, 0);
  await assertNoSpsProcess();

  phase = "historical-install-check";
  await verifyFixture();
  await assertPlainDirectory(installation);
  const installed = await registrations();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].name, `SPS Desktop ${HISTORICAL_INSTALLER_BASELINE.version}`);
  assert.equal(installed[0].version, HISTORICAL_INSTALLER_BASELINE.version);
  assert.equal(installed[0].perUser, true);
  const expectedUninstall = `"${path.join(installation, "Uninstall SPS Desktop.exe")}" /currentuser`;
  assert.equal(installed[0].uninstall.toLowerCase(), expectedUninstall.toLowerCase());
  for (const relative of ["resources/app.asar", "Uninstall SPS Desktop.exe"]) {
    const file = path.join(installation, relative);
    assertContained(installation, file);
    const details = await lstat(file, { bigint: true });
    assert.equal(details.isFile() && !details.isSymbolicLink() && details.nlink === 1n && details.size > 0n, true);
  }

  phase = "historical-uninstall";
  const copiedUninstaller = path.join(fixture, "owned-historical-uninstaller.exe");
  assertContained(fixture, copiedUninstaller);
  await verifyFixture();
  await assertPlainDirectory(installation);
  await copyFile(path.join(installation, "Uninstall SPS Desktop.exe"), copiedUninstaller, fsConstants.COPYFILE_EXCL);
  const copiedDetails = await lstat(copiedUninstaller, { bigint: true });
  assert.equal(copiedDetails.isFile() && !copiedDetails.isSymbolicLink() && copiedDetails.nlink === 1n && copiedDetails.size > 0n, true);
  await assertNoSpsProcess();
  const baseInvocation = nsisInvocation(copiedUninstaller, installation, { uninstall: true });
  const invocation = {
    ...baseInvocation,
    args: ["/S", "/KEEP_APP_DATA", "/currentuser", "--updated", baseInvocation.args.at(-1)],
  };
  const uninstallStarted = Date.now();
  trace("historical-uninstall-start");
  const uninstallChild = spawn(invocation.executable, invocation.args, {
    ...invocation.options, cwd: fixture, stdio: "ignore",
  });
  const uninstallResult = await new Promise((resolve, reject) => {
    uninstallChild.once("error", reject);
    uninstallChild.once("close", (code, signal) => resolve({ code, signal, elapsedMs: Date.now() - uninstallStarted }));
  });
  trace("historical-uninstall-close", uninstallResult);
  assert.equal(uninstallResult.signal, null);
  assert.equal(uninstallResult.code, 0);

  phase = "post-uninstall-check";
  assert.deepEqual(await registrations(), []);
  assert.equal(await missing(path.join(installation, "resources/app.asar")), true);
  await assertNoSpsProcess();
  console.log(JSON.stringify({ diagnosticOnly: true, applicationLaunched: false,
    candidateUpgradeQualified: false, previousStableUpgradeQualified: false,
    historicalVersion: HISTORICAL_INSTALLER_BASELINE.version, cleanupQualification: "pending" }));
  process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;
} catch (error) {
  const errorType = error?.name === "AssertionError" ? "assertion" : "operation";
  console.error(JSON.stringify({ diagnosticOnly: true, failed: true, phase, errorType }));
  process.exitCode = 1;
}

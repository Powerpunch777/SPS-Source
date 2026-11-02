import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { assertHostedInstallerCi, assertPlainDirectory, assertContained, nsisInvocation } from "./installer-ci-safety.mjs";
import { queryInstallerRegistrations } from "./installer-registry-query.mjs";
import { queryInstallerProcesses } from "./installer-process-query.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";
import { HISTORICAL_INSTALLER_BASELINE, stageHistoricalInstaller } from "./historical-installer-baseline.mjs";
import { captureInstallerSnapshot, assertInstallerSnapshot } from "./installer-retained-snapshot.mjs";
import { parseHistoricalProfileProgress } from "./historical-profile-progress.mjs";

// Fail before even reading a profile, creating a fixture, or querying registry.
assertHostedInstallerCi();
const validationKind = process.env.SPS_INSTALLER_VALIDATION_KIND;
assert.ok(validationKind === undefined || validationKind === "current", "Unknown installer preservation validation kind.");
const currentOnly = validationKind === "current";
let phase = "prerequisites";
function traceInstallerStage(stage, detail = {}) {
  console.log(JSON.stringify({ installerPhase: phase, installerStage: stage, ...detail }));
}
traceInstallerStage("begin");
const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exec = promisify(execFile);
const manifest = JSON.parse(await readFile(path.join(desktop, "package.json"), "utf8"));
assert.equal(manifest.build.productName, "SPS Desktop");
assert.equal(manifest.name, "@sps/desktop");
assert.equal(manifest.build.nsis.perMachine, false);
assert.equal(manifest.build.nsis.deleteAppDataOnUninstall, false);
const appData = await assertPlainDirectory(process.env.APPDATA);
const sourceRuntime = path.join(desktop, ".owner-host-runtime");
const baseline = JSON.parse(await readFile(path.join(sourceRuntime, "sps-release-baseline.json"), "utf8"));
assert.equal(baseline.desktopVersion, manifest.version);
assert.equal(baseline.sourceDirty || baseline.core.dirty || baseline.pluginSdk.dirty, false);
const installer = path.join(desktop, "dist", `SPS-Desktop-Setup-${manifest.version}.exe`);
assert.equal((await lstat(installer)).isFile(), true);

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const data of createReadStream(file)) hash.update(data);
  return hash.digest("hex");
}
async function missing(file) {
  try { await lstat(file); return false; }
  catch (error) { if (error.code === "ENOENT") return true; throw error; }
}
async function registryInstallations() {
  traceInstallerStage("registry-query-start");
  const entries = await queryInstallerRegistrations();
  traceInstallerStage("registry-query-done", { registrations: entries.length });
  return entries;
}
async function assertNoDesktopProcess() {
  traceInstallerStage("process-query-start");
  const result = await queryInstallerProcesses();
  assert.equal(result.count, 0, "An SPS Desktop process is present; refusing installer mutation.");
  traceInstallerStage("process-query-done");
}
assert.deepEqual(await registryInstallations(), [], "Existing SPS registration must never be replaced by this fixture.");
await assertNoDesktopProcess();
// Preserve both installer deletion aliases and Electron's package-name profile.
// These directories must be absent before this clean hosted-VM test owns them.
const dataRoots = [...new Set([
  path.join(appData, manifest.name.replaceAll("/", "")), // NSIS APP_FILENAME (@spsdesktop).
  path.join(appData, manifest.build.productName), // APP_PRODUCT_FILENAME.
  path.join(appData, manifest.name), // APP_PACKAGE_NAME and Electron userData.
])];
for (const root of dataRoots) {
  assertContained(appData, root);
  assert.equal(await missing(root), true, "Existing SPS user data must not be reused or removed by this fixture.");
  await assertPlainDirectory(path.dirname(root)).catch(async error => {
    // Only the scoped package parent may be absent; never replace a linked or
    // existing invalid ancestor. APPDATA itself was already checked above.
    if (error.code !== "ENOENT" || path.dirname(path.dirname(root)) !== appData) throw error;
    assert.equal(await missing(path.dirname(root)), true);
    await mkdir(path.dirname(root));
    await assertPlainDirectory(path.dirname(root));
  });
}
const temporaryRoot = await assertPlainDirectory(os.tmpdir());
const fixture = await mkdtemp(path.join(temporaryRoot, "sps-installer-data-"));
assertContained(temporaryRoot, fixture);
await assertPlainDirectory(fixture);
const installation = path.join(fixture, "SPS Desktop");
assertContained(fixture, installation);
await mkdir(installation);
// This withdrawn, unsigned input is only a pinned historical compatibility
// fixture. Never launch its Main or treat it as an approved Stable baseline.
let historicalInstaller;
if (!currentOnly) {
  traceInstallerStage("historical-download-start");
  const stagedHistorical = await stageHistoricalInstaller(fixture);
  historicalInstaller = stagedHistorical.path;
  traceInstallerStage("historical-download-verified");
}
const sentinels = [];
for (const root of dataRoots) {
  await mkdir(root);
  await assertPlainDirectory(root);
  // Inert opaque bytes only: this checks preservation, not schema migration or
  // cryptographic validity of an actual user's state/Secret.
  for (const relative of ["sps-desktop-state.json", "workspaces/retained/data.bin", "secrets/retained-opaque-record.bin"]) {
    const file = path.join(root, relative);
    const bytes = randomBytes(128);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: "wx" });
    sentinels.push({ file, sha256: await hashFile(file) });
  }
}
async function checkRetainedData() {
  for (const item of sentinels) assert.equal(await hashFile(item.file), item.sha256, "Installer changed retained user data.");
}
async function runNsis(executable, uninstall = false) {
  await assertPlainDirectory(fixture);
  assertContained(fixture, installation);
  if (!await missing(installation)) await assertPlainDirectory(installation);
  await assertNoDesktopProcess();
  const invocation = nsisInvocation(executable, installation, { uninstall });
  const started = Date.now();
  traceInstallerStage("nsis-start", { operation: uninstall ? "uninstall" : "install", historical: executable === historicalInstaller });
  const child = spawn(invocation.executable, invocation.args, { ...invocation.options, cwd: fixture, stdio: "ignore" });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      traceInstallerStage("nsis-close", { code, signal, elapsedMs: Date.now() - started });
      try { assert.equal(signal, null); assert.equal(code, 0, "NSIS operation failed."); resolve(); }
      catch (error) { reject(error); }
    });
  });
  await assertNoDesktopProcess();
  await checkRetainedData();
  traceInstallerStage("retained-data-verified");
}
const artifacts = ["SPS Desktop.exe", "resources/app.asar", "resources/sps-windows-job-supervisor/SpsWindowsJobSupervisor.exe",
  "resources/sps-owner-host-runtime-package/sps-owner-host-runtime.tgz", "resources/sps-owner-host-runtime-package/sps-owner-host-runtime-package.json"];
const expected = new Map();
for (const relative of artifacts) expected.set(relative, await hashFile(path.join(desktop, "dist/win-unpacked", relative)));
async function checkInstalledPackage() {
  traceInstallerStage("candidate-package-check-start");
  await assertPlainDirectory(installation);
  const installed = await registryInstallations();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].name, `SPS Desktop ${manifest.version}`);
  assert.equal(installed[0].perUser, true);
  assert.equal(installed[0].version, manifest.version);
  // NSIS keeps InstallLocation in its separate app-guid key. The uninstall key
  // instead writes this exact quoted executable and fixed per-user argument.
  assert.equal(installed[0].uninstall.toLowerCase(), `"${path.join(installation, "Uninstall SPS Desktop.exe")}" /currentuser`.toLowerCase());
  for (const [relative, digest] of expected) assert.equal(await hashFile(path.join(installation, relative)), digest, "Installed package differs from the current verified unpacked input.");
  traceInstallerStage("candidate-package-verified");
}
async function checkHistoricalInstallation() {
  traceInstallerStage("historical-package-check-start");
  await assertPlainDirectory(installation);
  const installed = await registryInstallations();
  assert.equal(installed.length, 1);
  assert.equal(installed[0].name, `SPS Desktop ${HISTORICAL_INSTALLER_BASELINE.version}`);
  assert.equal(installed[0].version, HISTORICAL_INSTALLER_BASELINE.version);
  assert.equal(installed[0].perUser, true);
  assert.equal(installed[0].uninstall.toLowerCase(), `"${path.join(installation, "Uninstall SPS Desktop.exe")}" /currentuser`.toLowerCase());
  for (const relative of ["SPS Desktop.exe", "resources/app.asar", "Uninstall SPS Desktop.exe"]) {
    const details = await lstat(path.join(installation, relative));
    assert.equal(details.isFile() && !details.isSymbolicLink() && details.size > 0, true);
  }
  assert.notEqual(await hashFile(path.join(installation, "resources/app.asar")), expected.get("resources/app.asar"),
    "Historical installation must not already be the candidate package.");
  traceInstallerStage("historical-package-verified");
}
let installedFirstFrames = 0;
let historicalProfileMigration = null;
async function checkInstalledFirstFrame() {
  traceInstallerStage("isolated-first-frame-start");
  const { stdout } = await exec(process.execPath, [path.join(desktop, "scripts/smoke-isolated-desktop-ui.mjs")], {
    cwd: desktop, env: { ...process.env, SPS_DESKTOP_E2E_BINARY: path.join(installation, "SPS Desktop.exe") },
    windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024,
  });
  assert.match(stdout, /Isolated packaged SPS Desktop sign-in smoke test passed with confirmed owned Job cleanup/);
  await assertNoDesktopProcess();
  await checkRetainedData();
  installedFirstFrames += 1;
  traceInstallerStage("isolated-first-frame-verified");
}
async function checkInstalledHistoricalProfile() {
  traceInstallerStage("isolated-historical-profile-start");
  let pending;
  try {
    await exec(process.execPath, [path.join(desktop, "scripts/smoke-historical-managed-vault-desktop.mjs"), OWNED_JOB_CLEANUP_ARGUMENT], {
      cwd: desktop, env: { ...process.env, SPS_DESKTOP_E2E_SOURCE: "0", SPS_DESKTOP_E2E_BINARY: path.join(installation, "SPS Desktop.exe") },
      windowsHide: true, timeout: 300_000, maxBuffer: 1024 * 1024,
    });
    assert.fail("Installed historical profile must leave whole-Job qualification to its existing CI parent.");
  } catch (error) {
      for (const record of parseHistoricalProfileProgress(String(error.stderr ?? ""))) {
        console.error(JSON.stringify(record));
      }
    assert.equal(error.code, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE, "Installed historical profile did not reach its owned cleanup handoff.");
    assert.ok(!error.signal && !error.killed, "Timed out or killed migration cannot qualify.");
    pending = JSON.parse(error.stdout.trim());
  }
  assert.equal(pending.kind, "installed-historical-profile-in-place-acceptance");
  assert.equal(pending.installedHistoricalFixtureInPlaceMigrationQualified, true);
  assert.equal(pending.realDpapiCredentialsAndKeyPreserved, true);
  assert.equal(pending.restoreUsed, false);
  assert.equal(pending.ownedJobCleanup, "pending-external-observation");
  assert.deepEqual(pending.candidate.baseline, baseline);
  assert.deepEqual(pending.candidate.installedArtifacts, { executable: expected.get("SPS Desktop.exe"),
    appAsar: expected.get("resources/app.asar"), runtimeArchive: expected.get("resources/sps-owner-host-runtime-package/sps-owner-host-runtime.tgz") });
  for (const field of ["signedInstallerQualified", "normalUserProfileStartupQualified", "previousStableUpgradeQualified", "physicalTwoDeviceQualified"]) {
    assert.equal(pending[field], false);
  }
  await assertNoDesktopProcess();
  await checkRetainedData();
  await checkInstalledPackage();
  historicalProfileMigration = pending;
  traceInstallerStage("isolated-historical-profile-verified", { historicalMigrations: pending.historicalMigrations,
    currentMigrations: pending.currentMigrations, wholeJobQualification: "pending" });
}
async function uninstallOwnedCandidate(name) {
  const copiedUninstaller = path.join(fixture, name);
  await copyFile(path.join(installation, "Uninstall SPS Desktop.exe"), copiedUninstaller);
  await runNsis(copiedUninstaller, true);
  assert.deepEqual(await registryInstallations(), []);
  assert.equal(await missing(path.join(installation, "resources/app.asar")), true);
  assert.equal(await missing(installation), true, "An ordinary uninstall must remove the complete owned program directory.");
}
phase = "fresh-install";
traceInstallerStage("begin");
try {
  await runNsis(installer);
  await checkInstalledPackage();
  await checkInstalledFirstFrame();
  phase = "current-package-replacement";
  traceInstallerStage("begin");
  // Qualify the current uninstaller's update handoff independently of the
  // withdrawn predecessor, without removing the existing historical test.
  await runNsis(installer);
  await checkInstalledPackage();
  await checkInstalledFirstFrame();
  traceInstallerStage("current-package-replacement-verified");
  await checkInstalledHistoricalProfile();
  if (!currentOnly) {
    phase = "uninstall-before-historical-input";
    traceInstallerStage("begin");
    await uninstallOwnedCandidate("owned-uninstaller-before-historical.exe");
    phase = "historical-install";
    traceInstallerStage("begin");
    await runNsis(historicalInstaller);
    await checkHistoricalInstallation();
    const historicalSnapshot = await captureInstallerSnapshot(installation);
    phase = "historical-version-upgrade";
    traceInstallerStage("begin");
    try {
      await runNsis(installer);
    } catch (error) {
      // Preservation evidence never converts a failed replacement into success.
      await assertNoDesktopProcess();
      await checkRetainedData();
      await checkHistoricalInstallation();
      await assertInstallerSnapshot(installation, historicalSnapshot);
      traceInstallerStage("failed-replacement-preserved-historical-installation", {
        retainedRecords: sentinels.length, installationTreeSha256: historicalSnapshot.sha256,
        automaticUpgradeQualified: false, operatorRecoveryStarted: false,
      });
      throw error;
    }
    await checkInstalledPackage();
    await checkInstalledFirstFrame();
  }
  phase = "in-place-reinstall";
  traceInstallerStage("begin");
  // Prove this is a real replacement/repair, rather than a no-op whose files
  // happened to match from the first installation. This file is fixture-owned.
  await writeFile(path.join(installation, "resources/app.asar"), "SPS installer repair fixture: deliberately invalid ASAR\n");
  assert.notEqual(await hashFile(path.join(installation, "resources/app.asar")), expected.get("resources/app.asar"));
  await runNsis(installer);
  await checkInstalledPackage();
  phase = "uninstall-preserve-data";
  traceInstallerStage("begin");
  // Mirror electron-builder's own waited uninstaller: copy outside INSTDIR and
  // pass unquoted _?=last. Do not use --updated/KEEP_APP_DATA/delete-data flags;
  // default uninstall policy itself must preserve the fixture's user records.
  await uninstallOwnedCandidate("owned-uninstaller-preserve-data.exe");
  phase = "reinstall-retained-data";
  traceInstallerStage("begin");
  await runNsis(installer);
  await checkInstalledPackage();
  await checkInstalledFirstFrame();
  console.log(JSON.stringify({ installerDataPreservation: true, sourceRevision: baseline.sourceRevision,
    installerSha256: await hashFile(installer), phases: ["fresh-install", "current-package-replacement",
      ...(!currentOnly ? ["uninstall-before-historical-input", "historical-install", "historical-version-upgrade"] : []),
      "in-place-reinstall", "uninstall-preserve-data", "reinstall-retained-data"],
    validationKind: currentOnly ? "current" : "historical-automatic",
    historicalInstaller: currentOnly ? null : { version: HISTORICAL_INSTALLER_BASELINE.version, sha256: HISTORICAL_INSTALLER_BASELINE.sha256,
      withdrawn: true, signingTrustQualified: false, applicationLaunched: false },
    retainedRecords: sentinels.length, packageByteParity: artifacts.length, silentInstaller: true,
    desktopProcessAbsentAtInstallerBoundaries: true, isolatedInstalledFirstFrames: installedFirstFrames,
    isolatedInstalledHistoricalProfileMigration: historicalProfileMigration,
    repairedFixturePackage: true, inertPreservationSentinels: true, currentPackageReplacementQualified: true,
    historicalInstallerUpgradeQualified: !currentOnly,
    previousStableUpgradeQualified: false, applicationDataMigrationQualified: false,
    normalUserProfileStartupQualified: false, signedInstallerQualified: false,
    cleanupQualification: "pending" }));
  // Only the parent launcher may qualify natural process-tree completion.
  process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;
} catch (error) {
  console.error(JSON.stringify({ installerDataPreservation: false, phase, fixturePreserved: true }));
  throw error;
}
// Keep the installed fixture and inert byte sentinels for the disposable VM's
// lifetime. Never recursively remove a profile or hide an installer failure.

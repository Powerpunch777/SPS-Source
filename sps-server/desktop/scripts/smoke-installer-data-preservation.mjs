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
import { OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";
import { HISTORICAL_INSTALLER_BASELINE, stageHistoricalInstaller } from "./historical-installer-baseline.mjs";

// Fail before even reading a profile, creating a fixture, or querying registry.
assertHostedInstallerCi();
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
  return queryInstallerRegistrations();
}
async function assertNoDesktopProcess() {
  const script = `$ErrorActionPreference='Stop'; $p=@(Get-CimInstance Win32_Process -Filter "Name = 'SPS Desktop.exe'" -ErrorAction Stop); if ($p.Count -ne 0) { throw 'An SPS Desktop process is present; refusing installer mutation.' }`;
  await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { windowsHide: true, timeout: 30000 });
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
const { path: historicalInstaller } = await stageHistoricalInstaller(fixture);
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
  const child = spawn(invocation.executable, invocation.args, { ...invocation.options, cwd: fixture, stdio: "ignore" });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => {
      try { assert.equal(signal, null); assert.equal(code, 0, "NSIS operation failed."); resolve(); }
      catch (error) { reject(error); }
    });
  });
  await assertNoDesktopProcess();
  await checkRetainedData();
}
const artifacts = ["SPS Desktop.exe", "resources/app.asar", "resources/sps-windows-job-supervisor/SpsWindowsJobSupervisor.exe",
  "resources/sps-owner-host-runtime-package/sps-owner-host-runtime.tgz", "resources/sps-owner-host-runtime-package/sps-owner-host-runtime-package.json"];
const expected = new Map();
for (const relative of artifacts) expected.set(relative, await hashFile(path.join(desktop, "dist/win-unpacked", relative)));
async function checkInstalledPackage() {
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
}
async function checkHistoricalInstallation() {
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
}
let installedFirstFrames = 0;
async function checkInstalledFirstFrame() {
  const { stdout } = await exec(process.execPath, [path.join(desktop, "scripts/smoke-isolated-desktop-ui.mjs")], {
    cwd: desktop, env: { ...process.env, SPS_DESKTOP_E2E_BINARY: path.join(installation, "SPS Desktop.exe") },
    windowsHide: true, timeout: 60000, maxBuffer: 1024 * 1024,
  });
  assert.match(stdout, /Isolated packaged SPS Desktop sign-in smoke test passed with confirmed owned Job cleanup/);
  await assertNoDesktopProcess();
  await checkRetainedData();
  installedFirstFrames += 1;
}
async function uninstallOwnedCandidate(name) {
  const copiedUninstaller = path.join(fixture, name);
  await copyFile(path.join(installation, "Uninstall SPS Desktop.exe"), copiedUninstaller);
  await runNsis(copiedUninstaller, true);
  assert.deepEqual(await registryInstallations(), []);
  assert.equal(await missing(path.join(installation, "resources/app.asar")), true);
}
let phase = "fresh-install";
try {
  await runNsis(installer);
  await checkInstalledPackage();
  await checkInstalledFirstFrame();
  phase = "uninstall-before-historical-input";
  await uninstallOwnedCandidate("owned-uninstaller-before-historical.exe");
  phase = "historical-install";
  await runNsis(historicalInstaller);
  await checkHistoricalInstallation();
  phase = "historical-version-upgrade";
  await runNsis(installer);
  await checkInstalledPackage();
  await checkInstalledFirstFrame();
  phase = "in-place-reinstall";
  // Prove this is a real replacement/repair, rather than a no-op whose files
  // happened to match from the first installation. This file is fixture-owned.
  await writeFile(path.join(installation, "resources/app.asar"), "SPS installer repair fixture: deliberately invalid ASAR\n");
  assert.notEqual(await hashFile(path.join(installation, "resources/app.asar")), expected.get("resources/app.asar"));
  await runNsis(installer);
  await checkInstalledPackage();
  phase = "uninstall-preserve-data";
  // Mirror electron-builder's own waited uninstaller: copy outside INSTDIR and
  // pass unquoted _?=last. Do not use --updated/KEEP_APP_DATA/delete-data flags;
  // default uninstall policy itself must preserve the fixture's user records.
  await uninstallOwnedCandidate("owned-uninstaller-preserve-data.exe");
  phase = "reinstall-retained-data";
  await runNsis(installer);
  await checkInstalledPackage();
  await checkInstalledFirstFrame();
  console.log(JSON.stringify({ installerDataPreservation: true, sourceRevision: baseline.sourceRevision,
    installerSha256: await hashFile(installer), phases: ["fresh-install", "uninstall-before-historical-input", "historical-install", "historical-version-upgrade", "in-place-reinstall", "uninstall-preserve-data", "reinstall-retained-data"],
    historicalInstaller: { version: HISTORICAL_INSTALLER_BASELINE.version, sha256: HISTORICAL_INSTALLER_BASELINE.sha256,
      withdrawn: true, signingTrustQualified: false, applicationLaunched: false },
    retainedRecords: sentinels.length, packageByteParity: artifacts.length, silentInstaller: true,
    desktopProcessAbsentAtInstallerBoundaries: true, isolatedInstalledFirstFrames: installedFirstFrames,
    repairedFixturePackage: true, inertPreservationSentinels: true, historicalInstallerUpgradeQualified: true,
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

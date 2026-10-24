import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");

function section(start, end, from = 0) {
  const startAt = main.indexOf(start, from);
  const endAt = main.indexOf(end, startAt + start.length);
  assert.notEqual(startAt, -1, `missing source section: ${start}`);
  assert.notEqual(endAt, -1, `missing end of source section: ${end}`);
  return main.slice(startAt, endAt);
}

test("Core Settings is reachable from launch, second instance, menus, tray, and shortcut", () => {
  assert.match(main, /const opensCoreSettingsOnLaunch = process\.argv\.includes\("--sps-core-settings"\);/);
  assert.match(main, /await createWindow\(\{ show: !startedHidden && !opensCoreSettingsOnLaunch \}\);/);
  assert.match(main, /if \(opensCoreSettingsOnLaunch\) await showCoreSettings\(\);/);

  const secondInstance = section('app.on("second-instance"', "app.whenReady().then(async () =>");
  assert.match(secondInstance, /if \(argv\.includes\("--sps-core-settings"\)\)\s*void app\.whenReady\(\)\.then\(showCoreSettings\);\s*else void showMainWindow\(\);/);

  const applicationMenu = section("function createApplicationMenu() {", "function refreshTrayMenu() {");
  assert.match(applicationMenu, /label: "Core settings\.\.\.", click: \(\) => run\(showCoreSettings\)/);

  const trayMenu = section("function refreshTrayMenu() {", "function createTray() {");
  assert.match(trayMenu, /label: "Core settings\.\.\.", click: \(\) => \{ void showCoreSettings\(\); \}/);
  assert.match(main, /ensureCoreSettingsController\(\)\.registerShortcut\(\);/);
});

test("recovery mode reaches Core and suppresses default-memory startup while disabled", () => {
  const ownerHostSetup = section("async function ensureOwnerHostManager() {", "async function activateOwnerHostProfile() {");
  assert.match(ownerHostSetup, /const recovery = await loadCoreRecoverySettings\(\{ userDataPath: app\.getPath\("userData"\) \}\);/);
  assert.match(ownerHostSetup, /const defaultMemoryEnabled = isSpsDefaultMemoryEnabled\(\) && !recovery\.pluginsDisabled;/);
  assert.match(ownerHostSetup, /const defaultMemory = defaultMemoryEnabled\s*\? await ensureSpsDefaultMemoryConfig\(\{ ownerVaultRoot: vaultRoot \}\)\s*: null;/);
  assert.match(ownerHostSetup, /\.\.\.\(defaultMemoryEnabled \? \[memoryPluginPath\] : \[\]\)/);
  assert.match(ownerHostSetup, /\.\.\.\(defaultMemory\s*\?\s*\{\s*SPS_MEMORY_SIDECAR_URL:/);
  assert.match(ownerHostSetup, /environment:\s*\{\s*\.\.\.coreRecoveryEnvironment\(recovery\),/);
  assert.match(ownerHostSetup, /ownerHostRecoveryPluginsDisabled = recovery\.pluginsDisabled;/);
});

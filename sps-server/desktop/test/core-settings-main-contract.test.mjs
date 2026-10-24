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
  assert.match(main, /await createWindow\(\{ show: !startedHidden && !backgroundStartupDeferred \}\);/);
  assert.match(main, /if \(backgroundStartupDeferred\) await showCoreSettings\(\);/);

  const secondInstance = section('app.on("second-instance"', "app.whenReady().then(async () =>");
  assert.match(secondInstance, /if \(argv\.includes\("--sps-core-settings"\)\)\s*void app\.whenReady\(\)\.then\(showCoreSettings\);\s*else void showMainWindow\(\);/);

  const applicationMenu = section("function createApplicationMenu() {", "function refreshTrayMenu() {");
  assert.match(applicationMenu, /label: "Core settings\.\.\.", click: \(\) => run\(showCoreSettings\)/);

  const trayMenu = section("function refreshTrayMenu() {", "function createTray() {");
  assert.match(trayMenu, /label: "Core settings\.\.\.", click: \(\) => \{ void showCoreSettings\(\); \}/);
  assert.match(main, /ensureCoreSettingsController\(\)\.registerShortcut\(\);/);
});

test("recovery launch and unreadable connection settings never enter automatic Host or Node startup", () => {
  assert.match(main, /let backgroundStartupDeferred = opensCoreSettingsOnLaunch;/);
  assert.match(main, /let setupMode = opensCoreSettingsOnLaunch;/);
  const startup = section("app.whenReady().then(async () => {", 'app.on("open-url"');
  assert.match(startup, /strictVersion: true/);
  assert.match(startup, /catch \{\s*enterDesktopStateRecovery\(\);/);
  assert.match(startup, /if \(!desktopStateUnavailable\) \{\s*try \{ await persistState\(\); \}\s*catch \{\s*enterDesktopStateRecovery\(\);/);
  const fallback = section("function enterDesktopStateRecovery() {", "function currentIdentity()");
  assert.match(fallback, /desktopStateUnavailable = true;\s*backgroundStartupDeferred = true;\s*setupMode = true;\s*state = emptyState\(\);/);
  assert.match(startup, /if \(!backgroundStartupDeferred\) \{\s*void bootstrapOwnerHost\(\)[\s\S]*?scheduleHeartbeat\(\);\s*\}/);
  const persist = section("async function persistState(", "function currentIdentity()");
  assert.match(persist, /if \(desktopStateUnavailable\) throw/);
  assert.match(persist, /if \(hasPendingLegacyDesktopOwnerAdoption\(state\)\) return;/);
  assert.match(main, /async function startDesktopAccountSignIn\(\) \{\s*if \(desktopStateUnavailable\) throw/);
  assert.match(main, /async function connectNode\(\) \{\s*if \(desktopStateUnavailable\) throw/);
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

test("restoring account routing cannot infer Host ownership from a top-level profile", () => {
  const restore = section("function restoreCurrentAccountConnection() {", "function currentAccountOwnsOwnerHost()");
  assert.match(restore, /consumeLegacyDesktopConnectionMigration\(state\)/);
  assert.doesNotMatch(restore, /ownerHostOwnerSubject\s*=(?!=)/);
  const adoption = section("async function adoptLegacyOwnerHostIfNeeded() {", "function sendDesktopAccountStatus()");
  assert.match(adoption, /if \(!hasPendingLegacyDesktopOwnerAdoption\(state\) \|\| !currentDesktopAccount\(\)\)/);
});

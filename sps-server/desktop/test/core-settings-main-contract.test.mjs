import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const [main, preload, settingsController] = await Promise.all([
  readFile(new URL("../src/main.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/core-settings-preload.cjs", import.meta.url), "utf8"),
  readFile(new URL("../src/core-settings-controller.mjs", import.meta.url), "utf8"),
]);

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

test("Native Member certificate inspection and renewal use a Host-only bridge and explicit cancel-first confirmation", () => {
  assert.match(preload, /inspectNativeMemberCertificate: input => \{[\s\S]*?nativeMemberInput\(input, \["hostId"\]\)[\s\S]*?desktop:core-settings-inspect-native-member-certificate/);
  assert.match(preload, /renewNativeMemberCertificate: input => \{[\s\S]*?nativeMemberInput\(input, \["hostId"\]\)[\s\S]*?desktop:core-settings-renew-native-member-certificate/);
  assert.match(main, /inspectNativeMemberCertificate: \(input, options\) => ensureNativeMemberController\(\)\.inspectCertificate\(input, options\)/);
  assert.match(main, /renewNativeMemberCertificate: \(input, options\) => ensureNativeMemberController\(\)\.renew\(input, options\)/);
  assert.match(settingsController, /bind\("inspect-native-member-certificate"[\s\S]*?awaitAndAssertSender/);
  assert.match(settingsController, /bind\("renew-native-member-certificate"[\s\S]*?confirm: target => awaitAndAssertSender/);
  const confirmation = section("confirmNativeMemberRenewal: async", "repairNativeMemberStorage:");
  assert.match(confirmation, /buttons: \["Cancel", "Renew certificate"\], defaultId: 0, cancelId: 0/);
  assert.match(confirmation, /Existing keys and trust pins are kept/);
  assert.match(confirmation, /does not create a new registration, change approval, or grant Workspace access/);
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
  assert.match(main, /async function connectNode\([^)]*\) \{\s*if \(desktopStateUnavailable\) throw/);
  const accountStatus = section("function sendDesktopAccountStatus() {", "function openSpsExternalUrl(");
  assert.match(accountStatus, /if \(!backgroundStartupDeferred && nativeMemberAuthority\(\) && state\.nativeNodes\?\.entries\?\.some\(entry => entry\.enabled\)\)\s*\{\s*void ensureNativeNodeController\(\)\.resume\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(main, /connectNativeNode: \(input, options\) => ensureNativeNodeController\(\)\.connect\(input, options\)/,
    "recovery-mode suppression must not disable an explicit user connect action");
});

test("recovery mode reaches Core and suppresses default-memory startup while disabled", () => {
  const ownerHostSetup = section("async function ensureOwnerHostManager() {", "async function activateOwnerHostProfile(");
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

test("Core Settings and tray use one deferred normal quit without a force-stop or Host dependency", () => {
  const declaration = section("function requestDesktopQuit() {", "const startedHidden");
  let quits = 0;
  const scheduled = [];
  const context = { desktopQuitRequested: false, isQuitting: false,
    traceDesktopShutdown() {},
    app: { quit() { quits++; } }, setImmediate(action) { scheduled.push(action); } };
  runInNewContext(`${declaration}; requestDesktopQuit(); requestDesktopQuit();`, context);
  assert.equal(context.isQuitting, true);
  assert.equal(context.desktopQuitRequested, true);
  assert.equal(quits, 0, "The existing trusted IPC can acknowledge before frame teardown");
  assert.equal(scheduled.length, 1);
  scheduled[0]();
  assert.equal(quits, 1);
  assert.match(main, /requestQuit: requestDesktopQuit,/);
  assert.match(main, /label: "Quit SPS Desktop", click: requestDesktopQuit/);
  assert.doesNotMatch(declaration, /app\.exit|\.kill\(|taskkill|assertRegistryOwner|currentDesktopAccount|startOwnerHost/);
  const drain = section("const drainDesktopRuntime = createSpsDesktopRuntimeDrain(", "async function stopDesktopRuntimeGracefully()");
  assert.match(drain, /stopIngress: \(\) => nativeHostController\?\.stop\(\)/);
  assert.match(drain, /stopUpdates: \(\) => desktopUpdateController\.stop\(\)/);
  assert.match(drain, /name: "Owner Host", stop: \(\) => ownerHostManager\?\.stop\(\{ force: false \}\)/);
  const quitWiring = section("const desktopQuitCoordinator = createSpsDesktopQuitCoordinator(", 'app.on("will-quit"');
  assert.match(quitWiring, /drain: \(\) => \{\s*nativeMemberController\?\.dispose\(\);\s*return stopDesktopRuntimeGracefully\(\);/);
  assert.match(quitWiring, /isInstalling: \(\) => desktopUpdateController\.isInstalling\(\)/);
  assert.match(quitWiring, /consumeFailedUpdateQuit: \(\) => desktopUpdateController\.consumeFailedUpdateQuit\(\)/);
  assert.match(main, /updateQuitEvents: nativeAutoUpdater/);
  assert.match(quitWiring, /showFailure: async \(\) =>/);
  assert.match(quitWiring, /app\.on\("before-quit", event => \{ void desktopQuitCoordinator\.handle\(event\); \}\);/);
});

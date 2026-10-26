// Actual Electron/SPA/IPC composition with public fixture data, not LAN or DPAPI qualification.
import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSpsNativeWorkspaceAssets } from "../../src/native-workspace-assets.mjs";
import { createSpsNativeWorkspaceWindowController } from "../../src/native-workspace-window.mjs";

app.disableHardwareAcceleration();
async function run() {
process.stdout.write("native_window_stage:module_ready\n");
assert.equal(process.argv[2], "--isolated-native-workspace-window");
assert.equal(process.argv.length, 4);
process.stdout.write("native_window_stage:arguments_valid\n");
const fixture = await realpath(process.argv[3]);
assert.match(path.basename(fixture), /^sps-workspace-surfaces-e2e-/);
const profile = path.join(fixture, "profile");
await mkdir(profile, { recursive: true });
process.stdout.write("native_window_stage:profile_ready\n");
app.setPath("userData", profile);
app.on("window-all-closed", () => {});
const windows = [], reads = [];
const workspaceId = "22222222-2222-4222-8222-222222222222";
const shell = { mode: "neutral", providerPluginId: null, providerPluginKey: null, shell: null, fallbackReason: null };
const publicBootstrap = { v: 1, kind: "sps.native.workspace.bootstrap",
  workspace: { id: workspaceId, name: "Native Window Fixture", issuePrefix: "NATIVE" }, member: { userId: "member" },
  capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] };
let generation = 0n, controller, failed = false, stage = "startup";
const mark = value => { stage = value; process.stdout.write(`native_window_stage:${value}\n`); };
function hiddenWindow(options) {
  const window = new BrowserWindow({ ...options, show: false,
    webPreferences: { ...options.webPreferences, offscreen: true } });
  window.show = () => {};
  windows.push(window);
  return window;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(window, expression) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    assert.equal(window.isDestroyed(), false);
    if (await window.webContents.executeJavaScript(expression)) return;
    await pause(100);
  }
  throw new Error("Native Workspace fixture rendering timed out.");
}
try {
  mark("awaiting_app");
  await app.whenReady();
  mark("window_open");
  controller = createSpsNativeWorkspaceWindowController({ BrowserWindow: hiddenWindow,
    getAuthority: () => ({ identityIssuer: "https://identity.example.test", subject: "member",
      userDataDirectory: profile, vaultDirectory: path.join(fixture, "unused-vault"), generation }),
    getAssetRoot: async () => path.resolve(import.meta.dirname, "../../../../external/sps-core/ui/dist"),
    createAssets: async options => {
      mark("asset_start");
      const assets = await createSpsNativeWorkspaceAssets(options);
      mark("asset_ready");
      return assets;
    },
    preloadFile: path.resolve(import.meta.dirname, "../../src/native-workspace-preload.cjs"),
    getBootstrap: async (_scope, { assertRequester }) => { assertRequester(); return publicBootstrap; },
    readSurface: async ({ surface, workspaceId: selected }, { assertRequester }) => {
      assertRequester(); assert.equal(selected, workspaceId); reads.push(surface);
      if (surface === "shell") return shell;
      if (surface === "dashboard") return { widgets: [] };
      if (surface === "inbox") return { items: [] };
      throw new Error("Unexpected fixture surface");
    },
  });
  controller.registerIpc(ipcMain);
  await controller.open({ hostId: "11111111-1111-4111-8111-111111111111", workspaceId });
  const window = windows[0];
  mark("workspace_render");
  await until(window, "document.querySelector('[data-sps-workspace-entry=empty]') !== null");
  assert.equal(await window.webContents.executeJavaScript("document.body.innerText.includes('Native Window Fixture')"), true);
  assert.equal(await window.webContents.executeJavaScript("typeof window.spsDesktopWorkspace"), "undefined");
  assert.equal(await window.webContents.executeJavaScript("typeof window.spsCoreSettings"), "undefined");
  assert.equal(await window.webContents.executeJavaScript("typeof window.spsNativeWorkspace.getBootstrap"), "function");
  mark("browser_isolation");
  assert.equal(await window.webContents.executeJavaScript("navigator.serviceWorker.getRegistrations().then(rows => rows.length)"), 0);
  assert.equal(await window.webContents.executeJavaScript("fetch('/api/companies').then(() => false, () => true)"), true);
  mark("dashboard_render");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Dashboard').click()");
  await until(window, "document.body.innerText.includes('No dashboard content is available.')");
  mark("inbox_render");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Inbox').click()");
  await until(window, "document.body.innerText.includes('No inbox items.')");
  assert.deepEqual([...new Set(reads)], ["shell", "dashboard", "inbox"]);
  mark("shutdown");
  generation++;
  await controller.invalidate();
  assert.equal(window.isDestroyed(), true);
  await controller.dispose();
  await writeFile(path.join(fixture, "result.json"), JSON.stringify({ ok: true, views: ["workspace", "dashboard", "inbox"],
    actualElectron: true, fixtureBackend: true, ownerBridge: false, serviceWorkers: 0 }));
} catch {
  failed = true;
  await writeFile(path.join(fixture, "result.json"), JSON.stringify({ ok: false, stage })).catch(() => {});
  console.error("Native Workspace isolated renderer verification failed.");
} finally {
  try { await controller?.dispose(); } catch { failed = true; }
  for (const window of windows) if (!window.isDestroyed()) window.destroy();
  process.exitCode = failed ? 1 : 0;
  app.quit();
}
}

// Electron waits for ESM entry evaluation before signaling app readiness.
// Await readiness inside the asynchronous run, not at module evaluation.
void run().catch(() => {
  process.stdout.write("native_window_stage:startup_failure\n");
  // Setup never reached product lifecycle; this is failure, never exit evidence.
  app.exit(1);
});

import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { access, lstat, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { shutdownPreviewE2eDesktop } from "./preview-e2e-shutdown.mjs";

const root = path.resolve(import.meta.dirname, "..");
const binary = path.join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const holdMs = Number(process.env.SPS_CORE_SETTINGS_E2E_HOLD_MS ?? "0");
if (!Number.isInteger(holdMs) || holdMs < 0 || holdMs > 120_000) throw new Error("Invalid Core Settings E2E observation duration.");
const modes = process.argv.slice(2);
const allowedModes = new Set(["--corrupt-recovery", "--corrupt-desktop-state", "--unwritable-desktop-state", "--malformed-routing-state", "--unverified-legacy-adoption", "--deferred-owner"]);
if (modes.length > 1 || (modes.length === 1 && !allowedModes.has(modes[0]))) throw new Error("Use one known Core Settings fixture at a time.");
const scenario = modes[0]?.slice(2) ?? "fresh";
const corruptRecovery = scenario === "corrupt-recovery";
const corruptDesktopState = scenario === "corrupt-desktop-state";
const unwritableDesktopState = scenario === "unwritable-desktop-state";
const malformedRoutingState = scenario === "malformed-routing-state";
const unverifiedLegacyAdoption = scenario === "unverified-legacy-adoption";
const deferredOwner = scenario === "deferred-owner";
const stateUnavailable = corruptDesktopState || unwritableDesktopState || malformedRoutingState || unverifiedLegacyAdoption;
const server = createServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const userData = await mkdtemp(path.join(os.tmpdir(), "sps-core-settings-e2e-"));
const fixtureStat = await lstat(userData);
const fixtureCanonical = await realpath(userData);
const fixtureTemp = await realpath(os.tmpdir());
if (corruptRecovery) await writeFile(path.join(userData, "core-recovery.json"), "not-json");
const desktopStatePath = path.join(userData, "sps-desktop-state.json");
if (corruptDesktopState) await writeFile(desktopStatePath, "not-json-preserve-this");
const retainedState = JSON.stringify({ version: 11, ownerHostOwnerSubject: "test-owner-not-a-session" });
if (unwritableDesktopState) {
  await writeFile(desktopStatePath, retainedState);
  await mkdir(`${desktopStatePath}.tmp`);
}
const malformedState = JSON.stringify({ version: 11, accountConnections: [], ownerHostOwnerSubject: 42,
  profile: { hubUrl: "http://127.0.0.1:31310", connectionKind: "owner-host" } });
if (malformedRoutingState) await writeFile(desktopStatePath, malformedState);
const unverifiedLegacyState = JSON.stringify({ version: 11, legacyOwnerHostAdoptionPending: true,
  encryptedBoardApiToken: "fake-legacy-proof", companies: [{ id: "fixture-workspace" }] });
if (unverifiedLegacyAdoption) await writeFile(desktopStatePath, unverifiedLegacyState);
if (deferredOwner) {
  await writeFile(desktopStatePath, JSON.stringify({ version: 11, ownerHostOwnerSubject: "test-owner-not-a-session" }));
  await mkdir(path.join(userData, "owner-vault"));
  await writeFile(path.join(userData, "owner-vault", "config.json"), "not-json-preserve-host-config");
}
const child = spawn(binary, [".", ...(stateUnavailable ? [] : ["--sps-core-settings"]), `--user-data-dir=${userData}`, `--remote-debugging-port=${port}`, "--remote-allow-origins=*"], {
  cwd: root,
  env: { ...process.env, SPS_DESKTOP_E2E: "1", SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1", SPS_DESKTOP_E2E_USER_DATA_DIR: userData },
  stdio: "ignore",
});
let socket;
let emergencyStopUsed = false;

try {
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`Isolated Desktop exited with ${child.exitCode}.`);
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) }).then(response => response.json());
      target = targets.find(entry => entry.type === "page" && entry.title === "SPS Core Settings");
    } catch {}
    if (target?.webSocketDebuggerUrl) break;
    await pause(250);
  }
  assert.ok(target?.webSocketDebuggerUrl, "Native settings did not open independently of Core.");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await Promise.race([once(socket, "open"), pause(5000).then(() => { throw new Error("Core Settings CDP connection timed out."); })]);
  let nextId = 1;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { socket.removeEventListener("message", onMessage); reject(new Error(`Timed out: ${method}`)); }, 10_000);
    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      clearTimeout(timer);
      socket.removeEventListener("message", onMessage);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    }
    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, "Core Settings renderer evaluation failed.");
    return result.result?.value;
  };
  let status;
  for (let attempt = 0; attempt < 30; attempt++) {
    status = await evaluate(`({ body: document.body.innerText, loaded: document.querySelector('#status-details').hidden === false,
      nativeBridge: typeof window.spsCoreSettings === 'object', workspaceBridge: typeof window.spsDesktopWorkspace,
      disabled: document.querySelector('#plugins-disabled').disabled, scriptCount: document.scripts.length })`);
    if (status.loaded) break;
    await pause(100);
  }
  assert.equal(status.loaded, true);
  assert.equal(status.nativeBridge, true);
  assert.equal(status.workspaceBridge, "undefined");
  assert.equal(status.scriptCount, 1);
  assert.equal(status.disabled, true, "A fresh unsigned-in test profile must not mutate Host recovery preferences.");
  assert.match(status.body, /Core settings/);
  assert.match(status.body, /Host status/);
  assert.match(status.body, /Recovery/);
  const settings = await evaluate("window.spsCoreSettings.getStatus()");
  assert.equal(settings.canManageHost, false);
  assert.deepEqual(settings.nativeConnectivity, { state: "host_required", lanEnabled: false, canPrepare: false });
  assert.equal(await evaluate("document.querySelector('#prepare-native-identity').disabled"), true);
  assert.equal(await evaluate("document.querySelector('#native-identity-state').textContent"), "Host required");
  assert.equal(settings.desktopStateAvailable, !stateUnavailable);
  assert.equal(settings.host.startupDeferred, true);
  assert.equal(settings.recovery.pluginsDisabled, corruptRecovery);
  if (corruptRecovery) {
    assert.equal(typeof settings.recovery.storageError, "string");
    assert.equal(await evaluate("document.querySelector('#storage-error').hidden"), false);
    assert.equal(await evaluate("document.querySelector('#plugins-disabled').checked"), true);
  } else {
    assert.equal(settings.recovery.storageError, null);
  }
  assert.equal("account" in settings, false);
  assert.equal("vaultPath" in settings.host, false);
  if (corruptDesktopState) {
    assert.equal(await readFile(desktopStatePath, "utf8"), "not-json-preserve-this");
  }
  if (unwritableDesktopState) {
    assert.equal(await readFile(desktopStatePath, "utf8"), retainedState);
  }
  if (malformedRoutingState) assert.equal(await readFile(desktopStatePath, "utf8"), malformedState);
  if (unverifiedLegacyAdoption) assert.equal(await readFile(desktopStatePath, "utf8"), unverifiedLegacyState);
  if (stateUnavailable) {
    assert.equal(await evaluate("document.querySelector('#desktop-state-error').hidden"), false);
    assert.equal(await evaluate("document.querySelector('#storage-state').textContent"), "Error reported");
  }
  if (deferredOwner) {
    assert.equal(await readFile(path.join(userData, "owner-vault", "config.json"), "utf8"), "not-json-preserve-host-config");
    assert.equal(settings.host.lastError, null, "Recovery-only launch must not try to parse/start the broken Host.");
  }
  await assert.rejects(access(path.join(userData, "owner-host-runtime")), { code: "ENOENT" });
  await assert.rejects(access(path.join(userData, "native-connectivity")), { code: "ENOENT" });
  await assert.rejects(access(path.join(userData, "owner-vault", "database")), { code: "ENOENT" });
  const screenshotRoot = process.env.SPS_DESKTOP_E2E_SCREENSHOT_DIR?.trim();
  if (screenshotRoot) await mkdir(screenshotRoot, { recursive: true });
  for (const [width, height] of [[1000, 760], [620, 760]]) {
    await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    const layout = await evaluate(`(async () => { await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { overflow: document.documentElement.scrollWidth > innerWidth,
        fontLoaded: [...document.fonts].some(font => font.family === 'Pretendard Variable' && font.status === 'loaded') }; })()`);
    assert.equal(layout.overflow, false, "Core Settings overflows horizontally.");
    assert.equal(layout.fontLoaded, true);
    const quitPresentation = await evaluate(`(() => {
      const button = document.querySelector('#quit-desktop');
      button.scrollIntoView({ block: 'center' });
      const bounds = button.getBoundingClientRect();
      return { visible: bounds.width > 0 && bounds.height > 0 && bounds.top >= 0 && bounds.bottom <= innerHeight,
        enabled: !button.disabled };
    })()`);
    assert.equal(quitPresentation.visible, true, `Quit button is not visible at ${width}px.`);
    assert.equal(quitPresentation.enabled, true, `Quit button is disabled at ${width}px.`);
    if (screenshotRoot) {
      const capture = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(path.join(screenshotRoot, `core-settings-${scenario}-${width}x${height}.png`), Buffer.from(capture.data, "base64"));
    }
  }
  await call("Emulation.clearDeviceMetricsOverride");
  await evaluate("document.querySelector('#retry-status').click()");
  await pause(150);
  assert.equal(await evaluate("document.querySelector('#status-details').hidden"), false);
  if (holdMs) { console.log(`Keeping only this isolated test window open for ${holdMs}ms observation.`); await pause(holdMs); }

  let quitButtonClicked = false;
  await call("Emulation.clearDeviceMetricsOverride");
  const quitResult = await shutdownPreviewE2eDesktop({
    child,
    requestBrowserClose: async () => {
      const clicked = await evaluate(`(() => {
        const button = document.querySelector('#quit-desktop');
        if (!button || button.hidden || button.disabled) return false;
        button.scrollIntoView({ block: 'center' });
        const bounds = button.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0 || bounds.top < 0 || bounds.bottom > innerHeight) return false;
        button.click();
        return true;
      })()`);
      assert.equal(clicked, true, "Could not click the visible Core Settings Quit button.");
      quitButtonClicked = true;
    },
  });
  assert.equal(quitButtonClicked, true, "The spawned Desktop exited before its Quit button was clicked.");
  assert.equal(quitResult.graceful, true,
    `Core Settings Quit did not naturally exit its spawned Electron process with code 0: ${JSON.stringify(quitResult)}.`);
} finally {
  socket?.close();
  if (child.exitCode === null && child.signalCode === null && child.pid) {
    emergencyStopUsed = true;
    let childExitConfirmed = false;
    const exited = once(child, "exit").then(([code, signal]) => {
      childExitConfirmed = Number.isInteger(code) || typeof signal === "string";
    }).catch(() => {});
    if (process.platform === "win32") {
      await promisify(execFile)("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        timeout: 5000,
        windowsHide: true,
      }).catch(() => {});
    } else {
      child.kill("SIGKILL");
    }
    await Promise.race([exited, pause(5000)]);
    assert.equal(childExitConfirmed, true, "Could not confirm the spawned Main exited; refusing recursive fixture cleanup.");
  }
  assert.equal(path.dirname(userData), path.resolve(os.tmpdir()));
  assert.ok(path.basename(userData).startsWith("sps-core-settings-e2e-"));
  let cleaned = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const current = await lstat(userData);
    const canonical = await realpath(userData);
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(current.dev, fixtureStat.dev);
    assert.equal(current.ino, fixtureStat.ino);
    assert.equal(canonical, fixtureCanonical);
    assert.equal(path.dirname(canonical), fixtureTemp);
    assert.ok(path.basename(canonical).startsWith("sps-core-settings-e2e-"));
    try { await rm(canonical, { recursive: true, force: true }); cleaned = true; break; } catch { await pause(250); }
  }
  assert.equal(cleaned, true, "Could not remove isolated Core Settings test data.");
  assert.equal(emergencyStopUsed, false, "Emergency-stopping the spawned Desktop cannot qualify as a passing Quit smoke.");
}
console.log(`Independent Core Settings source Electron smoke passed (${scenario}): no Core session, no Workspace bridge, owner mutations blocked, desktop/mobile layout and local font verified, and the Quit button closed the spawned process naturally.`);

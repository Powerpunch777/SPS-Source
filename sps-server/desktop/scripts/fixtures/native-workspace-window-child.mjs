// Actual Electron/SPA/IPC composition; the explicit transport mode also uses
// temporary Windows DPAPI credentials and the caller's real Core/TLS fixture.
import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain, safeStorage } from "electron";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createHash, X509Certificate } from "node:crypto";
import path from "node:path";
import { createSpsNativeWorkspaceAssets } from "../../src/native-workspace-assets.mjs";
import { createSpsNativeWorkspaceWindowController } from "../../src/native-workspace-window.mjs";
import { createSpsNativePluginWindowController } from "../../src/native-plugin-window.mjs";
import { createSpsNativeMemberController } from "../../src/native-member-controller.mjs";
import { createSpsNativeMemberWorkspaceClient, createSpsNativeMemberRenewalClient } from "../../src/native-enrollment-client.mjs";
import { createSpsNativeServerCertificateClient } from "../../src/native-enrollment-client.mjs";
import { createSpsNativeHostIdentityStore } from "../../src/native-identity-store.mjs";
import { createSpsNativeIdentityController } from "../../src/native-identity-controller.mjs";
import { createSpsNativeMemberPendingKeyStore, createSpsNativeMemberHostTargetReader } from "../../src/native-member-pending-store.mjs";

app.disableHardwareAcceleration();
async function run() {
process.stdout.write("native_window_stage:module_ready\n");
const realTransport = process.argv[2] === "--isolated-native-workspace-transport-window";
assert.ok(realTransport || process.argv[2] === "--isolated-native-workspace-window");
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
let workspaceId = "22222222-2222-4222-8222-222222222222";
const shell = { mode: "neutral", providerPluginId: null, providerPluginKey: null, shell: null, fallbackReason: null };
const publicBootstrap = { v: 1, kind: "sps.native.workspace.bootstrap",
  workspace: { id: workspaceId, name: "Native Window Fixture", issuePrefix: "NATIVE" }, member: { userId: "member" },
  capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] };
let generation = 0n, controller, pluginController, member, configuration, failed = false, stage = "startup";
const authority = () => ({ identityIssuer: configuration?.context.identityIssuer ?? "https://identity.example.test",
  subject: configuration?.context.subject ?? "member", userDataDirectory: profile,
  vaultDirectory: path.join(fixture, configuration ? "member-vault" : "unused-vault"), generation });
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
async function untilText(window, text) {
  return until(window, `document.body.innerText.includes(${JSON.stringify(text)})`);
}
async function waitForParentMemberRevocation() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Member revocation acknowledgement timed out.")), 30_000);
    function onMessage(message) {
      if (message?.kind === "sps.test.native-workspace-window.member-device-revoked") finish();
      else if (message?.kind === "sps.test.native-workspace-window.member-device-revoke-failed") {
        finish(new Error("Member device revocation failed."));
      }
    }
    function finish(error) {
      clearTimeout(timer);
      process.removeListener("message", onMessage);
      if (error) reject(error); else resolve();
    }
    process.on("message", onMessage);
  });
}
async function untilWindowCount(count, parent) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    assert.equal(parent.isDestroyed(), false);
    if (windows.length >= count) return windows[count - 1];
    await pause(100);
  }
  throw new Error("Native Plugin window did not open.");
}
try {
  mark("awaiting_app");
  await app.whenReady();
  if (realTransport) {
    assert.equal(process.connected, true);
    configuration = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Configuration timed out")), 15_000);
      process.once("message", message => { clearTimeout(timer); resolve(message); });
      process.send({ kind: "sps.test.native-workspace-window.configure-ready" });
    });
    assert.equal(configuration?.kind, "sps.test.native-workspace-window.configure");
    mark("protected_store");
    workspaceId = configuration.workspaceId;
    const { context, target, keyRequest, issuance, renewal = false, deviceId } = configuration;
    assert.equal(process.platform, "win32");
    assert.equal(safeStorage.isEncryptionAvailable(), true);
    const wrongPeer = createSpsNativeMemberWorkspaceClient({ target: configuration.untrustedTarget,
      context: configuration.untrustedContext, timeoutMs: 15_000, assertCurrent() {} });
    try {
      await assert.rejects(wrongPeer.exchange("fixture.header.signature"),
        { code: "native_enrollment_client_unavailable" });
    } finally { wrongPeer.dispose(); }
    const vaultDirectory = path.join(fixture, "member-vault");
    await mkdir(vaultDirectory, { recursive: true });
    const storeOptions = { userDataDirectory: profile, vaultDirectory, context, safeStorage };
    const saved = createSpsNativeMemberPendingKeyStore(storeOptions);
    const commit = { beforeCommit() {} };
    await saved.create(keyRequest, commit);
    await saved.createTarget(target, commit);
    await saved.createIssued(issuance, commit);
    const originalIssuedPath = path.join(profile, "native-connectivity", "member-pending",
      `${createHash("sha256").update(JSON.stringify({ identityIssuer: context.identityIssuer, subject: context.subject,
        hostId: context.hostId, deviceKeyId: context.deviceKeyId })).digest("hex")}.issued.json`);
    const originalIssuedBytes = await readFile(originalIssuedPath);
    const originalTargetPath = originalIssuedPath.replace(/\.issued\.json$/, ".target.json");
    const originalTargetBytes = await readFile(originalTargetPath);
    const originalIssued = await saved.readIssued();
    if (configuration.hostRenewal) {
      mark("host_certificate_publish");
      const hostVault = path.join(fixture, "host-vault");
      await mkdir(hostVault, { recursive: true });
      const hostStore = createSpsNativeHostIdentityStore({ userDataDirectory: profile, vaultDirectory: hostVault, safeStorage });
      await hostStore.create(configuration.hostIdentity);
      const hostFile = path.join(profile, "native-connectivity", "credentials",
        `host-identity-${createHash("sha256").update((await realpath(hostVault)).toLowerCase()).digest("hex")}.json`);
      const baseHostBytes = await readFile(hostFile);
      const hostController = createSpsNativeIdentityController({
        getAuthority: () => ({ ownerSubject: "fixture-host", userDataDirectory: profile,
          vaultDirectory: hostVault, generation: 0n }),
        authenticateHost: async () => {}, getStore: () => hostStore, isListening: () => false,
      });
      assert.equal((await hostController.renew({ confirm: async () => true })).state, "identity_prepared");
      const renewedHost = await hostStore.read();
      assert.deepEqual(await readFile(hostFile), baseHostBytes);
      assert.equal(renewedHost.server.privateKeyPem, configuration.hostIdentity.server.privateKeyPem);
      assert.deepEqual(renewedHost.memberIssuer, configuration.hostIdentity.memberIssuer);
      const acknowledgement = new Promise((resolve, reject) => {
        const timer = setTimeout(() => { process.removeListener("message", receive); reject(new Error("Host restart timed out")); }, 15_000);
        function receive(message) {
          if (!["sps.test.native-host-renewal.ready", "sps.test.native-host-renewal.failed"].includes(message?.kind)) return;
          clearTimeout(timer); process.removeListener("message", receive);
          message.kind.endsWith(".ready") ? resolve() : reject(new Error("Host restart failed"));
        }
        process.on("message", receive);
      });
      process.send({ kind: "sps.test.native-host-renewal.publish", identity: renewedHost,
        certificates: await hostStore.readServerCertificates() });
      await acknowledgement;
      mark("host_certificate_restarted");
    }
    if (renewal) {
      const raw = createSpsNativeMemberRenewalClient({ target, context, timeoutMs: 15_000, assertCurrent() {} });
      try {
        await raw.exchange("fixture.header.signature");
        const first = await raw.renew({ keyRequest, issuance });
        const replay = await raw.renew({ keyRequest, issuance });
        assert.deepEqual(replay, first);
      } finally { raw.dispose(); }
    }
    mark("protected_store_ready");
    member = createSpsNativeMemberController({
      getAuthority: authority,
      ...(configuration.hostRenewal ? { createServerCertificate: createSpsNativeServerCertificateClient } : {}),
      getIndex: () => ({ v: 1, entries: [{ identityIssuer: context.identityIssuer, subject: context.subject,
        hostId: context.hostId, deviceKeyId: context.deviceKeyId }] }),
      saveIndex() { throw new Error("The existing credential fixture cannot reenroll"); },
      getTargetReader: ({ scope }) => ({ async read() {
        mark("protected_target_read");
        return createSpsNativeMemberHostTargetReader({ userDataDirectory: profile, vaultDirectory, scope, safeStorage }).read();
      } }),
      getStore: () => {
        const store = createSpsNativeMemberPendingKeyStore(storeOptions);
        return { async read() { mark("protected_key_read"); return store.read(); },
          async readTarget() { return store.readTarget(); },
          async publishServerCertificate(response, options) { return store.publishServerCertificate(response, options); },
          async readIssued() { mark("protected_issuance_read"); return store.readIssued(); },
          async inspectIssued() { return store.inspectIssued(); },
          async publishRenewal(response, options) { return store.publishRenewal(response, options); } };
      },
      createWorkspace: options => {
        const client = createSpsNativeMemberWorkspaceClient(options);
        const wrapped = { ...client };
        for (const method of ["exchange", "getWorkspaceBootstrap", "readWorkspaceSurface", "updateInboxState"]) {
          wrapped[method] = async (...args) => {
            mark(`client_${method.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`);
            try { return await client[method](...args); }
            catch (error) {
              if (/^native_enrollment_[a-z_]+$/.test(error?.code)) mark(error.code);
              throw error;
            }
          };
        }
        return wrapped;
      },
      authenticate: async () => "fixture.header.signature", timeoutMs: 15_000,
    });
    if (renewal) {
      const result = await member.renew({ hostId: context.hostId }, { confirm: async () => true });
      assert.deepEqual(result, { hostId: context.hostId, deviceId, status: "approved",
        certificateNotAfter: result.certificateNotAfter });
      assert.equal(new Date(result.certificateNotAfter).toISOString(), result.certificateNotAfter);
      assert.ok(Date.parse(result.certificateNotAfter) > Date.now());
      const renewedIssued = await saved.readIssued();
      assert.equal(renewedIssued.issuance.enrollmentId, originalIssued.issuance.enrollmentId);
      assert.equal(renewedIssued.issuance.expiresAt, originalIssued.issuance.expiresAt);
      assert.equal(renewedIssued.issuance.issuerCertificate, originalIssued.issuance.issuerCertificate);
      assert.notEqual(renewedIssued.issuance.certificate, originalIssued.issuance.certificate);
      assert.deepEqual(await saved.read(), keyRequest);
      assert.notEqual(renewedIssued.credential.certificatePem, originalIssued.credential.certificatePem);
      assert.equal(renewedIssued.credential.issuerCertificatePem, originalIssued.credential.issuerCertificatePem);
      assert.deepEqual(await readFile(originalIssuedPath), originalIssuedBytes);
      const latestLeaf = new X509Certificate(renewedIssued.credential.certificatePem);
      const latestHash = createHash("sha256").update(latestLeaf.raw).digest("hex");
      assert.match(latestHash, /^[0-9a-f]{64}$/);
      assert.equal(new Date(Date.parse(latestLeaf.validTo)).toISOString(), result.certificateNotAfter);
      const reconciled = await member.recover({ hostId: context.hostId });
      assert.deepEqual(reconciled, { hostId: context.hostId, deviceId, status: "approved" });
    }
    if (configuration.hostRenewal) {
      assert.notEqual((await saved.readTarget()).serverCertificatePem, target.serverCertificatePem);
      assert.deepEqual(await readFile(originalTargetPath), originalTargetBytes);
      assert.deepEqual(await saved.read(), keyRequest);
      // Recreate the cold reader to prove selection is durable, not cached in Main.
      const restored = await createSpsNativeMemberHostTargetReader({ userDataDirectory: profile, vaultDirectory,
        scope: { identityIssuer: context.identityIssuer, subject: context.subject, hostId: context.hostId,
          deviceKeyId: context.deviceKeyId }, safeStorage }).read();
      assert.equal(restored.serverCertificatePem, (await saved.readTarget()).serverCertificatePem);
    }
  }
  mark("window_open");
  const withNativePlugin = realTransport && configuration?.withNativePlugin === true;
  const loadedPluginAssets = new Set();
  if (withNativePlugin) {
    assert.ok(configuration.pluginId);
    assert.ok(configuration.pluginSurfaceId);
    const callPlugin = async (scope, request, options) => {
      if (!member) throw new Error("Plugin calls require the real Native Member transport");
      return member.invokePlugin({ ...scope, revision: scope.revision ?? null, ...request }, options);
    };
    pluginController = createSpsNativePluginWindowController({
      BrowserWindow: hiddenWindow,
      getAuthority: authority,
      getAssetRoot: async () => path.resolve(import.meta.dirname, "../../../../external/sps-core/ui/dist"),
      createAssets: createSpsNativeWorkspaceAssets,
      preloadFile: path.resolve(import.meta.dirname, "../../src/native-plugin-preload.cjs"),
      getBootstrap: (scope, options) => member.getWorkspaceBootstrap({ hostId: scope.hostId,
        workspaceId: scope.workspaceId }, options),
      getDescriptor: async (scope, options) => (await callPlugin(scope,
        { operation: "describe", key: "surface", params: {} }, options)).data,
      invoke: async (scope, request, options) => callPlugin(scope, request, options),
      readAsset: async (scope, { path: assetPath }, options) => {
        const result = (await callPlugin(scope, { operation: "asset", key: assetPath, params: {} }, options)).data;
        loadedPluginAssets.add(assetPath);
        return result;
      },
    });
    pluginController.registerIpc(ipcMain);
  }
  controller = createSpsNativeWorkspaceWindowController({ BrowserWindow: hiddenWindow,
    getAuthority: authority,
    getAssetRoot: async () => path.resolve(import.meta.dirname, "../../../../external/sps-core/ui/dist"),
    createAssets: async options => {
      mark("asset_start");
      const assets = await createSpsNativeWorkspaceAssets(options);
      mark("asset_ready");
      return assets;
    },
    preloadFile: path.resolve(import.meta.dirname, "../../src/native-workspace-preload.cjs"),
    getBootstrap: async (scope, options) => {
      options.assertRequester();
      return member ? member.getWorkspaceBootstrap(scope, options) : publicBootstrap;
    },
    readSurface: async (input, options) => {
      options.assertRequester(); assert.equal(input.workspaceId, workspaceId); reads.push(input.surface);
      if (member) return member.readWorkspaceSurface(input, options);
      const { surface } = input;
      if (surface === "shell") return shell;
      if (surface === "dashboard") return { widgets: [] };
      if (surface === "inbox") return { items: [] };
      throw new Error("Unexpected fixture surface");
    },
    updateInboxState: async (input, options) => {
      if (!member) throw new Error("State writes require the real transport fixture");
      return member.updateInboxState(input, options);
    },
    openPlugin: withNativePlugin ? (scope, options) => pluginController.open(scope, options) : null,
    onPluginParentClosed: parentId => pluginController?.closeForParent(parentId),
  });
  controller.registerIpc(ipcMain);
  await controller.open({ hostId: configuration?.context.hostId ?? "11111111-1111-4111-8111-111111111111", workspaceId });
  const window = windows[0];
  let executionControlRead = false;
  mark("workspace_render");
  await until(window, "document.querySelector('[data-sps-workspace-entry=empty]') !== null");
  assert.equal(await window.webContents.executeJavaScript(`document.body.innerText.includes(${JSON.stringify(realTransport ? "Native Channel Fixture" : "Native Window Fixture")})`), true);
  if (realTransport && configuration?.nativeExecutionControl === true) {
    mark("execution_status_read");
    await untilText(window, "State: stopped");
    const status = await window.webContents.executeJavaScript(
      "window.spsNativeWorkspace.readSurface({surface: 'executionControl'})");
    assert.equal(status.state, "stopped");
    assert.equal(status.canControl, false);
    assert.deepEqual(Object.keys(status).sort(), ["canControl", "epoch", "pending", "revision", "state", "updatedAt"].sort());
    assert.equal(status.epoch, "1");
    assert.equal(status.revision, 1);
    assert.equal(typeof status.updatedAt, "string");
    assert.equal(new Date(status.updatedAt).toISOString(), status.updatedAt);
    assert.deepEqual(status.pending, { agents: 0, jobs: 0, models: 0, commands: 0, plugins: 0 });
    const actionLabels = await window.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].map(button => button.textContent.trim()).filter(label => /^(pause|stop|resume)$/i.test(label))");
    assert.deepEqual(actionLabels, []);
    executionControlRead = true;
  }
  assert.equal(await window.webContents.executeJavaScript("typeof window.spsDesktopWorkspace"), "undefined");
  assert.equal(await window.webContents.executeJavaScript("typeof window.spsCoreSettings"), "undefined");
  assert.equal(await window.webContents.executeJavaScript("typeof window.spsNativeWorkspace.getBootstrap"), "function");
  mark("browser_isolation");
  assert.equal(await window.webContents.executeJavaScript("navigator.serviceWorker.getRegistrations().then(rows => rows.length)"), 0);
  assert.equal(await window.webContents.executeJavaScript("fetch('/api/companies').then(() => false, () => true)"), true);
  mark("dashboard_render");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Dashboard').click()");
  let pluginWindow = null;
  if (withNativePlugin) {
    await untilText(window, "Open Plugin view");
    await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Open Plugin view').click()");
    mark("plugin_window_open");
    pluginWindow = await untilWindowCount(2, window);
    await untilText(pluginWindow, "Native plugin count: 0");
    assert.equal(await pluginWindow.webContents.executeJavaScript("typeof window.spsNativePlugin?.getData"), "function");
    const pluginBootstrap = await pluginWindow.webContents.executeJavaScript("window.spsNativePlugin.bootstrap()");
    assert.equal(pluginBootstrap.descriptor.pluginId, configuration.pluginId);
    assert.equal(pluginBootstrap.descriptor.surfaceId, configuration.pluginSurfaceId);
    for (const name of ["spsNativeWorkspace", "spsCoreSettings", "spsDesktopWorkspace", "spsDesktop"]) {
      assert.equal(await pluginWindow.webContents.executeJavaScript(`typeof window[${JSON.stringify(name)}]`), "undefined");
    }
    assert.equal(await pluginWindow.webContents.executeJavaScript("typeof window.require"), "undefined");
    assert.equal(await pluginWindow.webContents.executeJavaScript("typeof window.ipcRenderer"), "undefined");
    assert.equal(await pluginWindow.webContents.executeJavaScript("typeof process"), "undefined");
    assert.equal(await pluginWindow.webContents.executeJavaScript("navigator.serviceWorker.getRegistrations().then(rows => rows.length)"), 0);
    await pluginWindow.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Increment Native count').click()");
    await untilText(pluginWindow, "Native plugin count: 1");
    const assetDeadline = Date.now() + 5000;
    while (!loadedPluginAssets.has("dot.svg") && Date.now() < assetDeadline) await pause(100);
    for (const relative of ["index.js", "counter-view.js", "index.css", "dot.svg"]) assert.equal(loadedPluginAssets.has(relative), true);
    const deactivated = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { process.removeListener("message", receive); reject(new Error("Plugin deactivation timed out")); }, 15_000);
      function receive(message) {
        if (!["sps.test.native-plugin.deactivated", "sps.test.native-plugin.deactivation-failed"].includes(message?.kind)) return;
        clearTimeout(timer); process.removeListener("message", receive);
        message.kind.endsWith(".deactivated") ? resolve() : reject(new Error("Plugin deactivation failed"));
      }
      process.on("message", receive);
    });
    process.send({ kind: "sps.test.native-plugin.deactivate" });
    await deactivated;
    assert.equal(await pluginWindow.webContents.executeJavaScript("window.spsNativePlugin.performAction('fixture.increment', {}).then(() => false, () => true)"), true);
    assert.equal(await pluginWindow.webContents.executeJavaScript("fetch('/plugin/index.js').then(response => response.status !== 200)"), true);
    mark("plugin_deactivation_denied");
  } else await until(window, "document.body.innerText.includes('No dashboard content is available.')");
  mark("inbox_render");
  await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Inbox').click()");
  if (realTransport) {
    await until(window, "document.body.innerText.includes('Native persisted Inbox item')");
    await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Mark read').click()");
    await until(window, "[...document.querySelectorAll('button')].some(button => button.textContent === 'Mark unread')");
    await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Archive').click()");
    await until(window, "document.body.innerText.includes('No inbox items.')");
    await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Show archived').click()");
    await until(window, "[...document.querySelectorAll('button')].some(button => button.textContent === 'Restore')");
    await window.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button => button.textContent === 'Restore').click()");
    await until(window, "[...document.querySelectorAll('button')].some(button => button.textContent === 'Archive')");
  } else await until(window, "document.body.innerText.includes('No inbox items.')");
  if (executionControlRead) {
    const revocationAcknowledgement = waitForParentMemberRevocation();
    process.send({ kind: "sps.test.native-workspace-window.execution-status-rendered" });
    mark("execution_status_revocation");
    await revocationAcknowledgement;
    const denied = await window.webContents.executeJavaScript(
      "window.spsNativeWorkspace.readSurface({surface: 'executionControl'}).then(() => false, () => true)");
    assert.equal(denied, true, "Revoked Member device must lose execution-status reads.");
    mark("execution_status_refresh");
    await window.webContents.executeJavaScript(
      "[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Refresh').click()");
    await untilText(window, "Workspace could not be loaded.");
    const staleStatusRetained = await window.webContents.executeJavaScript(
      `document.body.innerText.includes('State: stopped') || document.querySelector(${JSON.stringify('[aria-label="Workspace execution status"]')}) !== null`);
    assert.equal(staleStatusRetained, false, "A revoked Member refresh must clear previously read status.");
  }
  assert.deepEqual([...new Set(reads)].sort(), ["shell", "dashboard", "inbox", "executionControl"].sort());
  mark("shutdown");
  generation++;
  await controller.invalidate();
  assert.equal(window.isDestroyed(), true);
  if (pluginWindow) assert.equal(pluginWindow.isDestroyed(), true);
  await pluginController?.invalidate();
  await controller.dispose();
  await pluginController?.dispose();
  await writeFile(path.join(fixture, "result.json"), JSON.stringify({ ok: true, views: ["workspace", "dashboard", "inbox"],
    actualElectron: true, fixtureBackend: !realTransport, actualDpapi: realTransport,
    ...(realTransport ? { wrongPeerDenied: true } : {}),
    ...(realTransport && configuration?.nativeExecutionControl === true ? { executionControl: true, stoppedReadOnly: true,
      revokedStatusDenied: true, revokedRefreshCleared: true } : {}),
    ...(realTransport && configuration?.renewal ? { renewalReplay: true, renewalPublished: true,
      originalIssuedBytesPreserved: true, renewedEnrollmentReconciled: true } : {}),
    ...(realTransport && configuration?.hostRenewal ? { hostRenewalPublished: true, originalHostBytesPreserved: true,
      targetCertificateRefreshed: true, originalTargetBytesPreserved: true } : {}),
    ...(withNativePlugin ? { pluginUi: true, pluginAction: true, pluginIsolated: true, pluginDeactivationDenied: true } : {}),
    ownerBridge: false, serviceWorkers: 0 }));
} catch {
  failed = true;
  await writeFile(path.join(fixture, "result.json"), JSON.stringify({ ok: false, stage })).catch(() => {});
  console.error("Native Workspace isolated renderer verification failed.");
} finally {
  try { await controller?.dispose(); } catch { failed = true; }
  try { await pluginController?.dispose(); } catch { failed = true; }
  member?.dispose();
  for (const window of windows) if (!window.isDestroyed()) window.destroy();
  process.exitCode = failed ? 1 : 0;
  if (process.connected) process.disconnect();
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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import { createSpsNativePluginWindowController } from "../src/native-plugin-window.mjs";

const hostId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const pluginId = "33333333-3333-4333-8333-333333333333";
const revision = "a".repeat(64);
const baseScope = { hostId, workspaceId, pluginId, surface: "widget", surfaceId: "summary" };
const bootstrap = { v: 1, kind: "sps.native.workspace.bootstrap", workspace: { id: workspaceId, name: "Team", issuePrefix: "TEAM" },
  member: { userId: "member" }, capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] };
const descriptor = { v: 1, kind: "sps.native.plugin.surface", workspaceId, pluginId, pluginKey: "example.summary",
  displayName: "Summary", revision, surface: "widget", surfaceId: "summary", entryFile: "index.js",
  exportName: "SummaryWidget", widget: { id: "summary", exportName: "SummaryWidget", dataAction: "loadSummary" },
  slot: null, cssFiles: ["index.css"] };

function fixture(overrides = {}) {
  const windows = [], handlers = new Map(), calls = [], assetsCalls = [];
  let disposedAssets = 0;
  let account = { identityIssuer: "https://identity.example.test", subject: "member", userDataDirectory: "profile",
    vaultDirectory: "vault", generation: 0n };
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.id = windows.length + 11; this.options = options; this.dead = false;
      this.webContents = new EventEmitter(); this.webContents.mainFrame = { url: "about:blank" };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = handler => { this.openHandler = handler; };
      this.webContents.session = Object.assign(new EventEmitter(), {
        cookies: { set: async value => { this.cookie = value; } },
        setPermissionRequestHandler: handler => { this.permissionRequest = handler; },
        setPermissionCheckHandler: handler => { this.permissionCheck = handler; },
        clearStorageData: async () => {}, clearCache: async () => {},
      });
      windows.push(this);
    }
    setMenu() {}
    isDestroyed() { return this.dead; }
    destroy() { if (!this.dead) { this.dead = true; this.emit("closed"); } }
    show() { this.shown = true; }
    async loadURL(url) { this.webContents.mainFrame.url = url; this.emit("ready-to-show"); }
  }
  const assets = { origin: "http://127.0.0.1:43211", launchCookie: { name: "sps_native_workspace_launch",
    value: Buffer.alloc(32, 2).toString("base64url"), httpOnly: true, sameSite: "strict", path: "/" },
    dispose: async () => { disposedAssets++; } };
  const controller = createSpsNativePluginWindowController({ BrowserWindow: FakeWindow, preloadFile: "native-plugin-preload.cjs",
    getAuthority: () => account, getAssetRoot: async () => "trusted-ui-dist",
    createAssets: async input => { assetsCalls.push(input); input.assertCurrent(); return assets; },
    getBootstrap: async input => { calls.push(["bootstrap", input]); return bootstrap; },
    getDescriptor: async input => { calls.push(["descriptor", input]); return descriptor; },
    invoke: async (scope, input, options) => { options.assertRequester(); calls.push(["invoke", scope, input]); return { rows: ["ok"] }; },
    readAsset: async (scope, input, options) => { options.signal?.throwIfAborted(); calls.push(["asset", scope, input]);
      const bytes = Buffer.from("export default 1;");
      return { path: input.path, contentType: "text/javascript; charset=utf-8", bytes: bytes.toString("base64url"),
        sha256: createHash("sha256").update(bytes).digest("hex") };
    }, ...overrides });
  controller.registerIpc({ handle: (key, fn) => handlers.set(key, fn), removeHandler: key => handlers.delete(key) });
  const event = (index = 0) => ({ sender: windows[index].webContents, senderFrame: windows[index].webContents.mainFrame });
  const invokeIpc = (name, args = [], request = event()) => handlers.get(`desktop:native-plugin-${name}`)(request, ...args);
  return { controller, windows, calls, assetsCalls, assets, event, invokeIpc,
    disposedAssets: () => disposedAssets,
    changeAccount: () => { account = { ...account, generation: account.generation + 1n }; } };
}

test("opens a dedicated sandboxed per-Plugin renderer from the captured Host and Workspace scope", async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  assert.deepEqual(await f.controller.open(baseScope, { parentId: 4 }), { opened: true });
  const window = f.windows[0];
  assert.equal(window.options.title, "Summary");
  assert.match(window.options.webPreferences.partition, /^sps-native-plugin-/);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.cookie.url, f.assets.origin + "/");
  assert.equal(window.permissionCheck(), false);
  assert.deepEqual(window.openHandler({ url: "https://example.invalid" }), { action: "deny" });
  assert.deepEqual(await f.invokeIpc("bootstrap"), { descriptor, workspace: bootstrap.workspace, member: bootstrap.member });
  assert.deepEqual(JSON.parse(JSON.stringify(await f.invokeIpc("data", [{ key: "loadSummary", params: {} }]))), { rows: ["ok"] });
  assert.deepEqual(JSON.parse(JSON.stringify(await f.invokeIpc("action", [{ key: "selectRow", params: { id: "1" } }]))), { rows: ["ok"] });
  assert.deepEqual(f.calls.filter(([kind]) => kind === "invoke").map(([, scope]) => JSON.parse(JSON.stringify(scope))), [
    { ...baseScope, revision }, { ...baseScope, revision },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.filter(([kind]) => kind === "descriptor")[0][1])), baseScope);
  assert.equal(f.assetsCalls[0].plugin.readAsset instanceof Function, true);
  const served = await f.assetsCalls[0].plugin.readAsset("index.js");
  assert.equal(Buffer.from(served.bytes, "base64url").toString(), "export default 1;");
  await assert.rejects(f.invokeIpc("data", [{ key: "loadSummary", params: {}, workspaceId }]));
  await assert.rejects(f.invokeIpc("action", [{ key: "selectRow", params: {} }, "extra"]));
});

test("rejects a descriptor for another surface before creating a window", async t => {
  const f = fixture({ getDescriptor: async () => ({ ...descriptor, pluginId: hostId }) });
  t.after(() => f.controller.dispose());
  await assert.rejects(f.controller.open(baseScope));
  assert.equal(f.windows.length, 0);
});

test("closes the Plugin window and its scoped assets after a renderer crash", async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  await f.controller.open(baseScope);
  f.windows[0].webContents.emit("render-process-gone");
  await f.controller.invalidate();
  assert.equal(f.windows[0].dead, true);
  assert.equal(f.disposedAssets(), 1);
});

test("parent close and account generation change abort and dispose the per-Plugin renderer", async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  await f.controller.open(baseScope, { parentId: 18 });
  await f.controller.closeForParent(18);
  assert.equal(f.windows[0].dead, true);
  assert.equal(f.assetsCalls.length, 1);

  const g = fixture(); t.after(() => g.controller.dispose());
  await g.controller.open(baseScope);
  g.changeAccount();
  await assert.rejects(g.invokeIpc("bootstrap"));
  await g.controller.invalidate();
  assert.equal(g.windows[0].dead, true);
});

test("limits active Plugin data/action work to two and aborts it when the parent closes", async t => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture({ invoke: async (_scope, _input, options) => {
    await Promise.race([pending, new Promise((_, reject) => options.signal.addEventListener("abort",
      () => reject(new Error("aborted")), { once: true }))]);
    return { rows: [] };
  } });
  t.after(() => f.controller.dispose());
  await f.controller.open(baseScope, { parentId: 21 });
  const request = { key: "loadSummary", params: {} };
  const first = f.invokeIpc("data", [request]);
  await new Promise(resolve => setImmediate(resolve));
  const second = f.invokeIpc("action", [request]);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(f.invokeIpc("data", [request]));
  await f.controller.closeForParent(21);
  release();
  await Promise.all([assert.rejects(first), assert.rejects(second)]);
});

test("Native Plugin preload exposes only bootstrap and fixed data/action methods", async () => {
  const source = await readFile(new URL("../src/native-plugin-preload.cjs", import.meta.url), "utf8");
  let api;
  const calls = [];
  const context = vm.createContext({ require: () => ({ contextBridge: { exposeInMainWorld(name, value) {
    assert.equal(name, "spsNativePlugin"); api = value;
  } }, ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({}); } } }), TextEncoder });
  vm.runInContext(source, context);
  context.api = api;
  await vm.runInContext("api.bootstrap()", context);
  await vm.runInContext('api.getData("loadSummary", {})', context);
  await vm.runInContext('api.performAction("selectRow", { id: "1" })', context);
  assert.deepEqual(calls.map(call => call[0]), ["desktop:native-plugin-bootstrap", "desktop:native-plugin-data", "desktop:native-plugin-action"]);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), { key: "loadSummary", params: {} });
  await assert.rejects(vm.runInContext('api.getData("loadSummary", {}, {})', context));
  await assert.rejects(vm.runInContext('api.performAction("selectRow", { get hostId() { throw new Error("must not execute"); } })', context));
  await assert.rejects(vm.runInContext("api.bootstrap({})", context));
  assert.equal(calls.length, 3);
  await vm.runInContext('api.performAction("selectRow")', context);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[3][1])), { key: "selectRow", params: {} });
});

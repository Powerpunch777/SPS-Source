import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createSpsNativeWorkspaceWindowController } from "../src/native-workspace-window.mjs";

const hostId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const scope = { hostId, workspaceId };
const bootstrap = { v: 1, kind: "sps.native.workspace.bootstrap", workspace: { id: workspaceId, name: "Team", issuePrefix: "TEAM" },
  member: { userId: "member" }, capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] };
const shell = { mode: "neutral", providerPluginId: null, providerPluginKey: null, shell: null, fallbackReason: null };
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(overrides = {}) {
  const windows = [], calls = [], handlers = new Map();
  let account = { identityIssuer: "https://identity.example.test", subject: "member", userDataDirectory: "profile",
    vaultDirectory: "vault", generation: 0n };
  let disposedAssets = 0;
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.dead = false;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: "about:blank" };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = value => { this.openHandler = value; };
      this.webContents.session = Object.assign(new EventEmitter(), {
        cookies: { set: async value => { this.cookie = value; } },
        setPermissionRequestHandler: handler => { this.permissionRequest = handler; },
        setPermissionCheckHandler: handler => { this.permissionCheck = handler; },
        clearStorageData: async () => { this.clearStorageCalls = (this.clearStorageCalls ?? 0) + 1; },
        clearCache: async () => { this.clearCacheCalls = (this.clearCacheCalls ?? 0) + 1; },
      });
      windows.push(this);
    }
    setMenu() {}
    isDestroyed() { return this.dead; }
    destroy() { if (!this.dead) { this.dead = true; this.emit("closed"); } }
    show() { this.shown = true; }
    async loadURL(url) { this.webContents.mainFrame.url = url; this.emit("ready-to-show"); }
  }
  const assets = { origin: "http://127.0.0.1:43210", launchCookie: { name: "sps_native_workspace_launch",
    value: Buffer.alloc(32, 1).toString("base64url"), httpOnly: true, sameSite: "strict", path: "/" },
  async dispose() { disposedAssets++; } };
  const controller = createSpsNativeWorkspaceWindowController({ BrowserWindow: FakeWindow,
    preloadFile: "native-workspace-preload.cjs", getAuthority: () => account,
    getAssetRoot: async () => "trusted-ui-dist", createAssets: async ({ assertCurrent }) => { assertCurrent(); return assets; },
    getBootstrap: async (value, options) => { options.assertRequester(); calls.push(["bootstrap", value]); return bootstrap; },
    readSurface: async (value, options) => { options.assertRequester(); calls.push(["read", value]); return shell; }, ...overrides });
  controller.registerIpc({ handle: (key, fn) => handlers.set(key, fn), removeHandler: key => handlers.delete(key) });
  const event = (index = 0) => ({ sender: windows[index].webContents, senderFrame: windows[index].webContents.mainFrame });
  const invoke = (name, args = [], request = event()) => handlers.get(`desktop:native-workspace-${name}`)(request, ...args);
  return { controller, windows, calls, assets, event, invoke, changeAccount: () => { account = { ...account, generation: account.generation + 1n }; },
    disposedAssets: () => disposedAssets };
}

test("Native window uses only its retained scope and a private ephemeral asset session", async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  assert.deepEqual(await f.controller.open(scope), { opened: true });
  const window = f.windows[0];
  assert.equal(window.shown, true);
  assert.match(window.options.webPreferences.partition, /^sps-native-workspace-/);
  assert.equal(window.options.webPreferences.partition.startsWith("persist:"), false);
  assert.equal(window.options.webPreferences.contextIsolation, true);
  assert.equal(window.options.webPreferences.sandbox, true);
  assert.equal(window.options.webPreferences.nodeIntegration, false);
  assert.equal(window.cookie.httpOnly, true);
  assert.equal(window.cookie.url, "http://127.0.0.1:43210/");
  assert.equal(window.permissionCheck(), false);
  assert.deepEqual(window.openHandler({ url: "https://other.invalid" }), { action: "deny" });
  assert.deepEqual(await f.invoke("bootstrap"), bootstrap);
  assert.deepEqual(JSON.parse(JSON.stringify(await f.invoke("read", [{ surface: "shell" }]))), shell);
  assert.deepEqual(f.calls.at(-1), ["read", { ...scope, surface: "shell" }]);
  for (const input of [{ surface: "shell", workspaceId: hostId }, { surface: "shell", cookie: "secret" },
    { surface: "shell", archived: false }, { surface: "http://other.invalid" }]) {
    await assert.rejects(f.invoke("read", [input]));
  }
  await assert.rejects(f.invoke("bootstrap", [undefined]));
});

test("other renderers, subframes and changed navigations cannot use Native IPC", async t => {
  const f = fixture(); t.after(() => f.controller.dispose());
  await f.controller.open(scope);
  await assert.rejects(f.invoke("bootstrap", [], { sender: {}, senderFrame: {} }));
  await assert.rejects(f.invoke("bootstrap", [], { ...f.event(), senderFrame: { url: f.event().senderFrame.url } }));
  for (const kind of ["will-navigate", "will-redirect"]) {
    let blocked = false;
    f.windows[0].webContents.emit(kind, { preventDefault() { blocked = true; } }, "https://other.invalid");
    assert.equal(blocked, true);
  }
  f.windows[0].webContents.mainFrame.url = "http://127.0.0.1:43210/other";
  await assert.rejects(f.invoke("read", [{ surface: "shell" }]));
});

test("overlapping bootstrap reads share one network operation and recheck each requesting frame", async t => {
  let calls = 0, release;
  const f = fixture({ getBootstrap: async () => {
    calls++;
    if (calls === 1) return bootstrap;
    await new Promise(resolve => { release = resolve; });
    return bootstrap;
  } });
  t.after(() => f.controller.dispose());
  await f.controller.open(scope);
  const first = f.invoke("bootstrap"), second = f.invoke("bootstrap");
  await tick();
  assert.equal(calls, 2);
  release();
  assert.deepEqual(await first, bootstrap);
  assert.deepEqual(await second, bootstrap);
});

test("window closure aborts and joins its own read while disposing assets once", async () => {
  let signal;
  const f = fixture({ readSurface: (_input, options) => new Promise((_, reject) => {
    signal = options.signal;
    options.signal.addEventListener("abort", () => reject(new Error("private network detail")), { once: true });
  }) });
  await f.controller.open(scope);
  const reading = assert.rejects(f.invoke("read", [{ surface: "shell" }]), /Native Workspace is unavailable/);
  await tick();
  assert.ok(signal);
  f.windows[0].destroy();
  await reading;
  await f.controller.dispose();
  assert.equal(signal.aborted, true);
  assert.equal(f.disposedAssets(), 1);
  assert.equal(f.windows[0].clearStorageCalls, 1);
  assert.equal(f.windows[0].clearCacheCalls, 1);
});

test("simultaneous surfaces queue and identical reads coalesce instead of failing busy", async t => {
  let release;
  const reads = [];
  const f = fixture({ readSurface: async ({ surface }) => {
    reads.push(surface);
    if (surface === "shell") await new Promise(resolve => { release = resolve; });
    return surface === "shell" ? shell : { widgets: [] };
  } });
  t.after(() => f.controller.dispose());
  await f.controller.open(scope);
  const first = f.invoke("read", [{ surface: "shell" }]);
  const duplicate = f.invoke("read", [{ surface: "shell" }]);
  const dashboard = f.invoke("read", [{ surface: "dashboard" }]);
  await tick();
  assert.deepEqual(reads, ["shell"]);
  release();
  const values = await Promise.all([first, duplicate, dashboard]);
  assert.deepEqual(JSON.parse(JSON.stringify(values)), [shell, shell, { widgets: [] }]);
  assert.deepEqual(reads, ["shell", "dashboard"]);
});

test("Inbox writes use retained Workspace scope and fresh capability without coalescing mutations", async () => {
  const calls = [];
  const f = fixture({ getBootstrap: async () => ({ ...bootstrap,
    capabilities: [...bootstrap.capabilities, "workspace.inbox.state.write"] }),
  updateInboxState: async (input, options) => {
    options.assertRequester(); calls.push(input); return { readAt: "2026-10-27T00:00:00.000Z", archivedAt: null };
  } });
  await f.controller.open(scope);
  const input = { itemId: hostId, read: true };
  await f.invoke("inbox-state", [input]);
  assert.deepEqual(calls, [{ ...scope, state: input }]);
  await assert.rejects(f.invoke("inbox-state", [{ ...input, workspaceId: hostId }]));
  assert.equal(calls.length, 1);
  await f.controller.dispose();
  const viewer = fixture({ updateInboxState: async () => { throw new Error("Should never be reached"); } });
  await viewer.controller.open(scope);
  await assert.rejects(viewer.invoke("inbox-state", [input]));
  await viewer.controller.dispose();
});

test("account invalidation withholds late data and closes all retained windows", async () => {
  let release;
  const f = fixture({ readSurface: () => new Promise(resolve => { release = resolve; }) });
  await f.controller.open(scope);
  const reading = assert.rejects(f.invoke("read", [{ surface: "shell" }]));
  await tick();
  f.changeAccount();
  const invalidating = f.controller.invalidate();
  release(shell);
  await Promise.all([reading, invalidating]);
  assert.equal(f.windows[0].dead, true);
  assert.equal(f.disposedAssets(), 1);
  await f.controller.dispose();
});

test("late asset startup after invalidation is disposed rather than opened", async () => {
  let publish;
  const f = fixture({ createAssets: () => new Promise(resolve => { publish = resolve; }) });
  const opening = assert.rejects(f.controller.open(scope));
  while (!publish) await tick();
  const invalidating = f.controller.invalidate();
  publish(f.assets);
  await Promise.all([opening, invalidating]);
  assert.equal(f.windows.length, 0);
  assert.equal(f.disposedAssets(), 1);
  await f.controller.dispose();
});

test("Native preload accepts no selectors, secrets, getters or extra arguments", async () => {
  const source = await readFile(new URL("../src/native-workspace-preload.cjs", import.meta.url), "utf8");
  let api, getter = false;
  const calls = [];
  vm.runInNewContext(source, { require: () => ({ contextBridge: { exposeInMainWorld(name, value) {
    assert.equal(name, "spsNativeWorkspace"); api = value;
  } }, ipcRenderer: { invoke: (...args) => { calls.push(args); return Promise.resolve({}); } } }) });
  const bad = Object.defineProperty({}, "surface", { enumerable: true, get() { getter = true; return "shell"; } });
  await assert.rejects(api.readSurface(bad));
  await assert.rejects(api.readSurface({ surface: "shell", hostId }));
  await assert.rejects(api.readSurface({ surface: "shell" }, undefined));
  await assert.rejects(api.getBootstrap(undefined));
  await assert.rejects(api.updateInboxState({ itemId: hostId, read: true, hostId }));
  await assert.rejects(api.updateInboxState({ itemId: hostId }));
  assert.equal(getter, false);
  assert.equal(calls.length, 0);
  await api.getBootstrap();
  await api.readSurface({ surface: "inbox", archived: true });
  assert.equal(calls[0][0], "desktop:native-workspace-bootstrap");
  assert.equal(calls[1][0], "desktop:native-workspace-read");
  assert.deepEqual(JSON.parse(JSON.stringify(calls[1][1])), { surface: "inbox", archived: true });
  await api.updateInboxState({ itemId: hostId, read: false });
  assert.equal(calls[2][0], "desktop:native-workspace-inbox-state");
});

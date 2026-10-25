import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCoreSettingsController, SPS_CORE_SETTINGS_SHORTCUT } from "../src/core-settings-controller.mjs";

function setup(overrides = {}) {
  const windows = [];
  const handlers = new Map();
  const calls = [];
  const rendererFile = path.resolve("renderer/core-settings.html");
  class FakeWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.dead = false;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: pathToFileURL(rendererFile).href };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = value => { this.openHandler = value; };
      windows.push(this);
    }
    setMenu(value) { this.menu = value; }
    isDestroyed() { return this.dead; }
    isMinimized() { return false; }
    show() { calls.push("show"); }
    focus() { calls.push("focus"); }
    destroy() { this.dead = true; this.emit("closed"); }
    async loadFile(file) { calls.push(["load", file]); }
  }
  const controller = createCoreSettingsController({
    BrowserWindow: FakeWindow,
    globalShortcut: { register: () => true, unregister: value => calls.push(["unregister", value]) },
    rendererFile, preloadFile: path.resolve("src/core-settings-preload.cjs"),
    getStatus: async () => ({ appVersion: "test", host: { state: "stopped", lastError: "Host unavailable" }, recovery: { pluginsDisabled: false, storageError: null } }),
    authorizeMutation: () => calls.push("authorize"),
    setPluginsDisabled: async value => calls.push(["set", value]),
    confirmRestart: async () => false,
    restartHost: async () => calls.push("restart"),
    openWorkspace: async () => calls.push("open"),
    checkUpdates: async () => calls.push("check"),
    exportHost: async () => calls.push("export"),
    inspectTransfer: async () => calls.push("inspect"),
    ...overrides,
  });
  controller.registerIpc({ handle: (key, value) => handlers.set(key, value) });
  const event = () => ({ sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame });
  const invoke = (name, args = [], sender = event()) => handlers.get(`desktop:core-settings-${name}`)(sender, ...args);
  return { controller, windows, calls, invoke, event };
}

test("settings opens without Core, uses its own partition, and never loads plugin content", async () => {
  const ctx = setup();
  await ctx.controller.show();
  await ctx.controller.show();
  assert.equal(ctx.windows.length, 1);
  const win = ctx.windows[0];
  assert.equal(win.options.webPreferences.partition, "sps-core-settings");
  assert.equal(win.options.webPreferences.sandbox, true);
  assert.equal(win.options.webPreferences.contextIsolation, true);
  assert.equal(win.options.webPreferences.nodeIntegration, false);
  assert.deepEqual(win.openHandler({ url: "https://untrusted.example" }), { action: "deny" });
  let prevented = false;
  win.webContents.emit("will-navigate", { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal((await ctx.invoke("get-status")).host.state, "stopped");
  assert.equal(ctx.calls.includes("authorize"), false);
});

test("every IPC rejects other renderers, subframes, and changed content", async () => {
  const ctx = setup();
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("get-status", [], { sender: {}, senderFrame: {} }), /trusted Native/);
  await assert.rejects(ctx.invoke("set-plugins-disabled", [{ disabled: true }], { ...ctx.event(), senderFrame: { url: ctx.event().senderFrame.url } }), /trusted Native/);
  ctx.event().senderFrame.url = "https://untrusted.example";
  await assert.rejects(ctx.invoke("get-status"), /trusted Native/);
  assert.equal(ctx.calls.includes("authorize"), false);
});

test("saving recovery needs explicit authority, strict arguments, and does not restart", async () => {
  const ctx = setup();
  await ctx.controller.show();
  await ctx.invoke("set-plugins-disabled", [{ disabled: true }]);
  assert.ok(ctx.calls.includes("authorize"));
  assert.ok(ctx.calls.some(value => Array.isArray(value) && value[0] === "set" && value[1] === true));
  assert.equal(ctx.calls.includes("restart"), false);
  for (const input of [{ disabled: "false" }, { disabled: true, path: "outside" }, []]) {
    await assert.rejects(ctx.invoke("set-plugins-disabled", [input]), /disabled boolean/);
  }
  await assert.rejects(ctx.invoke("get-status", ["unexpected"]), /Unexpected/);
});

test("restart cancellation is non-destructive and only affirmative confirmation restarts", async () => {
  const ctx = setup();
  await ctx.controller.show();
  await ctx.invoke("restart-host");
  assert.equal(ctx.calls.includes("restart"), false);
  const approved = setup({ confirmRestart: async () => true });
  await approved.controller.show();
  await approved.invoke("restart-host");
  assert.equal(approved.calls.includes("restart"), true);
});

test("opening a Workspace returns current Host status instead of leaving the recovery card stale", async () => {
  let started = false;
  const ctx = setup({
    openWorkspace: async () => { started = true; },
    getStatus: async () => ({ host: { state: started ? "running" : "stopped", startupDeferred: !started }, recovery: {} }),
  });
  await ctx.controller.show();
  const result = await ctx.invoke("open-workspace");
  assert.equal(result.host.state, "running");
  assert.equal(result.host.startupDeferred, false);
});

test("async authority denial is awaited and action errors never expose details", async () => {
  const denied = setup({ authorizeMutation: async () => { throw new Error("denied"); } });
  await denied.controller.show();
  await assert.rejects(denied.invoke("set-plugins-disabled", [{ disabled: true }]), /denied/);
  assert.equal(denied.calls.some(value => Array.isArray(value) && value[0] === "set"), false);
  const failed = setup({ restartHost: async () => { throw new Error("secret token live-user-path"); }, confirmRestart: async () => true });
  await failed.controller.show();
  await assert.rejects(failed.invoke("restart-host"), error => !error.message.includes("secret") && /could not complete/.test(error.message));
});

test("restart rechecks ownership after the Native confirmation", async () => {
  let ownsHost = true;
  const ctx = setup({
    authorizeMutation: async () => { if (!ownsHost) throw new Error("Owner session ended"); },
    confirmRestart: async () => { ownsHost = false; return true; },
  });
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("restart-host"), /could not complete/);
  assert.equal(ctx.calls.includes("restart"), false);
});

test("global shortcut conflicts are surfaced and only the owned shortcut is unregistered", () => {
  const failed = setup({ globalShortcut: { register: () => false } });
  assert.equal(failed.controller.registerShortcut(), false);
  const ctx = setup();
  assert.equal(ctx.controller.registerShortcut(), true);
  ctx.controller.dispose();
  assert.ok(ctx.calls.some(value => Array.isArray(value) && value[0] === "unregister" && value[1] === SPS_CORE_SETTINGS_SHORTCUT));
});

test("Native identity preparation is explicit, strict, cancelable and confined to the trusted settings frame", async () => {
  const ctx = setup({ confirmNativeIdentity: async () => false, prepareNativeIdentity: async () => { ctx.calls.push("prepare"); } });
  await ctx.controller.show();
  await ctx.invoke("prepare-native-identity", [{ serverAddress: "192.168.1.10" }]);
  assert.equal(ctx.calls.includes("prepare"), false);
  for (const input of [{ serverAddress: "8.8.8.8" }, { serverAddress: "192.168.1.10", path: "outside" }, { serverAddress: "sps.test" }]) {
    await assert.rejects(ctx.invoke("prepare-native-identity", [input]), TypeError);
  }
  await assert.rejects(ctx.invoke("prepare-native-identity", [{ serverAddress: "192.168.1.10" }], { sender: {}, senderFrame: {} }), /trusted Native/);
  const approved = setup({ confirmNativeIdentity: async () => true, prepareNativeIdentity: async (input, options) => {
    options.assertRequester();
    approved.calls.push(["prepare", input]);
  } });
  await approved.controller.show();
  await approved.invoke("prepare-native-identity", [{ serverAddress: "192.168.1.10" }]);
  assert.equal(approved.calls.filter(value => value === "authorize").length, 2);
  assert.ok(approved.calls.some(value => Array.isArray(value) && value[0] === "prepare" && value[1].serverAddress === "192.168.1.10"));
});

test("Native identity confirmation rechecks ownership and a closed window cannot prepare keys", async () => {
  let ownsHost = true;
  const ctx = setup({ authorizeMutation: async () => { if (!ownsHost) throw new Error("session ended"); },
    confirmNativeIdentity: async () => { ownsHost = false; return true; },
    prepareNativeIdentity: async () => { ctx.calls.push("prepare"); } });
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("prepare-native-identity", [{ serverAddress: "192.168.1.10" }]), /could not complete/);
  assert.equal(ctx.calls.includes("prepare"), false);
  const closed = setup({ confirmNativeIdentity: async () => { closed.windows[0].destroy(); return true; },
    prepareNativeIdentity: async () => { closed.calls.push("prepare"); } });
  await closed.controller.show();
  await assert.rejects(closed.invoke("prepare-native-identity", [{ serverAddress: "192.168.1.10" }]), /could not complete/);
  assert.equal(closed.calls.includes("prepare"), false);
});

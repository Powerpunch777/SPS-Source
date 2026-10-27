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

test("Host certificate maintenance has no caller selectors and fences confirmation authority", async () => {
  let confirmed = false, accepted = 0;
  const ctx = setup({ confirmNativeIdentityRenewal: async () => confirmed,
    renewNativeIdentity: async options => {
      options.assertRequester();
      if (await options.confirm({ hostId: "11111111-1111-4111-8111-111111111111", serverNotAfter: Date.now() + 86_400_000 })) accepted++;
    }, repairNativeIdentityPublication: async options => { if (await options.confirm()) accepted++; },
    confirmNativeIdentityRepair: async () => true });
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("renew-native-identity", [{ certificate: "forged" }]));
  await ctx.invoke("renew-native-identity"); assert.equal(accepted, 0);
  confirmed = true;
  await ctx.invoke("renew-native-identity"); assert.equal(accepted, 1);
  await ctx.invoke("repair-native-identity-publication"); assert.equal(accepted, 2);
  const stale = ctx.event(); ctx.windows[0].webContents.mainFrame = { url: "about:blank" };
  await assert.rejects(ctx.invoke("renew-native-identity", [], stale)); assert.equal(accepted, 2);
});

test("Member certificate renewal keeps confirmation and projection bound to the Settings frame", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const deviceId = "22222222-2222-4222-8222-222222222222";
  const certificateNotAfter = new Date(Date.now() + 86_400_000).toISOString();
  let accepted = false, renewals = 0;
  const ctx = setup({ authorizeMutation() { throw new Error("Member is not the local Host"); },
    confirmNativeMemberRenewal: async () => accepted,
    renewNativeMemberCertificate: async (selected, options) => {
      assert.deepEqual(selected, { hostId });
      options.assertRequester();
      if (!await options.confirm({ hostId, certificateNotAfter })) return { cancelled: true };
      options.assertRequester(); renewals++;
      return { hostId, deviceId, status: "approved", certificateNotAfter };
    },
  });
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("renew-native-member-certificate", [{ hostId, certificate: "forged" }]));
  assert.deepEqual(await ctx.invoke("renew-native-member-certificate", [{ hostId }]), { cancelled: true });
  accepted = true;
  assert.deepEqual(await ctx.invoke("renew-native-member-certificate", [{ hostId }]), { hostId, deviceId, status: "approved", certificateNotAfter });
  assert.equal(renewals, 1);
  const stale = ctx.event();
  ctx.windows[0].webContents.mainFrame = { url: "about:blank" };
  await assert.rejects(ctx.invoke("renew-native-member-certificate", [{ hostId }], stale));
  assert.equal(renewals, 1);
});

test("Host registration listener requires local ownership and live settings confirmation", async () => {
  let started = 0, stopped = 0;
  const ctx = setup({
    confirmNativeHostListener: async (_window, input) => input.bindAddress === "192.168.1.10",
    startNativeHostListener: async (input, options) => {
      options.assertRequester();
      assert.equal(await options.confirm(input), true); options.assertRequester(); started++;
    },
    stopNativeHostListener: async () => { stopped++; },
  });
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("start-native-host-listener", [{ bindAddress: "0.0.0.0", port: 43123 }]));
  await ctx.invoke("start-native-host-listener", [{ bindAddress: "192.168.1.10", port: 43123 }]);
  await ctx.invoke("stop-native-host-listener");
  assert.equal(started, 1); assert.equal(stopped, 1);
  assert.equal(ctx.calls.filter(value => value === "authorize").length, 3);
  const denied = setup({ authorizeMutation: () => { throw new Error("not owner"); },
    startNativeHostListener: async () => { started++; } });
  await denied.controller.show();
  await assert.rejects(denied.invoke("start-native-host-listener", [{ bindAddress: "192.168.1.10", port: 43123 }]));
  assert.equal(started, 1);
});

test("Native Member query is account-authorized by Main without requiring local Host ownership", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  let queried = 0;
  const ctx = setup({ authorizeMutation: () => { throw new Error("not a Host owner"); },
    listNativeRegistrations: () => [{ hostId }],
    recoverNativeMember: async (input, options) => {
      assert.deepEqual(input, { hostId }); options.assertRequester(); queried++;
      return { hostId, deviceId: hostId, status: "pending" };
    },
  });
  await ctx.controller.show();
  assert.deepEqual(await ctx.invoke("list-native-registrations"), [{ hostId }]);
  assert.equal((await ctx.invoke("recover-native-member", [{ hostId }])).status, "pending");
  assert.equal(queried, 1);
  await assert.rejects(ctx.invoke("recover-native-member", [{ hostId, token: "forbidden" }]));
  assert.equal(queried, 1);
  const stale = ctx.event(); stale.senderFrame = {};
  await assert.rejects(ctx.invoke("recover-native-member", [{ hostId }], stale));
});

test("Native Member Workspace discovery is explicit, guarded, and returns only exact public fields", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  let queried = 0;
  const ctx = setup({ authorizeMutation: () => { throw new Error("not a Host owner"); },
    listNativeMemberWorkspaces: async (input, options) => {
      assert.deepEqual(input, { hostId }); options.assertRequester(); queried++;
      return [{ id: workspaceId, name: "   " },
        { id: "33333333-3333-4333-8333-333333333333", name: `line\nbreak\t\u0000${"x".repeat(301)}` }];
    },
  });
  await ctx.controller.show();
  assert.deepEqual(await ctx.invoke("list-native-member-workspaces", [{ hostId }]), [
    { id: workspaceId, name: "   " },
    { id: "33333333-3333-4333-8333-333333333333", name: `line\nbreak\t\u0000${"x".repeat(301)}` },
  ]);
  assert.equal(queried, 1);
  for (const badInput of [{ hostId, token: "forbidden" }, { hostId: "../bad" }]) {
    await assert.rejects(ctx.invoke("list-native-member-workspaces", [badInput]));
  }
  assert.equal(queried, 1);
  const stale = ctx.event(); stale.senderFrame = {};
  await assert.rejects(ctx.invoke("list-native-member-workspaces", [{ hostId }], stale));
  assert.equal(queried, 1);
});

test("Native Workspace opening uses exact selectors and current requesting frame without Host ownership", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const workspaceId = "22222222-2222-4222-8222-222222222222";
  let opened = 0;
  const ctx = setup({ authorizeMutation: () => { throw new Error("not an owner"); },
    openNativeMemberWorkspace: async (input, options) => {
      assert.deepEqual(input, { hostId, workspaceId }); options.assertRequester(); opened++;
      return { opened: true };
    } });
  await ctx.controller.show();
  assert.deepEqual(await ctx.invoke("open-native-member-workspace", [{ hostId, workspaceId }]), { opened: true });
  await assert.rejects(ctx.invoke("open-native-member-workspace", [{ hostId, workspaceId, origin: "https://other.invalid" }]));
  await assert.rejects(ctx.invoke("open-native-member-workspace", [{ hostId, workspaceId }], { ...ctx.event(), senderFrame: {} }));
  assert.equal(opened, 1);
});

test("Native Member Workspace IPC rejects malformed and private response fields", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const id = "22222222-2222-4222-8222-222222222222";
  for (const result of [
    [{ id, name: "Workspace", cookie: "private" }],
    [{ id, name: "" }],
    [{ id, name: "One" }, { id, name: "Duplicate" }],
    Array.from({ length: 201 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, name: "Workspace" })),
  ]) {
    const ctx = setup({ listNativeMemberWorkspaces: () => result });
    await ctx.controller.show();
    await assert.rejects(ctx.invoke("list-native-member-workspaces", [{ hostId }]), error => !error.message.includes("private"));
  }
});

test("Native Member Workspace discovery rejects late results after its settings frame closes", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const ctx = setup({ listNativeMemberWorkspaces: async (_input, options) => { options.assertRequester(); await waiting; return []; } });
  await ctx.controller.show();
  const result = ctx.invoke("list-native-member-workspaces", [{ hostId }]);
  await new Promise(resolve => setImmediate(resolve));
  ctx.windows[0].destroy();
  release();
  await assert.rejects(result, /could not complete/);
});

test("Native Member query suppresses late results after the requesting frame closes", async () => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const ctx = setup({ recoverNativeMember: async () => { await waiting; return { status: "pending" }; } });
  await ctx.controller.show();
  const result = ctx.invoke("recover-native-member", [{ hostId: "11111111-1111-4111-8111-111111111111" }]);
  await new Promise(resolve => setImmediate(resolve));
  ctx.windows[0].destroy(); release();
  await assert.rejects(result, /could not complete/);
});

test("Native Member IPC rejects unexpected fields instead of exposing private Main records", async () => {
  const hostId = "11111111-1111-4111-8111-111111111111";
  const ctx = setup({ listNativeRegistrations: () => [{ hostId, subject: "private-account" }],
    recoverNativeMember: () => ({ hostId, deviceId: hostId, status: "approved", privateKeyPem: "private-key" }),
  });
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("list-native-registrations"), error => !error.message.includes("private-account"));
  await assert.rejects(ctx.invoke("recover-native-member", [{ hostId }]), error => !error.message.includes("private-key"));
});

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

test("Desktop quit is an unauthenticated local action and returns only a scheduled-request acknowledgement", async () => {
  let statusReads = 0;
  const ctx = setup({
    authorizeMutation: undefined,
    getStatus: async () => { statusReads += 1; throw new Error("status must not be read"); },
    requestQuit: (...args) => { ctx.calls.push(["quit", args]); },
  });
  await ctx.controller.show();

  let getterRan = false;
  const extraArgument = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() { getterRan = true; throw new Error("argument getter must not run"); },
  });
  await assert.rejects(ctx.invoke("quit-desktop", [extraArgument]), /Unexpected Core Settings arguments/);
  assert.equal(getterRan, false);

  assert.deepEqual(await ctx.invoke("quit-desktop"), { requested: true });
  assert.deepEqual(ctx.calls.filter(value => Array.isArray(value) && value[0] === "quit"), [["quit", []]]);
  assert.equal(ctx.calls.includes("authorize"), false);
  assert.equal(statusReads, 0);
});

test("Desktop quit requires the exact live Core Settings main frame", async () => {
  const foreign = setup({ requestQuit: () => foreign.calls.push("quit") });
  await foreign.controller.show();
  await assert.rejects(foreign.invoke("quit-desktop", [], { sender: {}, senderFrame: {} }), /trusted Native/);
  await assert.rejects(foreign.invoke("quit-desktop", [], {
    ...foreign.event(), senderFrame: { url: foreign.event().senderFrame.url },
  }), /trusted Native/);
  assert.equal(foreign.calls.includes("quit"), false);

  const navigated = setup({ requestQuit: () => navigated.calls.push("quit") });
  await navigated.controller.show();
  navigated.event().senderFrame.url = "https://untrusted.example";
  await assert.rejects(navigated.invoke("quit-desktop"), /trusted Native/);
  assert.equal(navigated.calls.includes("quit"), false);

  const closed = setup({ requestQuit: () => closed.calls.push("quit") });
  await closed.controller.show();
  closed.windows[0].destroy();
  await assert.rejects(closed.invoke("quit-desktop"), /trusted Native/);
  assert.equal(closed.calls.includes("quit"), false);
});

test("Desktop quit rechecks sender state when its serialized action begins", async () => {
  const navigated = setup({ requestQuit: () => navigated.calls.push("quit") });
  await navigated.controller.show();
  const navigationRequest = navigated.invoke("quit-desktop");
  navigated.event().senderFrame.url = "https://untrusted.example";
  await assert.rejects(navigationRequest, /could not complete/);
  assert.equal(navigated.calls.includes("quit"), false);

  const closed = setup({ requestQuit: () => closed.calls.push("quit") });
  await closed.controller.show();
  const closeRequest = closed.invoke("quit-desktop");
  closed.windows[0].destroy();
  await assert.rejects(closeRequest, /could not complete/);
  assert.equal(closed.calls.includes("quit"), false);
});

test("Desktop quit does not require Core authority and stays serialized with existing mutations", async () => {
  let releaseMutation;
  let mutationStarted;
  const started = new Promise(resolve => { mutationStarted = resolve; });
  const mutationGate = new Promise(resolve => { releaseMutation = resolve; });
  const ctx = setup({
    setPluginsDisabled: async () => { mutationStarted(); await mutationGate; },
    requestQuit: () => ctx.calls.push("quit"),
  });
  await ctx.controller.show();

  const pendingMutation = ctx.invoke("set-plugins-disabled", [{ disabled: true }]);
  await started;
  await assert.rejects(ctx.invoke("quit-desktop"), /could not complete/);
  assert.equal(ctx.calls.includes("quit"), false);
  releaseMutation();
  await pendingMutation;

  assert.deepEqual(await ctx.invoke("quit-desktop"), { requested: true });
  assert.equal(ctx.calls.filter(value => value === "quit").length, 1);
});

test("Desktop quit callback failures and missing callbacks fail closed without details", async () => {
  for (const requestQuit of [
    undefined,
    () => { throw new TypeError("secret-token C:\\private\\user-data"); },
    async () => { throw new Error("secret-token C:\\private\\user-data"); },
  ]) {
    const ctx = setup({ requestQuit });
    await ctx.controller.show();
    await assert.rejects(ctx.invoke("quit-desktop"), error => {
      assert.equal(error.message, "The Core Settings action could not complete. Check the local Host status and retry.");
      assert.doesNotMatch(error.message, /secret-token|private/);
      return true;
    });
  }
});

test("Desktop quit invokes its callback once per call and rechecks the sender after awaiting it", async () => {
  let releaseQuit;
  let quitStarted;
  const started = new Promise(resolve => { quitStarted = resolve; });
  const quitGate = new Promise(resolve => { releaseQuit = resolve; });
  const ctx = setup({ requestQuit: async (...args) => { ctx.calls.push(["quit", args]); quitStarted(); await quitGate; } });
  await ctx.controller.show();

  const pending = ctx.invoke("quit-desktop");
  await started;
  ctx.event().senderFrame.url = "https://untrusted.example";
  releaseQuit();
  await assert.rejects(pending, /could not complete/);
  assert.deepEqual(ctx.calls.filter(value => Array.isArray(value) && value[0] === "quit"), [["quit", []]]);

  ctx.event().senderFrame.url = pathToFileURL(path.resolve("renderer/core-settings.html")).href;
  assert.deepEqual(await ctx.invoke("quit-desktop"), { requested: true });
  assert.equal(ctx.calls.filter(value => Array.isArray(value) && value[0] === "quit").length, 2);
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

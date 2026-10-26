import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { pathToFileURL } from "node:url";
import { createCoreSettingsController } from "../src/core-settings-controller.mjs";

const deviceId = "123e4567-e89b-42d3-a456-426614174000";
const fingerprint = "a".repeat(64);
const unavailable = { state: "unavailable", lanEnabled: false, devices: [] };

function snapshot(overrides = {}) {
  return {
    state: "available",
    lanEnabled: false,
    devices: [{
      id: deviceId,
      displayName: "Studio device",
      status: "pending",
      certificateSha256: fingerprint,
      certificateNotAfter: "2035-01-02T03:04:05.000Z",
      revision: 1,
    }],
    ...overrides,
  };
}

function setup(overrides = {}) {
  const windows = [];
  const handlers = new Map();
  const calls = [];
  const rendererFile = path.resolve("renderer/core-settings.html");
  class FakeWindow extends EventEmitter {
    constructor() {
      super();
      this.dead = false;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: pathToFileURL(rendererFile).href };
      this.webContents.getURL = () => this.webContents.mainFrame.url;
      this.webContents.setWindowOpenHandler = () => {};
      windows.push(this);
    }
    setMenu() {}
    isDestroyed() { return this.dead; }
    isMinimized() { return false; }
    show() {}
    focus() {}
    destroy() { this.dead = true; this.emit("closed"); }
    async loadFile() {}
  }
  const controller = createCoreSettingsController({
    BrowserWindow: FakeWindow,
    globalShortcut: { register: () => true, unregister() {} },
    rendererFile,
    preloadFile: path.resolve("src/core-settings-preload.cjs"),
    getStatus: async () => ({ host: {}, recovery: {} }),
    authorizeMutation: async () => { calls.push("authorize"); },
    setPluginsDisabled: async () => {},
    confirmRestart: async () => false,
    restartHost: async () => {},
    openWorkspace: async () => {},
    checkUpdates: async () => {},
    exportHost: async () => {},
    inspectTransfer: async () => {},
    ...overrides,
  });
  controller.registerIpc({ handle: (name, handler) => handlers.set(name, handler) });
  const event = () => ({ sender: windows[0].webContents, senderFrame: windows[0].webContents.mainFrame });
  const invoke = (name, args = [], source = event()) => handlers.get(`desktop:core-settings-${name}`)(source, ...args);
  return { controller, windows, handlers, calls, event, invoke };
}

test("Native device listing is authorized, sanitized, and rechecks its trusted sender after async work", async () => {
  let releaseList;
  const ctx = setup({
    listNativeDevices: async () => new Promise(resolve => { releaseList = resolve; }),
  });
  await ctx.controller.show();
  const pending = ctx.invoke("list-native-devices");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(ctx.calls, ["authorize"]);
  ctx.event().senderFrame.url = "https://untrusted.example";
  releaseList(snapshot());
  await assert.rejects(pending, /could not complete/);

  const malformedSnapshots = [
    snapshot({ secret: "must-not-escape" }),
    snapshot({ state: "host_required" }),
    snapshot({ devices: [{ ...snapshot().devices[0], displayName: "  " }] }),
    snapshot({ devices: [{ ...snapshot().devices[0], displayName: "bad\u007fname" }] }),
    snapshot({ devices: [{ ...snapshot().devices[0], revision: 2_147_483_648 }] }),
  ];
  for (const value of malformedSnapshots) {
    const safe = setup({ listNativeDevices: async () => value });
    await safe.controller.show();
    assert.deepEqual(await safe.invoke("list-native-devices"), unavailable);
    assert.deepEqual(safe.calls, ["authorize"]);
  }

  const valid = setup({ listNativeDevices: async () => snapshot() });
  await valid.controller.show();
  assert.deepEqual(await valid.invoke("list-native-devices"), snapshot());
  assert.deepEqual(valid.calls, ["authorize"]);
});

test("missing list callback fails closed and foreign settings frames cannot list", async () => {
  const ctx = setup();
  await ctx.controller.show();
  assert.deepEqual(await ctx.invoke("list-native-devices"), unavailable);
  await assert.rejects(ctx.invoke("list-native-devices", [], { sender: {}, senderFrame: {} }), /trusted Native/);
  assert.deepEqual(ctx.calls, ["authorize"]);
});

test("Native approve and revoke validate before confirmation and pass only narrow callback arguments", async () => {
  const calls = [];
  const ctx = setup({
    authorizeMutation: async () => { calls.push(["authorize"]); },
    confirmNativeDeviceAction: async (parent, input) => {
      calls.push(["confirm", parent === ctx.windows[0], input]);
      return true;
    },
    approveNativeDevice: async (...args) => {
      assert.equal(await args[1].confirm(snapshot().devices[0]), true);
      calls.push(["approve", args.length, args[0], Reflect.ownKeys(args[1])]);
      args[1].assertRequester();
      return snapshot({ devices: [{ ...snapshot().devices[0], status: "approved", revision: 2 }] });
    },
    revokeNativeDevice: async (...args) => {
      assert.equal(await args[1].confirm(snapshot().devices[0]), true);
      calls.push(["revoke", args.length, args[0], Reflect.ownKeys(args[1])]);
      args[1].assertRequester();
      return snapshot({ devices: [{ ...snapshot().devices[0], status: "revoked", revision: 3 }] });
    },
  });
  await ctx.controller.show();
  const approved = await ctx.invoke("approve-native-device", [{ deviceId }]);
  assert.equal(approved.devices[0].status, "approved");
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["authorize"],
    ["authorize"],
    ["confirm", true, { action: "approve", deviceId, device: snapshot().devices[0] }],
    ["authorize"],
    ["approve", 2, { deviceId }, ["assertRequester", "confirm"]],
  ]);

  calls.length = 0;
  const revoked = await ctx.invoke("revoke-native-device", [{ deviceId }]);
  assert.equal(revoked.devices[0].status, "revoked");
  assert.equal(calls.some(call => Array.isArray(call) && call[0] === "revoke" && call[1] === 2), true);
});

test("cancel returns an authorized list snapshot and malformed IDs never reach Native confirmation", async () => {
  let confirmations = 0;
  let mutations = 0;
  const ctx = setup({
    confirmNativeDeviceAction: async () => { confirmations += 1; return false; },
    listNativeDevices: async () => snapshot(),
    approveNativeDevice: async (_input, options) => { if (await options.confirm(snapshot().devices[0])) mutations += 1; return snapshot(); },
  });
  await ctx.controller.show();
  const cancelled = await ctx.invoke("approve-native-device", [{ deviceId }]);
  assert.deepEqual(cancelled, snapshot());
  assert.equal(confirmations, 1);
  assert.equal(mutations, 0);
  assert.deepEqual(ctx.calls, ["authorize", "authorize", "authorize"]);

  const accessor = {};
  Object.defineProperty(accessor, "deviceId", { enumerable: true, get() { throw new Error("getter must not run"); } });
  const invalidInputs = [
    { deviceId: "not-a-uuid" },
    { deviceId: deviceId.toUpperCase() },
    { deviceId, extra: true },
    accessor,
  ];
  for (const input of invalidInputs) {
    await assert.rejects(ctx.invoke("approve-native-device", [input]), TypeError);
  }
  assert.equal(confirmations, 1);
  assert.equal(mutations, 0);
  const nullPrototypeInput = Object.assign(Object.create(null), { deviceId });
  await ctx.invoke("approve-native-device", [nullPrototypeInput]);
  assert.equal(confirmations, 2);
});

test("Native mutation rechecks authorization after confirmation and treats absent callbacks as generic failures", async () => {
  let authorized = true;
  let writes = 0;
  const ctx = setup({
    authorizeMutation: async () => { if (!authorized) throw new Error("owner session changed"); },
    confirmNativeDeviceAction: async () => { authorized = false; return true; },
    approveNativeDevice: async (_input, options) => { if (await options.confirm(snapshot().devices[0])) writes += 1; return snapshot(); },
  });
  await ctx.controller.show();
  await assert.rejects(ctx.invoke("approve-native-device", [{ deviceId }]), /could not complete/);
  assert.equal(writes, 0);

  let initialConfirmations = 0;
  const initiallyDenied = setup({
    authorizeMutation: async () => { throw new Error("owner session ended"); },
    confirmNativeDeviceAction: async () => { initialConfirmations += 1; return true; },
    approveNativeDevice: async () => { writes += 1; return snapshot(); },
  });
  await initiallyDenied.controller.show();
  await assert.rejects(initiallyDenied.invoke("approve-native-device", [{ deviceId }]), /could not complete/);
  assert.equal(initialConfirmations, 0);
  assert.equal(writes, 0);

  const missing = setup({ confirmNativeDeviceAction: async () => true });
  await missing.controller.show();
  await assert.rejects(missing.invoke("approve-native-device", [{ deviceId }]), /could not complete/);
});

test("Core settings preload exposes only narrow Native device IPC methods", async () => {
  const source = await readFile(new URL("../src/core-settings-preload.cjs", import.meta.url), "utf8");
  const calls = [];
  let exposed;
  const contextBridge = { exposeInMainWorld: (name, api) => { assert.equal(name, "spsCoreSettings"); exposed = api; } };
  const ipcRenderer = { invoke: (...args) => { calls.push(args); return Promise.resolve("ok"); } };
  runInNewContext(source, { require: name => {
    assert.equal(name, "electron");
    return { contextBridge, ipcRenderer };
  } });

  await exposed.listNativeDevices();
  await exposed.approveNativeDevice(Object.assign(Object.create(null), { deviceId }));
  await exposed.revokeNativeDevice({ deviceId });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
    ["desktop:core-settings-list-native-devices"],
    ["desktop:core-settings-approve-native-device", { deviceId }],
    ["desktop:core-settings-revoke-native-device", { deviceId }],
  ]);
  await assert.rejects(exposed.approveNativeDevice({ deviceId, path: "secret" }), error => error.name === "TypeError");
  assert.equal(calls.length, 3);
});

const rendererSource = await readFile(new URL("../renderer/core-settings.mjs", import.meta.url), "utf8");
const htmlSource = await readFile(new URL("../renderer/core-settings.html", import.meta.url), "utf8");

class ElementFixture {
  constructor(tag = "div", id = "") {
    this.tagName = tag;
    this.id = id;
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this._textContent = "";
    this.className = "";
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.classList = { toggle() {} };
  }
  get textContent() { return this._textContent; }
  set textContent(value) { this._textContent = value; this.children = []; }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) ?? []) listener({ target: this });
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, value); }
}

function createRenderer(api) {
  const elements = new Map();
  for (const [, id] of htmlSource.matchAll(/\bid="([^"]+)"/g)) elements.set(id, new ElementFixture("div", id));
  const actions = ["open-workspace", "check-updates", "restart-host", "export-host", "inspect-transfer"]
    .map(action => Object.assign(new ElementFixture("button", action), { dataset: { action } }));
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new ElementFixture("div", id));
      return elements.get(id);
    },
    querySelectorAll(selector) {
      assert.equal(selector, "button[data-action]");
      return actions;
    },
    createElement(tag) { return new ElementFixture(tag); },
  };
  const windowListeners = new Map();
  const window = {
    spsCoreSettings: api,
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) ?? [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    dispatch(type) {
      for (const listener of windowListeners.get(type) ?? []) listener();
    },
  };
  runInNewContext(rendererSource, { window, document }, { filename: "core-settings.mjs" });
  return { elements, actions, window };
}

async function settle() { await new Promise(resolve => setImmediate(resolve)); }

function allElements(root) {
  return [root, ...root.children.flatMap(allElements)];
}

test("Native device UI fails closed without API and renders DTO data with textContent and status-gated actions", async () => {
  const missing = createRenderer({ getStatus: async () => ({ host: {}, recovery: {}, canManageHost: true }) });
  await settle();
  assert.equal(missing.elements.get("native-devices-status").textContent, "Unavailable");
  assert.equal(missing.elements.get("refresh-native-devices").disabled, false);

  let approveInput;
  let listCalls = 0;
  const view = createRenderer({
    getStatus: async () => ({ host: {}, recovery: { pluginsDisabled: false }, canManageHost: true }),
    listNativeDevices: async () => { listCalls += 1; return snapshot({ devices: [
      { ...snapshot().devices[0], displayName: "<img src=x onerror=alert(1)>" },
      { ...snapshot().devices[0], id: "223e4567-e89b-42d3-a456-426614174000", status: "approved" },
      { ...snapshot().devices[0], id: "323e4567-e89b-42d3-a456-426614174000", status: "revoked" },
    ] }); },
    approveNativeDevice: async input => { approveInput = input; return snapshot({ devices: [{ ...snapshot().devices[0], status: "approved", revision: 2 }] }); },
  });
  await settle();
  const list = view.elements.get("native-devices-list");
  const rows = list.children;
  const firstRow = allElements(rows[0]);
  assert.equal(firstRow.some(element => element.tagName === "img"), false);
  assert.equal(firstRow.find(element => element.tagName === "h3").textContent, "<img src=x onerror=alert(1)>");
  const buttons = allElements(list).filter(element => element.tagName === "button");
  assert.deepEqual(buttons.map(button => button.textContent), ["Approve", "Revoke", "Revoke"]);
  buttons[0].dispatch("click");
  await settle();
  assert.deepEqual(JSON.parse(JSON.stringify(approveInput)), { deviceId });
  assert.equal(view.elements.get("action-notice").textContent, "Native device list updated.");

  const refresh = view.elements.get("refresh-native-devices");
  refresh.dispatch("click");
  await settle();
  assert.equal(listCalls, 2);
  assert.match(htmlSource, /LAN access<\/dt>\s*<dd id="native-listener-state">Off · not active<\/dd>/);
  assert.doesNotMatch(htmlSource, /invite|add device/i);
  assert.doesNotMatch(rendererSource, /\.innerHTML\s*=/);
});

test("Native device UI rejects malformed and oversized snapshots and disables management outside available owner state", async () => {
  const validDevice = snapshot().devices[0];
  const malformed = [
    { ...snapshot(), lanEnabled: true },
    { ...snapshot(), state: "host_required" },
    { ...snapshot(), devices: [{ ...validDevice, displayName: "  " }] },
    { ...snapshot(), devices: [{ ...validDevice, displayName: "bad\nname" }] },
    { ...snapshot(), devices: [{ ...validDevice, certificateSha256: "<b>" }] },
    { ...snapshot(), devices: [{ ...validDevice, certificateNotAfter: "2035-01-02" }] },
    { ...snapshot(), devices: [{ ...validDevice, revision: 2_147_483_648 }] },
    { ...snapshot(), devices: [{ ...validDevice, secret: "do-not-render" }] },
    { ...snapshot(), devices: Array(201).fill(validDevice) },
  ];
  for (const value of malformed) {
    const view = createRenderer({
      getStatus: async () => ({ host: {}, recovery: {}, canManageHost: true }),
      listNativeDevices: async () => value,
    });
    await settle();
    assert.equal(view.elements.get("native-devices-status").textContent, "Unavailable");
    assert.equal(view.elements.get("native-devices-list").children.length, 0);
  }

  const restricted = createRenderer({
    getStatus: async () => ({ host: {}, recovery: {}, canManageHost: false }),
    listNativeDevices: async () => snapshot({ state: "host_restart_required", devices: [] }),
  });
  await settle();
  assert.equal(restricted.elements.get("native-devices-status").textContent, "Restart Host to manage devices");
  assert.equal(restricted.elements.get("refresh-native-devices").disabled, true);
  assert.equal(allElements(restricted.elements.get("native-devices-list")).filter(item => item.tagName === "button").every(button => button.disabled), true);
});

test("Native device UI exposes loading, empty, Host-required, identity-required, restart, and unavailable states", async () => {
  let resolveList;
  const loading = createRenderer({
    getStatus: async () => ({ host: {}, recovery: {}, canManageHost: true }),
    listNativeDevices: () => new Promise(resolve => { resolveList = resolve; }),
  });
  await settle();
  assert.equal(loading.elements.get("native-devices-status").textContent, "Loading native devices...");
  assert.equal(loading.elements.get("native-devices-status").attributes.get("aria-busy"), "true");
  resolveList(snapshot({ devices: [] }));
  await settle();
  assert.equal(loading.elements.get("native-devices-status").textContent, "Device management available");
  assert.equal(loading.elements.get("native-devices-empty").hidden, false);

  for (const [state, label] of [
    ["host_required", "Local Host required"],
    ["identity_required", "Prepare Host identity first"],
    ["host_restart_required", "Restart Host to manage devices"],
    ["unavailable", "Native device management unavailable"],
  ]) {
    const view = createRenderer({
      getStatus: async () => ({ host: {}, recovery: {}, canManageHost: true }),
      listNativeDevices: async () => snapshot({ state, devices: [] }),
    });
    await settle();
    assert.equal(view.elements.get("native-devices-status").textContent, label);
    assert.equal(view.elements.get("native-devices-empty").hidden, true);
    assert.equal(view.elements.get("refresh-native-devices").disabled, state === "available");
  }
});

test("Host status refresh clears the prior Native device list and keeps loading/unavailable state consistent", async () => {
  let statusCalls = 0;
  let rejectRefresh;
  const view = createRenderer({
    getStatus: () => {
      statusCalls += 1;
      if (statusCalls === 1) return Promise.resolve({ host: {}, recovery: {}, canManageHost: true });
      return new Promise((_, reject) => { rejectRefresh = reject; });
    },
    listNativeDevices: async () => snapshot(),
  });
  await settle();

  const list = view.elements.get("native-devices-list");
  const status = view.elements.get("native-devices-status");
  const error = view.elements.get("native-devices-error");
  assert.equal(list.children.length, 1);
  assert.match(allElements(list).map(element => element.textContent).join(" "), new RegExp(fingerprint));

  view.window.dispatch("focus");
  await settle();
  assert.equal(list.children.length, 0);
  assert.doesNotMatch(list.textContent, new RegExp(fingerprint));
  assert.equal(status.textContent, "Loading native devices...");
  assert.equal(status.attributes.get("aria-busy"), "true");
  assert.equal(error.hidden, true);

  rejectRefresh(new Error("Host status unavailable"));
  await settle();
  assert.equal(list.children.length, 0);
  assert.equal(status.textContent, "Unavailable");
  assert.equal(status.attributes.get("aria-busy"), "false");
  assert.equal(error.hidden, false);
  assert.equal(view.elements.get("refresh-native-devices").disabled, true);
});

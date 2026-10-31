import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const scopeStartMarker = "function captureWorkspaceReadScope(profile = state.profile)";
const scopeEndMarker = "function captureHostShareMutation";
const startMarker = "async function openWorkspace()";
const endMarker = "async function maybeOpenWorkspaceForCurrentAccount()";
const scopeStart = main.indexOf(scopeStartMarker);
const scopeEnd = main.indexOf(scopeEndMarker, scopeStart + scopeStartMarker.length);
const start = main.indexOf(startMarker);
const end = main.indexOf(endMarker, start + startMarker.length);
assert.ok(scopeStart >= 0 && scopeEnd > scopeStart, "workspace read scope source boundaries should exist");
assert.ok(start >= 0 && end > start, "openWorkspace source boundaries should exist");
const workspaceReadScopeSource = main.slice(scopeStart, scopeEnd);
const openWorkspaceSource = main.slice(start, end);
const phases = [
  "begin",
  "identity-session-start",
  "identity-session-complete",
  "node-registration-start",
  "node-registration-complete",
  "existing-window-reused",
  "workspace-load-start",
  "workspace-load-complete",
  "scope-account-changed",
  "scope-host-context-changed",
  "scope-host-instance-changed",
  "scope-connection-changed",
  "scope-rejection-unclassified",
  "captured-window-discarded",
  "window-ready-to-show",
  "window-shown",
  "window-closed",
];

function fixture({ e2e = true, existingWindow = null, sequence = 0, overrides = {} } = {}) {
  const calls = [];
  const output = [];
  const createdWindows = [];
  const account = { email: "private-account@example.invalid", accessToken: "private-account-token", subject: "account-subject" };
  const workspaceUrl = "https://private-workspace.example.invalid";
  const runtime = {
    sessionEpoch: 1,
    ownerHostInstanceGeneration: 1,
    ownerHostManager: null,
    ownerHostStatus: { url: null, startedAt: null },
    loadHandlers: [],
  };
  const handlers = new WeakMap();
  const scope = {
    process: { env: { SPS_DESKTOP_E2E: e2e ? "1" : "0" } },
    console: { error: (...args) => output.push(args.join(" ")) },
    path,
    __dirname: "C:/private/sps-desktop/src",
    state: { profile: { connectionKind: "member", hubUrl: workspaceUrl }, teamAccess: null, ownerHostOwnerSubject: null },
    structuredClone,
    currentDesktopAccount: () => account,
    currentDesktopAccountSubject: () => account?.subject ?? null,
    currentDesktopSessionEpoch: () => runtime.sessionEpoch,
    isOwnerHostProfile: () => false,
    currentAccountOwnsOwnerHost: () => true,
    ownerHostIsReady: () => false,
    get ownerHostInstanceGeneration() { return runtime.ownerHostInstanceGeneration; },
    set ownerHostInstanceGeneration(value) { runtime.ownerHostInstanceGeneration = value; },
    get ownerHostManager() { return runtime.ownerHostManager; },
    set ownerHostManager(value) { runtime.ownerHostManager = value; },
    get ownerHostStatus() { return runtime.ownerHostStatus; },
    set ownerHostStatus(value) { runtime.ownerHostStatus = value; },
    currentBoardToken: () => "private-board-token",
    workspaceHubUrl: () => scope.state.profile?.hubUrl ?? null,
    setupMode: true,
    establishSpsIdentityCoreSession: async origin => {
      calls.push(["identity-session", origin]);
      return true;
    },
    ensureJoinedDesktopNode: async () => calls.push("node-registration"),
    workspaceWindow: existingWindow,
    workspaceOrigin: existingWindow ? workspaceUrl : null,
    closeWorkspaceWindow: () => calls.push("close-workspace-window"),
    BrowserWindow: class FakeBrowserWindow {
      constructor(options) {
        calls.push(["create-window", options]);
        this.destroyed = false;
        this.shown = false;
        this.focused = false;
        this.closeCalls = 0;
        this.destroyCalls = 0;
        this.webContents = { willPreventUnload: false };
        this.loadURL = async url => {
          calls.push(["load-url", url]);
          const loadHandler = runtime.loadHandlers.shift();
          if (loadHandler) await loadHandler(this, url);
        };
        this.isDestroyed = () => this.destroyed;
        this.isMinimized = () => false;
        this.show = () => { this.shown = true; calls.push(["show-window", this]); };
        this.focus = () => { this.focused = true; calls.push(["focus-window", this]); };
        this.close = () => {
          this.closeCalls += 1;
          calls.push(["close-window", this]);
          if (this.webContents.willPreventUnload) return;
          if (this.destroyed) return;
          this.destroyed = true;
          handlers.get(this)?.get("closed")?.();
        };
        this.destroy = () => {
          this.destroyCalls += 1;
          calls.push(["destroy-window", this]);
          if (this.destroyed) return;
          this.destroyed = true;
          handlers.get(this)?.get("closed")?.();
        };
        this.once = (event, handler) => {
          calls.push(["window-once", event, handler]);
          const ownHandlers = handlers.get(this) ?? new Map();
          ownHandlers.set(event, handler);
          handlers.set(this, ownHandlers);
        };
        this.on = (event, handler) => {
          calls.push(["window-on", event, handler]);
          const ownHandlers = handlers.get(this) ?? new Map();
          ownHandlers.set(event, handler);
          handlers.set(this, ownHandlers);
        };
        createdWindows.push(this);
      }
    },
    createSpsWorkspaceWindowPreferences: preload => ({ preload }),
    createApplicationMenu: () => calls.push("application-menu"),
    refreshTrayMenu: () => calls.push("tray-menu"),
    configureWorkspaceNavigation: (window, origin) => calls.push(["configure-navigation", window, origin]),
    mainWindow: null,
    workspaceOpenTraceSequence: sequence,
    ...overrides,
  };
  runInNewContext(`${workspaceReadScopeSource}\n${openWorkspaceSource}\nthis.captureWorkspaceReadScope = captureWorkspaceReadScope; this.openWorkspace = openWorkspace;`, scope);
  return { scope, calls, output, createdWindows, account, workspaceUrl, runtime, handlers };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function eventHandler(harness, window, event) {
  const handler = harness.handlers.get(window)?.get(event);
  assert.equal(typeof handler, "function", `expected ${event} handler`);
  return handler;
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20 && !predicate(); attempt += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(predicate(), "expected asynchronous operation to reach its deferred phase");
}

function parseTraceLines(lines) {
  return lines.map(line => {
    const match = /^\[workspace-open\] operation=(\d+),phase=([a-z-]+)$/.exec(line);
    assert.ok(match, `unexpected workspace trace line: ${line}`);
    return { operation: Number(match[1]), phase: match[2] };
  });
}

test("production environment completes session, node registration, and window load without trace output", async () => {
  const harness = fixture({ e2e: false });

  await harness.scope.openWorkspace();

  assert.deepEqual(harness.output, []);
  assert.deepEqual(harness.calls.filter(call => Array.isArray(call) && ["identity-session", "load-url"].includes(call[0])).map(call => call[0]), [
    "identity-session",
    "load-url",
  ]);
  assert.ok(harness.calls.includes("node-registration"));
  assert.equal(harness.createdWindows.length, 1);
  assert.equal(harness.scope.workspaceOpenTraceSequence, 0);
});

test("E2E traces use bounded operation ids, fixed phases, and no runtime values", async () => {
  const harness = fixture();

  await harness.scope.openWorkspace();

  const traces = parseTraceLines(harness.output);
  assert.deepEqual(traces, [
    { operation: 1, phase: "begin" },
    { operation: 1, phase: "identity-session-start" },
    { operation: 1, phase: "identity-session-complete" },
    { operation: 1, phase: "node-registration-start" },
    { operation: 1, phase: "node-registration-complete" },
    { operation: 1, phase: "workspace-load-start" },
    { operation: 1, phase: "workspace-load-complete" },
  ]);
  assert.ok(traces.every(({ operation }) => operation >= 1 && operation <= 65535));
  assert.ok(traces.every(({ phase }) => phases.includes(phase)));
  for (const secret of [harness.account.email, harness.account.accessToken, "private-board-token", harness.workspaceUrl, "C:/private/sps-desktop/src"]) {
    assert.ok(!harness.output.join("\n").includes(secret));
  }
  assert.ok(harness.calls.some(call => Array.isArray(call) && call[0] === "load-url" && call[1] === `${harness.workspaceUrl}/`));
});

test("trace call sites use only fixed phase literals", () => {
  const traceCalls = [...openWorkspaceSource.matchAll(/\btrace\(([^)]*)\);/g)].map(match => match[1]);

  assert.ok(traceCalls.length > 0);
  assert.deepEqual(traceCalls, traceCalls.map(argument => {
    const literal = /^"([a-z-]+)"$/.exec(argument);
    assert.ok(literal, `trace phase must be a fixed string literal: ${argument}`);
    assert.ok(phases.includes(literal[1]), `unknown trace phase: ${literal[1]}`);
    return argument;
  }));
});

test("ready/closed diagnostics retain fixed lifecycle phases without changing production silence", async () => {
  for (const e2e of [false, true]) {
    const harness = fixture({ e2e });
    await harness.scope.openWorkspace();
    const window = harness.createdWindows[0];
    eventHandler(harness, window, "ready-to-show")();
    assert.equal(window.shown, true);
    window.destroy();
    if (!e2e) assert.deepEqual(harness.output, []);
    else assert.deepEqual(parseTraceLines(harness.output).slice(-3).map(entry => entry.phase),
      ["window-ready-to-show", "window-shown", "window-closed"]);
  }
});

test("stale readiness records only the rejected boundary category, never its profile values", async () => {
  for (const [change, expected] of [
    [harness => { harness.runtime.sessionEpoch++; }, "scope-account-changed"],
    [harness => { harness.scope.state.profile.privateValue = "private-profile-value"; }, "scope-connection-changed"],
    [harness => { harness.scope.state.teamAccess = { privateValue: "private-team-value" }; }, "scope-host-context-changed"],
  ]) {
    const harness = fixture();
    await harness.scope.openWorkspace();
    change(harness);
    eventHandler(harness, harness.createdWindows[0], "ready-to-show")();
    const phases = parseTraceLines(harness.output).map(entry => entry.phase);
    assert.ok(phases.includes(expected));
    assert.ok(phases.includes("captured-window-discarded"));
    assert.ok(phases.includes("window-closed"));
    assert.equal(harness.createdWindows[0].destroyed, true);
    assert.doesNotMatch(harness.output.join("\n"), /private-profile|private-team|private-account|private-workspace/);
  }
});

test("authentication, profile, and ownership denials happen before window creation", async t => {
  const cases = [
    { name: "signed out", overrides: { currentDesktopAccount: () => null }, error: /Sign in to SPS/ },
    { name: "missing profile", overrides: { state: { profile: null } }, error: /Save an SPS team connection/ },
    {
      name: "wrong owner account",
      overrides: { isOwnerHostProfile: () => true, currentAccountOwnsOwnerHost: () => false },
      error: /owns this SPS Server/,
    },
    {
      name: "missing member credentials",
      overrides: { currentBoardToken: () => null, currentDesktopAccount: () => ({ email: "private-account@example.invalid" }) },
      error: /Continue with SPS sign-in/,
    },
    { name: "missing workspace origin", overrides: { workspaceHubUrl: () => null }, error: /Save an SPS team connection/ },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const harness = fixture({ overrides: scenario.overrides });

      await assert.rejects(harness.scope.openWorkspace(), scenario.error);

      assert.equal(harness.createdWindows.length, 0);
      assert.ok(!harness.calls.some(call => Array.isArray(call) && call[0] === "create-window"));
      assert.ok(!harness.calls.some(call => Array.isArray(call) && call[0] === "identity-session"));
      assert.ok(!harness.calls.includes("node-registration"));
      const traces = parseTraceLines(harness.output);
      assert.deepEqual(traces.map(({ phase }) => phase), ["begin"]);
    });
  }
});

test("account subject and session epoch changes during identity setup prevent window creation", async () => {
  const identity = deferred();
  let identityStarted = false;
  const harness = fixture({ overrides: { establishSpsIdentityCoreSession: () => { identityStarted = true; return identity.promise; } } });

  const opening = harness.scope.openWorkspace();
  await waitFor(() => identityStarted);
  harness.account.subject = "different-account-subject";
  harness.runtime.sessionEpoch += 1;
  identity.resolve(true);

  await assert.rejects(opening, /account changed during a Workspace read/);
  assert.equal(harness.createdWindows.length, 0);
});

test("profile and hub changes during node registration prevent window creation", async () => {
  const registration = deferred();
  let registrationStarted = false;
  const harness = fixture({ overrides: { ensureJoinedDesktopNode: () => { registrationStarted = true; return registration.promise; } } });

  const opening = harness.scope.openWorkspace();
  await waitFor(() => registrationStarted);
  harness.scope.state.profile = { connectionKind: "member", hubUrl: "https://different-workspace.example.invalid", changed: true };
  registration.resolve();

  await assert.rejects(opening, /connection changed during a Workspace read/);
  assert.equal(harness.createdWindows.length, 0);
});

test("same-account epoch changes during node registration reject ABA account reuse", async () => {
  const registration = deferred();
  let registrationStarted = false;
  const harness = fixture({ overrides: { ensureJoinedDesktopNode: () => { registrationStarted = true; return registration.promise; } } });

  const opening = harness.scope.openWorkspace();
  await waitFor(() => registrationStarted);
  harness.runtime.sessionEpoch += 1;
  registration.resolve();

  await assert.rejects(opening, /account changed during a Workspace read/);
  assert.equal(harness.account.subject, "account-subject");
  assert.equal(harness.createdWindows.length, 0);
});

test("Owner Host instance generation changes during node registration prevent window creation", async () => {
  const registration = deferred();
  const hostManager = {};
  let registrationStarted = false;
  const harness = fixture({ overrides: {
    isOwnerHostProfile: () => true,
    ownerHostManager: hostManager,
    ownerHostStatus: { url: "http://127.0.0.1:4317", startedAt: 1 },
    ownerHostIsReady: () => false,
    ensureJoinedDesktopNode: () => { registrationStarted = true; return registration.promise; },
  } });

  const opening = harness.scope.openWorkspace();
  await waitFor(() => registrationStarted);
  harness.scope.ownerHostInstanceGeneration += 1;
  registration.resolve();

  await assert.rejects(opening, /Owner Host instance changed during a Workspace read/);
  assert.equal(harness.createdWindows.length, 0);
});

test("stale ready-to-show destroys its captured window despite a will-unload close veto", async () => {
  const loading = deferred();
  const harness = fixture();
  harness.runtime.loadHandlers.push(() => loading.promise);
  const opening = harness.scope.openWorkspace();
  await waitFor(() => harness.createdWindows.length === 1);
  const staleWindow = harness.createdWindows[0];
  assert.ok(staleWindow);

  harness.account.subject = "changed-before-ready";
  staleWindow.webContents.willPreventUnload = true;
  const newerWindow = { isDestroyed: () => false };
  harness.scope.workspaceWindow = newerWindow;
  eventHandler(harness, staleWindow, "ready-to-show")();

  assert.equal(staleWindow.shown, false);
  assert.equal(staleWindow.closeCalls, 0);
  assert.equal(staleWindow.destroyCalls, 1);
  assert.equal(staleWindow.destroyed, true);
  assert.equal(harness.scope.workspaceWindow, newerWindow);
  loading.resolve();
  await assert.rejects(opening, /account changed during a Workspace read/);
  assert.equal(harness.scope.workspaceWindow, newerWindow);
});

test("late stale load completion destroys only its old window, despite unload veto", async () => {
  const oldLoad = deferred();
  const newerLoad = deferred();
  const harness = fixture();
  harness.runtime.loadHandlers.push(() => oldLoad.promise, () => newerLoad.promise);

  const oldOpening = harness.scope.openWorkspace();
  await waitFor(() => harness.createdWindows.length === 1);
  const oldWindow = harness.createdWindows[0];
  assert.ok(oldWindow);
  oldWindow.webContents.willPreventUnload = true;

  harness.runtime.sessionEpoch += 1;
  harness.scope.state.profile = { ...harness.scope.state.profile, hubUrl: "https://newer-workspace.example.invalid" };
  const newOpening = harness.scope.openWorkspace();
  await waitFor(() => harness.createdWindows.length === 2);
  const newWindow = harness.createdWindows[1];
  assert.ok(newWindow);
  assert.equal(harness.scope.workspaceWindow, newWindow);

  oldLoad.resolve();
  await assert.rejects(oldOpening, /account changed during a Workspace read/);
  assert.equal(oldWindow.closeCalls, 0);
  assert.equal(oldWindow.destroyCalls, 1);
  assert.equal(oldWindow.destroyed, true);
  assert.equal(newWindow.destroyed, false);
  assert.equal(harness.scope.workspaceWindow, newWindow);

  newerLoad.resolve();
  await newOpening;
});

test("ordinary workspace load failure leaves the current window intact", async () => {
  const failure = new Error("workspace network failure");
  const harness = fixture();
  harness.runtime.loadHandlers.push(() => Promise.reject(failure));

  await assert.rejects(harness.scope.openWorkspace(), error => error === failure);

  const window = harness.createdWindows[0];
  assert.ok(window);
  assert.equal(window.destroyCalls, 0);
  assert.equal(window.closeCalls, 0);
  assert.equal(window.destroyed, false);
  assert.equal(harness.scope.workspaceWindow, window);
});

test("existing workspace window is reused without another load", async () => {
  const calls = [];
  const existingWindow = {
    isDestroyed: () => false,
    isMinimized: () => false,
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  };
  const harness = fixture({ existingWindow });

  await harness.scope.openWorkspace();

  assert.equal(harness.createdWindows.length, 0);
  assert.ok(!harness.calls.some(call => Array.isArray(call) && call[0] === "load-url"));
  assert.deepEqual(calls, ["show", "focus"]);
  assert.deepEqual(parseTraceLines(harness.output).map(({ phase }) => phase), [
    "begin",
    "identity-session-start",
    "identity-session-complete",
    "node-registration-start",
    "node-registration-complete",
    "existing-window-reused",
  ]);
});

test("E2E operation ids wrap from 65535 to 1", async () => {
  const harness = fixture({ sequence: 65535 });

  await harness.scope.openWorkspace();

  assert.deepEqual(parseTraceLines(harness.output).map(({ operation }) => operation), Array(7).fill(1));
  assert.equal(harness.scope.workspaceOpenTraceSequence, 1);
});

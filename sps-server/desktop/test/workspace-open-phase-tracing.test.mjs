import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const startMarker = "async function openWorkspace()";
const endMarker = "async function maybeOpenWorkspaceForCurrentAccount()";
const start = main.indexOf(startMarker);
const end = main.indexOf(endMarker, start + startMarker.length);
assert.ok(start >= 0 && end > start, "openWorkspace source boundaries should exist");
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
];

function fixture({ e2e = true, existingWindow = null, sequence = 0, overrides = {} } = {}) {
  const calls = [];
  const output = [];
  const createdWindows = [];
  const account = { email: "private-account@example.invalid", accessToken: "private-account-token" };
  const workspaceUrl = "https://private-workspace.example.invalid";
  const scope = {
    process: { env: { SPS_DESKTOP_E2E: e2e ? "1" : "0" } },
    console: { error: (...args) => output.push(args.join(" ")) },
    path,
    __dirname: "C:/private/sps-desktop/src",
    state: { profile: { connectionKind: "member" } },
    currentDesktopAccount: () => account,
    isOwnerHostProfile: () => false,
    currentAccountOwnsOwnerHost: () => true,
    currentBoardToken: () => "private-board-token",
    workspaceHubUrl: () => workspaceUrl,
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
        this.webContents = {};
        this.loadURL = async url => {
          calls.push(["load-url", url]);
        };
        this.once = (event, handler) => calls.push(["window-once", event, handler]);
        this.on = (event, handler) => calls.push(["window-on", event, handler]);
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
  runInNewContext(`${openWorkspaceSource}\nthis.openWorkspace = openWorkspace;`, scope);
  return { scope, calls, output, createdWindows, account, workspaceUrl };
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

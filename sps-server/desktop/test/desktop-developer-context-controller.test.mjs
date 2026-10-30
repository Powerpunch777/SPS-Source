import assert from "node:assert/strict";
import test from "node:test";

import { registerDesktopDeveloperContextIpc } from "../src/desktop-developer-context-controller.mjs";

const channels = [
  "desktop:workspace-developer-context-get",
  "desktop:workspace-developer-context-open",
  "desktop:workspace-developer-agent-folder-check",
  "desktop:developer-context-get",
  "desktop:developer-context-link",
  "desktop:developer-context-clear",
];

function makeHarness(overrides = {}) {
  const handlers = new Map();
  const calls = [];
  const guards = [];
  const ipcMain = { handle(channel, handler) { handlers.set(channel, handler); } };
  const event = { sender: { id: 17 } };
  const callback = (name) => async (...args) => {
    calls.push({ name, args });
    return { name, args };
  };
  const dependencies = {
    assertLocalOwnerWorkspace: (...args) => { guards.push({ name: "workspace", args }); },
    assertRegistryWindowEvent: (...args) => { guards.push({ name: "registry-window", args }); },
    assertRegistryOwner: (...args) => { guards.push({ name: "registry-owner", args }); },
    getDesktopDeveloperContext: callback("getDesktopDeveloperContext"),
    openDesktopDeveloperContext: callback("openDesktopDeveloperContext"),
    checkDesktopDeveloperAgentFolder: callback("checkDesktopDeveloperAgentFolder"),
    getRegistryDeveloperContext: callback("getRegistryDeveloperContext"),
    linkRegistryDeveloperContext: callback("linkRegistryDeveloperContext"),
    clearRegistryDeveloperContext: callback("clearRegistryDeveloperContext"),
    ...overrides,
  };
  registerDesktopDeveloperContextIpc({ ipcMain, ...dependencies });
  return { handlers, calls, guards, event };
}

test("registers all workspace and Registry developer-context IPC channels", () => {
  const harness = makeHarness();
  assert.deepEqual([...harness.handlers.keys()], channels);
});

test("forwards workspace context inputs whole and returns each parent callback result", async () => {
  const harness = makeHarness();
  const inputs = [
    { projectId: "workspace-project", contextToken: "workspace-token", workspaceKey: "exact-key", ignored: "parent validates" },
    { projectId: "workspace-project", contextToken: "workspace-token", workspaceKey: "exact-key", folderPath: "parent validates" },
  ];

  for (const [index, channel] of channels.slice(0, 2).entries()) {
    const result = await harness.handlers.get(channel)(harness.event, inputs[index]);
    assert.deepEqual(result, {
      name: index === 0 ? "getDesktopDeveloperContext" : "openDesktopDeveloperContext",
      args: [inputs[index]],
    });
  }
  assert.deepEqual(harness.guards, [
    { name: "workspace", args: [harness.event, "Developer project context"] },
    { name: "workspace", args: [harness.event, "Developer project context"] },
  ]);
});

test("forwards Registry context with only project ID and context token", async () => {
  const harness = makeHarness();
  const input = {
    projectId: "registry-project",
    contextToken: "opaque-window-token",
    folderPath: "C:\\arbitrary\\path",
    workspacePath: "C:\\other\\path",
    extra: { arbitrary: true },
  };

  assert.deepEqual(await harness.handlers.get("desktop:developer-context-get")(harness.event, input), {
    name: "getRegistryDeveloperContext",
    args: [],
  });
  assert.deepEqual(await harness.handlers.get("desktop:developer-context-link")(harness.event, input), {
    name: "linkRegistryDeveloperContext",
    args: [{ projectId: "registry-project", contextToken: "opaque-window-token" }],
  });
  assert.deepEqual(await harness.handlers.get("desktop:developer-context-clear")(harness.event, input), {
    name: "clearRegistryDeveloperContext",
    args: [{ contextToken: "opaque-window-token" }],
  });
  assert.deepEqual(harness.guards, [
    { name: "registry-window", args: [harness.event] },
    { name: "registry-owner", args: [] },
    { name: "registry-window", args: [harness.event] },
    { name: "registry-owner", args: [] },
    { name: "registry-window", args: [harness.event] },
    { name: "registry-owner", args: [] },
  ]);
});

test("forwards folder checks only after the local Host window guard", async () => {
  const harness = makeHarness();
  const input = { context: { companyId: "workspace" }, agentId: "agent" };
  assert.deepEqual(await harness.handlers.get("desktop:workspace-developer-agent-folder-check")(harness.event, input), {
    name: "checkDesktopDeveloperAgentFolder", args: [input],
  });
  assert.deepEqual(harness.guards, [{ name: "workspace", args: [harness.event, "Developer Agent folder check"] }]);
});

test("denies every workspace context channel for a wrong window or Member before callbacks", async () => {
  for (const denial of ["Wrong workspace window", "Owner workspace required"]) {
    const error = new Error(denial);
    const harness = makeHarness({
      assertLocalOwnerWorkspace: (event, action) => {
        harness.guards.push({ name: "workspace", args: [event, action] });
        throw error;
      },
    });

    for (const channel of channels.slice(0, 3)) {
      await assert.rejects(harness.handlers.get(channel)(harness.event, { projectId: "p" }), (actual) => actual === error);
    }
    assert.equal(harness.calls.length, 0);
    assert.deepEqual(harness.guards, channels.slice(0, 3).map((channel) => ({
      name: "workspace",
      args: [harness.event, channel.endsWith("folder-check") ? "Developer Agent folder check" : "Developer project context"],
    })));
  }
});

test("denies every Registry context channel from a wrong window before any other guard or callback", async () => {
  const error = new Error("Wrong Registry window");
  const harness = makeHarness({
    assertRegistryWindowEvent: (event) => {
      harness.guards.push({ name: "registry-window", args: [event] });
      throw error;
    },
  });

  for (const channel of channels.slice(3)) {
    await assert.rejects(harness.handlers.get(channel)(harness.event, { projectId: "p" }), (actual) => actual === error);
  }
  assert.equal(harness.calls.length, 0);
  assert.deepEqual(harness.guards, channels.slice(3).map(() => ({ name: "registry-window", args: [harness.event] })));
});

test("denies every Registry context channel without Owner authority before callbacks", async () => {
  const error = new Error("Owner required");
  const harness = makeHarness({
    assertRegistryOwner: () => {
      harness.guards.push({ name: "registry-owner", args: [] });
      throw error;
    },
  });

  for (const channel of channels.slice(3)) {
    await assert.rejects(harness.handlers.get(channel)(harness.event, { projectId: "p" }), (actual) => actual === error);
  }
  assert.equal(harness.calls.length, 0);
  assert.deepEqual(harness.guards, channels.slice(3).flatMap(() => [
    { name: "registry-window", args: [harness.event] },
    { name: "registry-owner", args: [] },
  ]));
});

test("propagates callback errors without replacing them", async () => {
  for (const [index, channel] of channels.entries()) {
    const error = new Error(`callback failure ${index}`);
    const callbackName = [
      "getDesktopDeveloperContext",
      "openDesktopDeveloperContext",
      "checkDesktopDeveloperAgentFolder",
      "getRegistryDeveloperContext",
      "linkRegistryDeveloperContext",
      "clearRegistryDeveloperContext",
    ][index];
    const harness = makeHarness({ [callbackName]: async () => { throw error; } });
    await assert.rejects(
      harness.handlers.get(channel)(harness.event, { projectId: "project", contextToken: "token" }),
      (actual) => actual === error,
    );
  }
});

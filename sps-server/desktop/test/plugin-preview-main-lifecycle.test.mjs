import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { createSpsPluginPreviewOperationGate } from "../src/plugin-preview-operation-gate.mjs";

const source = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const begin = source.indexOf("async function stopDesktopPluginPreview(");
const end = source.indexOf("async function confirmPluginPreviewClose(", begin);
assert.ok(begin > 0 && end > begin);
function fixture(stop) {
  const calls = [];
  const runtime = { buildId: "owned-build", projectId: "owned-project", ownerVault: "captured-vault", manager: { stop } };
  const window = { isDestroyed: () => false, destroy: () => calls.push("window-destroyed") };
  const context = { pluginPreviewRuntime: runtime, pluginPreviewWindow: window, pluginPreviewClosing: false,
    pluginPreviewOperations: createSpsPluginPreviewOperationGate(),
    ownerVaultRoot: () => "different-vault",
    cleanupPluginPreview: async options => { calls.push(["remove", options]); },
    recordDesktopPluginPreviewDiagnostic: async options => { calls.push(["diagnostic", options]); },
  };
  runInNewContext(`${source.slice(begin, end)}\nthis.run=stopDesktopPluginPreview;`, context);
  return { context, runtime, window, calls, run: context.run };
}

test("Main retains Preview owner, window and data when stop rejects without removeData", async () => {
  const failure = new Error("owned tree closure unconfirmed");
  const f = fixture(async () => { throw failure; });
  await assert.rejects(f.run({ removeData: false }), /unconfirmed|did not stop completely/);
  assert.equal(f.context.pluginPreviewRuntime, f.runtime);
  assert.equal(f.context.pluginPreviewWindow, f.window);
  assert.deepEqual(f.calls, []);
});

test("non-stopped Preview status cannot become a successful stop or removal", async () => {
  for (const state of ["starting", "stopping", "running-existing"]) {
    const f = fixture(async () => ({ state }));
    await assert.rejects(f.run({ removeData: false }), /did not stop completely/);
    assert.equal(f.context.pluginPreviewRuntime, f.runtime);
    assert.deepEqual(f.calls, []);
  }
});

test("confirmed Preview removal uses its captured Vault and releases only after cleanup", async () => {
  const f = fixture(async () => ({ state: "stopped" }));
  await f.run({ removeData: true });
  assert.equal(f.context.pluginPreviewRuntime, null);
  assert.equal(f.context.pluginPreviewWindow, null);
  const removal = f.calls.find(call => Array.isArray(call) && call[0] === "remove");
  assert.equal(removal[1].ownerVault, "captured-vault");
  assert.equal(removal[1].buildId, "owned-build");
  assert.equal(f.calls[0], "window-destroyed");
});

test("failed Preview data cleanup retains the stopped owner for review and retry", async () => {
  const f = fixture(async () => ({ state: "stopped" }));
  f.context.cleanupPluginPreview = async () => { throw new Error("cleanup failed"); };
  await assert.rejects(f.run({ removeData: true }), /cleanup failed/);
  assert.equal(f.context.pluginPreviewRuntime, f.runtime);
  assert.equal(f.calls.some(call => Array.isArray(call) && call[0] === "diagnostic"), false);
});

const startBegin = source.indexOf("async function startDesktopPluginPreview(");
const startEnd = source.indexOf("async function ensurePluginPreviewWorkspace(", startBegin);
function startingFixture({ manager, prepare = async () => ({ fixture: {} }) } = {}) {
  const f = fixture(async () => ({ state: "stopped" }));
  f.context.pluginPreviewRuntime = null;
  f.context.pluginPreviewWindow = null;
  f.context.isQuitting = false;
  f.context.accountSubject = "original-owner";
  f.context.connectionGeneration = 1n;
  f.context.connectionChanging = false;
  f.context.currentDesktopAccountSubject = () => f.context.accountSubject;
  f.context.ownerVaultOperations = {
    isRestoring: () => false,
    isChangingConnection: () => f.context.connectionChanging,
    connectionGeneration: () => f.context.connectionGeneration,
  };
  f.context.ensurePluginPreviewFixture = prepare;
  f.context.createPluginPreviewRuntime = async ({ ownerVault, buildId }) => ({ ownerVault, buildId, manager });
  f.context.resolveDesktopPluginPreviewRuntime = async () => null;
  f.context.fetch = async () => {};
  f.context.spawnChildProcess = () => {};
  f.context.createDeveloperCommandEnvironment = () => ({});
  f.context.process = { env: {} };
  runInNewContext(`${source.slice(startBegin, startEnd)}\nthis.start=startDesktopPluginPreview;this.shutdown=stopDesktopPluginPreviewForShutdown;`, f.context);
  return f;
}

test("Preview owner is registered before manager startup and uncertain startup keeps it", async () => {
  const failure = new Error("startup outcome uncertain");
  let f;
  const manager = { async start() {
    assert.equal(f.context.pluginPreviewRuntime.manager, manager);
    throw failure;
  }, async stop() { throw new Error("closure uncertain"); } };
  f = startingFixture({ manager });
  await assert.rejects(f.context.start({ projectId: "project-a", buildId: "build-a" }), error => error === failure);
  assert.equal(f.context.pluginPreviewRuntime.manager, manager);
  assert.equal(f.context.pluginPreviewOperations.isBusy(), false);
  await assert.rejects(f.context.start({ projectId: "project-b", buildId: "build-b" }), /closure uncertain/);
  assert.equal(f.context.pluginPreviewRuntime.buildId, "build-a");
});

test("simultaneous project starts cannot lose the first pending Preview owner", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  let startCalls = 0;
  const manager = { async start() { startCalls += 1; return pending; }, async stop() { return { state: "stopped" }; } };
  const f = startingFixture({ manager });
  const first = f.context.start({ projectId: "project-a", buildId: "build-a" });
  await assert.rejects(f.context.start({ projectId: "project-b", buildId: "build-b" }), /still in progress/);
  while (startCalls === 0) await Promise.resolve();
  assert.equal(f.context.pluginPreviewRuntime.buildId, "build-a");
  release({ state: "running", owned: true });
  assert.equal((await first).buildId, "build-a");
  assert.equal(startCalls, 1);
});

test("shutdown joins pending Preview configuration and cannot spawn after quitting", async () => {
  let release;
  let entered;
  const didEnter = new Promise(resolve => { entered = resolve; });
  const preparation = new Promise(resolve => { release = resolve; });
  let starts = 0;
  const f = startingFixture({ manager: { async start() { starts += 1; }, async stop() { return { state: "stopped" }; } },
    prepare: async () => { entered(); return preparation; } });
  const first = f.context.start({ projectId: "project-a", buildId: "build-a" });
  await didEnter;
  f.context.isQuitting = true;
  let finished = false;
  const shutdown = f.context.shutdown().then(() => { finished = true; });
  await Promise.resolve();
  assert.equal(finished, false);
  release({ fixture: {} });
  await assert.rejects(first, /closing/);
  await shutdown;
  assert.equal(starts, 0);
  assert.equal(f.context.pluginPreviewRuntime, null);
});

test("a foreign Preview still records its failure when closure remains unconfirmed", async () => {
  const f = startingFixture({ manager: { async start() { return { state: "running-existing", owned: false }; },
    async stop() { throw new Error("foreign closure unconfirmed"); } } });
  await assert.rejects(f.context.start({ projectId: "project-a", buildId: "build-a" }), /unconfirmed/);
  assert.equal(f.calls.some(call => Array.isArray(call) && call[1].code === "PREVIEW_RUNTIME_FOREIGN_PROCESS"), true);
  assert.equal(f.context.pluginPreviewRuntime.buildId, "build-a");
});

test("an ABA account/connection change during preparation cannot launch its Preview", async () => {
  let release;
  let entered;
  const didEnter = new Promise(resolve => { entered = resolve; });
  const preparing = new Promise(resolve => { release = resolve; });
  let starts = 0;
  const f = startingFixture({ manager: { async start() { starts += 1; }, async stop() { return { state: "stopped" }; } },
    prepare: async () => { entered(); return preparing; } });
  const pending = f.context.start({ projectId: "project-a", buildId: "build-a" });
  await didEnter;
  f.context.connectionGeneration += 2n;
  release({ fixture: {} });
  await assert.rejects(pending, /context changed/);
  assert.equal(starts, 0);
  assert.equal(f.context.pluginPreviewRuntime, null);
});

test("connection invalidation joins Preview teardown before allowing account changes", async () => {
  const gateStart = source.indexOf("const ownerVaultOperations = createSpsOwnerVaultOperationGate({");
  const gateEnd = source.indexOf("const ownerHostRestoreRunner =", gateStart);
  assert.ok(source.slice(gateStart, gateEnd).includes("return Promise.all([nodeCleanup, stopDesktopPluginPreviewForContextChange({ closeWindow: true })])"));
});

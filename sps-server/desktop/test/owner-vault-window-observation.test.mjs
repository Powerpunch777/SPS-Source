import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { observeNativeTransferWindows, observeTransferWindows } from "../scripts/owner-vault-window-observation.mjs";

const privateValue = "private-person@example.invalid C:\\private\\profile";
function nativeWindow(url = "about:blank", overrides = {}) {
  return { isDestroyed: () => false, isVisible: () => true,
    webContents: { isDestroyed: () => false, getURL: () => url, isLoading: () => true,
      isLoadingMainFrame: () => true, isWaitingForResponse: () => false, isCrashed: () => false }, ...overrides };
}
const evaluate = rows => observeNativeTransferWindows({ BrowserWindow: { getAllWindows: () => rows } });

test("transfer window diagnostics distinguish native loading from tracked pages without revealing locations", async () => {
  const native = evaluate([nativeWindow(), nativeWindow(`file:///C:/private/${privateValue}`),
    nativeWindow("http://127.0.0.1:12345/private?token=private-token"), nativeWindow(`https://${privateValue}`)]);
  const observation = await observeTransferWindows({ evaluate: async fn => {
    assert.equal(fn, observeNativeTransferWindows);
    return native;
  }, windows: () => [{ url: () => `file:///C:/private/${privateValue}`, isClosed: () => false }] });
  assert.deepEqual(observation.native.windows.map(row => row.kind), ["blank", "file", "loopback-http", "other"]);
  assert.equal(observation.native.windows[0].loadingMainFrame, true);
  assert.equal(observation.native.windows[0].waitingForResponse, false);
  assert.deepEqual(observation.tracked.windows, [{ kind: "file", closed: false }]);
  assert.doesNotMatch(JSON.stringify(observation), /private|token|example|C:|127\.0\.0\.1/);
});

test("native diagnostic is serializable to Main without closing over module variables", () => {
  const detached = Function(`return (${observeNativeTransferWindows.toString()})`)();
  assert.deepEqual(detached({ BrowserWindow: { getAllWindows: () => [nativeWindow()] } }), evaluate([nativeWindow()]));
});

test("diagnostics bound window counts and represent closed or unreadable contents explicitly", async () => {
  const closed = nativeWindow("", { isDestroyed: () => true });
  const broken = nativeWindow("", { isVisible: () => { throw new Error(privateValue); } });
  const native = evaluate([closed, broken, ...Array.from({ length: 40 }, () => nativeWindow())]);
  assert.equal(native.count, 33);
  assert.equal(native.truncated, true);
  assert.equal(native.windows.length, 8);
  assert.deepEqual(native.windows.slice(0, 2), [{ state: "closed" }, { state: "unavailable" }]);
  const observation = await observeTransferWindows({ evaluate: async () => native,
    windows: () => Array.from({ length: 40 }, () => ({ url: () => { throw new Error(privateValue); } })) });
  assert.equal(observation.tracked.count, 33);
  assert.equal(observation.tracked.windows.length, 8);
  assert.equal(observation.tracked.truncated, true);
  assert.doesNotMatch(JSON.stringify(observation), /private|example|C:/);
});

test("unavailable Main or tracking remains unavailable, never a passing substitute", async () => {
  const result = await observeTransferWindows({ evaluate: async () => { throw new Error(privateValue); },
    windows: () => { throw new Error(privateValue); } });
  assert.deepEqual(result, { native: { state: "unavailable" }, tracked: { state: "unavailable" } });
  const native = evaluate([nativeWindow()]);
  const noTracking = await observeTransferWindows({ evaluate: async () => native,
    windows: () => { throw new Error(privateValue); } });
  assert.deepEqual(noTracking, { native: { state: "reported", ...native }, tracked: { state: "unavailable" } });
});

test("a blocked read-only Main observation settles at its fixed five-second bound", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = observeTransferWindows({ evaluate: () => new Promise(() => {}), windows: () => [] });
  t.mock.timers.tick(5000);
  assert.deepEqual(await pending, { native: { state: "unavailable" },
    tracked: { state: "reported", count: 0, truncated: false, windows: [] } });
});

test("the actual transfer wait preserves its failure and deadline after observing the two window inventories", async () => {
  const source = await readFile(new URL("../scripts/smoke-owner-vault-transfer-desktop.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function workspace(app, setup) {");
  const end = source.indexOf("async function readyHost(setup)", start);
  assert.ok(start >= 0 && end > start);
  const original = new Error("Original transfer wait did not qualify.");
  const logs = [];
  const app = { windows: () => [] };
  const sandbox = { console: { error: value => logs.push(value) },
    waitFor: async (...args) => {
      assert.equal(args.length, 2, "Observation must not change the existing wait bound");
      assert.equal(args[1], "authenticated Workspace");
      assert.equal(await args[0](), undefined);
      throw original;
    }, observeTransferWindows: async actual => {
      assert.equal(actual, app);
      return { native: { state: "unavailable" }, tracked: { state: "unavailable" } };
    } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.run = workspace;`, sandbox);
  await assert.rejects(sandbox.run(app, { evaluate: async () => ({ ownerHost: { state: "running", lastError: null } }) }),
    error => error === original);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^\[vault-transfer-window-observation\] /);
});

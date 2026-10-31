import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
const helper = main.indexOf("function refreshPluginRuntimeStatus(");
const refresh = main.indexOf("async function refreshOwnerRuntimeStatus()");
const end = main.indexOf("\nasync function requireReadyOwnerHost()", refresh);
assert.ok(refresh >= 0 && end > refresh);
const initialStateStart = main.indexOf("let pluginRuntimeStatus = {");
const initialStateEnd = main.indexOf("\n};", initialStateStart);
assert.ok(initialStateStart >= 0 && initialStateEnd > initialStateStart);
const build = new Function("inspectSpsPluginRuntime", `
  ${main.slice(initialStateStart, initialStateEnd + 3)}
  let pluginRuntimeRefreshPromise = null;
  let defaultMemoryManager = null, ownerHostManager = null;
  let ownerHostStatus = { state: "stopped" }, agentRuntimePacks = [];
  const listSpsAgentRuntimePacks = async () => [];
  const ownerAgentRuntimePacksRoot = () => "unused-fixture";
  ${main.slice(helper >= 0 ? helper : refresh, end)}
  return { refreshStatus: refreshOwnerRuntimeStatus,
    probe: typeof refreshPluginRuntimeStatus === "function" ? refreshPluginRuntimeStatus : null,
    status: () => pluginRuntimeStatus };
`);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("actual Main status refresh does not wait for an optional npm inspection", async () => {
  const probe = deferred();
  let calls = 0, statusReturned = false;
  const subject = build(() => { calls += 1; return probe.promise; });
  const refreshing = subject.refreshStatus().then(() => { statusReturned = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 0, "An ordinary status read must not spawn optional npm subprocesses.");
    assert.equal(statusReturned, true, "Status reads must not wait for an optional npm subprocess to finish.");
    assert.equal(subject.status().state, "not-inspected", "An unrequested probe must not be reported as checking or ready.");
  } finally {
    probe.resolve({ state: "ready", command: "fixture-node", version: "fixture" });
    await refreshing;
  }
});

test("polling and explicit Main inspection share one pending npm probe", async () => {
  const probe = deferred();
  let calls = 0;
  const subject = build(() => { calls += 1; return probe.promise; });
  assert.equal(typeof subject.probe, "function");
  const explicit = subject.probe();
  let explicitReturned = false;
  void explicit.then(() => { explicitReturned = true; });
  const ready = { state: "ready", command: "fixture-node", version: "fixture" };
  let pollingReturned = false;
  const polling = Promise.all([subject.refreshStatus(), subject.refreshStatus()]).then(() => { pollingReturned = true; });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(pollingReturned, true, "Status polling must return while an explicitly requested inspection is still pending.");
    assert.equal(subject.probe(), explicit);
    assert.equal(calls, 1);
    assert.equal(explicitReturned, false, "An action that explicitly needs npm must still await the inspection.");
  } finally {
    probe.resolve(ready);
    await polling;
    await explicit;
  }
  assert.deepEqual(await explicit, ready);
  await subject.refreshStatus();
  assert.equal(calls, 1, "Ordinary polling must not continuously spawn npm once its status is known.");
  assert.deepEqual(subject.status(), ready);
});

test("unexpected inspection failures are safely unavailable and an explicit later check can recover", async () => {
  let calls = 0;
  const ready = { state: "ready", command: "fixture-node", version: "fixture" };
  const subject = build(() => {
    calls += 1;
    if (calls === 1) throw new Error("private environment diagnostic");
    return ready;
  });
  assert.equal(typeof subject.probe, "function");
  const unavailable = await subject.probe();
  assert.equal(unavailable.state, "local-folder-only");
  assert.equal(unavailable.command, null);
  assert.equal(unavailable.npmCli, null);
  assert.equal(unavailable.version, null);
  assert.doesNotMatch(JSON.stringify(unavailable), /private environment/);
  assert.deepEqual(await subject.probe(), ready);
  assert.equal(calls, 2);
});

test("Main keeps the real Host health refresh and does not increase the CDP observation timeout", () => {
  assert.match(main.slice(refresh, end), /await ownerHostManager\.inspect\(\)/);
  assert.match(main, /ipcMain\.handle\("desktop:status", async \(\) => \{\s*await refreshOwnerRuntimeStatus\(\);\s*return publicStatus\(\);/);
});

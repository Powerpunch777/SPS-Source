import assert from "node:assert/strict";
import test from "node:test";
import { createSpsDesktopRuntimeDrain } from "../src/desktop-runtime-drain.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(overrides = {}) {
  const calls = [];
  return { calls, drain: createSpsDesktopRuntimeDrain({
    stopIngress: async () => { calls.push("ingress"); },
    stopScheduling: () => { calls.push("scheduling"); },
    cancelCommands: async () => { calls.push("commands"); },
    stopUpdates: () => { calls.push("updates"); },
    getManagers: () => [{ name: "Host", stop: async () => { calls.push("host"); } }],
    ...overrides,
  }) };
}

test("fences ingress and scheduling before joining all managers", async () => {
  const first = deferred(), second = deferred(), entered = deferred();
  const completed = [], traces = [];
  let managerCount = 0;
  const value = fixture({ trace: stage => traces.push(stage), getManagers: () => [
    { name: "Native Workspace", stop: async () => { managerCount++; await first.promise; }, onStopped: () => completed.push("host") },
    { name: "Native Plugin", stop: async () => { managerCount++; entered.resolve(); await second.promise; }, onStopped: () => completed.push("plugin") },
  ] });
  let done = false;
  const work = value.drain().then(() => { done = true; });
  await entered.promise;
  assert.deepEqual(value.calls, ["ingress", "scheduling", "commands", "updates"]);
  assert.equal(managerCount, 2);
  first.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, false);
  second.resolve(); await work;
  assert.deepEqual(completed, ["host", "plugin"]);
  assert.deepEqual(traces, ["stop_ingress_start", "stop_ingress_done", "stop_scheduling_start", "stop_scheduling_done",
    "cancel_commands_start", "cancel_commands_done", "stop_updates_start", "stop_updates_done", "stop_managers_start",
    "manager_native_workspace_start", "manager_native_plugin_start", "manager_native_workspace_done",
    "manager_native_plugin_done", "stop_managers_done"]);
});

test("an earlier failure still drains every manager and rejects without raw diagnostics", async () => {
  const entered = [], joined = deferred();
  let successfulCleanup = false, failedCleanup = false, settled = false;
  const value = fixture({
    stopIngress: async () => { throw new Error("private ingress detail"); },
    cancelCommands: async () => { throw new Error("private command detail"); },
    getManagers: () => [
      { name: "Host", stop: () => { entered.push("host"); throw new Error("private host detail"); }, onStopped: () => { failedCleanup = true; } },
      { name: "Plugin", stop: async () => { entered.push("plugin"); await joined.promise; }, onStopped: () => { successfulCleanup = true; } },
    ],
  });
  const outcome = value.drain().then(() => assert.fail("must reject"), error => { settled = true; return error; });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(entered, ["host", "plugin"]);
  assert.equal(settled, false);
  joined.resolve();
  const error = await outcome;
  assert.ok(error instanceof AggregateError);
  assert.deepEqual(error.errors.map(value => value.message), ["Native listener cleanup did not finish.",
    "Node command cleanup did not finish.", "Runtime manager cleanup did not finish."]);
  assert.doesNotMatch(JSON.stringify(error.errors, Object.getOwnPropertyNames(Error.prototype)), /private/);
  assert.equal(successfulCleanup, true);
  assert.equal(failedCleanup, false);
});

test("concurrent drains share work, while explicit retries use the current handles", async () => {
  const entered = deferred(), wait = deferred();
  let attempts = 0, handles = 0, fail = true;
  const value = fixture({ getManagers: () => {
    handles++;
    return [{ name: "Host", stop: async () => {
      attempts++; entered.resolve(); await wait.promise;
      if (fail) throw new Error("still alive");
    } }];
  } });
  const first = value.drain();
  const second = value.drain();
  assert.equal(first, second);
  const failure = assert.rejects(first, AggregateError);
  await entered.promise; wait.resolve(); await failure;
  assert.equal(attempts, 1);
  fail = false;
  await value.drain();
  assert.equal(attempts, 2);
  assert.equal(handles, 2);
  // Success is not cached: a failed installer can leave a new runtime to stop.
  await value.drain();
  assert.equal(attempts, 3);
});

test("traces bounded fixed manager outcomes without leaking manager names or errors", async () => {
  const traces = [];
  const value = fixture({
    trace: stage => traces.push(stage),
    getManagers: () => [
      { name: "Owner Host", stop: async () => { throw new Error("private path and token"); } },
      { name: "untrusted manager name", stop: async () => {} },
    ],
  });
  const error = await value.drain().then(() => assert.fail("must reject"), value => value);
  assert.ok(error instanceof AggregateError);
  assert.ok(traces.includes("manager_owner_host_start"));
  assert.ok(traces.includes("manager_owner_host_failed"));
  assert.equal(traces.includes("manager_owner_host_done"), false);
  assert.equal(traces.some(stage => stage.includes("untrusted")), false);
  assert.ok(traces.every(stage => /^[a-z_]+$/.test(stage)));
  assert.deepEqual(error.errors.map(item => item.message), ["Owner Host cleanup did not finish."]);
});

test("a failing diagnostic callback cannot interrupt runtime cleanup", async () => {
  const calls = [];
  const value = fixture({
    trace: () => { throw new Error("private diagnostic failure"); },
    stopIngress: async () => { calls.push("ingress"); },
    getManagers: () => [{ name: "Owner Host", stop: async () => { calls.push("host"); } }],
  });
  await value.drain();
  assert.deepEqual(calls, ["ingress", "host"]);
});

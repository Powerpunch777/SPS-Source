import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createSpsOwnerHostRestoreRunner } from "../src/owner-host-restore-runner.mjs";

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const invocation = { command: "C:\\fixture\\node.exe", cwd: "C:\\fixture", helperPath: "restore.mjs", configPath: "config", backupFile: "backup", dbModulePath: "db", embeddedPostgresModulePath: "postgres", environment: { ELECTRON_RUN_AS_NODE: "1" } };
function harness() {
  const ready = deferred(), terminal = deferred();
  let calls = 0, spawned;
  let termination = () => terminal.promise;
  const child = { supervisorReady: ready.promise, waitForOwnedJobTermination: () => terminal.promise,
    terminateOwnedJob: () => { calls += 1; return termination(); }, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() };
  const runner = createSpsOwnerHostRestoreRunner({ spawn: value => { spawned = value; return child; } });
  return { runner, ready, terminal, child, get calls() { return calls; }, get spawned() { return spawned; }, setTermination(fn) { termination = fn; } };
}
test("restore waits for owned Job emptiness and helper closure before accepting success", async () => {
  const h = harness(); let completed = false;
  const operation = h.runner.run(invocation).then(() => { completed = true; });
  assert.equal(h.runner.isActive(), true);
  assert.deepEqual(h.spawned.args, ["restore.mjs", "config", "backup", "db", "postgres"]);
  assert.equal(h.spawned.env.ELECTRON_RUN_AS_NODE, "1");
  h.ready.resolve(); await Promise.resolve();
  assert.equal(completed, false);
  await assert.rejects(h.runner.run(invocation), /still running/);
  h.terminal.resolve({ type: "exit", code: 0, activeProcesses: 0 });
  await operation;
  assert.equal(h.runner.isActive(), false);
});
test("restore reports failed child exit while releasing only confirmed ownership", async () => {
  const h = harness();
  const operation = h.runner.run(invocation);
  h.child.stderr.write("fixture restore error");
  h.ready.resolve(); h.terminal.resolve({ type: "exit", code: 1, activeProcesses: 0 });
  await assert.rejects(operation, /fixture restore error/);
  assert.equal(h.runner.isActive(), false);
});
test("uncertain restore termination blocks replacement and remains joinable for cleanup retry", async () => {
  const h = harness(); const operation = h.runner.run(invocation);
  h.ready.resolve(); h.terminal.reject(new Error("closure unconfirmed"));
  await assert.rejects(operation, /unconfirmed/);
  assert.equal(h.runner.hasUnconfirmedTermination(), true);
  await assert.rejects(h.runner.run(invocation), /still running/);
  h.setTermination(async () => { throw new Error("retry unconfirmed"); });
  await assert.rejects(h.runner.stop(), /retry unconfirmed/);
  assert.equal(h.runner.isActive(), true);
  h.setTermination(async () => ({ type: "cancelled", activeProcesses: 0 }));
  await h.runner.stop();
  assert.equal(h.runner.isActive(), false);
});
test("quit cancellation is singleflight and cannot turn a simultaneous successful exit into restore success", async () => {
  const h = harness(); const operation = h.runner.run(invocation);
  h.ready.resolve();
  const stopping = h.runner.stop(), duplicate = h.runner.stop();
  assert.equal(h.calls, 1);
  h.terminal.resolve({ type: "exit", code: 0, activeProcesses: 0 });
  await assert.rejects(operation, /cancelled/);
  await Promise.all([stopping, duplicate]);
  assert.equal(h.runner.isActive(), false);
});
test("startup failure and malformed/live terminal results never authorize a replacement", async () => {
  const startup = harness(); const operation = startup.runner.run(invocation);
  startup.ready.reject(new Error("startup unconfirmed"));
  await assert.rejects(operation, /startup unconfirmed/);
  await assert.rejects(startup.runner.run(invocation), /still running/);
  assert.equal(startup.runner.hasUnconfirmedTermination(), true);
  for (const message of [{ type: "exit", code: 0, activeProcesses: 1 }, { type: "other", activeProcesses: 0 }]) {
    const h = harness(); const running = h.runner.run(invocation);
    h.ready.resolve(); h.terminal.resolve(message);
    await assert.rejects(running, /termination is unconfirmed/);
    assert.equal(h.runner.isActive(), true);
  }
});
test("a stop without an active helper invalidates pre-promotion work and allows a later fresh operation", async () => {
  const h = harness(), initial = h.runner.generation();
  await h.runner.stop();
  assert.notEqual(h.runner.generation(), initial);
  const running = h.runner.run(invocation);
  h.ready.resolve(); h.terminal.resolve({ type: "exit", code: 0, activeProcesses: 0 });
  await running;
  assert.equal(h.runner.isActive(), false);
});

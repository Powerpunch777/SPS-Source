import assert from "node:assert/strict";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { createSpsOwnerHostRestoreRunner } from "../src/owner-host-restore-runner.mjs";

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const invocation = { command: "C:\\fixture\\node.exe", cwd: "C:\\fixture", helperPath: "restore.mjs", configPath: "config", backupFile: "backup", dbModulePath: "db", embeddedPostgresModulePath: "postgres", environment: { ELECTRON_RUN_AS_NODE: "1" } };
function harness(onSpawn = () => {}) {
  const ready = deferred(), terminal = deferred();
  let calls = 0, spawned, runner;
  let termination = () => terminal.promise;
  const child = { supervisorReady: ready.promise, waitForOwnedJobTermination: () => terminal.promise,
    terminateOwnedJob: () => { calls += 1; return termination(); }, stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() };
  runner = createSpsOwnerHostRestoreRunner({ spawn: value => { spawned = value; onSpawn(runner); return child; } });
  return { runner, ready, terminal, child, get calls() { return calls; }, get spawned() { return spawned; }, setTermination(fn) { termination = fn; } };
}
const absoluteInvocation = () => Object.fromEntries(Object.entries(invocation).map(([key, value]) =>
  [key, typeof value === "string" && !path.isAbsolute(value) ? path.resolve(value) : value]));

test("private artifact references snapshot original inputs before spawn and are immutable", async () => {
  let snapshotAtSpawn;
  const h = harness(runner => { snapshotAtSpawn = runner.readArtifactReferences(); }), input = absoluteInvocation();
  const operation = h.runner.run(input);
  const snapshot = snapshotAtSpawn;
  assert.equal(snapshot.available, true);
  assert.deepEqual(snapshot.references.map(reference => reference.kind), ["file", "directory", "file", "file", "file", "file", "file"]);
  assert.ok(snapshot.references.every(reference => Object.isFrozen(reference) && typeof reference.id === "string"));
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.references));
  const originalPaths = snapshot.references.map(reference => reference.path);
  input.command = "changed-command";
  input.configPath = "changed-config";
  assert.deepEqual(h.spawned.args, originalPaths.slice(2));
  assert.deepEqual(h.runner.readArtifactReferences().references.map(reference => reference.path), originalPaths);
  h.ready.resolve();
  h.terminal.resolve({ type: "exit", code: 0, activeProcesses: 0 });
  await operation;
  assert.deepEqual(h.runner.readArtifactReferences(), { available: true, references: [] });
});

test("invalid or relative restore paths make the whole private reference read unavailable", async () => {
  const h = harness(), input = absoluteInvocation();
  input.backupFile = "relative-backup.sql";
  const operation = h.runner.run(input);
  assert.deepEqual(h.runner.readArtifactReferences(), { available: false, references: [] });
  h.ready.resolve();
  h.terminal.resolve({ type: "exit", code: 0, activeProcesses: 0 });
  await operation;
});

test("malformed absolute, control, UNC, device, and root-relative values are unavailable", async () => {
  const sample = absoluteInvocation();
  const noncanonical = `${path.dirname(sample.configPath)}${path.sep}unused${path.sep}..${path.sep}${path.basename(sample.configPath)}`;
  const cases = [
    ["noncanonical", noncanonical],
    ["control", `${sample.configPath}\u0001`],
    ["NUL", `${sample.configPath}\u0000`],
    ["DEL", `${sample.configPath}\u007f`],
  ];
  if (process.platform === "win32") {
    cases.push(["UNC", String.raw`\\server\share\config.json`]);
    cases.push(["device", String.raw`\\?\C:\fixture\config.json`]);
    cases.push(["root-relative", String.raw`\fixture\config.json`]);
  }
  for (const [label, malformed] of cases) {
    const h = harness(), input = absoluteInvocation();
    input.configPath = malformed;
    const operation = h.runner.run(input);
    assert.deepEqual(h.runner.readArtifactReferences(), { available: false, references: [] }, label);
    h.ready.resolve();
    h.terminal.resolve({ type: "exit", code: 0, activeProcesses: 0 });
    await operation;
  }
});

test("late stop retains restore references until owned Job and helper closure are confirmed", async () => {
  const h = harness(), operation = h.runner.run(absoluteInvocation());
  h.ready.resolve();
  const stopped = deferred();
  h.setTermination(() => stopped.promise);
  const stopping = h.runner.stop();
  assert.equal(h.runner.readArtifactReferences().available, true);
  assert.equal(h.runner.readArtifactReferences().references.length, 7);
  stopped.resolve({ type: "cancelled", activeProcesses: 0 });
  await stopping;
  assert.deepEqual(h.runner.readArtifactReferences(), { available: true, references: [] });
  h.terminal.resolve({ type: "cancelled", activeProcesses: 0 });
  await assert.rejects(operation, /cancelled/);
});

test("synchronous spawn failure remains uncertain and keeps captured paths protected", async () => {
  const input = absoluteInvocation();
  const runner = createSpsOwnerHostRestoreRunner({ spawn: () => { throw new Error("spawn failed synchronously"); } });
  await assert.rejects(runner.run(input), /spawn failed synchronously/);
  assert.equal(runner.isActive(), true);
  assert.equal(runner.hasUnconfirmedTermination(), true);
  assert.equal(runner.readArtifactReferences().references.length, 7);
  await assert.rejects(runner.stop(), /unconfirmed/);
  assert.equal(runner.isActive(), true);
});

test("unavailable references remain unavailable after stop failure when a path is missing", async () => {
  const h = harness(), input = absoluteInvocation();
  input.configPath = undefined;
  const operation = h.runner.run(input);
  h.ready.resolve();
  h.setTermination(async () => { throw new Error("stop unconfirmed"); });
  await assert.rejects(h.runner.stop(), /stop unconfirmed/);
  assert.deepEqual(h.runner.readArtifactReferences(), { available: false, references: [] });
  h.terminal.resolve({ type: "exit", code: 0, activeProcesses: 0 });
  await assert.rejects(operation, /cancelled/);
});

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

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSpsDefaultMemoryConfig, createSpsDefaultMemoryManager, defaultMemoryVaultLayout } from "../src/default-memory-host.mjs";

const root = path.resolve(os.tmpdir(), "sps-memory-lifecycle-fixture");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function fixture(overrides = {}) {
  const children = [];
  let healthy = false;
  let kills = 0;
  let terminations = 0;
  const child = new EventEmitter();
  child.pid = 123;
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => { kills++; return true; };
  const manager = createSpsDefaultMemoryManager({
    url: "http://127.0.0.1:31880", token: "fixture-token", configPath: path.join(root, "config.json"),
    resolveEntry: async () => path.join(root, "sidecar.mjs"), nodeCommand: process.execPath,
    fetchImpl: async () => ({ ok: healthy, json: async () => ({ ok: true }) }),
    delay: async () => {}, gracefulStopMs: 5, exitConfirmationMs: 5,
    terminateTree: async pid => { assert.equal(pid, child.pid); terminations++; },
    spawn: () => { children.push(child); healthy = true; return child; },
    ...overrides,
  });
  const exit = (code = 0) => { healthy = false; child.exitCode = code; child.emit("exit", code, null); };
  const close = () => { child.emit("close", child.exitCode, child.signalCode); };
  return { manager, child, children, exit, close, healthy: value => { healthy = value; },
    kills: () => kills, terminations: () => terminations };
}

test("concurrent Memory starts share exactly one owned process and retain immutable launch paths", async () => {
  const f = fixture();
  const first = f.manager.start(), second = f.manager.start();
  assert.equal(first, second);
  assert.equal((await first).state, "running");
  assert.equal(f.children.length, 1);
  const references = f.manager.readRuntimeArtifactReferences();
  assert.equal(references.available, true);
  assert.equal(Object.isFrozen(references.references), true);
  assert.deepEqual(references.references.map(value => value.path), [process.execPath,
    path.join(root, "sidecar.mjs"), root, path.join(root, "config.json")]);
  assert.equal(JSON.stringify(references).includes("fixture-token"), false);
  f.exit(); f.close();
  assert.deepEqual(f.manager.readRuntimeArtifactReferences(), { available: true, references: [] });
});

test("Memory stop fences and joins entry preparation before permitting any spawn", async () => {
  const entered = deferred(), prepared = deferred();
  const f = fixture({ resolveEntry: async () => { entered.resolve(); return prepared.promise; } });
  const starting = f.manager.start();
  await entered.promise;
  const stopped = f.manager.stop();
  assert.equal(f.manager.readRuntimeArtifactReferences().available, false);
  prepared.resolve(path.join(root, "sidecar.mjs"));
  assert.equal((await stopped).state, "stopped");
  await starting;
  assert.equal(f.children.length, 0);
});

test("Memory stop fences node-command preparation and cannot revive a late start", async () => {
  const entered = deferred(), prepared = deferred();
  const f = fixture({ resolveNodeCommand: async () => { entered.resolve(); return prepared.promise; } });
  const starting = f.manager.start();
  await entered.promise;
  const stopped = f.manager.stop({ force: true });
  prepared.resolve(process.execPath);
  await Promise.all([starting, stopped]);
  assert.equal(f.children.length, 0);
});

test("Memory retains a terminal leader until close and never kills its potentially reused PID", async () => {
  const f = fixture();
  await f.manager.start();
  const retained = f.manager.readRuntimeArtifactReferences();
  f.exit();
  assert.equal((await f.manager.inspect()).state, "stopping");
  assert.equal((await f.manager.start()).state, "stopping");
  assert.equal(f.children.length, 1);
  await assert.rejects(f.manager.stop({ force: true }), { code: "default_memory_stop_unconfirmed" });
  assert.equal(f.terminations(), 0);
  assert.equal(f.kills(), 0);
  assert.deepEqual(f.manager.readRuntimeArtifactReferences(), retained);
  f.close();
  assert.equal((await f.manager.stop()).state, "stopped");
});

test("an unconfirmed forced Memory termination is not success and retries the same retained process", async () => {
  const f = fixture();
  await f.manager.start();
  const retained = f.manager.readRuntimeArtifactReferences();
  await assert.rejects(f.manager.stop({ force: true }), { code: "default_memory_stop_unconfirmed" });
  assert.equal(f.terminations(), 1);
  assert.deepEqual(f.manager.readRuntimeArtifactReferences(), retained);
  assert.equal((await f.manager.start()).state, "stopping");
  assert.equal(f.children.length, 1);
  f.exit(); f.close();
  const stopped = await f.manager.stop({ force: true });
  assert.equal(stopped.state, "stopped");
  assert.equal(f.terminations(), 1);
});

test("concurrent normal Memory stops coalesce and explicit force can escalate", async () => {
  const forced = deferred();
  let f;
  f = fixture({ gracefulStopMs: 100, terminateTree: async () => { f.exit(); f.close(); forced.resolve(); } });
  await f.manager.start();
  const first = f.manager.stop();
  const second = f.manager.stop();
  assert.equal(f.kills(), 1);
  await f.manager.stop({ force: true });
  await forced.promise;
  await Promise.all([first, second]);
  assert.equal(f.kills(), 1);
  assert.equal((await f.manager.inspect()).state, "stopped");
});

test("graceful Memory stop joins actual close rather than the signal request", async () => {
  const f = fixture();
  await f.manager.start();
  f.child.kill = () => { queueMicrotask(() => { f.exit(); f.close(); }); return true; };
  const stopped = await f.manager.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(f.terminations(), 0);
});

test("a termination-command failure cannot undo independently confirmed Memory closure", async () => {
  let f;
  f = fixture({ terminateTree: async () => { f.exit(); f.close(); throw new Error("late helper failure"); } });
  await f.manager.start();
  assert.equal((await f.manager.stop({ force: true })).state, "stopped");
  assert.deepEqual(f.manager.readRuntimeArtifactReferences(), { available: true, references: [] });
});

test("a foreign healthy Memory listener is never adopted or terminated", async () => {
  const f = fixture();
  f.healthy(true);
  assert.equal((await f.manager.start()).state, "running-existing");
  assert.equal((await f.manager.stop({ force: true })).state, "running-existing");
  assert.equal(f.children.length, 0);
  assert.equal(f.terminations(), 0);
  assert.equal(f.manager.readRuntimeArtifactReferences().available, false);
  f.healthy(false);
  await f.manager.inspect();
  assert.equal(f.manager.readRuntimeArtifactReferences().available, false, "An unavailable foreign listener is not closure evidence.");
});

test("unknown Memory launch paths keep introspection unavailable without changing startup", async () => {
  const f = fixture({ nodeCommand: "node" });
  await f.manager.start();
  assert.equal(f.manager.readRuntimeArtifactReferences().available, false);
  f.exit(); f.close();
  assert.deepEqual(f.manager.readRuntimeArtifactReferences(), { available: true, references: [] });
});

test("malformed or unbounded Memory stop waits fail before process work", () => {
  for (const value of [0, -1, Infinity, NaN, "5", 15_001, 1.1]) {
    assert.throws(() => fixture({ gracefulStopMs: value }), /bounded integers/);
    assert.throws(() => fixture({ exitConfirmationMs: value }), /bounded integers/);
  }
});

test("actual local Memory sidecar starts from an isolated config and confirms process close before releasing paths", {
  timeout: 30_000,
}, async t => {
  const parent = await realpath(os.tmpdir());
  const directory = await mkdtemp(path.join(parent, "sps-memory-lifecycle-"));
  const identity = await lstat(directory, { bigint: true });
  let manager;
  t.after(async () => {
    if (manager) assert.equal((await manager.stop({ force: true })).state, "stopped");
    const current = await lstat(directory, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], identity[key]);
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(path.dirname(await realpath(directory)), parent);
    assert.ok(path.basename(directory).startsWith("sps-memory-lifecycle-"));
    await rm(directory, { recursive: true, force: false });
  });
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", resolve); });
  const port = socket.address().port;
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  const layout = defaultMemoryVaultLayout(directory);
  await mkdir(layout.root);
  const config = createSpsDefaultMemoryConfig({ ownerVaultRoot: directory, port, token: "isolated-local-memory-token" });
  await writeFile(layout.configPath, JSON.stringify(config), "utf8");
  const entry = path.resolve(import.meta.dirname, "../../memory-sidecar/memory-sidecar.mjs");
  manager = createSpsDefaultMemoryManager({ url: `http://127.0.0.1:${port}`, token: config.security.token,
    configPath: layout.configPath, resolveEntry: async () => entry, nodeCommand: process.execPath });
  assert.equal((await manager.start()).state, "running");
  assert.equal(manager.readRuntimeArtifactReferences().available, true);
  assert.ok(manager.readRuntimeArtifactReferences().references.some(value => value.path === entry));
  assert.equal((await manager.stop()).state, "stopped");
  assert.deepEqual(manager.readRuntimeArtifactReferences(), { available: true, references: [] });
  assert.equal((await lstat(layout.configPath)).isFile(), true);
});

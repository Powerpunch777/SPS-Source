import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { terminateWindowsChild } from "../src/windows-command-termination.mjs";

function fixture({ childPid = 1234, exitCode = null, signalCode = null } = {}) {
  const child = { pid: childPid, exitCode, signalCode, kills: 0,
    kill() { this.kills += 1; } };
  const killer = new EventEmitter();
  killer.kills = 0;
  killer.kill = () => { killer.kills += 1; };
  let command = null, options = null, deadline = null, cleared = 0, spawned = 0;
  return {
    child, killer,
    terminate: (input = {}) => terminateWindowsChild(child, {
      spawnKiller: (file, args, spawnOptions) => {
        spawned += 1; command = [file, ...args]; options = spawnOptions; return killer;
      },
      setTimer: callback => { deadline = callback; return 1; },
      clearTimer: timer => { assert.equal(timer, 1); cleared += 1; },
      ...input,
    }),
    get command() { return command; }, get options() { return options; },
    get deadline() { return deadline; }, get cleared() { return cleared; }, get spawned() { return spawned; },
  };
}

test("taskkill success confirms the owned PID and cleans its bounded timer", async () => {
  const f = fixture(), pending = f.terminate();
  assert.deepEqual(f.command, ["taskkill.exe", "/pid", "1234", "/t", "/f"]);
  assert.equal(f.options.windowsHide, true);
  assert.equal(f.options.stdio, "ignore");
  f.killer.emit("close", 0);
  f.killer.emit("error", new Error("late helper error"));
  await pending;
  assert.equal(f.cleared, 1);
  assert.equal(f.child.kills, 0);
});

test("taskkill nonzero exit rejects safely and falls back only to its owned child", async () => {
  const f = fixture(), pending = f.terminate();
  f.killer.emit("close", 1);
  await assert.rejects(pending, /termination has not been confirmed/);
  assert.equal(f.child.kills, 1);
  assert.equal(f.cleared, 1);
});

test("taskkill spawn error rejects without exposing diagnostics", async () => {
  const f = fixture(), pending = f.terminate();
  f.killer.emit("error", new Error("private process detail"));
  await assert.rejects(pending, error => error.message === "Windows process-tree termination has not been confirmed."
    && !error.message.includes("private"));
  assert.equal(f.child.kills, 1);
});

test("timeout kills only the helper, falls back to its live child, and ignores late events", async () => {
  const f = fixture(), pending = f.terminate({ timeoutMs: 5_000 });
  assert.equal(typeof f.deadline, "function");
  f.deadline();
  await assert.rejects(pending, /termination has not been confirmed/);
  assert.equal(f.killer.kills, 1);
  assert.equal(f.child.kills, 1);
  f.killer.emit("close", 0);
  f.killer.emit("error", new Error("late helper error"));
  assert.equal(f.child.kills, 1);
  assert.equal(f.cleared, 1);
});

test("timeout does not kill a child that became terminal while taskkill was pending", async () => {
  const f = fixture(), pending = f.terminate();
  f.child.exitCode = 0;
  f.deadline();
  await assert.rejects(pending, /termination has not been confirmed/);
  assert.equal(f.killer.kills, 1);
  assert.equal(f.child.kills, 0);
});

test("terminal children skip taskkill and invalid deadlines fail closed", async () => {
  const terminal = fixture({ exitCode: 0 });
  await terminal.terminate();
  assert.equal(terminal.spawned, 0);
  for (const timeoutMs of [0, -1, Infinity, 5_001]) {
    const invalid = fixture();
    await assert.rejects(invalid.terminate({ timeoutMs }), /termination has not been confirmed/);
    assert.equal(invalid.spawned, 0);
  }
  const invalidChild = fixture({ childPid: 0 });
  await assert.rejects(invalidChild.terminate(), /termination has not been confirmed/);
  assert.equal(invalidChild.spawned, 0);
});

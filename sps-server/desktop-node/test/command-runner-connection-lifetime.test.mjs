import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { cancelSpsNodeCommand, executeSpsNodeCommand } from "../src/command-runner.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function testProcessTermination() {
  const isAlive = child => Boolean(child && child.exitCode === null && child.signalCode === null);
  return {
    isAlive,
    hasUnconfirmedTermination: () => false,
    pending: () => undefined,
    terminate: child => {
      if (!isAlive(child)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("test child did not close after SIGTERM")), 5_000);
        const finish = () => { clearTimeout(timeout); resolve(); };
        child.once("close", finish);
        child.kill("SIGTERM");
      });
    },
  };
}

function command(id) {
  return { id, command: "agy", runtimeKind: "agy_cli", args: [], env: {}, timeoutMs: 10_000 };
}

function baseOptions(id, overrides = {}) {
  return {
    command: command(id),
    hubUrl: "https://fixture.example.test",
    nodeId: "fixture",
    profile: {},
    resolveWorkspace: async () => process.cwd(),
    resolveInvocation: async () => ({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('connection-guard-ready\\n'); setInterval(() => {}, 1000);"],
    }),
    checkCommandLease: async () => ({ active: true }),
    appendCommandEvent: async () => {},
    completeCommand: async () => {},
    processTermination: testProcessTermination(),
    spawnCommand: (invocation, options) => spawn(invocation.executable, invocation.args, options),
    ...overrides,
  };
}

test("rejects a stale preflight connection before spawn and closes its opened Source", { timeout: 10_000 }, async () => {
  const id = randomUUID();
  const invocationStarted = deferred();
  const sourceClosed = deferred();
  let stale = false;
  let spawned = 0;
  let leaseChecks = 0;
  const work = executeSpsNodeCommand(baseOptions(id, {
    assertCurrent: () => { if (stale) throw new Error("connection changed during preflight"); },
    openWorkspaceSourceRoute: async () => ({
      workspacePath: process.cwd(),
      close: async () => { sourceClosed.resolve(); },
    }),
    resolveInvocation: async () => {
      invocationStarted.resolve();
      stale = true;
      return { executable: process.execPath, args: ["-e", "process.exit(0)"] };
    },
    checkCommandLease: async () => { leaseChecks += 1; return { active: true }; },
    spawnCommand: () => { spawned += 1; throw new Error("stale command must not spawn"); },
  }));
  const rejected = assert.rejects(work, /connection changed during preflight/);
  try {
    await invocationStarted.promise;
    await rejected;
    await sourceClosed.promise;
    assert.equal(spawned, 0);
    assert.equal(leaseChecks, 0);
  } finally {
    await work.catch(() => {});
  }
});

test("stale connection during a live lease check terminates only its command and waits for close", { timeout: 15_000 }, async () => {
  const targetId = randomUUID();
  const otherId = randomUUID();
  const targetOwner = Symbol("target connection");
  const otherOwner = Symbol("other connection");
  const targetStarted = deferred();
  const otherStarted = deferred();
  const targetFinished = deferred();
  const otherFinished = deferred();
  const children = new Map();
  let targetLeaseChecks = 0;
  let targetStale = false;
  const spawnChild = (id, started) => (invocation, options) => {
    const child = spawn(invocation.executable, invocation.args, options);
    children.set(id, child);
    started.resolve();
    return child;
  };
  const targetWork = executeSpsNodeCommand(baseOptions(targetId, {
    ownership: targetOwner,
    assertCurrent: () => { if (targetStale) throw new Error("target connection changed"); },
    checkCommandLease: async () => {
      targetLeaseChecks += 1;
      if (targetLeaseChecks === 2) targetStale = true;
      return { active: true };
    },
    completeCommand: async input => { targetFinished.resolve(input.completion); },
    spawnCommand: spawnChild(targetId, targetStarted),
  }));
  const otherWork = executeSpsNodeCommand(baseOptions(otherId, {
    ownership: otherOwner,
    completeCommand: async input => { otherFinished.resolve(input.completion); },
    spawnCommand: spawnChild(otherId, otherStarted),
  }));
  void targetWork.catch(() => undefined);
  void otherWork.catch(() => undefined);

  try {
    await Promise.all([targetStarted.promise, otherStarted.promise]);
    const targetCompletion = await targetFinished.promise;
    assert.equal(targetCompletion.status, "failed");
    assert.equal(targetCompletion.error, "SPS Desktop connection is no longer active.");
    assert.equal(children.get(targetId).exitCode === null && children.get(targetId).signalCode === null, false,
      "completion is sent only after the stale command has closed");
    assert.equal(children.get(otherId).exitCode, null, "another connection's owned command remains alive");
    assert.equal(await cancelSpsNodeCommand(otherId, "Test cleanup", { ownership: otherOwner }), true);
    await otherWork;
    assert.equal((await otherFinished.promise).status, "failed");
  } finally {
    await Promise.all([
      cancelSpsNodeCommand(targetId, "Fixture cleanup", { ownership: targetOwner }),
      cancelSpsNodeCommand(otherId, "Fixture cleanup", { ownership: otherOwner }),
    ]);
    await Promise.allSettled([targetWork, otherWork]);
  }
});

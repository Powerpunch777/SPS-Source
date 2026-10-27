import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createOwnedProcessTerminator } from "../src/owned-process-termination.mjs";

function child(pid = 4123) {
  return Object.assign(new EventEmitter(), { pid, exitCode: null, signalCode: null });
}

for (const kind of ["timeout", "failure"]) {
  test(`retains termination uncertainty after a Windows ${kind}`, async () => {
    const processChild = child();
    let alive = true;
    const terminateWindowsChild = async () => {
      if (kind === "failure") throw new Error("sensitive system details");
    };
    const terminator = createOwnedProcessTerminator({
      platform: "win32",
      terminateWindowsChild,
      signalProcess: () => {
        if (!alive) throw Object.assign(new Error(), { code: "ESRCH" });
      },
      wait: async () => {},
      now: (() => { let tick = 0; return () => tick += 10; })(),
      confirmationTimeoutMs: 20,
      pollIntervalMs: 10,
    });

    const first = terminator.terminate(processChild);
    await assert.rejects(first, error => error.message === "Local command termination failed."
      && !error.message.includes("sensitive"));
    assert.equal(terminator.hasUnconfirmedTermination(processChild), true);
    assert.equal(terminator.pending(processChild), first);
    const firstError = await first.catch(error => error);

    processChild.exitCode = 1;
    alive = false;
    await assert.rejects(terminator.terminate(processChild), error => error === firstError);
    assert.equal(terminator.hasUnconfirmedTermination(processChild), true);
  });
}

test("allows retry while a failed Windows child is live and clears failure on success", async () => {
  const processChild = child();
  let alive = true;
  let attempts = 0;
  const terminator = createOwnedProcessTerminator({
    platform: "win32",
    terminateWindowsChild: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("private diagnostic");
      alive = false;
    },
    signalProcess: () => {
      if (!alive) throw Object.assign(new Error(), { code: "ESRCH" });
    },
  });

  await assert.rejects(terminator.terminate(processChild), /Local command termination failed\./);
  assert.equal(terminator.hasUnconfirmedTermination(processChild), true);
  await assert.doesNotReject(terminator.terminate(processChild));
  assert.equal(terminator.hasUnconfirmedTermination(processChild), false);
  assert.equal(attempts, 2);
});

test("shares one in-flight termination operation per child", async () => {
  const processChild = child();
  let finish;
  let alive = true;
  let attempts = 0;
  const terminator = createOwnedProcessTerminator({
    platform: "win32",
    terminateWindowsChild: () => {
      attempts += 1;
      return new Promise(resolve => {
        finish = () => { alive = false; resolve(); };
      });
    },
    signalProcess: () => {
      if (!alive) throw Object.assign(new Error(), { code: "ESRCH" });
    },
  });
  const first = terminator.terminate(processChild);
  const second = terminator.terminate(processChild);
  assert.equal(second, first);
  assert.equal(terminator.pending(processChild), first);
  assert.equal(terminator.hasUnconfirmedTermination(processChild), true);
  await Promise.resolve();
  finish();
  await assert.doesNotReject(first);
  assert.equal(attempts, 1);
});

test("skips a naturally terminal Windows child without prior failure", async () => {
  const processChild = Object.assign(child(), { exitCode: 0 });
  let attempts = 0;
  let probes = 0;
  const terminator = createOwnedProcessTerminator({
    platform: "win32",
    terminateWindowsChild: async () => { attempts += 1; },
    signalProcess: () => { probes += 1; },
  });

  await assert.doesNotReject(terminator.terminate(processChild));
  assert.equal(attempts, 0);
  assert.equal(probes, 0);
  assert.equal(terminator.hasUnconfirmedTermination(processChild), false);
  assert.equal(terminator.pending(processChild), undefined);
});

test("preserves POSIX process-group cleanup after the direct child exits", async () => {
  const processChild = Object.assign(child(), { exitCode: 0 });
  const signals = [];
  const signalProcess = (pid, signal) => {
    signals.push([pid, signal]);
    throw Object.assign(new Error(), { code: "ESRCH" });
  };
  const terminator = createOwnedProcessTerminator({ platform: "linux", signalProcess, wait: async () => {} });

  await assert.doesNotReject(terminator.terminate(processChild));
  assert.ok(signals.some(([pid, signal]) => pid === -processChild.pid && signal === "SIGTERM"));
  assert.ok(!signals.some(([pid, signal]) => pid === processChild.pid && signal === "SIGTERM"));
  assert.equal(terminator.hasUnconfirmedTermination(processChild), false);
});

test("uses the retained Job Object acknowledgment after the supervisor has exited without any PID operation", async () => {
  let acknowledged = false;
  let release;
  const acknowledgment = new Promise(resolve => { release = resolve; });
  const processChild = Object.assign(child(), {
    exitCode: 0,
    terminateOwnedJob: async () => { await acknowledgment; acknowledged = true; },
    waitForOwnedJobTermination: async () => { await acknowledgment; },
    hasUnconfirmedOwnedJobTermination: () => false,
  });
  const terminator = createOwnedProcessTerminator({
    platform: "win32",
    signalProcess: () => { throw new Error("must not probe or signal a PID"); },
    terminateWindowsChild: () => { throw new Error("must not use taskkill"); },
  });
  const pending = terminator.terminate(processChild);
  await Promise.resolve();
  assert.equal(acknowledged, false);
  assert.equal(terminator.hasUnconfirmedTermination(processChild), true);
  release();
  await pending;
  assert.equal(acknowledged, true);
  assert.equal(terminator.hasUnconfirmedTermination(processChild), false);
});

test("retains an unconfirmed Job Object after helper exit and never falls back to its reused PID", async () => {
  let attempts = 0;
  const processChild = Object.assign(child(), {
    exitCode: 1,
    terminateOwnedJob: async () => { attempts++; throw new Error("private helper details"); },
    waitForOwnedJobTermination: async () => { throw new Error("missing empty-job ack"); },
    hasUnconfirmedOwnedJobTermination: () => true,
  });
  const terminator = createOwnedProcessTerminator({
    platform: "win32",
    signalProcess: () => { throw new Error("must not probe or signal a PID"); },
    terminateWindowsChild: () => { throw new Error("must not use taskkill"); },
  });
  assert.equal(terminator.hasUnconfirmedTermination(processChild), true);
  await assert.rejects(terminator.terminate(processChild), /^Error: Local command termination failed\.$/);
  await assert.rejects(terminator.terminate(processChild), /^Error: Local command termination failed\.$/);
  assert.equal(attempts, 1);
  assert.equal(terminator.hasUnconfirmedTermination(processChild), true);
});

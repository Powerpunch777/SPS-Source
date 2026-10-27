import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { spawnWindowsJobSupervisor } from "../src/windows-job-supervisor.mjs";

class FakeSocket extends EventEmitter {
  destroyed = false;
  onStart;
  onCancel;

  constructor(nonce, onStart, onCancel) {
    super();
    this.nonce = nonce;
    this.onStart = onStart;
    this.onCancel = onCancel;
  }

  connect() {
    setImmediate(() => {
      this.emit("connect");
      setImmediate(() => this.send({ type: "hello", nonce: this.nonce }));
    });
  }

  write(value) {
    const message = JSON.parse(value);
    if (message.type === "start") this.onStart(this);
    else if (message.type === "cancel") this.onCancel(this);
    return true;
  }

  send(message) {
    if (!this.destroyed) this.emit("data", Buffer.from(`${JSON.stringify(message)}\n`));
  }

  destroy() {
    if (this.destroyed) return this;
    this.destroyed = true;
    setImmediate(() => this.emit("close"));
    return this;
  }
}

function createHarness({ start = "ready", cancel = "ack", helperClose = true } = {}) {
  const child = new EventEmitter();
  Object.assign(child, { killed: false, exitCode: null, signalCode: null, stdout: new PassThrough(), stderr: new PassThrough() });
  let finishClosed;
  child.closedPromise = new Promise(resolve => { finishClosed = resolve; });
  child.kill = () => {
    if (child.killed) return false;
    child.killed = true;
    setImmediate(() => {
      child.exitCode = 137;
      child.signalCode = null;
      child.emit("close", child.exitCode, null);
      finishClosed();
    });
    return true;
  };

  let socket;
  let helperArgs;
  const onStart = current => {
    if (start === "bad-order") current.send({ type: "exit", activeProcesses: 0, code: 0 });
    else if (start === "extra-key") current.send({ type: "ready", extra: false });
    else if (start === "natural-exit") {
      current.send({ type: "ready" });
      setImmediate(() => {
        current.send({ type: "exit", activeProcesses: 0, code: 0xffff_ffff });
        current.destroy();
        setImmediate(() => {
          child.exitCode = -1;
          child.signalCode = null;
          child.emit("close", -1, null);
          finishClosed();
        });
      });
    } else current.send({ type: "ready" });
  };
  const onCancel = current => {
    if (cancel === "no-ack") return;
    if (cancel === "natural-exit") {
      current.send({ type: "exit", activeProcesses: 0, code: 0 });
      current.destroy();
      setImmediate(() => {
        child.exitCode = 0;
        child.signalCode = null;
        child.emit("close", 0, null);
        finishClosed();
      });
      return;
    }
    const sendTerminal = () => {
      current.send({ type: "cancelled", activeProcesses: 0 });
      current.destroy();
    };
    const closeHelper = () => {
      child.exitCode = 125;
      child.signalCode = null;
      child.emit("close", 125, null);
      finishClosed();
    };
    if (helperClose === "before-terminal") {
      setImmediate(() => { closeHelper(); setImmediate(sendTerminal); });
    } else {
      sendTerminal();
    }
    if (helperClose === true) {
      setImmediate(() => {
        closeHelper();
      });
    }
  };

  const processChild = spawnWindowsJobSupervisor({
    executable: "C:\\Windows\\System32\\cmd.exe", args: [], cwd: "C:\\", env: {},
  }, {
    platform: "win32",
    helperPath: "C:\\SpsWindowsJobSupervisor.exe",
    startupTimeoutMs: 100,
    cancellationTimeoutMs: 15,
    helperCloseTimeoutMs: 15,
    failureKillGraceMs: 0,
    spawn: (_executable, args) => { helperArgs = args; return child; },
    connect: () => {
      socket = new FakeSocket(`${process.pid}:${helperArgs[1]}:${helperArgs[3]}`, onStart, onCancel);
      if (start !== "connect-stall") socket.connect();
      return socket;
    },
  });
  return { child: processChild, helper: child, get socket() { return socket; } };
}

test("bounds a stalled startup and rejects out-of-order or open-shape readiness", async () => {
  for (const start of ["connect-stall", "bad-order", "extra-key"]) {
    const harness = createHarness({ start });
    await assert.rejects(harness.child.supervisorReady, /Windows command supervisor startup failed\./);
    await harness.helper.closedPromise;
    assert.equal(harness.helper.killed, true);
    if (start === "connect-stall") assert.equal(harness.socket.destroyed, true);
    assert.equal(harness.child.hasUnconfirmedOwnedJobTermination(), true);
    await assert.rejects(harness.child.waitForOwnedJobTermination(), /termination is unconfirmed/);
  }
});

test("a missing cancellation acknowledgment kills the exact helper without claiming zero active processes", async () => {
  const harness = createHarness({ cancel: "no-ack" });
  await harness.child.supervisorReady;
  await assert.rejects(harness.child.terminateOwnedJob(), /termination is unconfirmed/);
  await harness.helper.closedPromise;
  assert.equal(harness.helper.killed, true);
  assert.equal(harness.child.hasUnconfirmedOwnedJobTermination(), true);
  await assert.rejects(harness.child.waitForOwnedJobTermination(), /termination is unconfirmed/);
});

test("accepts a valid cancellation terminal frame followed by socket close and helper close", async () => {
  const harness = createHarness();
  await harness.child.supervisorReady;
  const message = await harness.child.terminateOwnedJob();
  assert.deepEqual(message, { type: "cancelled", activeProcesses: 0 });
  assert.deepEqual(await harness.child.waitForOwnedJobTermination(), message);
  assert.equal(harness.helper.killed, false);
  assert.equal(harness.child.hasUnconfirmedOwnedJobTermination(), false);
});

test("a natural exit racing a cancel request releases the wait with the actual exit result", async () => {
  const harness = createHarness({ cancel: "natural-exit" });
  await harness.child.supervisorReady;
  assert.deepEqual(await harness.child.terminateOwnedJob(), { type: "exit", activeProcesses: 0, code: 0 });
  assert.deepEqual(await harness.child.waitForOwnedJobTermination(), { type: "exit", activeProcesses: 0, code: 0 });
  assert.equal(harness.child.hasUnconfirmedOwnedJobTermination(), false);
});

test("matches unsigned Windows command exit codes to the helper's signed process status", async () => {
  const harness = createHarness({ start: "natural-exit" });
  await harness.child.supervisorReady;
  assert.deepEqual(await harness.child.waitForOwnedJobTermination(), { type: "exit", code: 0xffff_ffff, activeProcesses: 0 });
  assert.equal(harness.child.hasUnconfirmedOwnedJobTermination(), false);
});

test("accepts the flushed terminal frame when helper close notification arrives first", async () => {
  const harness = createHarness({ helperClose: "before-terminal" });
  await harness.child.supervisorReady;
  assert.deepEqual(await harness.child.terminateOwnedJob(), { type: "cancelled", activeProcesses: 0 });
  assert.equal(harness.child.hasUnconfirmedOwnedJobTermination(), false);
});

test("bounds helper close after a terminal frame and preserves uncertainty", async () => {
  const harness = createHarness({ helperClose: false });
  await harness.child.supervisorReady;
  await assert.rejects(harness.child.terminateOwnedJob(), /termination is unconfirmed/);
  await harness.helper.closedPromise;
  assert.equal(harness.helper.killed, true);
  assert.equal(harness.child.hasUnconfirmedOwnedJobTermination(), true);
});

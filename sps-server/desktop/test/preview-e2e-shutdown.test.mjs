import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { shutdownPreviewE2eDesktop } from "../scripts/preview-e2e-shutdown.mjs";

function fakeTimers() {
  let nextId = 0;
  const pending = new Map();
  return {
    pending,
    setTimer(callback, milliseconds) {
      const id = ++nextId;
      pending.set(id, { callback, milliseconds });
      return id;
    },
    clearTimer(id) { pending.delete(id); },
    fireNext() {
      const [id, timer] = pending.entries().next().value ?? [];
      assert.ok(timer, "expected a pending timer");
      pending.delete(id);
      timer.callback();
    },
  };
}

function fakeChild({ exitCode = null, signalCode = null } = {}) {
  const child = new EventEmitter();
  child.exitCode = exitCode;
  child.signalCode = signalCode;
  return child;
}

function timerOptions(timers) {
  return { setTimer: timers.setTimer, clearTimer: timers.clearTimer };
}

test("treats a lost Browser.close acknowledgement as graceful when the child exits", async () => {
  const child = fakeChild();
  const timers = fakeTimers();
  let requestCount = 0;
  let forceStopCount = 0;
  const result = await shutdownPreviewE2eDesktop({
    child,
    requestBrowserClose() {
      requestCount += 1;
      child.exitCode = 0;
      child.emit("exit", 0, null);
      return Promise.reject(new Error("acknowledgement was lost"));
    },
    forceStop() { forceStopCount += 1; },
    timeoutMs: 100,
    ...timerOptions(timers),
  });

  assert.deepEqual(result, { graceful: true, exitConfirmed: true, exitCode: 0, signalCode: null });
  assert.equal(requestCount, 1);
  assert.equal(forceStopCount, 0);
  assert.equal(child.listenerCount("exit"), 0);
  assert.equal(timers.pending.size, 0);
});

test("does not request close or force-stop an already terminal child", async () => {
  const child = fakeChild({ signalCode: "SIGTERM" });
  let requestCount = 0;
  let forceStopCount = 0;
  const result = await shutdownPreviewE2eDesktop({
    child,
    requestBrowserClose() { requestCount += 1; },
    forceStop() { forceStopCount += 1; },
  });

  assert.deepEqual(result, { graceful: false, exitConfirmed: true, exitCode: null, signalCode: "SIGTERM" });
  assert.equal(requestCount, 0);
  assert.equal(forceStopCount, 0);
  assert.equal(child.listenerCount("exit"), 0);
});

test("only an orderly zero exit qualifies an already terminal child as graceful", async () => {
  for (const [exitCode, signalCode, graceful] of [[0, null, true], [7, null, false], [0, "SIGTERM", false]]) {
    const child = fakeChild({ exitCode, signalCode });
    const result = await shutdownPreviewE2eDesktop({
      child,
      requestBrowserClose() { assert.fail("terminal child must not receive close"); },
      forceStop() { assert.fail("terminal child must not be force-stopped"); },
    });
    assert.deepEqual(result, { graceful, exitConfirmed: true, exitCode, signalCode });
  }
});

test("abnormal exit during the close request is confirmed but never graceful", async () => {
  for (const [exitCode, signalCode] of [[7, null], [null, "SIGTERM"], [0, "SIGTERM"]]) {
    const child = fakeChild();
    const timers = fakeTimers();
    const result = await shutdownPreviewE2eDesktop({
      child,
      requestBrowserClose() {
        child.exitCode = exitCode;
        child.signalCode = signalCode;
        child.emit("exit", exitCode, signalCode);
      },
      forceStop() { assert.fail("confirmed abnormal exit must not be force-stopped again"); },
      ...timerOptions(timers),
    });
    assert.deepEqual(result, { graceful: false, exitConfirmed: true, exitCode, signalCode });
    assert.equal(child.listenerCount("exit"), 0);
    assert.equal(timers.pending.size, 0);
  }
});

test("force-stops once after graceful timeout and confirms the resulting exit", async () => {
  const child = fakeChild();
  const timers = fakeTimers();
  let forceStopCount = 0;
  const pending = shutdownPreviewE2eDesktop({
    child,
    requestBrowserClose() {},
    forceStop(target) {
      forceStopCount += 1;
      target.signalCode = "SIGTERM";
      target.emit("exit", null, "SIGTERM");
    },
    timeoutMs: 40,
    ...timerOptions(timers),
  });

  assert.equal(timers.pending.size, 1);
  assert.equal(timers.pending.values().next().value.milliseconds, 40);
  timers.fireNext();
  const result = await pending;

  assert.deepEqual(result, { graceful: false, exitConfirmed: true, exitCode: null, signalCode: "SIGTERM" });
  assert.equal(forceStopCount, 1);
  assert.equal(child.listenerCount("exit"), 0);
  assert.equal(timers.pending.size, 0);
});

test("reports unconfirmed cleanup after one force-stop and clears timers and listeners", async () => {
  const child = fakeChild();
  const timers = fakeTimers();
  let forceStopCount = 0;
  const pending = shutdownPreviewE2eDesktop({
    child,
    forceStop() { forceStopCount += 1; },
    timeoutMs: 25,
    ...timerOptions(timers),
  });

  assert.equal(timers.pending.size, 1);
  timers.fireNext();
  const result = await pending;

  assert.deepEqual(result, { graceful: false, exitConfirmed: false, exitCode: null, signalCode: null });
  assert.equal(forceStopCount, 1);
  assert.equal(child.listenerCount("exit"), 0);
  assert.equal(timers.pending.size, 0);
});

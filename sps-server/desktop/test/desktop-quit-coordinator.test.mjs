import assert from "node:assert/strict";
import test from "node:test";
import { createSpsDesktopQuitCoordinator } from "../src/desktop-quit-coordinator.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function event() {
  return { prevented: false, preventDefault() { this.prevented = true; } };
}

function fixture(overrides = {}) {
  const calls = [];
  let complete = false;
  let installing = false;
  const coordinator = createSpsDesktopQuitCoordinator({
    isComplete: () => complete,
    isInstalling: () => installing,
    drain: async () => { calls.push("drain"); },
    setQuitting: value => calls.push(`quitting-${value}`),
    setShutdownComplete: value => { calls.push(`complete-${value}`); complete = value; },
    consumeQuitRequest: () => calls.push("consume-quit"),
    quit: () => calls.push("quit"),
    showFailure: async () => { calls.push("failure-dialog"); return false; },
    requestQuit: () => calls.push("request-quit"),
    trace: stage => calls.push(stage),
    ...overrides,
  });
  return {
    calls,
    coordinator,
    setComplete: value => { complete = value; },
    setInstalling: value => { installing = value; },
  };
}

test("coalesces ordinary quit requests and marks shutdown complete only after drain succeeds", async () => {
  const entered = deferred(), release = deferred();
  let drains = 0;
  const value = fixture({ drain: async () => { drains += 1; entered.resolve(); await release.promise; } });
  const firstEvent = event(), secondEvent = event();
  const first = value.coordinator.handle(firstEvent);
  const second = value.coordinator.handle(secondEvent);
  await entered.promise;

  assert.equal(value.coordinator.isPending(), true);
  assert.equal(firstEvent.prevented, true);
  assert.equal(secondEvent.prevented, true);
  assert.equal(drains, 1);
  assert.deepEqual(value.calls.filter(call => call.startsWith("complete-")), []);

  release.resolve();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(value.coordinator.isPending(), false);
  assert.equal(value.calls.filter(call => call === "quit").length, 1);
  assert.ok(value.calls.includes("complete-true"));
});

test("a failed drain leaves the app open and holds singleflight through the failure dialog", async () => {
  const entered = deferred(), fail = deferred(), dialog = deferred();
  let drains = 0;
  const value = fixture({
    drain: async () => { drains += 1; entered.resolve(); await fail.promise; },
    showFailure: async () => { value.calls.push("failure-dialog"); await dialog.promise; return false; },
  });
  const first = value.coordinator.handle(event());
  await entered.promise;
  fail.reject(new Error("sensitive manager detail"));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(value.coordinator.isPending(), true);
  const duplicate = value.coordinator.handle(event());
  assert.equal(duplicate, first);
  assert.equal(drains, 1);
  assert.equal(value.calls.filter(call => call === "failure-dialog").length, 1);
  assert.equal(value.calls.includes("quit"), false);
  assert.equal(value.calls.includes("complete-true"), false);

  dialog.resolve();
  assert.equal(await first, false);
  assert.equal(value.coordinator.isPending(), false);
  assert.equal(value.calls.at(-1), "consume-quit");
  assert.equal(value.calls.filter(call => call === "request-quit").length, 0);
});

test("Retry closing schedules one explicit quit request without automatically repeating the drain", async () => {
  let drains = 0;
  const value = fixture({
    drain: async () => { drains += 1; throw new Error("private detail"); },
    showFailure: async () => true,
  });

  assert.equal(await value.coordinator.handle(event()), false);
  assert.equal(drains, 1);
  assert.equal(value.coordinator.isPending(), false);
  assert.equal(value.calls.filter(call => call === "request-quit").length, 1);
  assert.equal(value.calls.filter(call => call === "quit").length, 0);
  assert.equal(value.calls.includes("complete-true"), false);
});

test("an updater-owned drain consumes ordinary quit without changing its shutdown flags", async () => {
  const value = fixture({ isInstalling: () => true });
  value.setInstalling(true);

  const quitEvent = event();
  assert.equal(await value.coordinator.handle(quitEvent), false);
  assert.equal(quitEvent.prevented, true);
  assert.equal(value.coordinator.isPending(), false);
  assert.deepEqual(value.calls, ["before_quit_start", "consume-quit"]);
});

test("a completed shutdown lets the normal Electron quit continue", async () => {
  const value = fixture();
  value.setComplete(true);
  const quitEvent = event();

  assert.equal(await value.coordinator.handle(quitEvent), false);
  assert.equal(quitEvent.prevented, false);
  assert.deepEqual(value.calls, ["before_quit_complete"]);
});

test("an identified failed update quit is cancelled once without draining or blocking a later ordinary quit", async () => {
  let armed = true;
  const value = fixture({ consumeFailedUpdateQuit: () => { const current = armed; armed = false; return current; } });
  const failedUpdateQuit = event();
  assert.equal(await value.coordinator.handle(failedUpdateQuit), false);
  assert.equal(failedUpdateQuit.prevented, true);
  assert.deepEqual(value.calls, ["consume-quit"]);
  const ordinaryQuit = event();
  assert.equal(await value.coordinator.handle(ordinaryQuit), true);
  assert.equal(value.calls.filter(call => call === "drain").length, 1);
  assert.equal(value.calls.filter(call => call === "quit").length, 1);
});

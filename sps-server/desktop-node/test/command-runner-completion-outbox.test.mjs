import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { executeSpsNodeCommand } from "../src/command-runner.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function options(id, overrides = {}) {
  return {
    command: { id, command: "agy", runtimeKind: "agy_cli", args: [], env: {}, timeoutMs: 10_000 },
    hubUrl: "https://fixture.example.test",
    nodeId: "node-A",
    identity: { publicKeyPem: "fixture-public", privateKeyPem: "fixture-private" },
    resolveWorkspace: async () => process.cwd(),
    resolveInvocation: async () => ({ executable: process.execPath, args: ["-e", "process.stdout.write('fixture-output')"] }),
    checkCommandLease: async () => ({ active: true }),
    appendCommandEvent: async () => {},
    completeCommand: async () => {},
    spawnCommand: (invocation, childOptions) => spawn(invocation.executable, invocation.args, childOptions),
    ...overrides,
  };
}

test("persists confirmed normal completion before waiting for output delivery", { timeout: 10_000 }, async () => {
  const id = randomUUID();
  const outputEntered = deferred();
  const releaseOutput = deferred();
  const receiptPersisted = deferred();
  const events = [];
  let persistedPayload;
  const execution = executeSpsNodeCommand(options(id, {
    appendCommandEvent: async event => {
      events.push("output-started");
      outputEntered.resolve(event);
      await releaseOutput.promise;
      events.push("output-finished");
    },
    persistCompletion: async payload => {
      events.push("persisted");
      persistedPayload = payload;
      receiptPersisted.resolve();
    },
    completeCommand: async () => { events.push("posted"); },
  }));
  try {
    await outputEntered.promise;
    await Promise.race([
      receiptPersisted.promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("completion receipt was not persisted before output delivery")), 2_000)),
    ]);
    assert.ok(events.includes("persisted"), "receipt write completes while output delivery is still held");
    assert.equal(events.includes("posted"), false);
    assert.equal(persistedPayload.commandId, id);
    assert.equal(persistedPayload.completion.status, "succeeded");
    releaseOutput.resolve();
    await execution;
    assert.deepEqual(events, ["output-started", "persisted", "output-finished", "posted"]);
  } finally {
    releaseOutput.resolve();
    await execution.catch(() => {});
  }
});

test("persists the pre-spawn failure completion before posting it", async () => {
  const events = [];
  await assert.rejects(executeSpsNodeCommand(options(randomUUID(), {
    resolveInvocation: async () => { throw new Error("fixture preflight failure"); },
    persistCompletion: async payload => {
      events.push(["persist", payload.completion.status]);
    },
    completeCommand: async payload => { events.push(["post", payload.completion.status]); },
  })), /fixture preflight failure/);
  assert.deepEqual(events, [["persist", "failed"], ["post", "failed"]]);
});

test("does not persist or post when owned process termination is unconfirmed", { timeout: 10_000 }, async () => {
  const events = [];
  const processTermination = {
    isAlive: child => Boolean(child && child.exitCode === null && child.signalCode === null),
    hasUnconfirmedTermination: () => true,
    pending: () => undefined,
    terminate: async () => {},
  };
  await assert.rejects(executeSpsNodeCommand(options(randomUUID(), {
    processTermination,
    persistCompletion: async () => { events.push("persist"); },
    completeCommand: async () => { events.push("post"); },
  })), /termination has not been confirmed/);
  assert.deepEqual(events, []);
});

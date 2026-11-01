import assert from "node:assert/strict";
import test from "node:test";
import { createSpsPluginPreviewOperationGate } from "../src/plugin-preview-operation-gate.mjs";

test("Preview lifecycle admits synchronously, rejects overlap and joins actual completion", async () => {
  const gate = createSpsPluginPreviewOperationGate();
  let release;
  let entered = false;
  const pending = gate.run(async () => { entered = true; await new Promise(resolve => { release = resolve; }); return 42; });
  assert.equal(entered, true);
  assert.equal(gate.isBusy(), true);
  await assert.rejects(gate.run(async () => assert.fail("overlap must not run")), /still in progress/);
  let joined = false;
  const wait = gate.waitForIdle().then(() => { joined = true; });
  await Promise.resolve();
  assert.equal(joined, false);
  release();
  assert.equal(await pending, 42);
  await wait;
  assert.equal(joined, true);
  assert.equal(gate.isBusy(), false);
});

test("Preview action failure is preserved while shutdown can join and later retry", async () => {
  const gate = createSpsPluginPreviewOperationGate();
  const failure = new Error("exact failure");
  await assert.rejects(gate.run(() => { throw failure; }), error => error === failure);
  await gate.waitForIdle();
  assert.equal(gate.isBusy(), false);
  assert.equal(await gate.run(async () => "retry"), "retry");
  await assert.rejects(gate.run(null), /action is required/);
  assert.equal(gate.isBusy(), false);
});

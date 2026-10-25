import assert from "node:assert/strict";
import test from "node:test";
import { createSpsOwnerVaultOperationGate } from "../src/owner-vault-operation-gate.mjs";

function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

test("an in-flight Host start excludes restore until it really settles", async () => {
  const gate = createSpsOwnerVaultOperationGate();
  const hold = deferred();
  const starting = gate.start(() => hold.promise);
  await assert.rejects(gate.restore(() => {}), /already in progress/);
  hold.resolve("started");
  assert.equal(await starting, "started");
  assert.equal(await gate.restore(() => "restored"), "restored");
});

test("only the private permit can start the restored Host, not another start or restore", async () => {
  const gate = createSpsOwnerVaultOperationGate();
  const hold = deferred();
  let permit;
  const restoring = gate.restore(async value => { permit = value; await hold.promise; return gate.start(() => "activated", { restorePermit: value }); });
  assert.equal(gate.isRestoring(), true);
  await assert.rejects(gate.start(() => {}), /restore to finish/);
  await assert.rejects(gate.start(() => {}, { restorePermit: Symbol("SPS Host restore activation") }), /restore to finish/);
  await assert.rejects(gate.restore(() => {}), /already in progress/);
  hold.resolve();
  assert.equal(await restoring, "activated");
  assert.equal(gate.isRestoring(), false);
  await gate.start(() => {});
  assert.equal(typeof permit, "symbol");
});

test("failure releases the process-local gate without swallowing the actual operation failure", async () => {
  const gate = createSpsOwnerVaultOperationGate();
  await assert.rejects(gate.start(() => { throw new Error("start failed"); }), /start failed/);
  await assert.rejects(gate.restore(() => { throw new Error("restore failed"); }), /restore failed/);
  assert.equal(gate.isRestoring(), false);
  await gate.restore(() => {});
  await gate.start(() => {});
});

test("connection changes and restore exclude each other until their asynchronous work settles", async () => {
  const gate = createSpsOwnerVaultOperationGate();
  const hold = deferred();
  const changing = gate.changeConnection(() => hold.promise);
  await assert.rejects(gate.restore(() => {}), /already in progress/);
  hold.resolve();
  await changing;
  await gate.restore(async () => {
    let called = false;
    await assert.rejects(gate.changeConnection(() => { called = true; }), /restore to finish/);
    assert.equal(called, false);
  });
  await assert.rejects(gate.changeConnection(() => { throw new Error("connection failed"); }), /connection failed/);
  await gate.restore(() => {});
});

test("connection generation fences same-account ABA and failed mutations without treating Host starts as a new account", async () => {
  const gate = createSpsOwnerVaultOperationGate();
  assert.equal(gate.connectionGeneration(), 0n); assert.equal(gate.isChangingConnection(), false);
  await gate.start(() => {}); assert.equal(gate.connectionGeneration(), 0n);
  await gate.changeConnection(async () => { assert.equal(gate.isChangingConnection(), true); assert.equal(gate.connectionGeneration(), 1n); });
  assert.equal(gate.isChangingConnection(), false);
  await assert.rejects(gate.changeConnection(() => { throw new Error("fixture"); }));
  assert.equal(gate.connectionGeneration(), 2n);
  await gate.restore(() => {}); assert.equal(gate.connectionGeneration(), 3n);
});

test("invalidation precedes account and restore mutations, including failed actions", async () => {
  const events = [];
  const gate = createSpsOwnerVaultOperationGate({ onInvalidation: () => { events.push(`invalidate:${gate.connectionGeneration()}`); } });
  await gate.changeConnection(() => { events.push("change"); });
  await assert.rejects(gate.changeConnection(() => { events.push("failed-change"); throw new Error("fixture"); }));
  await gate.restore(() => { events.push("restore"); });
  assert.deepEqual(events, ["invalidate:1", "change", "invalidate:2", "failed-change", "invalidate:3", "restore"]);
});

test("invalidation failure aborts mutation without leaving the gate locked", async () => {
  let fail = true, invoked = false;
  const gate = createSpsOwnerVaultOperationGate({ onInvalidation: () => { if (fail) throw new Error("fixture invalidation failed"); } });
  await assert.rejects(gate.changeConnection(() => { invoked = true; }), /invalidation failed/);
  assert.equal(invoked, false); assert.equal(gate.isChangingConnection(), false);
  await assert.rejects(gate.restore(() => { invoked = true; }), /invalidation failed/);
  assert.equal(invoked, false); assert.equal(gate.isRestoring(), false);
  fail = false;
  await gate.restore(() => {});
});

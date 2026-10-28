import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpsHostShareMutationCoordinator,
  SpsHostShareReconciliationRequiredError,
} from "../src/host-share-mutation.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("serializes share changes and rechecks queued authority before starting", async () => {
  const coordinator = createSpsHostShareMutationCoordinator();
  const firstGate = deferred();
  const order = [];
  let secondIsCurrent = true;

  const first = coordinator.run(() => order.push("first-authority"), async () => {
    order.push("first-start");
    await firstGate.promise;
    order.push("first-end");
  });
  const second = coordinator.run(() => {
    order.push("second-authority");
    if (!secondIsCurrent) throw new Error("stale");
  }, async () => order.push("second-start"));
  const secondObserved = second.then(() => ({ ok: true }), error => ({ error }));

  await new Promise(resolve => setImmediate(resolve));
  const whileFirstIsBlocked = [...order];
  secondIsCurrent = false;
  firstGate.resolve();

  await first;
  const secondResult = await secondObserved;
  assert.deepEqual(whileFirstIsBlocked, ["first-authority", "second-authority", "first-authority", "first-start"]);
  assert.match(secondResult.error.message, /stale/);
  assert.deepEqual(order, [
    "first-authority", "second-authority", "first-authority", "first-start", "first-end", "second-authority",
  ]);
});

test("a failed operation releases the queue for later authorized work", async () => {
  const coordinator = createSpsHostShareMutationCoordinator();
  const order = [];
  const failure = new Error("private operation detail");

  await assert.rejects(coordinator.run(() => {}, async () => {
    order.push("failed-start");
    throw failure;
  }), error => error === failure);
  await coordinator.run(() => order.push("next-authority"), async () => order.push("next-start"));

  assert.deepEqual(order, ["failed-start", "next-authority", "next-authority", "next-start"]);
});

test("rejects asynchronous authority checks before a mutation can start", async () => {
  const coordinator = createSpsHostShareMutationCoordinator();
  let actionStarted = false;
  await assert.rejects(coordinator.run(async () => {}, async () => { actionStarted = true; }), /must be synchronous/);
  assert.equal(actionStarted, false);
});

test("closeAndDrain joins accepted work and rejects new mutations", async () => {
  const coordinator = createSpsHostShareMutationCoordinator();
  const started = deferred();
  const finish = deferred();
  let actionFinished = false;
  const operation = coordinator.run(() => {}, async () => {
    started.resolve();
    await finish.promise;
    actionFinished = true;
  });
  await started.promise;

  const draining = coordinator.closeAndDrain();
  let drainFinished = false;
  void draining.then(() => { drainFinished = true; });
  await assert.rejects(coordinator.run(() => {}, async () => {}), /shutting down/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(drainFinished, false);
  assert.equal(actionFinished, false);

  finish.resolve();
  await operation;
  await draining;
  assert.equal(actionFinished, true);
  assert.equal(coordinator.closeAndDrain(), draining);
});

test("closeAndDrain joins settled failures without treating them as a live child", async () => {
  const coordinator = createSpsHostShareMutationCoordinator();
  const started = deferred();
  const fail = deferred();
  const operation = coordinator.run(() => {}, async () => {
    started.resolve();
    await fail.promise;
  }).then(() => ({ ok: true }), error => ({ error }));
  await started.promise;
  const draining = coordinator.closeAndDrain();
  fail.reject(new Error("private API or ACL failure"));

  const operationResult = await operation;
  assert.match(operationResult.error.message, /private API or ACL failure/);
  await draining;
});

test("reconciliation errors expose only fixed status and uncertainty flags", () => {
  const error = new SpsHostShareReconciliationRequiredError({
    localAccessMayHaveChanged: true,
    coreMayHaveChanged: true,
    path: "private path",
    credential: "private credential",
  });
  const serialized = JSON.stringify(error);

  assert.equal(error.code, "sps_host_share_reconciliation_required");
  assert.equal(error.localAccessMayHaveChanged, true);
  assert.equal(error.coreMayHaveChanged, true);
  assert.equal(error.message, "SPS Host share changes may be incomplete; refresh and reconcile access before retrying.");
  assert.doesNotMatch(serialized, /private path|private credential/);
  assert.doesNotMatch(error.stack ?? "", /private path|private credential/);
});

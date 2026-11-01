import assert from "node:assert/strict";
import test from "node:test";
import { createSpsDesktopPluginArtifactActivityGate } from "../src/plugin-artifact-activity-gate.mjs";

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("exports a frozen gate and synchronously marks maintenance before its callback yields", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  assert.equal(Object.isFrozen(gate), true);

  let entered = false;
  const operation = gate.withMaintenance(async () => {
    entered = true;
    assert.throws(() => gate.assertAdmissionAllowed(), /maintenance is already active/);
    assert.throws(() => gate.withActivity(() => {}), /maintenance is already active/);
    await Promise.resolve();
    return "maintained";
  });
  assert.equal(entered, true);
  assert.throws(() => gate.withMaintenance(() => {}), /activity is in progress/);
  assert.equal(await operation, "maintained");
  assert.doesNotThrow(() => gate.assertAdmissionAllowed());
});

test("rejects maintenance during activity and admits concurrent and nested activities", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  const first = deferred();
  const second = deferred();
  const firstWork = gate.withActivity(async () => {
    assert.throws(() => gate.withMaintenance(() => {}), /activity is in progress/);
    const nested = await gate.withActivity(() => "nested");
    assert.equal(nested, "nested");
    await first.promise;
  });
  const secondWork = gate.withActivity(() => second.promise);
  assert.throws(() => gate.withMaintenance(() => {}), /activity is in progress/);
  first.resolve();
  second.resolve();
  await Promise.all([firstWork, secondWork]);
  await gate.withMaintenance(() => "after activities");
});

test("waitForIdle joins only scopes present at the call and cannot be passed by a newer scope", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  const activityBlock = deferred();
  const maintenanceBlock = deferred();
  const activityEntered = deferred();
  const maintenanceEntered = deferred();
  const activity = gate.withActivity(async () => {
    activityEntered.resolve();
    await activityBlock.promise;
  });
  await activityEntered.promise;
  let idle = false;
  const idleWait = gate.waitForIdle().then(() => { idle = true; });
  activityBlock.resolve();
  await activity;
  await idleWait;
  assert.equal(idle, true);

  const maintenance = gate.withMaintenance(async () => {
    maintenanceEntered.resolve();
    await maintenanceBlock.promise;
  });
  await maintenanceEntered.promise;
  let maintenanceIdle = false;
  const maintenanceWait = gate.waitForIdle().then(() => { maintenanceIdle = true; });
  assert.equal(maintenanceIdle, false);
  maintenanceBlock.resolve();
  await maintenance;
  await maintenanceWait;
  assert.equal(maintenanceIdle, true);
});

test("a newer activity does not extend an existing idle snapshot", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  const firstBlock = deferred();
  const laterBlock = deferred();
  const first = gate.withActivity(() => firstBlock.promise);
  let idle = false;
  const wait = gate.waitForIdle().then(() => { idle = true; });
  firstBlock.resolve();
  await first;
  const later = gate.withActivity(() => laterBlock.promise);
  await wait;
  assert.equal(idle, true);
  laterBlock.resolve();
  await later;
});

test("synchronous throws and asynchronous rejections release their scopes and preserve errors", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  const thrown = new Error("sync action failure");
  assert.throws(() => gate.withActivity(() => { throw thrown; }), error => error === thrown);
  const activityFailure = gate.withActivity(() => Promise.reject("async activity failure"));
  const activityIdle = gate.waitForIdle();
  await assert.rejects(activityFailure, value => value === "async activity failure");
  await activityIdle;
  assert.throws(() => gate.withMaintenance(() => { throw thrown; }), error => error === thrown);
  const maintenanceFailure = gate.withMaintenance(() => Promise.reject("async maintenance failure"));
  const maintenanceIdle = gate.waitForIdle();
  await assert.rejects(maintenanceFailure, value => value === "async maintenance failure");
  await maintenanceIdle;
  await gate.withActivity(() => "released");
  await gate.withMaintenance(() => "released");
});

test("maintenance rejects non-functions and competing admission without waiting", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  assert.throws(() => gate.withMaintenance(null), /requires an action/);
  assert.throws(() => gate.withActivity(null), /requires an action/);

  const block = deferred();
  const activity = gate.withActivity(() => block.promise);
  assert.throws(() => gate.withMaintenance(() => {}), /activity is in progress/);
  block.resolve();
  await activity;
});

function assertUncertaintyBlocks(gate) {
  const fileActions = [];
  assert.throws(() => gate.assertAdmissionAllowed(), /activity is uncertain/);
  assert.throws(() => gate.withActivity(() => fileActions.push("activity")), /activity is uncertain/);
  assert.throws(() => gate.withMaintenance(() => fileActions.push("maintenance")), /activity is uncertain/);
  assert.deepEqual(fileActions, []);
}

test("independent uncertainty tokens block admission before callbacks can touch files", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  const releaseFirst = gate.retainUncertainty();
  const releaseSecond = gate.retainUncertainty();
  assert.equal(typeof releaseFirst, "function");
  assert.equal(typeof releaseSecond, "function");
  assert.notEqual(releaseFirst, releaseSecond);
  assertUncertaintyBlocks(gate);

  releaseFirst();
  assertUncertaintyBlocks(gate);
  releaseFirst();
  assertUncertaintyBlocks(gate);
  releaseSecond();
  assert.doesNotThrow(() => gate.assertAdmissionAllowed());
  assert.equal(await gate.withActivity(() => "activity admitted"), "activity admitted");
  assert.equal(await gate.withMaintenance(() => "maintenance admitted"), "maintenance admitted");
});

test("repeated old releases cannot clear a new uncertainty token", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  const releaseOld = gate.retainUncertainty();
  releaseOld();
  const releaseNew = gate.retainUncertainty();
  releaseOld();
  releaseOld();
  assertUncertaintyBlocks(gate);
  releaseNew();
  releaseNew();
  assert.equal(await gate.withMaintenance(() => "released"), "released");
});

for (const method of ["withActivity", "withMaintenance"]) {
  for (const rejects of [false, true]) {
    test(`${method} completion (${rejects ? "rejection" : "success"}) cannot clear retained uncertainty`, async () => {
      const gate = createSpsDesktopPluginArtifactActivityGate();
      const block = deferred();
      const failure = new Error("owned action failed");
      let resumed = false;
      const work = gate[method](async () => {
        await block.promise;
        resumed = true;
        if (rejects) throw failure;
        return "completed";
      });
      const outcome = rejects ? assert.rejects(work, error => error === failure) : work;
      const release = gate.retainUncertainty();
      assertUncertaintyBlocks(gate);
      let idle = false;
      const idleWait = gate.waitForIdle().then(() => { idle = true; });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(idle, false);
      assert.equal(resumed, false);

      block.resolve();
      await outcome;
      await idleWait;
      assert.equal(resumed, true);
      assert.equal(idle, true);
      assertUncertaintyBlocks(gate);
      release();
      assert.doesNotThrow(() => gate.assertAdmissionAllowed());
      assert.equal(await gate.withMaintenance(() => "released"), "released");
    });
  }
}

test("idle with no operations does not wait for or release uncertainty", async () => {
  const gate = createSpsDesktopPluginArtifactActivityGate();
  const release = gate.retainUncertainty();
  await gate.waitForIdle();
  assertUncertaintyBlocks(gate);
  release();
  assert.doesNotThrow(() => gate.assertAdmissionAllowed());
});

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

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createSpsDesktopPluginArtifactActivityGate } from "../src/plugin-artifact-activity-gate.mjs";
import { createSpsPluginArtifactObservation } from "../src/plugin-artifact-observation.mjs";
const EMPTY_SOURCES = Object.freeze({ sources: [], grants: [], fingerprint: createHash("sha256").update("[[],[]]").digest("hex") });

for (const [name, guard] of [
  ["false", () => false], ["async false", async () => false],
  ["async rejection", async () => { throw new Error("Owner lost"); }],
  ["non-receipt", () => ({ accepted: true })],
]) {
  test(`owner guard cannot be bypassed by ${name}`, async () => {
    const activity = createSpsDesktopPluginArtifactActivityGate();
    let inputs = 0, entered = 0;
    const observation = createSpsPluginArtifactObservation({ activity, capture: () => ({
      assertCurrent: guard,
      readInputs: async () => { inputs += 1; throw new Error("Inputs must not be read before authority."); },
      participants: [{ id: "host", manager: { async withPluginArtifactReferences() { entered += 1; } } }],
    }) });
    await assert.rejects(observation.withSnapshot(async () => assert.fail("No authority")));
    assert.equal(inputs, 0); assert.equal(entered, 0);
    await activity.withMaintenance(async () => {});
  });
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// These fake scoped managers and read inputs are synthetic contracts, not production/UI authority.
function makeFixture({ participants, hostOptions = {}, previewOptions = {}, inputOptions = {}, ownerOptions = {}, includeSourceInventory = false,
  requireSourceReconciliation = false } = {}) {
  const events = [];
  const held = new Set();
  let ownerCurrent = true;
  let inputsCurrent = true;
  let ownerChecks = 0;
  let inputChecks = 0;
  const input = {
    references: [{ path: "synthetic-input" }],
    assertCurrent() {
      inputChecks += 1;
      if (!inputsCurrent || inputOptions.staleAtCheck === inputChecks) throw new Error("stale synthetic inputs");
    },
  };
  if (Object.hasOwn(inputOptions, "reconcile")) input.reconcileSourceInventory = inputOptions.reconcile;
  const manager = (id, options = {}) => ({
    async withPluginArtifactReferences(action, receivedOptions) {
      events.push(`acquire:${id}`);
      if (options.failure) throw options.failure;
      assert.equal(held.has(id), false);
      held.add(id);
      try {
        const index = id === "host" ? 0 : 1;
        const scope = {
          coverage: id === "host" ? "core-and-parent-paths" : "core-only",
          fingerprint: (index ? "b" : "a").repeat(64),
          references: [{ path: `synthetic-${id}` }],
          ...(options.sourceInventory ? { sourceInventory: options.sourceInventory } : {}),
          ...(id === "host" ? { parentPaths: [{ path: "synthetic-parent" }] } : {}),
          async assertCurrent() {
            if (!held.has(id)) throw new Error(`expired synthetic ${id} scope`);
          },
        };
        if (id === "host") assert.deepEqual(receivedOptions, { parentPaths: input.references, ...(includeSourceInventory ? { sourceInventory: true } : {}) });
        else if (includeSourceInventory) assert.deepEqual(receivedOptions, { sourceInventory: true });
        else assert.equal(receivedOptions, undefined);
        return await action(scope);
      } finally {
        held.delete(id);
        events.push(`release:${id}`);
      }
    },
  });
  const allParticipants = participants ?? [
    { id: "host", manager: manager("host", hostOptions) },
    { id: "preview", manager: manager("preview", previewOptions) },
  ];
  const activity = createSpsDesktopPluginArtifactActivityGate();
  const observation = createSpsPluginArtifactObservation({
    activity,
    capture() {
      return {
        participants: allParticipants,
        ...(includeSourceInventory ? { includeSourceInventory: true } : {}),
        ...(requireSourceReconciliation ? { requireSourceReconciliation: true } : {}),
        assertCurrent() {
          ownerChecks += 1;
          if (!ownerCurrent || ownerOptions.staleAtCheck === ownerChecks) throw new Error("stale synthetic owner");
        },
        async readInputs() {
          events.push("read-inputs");
          return input;
        },
      };
    },
  });
  return {
    activity, observation, events, held, input,
    setOwnerCurrent(value) { ownerCurrent = value; },
    setInputsCurrent(value) { inputsCurrent = value; },
  };
}

test("holds host then preview through callback and releases in reverse order while preserving result", async () => {
  const fixture = makeFixture();
  const result = await fixture.observation.withSnapshot(async snapshot => {
    assert.deepEqual([...fixture.held], ["host", "preview"]);
    assert.equal(snapshot.coverage, "desktop-and-owned-cores");
    assert.deepEqual(snapshot.references.map(reference => reference.processOwner), ["host", "desktop", "preview"]);
    return "synthetic result";
  });

  assert.equal(result, "synthetic result");
  assert.deepEqual(fixture.events, [
    "read-inputs", "acquire:host", "acquire:preview", "release:preview", "release:host",
  ]);
  assert.deepEqual([...fixture.held], []);
});

test("explicit Source composition retains distinct validated Host/Preview inventories", async () => {
  const f = makeFixture({ includeSourceInventory: true,
    hostOptions: { sourceInventory: EMPTY_SOURCES }, previewOptions: { sourceInventory: EMPTY_SOURCES } });
  await f.observation.withSnapshot(async scope => {
    assert.deepEqual(scope.sourceInventories.map(row => row.processOwner), ["host", "preview"]);
    assert.equal(Object.isFrozen(scope.sourceInventories), true);
    for (const row of scope.sourceInventories) {
      assert.equal(Object.isFrozen(row), true);
      assert.equal(Object.isFrozen(row.inventory), true);
      assert.deepEqual(row.inventory, EMPTY_SOURCES);
    }
    assert.deepEqual([...f.held], ["host", "preview"]);
  });
  assert.equal(f.held.size, 0);
});

test("a missing or invalid participant Source inventory cannot yield partial composition", async () => {
  for (const previewOptions of [{}, { sourceInventory: { ...EMPTY_SOURCES, fingerprint: "0".repeat(64) } }]) {
    const f = makeFixture({ includeSourceInventory: true, hostOptions: { sourceInventory: EMPTY_SOURCES }, previewOptions });
    let called = false;
    await assert.rejects(f.observation.withSnapshot(() => { called = true; }));
    assert.equal(called, false);
    assert.equal(f.held.size, 0);
    await f.activity.withMaintenance(async () => {});
  }
});

test("reconciles Host sources only while both scopes are held and clones the bounded receipt", async () => {
  let reconciled = 0;
  const receipt = Object.freeze({ sourceCount: 0, grantCount: 0, fingerprint: EMPTY_SOURCES.fingerprint });
  const f = makeFixture({ includeSourceInventory: true, requireSourceReconciliation: true,
    hostOptions: { sourceInventory: EMPTY_SOURCES }, previewOptions: { sourceInventory: EMPTY_SOURCES },
    inputOptions: { reconcile(inventory) {
      assert.deepEqual([...f.held], ["host", "preview"]);
      assert.deepEqual(inventory, EMPTY_SOURCES);
      reconciled += 1;
      return receipt;
    } } });
  await f.observation.withSnapshot(scope => {
    assert.equal(reconciled, 1);
    assert.deepEqual(scope.sourceReconciliation, receipt);
    assert.notEqual(scope.sourceReconciliation, receipt);
    assert.equal(Object.isFrozen(scope.sourceReconciliation), true);
  });
  assert.equal(f.held.size, 0);
});

test("required reconciliation fails closed for missing, async, malformed, or stale input receipts", async () => {
  const valid = () => Object.freeze({ sourceCount: 0, grantCount: 0, fingerprint: EMPTY_SOURCES.fingerprint });
  for (const inputOptions of [
    {}, { reconcile: async () => valid() }, { reconcile: async () => { throw new Error("rejected async reconciliation"); } },
    { reconcile: () => ({ ...valid() }) }, { reconcile: () => Object.freeze({ ...valid(), sourceCount: 1 }) },
    { reconcile: () => Object.freeze({ ...valid(), privatePath: "must not escape" }) },
    { reconcile: () => Object.freeze({ then() {}, ...valid() }) },
    { reconcile: () => { throw new Error("unmapped Source"); } },
  ]) {
    const f = makeFixture({ includeSourceInventory: true, requireSourceReconciliation: true,
      hostOptions: { sourceInventory: EMPTY_SOURCES }, previewOptions: { sourceInventory: EMPTY_SOURCES }, inputOptions });
    let called = false;
    await assert.rejects(f.observation.withSnapshot(() => { called = true; }));
    assert.equal(called, false);
    assert.equal(f.held.size, 0);
    await f.activity.withMaintenance(async () => {});
  }
  const f = makeFixture({ includeSourceInventory: true, requireSourceReconciliation: true,
    hostOptions: { sourceInventory: EMPTY_SOURCES }, previewOptions: { sourceInventory: EMPTY_SOURCES },
    inputOptions: { reconcile() { f.setInputsCurrent(false); return valid(); } } });
  await assert.rejects(f.observation.withSnapshot(() => assert.fail("Stale input must not advance Main work.")));
  assert.equal(f.held.size, 0);
});

test("a nonempty Preview Source inventory cannot borrow Host mappings", async () => {
  const sources = [{ kind: "workspace", id: "11111111-1111-4111-8111-111111111111",
    workspaceId: "22222222-2222-4222-8222-222222222222", resourceId: "11111111-1111-4111-8111-111111111111",
    status: "available", routeFingerprint: null, revision: "2026-11-02T03:04:05.006Z" }];
  const previewInventory = { sources, grants: [], fingerprint: createHash("sha256").update(JSON.stringify([sources, []])).digest("hex") };
  const f = makeFixture({ includeSourceInventory: true, requireSourceReconciliation: true,
    hostOptions: { sourceInventory: EMPTY_SOURCES }, previewOptions: { sourceInventory: previewInventory },
    inputOptions: { reconcile: () => assert.fail("Preview mappings are not Host mappings.") } });
  await assert.rejects(f.observation.withSnapshot(() => assert.fail("No partial Source coverage.")));
  assert.equal(f.held.size, 0);
});

test("reconciliation cannot be enabled without explicitly requesting the Core inventories", async () => {
  const f = makeFixture({ requireSourceReconciliation: true });
  await assert.rejects(f.observation.withSnapshot(() => assert.fail("No unrequested inventory fallback.")));
  assert.deepEqual(f.events, []);
});

test("preserves callback errors and still releases both scopes in reverse order", async () => {
  const fixture = makeFixture();
  const failure = new Error("synthetic callback failure");
  await assert.rejects(fixture.observation.withSnapshot(async () => {
    assert.deepEqual([...fixture.held], ["host", "preview"]);
    throw failure;
  }), error => error === failure);
  assert.deepEqual(fixture.events.slice(-2), ["release:preview", "release:host"]);
  assert.deepEqual([...fixture.held], []);
});

test("maintenance admission is busy and rejects competing work without draining it", async () => {
  const fixture = makeFixture();
  const entered = deferred();
  const unblock = deferred();
  const operation = fixture.observation.withSnapshot(async () => {
    entered.resolve();
    await unblock.promise;
    return "done";
  });
  await entered.promise;
  let competingCallbackRan = false;
  assert.throws(() => fixture.activity.withActivity(() => { competingCallbackRan = true; }), /maintenance/);
  assert.throws(() => fixture.activity.withMaintenance(() => { competingCallbackRan = true; }), /in progress/);
  assert.equal(competingCallbackRan, false);
  assert.deepEqual([...fixture.held], ["host", "preview"]);
  unblock.resolve();
  assert.equal(await operation, "done");
});

test("stale owner or inputs before callback deny execution", async t => {
  await t.test("owner", async () => {
    const fixture = makeFixture({ ownerOptions: { staleAtCheck: 5 } });
    let callbackRan = false;
    await assert.rejects(fixture.observation.withSnapshot(() => { callbackRan = true; }), /stale synthetic owner/);
    assert.equal(callbackRan, false);
    assert.deepEqual([...fixture.held], []);
  });
  await t.test("inputs", async () => {
    const fixture = makeFixture({ inputOptions: { staleAtCheck: 1 } });
    let callbackRan = false;
    await assert.rejects(fixture.observation.withSnapshot(() => { callbackRan = true; }), /stale synthetic inputs/);
    assert.equal(callbackRan, false);
    assert.deepEqual([...fixture.held], []);
  });
});

test("stale owner or inputs after callback deny the snapshot result", async t => {
  await t.test("owner", async () => {
    const fixture = makeFixture();
    await assert.rejects(fixture.observation.withSnapshot(() => {
      fixture.setOwnerCurrent(false);
      return "must be denied";
    }), /stale synthetic owner/);
    assert.deepEqual([...fixture.held], []);
  });
  await t.test("inputs", async () => {
    const fixture = makeFixture();
    await assert.rejects(fixture.observation.withSnapshot(() => {
      fixture.setInputsCurrent(false);
      return "must be denied";
    }), /stale synthetic inputs/);
    assert.deepEqual([...fixture.held], []);
  });
});

test("pending callback keeps both scopes held and cannot end early", async () => {
  const fixture = makeFixture();
  const entered = deferred();
  const unblock = deferred();
  let settled = false;
  const operation = fixture.observation.withSnapshot(async () => {
    entered.resolve();
    await unblock.promise;
    return "complete";
  }).finally(() => { settled = true; });
  await entered.promise;
  await Promise.resolve();
  assert.equal(settled, false);
  assert.deepEqual([...fixture.held], ["host", "preview"]);
  assert.deepEqual(fixture.events.slice(-2), ["acquire:host", "acquire:preview"]);
  unblock.resolve();
  assert.equal(await operation, "complete");
  assert.deepEqual(fixture.events.slice(-2), ["release:preview", "release:host"]);
});

test("snapshot assertion expires after its callback and scoped managers release", async () => {
  const fixture = makeFixture();
  let snapshot;
  await fixture.observation.withSnapshot(value => { snapshot = value; });
  await assert.rejects(snapshot.assertCurrent(), /incomplete or changed/);
  assert.deepEqual([...fixture.held], []);
});

test("unknown, missing, and duplicate participants deny before input reads or callbacks", async t => {
  const host = { id: "host", manager: { withPluginArtifactReferences: async () => assert.fail("must not acquire") } };
  const preview = { id: "preview", manager: { withPluginArtifactReferences: async () => assert.fail("must not acquire") } };
  const cases = [
    ["unknown", [{ id: "worker", manager: host.manager }]],
    ["empty", []],
    ["missing host", [preview]],
    ["duplicate", [host, { id: "host", manager: host.manager }]],
  ];
  for (const [name, participants] of cases) {
    await t.test(name, async () => {
      const fixture = makeFixture({ participants });
      let callbackRan = false;
      await assert.rejects(fixture.observation.withSnapshot(() => { callbackRan = true; }), /incomplete or changed/);
      assert.equal(callbackRan, false);
      assert.deepEqual(fixture.events, []);
    });
  }
});

test("preview acquisition failure releases host without running callback", async () => {
  const failure = new Error("synthetic preview acquisition failure");
  const fixture = makeFixture({ previewOptions: { failure } });
  let callbackRan = false;
  await assert.rejects(fixture.observation.withSnapshot(() => { callbackRan = true; }), error => error === failure);
  assert.equal(callbackRan, false);
  assert.deepEqual(fixture.events, ["read-inputs", "acquire:host", "acquire:preview", "release:host"]);
  assert.deepEqual([...fixture.held], []);
});

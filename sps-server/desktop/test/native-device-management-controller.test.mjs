import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createNativeDeviceManagementController, nativeHostCoreOwnerUserId } from "../src/native-device-management-controller.mjs";

const HOST_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_HOST_ID = "22222222-2222-4222-8222-222222222222";
const DEVICE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PIN = "a".repeat(64);
const OTHER_PIN = "b".repeat(64);
const AUTHORITY = Object.freeze({ ownerSubject: "private-owner", userDataDirectory: "C:/private/user", vaultDirectory: "C:/private/vault", generation: 1n });
const IDENTITY = Object.freeze({ hostId: HOST_ID, serverSpkiSha256: PIN });

test("Native Host startup uses Core's exact subject-to-user Base64URL mapping", async () => {
  for (const subject of ["private-owner", "native-host-owner-123", " owner "]) {
    assert.equal(nativeHostCoreOwnerUserId(subject), `sps_identity_${createHash("sha256").update(subject).digest("base64url")}`);
    assert.notEqual(nativeHostCoreOwnerUserId(subject), `sps_identity_${createHash("sha256").update(subject).digest("hex")}`);
  }
  for (const invalid of [null, undefined, 1, {}, "", "  "]) assert.throws(() => nativeHostCoreOwnerUserId(invalid));
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(main, /SPS_NATIVE_HOST_OWNER_USER_ID:\s*nativeManagementPrepared\s*\? nativeHostCoreOwnerUserId\(nativeAuthority\.ownerSubject\) : ""/);
});

function device(overrides = {}) {
  return {
    id: DEVICE_ID, displayName: "Studio laptop", status: "pending", certificateSha256: PIN,
    certificateNotAfter: "2099-01-01T00:00:00.000Z", revision: 1,
    ...overrides,
  };
}

function setup(overrides = {}) {
  let currentAuthority = overrides.authority === undefined ? AUTHORITY : overrides.authority;
  const calls = { getAuthority: 0, authenticateHost: 0, getIdentity: 0, getHostBinding: 0, listDevices: 0, mutateDevice: 0 };
  const callbacks = {
    getAuthority: () => { calls.getAuthority++; return currentAuthority; },
    authenticateHost: async () => { calls.authenticateHost++; },
    getIdentity: async () => { calls.getIdentity++; return IDENTITY; },
    getHostBinding: async () => { calls.getHostBinding++; return IDENTITY; },
    listDevices: async () => { calls.listDevices++; return [device()]; },
    mutateDevice: async () => { calls.mutateDevice++; },
    ...overrides.callbacks,
  };
  return {
    calls,
    controller: createNativeDeviceManagementController(callbacks),
    setAuthority(value) { currentAuthority = value; },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("requires every injected dependency to be a function", () => {
  const valid = {
    getAuthority() {}, authenticateHost() {}, getIdentity() {}, getHostBinding() {}, listDevices() {}, mutateDevice() {},
  };
  for (const name of Object.keys(valid)) {
    assert.throws(() => createNativeDeviceManagementController({ ...valid, [name]: null }), TypeError, name);
  }
});

test("available response projects only public device fields and never exposes credential or account data", async () => {
  const ctx = setup({ callbacks: { listDevices: async () => [device({
    certificatePem: "-----BEGIN CERTIFICATE-----secret-----END CERTIFICATE-----",
    privateKeyPem: "-----BEGIN PRIVATE KEY-----secret-----END PRIVATE KEY-----",
    accountMetadata: { ownerSubject: "private-owner", email: "private@example.test" },
    extra: "untrusted extension field",
  })] } });
  const result = await ctx.controller.list();
  assert.deepEqual(result, {
    state: "available", lanEnabled: false,
    devices: [{ id: DEVICE_ID, displayName: "Studio laptop", status: "pending", certificateSha256: PIN,
      certificateNotAfter: "2099-01-01T00:00:00.000Z", revision: 1 }],
  });
  assert.deepEqual(Object.keys(result.devices[0]), ["id", "displayName", "status", "certificateSha256", "certificateNotAfter", "revision"]);
  assert.doesNotMatch(JSON.stringify(result), /BEGIN CERTIFICATE|BEGIN PRIVATE KEY|accountMetadata|private-owner|private@example|private\/user|private\/vault|untrusted extension/);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.devices), true);
  assert.equal(Object.isFrozen(result.devices[0]), true);
});

test("without a Host it reports host_required and calls no Host or Core dependency", async () => {
  const ctx = setup({ authority: null });
  assert.deepEqual(await ctx.controller.list(), { state: "host_required", lanEnabled: false, devices: [] });
  assert.deepEqual(ctx.calls, { getAuthority: 1, authenticateHost: 0, getIdentity: 0, getHostBinding: 0, listDevices: 0, mutateDevice: 0 });
});

test("maps missing Native identity and missing Core Host to their distinct unavailable states", async t => {
  await t.test("identity_required", async () => {
    const ctx = setup({ callbacks: { getIdentity: async () => { const error = new Error("private diagnostics"); error.code = "native_identity_unavailable"; throw error; } } });
    assert.deepEqual(await ctx.controller.list(), { state: "identity_required", lanEnabled: false, devices: [] });
    assert.equal(ctx.calls.listDevices, 0);
  });
  await t.test("host_restart_required", async () => {
    const ctx = setup({ callbacks: { authenticateHost: async () => { const error = new Error("Core details"); error.status = 404; throw error; } } });
    assert.deepEqual(await ctx.controller.list(), { state: "host_restart_required", lanEnabled: false, devices: [] });
    assert.equal(ctx.calls.getIdentity, 0);
  });
});

test("requires the Native identity Host ID and SPKI pin to match the current Core Host binding", async t => {
  for (const [label, binding] of [
    ["wrong Host ID", { hostId: OTHER_HOST_ID, serverSpkiSha256: PIN }],
    ["wrong SPKI pin", { hostId: HOST_ID, serverSpkiSha256: OTHER_PIN }],
  ]) {
    await t.test(label, async () => {
      const ctx = setup({ callbacks: { getHostBinding: async () => binding } });
      assert.deepEqual(await ctx.controller.list(), { state: "unavailable", lanEnabled: false, devices: [] });
      assert.equal(ctx.calls.listDevices, 0);
    });
  }
});

test("rejects malformed action inputs and accessors without evaluating getters or calling dependencies", async () => {
  const ctx = setup();
  let getterCalled = false;
  const accessorInput = Object.defineProperty({}, "deviceId", { enumerable: true, get() { getterCalled = true; return DEVICE_ID; } });
  for (const input of [null, [], {}, { deviceId: DEVICE_ID, extra: true }, accessorInput, { deviceId: "not-a-uuid" }]) {
    await assert.rejects(ctx.controller.change("approve", input, { assertRequester() {} }), TypeError);
  }
  await assert.rejects(ctx.controller.change("grant", { deviceId: DEVICE_ID }, { assertRequester() {} }));
  assert.equal(getterCalled, false);
  assert.deepEqual(ctx.calls, { getAuthority: 0, authenticateHost: 0, getIdentity: 0, getHostBinding: 0, listDevices: 0, mutateDevice: 0 });
});

test("approve denies revoked and expired devices without invoking any grant-like mutation", async t => {
  for (const [label, row] of [
    ["revoked", device({ status: "revoked" })],
    ["expired", device({ certificateNotAfter: "2000-01-01T00:00:00.000Z" })],
  ]) {
    await t.test(label, async () => {
      const ctx = setup({ callbacks: { listDevices: async () => { ctx.calls.listDevices++; return [row]; } } });
      await assert.rejects(ctx.controller.change("approve", { deviceId: DEVICE_ID }, { assertRequester() {}, confirm: async () => true }));
      assert.equal(ctx.calls.mutateDevice, 0);
      assert.equal(ctx.calls.listDevices, 1);
      assert.equal(Object.hasOwn(ctx.controller, "grant"), false);
    });
  }
});

test("confirmation is mandatory, cancellation does not write, and a stale confirmed target fails closed", async t => {
  const missing = setup();
  await assert.rejects(missing.controller.change("approve", { deviceId: DEVICE_ID }, { assertRequester() {} }));
  assert.equal(missing.calls.authenticateHost, 0);
  const cancelled = setup();
  const result = await cancelled.controller.change("approve", { deviceId: DEVICE_ID }, {
    assertRequester() {}, confirm: async row => { assert.deepEqual(row, device()); return false; },
  });
  assert.equal(result.state, "available");
  assert.equal(cancelled.calls.mutateDevice, 0);
  for (const [label, change] of [
    ["account", ctx => ctx.setAuthority({ ...AUTHORITY, ownerSubject: "other-owner" })],
    ["Vault generation", ctx => ctx.setAuthority({ ...AUTHORITY, generation: 2n })],
    ["device revision", (_ctx, state) => { state.row = device({ revision: 2 }); }],
    ["device certificate", (_ctx, state) => { state.row = device({ certificateSha256: OTHER_PIN }); }],
    ["expired device", (_ctx, state) => { state.row = device({ certificateNotAfter: "2000-01-01T00:00:00.000Z" }); }],
  ]) await t.test(label, async () => {
    const state = { row: device() };
    const ctx = setup({ callbacks: { listDevices: async () => [state.row] } });
    await assert.rejects(ctx.controller.change("approve", { deviceId: DEVICE_ID }, {
      assertRequester() {}, confirm: async () => { change(ctx, state); return true; },
    }));
    assert.equal(ctx.calls.mutateDevice, 0);
  });
});

test("authority generation changes during identity or device reads withhold results and stop pre-mutation", async t => {
  await t.test("generation changes during initial getIdentity", async () => {
    const gate = deferred();
    const entered = deferred();
    const ctx = setup({ callbacks: { getIdentity: async () => { ctx.calls.getIdentity++; entered.resolve(); await gate.promise; return IDENTITY; } } });
    const pending = ctx.controller.list();
    await entered.promise;
    ctx.setAuthority({ ...AUTHORITY, generation: 2n });
    gate.resolve();
    assert.deepEqual(await pending, { state: "unavailable", lanEnabled: false, devices: [] });
    assert.equal(ctx.calls.listDevices, 0);
  });
  await t.test("generation changes during listDevices", async () => {
    const gate = deferred();
    const entered = deferred();
    const ctx = setup({ callbacks: { listDevices: async () => { ctx.calls.listDevices++; entered.resolve(); await gate.promise; return [device()]; } } });
    const pending = ctx.controller.list();
    await entered.promise;
    ctx.setAuthority({ ...AUTHORITY, generation: 2n });
    gate.resolve();
    assert.deepEqual(await pending, { state: "unavailable", lanEnabled: false, devices: [] });
    assert.equal(ctx.calls.getIdentity, 1);
  });
  await t.test("generation changes during post-read getIdentity before mutation", async () => {
    const gate = deferred();
    const entered = deferred();
    const ctx = setup({ callbacks: { getIdentity: async () => {
      ctx.calls.getIdentity++;
      if (ctx.calls.getIdentity === 2) { entered.resolve(); await gate.promise; return IDENTITY; }
      return IDENTITY;
    } } });
    const pending = ctx.controller.change("approve", { deviceId: DEVICE_ID }, { assertRequester() {}, confirm: async () => true });
    await entered.promise;
    ctx.setAuthority({ ...AUTHORITY, generation: 2n });
    gate.resolve();
    await assert.rejects(pending);
    assert.equal(ctx.calls.mutateDevice, 0);
  });
});

test("rechecks requester before and after awaits and rejects a lost requester before mutation", async t => {
  await t.test("requester already gone", async () => {
    const ctx = setup();
    await assert.rejects(ctx.controller.change("approve", { deviceId: DEVICE_ID }, { assertRequester() { throw new Error("window closed"); }, confirm: async () => true }));
    assert.equal(ctx.calls.authenticateHost, 0);
  });
  await t.test("requester closes while listing", async () => {
    let alive = true;
    const gate = deferred();
    const entered = deferred();
    const ctx = setup({ callbacks: { listDevices: async () => { ctx.calls.listDevices++; entered.resolve(); await gate.promise; return [device()]; } } });
    let checks = 0;
    const pending = ctx.controller.change("approve", { deviceId: DEVICE_ID }, { assertRequester() { checks++; if (!alive) throw new Error("window closed"); }, confirm: async () => true });
    await entered.promise;
    alive = false;
    gate.resolve();
    await assert.rejects(pending);
    assert.ok(checks >= 2);
    assert.equal(ctx.calls.mutateDevice, 0);
  });
});

test("serializes concurrent mutations and reports post-mutation invalidation without claiming rollback", async t => {
  await t.test("one concurrent winner with bounded Core calls", async () => {
    const gate = deferred();
    const entered = deferred();
    const ctx = setup({ callbacks: { mutateDevice: async () => { ctx.calls.mutateDevice++; entered.resolve(); await gate.promise; } } });
    const options = { assertRequester() {}, confirm: async () => true };
    const first = ctx.controller.change("approve", { deviceId: DEVICE_ID }, options);
    await entered.promise;
    await assert.rejects(ctx.controller.change("revoke", { deviceId: DEVICE_ID }, options));
    gate.resolve();
    assert.equal((await first).state, "available");
    assert.deepEqual(ctx.calls, { getAuthority: 18, authenticateHost: 1, getIdentity: 4, getHostBinding: 1, listDevices: 3, mutateDevice: 1 });
  });
  await t.test("mutation completed, then generation changed", async () => {
    const gate = deferred();
    const entered = deferred();
    let applied = 0;
    const ctx = setup({ callbacks: { mutateDevice: async () => { ctx.calls.mutateDevice++; entered.resolve(); await gate.promise; applied++; } } });
    const pending = ctx.controller.change("approve", { deviceId: DEVICE_ID }, { assertRequester() {}, confirm: async () => true });
    await entered.promise;
    ctx.setAuthority({ ...AUTHORITY, generation: 2n });
    gate.resolve();
    await assert.rejects(pending);
    assert.equal(applied, 1);
    assert.equal(ctx.calls.listDevices, 2);
  });
});

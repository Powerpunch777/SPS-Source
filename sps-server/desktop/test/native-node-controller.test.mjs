import assert from "node:assert/strict";
import test from "node:test";
import { createNodeIdentity } from "@sps/desktop-node";
import { createSpsNativeNodeController } from "../src/native-node-controller.mjs";
import { readNativeNodeIdentityCapsule } from "../src/native-node-state.mjs";

const AUTHORITY = Object.freeze({ identityIssuer: "https://identity.example", subject: "member-1",
  userDataDirectory: "C:/Users/member/AppData", vaultDirectory: "C:/Users/member/AppData/vault", generation: 1 });
const HOST = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const DEVICE = "33333333-3333-4333-8333-333333333333";
const NODE = "44444444-4444-4444-8444-444444444444";
const selection = Object.freeze({ hostId: HOST, workspaceId: WORKSPACE });

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture({ beforeInvoke, onRegister, confirm = async () => true, cancelCommand, recover,
  execute = async () => {}, claimCommandId = null } = {}) {
  let state = { v: 1, entries: [] };
  let authority = AUTHORITY;
  let identityCreations = 0;
  const requests = [];
  const timers = [];
  const controller = createSpsNativeNodeController({
    getAuthority: () => authority,
    getState: () => state,
    saveState: async value => { state = value; },
    encrypt: text => Buffer.from(text).toString("base64"),
    decrypt: value => Buffer.from(value, "base64").toString("utf8"),
    getMember: () => ({
      recover: recover ?? (async () => ({ status: "approved", deviceId: DEVICE })),
      invokeNode: async ({ request }) => {
        requests.push(request);
        await beforeInvoke?.(request, state);
        if (request.operation === "register") return { data: await onRegister?.(request, state)
          ?? { id: NODE, companyId: WORKSPACE, status: "active" }, origin: "https://host.example" };
        if (request.operation === "heartbeat") return { data: { id: NODE, companyId: WORKSPACE, status: "active" }, origin: "https://host.example" };
        if (request.operation === "claim-command") return { data: claimCommandId ? {
          id: claimCommandId, nodeId: NODE, companyId: WORKSPACE, status: "claimed", env: {},
        } : null };
        if (request.operation === "claim-plugin-run") return { data: null };
        return { data: {} };
      },
    }),
    confirm, appVersion: "0.4.137",
    createIdentity: () => { identityCreations += 1; return createNodeIdentity(); },
    scanCapabilities: async () => [], scanRunners: async () => [], execute,
    cancelCommand,
    setTimer: (callback, delayMs) => { const timer = { callback, delayMs, unref() {} }; timers.push(timer); return timer; },
    clearTimer: timer => { timer.cleared = true; },
  });
  return { controller, requests, timers, setAuthority(value) { authority = value; },
    get state() { return state; }, get identityCreations() { return identityCreations; } };
}

test("connection requires explicit confirmation and persists the encrypted identity before registration", async () => {
  const denied = fixture({ confirm: async () => false });
  assert.deepEqual(await denied.controller.connect(selection), { cancelled: true });
  assert.equal(denied.requests.length, 0);
  assert.equal(denied.state.entries.length, 0);
  await denied.controller.dispose();

  let observedPersistedIdentity;
  const accepted = fixture({ beforeInvoke: async (request, state) => {
    if (request.operation !== "register") return;
    assert.equal(state.entries.length, 1);
    assert.equal(state.entries[0].enabled, true);
    observedPersistedIdentity = readNativeNodeIdentityCapsule({ identityIssuer: AUTHORITY.identityIssuer,
      subject: AUTHORITY.subject, ...selection, deviceId: DEVICE }, Buffer.from(state.entries[0].encryptedIdentity, "base64").toString("utf8"));
    assert.equal(request.payload.registration.publicKey, observedPersistedIdentity.publicKeyPem);
  } });
  const status = await accepted.controller.connect(selection);
  assert.deepEqual(status, { nodeId: NODE, state: "active", activeRun: false, error: false });
  assert.equal(accepted.requests.filter(request => request.operation === "register").length, 1);
  assert.equal(accepted.state.entries[0].nodeId, NODE);
  assert.equal(accepted.state.entries[0].enabled, true);
  await accepted.controller.dispose();
});

test("lost registration response keeps the same persisted key and resume reconciles only once per account generation", async () => {
  let failFirstRegistration = true;
  const f = fixture({ onRegister: async request => {
    if (failFirstRegistration) { failFirstRegistration = false; throw new Error("response lost"); }
    return { id: NODE, companyId: WORKSPACE, status: "active" };
  } });
  await assert.rejects(f.controller.connect(selection), /Native Node is unavailable/);
  assert.equal(f.state.entries.length, 1);
  const savedKey = f.state.entries[0].encryptedIdentity;
  assert.equal(f.state.entries[0].nodeId, null);
  assert.equal(f.state.entries[0].enabled, true);
  await f.controller.resume();
  assert.equal(f.state.entries[0].nodeId, NODE);
  assert.equal(f.state.entries[0].encryptedIdentity, savedKey);
  await f.controller.resume();
  assert.equal(f.identityCreations, 1);
  assert.equal(f.requests.filter(request => request.operation === "register").length, 2);
  await f.controller.dispose();
});

test("disconnect fences a connection still recovering before it has saved a Node identity", async () => {
  const recovering = deferred(), recovered = deferred();
  const f = fixture({ recover: async () => { recovering.resolve(); return recovered.promise; } });
  const connecting = assert.rejects(f.controller.connect(selection), /Native Node is unavailable/);
  await recovering.promise;
  assert.deepEqual(await f.controller.disconnect(selection), { nodeId: null, state: "off", activeRun: false, error: false });
  recovered.resolve({ status: "approved", deviceId: DEVICE });
  await connecting;
  assert.equal(f.requests.length, 0);
  assert.equal(f.state.entries.length, 0);
  assert.equal(f.identityCreations, 0);
  await f.controller.dispose();
});

test("a saved Node identity cannot be replaced if idempotent registration returns another Node", async () => {
  let registration = 0;
  const f = fixture({ onRegister: async () => {
    registration += 1;
    return { id: registration === 1 ? NODE : "55555555-5555-4555-8555-555555555555",
      companyId: WORKSPACE, status: "active" };
  } });
  await f.controller.connect(selection);
  const key = f.state.entries[0].encryptedIdentity;
  await f.controller.disconnect(selection);
  await assert.rejects(f.controller.connect(selection), /Native Node is unavailable/);
  assert.equal(f.state.entries[0].nodeId, NODE);
  assert.equal(f.state.entries[0].encryptedIdentity, key);
  assert.equal(registration, 2);
  await f.controller.dispose();
});

test("reconnecting an existing launch checks Node authority even while its Member device remains approved", async () => {
  let revoked = false;
  const f = fixture({ beforeInvoke: request => {
    if (request.operation === "heartbeat" && revoked) throw new Error("Node revoked by Host");
  } });
  try {
    await f.controller.connect(selection);
    revoked = true;
    await assert.rejects(f.controller.connect(selection), /Native Node is unavailable/);
    assert.equal(f.requests.filter(request => request.operation === "heartbeat").length, 2);
    assert.equal(f.requests.filter(request => request.operation === "register").length, 1);
    assert.equal(f.identityCreations, 1);
    assert.equal(f.controller.status(selection).state, "off");
  } finally { await f.controller.dispose(); }
});

test("account invalidation cancels only its exact currently owned command before waiting for its runner", async () => {
  const execution = deferred();
  const executionStarted = deferred();
  const cancellations = [];
  let releaseCancellation;
  const cancellationGate = new Promise(resolve => { releaseCancellation = resolve; });
  const commandId = "66666666-6666-4666-8666-666666666666";
  const f = fixture({ cancelCommand: async id => { cancellations.push(id); await cancellationGate; },
    claimCommandId: commandId, execute: () => { executionStarted.resolve(); return execution.promise; },
    onRegister: async () => ({ id: NODE, companyId: WORKSPACE, status: "active" }) });
  await f.controller.connect(selection);
  f.timers.at(-1).callback();
  await executionStarted.promise;
  f.setAuthority({ ...AUTHORITY, generation: 2 });
  const closing = f.controller.invalidate();
  while (!cancellations.length) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(cancellations, [commandId]);
  execution.resolve(); releaseCancellation();
  await closing;
  await f.controller.dispose();
});

test("long execution keeps its Native Node heartbeat current without claiming another command", async () => {
  const execution = deferred(), started = deferred(), heartbeatSent = deferred();
  let heartbeats = 0;
  const f = fixture({ claimCommandId: "88888888-8888-4888-8888-888888888888",
    execute: () => { started.resolve(); return execution.promise; },
    cancelCommand: async () => { execution.resolve(); },
    beforeInvoke: request => {
      if (request.operation === "heartbeat" && ++heartbeats === 2) heartbeatSent.resolve();
    },
  });
  try {
    await f.controller.connect(selection);
    f.timers.find(timer => timer.delayMs === 3000).callback();
    await started.promise;
    f.timers.find(timer => timer.delayMs === 30000).callback();
    await heartbeatSent.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(heartbeats, 2);
    assert.equal(f.requests.filter(request => request.operation === "claim-command").length, 1);
    assert.equal(f.controller.status(selection).activeRun, true);
  } finally {
    execution.resolve();
    await f.controller.dispose();
  }
  const requestsAfterStop = f.requests.length;
  for (const timer of f.timers.filter(timer => timer.delayMs === 30000)) timer.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.requests.length, requestsAfterStop, "Stopped execution must not keep sending heartbeats");
});

test("heartbeat authority loss during execution cancels only its owned command and never reclaims", async () => {
  const execution = deferred(), started = deferred(), cancelled = deferred();
  const commandId = "99999999-9999-4999-8999-999999999999";
  let heartbeats = 0;
  const cancellations = [];
  const f = fixture({ claimCommandId: commandId,
    execute: () => { started.resolve(); return execution.promise; },
    beforeInvoke: request => {
      if (request.operation === "heartbeat" && ++heartbeats === 2) throw new Error("device revoked");
    },
    cancelCommand: async id => { cancellations.push(id); execution.resolve(); cancelled.resolve(); },
  });
  try {
    await f.controller.connect(selection);
    f.timers.find(timer => timer.delayMs === 3000).callback();
    await started.promise;
    f.timers.find(timer => timer.delayMs === 30000).callback();
    await cancelled.promise;
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(cancellations, [commandId]);
    assert.equal(f.controller.status(selection).state, "unavailable");
    assert.equal(f.requests.filter(request => request.operation === "claim-command").length, 1);
  } finally {
    execution.resolve();
    await f.controller.dispose();
  }
});

test("failed cancellation reports unavailable, hides the Node from other accounts, and gates reconnect on cleanup", async () => {
  const execution = deferred();
  const executionStarted = deferred();
  const retryCancellationStarted = deferred();
  const retryCancellation = deferred();
  let cancelCalls = 0;
  const commandId = "77777777-7777-4777-8777-777777777777";
  const f = fixture({ claimCommandId: commandId,
    execute: () => { executionStarted.resolve(); return execution.promise; },
    cancelCommand: async id => {
      assert.equal(id, commandId);
      cancelCalls += 1;
      if (cancelCalls === 1) throw new Error("termination not confirmed");
      if (cancelCalls === 2) { retryCancellationStarted.resolve(); await retryCancellation.promise; }
    },
    onRegister: async () => ({ id: NODE, companyId: WORKSPACE, status: "active" }),
  });
  await f.controller.connect(selection);
  f.timers.at(-1).callback();
  await executionStarted.promise;
  await assert.rejects(f.controller.invalidate(), /termination not confirmed/);
  assert.deepEqual(f.controller.status(selection), { nodeId: NODE, state: "unavailable", activeRun: true, error: true });
  f.setAuthority({ ...AUTHORITY, subject: "another-member" });
  assert.deepEqual(f.controller.status(selection), { nodeId: null, state: "off", activeRun: false, error: false });
  f.setAuthority(AUTHORITY);

  const reconnect = f.controller.connect(selection);
  await retryCancellationStarted.promise;
  assert.equal(f.requests.filter(request => request.operation === "register").length, 1);
  retryCancellation.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.requests.filter(request => request.operation === "register").length, 1);
  execution.resolve();
  assert.deepEqual(await reconnect, { nodeId: NODE, state: "active", activeRun: false, error: false });
  assert.equal(f.requests.filter(request => request.operation === "register").length, 2);
  await f.controller.dispose();
});

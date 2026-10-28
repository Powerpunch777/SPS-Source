import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createSpsNodeConnectionLifetime,
  runSpsNodeConnectionSteps,
} from "../src/node-connection-lifecycle.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function sourceBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return source.slice(from, to);
}

async function createMainConnectionHarness(overrides = {}) {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  const lifetime = createSpsNodeConnectionLifetime();
  let sessionEpoch = 1;
  const sandbox = {
    state: {
      profile: { hubUrl: "https://hub-a.test", companyId: "company-a", displayName: "Desktop A" },
      identity: { key: "identity-a" },
      nodeId: "node-a",
      nodeStatus: "active",
      transportKeyPublishedAt: null,
    },
    nodeConnectionLifetime: lifetime,
    desktopStateUnavailable: false,
    commandPollGate: { currentGeneration: () => 1, isGeneration: () => true },
    nodeRuntimeStatus: { lastHeartbeatAt: null, heartbeatError: null, commandPollError: null },
    SpsHubRequestError: class SpsHubRequestError extends Error {},
    os: { hostname: () => "desktop-host" },
    process: { platform: "win32" },
    app: { getVersion: () => "1.0.0" },
    structuredClone,
    JSON,
    Date,
    Boolean,
    Error,
    runSpsNodeConnectionSteps,
    currentDesktopAccountSubject: () => "account-a",
    currentDesktopSessionEpoch: () => sessionEpoch,
    setSessionEpoch: value => { sessionEpoch = value; },
    beginNodeConnectionLifetime: () => { lifetime.stop(); return lifetime.begin(); },
    currentIdentity: () => sandbox.state.identity,
    isOwnerHostProfile: () => false,
    resetNodeRuntimeStatus() {},
    resolveSpsNodeDisplayName: ({ configuredName }) => configuredName,
    requireSpsCoreRequestAccess: async () => ({ accessToken: "token-a" }),
    ensureIdentity: async () => sandbox.state.identity,
    scanLocalCapabilities: async () => [],
    scanLocalRunnerProfiles: async () => [],
    registerSpsNode: async () => ({ id: "registered-node-a", status: "pending" }),
    sendSpsNodeHeartbeat: async () => ({ status: "active" }),
    applyNodeStatus: async status => { sandbox.state.nodeStatus = status; },
    persistState: async () => {},
    scheduleHeartbeat() {},
    cancelSpsNodeCommands: async () => {},
    disconnectSpsNode: async () => {},
    closeWorkspaceWindow() {},
    normalizeSpsNodeStatus: value => value,
    isSpsTechnicalMemberAccessRemoved: () => false,
    nodeWasRevoked: error => error instanceof sandbox.SpsHubRequestError
      && error.status === 403
      && error.message === "This SPS Node has been revoked",
    canRunSpsNodeCommands: () => false,
    stopCommandPolling() {},
    ...overrides,
  };
  sandbox.globalThis = sandbox;
  const code = [
    sourceBetween(main, "function captureNodeConnectionContext(", "function stopCommandPolling("),
    sourceBetween(main, "async function connectNode(", "async function ensureJoinedDesktopNode("),
    sourceBetween(main, "async function disconnectCurrentNode(", "async function sendNodeHeartbeat("),
    sourceBetween(main, "async function sendNodeHeartbeat(", "function scheduleHeartbeat("),
    "globalThis.actualConnectNode = connectNode; globalThis.actualDisconnectCurrentNode = disconnectCurrentNode; globalThis.actualSendNodeHeartbeat = sendNodeHeartbeat; globalThis.actualCaptureNodeConnectionContext = captureNodeConnectionContext;",
  ].join("\n");
  vm.runInNewContext(code, sandbox, { filename: "main-connection-extract.mjs" });
  return sandbox;
}

test("a late registration response cannot advance to heartbeat or commit after the connection stops", async () => {
  const lifetime = createSpsNodeConnectionLifetime();
  const oldTicket = lifetime.begin();
  const registration = deferred();
  const calls = [];
  const oldFlow = runSpsNodeConnectionSteps(
    () => lifetime.assertCurrent(oldTicket),
    [
      async () => { calls.push("register"); return registration.promise; },
      async () => { calls.push("heartbeat"); return { status: "active" }; },
      async () => { calls.push("commit"); },
    ],
  );

  lifetime.stop();
  const newTicket = lifetime.begin();
  registration.resolve({ id: "old-node" });
  await assert.rejects(oldFlow, /no longer current/);
  assert.deepEqual(calls, ["register"]);
  assert.equal(lifetime.isCurrent(newTicket), true);
});

test("a delayed heartbeat success or error from A cannot update B", async () => {
  const lifetime = createSpsNodeConnectionLifetime();
  const a = lifetime.begin();
  const request = deferred();
  const writes = [];
  const heartbeat = runSpsNodeConnectionSteps(
    () => lifetime.assertCurrent(a),
    [
      async () => request.promise,
      async value => { writes.push(value); },
    ],
  );
  lifetime.stop();
  const b = lifetime.begin();
  request.resolve({ status: "revoked" });
  await assert.rejects(heartbeat, /no longer current/);
  assert.deepEqual(writes, []);
  assert.equal(lifetime.isCurrent(b), true);
});

test("a provider error from an operation that outlived its connection is suppressed", async () => {
  const lifetime = createSpsNodeConnectionLifetime();
  const ticket = lifetime.begin();
  const request = deferred();
  const oldFlow = runSpsNodeConnectionSteps(
    () => lifetime.assertCurrent(ticket),
    [() => request.promise],
  );
  const observed = oldFlow.then(value => ({ value }), error => ({ error }));
  lifetime.stop();
  request.reject(new Error("provider details from old account"));

  const result = await observed;
  assert.match(result.error?.message ?? "", /no longer current/);
  assert.doesNotMatch(result.error?.message ?? "", /provider details/);
});

test("a delayed disconnect cleanup cannot clear a replacement connection", async () => {
  const lifetime = createSpsNodeConnectionLifetime();
  const oldDisconnect = lifetime.begin();
  const cancelled = deferred();
  const state = { nodeId: "node-A" };
  const cleanup = runSpsNodeConnectionSteps(
    () => lifetime.assertCurrent(oldDisconnect),
    [
      async () => cancelled.promise,
      async () => { state.nodeId = null; },
    ],
  );
  lifetime.stop();
  const newConnection = lifetime.begin();
  state.nodeId = "node-B";
  cancelled.resolve();
  await assert.rejects(cleanup, /no longer current/);
  assert.equal(state.nodeId, "node-B");
  assert.equal(lifetime.isCurrent(newConnection), true);
});

test("Main connectNode executes the real registration flow and leaves replacement state untouched on late registration", async () => {
  const registration = deferred();
  const writes = [];
  let registrations = 0;
  const harness = await createMainConnectionHarness({
    registerSpsNode: async () => { registrations += 1; return registration.promise; },
    persistState: async () => { writes.push(JSON.stringify(harness.state)); },
  });

  const connecting = harness.actualConnectNode();
  const observed = connecting.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  if (registrations === 0) {
    const result = await observed;
    assert.fail(`Main connect failed before registration: ${result.error?.stack ?? "no error"}`);
  }
  assert.equal(registrations, 1);
  harness.nodeConnectionLifetime.stop();
  harness.nodeConnectionLifetime.begin();
  harness.setSessionEpoch(2);
  harness.state.profile = { hubUrl: "https://hub-b.test", companyId: "company-b", displayName: "Desktop B" };
  harness.state.identity = { key: "identity-b" };
  harness.state.nodeId = "node-b";
  registration.resolve({ id: "late-node-a", status: "pending" });

  const result = await observed;
  assert.match(result.error?.message ?? "", /no longer current/);
  assert.equal(harness.state.nodeId, "node-b");
  assert.deepEqual(harness.state.identity, { key: "identity-b" });
  assert.equal(writes.length, 0);
});

test("Main connectNode completes a fresh registration and commits its new Node id", async () => {
  const writes = [];
  let scheduled = 0;
  const harness = await createMainConnectionHarness({
    registerSpsNode: async () => ({ id: "node-a-new", status: "pending" }),
    sendSpsNodeHeartbeat: async () => ({ status: "active" }),
    persistState: async () => { writes.push({ ...harness.state }); },
    scheduleHeartbeat: () => { scheduled += 1; },
  });

  const result = await harness.actualConnectNode();

  assert.equal(result.node.id, "node-a-new");
  assert.equal(harness.state.nodeId, "node-a-new");
  assert.equal(harness.state.nodeStatus, "active");
  assert.equal(writes.length, 1);
  assert.equal(scheduled, 1);
});

test("Main heartbeat ignores a late 403 revocation after a same-account session change", async () => {
  const heartbeat = deferred();
  let heartbeatCalls = 0;
  const harness = await createMainConnectionHarness({
    requireSpsCoreRequestAccess: async () => ({ accessToken: "token-a" }),
    sendSpsNodeHeartbeat: async () => { heartbeatCalls += 1; return heartbeat.promise; },
    persistState: async () => { throw new Error("stale heartbeat must not persist"); },
  });
  const ticketA = harness.nodeConnectionLifetime.begin();
  const running = harness.actualSendNodeHeartbeat(ticketA);
  const observed = running.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(heartbeatCalls, 1);
  // Same account subject, new sign-in epoch: this exercises the ABA guard
  // independently of the connection-lifetime generation.
  harness.state.profile = { hubUrl: "https://hub-b.test", companyId: "company-b", displayName: "Desktop B" };
  harness.state.identity = { key: "identity-b" };
  harness.state.nodeId = "node-b";
  harness.setSessionEpoch(2);
  const revoked = new harness.SpsHubRequestError("This SPS Node has been revoked");
  revoked.status = 403;
  heartbeat.reject(revoked);

  assert.equal((await observed).value, null);
  assert.equal(harness.state.nodeId, "node-b");
  assert.deepEqual(harness.state.identity, { key: "identity-b" });
  assert.equal(harness.nodeRuntimeStatus.heartbeatError, null);
});

test("Main heartbeat accepts a current response and applies its status", async () => {
  const harness = await createMainConnectionHarness({
    sendSpsNodeHeartbeat: async request => {
      assert.equal(request.nodeId, "node-a");
      return { status: "pending" };
    },
  });
  const ticket = harness.nodeConnectionLifetime.begin();

  const result = await harness.actualSendNodeHeartbeat(ticket);

  assert.equal(result.status, "pending");
  assert.equal(harness.state.nodeStatus, "pending");
  assert.equal(typeof harness.nodeRuntimeStatus.lastHeartbeatAt, "string");
  assert.equal(harness.nodeRuntimeStatus.heartbeatError, null);
});

test("Main disconnect does not clear a replacement connection while cancellation is pending", async () => {
  const cancellation = deferred();
  let cancelCalls = 0;
  const harness = await createMainConnectionHarness({
    cancelSpsNodeCommands: async () => { cancelCalls += 1; return cancellation.promise; },
  });
  const running = harness.actualDisconnectCurrentNode();
  const observed = running.then(value => ({ value }), error => ({ error }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelCalls, 1);
  harness.nodeConnectionLifetime.stop();
  harness.nodeConnectionLifetime.begin();
  harness.state.profile = { hubUrl: "https://hub-b.test", companyId: "company-b", displayName: "Desktop B" };
  harness.state.identity = { key: "identity-b" };
  harness.state.nodeId = "node-b";
  cancellation.resolve();

  const result = (await observed).value;
  assert.equal(result.nodeId, "node-a");
  assert.equal(result.remoteDisconnected, false);
  assert.equal(result.remoteError, null);
  assert.equal(harness.state.nodeId, "node-b");
  assert.deepEqual(harness.state.identity, { key: "identity-b" });
});

test("Main disconnect completes remote teardown before clearing its captured key", async () => {
  const disconnected = [];
  const writes = [];
  const harness = await createMainConnectionHarness({
    disconnectSpsNode: async request => { disconnected.push(request); },
    persistState: async () => { writes.push({ ...harness.state }); },
  });

  const result = await harness.actualDisconnectCurrentNode();

  assert.equal(result.nodeId, "node-a");
  assert.equal(result.remoteDisconnected, true);
  assert.equal(harness.state.nodeId, null);
  assert.equal(harness.state.identity, null);
  assert.equal(harness.state.nodeStatus, null);
  assert.equal(disconnected.length, 1);
  assert.equal(disconnected[0].nodeId, "node-a");
  assert.equal(writes.length, 1);
});

test("Main disconnect persistence is fenced when the same account starts a new session", async () => {
  const persistStarted = deferred();
  const persistGate = deferred();
  let commits = 0;
  const harness = await createMainConnectionHarness({
    persistState: async ({ beforeCommit }) => {
      persistStarted.resolve();
      await persistGate.promise;
      beforeCommit();
      commits += 1;
    },
  });

  const disconnecting = harness.actualDisconnectCurrentNode();
  const observed = disconnecting.then(value => ({ value }), error => ({ error }));
  await persistStarted.promise;
  harness.setSessionEpoch(2);
  harness.state.profile = { hubUrl: "https://hub-b.test", companyId: "company-b", displayName: "Desktop B" };
  harness.state.identity = { key: "identity-b" };
  harness.state.nodeId = "node-b";
  persistGate.resolve();

  const result = await observed;
  assert.equal(result.error, undefined);
  assert.equal(commits, 0);
  assert.equal(harness.state.nodeId, "node-b");
  assert.deepEqual(harness.state.identity, { key: "identity-b" });
});

test("Main fences registration, heartbeat, disconnect, account epoch, and identity persistence", async () => {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  assert.match(main, /const nodeConnectionLifetime = createSpsNodeConnectionLifetime\(\)/);
  assert.match(main, /function stopNodeScheduling\(\)[\s\S]*?nodeConnectionLifetime\.stop\(\)/);
  assert.match(main, /function captureNodeConnectionContext\(ticket[\s\S]*?currentDesktopSessionEpoch\(\)/);
  assert.match(main, /async function connectNode\([\s\S]*?runSpsNodeConnectionSteps\(context\.assertCurrent,[\s\S]*?registerSpsNode\([\s\S]*?sendSpsNodeHeartbeat\(/);
  assert.match(main, /async function sendNodeHeartbeat\([\s\S]*?runSpsNodeConnectionSteps\(context\.assertCurrent/);
  assert.match(main, /async function disconnectCurrentNode\(\{ assertCurrent: assertOwnerCurrent/);
  assert.match(main, /async function ensureIdentity\(assertCurrent = \(\) => \{\}\)[\s\S]*?persistState\(\{ beforeCommit: assertCurrent \}\)/);
  assert.match(main, /async function clearRemovedMemberConnection[\s\S]*?sessionEpoch: currentDesktopSessionEpoch\(\)[\s\S]*?beforeCommit: \(\) => \{[\s\S]*?currentDesktopSessionEpoch\(\) !== expected\.sessionEpoch/);
});

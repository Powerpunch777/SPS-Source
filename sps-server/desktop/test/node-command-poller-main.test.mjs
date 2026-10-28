import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  createSpsNodeCommandPollGate,
  claimNextSpsNodeWork,
  executionTransportForSpsNodeWork,
} from '../src/node-command-poller.mjs';
import { createSpsNodeConnectionLifetime } from '../src/node-connection-lifecycle.mjs';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

async function createPollHarness(overrides = {}) {
  const source = await readFile(path.join(desktopRoot, 'src', 'main.mjs'), 'utf8');
  const start = source.indexOf('async function pollNodeCommands() {');
  const end = source.indexOf('function scheduleCommandPolling()', start);
  assert.notEqual(start, -1, 'pollNodeCommands must exist in Main');
  assert.notEqual(end, -1, 'pollNodeCommands must end before scheduleCommandPolling');

  const nodeConnectionLifetime = createSpsNodeConnectionLifetime();
  nodeConnectionLifetime.begin();
  const commandPollGate = createSpsNodeCommandPollGate();
  let accountSubject = 'account-A';
  let sessionEpoch = 1;
  const calls = { agentClaims: [], pluginClaims: [], executions: [], agentCompletions: [], pluginCompletions: [] };
  const sandbox = {
    state: {
      profile: { hubUrl: 'https://hub-A.test', companyId: 'company-A' },
      identity: { key: 'identity-A' },
      nodeId: 'node-A',
      nodeStatus: 'active',
    },
    nodeConnectionLifetime,
    commandPollGate,
    nodeRuntimeStatus: { lastCommandPollAt: null, commandPollError: null },
    structuredClone,
    JSON,
    Date,
    Boolean,
    Error,
    canRunSpsNodeCommands: status => status === 'active',
    currentDesktopAccountSubject: () => accountSubject,
    currentDesktopSessionEpoch: () => sessionEpoch,
    currentIdentity: () => sandbox.state.identity,
    requireSpsCoreRequestAccess: async () => ({ accessToken: `token-${sandbox.state.nodeId}` }),
    claimNextSpsNodeWork,
    claimSpsNodeCommand: async options => { calls.agentClaims.push(snapshot(options)); return null; },
    claimSpsPluginNodeRun: async options => { calls.pluginClaims.push(snapshot(options)); return null; },
    completeSpsNodeCommand: async payload => { calls.agentCompletions.push(snapshot(payload)); },
    completeSpsPluginNodeRun: async payload => { calls.pluginCompletions.push(snapshot(payload)); },
    executeSpsNodeCommand: async options => { calls.executions.push(options.command.id); },
    appendSpsPluginNodeRunEvent: async () => {},
    checkSpsPluginNodeRunLease: async () => {},
    executionTransportForSpsNodeWork,
    isSpsTechnicalMemberAccessRemoved: () => false,
    safeNodeCommandFailure: () => 'The latest local command could not complete.',
    setAccountSubject(value) { accountSubject = value; },
    setSessionEpoch(value) { sessionEpoch = value; },
    moveToNodeB() {
      nodeConnectionLifetime.stop();
      sandbox.state.profile = { hubUrl: 'https://hub-B.test', companyId: 'company-B' };
      sandbox.state.identity = { key: 'identity-B' };
      sandbox.state.nodeId = 'node-B';
      accountSubject = 'account-B';
      sessionEpoch += 1;
      nodeConnectionLifetime.begin();
    },
    calls,
    ...overrides,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(`${source.slice(start, end)}\nglobalThis.runPoll = pollNodeCommands;`, sandbox, {
    filename: 'main-command-poller-extract.mjs',
  });
  return sandbox;
}

test('late Agent claim is completed on captured A context without executing or changing B status', async () => {
  const claim = deferred();
  const started = deferred();
  const harness = await createPollHarness({
    claimSpsNodeCommand: async options => {
      started.resolve();
      await claim.promise;
      return { id: 'agent-A-1' };
    },
  });
  const poll = harness.runPoll();
  await started.promise;
  harness.moveToNodeB();
  harness.nodeRuntimeStatus.commandPollError = 'B status must be preserved';
  claim.resolve();
  await poll;

  assert.deepEqual(harness.calls.executions, []);
  assert.deepEqual(harness.calls.pluginCompletions, []);
  assert.equal(harness.calls.agentCompletions.length, 1);
  assert.deepEqual(harness.calls.agentCompletions[0], {
    hubUrl: 'https://hub-A.test',
    nodeId: 'node-A',
    identity: { key: 'identity-A' },
    accessToken: 'token-node-A',
    commandId: 'agent-A-1',
    completion: {
      status: 'failed',
      exitCode: null,
      signal: null,
      timedOut: false,
      error: 'Desktop did not start this command because the local Node poll changed before execution.',
    },
  });
  assert.equal(harness.nodeRuntimeStatus.commandPollError, 'B status must be preserved');
});

test('late Plugin run claim uses its own completion lane and captured A context', async () => {
  const claim = deferred();
  const started = deferred();
  const harness = await createPollHarness({
    claimSpsNodeCommand: async () => null,
    claimSpsPluginNodeRun: async options => {
      started.resolve();
      await claim.promise;
      return { id: 'plugin-A-1' };
    },
  });
  const poll = harness.runPoll();
  await started.promise;
  harness.moveToNodeB();
  claim.resolve();
  await poll;

  assert.deepEqual(harness.calls.executions, []);
  assert.deepEqual(harness.calls.agentCompletions, []);
  assert.equal(harness.calls.pluginCompletions.length, 1);
  assert.equal(harness.calls.pluginCompletions[0].hubUrl, 'https://hub-A.test');
  assert.equal(harness.calls.pluginCompletions[0].nodeId, 'node-A');
  assert.deepEqual(harness.calls.pluginCompletions[0].identity, { key: 'identity-A' });
  assert.equal(harness.calls.pluginCompletions[0].accessToken, 'token-node-A');
  assert.equal(harness.calls.pluginCompletions[0].commandId, 'plugin-A-1');
  assert.equal(harness.calls.pluginCompletions[0].completion.status, 'failed');
});

test('normal claimed work enters execution once and does not get an extra completion', async () => {
  const harness = await createPollHarness({
    claimSpsNodeCommand: async () => ({ id: 'agent-normal-1' }),
  });
  await harness.runPoll();
  assert.deepEqual(harness.calls.executions, ['agent-normal-1']);
  assert.deepEqual(harness.calls.agentCompletions, []);
  assert.deepEqual(harness.calls.pluginCompletions, []);
});

test('executor failure after entry does not infer that claimed work never started', async () => {
  const harness = await createPollHarness({
    claimSpsNodeCommand: async () => ({ id: 'agent-entered-1' }),
    executeSpsNodeCommand: async options => {
      harness.calls.executions.push(options.command.id);
      throw new Error('executor failed after entry');
    },
  });
  await harness.runPoll();
  assert.deepEqual(harness.calls.executions, ['agent-entered-1']);
  assert.deepEqual(harness.calls.agentCompletions, []);
  assert.deepEqual(harness.calls.pluginCompletions, []);
  assert.equal(harness.nodeRuntimeStatus.commandPollError, 'The latest local command could not complete.');
});

for (const kind of ['agent', 'plugin']) {
  test(`failed not-started ${kind} completion preserves B without executing or replaying A`, async () => {
    const started = deferred(), response = deferred();
    const harness = await createPollHarness();
    const claim = async () => { started.resolve(); await response.promise; return { id: `${kind}-A-unstarted` }; };
    if (kind === 'agent') harness.claimSpsNodeCommand = claim;
    else harness.claimSpsPluginNodeRun = claim;
    const attempted = [];
    const failCompletion = async payload => { attempted.push(snapshot(payload)); throw new Error('Host unavailable'); };
    if (kind === 'agent') harness.completeSpsNodeCommand = failCompletion;
    else harness.completeSpsPluginNodeRun = failCompletion;
    const poll = harness.runPoll();
    await started.promise;
    harness.moveToNodeB();
    harness.commandPollGate.stop();
    harness.nodeRuntimeStatus.commandPollError = 'B status must remain';
    response.resolve();
    await poll;
    assert.equal(attempted.length, 1);
    assert.equal(attempted[0].hubUrl, 'https://hub-A.test');
    assert.equal(attempted[0].nodeId, 'node-A');
    assert.equal(attempted[0].commandId, `${kind}-A-unstarted`);
    assert.equal(harness.nodeRuntimeStatus.commandPollError, 'B status must remain');
    assert.deepEqual(harness.calls.executions, []);
    assert.deepEqual(harness.calls.agentCompletions, []);
    assert.deepEqual(harness.calls.pluginCompletions, []);
  });
}

test('a stale empty claim never fabricates a completion or falls through into the next lane', async () => {
  const started = deferred(), response = deferred();
  const harness = await createPollHarness({
    claimSpsNodeCommand: async () => { started.resolve(); await response.promise; return null; },
  });
  const poll = harness.runPoll();
  await started.promise;
  harness.moveToNodeB();
  response.resolve();
  await poll;
  assert.deepEqual(harness.calls.pluginClaims, []);
  assert.deepEqual(harness.calls.executions, []);
  assert.deepEqual(harness.calls.agentCompletions, []);
  assert.deepEqual(harness.calls.pluginCompletions, []);
});

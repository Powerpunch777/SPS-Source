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
import { createSpsNodeCompletionOutbox, SpsNodeCompletionOutboxError } from '../src/node-completion-outbox.mjs';
import { createSpsNodeClaimJournal, SpsNodeClaimJournalError } from '../src/node-claim-journal.mjs';
import { SpsHubRequestError } from '../../desktop-node/src/hub-client.mjs';

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function successfulPayload(options) {
  return { hubUrl: options.hubUrl, nodeId: options.nodeId, identity: options.identity,
    accessToken: options.accessToken, commandId: options.command.id,
    completion: { status: 'succeeded', exitCode: 0, signal: null, timedOut: false, error: null } };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function snapshot(value) {
  return JSON.parse(JSON.stringify(value));
}

function acceptedCompletion(payload) {
  return {
    id: payload.commandId,
    nodeId: payload.nodeId,
    ...payload.completion,
    timedOut: payload.completion.timedOut ? 1 : 0,
  };
}

async function createPollHarness(overrides = {}, outboxStorage = { ciphertext: null, journalCiphertext: null }) {
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
      identity: { key: 'identity-A', publicKeyPem: 'public-key-A' },
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
    SpsNodeCompletionOutboxError,
    SpsNodeClaimJournalError,
    SpsHubRequestError,
    nodeCompletionOutbox: createSpsNodeCompletionOutbox({
      readEncrypted: () => outboxStorage.ciphertext,
      writeEncrypted: async ciphertext => { outboxStorage.ciphertext = ciphertext; },
      encrypt: value => Buffer.from(value).toString('base64'),
      decrypt: value => Buffer.from(value, 'base64').toString('utf8'),
    }),
    nodeClaimJournal: createSpsNodeClaimJournal({
      readEncrypted: () => outboxStorage.journalCiphertext,
      writeEncrypted: async ciphertext => { outboxStorage.journalCiphertext = ciphertext; },
      encrypt: value => Buffer.from(value).toString('base64'),
      decrypt: value => Buffer.from(value, 'base64').toString('utf8'),
    }),
    getSpsNodeClaimProtocol: async () => ({
      schemaVersion: 1,
      requestIdVersion: 'v1',
      maxRecoveryAgeMs: 86_400_000,
    }),
    outboxStorage,
    canRunSpsNodeCommands: status => status === 'active',
    currentDesktopAccountSubject: () => accountSubject,
    currentDesktopSessionEpoch: () => sessionEpoch,
    currentIdentity: () => sandbox.state.identity,
    requireSpsCoreRequestAccess: async () => ({ accessToken: `token-${sandbox.state.nodeId}` }),
    claimNextSpsNodeWork,
    claimSpsNodeCommand: async options => { calls.agentClaims.push(snapshot(options)); return null; },
    claimSpsPluginNodeRun: async options => { calls.pluginClaims.push(snapshot(options)); return null; },
    completeSpsNodeCommand: async payload => { calls.agentCompletions.push(snapshot(payload)); return acceptedCompletion(payload); },
    completeSpsPluginNodeRun: async payload => { calls.pluginCompletions.push(snapshot(payload)); return acceptedCompletion(payload); },
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
      sandbox.state.identity = { key: 'identity-B', publicKeyPem: 'public-key-B' };
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
    identity: { key: 'identity-A', publicKeyPem: 'public-key-A' },
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
  assert.deepEqual(harness.calls.pluginCompletions[0].identity, { key: 'identity-A', publicKeyPem: 'public-key-A' });
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

test('Main resumes a lost Agent claim response with the exact saved request after restart', async () => {
  const storage = { ciphertext: null }, ids = [];
  const first = await createPollHarness({ claimSpsNodeCommand: async options => {
    ids.push(options.claimRequestId);
    throw new Error('claim response lost');
  } }, storage);
  await first.runPoll();
  assert.deepEqual(first.calls.executions, []);
  assert.ok(storage.journalCiphertext);
  const restarted = await createPollHarness({ claimSpsNodeCommand: async options => {
    ids.push(options.claimRequestId);
    return { id: 'recovered-Agent-1' };
  } }, storage);
  restarted.executeSpsNodeCommand = async options => {
    await options.beforeSpawn();
    restarted.calls.executions.push(options.command.id);
    await options.persistCompletion(successfulPayload(options));
    await options.completeCommand(successfulPayload(options));
  };
  await restarted.runPoll();
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.deepEqual(restarted.calls.executions, ['recovered-Agent-1']);
  assert.equal(JSON.parse(Buffer.from(storage.journalCiphertext, 'base64').toString()).records.length, 0);
});

test('Main resumes a pending Plugin claim before issuing any new Agent claim', async () => {
  const storage = { ciphertext: null }, ids = [];
  const first = await createPollHarness({ claimSpsPluginNodeRun: async options => {
    ids.push(options.claimRequestId);
    throw new Error('plugin response lost');
  } }, storage);
  await first.runPoll();
  const restarted = await createPollHarness({
    claimSpsPluginNodeRun: async options => { ids.push(options.claimRequestId); return { id: 'recovered-plugin' }; },
  }, storage);
  restarted.executeSpsNodeCommand = async options => {
    await options.beforeSpawn();
    restarted.calls.executions.push(options.command.id);
    await options.persistCompletion(successfulPayload(options));
    await options.completeCommand(successfulPayload(options));
  };
  await restarted.runPoll();
  assert.deepEqual(restarted.calls.agentClaims, []);
  assert.equal(ids[0], ids[1]);
  assert.deepEqual(restarted.calls.executions, ['recovered-plugin']);
  assert.equal(restarted.calls.pluginCompletions.length, 1);
});

test('Main never reclaims an entered task after restart without a final completion report', async () => {
  const storage = { ciphertext: null };
  const first = await createPollHarness({ claimSpsNodeCommand: async () => ({ id: 'uncertain-Agent' }) }, storage);
  first.executeSpsNodeCommand = async options => {
    await options.beforeSpawn();
    first.calls.executions.push(options.command.id);
    throw new Error('Desktop stopped after entering execution');
  };
  await first.runPoll();
  const restarted = await createPollHarness({}, storage);
  await restarted.runPoll();
  assert.deepEqual(restarted.calls.agentClaims, []);
  assert.deepEqual(restarted.calls.pluginClaims, []);
  assert.deepEqual(restarted.calls.executions, []);
  assert.match(restarted.nodeRuntimeStatus.commandPollError, /will not run it again automatically/);
});

test('a late old poll cannot report unstarted while a reconnect executes the same recovered request', { timeout: 10_000 }, async () => {
  const firstStarted = deferred(), firstResponse = deferred(), executing = deferred(), closeExecution = deferred();
  const ids = [];
  const harness = await createPollHarness({ claimSpsNodeCommand: async options => {
    ids.push(options.claimRequestId);
    if (ids.length === 1) { firstStarted.resolve(); await firstResponse.promise; }
    return { id: 'same-recovered-task' };
  } });
  harness.executeSpsNodeCommand = async options => {
    await options.beforeSpawn();
    harness.calls.executions.push(options.command.id);
    executing.resolve();
    await closeExecution.promise;
    await options.persistCompletion(successfulPayload(options));
    await options.completeCommand(successfulPayload(options));
  };
  const oldPoll = harness.runPoll();
  await firstStarted.promise;
  harness.commandPollGate.stop();
  const reconnectPoll = harness.runPoll();
  await executing.promise;
  firstResponse.resolve();
  await oldPoll;
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.deepEqual(harness.calls.executions, ['same-recovered-task']);
  assert.deepEqual(harness.calls.agentCompletions, []);
  closeExecution.resolve();
  await reconnectPoll;
  assert.equal(harness.calls.agentCompletions.length, 1);
  assert.equal(harness.calls.agentCompletions[0].completion.status, 'succeeded');
});

test('a restarted aborted claim sends its final report without claiming or executing work', async () => {
  const storage = { ciphertext: null }, first = await createPollHarness({}, storage);
  const scope = { accountSubject: 'account-A', hubUrl: first.state.profile.hubUrl, nodeId: first.state.nodeId, identity: first.state.identity };
  const pending = await first.nodeClaimJournal.begin({ ...scope, kind: 'plugin-run' });
  const input = { ...scope, kind: pending.kind, requestId: pending.requestId, workId: 'not-started-plugin' };
  await first.nodeClaimJournal.receive(input);
  await first.nodeClaimJournal.abort(input);
  const restarted = await createPollHarness({}, storage);
  await restarted.runPoll();
  assert.deepEqual(restarted.calls.agentClaims, []);
  assert.deepEqual(restarted.calls.pluginClaims, []);
  assert.deepEqual(restarted.calls.executions, []);
  assert.equal(restarted.calls.pluginCompletions.length, 1);
  assert.equal(restarted.calls.pluginCompletions[0].completion.status, 'failed');
  assert.equal(await restarted.nodeClaimJournal.pending(scope), null);
});

test('a durable completion reconciles an entered journal before outbox acknowledgement on restart', async () => {
  const storage = { ciphertext: null };
  const first = await createPollHarness({ claimSpsNodeCommand: async () => ({ id: 'closed-before-journal-clear' }) }, storage);
  first.executeSpsNodeCommand = async options => {
    await options.beforeSpawn();
    await first.nodeCompletionOutbox.persist({ kind: 'agent-command', accountSubject: 'account-A', payload: successfulPayload(options) });
    throw new Error('crash between two durable writes');
  };
  await first.runPoll();
  assert.equal(JSON.parse(Buffer.from(storage.journalCiphertext, 'base64').toString()).records[0].phase, 'entered');
  const restarted = await createPollHarness({}, storage);
  await restarted.runPoll();
  assert.equal(restarted.calls.agentCompletions.length, 1);
  assert.deepEqual(restarted.calls.executions, []);
  assert.equal(JSON.parse(Buffer.from(storage.journalCiphertext, 'base64').toString()).records.length, 0);
  assert.equal(JSON.parse(Buffer.from(storage.ciphertext, 'base64').toString()).receipts.length, 0);
});

test('an unsupported Host is rejected before sending or persisting a claim', async () => {
  const storage = { ciphertext: null };
  const harness = await createPollHarness({ getSpsNodeClaimProtocol: async () => {
    throw new SpsHubRequestError(502, 'unsupported Host', 'sps_node_claim_protocol_mismatch');
  } }, storage);
  await harness.runPoll();
  assert.deepEqual(harness.calls.agentClaims, []);
  assert.deepEqual(harness.calls.pluginClaims, []);
  assert.deepEqual(harness.calls.executions, []);
  assert.equal(storage.journalCiphertext, undefined);
  assert.match(harness.nodeRuntimeStatus.commandPollError, /Update or reconnect/);
});

test('Host refusal preserves the pending request and shows recovery status without another claim', async () => {
  const storage = { ciphertext: null };
  const harness = await createPollHarness({ claimSpsNodeCommand: async () => {
    throw new SpsHubRequestError(409, 'stale claim', 'sps_node_claim_expired');
  } }, storage);
  await harness.runPoll();
  const requestId = JSON.parse(Buffer.from(storage.journalCiphertext, 'base64').toString()).records[0].requestId;
  assert.deepEqual(harness.calls.pluginClaims, []);
  assert.deepEqual(harness.calls.executions, []);
  assert.match(harness.nodeRuntimeStatus.commandPollError, /review the task and Workspace status/);
  await harness.runPoll();
  assert.equal(JSON.parse(Buffer.from(storage.journalCiphertext, 'base64').toString()).records[0].requestId, requestId);
  assert.deepEqual(harness.calls.pluginClaims, []);
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

for (const kind of ['agent-command', 'plugin-run']) {
  test(`${kind} saved result retries after Main restart before new claims without executing again`, async () => {
    const storage = { ciphertext: null };
    const first = await createPollHarness({}, storage);
    const commandId = `closed-${kind}`;
    const claim = async () => ({ id: commandId });
    if (kind === 'agent-command') first.claimSpsNodeCommand = claim;
    else first.claimSpsPluginNodeRun = claim;
    const lostResponse = async () => { throw new Error('accepted response was lost'); };
    if (kind === 'agent-command') first.completeSpsNodeCommand = lostResponse;
    else first.completeSpsPluginNodeRun = lostResponse;
    first.executeSpsNodeCommand = async options => {
      first.calls.executions.push(options.command.id);
      const payload = {
        hubUrl: options.hubUrl,
        nodeId: options.nodeId,
        identity: options.identity,
        accessToken: options.accessToken,
        commandId: options.command.id,
        completion: { status: 'succeeded', exitCode: 0, signal: null, timedOut: false, error: null },
      };
      await options.persistCompletion(payload);
      assert.equal(JSON.parse(Buffer.from(storage.ciphertext, 'base64').toString()).receipts.length, 1);
      await options.completeCommand(payload);
    };
    await first.runPoll();
    assert.deepEqual(first.calls.executions, [commandId]);
    assert.ok(storage.ciphertext);

    const order = [];
    const restarted = await createPollHarness({
      claimSpsNodeCommand: async () => { order.push('claim-agent'); return null; },
      claimSpsPluginNodeRun: async () => { order.push('claim-plugin'); return null; },
    }, storage);
    const acknowledge = async payload => { order.push('report'); return acceptedCompletion(payload); };
    if (kind === 'agent-command') restarted.completeSpsNodeCommand = acknowledge;
    else restarted.completeSpsPluginNodeRun = acknowledge;
    await restarted.runPoll();

    assert.deepEqual(order, ['report', 'claim-agent', 'claim-plugin']);
    assert.deepEqual(restarted.calls.executions, []);
    assert.equal(JSON.parse(Buffer.from(storage.ciphertext, 'base64').toString()).receipts.length, 0);
  });
}

test('Main retains A results while B or a replacement A key is active', async () => {
  const storage = { ciphertext: null };
  const original = await createPollHarness({}, storage);
  await original.nodeCompletionOutbox.persist({
    kind: 'agent-command',
    accountSubject: 'account-A',
    payload: {
      hubUrl: 'https://hub-A.test', nodeId: 'node-A', identity: original.state.identity, commandId: 'saved-A',
      completion: { status: 'failed', exitCode: 1, signal: null, timedOut: false, error: 'process exited' },
    },
  });
  const saved = storage.ciphertext;
  const otherAccount = await createPollHarness({}, storage);
  otherAccount.moveToNodeB();
  await otherAccount.runPoll();
  assert.deepEqual(otherAccount.calls.agentCompletions, []);
  assert.deepEqual(otherAccount.calls.pluginCompletions, []);
  assert.equal(storage.ciphertext, saved);

  const replacedKey = await createPollHarness({}, storage);
  replacedKey.state.identity = { key: 'replacement-A', publicKeyPem: 'public-key-A-replaced' };
  await replacedKey.runPoll();
  assert.deepEqual(replacedKey.calls.agentCompletions, []);
  assert.equal(storage.ciphertext, saved);

  const restored = await createPollHarness({}, storage);
  await restored.runPoll();
  assert.equal(restored.calls.agentCompletions.length, 1);
  assert.equal(restored.calls.agentCompletions[0].commandId, 'saved-A');
  assert.equal(restored.calls.agentCompletions[0].accessToken, 'token-node-A');
  assert.deepEqual(restored.calls.executions, []);
});

test('a corrupt saved result pauses Main before claiming new work', async () => {
  const storage = { ciphertext: 'invalid-not-json' };
  const harness = await createPollHarness({}, storage);
  await harness.runPoll();
  assert.deepEqual(harness.calls.agentClaims, []);
  assert.deepEqual(harness.calls.pluginClaims, []);
  assert.deepEqual(harness.calls.executions, []);
  assert.equal(storage.ciphertext, 'invalid-not-json');
  assert.match(harness.nodeRuntimeStatus.commandPollError, /could not safely save or read task results/);
});

test('a different terminal result from Core stays saved and pauses new claims in Main', async () => {
  const harness = await createPollHarness({
    completeSpsNodeCommand: async payload => ({ ...acceptedCompletion(payload), status: 'cancelled' }),
  });
  await harness.nodeCompletionOutbox.persist({
    kind: 'agent-command', accountSubject: 'account-A',
    payload: {
      hubUrl: 'https://hub-A.test', nodeId: 'node-A', identity: harness.state.identity, commandId: 'needs-review',
      completion: { status: 'succeeded', exitCode: 0, signal: null, timedOut: false, error: null },
    },
  });
  await harness.runPoll();
  assert.deepEqual(harness.calls.agentClaims, []);
  assert.deepEqual(harness.calls.pluginClaims, []);
  assert.deepEqual(harness.calls.executions, []);
  assert.equal(JSON.parse(Buffer.from(harness.outboxStorage.ciphertext, 'base64').toString()).receipts.length, 1);
  assert.match(harness.nodeRuntimeStatus.commandPollError, /Host has not confirmed a saved task result/);
});

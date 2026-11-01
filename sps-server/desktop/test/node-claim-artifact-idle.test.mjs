import assert from "node:assert/strict";
import test from "node:test";
import { createSpsNodeClaimJournal, SpsNodeClaimJournalError } from "../src/node-claim-journal.mjs";

const scope = { accountSubject: "account-A", hubUrl: "https://host-A.test", nodeId: "node-A",
  identity: { publicKeyPem: "public-A" } };
const encode = text => Buffer.from(text, "utf8").toString("base64");
const decode = text => Buffer.from(text, "base64").toString("utf8");
const code = expected => error => error instanceof SpsNodeClaimJournalError && error.code === expected;
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

function setup(store = { value: null }, options = {}) {
  return createSpsNodeClaimJournal({
    readEncrypted: () => store.value,
    writeEncrypted: async value => {
      if (Array.isArray(store.writes)) store.writes.push(value);
      store.value = value;
    },
    encrypt: encode,
    decrypt: decode,
    ...options,
  });
}

function artifactIdle(journal, callback = async () => {}) {
  assert.equal(typeof journal.withArtifactIdle, "function", "claim journal must expose its private artifact-idle scope");
  return journal.withArtifactIdle(callback);
}

async function assertImmediateReject(promise, predicate) {
  let settled = false;
  const outcomePromise = promise.then(value => {
    settled = true;
    return { value };
  }, error => {
    settled = true;
    return { error };
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, true, "operation must reject without waiting for the held scope");
  const outcome = await outcomePromise;
  assert.equal(typeof outcome.error, "object");
  assert.equal(predicate(outcome.error), true);
}

test("artifact idle accepts absent and encoded-empty stores without writing", async () => {
  for (const initial of [null, encode('{"version":1,"records":[]}')]) {
    const store = { value: initial };
    let writes = 0, calls = 0;
    const journal = setup(store, { writeEncrypted: async value => { writes++; store.value = value; } });
    await artifactIdle(journal, async activity => {
      calls++;
      await activity.assertCurrent();
    });
    assert.equal(calls, 1);
    assert.equal(writes, 0);
    assert.equal(store.value, initial);
  }
});

test("artifact idle rejects retained records for every connection and phase, including expired records", async () => {
  const store = { value: null, writes: [] };
  const now = 1_800_000_000_000;
  const phases = ["intent", "received", "entered", "aborted"];
  for (const [index, phase] of phases.entries()) {
    const recordScope = { ...scope, accountSubject: `account-${index}`, nodeId: `node-${index}`,
      identity: { publicKeyPem: `public-${index}` } };
    const journal = setup(store, { now: () => now });
    const record = await journal.begin({ ...recordScope, kind: index % 2 ? "plugin-run" : "agent-command" });
    if (phase !== "intent") {
      const input = { ...recordScope, kind: record.kind, requestId: record.requestId, workId: `work-${index}` };
      await journal.receive(input);
      if (phase === "entered") await journal.enter(input);
      if (phase === "aborted") assert.equal(await journal.abort(input), true);
    }
  }
  const expiredScope = { ...scope, accountSubject: "account-expired", nodeId: "node-expired",
    identity: { publicKeyPem: "public-expired" } };
  await setup(store, { now: () => now }).begin({ ...expiredScope, kind: "agent-command" });

  const saved = store.value;
  const savedWrites = store.writes.length;
  const journal = setup(store, { now: () => now + 86_400_000 });
  await assert.rejects(artifactIdle(journal), code("artifact-activity"));
  assert.equal(store.value, saved);
  assert.equal(store.writes.length, savedWrites);
});

test("artifact idle rejects while encrypted reads or writes are in flight", async () => {
  for (const operation of ["read", "write"]) {
    const store = { value: null };
    const started = deferred(), release = deferred();
    const journal = setup(store, operation === "read" ? {
      readEncrypted: async () => { started.resolve(); await release.promise; return null; },
    } : {
      writeEncrypted: async value => { started.resolve(); await release.promise; store.value = value; },
    });
    const pendingOperation = operation === "read"
      ? journal.pending(scope)
      : journal.begin({ ...scope, kind: "agent-command" });
    await started.promise;
    try {
      await assert.rejects(artifactIdle(journal), code("artifact-activity"));
    } finally {
      release.resolve();
    }
    await pendingOperation;
  }
});

test("artifact idle rejects a journal operation queued before its first microtask", async () => {
  let reads = 0;
  const journal = setup({ value: null }, { readEncrypted: () => { reads++; return null; } });
  const queued = journal.pending(scope);
  assert.equal(reads, 0);
  await assert.rejects(artifactIdle(journal), code("artifact-activity"));
  await queued;
  assert.equal(reads, 1);
});

test("artifact idle rejects an executing owner after its durable record is removed", async () => {
  const store = { value: null };
  const journal = setup(store);
  const record = await journal.begin({ ...scope, kind: "agent-command" });
  const input = { ...scope, kind: record.kind, requestId: record.requestId, workId: "work-owned" };
  await journal.receive(input);
  const release = await journal.acquire(input);
  try {
    await journal.finish(input);
    assert.deepEqual(JSON.parse(decode(store.value)).records, []);
    await assert.rejects(artifactIdle(journal), code("artifact-activity"));
  } finally {
    release();
  }
  await artifactIdle(journal);
});

test("a held artifact-idle callback blocks journal operations and nested scopes without changing records", async () => {
  const store = { value: null, writes: [] };
  const journal = setup(store);
  const entered = deferred(), release = deferred();
  const held = artifactIdle(journal, async activity => {
    await activity.assertCurrent();
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const before = store.value;
  const writesBefore = store.writes.length;
  const input = { ...scope, kind: "agent-command", requestId: "v1:1800000000000:123e4567-e89b-42d3-a456-426614174000",
    workId: "work-held" };
  try {
    await assertImmediateReject(journal.begin({ ...scope, kind: "agent-command" }), code("artifact-activity"));
    await assertImmediateReject(journal.pending(scope), code("artifact-activity"));
    await assertImmediateReject(journal.finish(input), code("artifact-activity"));
    await assertImmediateReject(journal.receive(input), code("artifact-activity"));
    await assertImmediateReject(journal.enter(input), code("artifact-activity"));
    await assertImmediateReject(journal.acquire(input), code("artifact-activity"));
    await assertImmediateReject(journal.abort(input), code("artifact-activity"));
    await assertImmediateReject(journal.empty(input), code("artifact-activity"));
    await assertImmediateReject(artifactIdle(journal), code("artifact-activity"));
    assert.equal(store.value, before);
    assert.equal(store.writes.length, writesBefore);
  } finally {
    release.resolve();
  }
  await held;
});

test("callback errors release the artifact-idle scope", async () => {
  const journal = setup();
  const failure = new Error("maintenance failed");
  await assert.rejects(artifactIdle(journal, async () => { throw failure; }), error => error === failure);
  assert.equal(await journal.pending(scope), null);
  const record = await journal.begin({ ...scope, kind: "agent-command" });
  assert.equal(record.phase, "intent");
});

test("external nonempty or unreadable backing mutation invalidates the held scope without rewriting it", async () => {
  const externalStore = { value: null };
  await setup(externalStore).begin({ ...scope, accountSubject: "other-account", nodeId: "other-node",
    identity: { publicKeyPem: "other-public" }, kind: "plugin-run" });
  const nonemptyCiphertext = externalStore.value;
  for (const [initial, replacement] of [
    [null, nonemptyCiphertext],
    [null, encode("not-json")],
    [null, encode('{"version":1,"records":[]}')],
    [encode('{"version":1,"records":[]}'), null],
  ]) {
    const store = { value: initial, writes: [] };
    const journal = setup(store);
    await assert.rejects(artifactIdle(journal, async () => {
      store.value = replacement;
    }), code("artifact-activity"));
    assert.equal(store.value, replacement);
    assert.equal(store.writes.length, 0);
  }
});

test("artifact idle maps initial and post-callback read failures or invalid state to artifact-activity", async () => {
  for (const initial of [
    { value: encode("not-json") },
    { value: null, readEncrypted: async () => { throw new Error("storage read failed"); } },
  ]) {
    const store = { value: initial.value };
    const journal = setup(store, initial.readEncrypted ? { readEncrypted: initial.readEncrypted } : {});
    await assert.rejects(artifactIdle(journal), code("artifact-activity"));
    assert.equal(store.value, initial.value);
  }

  let failRead = false;
  const journal = setup({ value: null }, { readEncrypted: async () => {
    if (failRead) throw new Error("storage read failed after scope entry");
    return null;
  } });
  await assert.rejects(artifactIdle(journal, async () => { failRead = true; }), code("artifact-activity"));
});

test("artifact-idle scope expires after its callback settles", async () => {
  const journal = setup();
  let expiredScope;
  await artifactIdle(journal, async activity => {
    expiredScope = activity;
    await activity.assertCurrent();
  });
  await assert.rejects(expiredScope.assertCurrent(), code("artifact-activity"));
});

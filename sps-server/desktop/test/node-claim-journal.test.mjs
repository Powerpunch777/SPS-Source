import assert from "node:assert/strict";
import test from "node:test";
import { createSpsNodeClaimJournal, SpsNodeClaimJournalError } from "../src/node-claim-journal.mjs";

const scope = { accountSubject: "account-A", hubUrl: "https://host-A.test", nodeId: "node-A", identity: { publicKeyPem: "public-A" } };
const encode = text => Buffer.from(text).toString("base64");
const decode = text => Buffer.from(text, "base64").toString("utf8");
function setup(store = { value: null }, options = {}) {
  return createSpsNodeClaimJournal({ readEncrypted: () => store.value,
    writeEncrypted: async value => { store.value = value; }, encrypt: encode, decrypt: decode, ...options });
}
const code = expected => error => error instanceof SpsNodeClaimJournalError && error.code === expected;

test("restart retries a lost response with the same durable request identity", async () => {
  const store = { value: null }, first = setup(store);
  const record = await first.begin({ ...scope, kind: "agent-command" });
  const restarted = setup(store);
  assert.deepEqual(await restarted.pending(scope), record);
  assert.deepEqual(await restarted.begin({ ...scope, kind: "agent-command" }), record);
  const request = { ...scope, kind: record.kind, requestId: record.requestId, workId: "work-1" };
  await restarted.receive(request);
  assert.equal((await setup(store).pending(scope)).workId, "work-1");
  await assert.rejects(restarted.receive({ ...request, workId: "other-work" }), code("conflict"));
  assert.equal(JSON.stringify(JSON.parse(decode(store.value))).includes("public-A"), false);
});

test("an entered request survives restart and never becomes a fresh execution", async () => {
  const store = { value: null }, journal = setup(store);
  const record = await journal.begin({ ...scope, kind: "plugin-run" });
  const input = { ...scope, kind: record.kind, requestId: record.requestId, workId: "plugin-1" };
  await journal.receive(input);
  await journal.enter(input);
  const restarted = setup(store);
  await assert.rejects(restarted.pending(scope), code("execution-uncertain"));
  await assert.rejects(restarted.begin({ ...scope, kind: "agent-command" }), code("execution-uncertain"));
  await restarted.finish({ ...input, workId: "another-work" });
  await assert.rejects(restarted.pending(scope), code("execution-uncertain"));
  await restarted.finish(input); // Called only after durable final-result persistence.
  assert.equal(await restarted.pending(scope), null);
});

test("one live executor owns preflight across reconnects and blocks stale cancellation reports", async () => {
  const journal = setup(), record = await journal.begin({ ...scope, kind: "agent-command" });
  const input = { ...scope, kind: record.kind, requestId: record.requestId, workId: "work-1" };
  await journal.receive(input);
  const release = await journal.acquire(input);
  await assert.rejects(journal.pending(scope), code("execution-in-progress"));
  await assert.rejects(journal.acquire(input), code("execution-in-progress"));
  assert.equal(await journal.abort(input), false);
  await journal.enter(input);
  assert.equal(await journal.abort(input), false);
  await journal.finish(input);
  await assert.rejects(journal.begin({ ...scope, kind: "agent-command" }), code("execution-in-progress"));
  release();
  assert.equal(await journal.pending(scope), null);
});

test("a durable pre-entry abort cannot race a reconnect into executing the task", async () => {
  const store = { value: null }, journal = setup(store);
  const record = await journal.begin({ ...scope, kind: "plugin-run" });
  const input = { ...scope, kind: record.kind, requestId: record.requestId, workId: "plugin-1" };
  await journal.receive(input);
  assert.equal(await journal.abort(input), true);
  const restarted = setup(store);
  assert.equal((await restarted.pending(scope)).phase, "aborted");
  await assert.rejects(restarted.begin({ ...scope, kind: "plugin-run" }), code("completion-pending"));
  await assert.rejects(restarted.enter(input), code("completion-pending"));
  await assert.rejects(restarted.acquire(input), code("conflict"));
  await restarted.finish(input);
  assert.equal(await restarted.pending(scope), null);
});

test("connection, account and public-key changes cannot adopt another pending request", async () => {
  const store = { value: null }, journal = setup(store);
  const first = await journal.begin({ ...scope, kind: "plugin-run" });
  for (const change of [{ accountSubject: "account-B" }, { hubUrl: "https://host-B.test" },
    { nodeId: "node-B" }, { identity: { publicKeyPem: "replacement-A" } }]) {
    assert.equal(await journal.pending({ ...scope, ...change }), null);
    await journal.finish({ ...scope, ...change, kind: "plugin-run", workId: "anything" });
  }
  assert.deepEqual(await journal.pending(scope), first);
  await assert.rejects(journal.begin({ ...scope, kind: "agent-command" }), code("conflict"));
});

test("failed intent persistence prevents a claim and is retried before returning the same identity", async () => {
  const store = { value: null };
  let reject = true, writes = 0;
  const journal = setup(store, { writeEncrypted: async value => {
    writes++;
    store.value = value; // Simulate a save which reaches memory/disk then rejects.
    if (reject) throw new Error("save failed");
  } });
  await assert.rejects(journal.begin({ ...scope, kind: "agent-command" }), code("unavailable"));
  const persistedId = JSON.parse(decode(store.value)).records[0].requestId;
  reject = false;
  assert.equal((await journal.begin({ ...scope, kind: "agent-command" })).requestId, persistedId);
  assert.equal(writes, 2);
});

test("an uncertain entered-marker save cannot downgrade to received on retry", async () => {
  const store = { value: null }, journal = setup(store);
  const record = await journal.begin({ ...scope, kind: "agent-command" });
  const input = { ...scope, kind: record.kind, requestId: record.requestId, workId: "work-1" };
  await journal.receive(input);
  const failing = setup(store, { writeEncrypted: async value => { store.value = value; throw new Error("disk uncertain"); } });
  await assert.rejects(failing.enter(input), code("unavailable"));
  await assert.rejects(setup(store).receive(input), code("execution-uncertain"));
});

test("expired requests remain recorded instead of rotating to a new request", async () => {
  const store = { value: null }, now = 1_793_246_400_000;
  const record = await setup(store, { now: () => now }).begin({ ...scope, kind: "agent-command" });
  const saved = store.value, expired = setup(store, { now: () => now + 86_400_000 });
  await assert.rejects(expired.pending(scope), code("expired"));
  await assert.rejects(expired.begin({ ...scope, kind: "agent-command" }), code("expired"));
  assert.equal(store.value, saved);
  assert.equal(JSON.parse(decode(store.value)).records[0].requestId, record.requestId);
});

test("empty responses clear only their own unentered request", async () => {
  const journal = setup(), record = await journal.begin({ ...scope, kind: "plugin-run" });
  await assert.rejects(journal.empty({ ...scope, kind: "agent-command", requestId: record.requestId }), code("conflict"));
  await journal.empty({ ...scope, kind: "plugin-run", requestId: record.requestId });
  assert.equal(await journal.pending(scope), null);
});

test("malformed and oversized encrypted state fails without overwriting evidence", async () => {
  for (const value of [encode("not json"), encode('{"version":1,"records":[{}]}'), "x".repeat(524289)]) {
    const store = { value }, journal = setup(store);
    await assert.rejects(journal.begin({ ...scope, kind: "agent-command" }), error => error instanceof SpsNodeClaimJournalError);
    assert.equal(store.value, value);
  }
});

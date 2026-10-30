import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createSpsNodeCompletionOutbox, SpsNodeCompletionOutboxError } from "../src/node-completion-outbox.mjs";

const owner = Object.freeze({
  accountSubject: "account-A",
  hubUrl: "https://hub-a.example.test",
  nodeId: "node-A",
  identity: { publicKeyPem: "public-A", privateKeyPem: "private-A" },
});

function payload(overrides = {}) {
  return {
    hubUrl: owner.hubUrl,
    nodeId: owner.nodeId,
    identity: owner.identity,
    accessToken: "never-persist-token",
    sessionCookie: "never-persist-cookie",
    commandId: "command-A",
    command: { text: "never-persist-command" },
    env: { SECRET: "never-persist-env" },
    completion: { status: "succeeded", exitCode: 0, usageReport: {
      schemaVersion: 1,
      source: "claude_model_usage_v1",
      inputTokens: 9,
      cachedInputTokens: null,
      outputTokens: null,
    } },
    ...overrides,
  };
}

function fixture(options = {}) {
  let encrypted = null;
  let writes = 0;
  const outbox = createSpsNodeCompletionOutbox({
    readEncrypted: async () => encrypted,
    writeEncrypted: async value => {
      writes += 1;
      encrypted = value;
      if (options.failWrite?.(writes)) throw new Error("do not expose this store failure");
    },
    encrypt: async value => `cipher:${Buffer.from(value).toString("base64")}`,
    decrypt: async value => {
      if (!value.startsWith("cipher:")) throw new Error("bad fixture ciphertext");
      return Buffer.from(value.slice(7), "base64").toString("utf8");
    },
  });
  return {
    outbox,
    get encrypted() { return encrypted; },
    get writes() { return writes; },
    readPlaintext() { return Buffer.from(encrypted.slice(7), "base64").toString("utf8"); },
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function receiptDigest(request, kind = "agent-command") {
  const completion = request.completion;
  return createHash("sha256").update(canonicalJson({
    version: 1,
    kind,
    nodeId: request.nodeId,
    commandId: request.commandId,
    completion: {
      status: completion.status,
      exitCode: completion.exitCode,
      signal: completion.signal ?? null,
      timedOut: completion.timedOut ?? false,
      error: completion.error ?? null,
      ...(completion.usageReport === undefined ? {} : { usageReport: completion.usageReport }),
    },
  }), "utf8").digest("hex");
}

function normalizedReport(completion) {
  return {
    status: completion.status,
    exitCode: completion.exitCode,
    signal: completion.signal ?? null,
    timedOut: completion.timedOut ?? false,
    error: completion.error ?? null,
    ...(completion.usageReport === undefined ? {} : { usageReport: completion.usageReport }),
  };
}

function acceptedRow(request, { status = request.completion.status, error = request.completion.error, digest } = {}) {
  return {
    id: request.commandId,
    nodeId: request.nodeId,
    status,
    exitCode: request.completion.exitCode,
    signal: request.completion.signal,
    timedOut: Number(request.completion.timedOut ?? false),
    error,
    ...(digest === undefined ? {} : { completionReceiptDigest: digest }),
    ...(request.completion.usageReport ? {
      usageJson: { spsNodeUsageReceipt: {
        scope: { runId: request.commandId, nodeId: request.nodeId },
        report: request.completion.usageReport,
      } },
    } : {}),
  };
}

test("stores only a bounded final completion receipt in the encrypted slot", async () => {
  const store = fixture();
  await store.outbox.persist({ kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject });
  const plaintext = store.readPlaintext();
  assert.deepEqual(JSON.parse(plaintext).receipts[0], {
    kind: "agent-command",
    hubUrl: owner.hubUrl,
    nodeId: owner.nodeId,
    commandId: "command-A",
    accountSubject: owner.accountSubject,
    publicKeyFingerprint: "d7b6ceb8629049eb00bc6032a6f8a41cfa3b45a0c04f4af27beb463923b45ba8",
    completion: {
      error: null,
      exitCode: 0,
      signal: null,
      status: "succeeded",
      timedOut: false,
      usageReport: payload().completion.usageReport,
    },
  });
  for (const secret of ["private-A", "never-persist-token", "never-persist-cookie", "never-persist-command", "never-persist-env"]) {
    assert.equal(plaintext.includes(secret), false);
  }
});

test("restart retry resends the same receipt after a lost acknowledgement without replaying work", async () => {
  const store = fixture();
  const first = store.outbox;
  await first.persist({ kind: "plugin-run", payload: payload(), accountSubject: owner.accountSubject });

  let executionCount = 1;
  const acceptedIds = [];
  await assert.rejects(first.retryMatching({
    ...owner,
    accessToken: "fresh-token-A",
    sessionCookie: "fresh-cookie-A",
    completeNodeCommand: async () => assert.fail("wrong completion lane"),
    completePluginRun: async request => {
      acceptedIds.push(request.commandId);
      throw new Error("simulated response lost after server acceptance");
    },
  }), /simulated response lost/);
  assert.equal(executionCount, 1);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);

  // Simulate persisted ciphertext surviving process restart.
  let persistedCiphertext = store.encrypted;
  const restarted = createSpsNodeCompletionOutbox({
    readEncrypted: async () => persistedCiphertext,
    writeEncrypted: async value => { persistedCiphertext = value; },
    encrypt: async value => `cipher:${Buffer.from(value).toString("base64")}`,
    decrypt: async value => Buffer.from(value.slice(7), "base64").toString("utf8"),
  });
  const resent = [];
  assert.equal(await restarted.retryMatching({
    ...owner,
    accessToken: "fresh-token-A2",
    sessionCookie: "fresh-cookie-A2",
    completeNodeCommand: async () => assert.fail("wrong completion lane"),
    completePluginRun: async request => { resent.push(request); return acceptedRow(request); },
  }), 1);
  assert.deepEqual(acceptedIds, ["command-A"]);
  assert.equal(resent.length, 1);
  assert.equal(resent[0].commandId, "command-A");
  assert.deepEqual(resent[0].completion, {
    ...payload().completion,
    signal: null,
    timedOut: false,
    error: null,
  });
  assert.equal(resent[0].accessToken, "fresh-token-A2");
  assert.equal(executionCount, 1);
  assert.equal(JSON.parse(Buffer.from(persistedCiphertext.slice(7), "base64").toString("utf8")).receipts.length, 0);
});

test("holds A receipts during B login and retries only under the matching A identity", async () => {
  const store = fixture();
  await store.outbox.persist({ kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject });
  let posts = 0;
  const common = {
    completeNodeCommand: async request => { posts += 1; return acceptedRow(request); },
    completePluginRun: async request => { posts += 1; return acceptedRow(request); },
  };
  assert.equal(await store.outbox.retryMatching({
    accountSubject: "account-B",
    hubUrl: owner.hubUrl,
    nodeId: owner.nodeId,
    identity: { publicKeyPem: "public-B", privateKeyPem: "private-B" },
    accessToken: "token-B",
    ...common,
  }), 0);
  assert.equal(posts, 0);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);

  assert.equal(await store.outbox.retryMatching({ ...owner, accessToken: "fresh-token-A", ...common }), 1);
  assert.equal(posts, 1);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 0);
});

test("failed durable write and malformed slot fail closed without discarding prior receipt", async () => {
  let rejectSecondWrite = true;
  const store = fixture({ failWrite: writes => writes === 2 && rejectSecondWrite });
  const receipt = { kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject };
  await store.outbox.persist(receipt);
  await assert.rejects(store.outbox.persist(receipt), SpsNodeCompletionOutboxError);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);
  rejectSecondWrite = false;
  await store.outbox.persist(receipt);
  assert.equal(store.writes, 3, "an existing in-memory receipt must be durably rewritten before POST");
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);

  const corrupt = createSpsNodeCompletionOutbox({
    readEncrypted: async () => "corrupt",
    writeEncrypted: async () => assert.fail("must not overwrite corrupt pending state"),
    encrypt: async value => value,
    decrypt: async () => "not-json",
  });
  await assert.rejects(corrupt.persist({ kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject }), SpsNodeCompletionOutboxError);

  const extraKeyPlaintext = JSON.stringify({ version: 1, receipts: [{
    kind: "agent-command",
    hubUrl: owner.hubUrl,
    nodeId: owner.nodeId,
    commandId: "command-A",
    accountSubject: owner.accountSubject,
    publicKeyFingerprint: "d7b6ceb8629049eb00bc6032a6f8a41cfa3b45a0c04f4af27beb463923b45ba8",
    completion: { status: "succeeded", exitCode: 0, signal: null, timedOut: false, error: null },
    privateKeyPem: "unknown-field",
  }] });
  const unknownField = createSpsNodeCompletionOutbox({
    readEncrypted: async () => `cipher:${Buffer.from(extraKeyPlaintext).toString("base64")}`,
    writeEncrypted: async () => assert.fail("must not overwrite an unknown receipt field"),
    encrypt: async value => value,
    decrypt: async value => Buffer.from(value.slice(7), "base64").toString("utf8"),
  });
  await assert.rejects(unknownField.assertAvailable(), SpsNodeCompletionOutboxError);

  const emptyPresent = createSpsNodeCompletionOutbox({
    readEncrypted: async () => "",
    writeEncrypted: async () => assert.fail("must not replace a present empty slot"),
    encrypt: async value => value,
    decrypt: async value => value,
  });
  await assert.rejects(emptyPresent.assertAvailable(), SpsNodeCompletionOutboxError);
});

test("rejects mismatched Core terminal rows and unknown receipt fields without deleting pending data", async () => {
  const store = fixture();
  await store.outbox.persist({ kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject });
  await assert.rejects(store.outbox.retryMatching({
    ...owner,
    completeNodeCommand: async request => acceptedRow(request, { status: "cancelled" }),
    completePluginRun: async () => assert.fail("wrong completion lane"),
  }), error => error instanceof SpsNodeCompletionOutboxError && error.code === "ack-mismatch");
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);

  await assert.rejects(store.outbox.persist({
    kind: "agent-command",
    payload: payload({ completion: { status: "succeeded", exitCode: 0, privateKeyPem: "must-reject" } }),
    accountSubject: owner.accountSubject,
  }), SpsNodeCompletionOutboxError);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);
});

test("allows existing HTTP loopback Hub profiles but rejects remote cleartext Hub URLs", async () => {
  const store = fixture();
  await store.outbox.persist({
    kind: "agent-command",
    payload: payload({ hubUrl: "http://127.0.0.1:3333" }),
    accountSubject: owner.accountSubject,
  });
  await assert.rejects(store.outbox.persist({
    kind: "agent-command",
    payload: payload({ hubUrl: "http://hub.example.test" }),
    accountSubject: owner.accountSubject,
  }), SpsNodeCompletionOutboxError);
});

test("a save rejection after the in-memory slot changed cannot erase that result on the next save", async () => {
  const store = fixture({ failWrite: writes => writes === 2 });
  const record = commandId => ({
    kind: "plugin-run", payload: payload({ commandId }), accountSubject: owner.accountSubject,
  });
  await store.outbox.persist(record("result-A"));
  await assert.rejects(store.outbox.persist(record("result-B")), SpsNodeCompletionOutboxError);
  await store.outbox.persist(record("result-C"));
  assert.deepEqual(JSON.parse(store.readPlaintext()).receipts.map(item => item.commandId), ["result-A", "result-B", "result-C"]);
});

test("missing or malformed terminal acknowledgement never removes a saved result", async () => {
  const store = fixture();
  const record = { kind: "plugin-run", payload: payload(), accountSubject: owner.accountSubject };
  await store.outbox.persist(record);
  for (const response of [undefined, {}, acceptedRow(payload(), { status: "cancelled" }),
    acceptedRow(payload(), { status: "cancelled", error: "stopped", digest: "0".repeat(64) }),
    acceptedRow(payload(), { digest: "0".repeat(64) }),
    { ...acceptedRow(payload()), nodeId: "another-node" },
    { ...acceptedRow(payload()), timedOut: 2 }]) {
    await assert.rejects(store.outbox.acknowledge({ ...record, response }), SpsNodeCompletionOutboxError);
    assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);
  }
});

test("accepts an active completion cancelled by Core only with its exact completion receipt digest", async () => {
  const store = fixture();
  await store.outbox.persist({ kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject });
  let posts = 0;
  assert.equal(await store.outbox.retryMatching({
    ...owner,
    completeNodeCommand: async request => {
      posts += 1;
      return acceptedRow(request, {
        status: "cancelled",
        error: "Workspace execution was stopped.",
        digest: receiptDigest(request, "agent-command"),
      });
    },
    completePluginRun: async () => assert.fail("wrong completion lane"),
  }), 1);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 0);
  assert.equal(await store.outbox.retryMatching({
    ...owner,
    completeNodeCommand: async () => { posts += 1; },
    completePluginRun: async () => assert.fail("wrong completion lane"),
  }), 0, "a confirmed cancellation is removed, so no later retry is scheduled");
  assert.equal(posts, 1);
});

test("retries a cancelled completion after restart when the first response was lost", async () => {
  const store = fixture();
  await store.outbox.persist({ kind: "plugin-run", payload: payload(), accountSubject: owner.accountSubject });
  let persistedCiphertext = store.encrypted;
  const makeAfterRestart = () => createSpsNodeCompletionOutbox({
    readEncrypted: async () => persistedCiphertext,
    writeEncrypted: async value => { persistedCiphertext = value; },
    encrypt: async value => `cipher:${Buffer.from(value).toString("base64")}`,
    decrypt: async value => Buffer.from(value.slice(7), "base64").toString("utf8"),
  });
  const executionCount = 1;
  const cancelledResponse = request => acceptedRow(request, {
    status: "cancelled",
    error: "Workspace execution was stopped.",
    digest: receiptDigest(request, "plugin-run"),
  });
  const first = makeAfterRestart();
  await assert.rejects(first.retryMatching({
    ...owner,
    completeNodeCommand: async () => assert.fail("wrong completion lane"),
    completePluginRun: async request => {
      assert.equal(cancelledResponse(request).completionReceiptDigest, receiptDigest(request, "plugin-run"));
      throw new Error("lost cancellation acknowledgement");
    },
  }), /lost cancellation acknowledgement/);
  assert.equal(JSON.parse(Buffer.from(persistedCiphertext.slice(7), "base64").toString("utf8")).receipts.length, 1);

  const restarted = makeAfterRestart();
  let posts = 0;
  assert.equal(await restarted.retryMatching({
    ...owner,
    completeNodeCommand: async () => assert.fail("wrong completion lane"),
    completePluginRun: async request => { posts += 1; return cancelledResponse(request); },
  }), 1);
  assert.equal(posts, 1);
  assert.equal(executionCount, 1, "retry only resends the receipt; it never reruns the command");
  assert.equal(JSON.parse(Buffer.from(persistedCiphertext.slice(7), "base64").toString("utf8")).receipts.length, 0);
});

test("keeps backward compatibility with a legacy normal row whose receipt digest is null", async () => {
  const store = fixture();
  const record = { kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject };
  await store.outbox.persist(record);
  assert.equal(await store.outbox.acknowledge({
    ...record,
    response: { ...acceptedRow(record.payload), completionReceiptDigest: null },
  }), true);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 0);
});

test("accepts a separately stored exact report when Core keeps its policy terminal state", async () => {
  const store = fixture();
  const report = payload({ completion: {
    status: "failed",
    exitCode: 143,
    signal: "SIGTERM",
    timedOut: false,
    error: "local result",
  } });
  const record = { kind: "agent-command", payload: report, accountSubject: owner.accountSubject };
  await store.outbox.persist(record);
  const row = {
    id: report.commandId,
    nodeId: report.nodeId,
    status: "failed",
    exitCode: null,
    signal: null,
    timedOut: 0,
    error: "execution access was revoked",
    completionReportJson: normalizedReport(report.completion),
    completionReceiptDigest: receiptDigest(report, "agent-command"),
  };
  assert.equal(await store.outbox.acknowledge({ ...record, response: row }), true);
  assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 0);
});

test("retains report receipts when JSON is partial, tampered, out of scope, or digest-mismatched", async () => {
  const record = { kind: "agent-command", payload: payload(), accountSubject: owner.accountSubject };
  const valid = {
    ...acceptedRow(record.payload, { status: "failed", error: "policy failure" }),
    exitCode: null,
    completionReportJson: normalizedReport(record.payload.completion),
    completionReceiptDigest: receiptDigest(record.payload, record.kind),
  };
  const cases = [
    { ...valid, completionReceiptDigest: undefined },
    { ...valid, completionReceiptDigest: "0".repeat(64) },
    { ...valid, completionReportJson: { ...normalizedReport(record.payload.completion), error: "tampered" } },
    { ...valid, completionReportJson: { status: "succeeded" } },
    { ...valid, nodeId: "another-node" },
  ];
  for (const response of cases) {
    const store = fixture();
    await store.outbox.persist(record);
    await assert.rejects(store.outbox.acknowledge({ ...record, response }), error =>
      error instanceof SpsNodeCompletionOutboxError && error.code === "ack-mismatch");
    assert.equal(JSON.parse(store.readPlaintext()).receipts.length, 1);
  }
});

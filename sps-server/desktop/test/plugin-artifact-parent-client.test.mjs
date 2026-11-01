import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { createSpsPluginArtifactParentClient } from "../src/plugin-artifact-parent-channel.mjs";

const READY = "sps.plugin-artifacts.ready";
const REQUEST = "sps.plugin-artifacts.request";
const RESPONSE = "sps.plugin-artifacts.response";
const CHANNEL_ID = "123e4567-e89b-42d3-a456-426614174000";
const FINGERPRINT = "a".repeat(64);

function fixture({ drop, mutateResponse, snapshot = { coverage: "core-only", fingerprint: FINGERPRINT, references: [] }, current = () => true } = {}) {
  const channel = Object.assign(new EventEmitter(), { connected: true });
  const requests = [];
  let uncertainCount = 0;
  channel.send = (message, callback) => {
    requests.push(message);
    callback?.(null);
    if (message.kind !== REQUEST || message.operation === drop) return;
    queueMicrotask(() => {
      let response = {
        v: 1,
        kind: RESPONSE,
        channelId: message.channelId,
        id: message.id,
        transactionId: message.transactionId,
        operation: message.operation,
        ok: true,
        ...(message.operation === "begin" ? { snapshot } : {}),
      };
      response = mutateResponse?.(response, message) ?? response;
      channel.emit("message", response);
    });
  };
  const client = createSpsPluginArtifactParentClient(channel, {
    isCurrent: current,
    onUncertain: () => { uncertainCount += 1; },
    timeoutMs: 20,
  });
  channel.emit("message", { v: 1, kind: READY, channelId: CHANNEL_ID });
  return { channel, client, requests, uncertainCount: () => uncertainCount };
}

function protocolError(error) {
  return error?.code === "SPS_PLUGIN_ARTIFACT_CHANNEL_UNAVAILABLE";
}

test("snapshot scope checks before and after the callback, then acknowledges end in order", async t => {
  const f = fixture();
  t.after(() => f.client.dispose());
  let scope;
  const result = await f.client.withSnapshot(async value => {
    scope = value;
    assert.equal(value.coverage, "core-only");
    assert.equal(value.fingerprint, FINGERPRINT);
    assert.deepEqual(value.references, []);
    assert.equal(Object.isFrozen(value), true);
    return "done";
  });
  assert.equal(result, "done");
  assert.deepEqual(f.requests.map(item => item.operation), ["begin", "check", "check", "end"]);
  assert.ok(f.requests.every(item => item.kind === REQUEST && item.v === 1 && item.channelId === CHANNEL_ID
    && /^[0-9a-f-]{36}$/.test(item.id) && /^[0-9a-f-]{36}$/.test(item.transactionId)));
  assert.equal(new Set(f.requests.map(item => item.transactionId)).size, 1);
  await assert.rejects(scope.assertCurrent(), protocolError);
});

test("callback failure is preserved after a successful end acknowledgement", async t => {
  const f = fixture();
  t.after(() => f.client.dispose());
  const original = new Error("original callback failure");
  await assert.rejects(f.client.withSnapshot(async () => { throw original; }), error => error === original);
  assert.deepEqual(f.requests.map(item => item.operation), ["begin", "check", "end"]);
  assert.equal(f.uncertainCount(), 0);
});

test("the end request waits for a pending callback and concurrent scopes are denied", async t => {
  const f = fixture();
  t.after(() => f.client.dispose());
  let finish;
  let callbackStarted;
  const started = new Promise(resolve => { callbackStarted = resolve; });
  const first = f.client.withSnapshot(() => {
    callbackStarted();
    return new Promise(resolve => { finish = resolve; });
  });
  await started;
  await assert.rejects(f.client.withSnapshot(async () => assert.fail("overlapping callback ran")), protocolError);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(f.requests.map(item => item.operation), ["begin", "check"]);
  finish("finished");
  assert.equal(await first, "finished");
  assert.deepEqual(f.requests.map(item => item.operation), ["begin", "check", "check", "end"]);
});

test("isCurrent is enforced before starting and again after an awaited callback", async t => {
  let current = false;
  const before = fixture({ current: () => current });
  t.after(() => before.client.dispose());
  let callbacks = 0;
  await assert.rejects(before.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
  assert.equal(callbacks, 0);
  assert.equal(before.requests.length, 0);
  current = true;

  let finish;
  let started;
  const callbackStarted = new Promise(resolve => { started = resolve; });
  const after = fixture({ current: () => current });
  t.after(() => after.client.dispose());
  const pending = after.client.withSnapshot(() => {
    started();
    return new Promise(resolve => { finish = resolve; });
  });
  await callbackStarted;
  current = false;
  finish();
  await assert.rejects(pending, protocolError);
  assert.deepEqual(after.requests.map(item => item.operation), ["begin", "check"]);
  assert.equal(after.uncertainCount(), 1);
});

for (const [name, snapshot] of [
  ["malformed", { coverage: "all", fingerprint: FINGERPRINT, references: [] }],
  ["oversized", { coverage: "core-only", fingerprint: FINGERPRINT, references: Array(60_001).fill(null) }],
]) {
  test(`${name} snapshots poison the client and never run the callback`, async t => {
    const f = fixture({ snapshot });
    t.after(() => f.client.dispose());
    let callbacks = 0;
    await assert.rejects(f.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
    assert.equal(callbacks, 0);
    assert.equal(f.uncertainCount(), 1);
    await assert.rejects(f.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
    assert.equal(callbacks, 0);
    assert.equal(f.uncertainCount(), 1);
  });
}

test("duplicate readiness poisons an idle channel without an uncertainty notification", async t => {
  const f = fixture();
  t.after(() => f.client.dispose());
  f.channel.emit("message", { v: 1, kind: READY, channelId: randomUUID() });
  let callbacks = 0;
  await assert.rejects(f.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
  assert.equal(callbacks, 0);
  assert.equal(f.uncertainCount(), 0);
});

test("a response for the wrong transaction poisons the active client once", async t => {
  const f = fixture({ mutateResponse: response => ({ ...response, transactionId: randomUUID() }) });
  t.after(() => f.client.dispose());
  let callbacks = 0;
  await assert.rejects(f.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
  assert.equal(callbacks, 0);
  assert.equal(f.uncertainCount(), 1);
  await assert.rejects(f.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
  assert.equal(callbacks, 0);
  assert.equal(f.uncertainCount(), 1);
});

for (const operation of ["begin", "check", "end"]) {
  test(`a dropped ${operation} response times out sticky and blocks future callbacks`, async t => {
    const f = fixture({ drop: operation });
    t.after(() => f.client.dispose());
    let callbacks = 0;
    await assert.rejects(f.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
    assert.equal(callbacks, operation === "end" ? 1 : 0);
    assert.equal(f.uncertainCount(), 1);
    await assert.rejects(f.client.withSnapshot(async () => { callbacks += 1; }), protocolError);
    assert.equal(callbacks, operation === "end" ? 1 : 0);
    assert.equal(f.uncertainCount(), 1);
  });
}

test("disposing an idle ready client does not report uncertainty", () => {
  const f = fixture();
  f.client.dispose();
  f.client.dispose();
  assert.equal(f.uncertainCount(), 0);
});

const parentReference = () => ({ source: "desktop-developer-build", ownerId: "project-one", state: "retained",
  path: path.resolve("retained.spsplugin"), kind: "file" });
function parentResponse(response, request) {
  return request.operation === "begin" ? { ...response, snapshot: { coverage: "core-and-parent-paths",
    fingerprint: FINGERPRINT, references: [], parentPaths: request.parentPaths.map(item => ({ ...item, canonicalPath: item.path })) } } : response;
}
test("parent path inputs are captured before sending and exact observed paths remain immutable", async t => {
  const f = fixture({ mutateResponse: parentResponse });
  t.after(() => f.client.dispose());
  const reference = parentReference();
  const input = [reference];
  const original = { ...reference };
  const pending = f.client.withSnapshot(async scope => {
    assert.equal(scope.coverage, "core-and-parent-paths");
    assert.deepEqual(scope.parentPaths, [{ ...original, canonicalPath: original.path }]);
    assert.equal(Object.isFrozen(scope.parentPaths), true);
    assert.equal(Object.isFrozen(scope.parentPaths[0]), true);
    await scope.assertCurrent();
    return "retained";
  }, { parentPaths: input });
  reference.path = path.resolve("replacement.spsplugin");
  input.length = 0;
  assert.equal(await pending, "retained");
  assert.deepEqual(f.requests[0].parentPaths, [original]);
  assert.ok(f.requests.slice(1).every(request => !Object.hasOwn(request, "parentPaths")));
});
test("an explicit empty parent input remains distinguishable from Core-only coverage", async t => {
  const f = fixture({ mutateResponse: parentResponse });
  t.after(() => f.client.dispose());
  await f.client.withSnapshot(async scope => {
    assert.equal(scope.coverage, "core-and-parent-paths"); assert.deepEqual(scope.parentPaths, []);
  }, { parentPaths: [] });
});
for (const [name, options] of [
  ["unknown option", { parentPaths: [], extra: true }],
  ["oversized list", { parentPaths: Array(4097).fill(parentReference()) }],
  ["duplicate tuple", { parentPaths: [parentReference(), parentReference()] }],
  ["relative path", { parentPaths: [{ ...parentReference(), path: "relative" }] }],
  ["unknown path field", { parentPaths: [{ ...parentReference(), canonicalPath: path.resolve("wrong") }] }],
  ["empty source", { parentPaths: [{ ...parentReference(), source: "" }] }],
]) {
  test(`invalid parent paths reject before sending: ${name}`, async t => {
    const f = fixture(); t.after(() => f.client.dispose());
    await assert.rejects(f.client.withSnapshot(async () => assert.fail("must not enter"), options), protocolError);
    assert.equal(f.requests.length, 0); assert.equal(f.uncertainCount(), 0);
    await f.client.withSnapshot(async () => {});
  });
}
for (const mutation of ["omitted", "substituted", "extra"]) {
  test(`parent-path response ${mutation} cannot qualify the requested input`, async t => {
    const f = fixture({ mutateResponse(response, request) {
      const result = parentResponse(response, request);
      if (request.operation === "begin") {
        if (mutation === "omitted") delete result.snapshot.parentPaths;
        if (mutation === "substituted") result.snapshot.parentPaths[0].ownerId = "other-owner";
        if (mutation === "extra") result.snapshot.parentPaths[0].hidden = "not accepted";
      }
      return result;
    } });
    t.after(() => f.client.dispose());
    await assert.rejects(f.client.withSnapshot(async () => assert.fail("must not enter"), { parentPaths: [parentReference()] }), protocolError);
    assert.equal(f.uncertainCount(), 1);
    await assert.rejects(f.client.withSnapshot(async () => {}), protocolError);
  });
}

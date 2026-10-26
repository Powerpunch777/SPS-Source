import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createSpsNativeParentIngressClient } from "../src/native-parent-ingress-client.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
function fixture(t, options = {}) {
  const child = Object.assign(new EventEmitter(), { connected: true, exitCode: null });
  const sent = [];
  child.send = (value, callback) => { sent.push(value); callback?.(); };
  let current = true;
  const client = createSpsNativeParentIngressClient(child, { isCurrent: () => current, ...options });
  t.after(() => client.dispose());
  const reply = (request, result) => child.emit("message", { v: 1, kind: "sps.native.parent-ingress.response", id: request.id, ok: true, result });
  return { child, sent, client, reply, invalidate: () => { current = false; } };
}
const transport = () => ({ tlsVersion: "TLSv1.3", sessionReused: false, remoteAddress: "127.0.0.1" });
const identityRequest = () => ({ transport: transport(), body: null });
const identity = () => ({ hostId: HOST, serverSpkiSha256: "a".repeat(64), issuerSpkiSha256: "b".repeat(64), issuerCertificate: "AQID" });

test("owned private IPC uses fixed envelopes and ignores the separate signer namespace", async t => {
  const f = fixture(t);
  const pending = f.client.dispatch("identity", identityRequest());
  assert.equal(f.sent.length, 1);
  assert.deepEqual(Object.keys(f.sent[0]), ["v", "kind", "id", "operation", "request"]);
  assert.equal(f.sent[0].kind, "sps.native.parent-ingress.request");
  f.child.emit("message", { v: 1, kind: "sps.native.signer.request", id: "unrelated" });
  f.reply(f.sent[0], identity());
  assert.deepEqual(await pending, identity());
});

test("wrong current child, resumed TLS and extra credential fields fail before send", async t => {
  const f = fixture(t);
  await assert.rejects(f.client.dispatch("identity", { ...identityRequest(), token: "forbidden" }));
  await assert.rejects(f.client.dispatch("identity", { transport: { ...transport(), sessionReused: true }, body: null }));
  await assert.rejects(f.client.dispatch("arbitrary.api", identityRequest()));
  assert.deepEqual(f.sent, []);
  f.invalidate();
  await assert.rejects(f.client.dispatch("identity", identityRequest()));
  assert.deepEqual(f.sent, []);
});

test("request snapshots cannot be changed by the caller after dispatch", async t => {
  const f = fixture(t);
  const input = identityRequest();
  const pending = f.client.dispatch("identity", input);
  input.transport.remoteAddress = "192.168.1.99";
  assert.equal(f.sent[0].request.transport.remoteAddress, "127.0.0.1");
  f.reply(f.sent[0], identity()); await pending;
});

test("malformed private results reject every outstanding request without exposing secrets", async t => {
  const f = fixture(t);
  const first = f.client.dispatch("identity", identityRequest());
  const second = f.client.dispatch("identity", identityRequest());
  const denied = Promise.all([assert.rejects(first, /owned Native Host channel/), assert.rejects(second, /owned Native Host channel/)]);
  f.reply(f.sent[0], { ...identity(), privateKeyPem: "fixture-secret" });
  await denied;
  assert.equal(f.child.listenerCount("message"), 0);
});

test("cancellation retains its capacity until the exact Core operation settles", async t => {
  const f = fixture(t, { maxPending: 1 });
  const abort = new AbortController();
  const pending = f.client.dispatch("identity", identityRequest(), { signal: abort.signal });
  const denied = assert.rejects(pending);
  abort.abort(); await denied;
  assert.equal(f.sent[1].kind, "sps.native.parent-ingress.cancel");
  assert.equal(f.sent[1].id, f.sent[0].id);
  await assert.rejects(f.client.dispatch("identity", identityRequest()));
  f.reply(f.sent[0], identity());
  const next = f.client.dispatch("identity", identityRequest());
  f.reply(f.sent[2], identity()); await next;
});

test("deadline rejects but does not free a still-running Core slot", async t => {
  const f = fixture(t, { maxPending: 1, timeoutMs: 100 });
  await assert.rejects(f.client.dispatch("identity", identityRequest()));
  await assert.rejects(f.client.dispatch("identity", identityRequest()));
  assert.equal(f.sent.length, 2);
  f.reply(f.sent[0], identity());
  const next = f.client.dispatch("identity", identityRequest());
  f.reply(f.sent[2], identity()); await next;
});

test("disconnect and account invalidation suppress late successful results", async t => {
  for (const disconnect of [true, false]) {
    const f = fixture(t);
    const pending = f.client.dispatch("identity", identityRequest());
    const denied = assert.rejects(pending);
    if (disconnect) { f.child.connected = false; f.child.emit("disconnect"); }
    else { f.invalidate(); f.reply(f.sent[0], identity()); }
    await denied;
  }
});

test("per-request guards are synchronous and are rechecked at delivery", async t => {
  const f = fixture(t);
  await assert.rejects(f.client.dispatch("identity", identityRequest(), { assertCurrent: async () => {} }));
  assert.equal(f.sent.length, 0);
  let valid = true;
  const pending = f.client.dispatch("identity", identityRequest(), { assertCurrent() { if (!valid) throw new Error("old account"); } });
  const denied = assert.rejects(pending);
  valid = false; f.reply(f.sent[0], identity()); await denied;
});

test("bounded channel lifetime cannot be reset by cancellation or unsolicited replies", async t => {
  const f = fixture(t, { maxRequests: 1 });
  const pending = f.client.dispatch("identity", identityRequest());
  f.reply(f.sent[0], identity()); await pending;
  await assert.rejects(f.client.dispatch("identity", identityRequest()));
  f.child.emit("message", { v: 1, kind: "sps.native.parent-ingress.response", id: HOST, ok: true, result: identity() });
  assert.throws(() => f.client.assertAvailable());
});

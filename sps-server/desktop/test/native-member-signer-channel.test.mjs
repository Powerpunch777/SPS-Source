import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import { attachSpsNativeMemberSignerChannel } from "../src/native-member-signer-channel.mjs";

const PUBLIC = { hostId: "11111111-1111-4111-8111-111111111111", serverSpkiSha256: "a".repeat(64), issuerSpkiSha256: "b".repeat(64), issuerCertificate: "MAA" };
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(options = {}, overrides = {}) {
  const child = new EventEmitter(); child.connected = true; child.exitCode = null;
  child.disconnect = () => { child.connected = false; child.emit("disconnect"); };
  const replies = []; child.send = (value, callback) => { replies.push(value); callback?.(null); return true; };
  let live = true, disposed = 0;
  const channel = attachSpsNativeMemberSignerChannel(child, {
    inspect: async () => PUBLIC, sign: async () => ({ certificate: "MAA", requestSha256: "c".repeat(64) }),
    dispose: () => { disposed++; }, ...overrides,
  }, { isCurrent: () => live, ...options });
  return { child, channel, replies, disposed: () => disposed, revoke: () => { live = false; } };
}
const request = (id = randomUUID(), operation = "inspect", payload) => ({ v: 1, kind: "sps.native.signer.request", id, operation, ...(operation === "sign" ? { payload } : {}) });

test("owned IPC relays only exact public inspection and signing projections", async () => {
  const value = setup(); const id = randomUUID();
  value.child.emit("message", request(id)); await flush();
  assert.deepEqual(value.replies, [{ v: 1, kind: "sps.native.signer.response", id, ok: true, result: PUBLIC }]);
  value.child.emit("message", request(randomUUID(), "sign", {})); await flush();
  assert.equal(value.replies[1].ok, true); value.channel.dispose();
  assert.equal(value.disposed(), 1); assert.equal(value.child.listenerCount("message"), 0);
  assert.equal(value.child.connected, false);
});

test("unknown messages are ignored while malformed Native ops and repeated IDs close only the channel", async () => {
  for (const input of [{ kind: "plugin-other", private: "fixture" }, request(randomUUID(), "export-private-key"), { ...request(), privateKey: "fixture" }]) {
    const value = setup(); value.child.emit("message", input); await flush();
    assert.equal(value.replies.length, 0);
    assert.equal(value.disposed(), input.kind === "plugin-other" ? 0 : 1); value.channel.dispose();
  }
  const value = setup(), repeated = request(); value.child.emit("message", repeated); await flush();
  value.child.emit("message", repeated); await flush(); assert.equal(value.disposed(), 1); assert.equal(value.replies.length, 1);
});

test("accessors and private result fields never reach IPC output", async () => {
  const value = setup({}, { inspect: async () => ({ ...PUBLIC, privateKeyPem: "fixture-private" }) });
  value.child.emit("message", request()); await flush(); assert.equal(value.replies[0].ok, false);
  assert.ok(!JSON.stringify(value.replies).includes("fixture-private")); value.channel.dispose();
  let invoked = false;
  const next = setup(), message = Object.defineProperty(request(), "id", { enumerable: true, get() { invoked = true; } });
  next.child.emit("message", message); await flush(); assert.equal(invoked, false); assert.equal(next.disposed(), 1);
});

test("cancelled and disconnected operations cannot publish and busy work retains its slot", async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const value = setup({ maxPending: 1 }, { inspect: async ({ signal }) => { await held; assert.equal(signal.aborted, true); return PUBLIC; } });
  const id = randomUUID(); value.child.emit("message", request(id)); await flush();
  value.child.emit("message", request(id, "cancel"));
  value.child.emit("message", request()); await flush(); assert.equal(value.replies.length, 1); assert.equal(value.replies[0].ok, false);
  release(); await flush(); assert.equal(value.replies.length, 1); value.channel.dispose();
  const next = setup(); next.revoke(); next.child.emit("message", request()); await flush();
  assert.equal(next.replies.length, 0); assert.equal(next.disposed(), 1);
});

test("request budget exhaustion and process disconnect invalidate the channel", async () => {
  const value = setup({ maxRequests: 1 }); value.child.emit("message", request()); await flush();
  value.child.emit("message", request()); await flush(); assert.equal(value.disposed(), 1);
  assert.equal(value.child.connected, false);
  const next = setup(); next.child.emit("disconnect"); next.child.emit("message", request()); await flush(); assert.equal(next.disposed(), 1); assert.equal(next.replies.length, 0);
});

test("a timed-out operation stays busy until settlement and never emits its late result", { timeout: 4000 }, async () => {
  let release; const held = new Promise(resolve => { release = resolve; });
  const value = setup({ timeoutMs: 1000, maxPending: 1 }, { inspect: async () => { await held; return PUBLIC; } });
  const id = randomUUID();
  const reply = new Promise(resolve => {
    value.child.send = (message, callback) => { value.replies.push(message); callback?.(null); resolve(message); };
  });
  value.child.emit("message", request(id));
  try {
    assert.equal((await reply).ok, false);
    value.child.emit("message", request()); await flush(); assert.equal(value.replies.length, 2);
    release(); await flush(); assert.equal(value.replies.length, 2);
    assert.ok(value.replies.every(message => message.ok === false));
  } finally { release(); value.channel.dispose(); }
});

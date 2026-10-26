import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { attachSpsNativeWorkspaceParentChannel } from "../src/native-workspace-parent-channel.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const IDENTITY = Object.freeze({ hostId: HOST, serverSpkiSha256: "a".repeat(64),
  issuerSpkiSha256: "b".repeat(64), issuerCertificate: "AQID" });
const TARGET = `/api/companies/${WORKSPACE}/workspace-shell`;
const input = () => ({ workspaceId: WORKSPACE, target: TARGET,
  cookie: `sps_identity_session=${"c".repeat(64)}`, peerCertificateDer: Buffer.from([1, 2, 3]) });
const response = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status, headers: { "content-type": "application/json; charset=utf-8" },
});
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const child = Object.assign(new EventEmitter(), { connected: true, exitCode: null });
  const sent = [];
  child.send = (message, callback) => { sent.push(message); callback?.(); };
  let current = true;
  const channel = attachSpsNativeWorkspaceParentChannel(child, {
    inspectBinding: async () => IDENTITY,
    isCurrent: () => current,
    ...options,
  });
  const bootstrap = async () => {
    child.emit("message", { v: 1, kind: "sps.native.workspace.bootstrap.request", id: ID,
      hostId: HOST, serverSpkiSha256: IDENTITY.serverSpkiSha256, issuerSpkiSha256: IDENTITY.issuerSpkiSha256 });
    await tick();
    return sent.at(-1);
  };
  const ready = () => child.emit("message", { v: 1, kind: "sps.native.workspace.bootstrap.ready", id: ID,
    hostId: HOST, serverSpkiSha256: IDENTITY.serverSpkiSha256, issuerSpkiSha256: IDENTITY.issuerSpkiSha256,
    host: "127.0.0.1", port: 43210 });
  return { child, sent, channel, bootstrap, ready, invalidate: () => { current = false; } };
}

test("bootstrap returns one per-child key and publishes only ready host metadata", async t => {
  const f = fixture();
  t.after(() => f.channel.dispose());
  const reply = await f.bootstrap();
  assert.deepEqual(Object.keys(reply), ["v", "kind", "id", "ok", "hostId", "serverSpkiSha256", "issuerSpkiSha256", "key"]);
  assert.equal(reply.kind, "sps.native.workspace.bootstrap.response");
  assert.equal(reply.id, ID);
  assert.equal(reply.ok, true);
  assert.equal(Buffer.from(reply.key, "base64url").length, 32);
  f.ready();
  await tick();
  assert.deepEqual(f.channel.inspect(), { ready: true, hostId: HOST,
    serverSpkiSha256: IDENTITY.serverSpkiSha256, issuerSpkiSha256: IDENTITY.issuerSpkiSha256 });
  assert.equal(JSON.stringify(f.channel.inspect()).includes(reply.key), false);
});

test("read signs only the four TLS-approved GET routes and forwards over fixed loopback", async t => {
  let observed;
  const f = fixture({ fetchImpl: async (url, options) => {
    observed = { url, options };
    return response({ shell: { title: "Workspace" } });
  } });
  t.after(() => f.channel.dispose());
  assert.equal((await f.bootstrap()).ok, true);
  f.ready(); await tick();
  assert.deepEqual(await f.channel.read(input()), { shell: { title: "Workspace" } });
  assert.equal(observed.url, `http://127.0.0.1:43210${TARGET}`);
  assert.equal(observed.options.method, "GET");
  assert.equal(observed.options.headers.cookie, input().cookie);
  assert.equal(observed.options.headers["content-length"], "0");
  assert.equal(observed.options.headers.connection, "close");
  assert.match(observed.options.headers["x-sps-native-workspace-proof"], /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(observed.options.redirect, "manual");
});

test("provider list surfaces preserve their JSON array result", async t => {
  const target = `/api/companies/${WORKSPACE}/workspace-shell/providers`;
  const f = fixture({ fetchImpl: async () => response([{ id: "provider-a" }]) });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  assert.deepEqual(await f.channel.read({ ...input(), target }), [{ id: "provider-a" }]);
});

test("selected Workspace bootstrap is bound to the exact Workspace and target", async t => {
  let fetches = 0;
  const target = `/api/companies/${WORKSPACE}/workspace-bootstrap`;
  const f = fixture({ fetchImpl: async url => {
    fetches++;
    assert.equal(url, `http://127.0.0.1:43210${target}`);
    return response({ v: 1, workspace: { id: WORKSPACE } });
  } });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  assert.deepEqual(await f.channel.read({ ...input(), target }), { v: 1, workspace: { id: WORKSPACE } });
  for (const invalid of [{ ...input(), target, workspaceId: null },
    { ...input(), target, workspaceId: HOST }, { ...input(), target: `${target}?all=true` }]) {
    await assert.rejects(f.channel.read(invalid));
  }
  assert.equal(fetches, 1);
});

test("workspace discovery signs only the nullable fixed discovery route", async t => {
  const target = "/sps-native/v1/workspaces";
  let observed;
  const f = fixture({ fetchImpl: async (url, options) => { observed = { url, options }; return response([{ id: WORKSPACE, name: "Main" }]); } });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  assert.deepEqual(await f.channel.read({ ...input(), workspaceId: null, target }), [{ id: WORKSPACE, name: "Main" }]);
  assert.equal(observed.url, `http://127.0.0.1:43210${target}`);
  await assert.rejects(f.channel.read({ ...input(), workspaceId: null, target: TARGET }));
  await assert.rejects(f.channel.read({ ...input(), target }));
});

test("read refuses arbitrary, mismatched, or non-GET targets before network access", async t => {
  let fetches = 0;
  const f = fixture({ fetchImpl: async () => { fetches += 1; return response({}); } });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  await assert.rejects(f.channel.read({ ...input(), target: "http://127.0.0.1/private" }));
  await assert.rejects(f.channel.read({ ...input(), target: `/api/companies/${HOST}/workspace-shell` }));
  await assert.rejects(f.channel.read({ ...input(), target: `/api/companies/${WORKSPACE}/workspace-inbox?archived=yes` }));
  assert.equal(fetches, 0);
});

test("binding changes and caller invalidation suppress results", async t => {
  let current = IDENTITY;
  const f = fixture({ inspectBinding: async () => current });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  current = { ...IDENTITY, issuerSpkiSha256: "d".repeat(64) };
  await assert.rejects(f.channel.read(input()));
  current = IDENTITY;
  f.invalidate();
  await assert.rejects(f.channel.read(input()));
});

test("bounded JSON rejects oversized responses and preserves a private 403", async t => {
  const f = fixture({ fetchImpl: async () => response({ data: "x".repeat(256 * 1024) }) });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  await assert.rejects(f.channel.read(input()));

  const denied = fixture({ fetchImpl: async () => response({ error: "forbidden" }, 403) });
  t.after(() => denied.channel.dispose());
  await denied.bootstrap(); denied.ready(); await tick();
  await assert.rejects(denied.channel.read(input()), error => error.statusCode === 403);
});

test("matching Core close disposes only the workspace channel", async t => {
  const f = fixture();
  const messageSentinel = () => {};
  const lifecycleSentinels = Object.fromEntries(["disconnect", "exit", "error"].map(event => [event, () => {}]));
  f.child.on("message", messageSentinel);
  for (const [event, listener] of Object.entries(lifecycleSentinels)) f.child.on(event, listener);
  t.after(() => f.channel.dispose());
  await f.bootstrap();
  f.child.emit("message", { v: 1, kind: "sps.native.workspace.bootstrap.close", id: ID });
  assert.equal(f.child.listenerCount("message"), 1);
  assert.equal(f.child.listenerCount("message", messageSentinel), 1);
  for (const [event, listener] of Object.entries(lifecycleSentinels)) {
    assert.equal(f.child.listenerCount(event), 1);
    assert.equal(f.child.listenerCount(event, listener), 1);
  }
  assert.throws(() => f.channel.inspect());
  assert.equal(f.child.connected, true);
});

test("disposing an active Main channel sends one matching close without disconnecting Core", async t => {
  const f = fixture();
  const lifecycleSentinels = Object.fromEntries(["disconnect", "exit", "error"].map(event => [event, () => {}]));
  for (const [event, listener] of Object.entries(lifecycleSentinels)) f.child.on(event, listener);
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  const before = f.sent.length;
  f.channel.dispose();
  f.channel.dispose();
  assert.deepEqual(f.sent.slice(before), [{ v: 1, kind: "sps.native.workspace.bootstrap.close", id: ID }]);
  assert.equal(f.child.connected, true);
  for (const [event, listener] of Object.entries(lifecycleSentinels)) {
    assert.equal(f.child.listenerCount(event), 1);
    assert.equal(f.child.listenerCount(event, listener), 1);
  }
});

test("each owned child-loss event removes every channel listener and preserves unrelated listeners", t => {
  for (const event of ["disconnect", "exit", "error"]) {
    const f = fixture();
    const lifecycleSentinels = Object.fromEntries(["disconnect", "exit", "error"].map(name => [name, () => {}]));
    for (const [name, listener] of Object.entries(lifecycleSentinels)) f.child.on(name, listener);
    const messageSentinel = () => {};
    f.child.on("message", messageSentinel);

    f.child.emit(event, ...(event === "error" ? [new Error("fixture child loss")] : []));
    assert.equal(f.child.listenerCount("message", messageSentinel), 1, `${event}: message sentinel`);
    for (const [name, listener] of Object.entries(lifecycleSentinels)) {
      assert.equal(f.child.listenerCount(name), 1, `${event}: ${name} count`);
      assert.equal(f.child.listenerCount(name, listener), 1, `${event}: ${name} sentinel`);
    }
    assert.throws(() => f.channel.inspect(), undefined, event);
    f.channel.dispose();
    assert.equal(f.child.connected, true, `${event}: preserve Core connection`);
  }
});

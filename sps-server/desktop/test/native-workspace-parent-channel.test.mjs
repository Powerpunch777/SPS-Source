import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { EventEmitter } from "node:events";
import test from "node:test";
import { attachSpsNativeWorkspaceParentChannel } from "../src/native-workspace-parent-channel.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const IDENTITY = Object.freeze({ hostId: HOST, serverSpkiSha256: "a".repeat(64),
  issuerSpkiSha256: "b".repeat(64), issuerCertificate: "AQID" });
const TARGET = `/api/companies/${WORKSPACE}/workspace-shell`;
const PLUGIN_TARGET = "/sps-native/v1/plugin-runtime";
const input = () => ({ workspaceId: WORKSPACE, target: TARGET,
  cookie: `sps_identity_session=${"c".repeat(64)}`, peerCertificateDer: Buffer.from([1, 2, 3]) });
const pluginRuntimeRequest = (overrides = {}) => ({ ...input(), target: PLUGIN_TARGET, method: "POST",
  body: Buffer.from(JSON.stringify({ pluginId: ID, surface: "widget", surfaceId: "health", operation: "data",
    key: "load-health", params: { scope: "workspace" } })), ...overrides });
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

test("read accepts only a bounded Inbox PATCH request and signs its exact body and target", async t => {
  let observed;
  const target = `/api/companies/${WORKSPACE}/workspace-inbox/${ID}`;
  const body = Buffer.from('{"read":true,"archived":false}');
  const f = fixture({ fetchImpl: async (url, options) => {
    observed = { url, options };
    return response({ ok: true });
  } });
  t.after(() => f.channel.dispose());
  const bootstrap = await f.bootstrap(); f.ready(); await tick();
  assert.deepEqual(await f.channel.read({ ...input(), target, method: "PATCH", body }), { ok: true });
  assert.equal(observed.url, `http://127.0.0.1:43210${target}`);
  assert.equal(observed.options.method, "PATCH");
  assert.deepEqual(Buffer.from(observed.options.body), body);
  assert.equal(observed.options.headers["content-type"], "application/json");
  assert.equal(observed.options.headers["content-length"], String(body.length));
  const [payload] = observed.options.headers["x-sps-native-workspace-proof"].split(".");
  const fields = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(fields[1], HOST);
  assert.equal(fields[2], WORKSPACE);
  assert.equal(fields[3], "PATCH");
  assert.equal(fields[4], target);
  assert.equal(fields[7], createHash("sha256").update(body).digest("hex"));
  assert.equal(fields[8], input().cookie);
  assert.equal(fields[9], "application/json");
  const canonical = Buffer.from(JSON.stringify(fields));
  const signature = observed.options.headers["x-sps-native-workspace-proof"].split(".")[1];
  const expectedSignature = createHmac("sha256", Buffer.from(bootstrap.key, "base64url"))
    .update(canonical).digest("base64url");
  assert.equal(signature, expectedSignature);
});

test("read signs the closed Plugin runtime POST body, Workspace, and fixed target", async t => {
  let observed;
  const request = pluginRuntimeRequest();
  const f = fixture({ fetchImpl: async (url, options) => {
    observed = { url, options };
    return response({ data: { healthy: true } });
  } });
  t.after(() => f.channel.dispose());
  const bootstrap = await f.bootstrap(); f.ready(); await tick();
  assert.deepEqual(await f.channel.read(request), { data: { healthy: true } });
  const bodyRecord = JSON.parse(request.body.toString("utf8"));
  assert.deepEqual(Object.keys(bodyRecord), ["pluginId", "surface", "surfaceId", "operation", "key", "params"]);
  assert.equal(Object.hasOwn(bodyRecord, "workspaceId"), false);
  assert.equal(observed.url, `http://127.0.0.1:43210${PLUGIN_TARGET}`);
  assert.equal(observed.options.method, "POST");
  assert.deepEqual(Buffer.from(observed.options.body), request.body);
  assert.equal(observed.options.headers["content-type"], "application/json");
  assert.equal(observed.options.headers["content-length"], String(request.body.length));
  const [payload, signature] = observed.options.headers["x-sps-native-workspace-proof"].split(".");
  const fields = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(fields[2], WORKSPACE);
  assert.equal(fields[3], "POST");
  assert.equal(fields[4], PLUGIN_TARGET);
  assert.equal(fields[7], createHash("sha256").update(request.body).digest("hex"));
  assert.equal(fields[8], input().cookie);
  assert.equal(fields[9], "application/json");
  const canonical = Buffer.from(JSON.stringify(fields));
  assert.equal(signature, createHmac("sha256", Buffer.from(bootstrap.key, "base64url"))
    .update(canonical).digest("base64url"));

  const mutatedBody = Buffer.from(request.body);
  mutatedBody[mutatedBody.indexOf(Buffer.from("workspace"))] ^= 1;
  assert.notEqual(fields[7], createHash("sha256").update(mutatedBody).digest("hex"));
  const tamperedFields = [...fields];
  tamperedFields[7] = createHash("sha256").update(mutatedBody).digest("hex");
  assert.notEqual(signature, createHmac("sha256", Buffer.from(bootstrap.key, "base64url"))
    .update(Buffer.from(JSON.stringify(tamperedFields))).digest("base64url"));
});

test("Plugin runtime POST preserves valid Unicode params", async t => {
  let observedBody;
  const body = Buffer.from(JSON.stringify({ pluginId: ID, surface: "widget", surfaceId: "health",
    operation: "data", key: "load-health", params: { text: "café \uFEFF \uFFFD 東京" } }));
  const f = fixture({ fetchImpl: async (_url, options) => {
    observedBody = Buffer.from(options.body);
    return response({ data: { ok: true } });
  } });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  assert.deepEqual(await f.channel.read(pluginRuntimeRequest({ body })), { data: { ok: true } });
  assert.deepEqual(observedBody, body);
});

test("Plugin runtime POST rejects any noncanonical, unbounded, or open-ended request before networking", async t => {
  let fetches = 0;
  const request = pluginRuntimeRequest();
  const base = JSON.parse(request.body.toString("utf8"));
  const encode = value => Buffer.from(JSON.stringify(value));
  const f = fixture({ fetchImpl: async () => { fetches++; return response({}); } });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  const wrongOrder = Buffer.from(JSON.stringify({ surface: base.surface, pluginId: base.pluginId,
    surfaceId: base.surfaceId, operation: base.operation, key: base.key, params: base.params }));
  const invalid = [
    { ...request, target: `${PLUGIN_TARGET}?x=1` },
    { ...request, target: TARGET },
    { ...request, workspaceId: null },
    { ...request, body: Buffer.from(` ${request.body.toString("utf8")}`) },
    { ...request, body: wrongOrder },
    { ...request, body: encode({ ...base, extra: true }) },
    { ...request, body: encode({ ...base, pluginId: "not-a-uuid" }) },
    { ...request, body: encode({ ...base, surface: "dashboard" }) },
    { ...request, body: encode({ ...base, operation: "proxy" }) },
    { ...request, body: encode({ ...base, surfaceId: "x".repeat(201) }) },
    { ...request, body: encode({ ...base, key: "x".repeat(201) }) },
    { ...request, body: encode({ ...base, params: [] }) },
    { ...request, body: Buffer.alloc(64 * 1024 + 1, 0x20) },
    { ...request, method: "PUT" },
    { ...request, extra: true },
  ];
  for (const value of invalid) await assert.rejects(f.channel.read(value));
  await assert.rejects(f.channel.read({ ...input(), target: PLUGIN_TARGET }));
  assert.equal(fetches, 0);
});

test("Plugin runtime POST abort propagates to the fixed authenticated fetch", async t => {
  let fetchedSignal;
  const f = fixture({ fetchImpl: async (_url, options) => {
    fetchedSignal = options.signal;
    return await new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
  } });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  const abort = new AbortController();
  const pending = f.channel.read(pluginRuntimeRequest(), { signal: abort.signal });
  await tick();
  abort.abort();
  await assert.rejects(pending);
  assert.equal(fetchedSignal.aborted, true);
});

test("Inbox PATCH rejects malformed state, body and route before network access", async t => {
  let fetches = 0;
  const target = `/api/companies/${WORKSPACE}/workspace-inbox/${ID}`;
  const f = fixture({ fetchImpl: async () => { fetches++; return response({}); } });
  t.after(() => f.channel.dispose());
  await f.bootstrap(); f.ready(); await tick();
  for (const invalid of [
    { ...input(), target, method: "PUT", body: Buffer.from('{"read":true}') },
    { ...input(), target, method: "PATCH", body: Buffer.from("{}") },
    { ...input(), target, method: "PATCH", body: Buffer.from('{"read":1}') },
    { ...input(), target, method: "PATCH", body: Buffer.from('{"read":true,"other":false}') },
    { ...input(), target: `${target}?x=1`, method: "PATCH", body: Buffer.from('{"read":true}') },
    { ...input(), target: `/api/companies/${HOST}/workspace-inbox/${ID}`, method: "PATCH", body: Buffer.from('{"read":true}') },
    { ...input(), target, method: "PATCH", body: Buffer.alloc(129, 0x20) },
    { ...input(), target, method: "PATCH", body: Buffer.from('{"read":true}', "utf8"), extra: true },
  ]) await assert.rejects(f.channel.read(invalid));
  assert.equal(fetches, 0);
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

import test from "node:test";
import assert from "node:assert/strict";
import { createCoreWorkspaceManagementController, projectCoreWorkspaces, projectCoreWorkspaceExecution,
  requireCoreWorkspaceInput } from "../src/core-workspace-management.mjs";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const status = overrides => ({ state: "running", epoch: "0", revision: 0, updatedAt: null,
  pending: { agents: 0, jobs: 0, models: 0, commands: 0, plugins: 0 }, canControl: true, ...overrides });
function fixture(overrides = {}) {
  let host = true, frame = true;
  const calls = [];
  const controller = createCoreWorkspaceManagementController({
    captureHost: () => { if (!host) throw new Error("private Host changed"); return () => { if (!host) throw new Error("private Host changed"); }; },
    request: async (pathname, options) => {
      calls.push({ pathname, options }); options.assertCurrent();
      if (pathname === "/companies") return [{ id: workspaceId, name: "Workspace", privateToken: "not-for-renderer" }];
      return status();
    }, ...overrides,
  });
  return { controller, calls, options: { assertRequester() { if (!frame) throw new Error("frame changed"); }, confirm: async () => true },
    retireHost() { host = false; }, retireFrame() { frame = false; } };
}

test("Native Workspace input rejects extra fields, getters, bad UUID/revision/action", () => {
  let getter = false;
  for (const input of [{ workspaceId, url: "https://other.invalid" }, { workspaceId: "../other" },
    Object.defineProperty({}, "workspaceId", { enumerable: true, get() { getter = true; } })]) {
    assert.throws(() => requireCoreWorkspaceInput(input));
  }
  for (const input of [{ workspaceId, action: "delete", expectedRevision: 0 },
    { workspaceId, action: "stop", expectedRevision: Infinity }, { workspaceId, action: "pause", expectedRevision: -1 },
    { workspaceId, action: "resume", expectedRevision: 2_147_483_647 }]) assert.throws(() => requireCoreWorkspaceInput(input, true));
  assert.equal(getter, false);
});

test("Native Workspace projections contain no credentials and reject malformed controls", () => {
  assert.deepEqual(projectCoreWorkspaces([{ id: workspaceId, name: "<text>", secret: "private" }]), [{ id: workspaceId, name: "<text>" }]);
  for (const rows of [[{ id: workspaceId, name: "" }], [{ id: workspaceId, name: "line\nbreak" }],
    [{ id: workspaceId, name: "a" }, { id: workspaceId, name: "b" }], Array(201).fill({ id: workspaceId, name: "a" })]) {
    assert.throws(() => projectCoreWorkspaces(rows));
  }
  const view = projectCoreWorkspaceExecution(status({ cancellationFailures: ["local-lane"] }));
  assert.equal(view.cancellationIncomplete, true);
  assert.deepEqual(projectCoreWorkspaceExecution(view, true), view);
  assert.equal("cancellationFailures" in view, false);
  for (const value of [status({ state: "finished" }), status({ epoch: "01" }), status({ revision: NaN }),
    status({ token: "private" }), status({ updatedAt: "2026-01-01" }),
    status({ pending: { agents: -1, jobs: 0, models: 0, commands: 0, plugins: 0 } })]) {
    assert.throws(() => projectCoreWorkspaceExecution(value));
  }
});

test("Native list/read use fixed existing API routes and leave mutation/startup uncalled", async () => {
  const ctx = fixture();
  assert.deepEqual(await ctx.controller.list(ctx.options), [{ id: workspaceId, name: "Workspace" }]);
  const view = await ctx.controller.get({ workspaceId }, ctx.options);
  assert.equal(view.state, "running");
  assert.deepEqual(ctx.calls.map(call => call.pathname), ["/companies", "/companies", `/companies/${workspaceId}/execution-control`]);
  assert.ok(ctx.calls.every(call => call.options.method === undefined));
  await assert.rejects(ctx.controller.get({ workspaceId: otherId }, ctx.options));
  assert.equal(ctx.calls.some(call => call.pathname.includes(otherId)), false);
  await assert.rejects(ctx.controller.list());
});

test("Native transition uses current Workspace revision and cancel never sends a POST", async () => {
  const ctx = fixture();
  const input = { workspaceId, action: "stop", expectedRevision: 0 };
  assert.deepEqual(await ctx.controller.change(input, { ...ctx.options, confirm: async () => false }), { cancelled: true });
  assert.equal(ctx.calls.some(call => call.options.method === "POST"), false);
  await ctx.controller.change(input, ctx.options);
  const post = ctx.calls.filter(call => call.options.method === "POST");
  assert.equal(post.length, 1);
  assert.deepEqual(post[0].options.body, { action: "stop", expectedRevision: 0 });
  assert.equal(post[0].options.ownerBootstrap, true);
});

test("stale revision or lost control authority never reaches confirmation or mutation", async () => {
  for (const result of [status({ revision: 1 }), status({ canControl: false })]) {
    const ctx = fixture({ request: async pathname => pathname === "/companies" ? [{ id: workspaceId, name: "a" }] : result });
    let confirmed = false;
    await assert.rejects(ctx.controller.change({ workspaceId, action: "pause", expectedRevision: 0 },
      { ...ctx.options, confirm: async () => { confirmed = true; return true; } }));
    assert.equal(confirmed, false);
  }
});

test("Host/frame retirement after reads or confirmation prevents effects", async () => {
  for (const retire of ["retireHost", "retireFrame"]) {
    const ctx = fixture();
    await assert.rejects(ctx.controller.change({ workspaceId, action: "resume", expectedRevision: 0 }, {
      ...ctx.options, confirm: async () => { ctx[retire](); return true; },
    }));
    assert.equal(ctx.calls.some(call => call.options.method === "POST"), false);
  }
  const ctx = fixture({ request: async () => { ctx.retireFrame(); return [{ id: workspaceId, name: "a" }]; } });
  await assert.rejects(ctx.controller.list(ctx.options));
});

test("confirmation-time state change is rechecked and an ambiguous POST is not retried", async () => {
  let reads = 0, posts = 0;
  const ctx = fixture({ request: async (pathname, options) => {
    if (pathname === "/companies") return [{ id: workspaceId, name: "a" }];
    if (options.method === "POST") { posts++; throw new Error("response lost"); }
    return status({ revision: reads++ === 0 ? 0 : 1 });
  } });
  await assert.rejects(ctx.controller.change({ workspaceId, action: "stop", expectedRevision: 0 }, ctx.options));
  assert.equal(posts, 0);
  const ambiguous = fixture({ request: async (pathname, options) => {
    if (pathname === "/companies") return [{ id: workspaceId, name: "a" }];
    if (options.method === "POST") { posts++; throw new Error("response lost"); }
    return status();
  } });
  await assert.rejects(ambiguous.controller.change({ workspaceId, action: "stop", expectedRevision: 0 }, ambiguous.options));
  assert.equal(posts, 1);
});

test("concurrent Native transitions are rejected until the first reviewed action finishes", async () => {
  const ctx = fixture();
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { started = resolve; });
  const input = { workspaceId, action: "pause", expectedRevision: 0 };
  const first = ctx.controller.change(input, { ...ctx.options, confirm: async () => { started(); await gate; return true; } });
  await ready;
  await assert.rejects(ctx.controller.change(input, ctx.options));
  release(); await first;
  assert.equal(ctx.calls.filter(call => call.options.method === "POST").length, 1);
});

test("Native status reads carry the Main-only Host proof needed to report control authority", async () => {
  const ctx = fixture();
  await ctx.controller.get({ workspaceId }, ctx.options);
  const reads = ctx.calls.filter(call => call.pathname === `/companies/${workspaceId}/execution-control`);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].options.ownerBootstrap, true);
  assert.equal(ctx.calls.find(call => call.pathname === "/companies").options.ownerBootstrap, undefined);
});

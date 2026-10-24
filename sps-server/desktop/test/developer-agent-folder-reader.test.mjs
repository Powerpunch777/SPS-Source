import assert from "node:assert/strict";
import test from "node:test";
import { readDeveloperAgentFolder } from "../src/developer-agent-folder-reader.mjs";

const companyId = "11111111-1111-4111-8111-111111111111";
const agentId = "22222222-2222-4222-8222-222222222222";
const context = { companyId, pluginId: "sps.plugin-discovery", contextId: "33333333-3333-4333-8333-333333333333" };
const projectId = "dev-44444444-4444-4444-8444-444444444444";
const input = { context, agentId };

function harness(overrides = {}) {
  const calls = [];
  const binding = { projectId, updatedAt: "2026-10-24T00:00:00.000Z" };
  const project = { id: projectId, sourcePath: process.platform === "win32" ? "C:\\sps-project" : "/sps-project" };
  const agent = { id: agentId, companyId, status: "idle", adapterType: "codex_local", adapterConfig: { cwd: project.sourcePath, env: { SECRET: "private-value" } } };
  const deps = {
    assertOwner() { calls.push("owner"); },
    async resolveContext(value) { calls.push("context"); assert.deepEqual(value, context); return { context: value }; },
    async getBinding(value) { calls.push("binding"); assert.deepEqual(value, context); return binding; },
    async loadProjects() { calls.push("projects"); return [project]; },
    async getAgent(value) { calls.push("agent"); assert.equal(value, agentId); return agent; },
    ...overrides,
  };
  return { calls, binding, project, agent, deps };
}

test("returns only the configured path comparison after Host and binding rechecks", async () => {
  const h = harness();
  const result = await readDeveloperAgentFolder(input, h.deps);
  assert.deepEqual(result, { schemaVersion: 1, projectId, agentId, status: "configured-match" });
  assert.deepEqual(h.calls, ["owner", "context", "binding", "projects", "agent", "binding", "owner"]);
  assert.doesNotMatch(JSON.stringify(result), /cwd|sourcePath|private-value|sps-project/);
});

test("rejects unknown fields, malformed IDs and accessor envelopes before reads", async () => {
  for (const value of [null, { ...input, cwd: "/arbitrary" }, { context }, { ...input, agentId: "../other" },
    { ...input, context: { ...context, sourcePath: "/arbitrary" } },
    Object.defineProperty({ context }, "agentId", { enumerable: true, get() { throw new Error("getter must not run"); } })]) {
    const h = harness();
    await assert.rejects(readDeveloperAgentFolder(value, h.deps));
    assert.deepEqual(h.calls, ["owner"]);
  }
});

test("rejects missing and dangling projects without querying an Agent", async () => {
  for (const override of [{ getBinding: async () => null }, { loadProjects: async () => [] }]) {
    const h = harness(override);
    await assert.rejects(readDeveloperAgentFolder(input, h.deps), /Connect an available developer project/);
    assert.ok(!h.calls.includes("agent"));
  }
});

test("rejects changed binding including unlink and relink to the same project", async () => {
  for (const current of [null, { projectId: "dev-55555555-5555-4555-8555-555555555555", updatedAt: "later" },
    { projectId, updatedAt: "2026-10-24T00:00:01.000Z" }]) {
    const h = harness();
    let reads = 0;
    h.deps.getBinding = async () => ++reads === 1 ? h.binding : current;
    await assert.rejects(readDeveloperAgentFolder(input, h.deps), /Developer project changed/);
  }
});

test("denies lost ownership before returning an assessment", async () => {
  const h = harness();
  let checks = 0;
  h.deps.assertOwner = () => { if (++checks === 2) throw new Error("Owner changed"); };
  await assert.rejects(readDeveloperAgentFolder(input, h.deps), /Owner changed/);
});

test("cannot compare a foreign Workspace Agent or substitute another Agent ID", async () => {
  for (const override of [{ companyId: "55555555-5555-4555-8555-555555555555" },
    { id: "55555555-5555-4555-8555-555555555555" }]) {
    const h = harness();
    h.deps.getAgent = async () => ({ ...h.agent, ...override });
    await assert.rejects(readDeveloperAgentFolder(input, h.deps));
  }
});

test("propagates failed scoped reads rather than inventing a passing status", async () => {
  for (const name of ["resolveContext", "getBinding", "loadProjects", "getAgent"]) {
    const error = new Error("read unavailable");
    const h = harness({ [name]: async () => { throw error; } });
    await assert.rejects(readDeveloperAgentFolder(input, h.deps), value => value === error);
  }
});

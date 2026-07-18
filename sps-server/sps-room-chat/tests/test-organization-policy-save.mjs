import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";

const { handleOrganizationAgentPolicySave } = await import("../src/worker.js");

const companyId = "company-policy-save";
const agent = {
  id: "agent-1",
  urlKey: "delivery-lead",
  name: "Delivery Lead",
  role: "general",
  status: "idle",
  adapterType: "codex_local",
  adapterConfig: {
    model: "gpt-test",
    env: { CODEX_HOME: { value: "C:\\Users\\example\\.codex-team" } },
    workplane: { roleId: "old-role", kind: "lead", assignableRoleIds: ["worker"] }
  }
};

const originalFetch = globalThis.fetch;
let savedPayload = null;
globalThis.fetch = async (url, init = {}) => {
  assert.equal(String(url), "http://127.0.0.1:3100/api/agents/agent-1?companyId=company-policy-save");
  assert.equal(init.method, "PATCH");
  savedPayload = JSON.parse(String(init.body));
  return new Response(JSON.stringify({ ...agent, adapterConfig: savedPayload.adapterConfig }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
};

try {
  const result = await handleOrganizationAgentPolicySave({
    config: { get: async () => ({ paperclipApiUrl: "http://127.0.0.1:3100" }) },
    agents: { get: async (agentId) => agentId === agent.id ? agent : null }
  }, {
    agentId: agent.id,
    roleId: "delivery-lead",
    kind: "lead",
    assignableRoleIds: ["implementation", "qa"],
    memoryAccess: "none",
    reviewMode: "manual"
  }, {
    companyId,
    actor: { type: "user", permissions: ["agents:configure"] }
  });

  assert.equal(savedPayload.replaceAdapterConfig, true);
  assert.equal(savedPayload.adapterConfig.model, "gpt-test");
  assert.deepEqual(savedPayload.adapterConfig.env, agent.adapterConfig.env);
  assert.deepEqual(savedPayload.adapterConfig.workplane, {
    roleId: "delivery-lead",
    kind: "lead",
    assignableRoleIds: ["implementation", "qa"],
    memoryAccess: "none",
    reviewMode: "manual"
  });
  assert.equal(result.ok, true);
  assert.equal(result.agent.urlKey, agent.urlKey);
  assert.equal(result.agent.workplane.memoryAccess, "none");
  assert.equal(result.agent.workplane.reviewMode, "manual");

  await assert.rejects(
    handleOrganizationAgentPolicySave({
      config: { get: async () => ({ paperclipApiUrl: "http://127.0.0.1:3100" }) },
      agents: { get: async () => agent }
    }, {
      agentId: agent.id,
      roleId: "delivery-lead",
      kind: "lead",
      assignableRoleIds: ["worker"],
      memoryAccess: "unbounded",
      reviewMode: "automatic"
    }, {
      companyId,
      actor: { type: "user", permissions: ["agents:configure"] }
    }),
    /memory access must be/i
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("organization policy save tests passed");

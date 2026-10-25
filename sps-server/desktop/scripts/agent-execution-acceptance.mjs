import assert from "node:assert/strict";
import path from "node:path";
import { createNodeIdentity, createSignedHeartbeat } from "@sps/desktop-node";
import { createChecklistPackage } from "./no-ai-checklist-package.mjs";

/** Separate temporary Workspace; config inspection never dispatches an Agent. */
export async function runAgentExecutionAcceptance({ call, plugin, temporaryRoot, unrelatedCompanyId }) {
  const company = await call("/api/companies", { method: "POST", body: { name: "Agent descriptor fixture", requireBoardApprovalForNewAgents: false } });
  await call(`/api/plugins/${plugin.id}/companies/${company.id}/activation`, { method: "PUT", body: { enabled: true } });
  const agent = await call(`/api/companies/${company.id}/agents`, { method: "POST", body: {
    name: "Inert execution descriptor", role: "engineer", adapterType: "codex_local",
    adapterConfig: { cwd: temporaryRoot, promptTemplate: "private-fixture-marker" },
    runtimeConfig: { heartbeat: { enabled: false, wakeOnDemand: false } },
  } });
  const inspect = async (companyId = company.id) => (await call(`/api/plugins/${plugin.id}/data/agent-execution`, {
    method: "POST", body: { companyId, params: { agentId: agent.id } },
  })).data;
  const initial = await inspect();
  assert.deepEqual(initial, { agentId: agent.id, adapterType: "codex_local", state: "configured", adapterRegistration: "registered",
    executionOwner: "adapter", authorization: "recheck_on_dispatch", readiness: "unknown", node: null });
  assert.ok(!JSON.stringify(initial).includes(temporaryRoot));
  assert.ok(!JSON.stringify(initial).includes("private-fixture-marker"));
  await assert.rejects(inspect(unrelatedCompanyId), /Agent not found/);
  const deniedFixture = await createChecklistPackage(path.join(temporaryRoot, "reference-plugins", "agent-denied"), {
    id: "local.agent-denied", withUi: false, runtimeDiscovery: true, agentDiscovery: true, omitCapability: "agents.read",
  });
  await call("/api/plugins/install", { method: "POST", body: { packageName: deniedFixture.directory, isLocalPath: true } });
  const denied = (await call("/api/plugins")).find(item => item.pluginKey === "local.agent-denied");
  assert.equal(denied?.status, "ready");
  await call(`/api/plugins/${denied.id}/companies/${company.id}/activation`, { method: "PUT", body: { enabled: true } });
  await assert.rejects(call(`/api/plugins/${denied.id}/data/agent-execution`, {
    method: "POST", body: { companyId: company.id, params: { agentId: agent.id } },
  }), /agents.read|capability|permission/i);
  const identity = createNodeIdentity();
  const node = await call(`/api/companies/${company.id}/sps-nodes`, { method: "POST", body: {
    displayName: "Agent descriptor simulated Node", publicKey: identity.publicKeyPem, transportPublicKey: identity.transportPublicKeyPem,
    platform: "win32", appVersion: "0.4.137", capabilities: [{ kind: "codex_cli", label: "Fixture CLI" }],
  } });
  await call(`/api/sps-nodes/${node.id}/heartbeat`, { method: "POST", body: createSignedHeartbeat({ identity, nodeId: node.id }) });
  await call(`/api/sps-nodes/${node.id}/approve`, { method: "POST", body: {} });
  await call(`/api/sps-nodes/${node.id}/agent-grants/${agent.id}`, { method: "PUT", body: {} });
  const bound = await inspect();
  assert.equal(bound.executionOwner, "node");
  assert.equal(bound.node.id, node.id);
  assert.equal(bound.node.state, "recently_seen");
  assert.equal(bound.readiness, "unknown");
  await call(`/api/agents/${agent.id}/pause`, { method: "POST", body: {} });
  assert.equal((await inspect()).state, "disabled");
  await call(`/api/sps-nodes/${node.id}/revoke`, { method: "POST", body: {} });
  const unbound = await inspect();
  assert.equal(unbound.executionOwner, "adapter", "Revocation removes the persisted Node binding; reads must reflect it");
  assert.equal(unbound.node, null);
  assert.equal(unbound.readiness, "unknown");
  assert.deepEqual(await call(`/api/companies/${company.id}/heartbeat-runs?limit=10`), [], "Inspection started an Agent execution");
  console.log("[agent-descriptor] real public Worker/Core config/registry/Node binding observation, pause, revoke and A/B/capability denial passed; inert separate Workspace, no Agent dispatched");
}

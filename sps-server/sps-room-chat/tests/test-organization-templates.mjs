import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";

const {
  listOrganizationTemplates,
  resolveOrganizationTemplate
} = await import("../src/organization-templates.js");
const { handleOrganizationSettingsView } = await import("../src/worker.js");

const templates = listOrganizationTemplates();
assert.equal(templates.some((template) => template.id === "lead-worker" && !template.actionable), true);
assert.equal(templates.some((template) => template.id === "game-studio-compatibility" && template.actionable), true);
assert.equal(templates.find((template) => template.id === "game-studio-compatibility").visibleWhenEligible, true);

const preview = resolveOrganizationTemplate("game-studio-compatibility", [
  { id: "manager", role: "ceo", adapterConfig: {} },
  { id: "designer", role: "designer", adapterConfig: {} },
  { id: "code", role: "engineer", adapterConfig: {} },
  { id: "image", role: "general", adapterConfig: {} },
  { id: "custom", role: "research", adapterConfig: {} },
  { id: "configured", role: "cto", adapterConfig: { workplane: { roleId: "technical-lead", kind: "lead" } } }
]);

assert.deepEqual(preview.assignments.map((entry) => [entry.agentId, entry.policy.kind]), [
  ["manager", "lead"],
  ["designer", "lead"],
  ["code", "worker"],
  ["image", "worker"],
  ["configured", "lead"]
]);
assert.deepEqual(preview.unmatchedAgentIds, ["custom"]);
assert.deepEqual(preview.skippedConfiguredAgentIds, []);
assert.deepEqual(preview.assignments[0].policy.assignableRoleIds, ["worker", "hybrid"]);
assert.equal(preview.assignments[0].policy.memoryAccess, "read_write");
assert.equal(preview.assignments[0].policy.reviewMode, "automatic");
assert.equal(preview.assignments[2].policy.memoryAccess, "read");

const completePolicyPreview = resolveOrganizationTemplate("game-studio-compatibility", [
  {
    id: "configured",
    role: "cto",
    adapterConfig: {
      workplane: {
        roleId: "technical-lead",
        kind: "lead",
        assignableRoleIds: ["worker"],
        memoryAccess: "none",
        reviewMode: "manual"
      }
    }
  }
]);
assert.deepEqual(completePolicyPreview.assignments, []);
assert.deepEqual(completePolicyPreview.skippedConfiguredAgentIds, ["configured"]);

const genericOrganizationView = await handleOrganizationSettingsView({
  agents: { list: async () => [{ id: "research", name: "Research", role: "research", status: "idle", adapterConfig: {} }] }
}, { companyId: "company-generic" });
assert.deepEqual(genericOrganizationView.templates.map((template) => template.id), ["lead-worker", "web-app-starter", "small-team-starter"]);

const legacyOrganizationView = await handleOrganizationSettingsView({
  agents: { list: async () => [{ id: "manager", name: "Manager", role: "ceo", status: "idle", adapterConfig: {} }] }
}, { companyId: "company-legacy" });
assert.deepEqual(legacyOrganizationView.templates.map((template) => template.id), ["lead-worker", "web-app-starter", "small-team-starter", "game-studio-compatibility"]);

const webAppPreview = resolveOrganizationTemplate("web-app-starter", [
  { id: "product", role: "product-lead", adapterConfig: {} },
  { id: "frontend", role: "frontend", adapterConfig: {} },
  { id: "backend", role: "backend-worker", adapterConfig: {} },
  { id: "unknown", role: "research", adapterConfig: {} }
]);
assert.deepEqual(webAppPreview.assignments.map((assignment) => [assignment.agentId, assignment.policy.kind, assignment.policy.roleId]), [
  ["product", "lead", "product-lead"],
  ["frontend", "worker", "frontend"],
  ["backend", "worker", "backend-worker"]
]);
assert.deepEqual(webAppPreview.assignments[0].policy.assignableRoleIds, ["*"]);
assert.deepEqual(webAppPreview.unmatchedAgentIds, ["unknown"]);

const smallTeamPreview = resolveOrganizationTemplate("small-team-starter", [
  { id: "lead", role: "project-lead", adapterConfig: {} },
  { id: "worker", role: "generalist-worker", adapterConfig: {} }
]);
assert.deepEqual(smallTeamPreview.assignments.map((assignment) => [assignment.agentId, assignment.policy.kind, assignment.policy.roleId]), [
  ["lead", "lead", "project-lead"],
  ["worker", "worker", "generalist-worker"]
]);

console.log("organization template tests passed");

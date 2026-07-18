import assert from "node:assert/strict";

const {
  WORKPLANE_CAPABILITIES,
  canDelegateTo,
  hasWorkplaneCapability,
  isWorkplaneLead,
  isWorkplaneWorker,
  resolveAgentWorkplaneIdentity
} = await import("../src/organization-policy.js");

const legacyLead = { id: "legacy-lead", name: "Primary CTO", role: "cto", capabilities: "Plans and delegates work.", adapterConfig: {} };
const legacyWorker = { id: "legacy-worker", name: "Code Worker", role: "engineer", capabilities: "Implements assigned work.", adapterConfig: {} };
const legacyLeadIdentity = resolveAgentWorkplaneIdentity(legacyLead);
const legacyWorkerIdentity = resolveAgentWorkplaneIdentity(legacyWorker);

assert.equal(legacyLeadIdentity.kind, "lead");
assert.equal(legacyLeadIdentity.source, "legacy");
assert.equal(hasWorkplaneCapability(legacyLeadIdentity, WORKPLANE_CAPABILITIES.TASK_CREATE), true);
assert.equal(legacyLeadIdentity.memoryAccess, "read_write");
assert.equal(legacyLeadIdentity.reviewMode, "automatic");
assert.equal(legacyWorkerIdentity.kind, "worker");
assert.equal(isWorkplaneWorker(legacyWorker), true);
assert.equal(legacyWorkerIdentity.memoryAccess, "read");
assert.equal(canDelegateTo(legacyLeadIdentity, legacyWorkerIdentity), true);
assert.equal(canDelegateTo(legacyLead, legacyWorker), true);

const technicalLead = {
  id: "technical-lead",
  name: "Ari",
  role: "general",
  adapterConfig: {
    workplane: {
      roleId: "technical-director",
      kind: "lead",
      assignableRoleIds: ["art-production"],
      memoryAccess: "none",
      reviewMode: "manual"
    }
  }
};
const artWorker = {
  id: "art-worker",
  name: "Iris",
  role: "general",
  adapterConfig: {
    workplane: {
      roleId: "art-production",
      kind: "worker"
    }
  }
};
const qaWorker = {
  id: "qa-worker",
  name: "Quinn",
  role: "general",
  adapterConfig: {
    workplane: {
      roleId: "quality",
      kind: "worker"
    }
  }
};

assert.equal(isWorkplaneLead(technicalLead), true);
assert.equal(resolveAgentWorkplaneIdentity(technicalLead).memoryAccess, "none");
assert.equal(resolveAgentWorkplaneIdentity(technicalLead).reviewMode, "manual");
assert.equal(canDelegateTo(technicalLead, artWorker), true);
assert.equal(canDelegateTo(technicalLead, qaWorker), false);
assert.equal(isWorkplaneWorker(artWorker), true);
assert.equal(hasWorkplaneCapability(artWorker, WORKPLANE_CAPABILITIES.TASK_CREATE), false);

const hybrid = {
  id: "hybrid",
  name: "Specialist Lead",
  role: "general",
  adapterConfig: {
    workplane: {
      roleId: "research-lead",
      kind: "hybrid",
      assignableRoleIds: ["worker"]
    }
  }
};
assert.equal(hasWorkplaneCapability(hybrid, WORKPLANE_CAPABILITIES.TASK_COMPLETE), true);
assert.equal(isWorkplaneWorker(hybrid), true);

console.log("organization policy tests passed");

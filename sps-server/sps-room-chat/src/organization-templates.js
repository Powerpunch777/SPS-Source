const LEAD_POLICY = Object.freeze({
  roleId: "lead",
  kind: "lead",
  assignableRoleIds: ["worker", "hybrid"],
  memoryAccess: "read_write",
  reviewMode: "automatic"
});

const WORKER_POLICY = Object.freeze({
  roleId: "worker",
  kind: "worker",
  assignableRoleIds: [],
  memoryAccess: "read",
  reviewMode: "automatic"
});

const GAME_STUDIO_LEAD_ROLES = new Set(["manager", "ceo", "designer", "cto"]);
const GAME_STUDIO_WORKER_ROLES = new Set([
  "engineer",
  "qa",
  "general",
  "code-worker",
  "qa-worker",
  "image-worker",
  "voice-worker",
  "document-worker",
  "art-worker"
]);

const WEB_APP_LEAD_ROLES = new Set([
  "product",
  "product-lead",
  "product-manager",
  "technical-lead",
  "tech-lead",
  "engineering-lead",
  "cto"
]);

const WEB_APP_WORKER_ROLES = new Set([
  "frontend",
  "frontend-worker",
  "backend",
  "backend-worker",
  "mobile",
  "mobile-worker",
  "qa",
  "qa-worker",
  "documentation",
  "documentation-worker",
  "document",
  "document-worker",
  "devops",
  "devops-worker"
]);

const SMALL_TEAM_LEAD_ROLES = new Set(["project-lead", "lead", "manager"]);
const SMALL_TEAM_WORKER_ROLES = new Set(["generalist", "generalist-worker", "qa", "qa-worker"]);

const ORGANIZATION_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "lead-worker",
    displayName: "Custom Lead + Worker",
    description: "A blank, general-purpose organization. Assign each Agent its Lead, Worker, or Hybrid policy in the rows below.",
    actionable: false
  }),
  Object.freeze({
    id: "web-app-starter",
    displayName: "Web / App starter",
    description: "Sets recognized product and technical leads to Lead, and frontend, backend, mobile, QA, documentation, and DevOps Agents to Worker. Each Lead can delegate to the shared Worker pool.",
    actionable: true,
    actionLabel: "Apply Web / App starter"
  }),
  Object.freeze({
    id: "small-team-starter",
    displayName: "Small team starter",
    description: "Sets recognized project leads to Lead and generalist or QA Agents to Worker. Use it for a lightweight, domain-neutral delivery team.",
    actionable: true,
    actionLabel: "Apply small team starter"
  }),
  Object.freeze({
    id: "game-studio-compatibility",
    displayName: "Legacy Workplane migration",
    description: "Migrates a recognized legacy Lead and Worker setup to explicit generic Workplane policies without changing rooms or Tasks.",
    actionable: true,
    actionLabel: "Migrate legacy policy",
    visibleWhenEligible: true
  })
]);

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function configuredWorkplane(agent) {
  const config = agent?.adapterConfig?.workplane;
  return config && typeof config === "object" && !Array.isArray(config) ? config : {};
}

function hasExplicitWorkplane(agent) {
  const config = configuredWorkplane(agent);
  const memoryAccess = text(config.memoryAccess).toLowerCase();
  const reviewMode = text(config.reviewMode).toLowerCase();
  return Boolean(
    text(config.kind)
    && text(config.roleId)
    && Array.isArray(config.assignableRoleIds)
    && new Set(["read_write", "read", "none"]).has(memoryAccess)
    && new Set(["automatic", "manual"]).has(reviewMode)
  );
}

function clonePolicy(policy) {
  return {
    roleId: policy.roleId,
    kind: policy.kind,
    assignableRoleIds: [...policy.assignableRoleIds],
    memoryAccess: policy.memoryAccess,
    reviewMode: policy.reviewMode
  };
}

function normalizedRoleId(value) {
  const roleId = text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return roleId || null;
}

function starterPolicyForAgent(agent, leadRoles, workerRoles) {
  const roleId = normalizedRoleId(agent?.role);
  if (!roleId) return null;
  if (leadRoles.has(roleId)) {
    return {
      ...clonePolicy(LEAD_POLICY),
      roleId,
      assignableRoleIds: ["*"]
    };
  }
  if (workerRoles.has(roleId)) {
    return {
      ...clonePolicy(WORKER_POLICY),
      roleId
    };
  }
  return null;
}

function gameStudioPolicyForAgent(agent) {
  const paperclipRole = text(agent?.role).toLowerCase();
  if (GAME_STUDIO_LEAD_ROLES.has(paperclipRole)) return clonePolicy(LEAD_POLICY);
  if (GAME_STUDIO_WORKER_ROLES.has(paperclipRole)) return clonePolicy(WORKER_POLICY);
  return null;
}

function policyForTemplateAgent(templateId, agent) {
  if (templateId === "game-studio-compatibility") return gameStudioPolicyForAgent(agent);
  if (templateId === "web-app-starter") {
    return starterPolicyForAgent(agent, WEB_APP_LEAD_ROLES, WEB_APP_WORKER_ROLES);
  }
  if (templateId === "small-team-starter") {
    return starterPolicyForAgent(agent, SMALL_TEAM_LEAD_ROLES, SMALL_TEAM_WORKER_ROLES);
  }
  return null;
}

export function listOrganizationTemplates() {
  return ORGANIZATION_TEMPLATES.map((template) => ({ ...template }));
}

export function resolveOrganizationTemplate(templateId, agents) {
  const template = ORGANIZATION_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!template) throw new Error("Organization template was not found.");

  const assignments = [];
  const skippedConfiguredAgentIds = [];
  const unmatchedAgentIds = [];
  for (const agent of Array.isArray(agents) ? agents : []) {
    if (!agent?.id) continue;
    if (hasExplicitWorkplane(agent)) {
      skippedConfiguredAgentIds.push(agent.id);
      continue;
    }
    const policy = policyForTemplateAgent(template.id, agent);
    if (!policy) {
      unmatchedAgentIds.push(agent.id);
      continue;
    }
    assignments.push({ agentId: agent.id, policy });
  }

  return {
    template: { ...template },
    assignments,
    skippedConfiguredAgentIds,
    unmatchedAgentIds
  };
}

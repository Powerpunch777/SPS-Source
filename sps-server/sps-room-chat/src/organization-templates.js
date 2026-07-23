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
    displayName: "사용자 지정 Lead + Worker",
    description: "범용 시작 구성입니다. 아래에서 각 Agent의 Lead, Worker, Hybrid 정책을 직접 정합니다.",
    actionable: false
  }),
  Object.freeze({
    id: "web-app-starter",
    displayName: "웹/앱 시작 구성",
    description: "제품 및 기술 Lead는 Lead로, 프론트엔드·백엔드·모바일·QA·문서화·DevOps Agent는 Worker로 설정합니다. 각 Lead는 공용 Worker 풀에 작업을 위임할 수 있습니다.",
    actionable: true,
    actionLabel: "웹/앱 시작 구성 적용"
  }),
  Object.freeze({
    id: "small-team-starter",
    displayName: "소규모 팀 시작 구성",
    description: "프로젝트 Lead는 Lead로, 제너럴리스트 및 QA Agent는 Worker로 설정합니다. 분야와 관계없이 가벼운 제작 팀을 시작할 때 사용하세요.",
    actionable: true,
    actionLabel: "소규모 팀 시작 구성 적용"
  }),
  Object.freeze({
    id: "game-studio-compatibility",
    displayName: "기존 Workplane 이관",
    description: "기존 Lead와 Worker 구성을 Room이나 Task를 바꾸지 않고 명시적인 범용 Workplane 정책으로 이관합니다.",
    actionable: true,
    actionLabel: "기존 정책 이관",
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
  if (!template) throw new Error("Workplane 템플릿을 찾을 수 없습니다.");

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

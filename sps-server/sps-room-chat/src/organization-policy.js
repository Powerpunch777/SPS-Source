import { resolveLegacyWorkplaneIdentity } from "./organization-legacy-compatibility.js";

export const WORKPLANE_CAPABILITIES = Object.freeze({
  TASK_CREATE: "task.create",
  TASK_ASSIGN: "task.assign",
  TASK_REVIEW: "task.review",
  TASK_COMPLETE: "task.complete",
  TASK_EXECUTE: "task.execute"
});

const LEAD_CAPABILITIES = Object.freeze([
  WORKPLANE_CAPABILITIES.TASK_CREATE,
  WORKPLANE_CAPABILITIES.TASK_ASSIGN,
  WORKPLANE_CAPABILITIES.TASK_REVIEW,
  WORKPLANE_CAPABILITIES.TASK_COMPLETE
]);

const WORKER_CAPABILITIES = Object.freeze([
  WORKPLANE_CAPABILITIES.TASK_EXECUTE
]);

const HYBRID_CAPABILITIES = Object.freeze([
  ...LEAD_CAPABILITIES,
  ...WORKER_CAPABILITIES
]);

const VALID_KINDS = new Set(["lead", "worker", "hybrid"]);
const VALID_MEMORY_ACCESS = new Set(["read_write", "read", "none"]);
const VALID_REVIEW_MODES = new Set(["automatic", "manual"]);

export const WORKPLANE_MEMORY_ACCESS = Object.freeze({
  READ_WRITE: "read_write",
  READ: "read",
  NONE: "none"
});

export const WORKPLANE_REVIEW_MODES = Object.freeze({
  AUTOMATIC: "automatic",
  MANUAL: "manual"
});

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function stringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => text(entry)).filter(Boolean))]
    : [];
}

// Core Agent records also have a human-readable `capabilities` field. Treat an
// object as an already resolved Workplane identity only when it carries the
// normalized capability array produced by this module.
function isResolvedWorkplaneIdentity(value) {
  return Array.isArray(value?.capabilities);
}

function defaultCapabilities(kind) {
  if (kind === "lead") return [...LEAD_CAPABILITIES];
  if (kind === "worker") return [...WORKER_CAPABILITIES];
  if (kind === "hybrid") return [...HYBRID_CAPABILITIES];
  return [];
}

function defaultMemoryAccess(kind) {
  return kind === "worker" ? WORKPLANE_MEMORY_ACCESS.READ : WORKPLANE_MEMORY_ACCESS.READ_WRITE;
}

function defaultReviewMode() {
  return WORKPLANE_REVIEW_MODES.AUTOMATIC;
}

// The product stores the generic policy on the Agent. The legacy branch only
// preserves existing installations until their Organization settings are saved.
export function resolveAgentWorkplaneIdentity(agent) {
  const config = asRecord(asRecord(agent?.adapterConfig).workplane);
  const metadataConfig = asRecord(asRecord(agent?.metadata).workplane);
  const source = Object.keys(config).length ? config : metadataConfig;
  const configuredKind = text(source.kind).toLowerCase();
  const configuredRoleId = text(source.roleId).toLowerCase();
  const legacy = resolveLegacyWorkplaneIdentity(agent);
  const kind = VALID_KINDS.has(configuredKind) ? configuredKind : legacy.kind;
  const capabilities = stringList(source.capabilities);
  const assignableRoleIds = stringList(source.assignableRoleIds);
  const configuredMemoryAccess = text(source.memoryAccess).toLowerCase();
  const configuredReviewMode = text(source.reviewMode).toLowerCase();

  return {
    roleId: configuredRoleId || (kind ? kind : "unconfigured"),
    kind: kind || "unconfigured",
    capabilities: capabilities.length ? capabilities : defaultCapabilities(kind),
    assignableRoleIds: assignableRoleIds.length
      ? assignableRoleIds
      : kind === "lead" || kind === "hybrid"
        ? ["worker", "hybrid"]
        : [],
    memoryAccess: VALID_MEMORY_ACCESS.has(configuredMemoryAccess)
      ? configuredMemoryAccess
      : defaultMemoryAccess(kind),
    reviewMode: VALID_REVIEW_MODES.has(configuredReviewMode)
      ? configuredReviewMode
      : defaultReviewMode(),
    source: configuredKind || configuredRoleId || capabilities.length || assignableRoleIds.length || configuredMemoryAccess || configuredReviewMode
      ? "configured"
      : kind ? "legacy" : "unconfigured",
    legacyRoleId: legacy.legacyRoleId
  };
}

export function hasWorkplaneCapability(identityOrAgent, capability) {
  const identity = isResolvedWorkplaneIdentity(identityOrAgent)
    ? identityOrAgent
    : resolveAgentWorkplaneIdentity(identityOrAgent);
  return identity.capabilities.includes(capability);
}

export function canDelegateTo(ownerIdentityOrAgent, workerIdentityOrAgent) {
  const owner = isResolvedWorkplaneIdentity(ownerIdentityOrAgent)
    ? ownerIdentityOrAgent
    : resolveAgentWorkplaneIdentity(ownerIdentityOrAgent);
  const worker = isResolvedWorkplaneIdentity(workerIdentityOrAgent)
    ? workerIdentityOrAgent
    : resolveAgentWorkplaneIdentity(workerIdentityOrAgent);
  if (!hasWorkplaneCapability(owner, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) return false;
  if (!hasWorkplaneCapability(worker, WORKPLANE_CAPABILITIES.TASK_EXECUTE)) return false;
  const allowed = new Set(owner.assignableRoleIds);
  return allowed.has("*") || allowed.has(worker.roleId) || allowed.has(worker.kind);
}

export function isWorkplaneWorker(agent) {
  return hasWorkplaneCapability(agent, WORKPLANE_CAPABILITIES.TASK_EXECUTE);
}

export function isWorkplaneLead(agent) {
  return hasWorkplaneCapability(agent, WORKPLANE_CAPABILITIES.TASK_CREATE)
    && hasWorkplaneCapability(agent, WORKPLANE_CAPABILITIES.TASK_ASSIGN);
}

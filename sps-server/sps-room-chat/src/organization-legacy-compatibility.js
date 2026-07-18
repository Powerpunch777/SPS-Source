const LEGACY_LEAD_ROLE_IDS = new Set(["manager", "ceo", "designer", "cto"]);
const LEGACY_WORKER_ROLE_IDS = new Set([
  "code-worker",
  "qa-worker",
  "image-worker",
  "voice-worker",
  "document-worker",
  "art-worker"
]);
const LEGACY_WORKER_NAMES = new Set([
  "code worker",
  "qa worker",
  "image worker",
  "art worker",
  "voice worker",
  "document worker"
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function text(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function legacyRoleId(agent) {
  const config = asRecord(agent?.adapterConfig);
  const role = text(
    config.managedWorkplaneRole
    || config.workplaneRole
    || asRecord(agent?.metadata).managedWorkplaneRole
  ).toLowerCase();
  if (role) return role;

  const paperclipRole = text(agent?.role).toLowerCase();
  if (LEGACY_LEAD_ROLE_IDS.has(paperclipRole) || LEGACY_WORKER_ROLE_IDS.has(paperclipRole)) {
    return paperclipRole;
  }

  const name = text(agent?.name).toLowerCase().replace(/\s+/g, " ");
  return LEGACY_WORKER_NAMES.has(name) ? "legacy-worker" : "";
}

/**
 * Compatibility for installations created before the generic Workplane policy
 * existed. New organizations must use explicit `adapterConfig.workplane`.
 */
export function resolveLegacyWorkplaneIdentity(agent) {
  const roleId = legacyRoleId(agent);
  const kind = LEGACY_LEAD_ROLE_IDS.has(roleId)
    ? "lead"
    : LEGACY_WORKER_ROLE_IDS.has(roleId) || roleId === "legacy-worker"
      ? "worker"
      : "";
  return { kind, legacyRoleId: roleId || null };
}

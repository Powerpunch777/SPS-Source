import { types as utilTypes } from "node:util";
import path from "node:path";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PROJECT_ID = /^dev-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PATH_LENGTH = 32_000;
const CONTROL_BYTES = /[\u0000-\u001f\u007f]/;
const UNAVAILABLE_AGENT_STATUSES = new Set([
  "paused",
  "terminated",
  "pending_approval",
  "error",
]);
const AVAILABLE_AGENT_STATUSES = new Set(["active", "idle", "running"]);

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || utilTypes.isProxy(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDataValue(record, key) {
  if (!isPlainRecord(record)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor?.enumerable || !("value" in descriptor)) return undefined;
  return descriptor.value;
}

function requiredUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

function normalizedPath(value, platform) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_LENGTH || CONTROL_BYTES.test(value)) {
    return null;
  }

  if (platform === "win32") {
    if (/^(?:\\\\|\/\/)/.test(value) || !/^[a-z]:[\\/]/i.test(value)) return null;
    const normalized = path.win32.normalize(value);
    if (!path.win32.isAbsolute(normalized)) return null;
    const root = path.win32.parse(normalized).root;
    const withoutTrailingSeparators = normalized.length > root.length
      ? normalized.replace(/[\\/]+$/, "")
      : root;
    return withoutTrailingSeparators.toLowerCase();
  }

  if (!value.startsWith("/") || value.startsWith("//")) return null;
  const normalized = path.posix.normalize(value);
  if (!path.posix.isAbsolute(normalized)) return null;
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : "/";
}

function executionTargetUnsupported(agent) {
  const target = ownDataValue(agent, "executionTarget");
  if (target === undefined || target === null) return false;
  if (!isPlainRecord(target)) return true;
  const kind = ownDataValue(target, "kind");
  return kind !== "local";
}

function assessment(projectId, agentId, status) {
  return { schemaVersion: 1, projectId, agentId, status };
}

/**
 * Compares a configured Codex local working directory to the linked project
 * path lexically. It does not inspect the filesystem or prove runtime custody.
 */
export function assessDeveloperAgentFolder(input) {
  if (!isPlainRecord(input)) throw new TypeError("Developer Agent folder input must be a plain object.");
  const project = ownDataValue(input, "project");
  const agent = ownDataValue(input, "agent");
  const companyId = ownDataValue(input, "companyId");
  const agentId = ownDataValue(input, "agentId");
  const platformValue = ownDataValue(input, "platform");
  const platform = platformValue === undefined ? process.platform : platformValue;
  const projectId = ownDataValue(project, "id");

  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)
    || !requiredUuid(companyId) || !requiredUuid(agentId)) {
    throw new TypeError("Developer Agent folder identity is invalid.");
  }

  if (agent === undefined || agent === null) {
    return assessment(projectId, agentId, "unavailable");
  }
  if (!isPlainRecord(agent)
    || !requiredUuid(ownDataValue(agent, "id"))
    || !requiredUuid(ownDataValue(agent, "companyId"))) {
    throw new TypeError("Developer Agent folder identity is invalid.");
  }
  if (ownDataValue(agent, "id") !== agentId || ownDataValue(agent, "companyId") !== companyId) {
    throw new TypeError("Developer Agent folder identity does not match the requested scope.");
  }

  const agentStatus = ownDataValue(agent, "status");
  if (UNAVAILABLE_AGENT_STATUSES.has(agentStatus) || !AVAILABLE_AGENT_STATUSES.has(agentStatus)) {
    return assessment(projectId, agentId, "unavailable");
  }

  if (ownDataValue(agent, "adapterType") !== "codex_local" || executionTargetUnsupported(agent)) {
    return assessment(projectId, agentId, "unsupported");
  }

  const adapterConfig = ownDataValue(agent, "adapterConfig");
  const configuredCwd = ownDataValue(adapterConfig, "cwd");
  const projectPath = ownDataValue(project, "sourcePath");
  if (typeof configuredCwd !== "string" || configuredCwd.length === 0) {
    return assessment(projectId, agentId, "not-configured");
  }

  const normalizedProjectPath = normalizedPath(projectPath, platform);
  const normalizedConfiguredCwd = normalizedPath(configuredCwd, platform);
  if (!normalizedProjectPath || !normalizedConfiguredCwd) {
    return assessment(projectId, agentId, "not-configured");
  }

  return assessment(
    projectId,
    agentId,
    normalizedProjectPath === normalizedConfiguredCwd ? "configured-match" : "configured-different",
  );
}

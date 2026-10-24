import { DEVELOPER_PROJECT_PLUGIN_ID } from "./developer-project-context.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVELOPER_PROJECT_ID = /^dev-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set([
  "configured-match",
  "configured-different",
  "not-configured",
  "unsupported",
  "unavailable",
]);
const RESPONSE_KEYS = ["schemaVersion", "projectId", "agentId", "status"];
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function buildDeveloperAgentFolderCheckInput(scope, agentId) {
  if (!record(scope) || typeof scope.companyId !== "string" || !UUID.test(scope.companyId)
    || typeof scope.contextId !== "string" || !UUID.test(scope.contextId)
    || typeof agentId !== "string" || !UUID.test(agentId)) return null;

  return {
    context: {
      companyId: scope.companyId,
      pluginId: DEVELOPER_PROJECT_PLUGIN_ID,
      contextId: scope.contextId,
    },
    agentId,
  };
}

export function getDeveloperAgentFolderBridge(host) {
  if (!record(host) || typeof host.checkDeveloperAgentFolder !== "function") return null;

  return Object.freeze({
    check(scope, agentId) {
      const input = buildDeveloperAgentFolderCheckInput(scope, agentId);
      if (!input) throw new TypeError("A valid Workspace, conversation, and Lead are required.");
      return host.checkDeveloperAgentFolder(input);
    },
  });
}

export function normalizeDeveloperAgentFolderCheckResponse(value, expected) {
  if (!record(expected) || typeof expected.projectId !== "string" || !DEVELOPER_PROJECT_ID.test(expected.projectId)
    || typeof expected.agentId !== "string" || !UUID.test(expected.agentId)
    || !record(value) || !hasExactKeys(value, RESPONSE_KEYS) || value.schemaVersion !== 1
    || typeof value.projectId !== "string" || !DEVELOPER_PROJECT_ID.test(value.projectId)
    || typeof value.agentId !== "string" || !UUID.test(value.agentId)
    || !STATUSES.has(value.status)
    || value.projectId.toLowerCase() !== expected.projectId.toLowerCase()
    || value.agentId.toLowerCase() !== expected.agentId.toLowerCase()) return null;

  return {
    schemaVersion: 1,
    projectId: value.projectId,
    agentId: value.agentId,
    status: value.status,
  };
}

import { normalizeDeveloperValidationFeedback } from "./developer-validation-feedback.js";

export const DEVELOPER_PROJECT_PLUGIN_ID = "sps.plugin-discovery";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);

function safeLabel(value) {
  if (typeof value !== "string") return null;
  const label = value.trim();
  if (!label || label.length > 120 || /[\\/:\u0000-\u001f\u007f]/.test(label)) return null;
  return label;
}

export function buildDeveloperProjectContextInput(scope) {
  if (!record(scope) || typeof scope.companyId !== "string" || !UUID.test(scope.companyId)
    || typeof scope.contextId !== "string" || !UUID.test(scope.contextId)) return null;
  return {
    companyId: scope.companyId,
    pluginId: DEVELOPER_PROJECT_PLUGIN_ID,
    contextId: scope.contextId,
  };
}

export function getDeveloperProjectBridge(host) {
  if (!record(host) || typeof host.getDeveloperProjectContext !== "function"
    || typeof host.openDeveloperProjectContext !== "function") return null;

  return Object.freeze({
    get(scope) {
      const input = buildDeveloperProjectContextInput(scope);
      if (!input) throw new TypeError("A valid Workspace and conversation are required.");
      return host.getDeveloperProjectContext(input);
    },
    open(scope) {
      const input = buildDeveloperProjectContextInput(scope);
      if (!input) throw new TypeError("A valid Workspace and conversation are required.");
      return host.openDeveloperProjectContext(input);
    },
  });
}

export function normalizeDeveloperProjectContextResponse(value) {
  if (!record(value) || value.available !== true || typeof value.missingProject !== "boolean") return null;
  const hasFeedback = Object.hasOwn(value, "validationFeedback") && value.validationFeedback !== null;
  const validationFeedback = hasFeedback ? normalizeDeveloperValidationFeedback(value.validationFeedback) : undefined;
  const validationFeedbackState = !hasFeedback ? "absent" : validationFeedback ? "valid" : "invalid";
  const feedbackFields = { validationFeedbackState, ...(validationFeedback ? { validationFeedback } : {}) };
  if (value.project === null) {
    return { project: null, missingProject: value.missingProject, ...feedbackFields };
  }
  if (!record(value.project) || value.missingProject || typeof value.project.id !== "string"
    || !value.project.id || typeof value.project.verified !== "boolean") return null;

  const displayName = safeLabel(value.project.displayName);
  const sourceLabel = safeLabel(value.project.sourceLabel);
  if (!displayName || !sourceLabel) return null;
  return {
    project: { id: value.project.id, displayName, sourceLabel, verified: value.project.verified },
    missingProject: false,
    ...feedbackFields,
  };
}

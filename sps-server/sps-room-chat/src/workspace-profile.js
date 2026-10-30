import path from "node:path";
import { now } from "./room-state.js";

const WORKSPACE_PROFILE_VERSION = 1;
const TASK_TYPE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const DEFAULT_TASK_TYPE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "design", label: "Design" }),
  Object.freeze({ id: "documentation", label: "Documentation" }),
  Object.freeze({ id: "implementation", label: "Implementation" }),
  Object.freeze({ id: "qa", label: "Quality assurance" }),
  Object.freeze({ id: "art", label: "Art / assets" }),
  Object.freeze({ id: "voice", label: "Voice / audio" })
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function normalizedTaskTypeKey(value, fallback = "") {
  const key = String(value || "").trim().toLowerCase();
  return TASK_TYPE_KEY_PATTERN.test(key) ? key : fallback;
}

export function normalizedWorkspacePath(value) {
  return String(value || "").trim().replace(/[\\/]+$/g, "").toLowerCase();
}

export function workspaceLocalPath(workspace) {
  return String(workspace?.cwd ?? workspace?.path ?? "").trim();
}

export function displayTaskPath(value) {
  return String(value || "").trim().replace(/\\/g, "/");
}

export function normalizeTaskAffectedPaths(paths, workspace) {
  const workspaceRoot = displayTaskPath(workspaceLocalPath(workspace)).replace(/\/+$/g, "");
  const comparableRoot = workspaceRoot.toLowerCase();
  const normalized = [];
  const invalid = [];

  for (const requestedPath of paths) {
    const raw = String(requestedPath || "").trim();
    if (!raw) continue;
    const portable = displayTaskPath(raw);
    const isAbsolute = path.win32.isAbsolute(raw) || path.posix.isAbsolute(portable);
    let relative = portable;

    if (isAbsolute) {
      const comparablePath = portable.replace(/\/+$/g, "").toLowerCase();
      if (!comparableRoot || (comparablePath !== comparableRoot && !comparablePath.startsWith(`${comparableRoot}/`))) {
        invalid.push({ path: portable, reason: "outside_selected_workspace" });
        continue;
      }
      relative = comparablePath === comparableRoot ? "." : portable.slice(workspaceRoot.length + 1);
    }

    const segments = relative.split("/").filter(Boolean);
    if (segments.includes("..")) {
      invalid.push({ path: portable, reason: "parent_directory_not_allowed" });
      continue;
    }
    const canonical = segments.filter((segment) => segment !== ".").join("/") || ".";
    normalized.push(canonical);
  }

  return { paths: [...new Set(normalized)], invalid };
}

function workspaceIdMap(value, workspaceIds) {
  const result = {};
  for (const [key, rawWorkspaceId] of Object.entries(asRecord(value))) {
    const workspaceId = String(rawWorkspaceId || "").trim();
    if (key && workspaceIds.has(workspaceId)) result[key] = workspaceId;
  }
  return result;
}

function taskWorkspaceIdMap(value, workspaceIds) {
  const result = {};
  for (const [key, rawWorkspaceId] of Object.entries(asRecord(value))) {
    const taskType = normalizedTaskTypeKey(key);
    const workspaceId = String(rawWorkspaceId || "").trim();
    if (taskType && workspaceIds.has(workspaceId)) result[taskType] = workspaceId;
  }
  return result;
}

function normalizeWorkspaceTaskTypes(value, taskWorkspaceIds, { useDefaults = true } = {}) {
  const result = new Map();
  const configured = Array.isArray(value) ? value : null;
  const source = configured ?? (useDefaults ? DEFAULT_TASK_TYPE_DEFINITIONS : []);
  for (const entry of source) {
    const taskType = normalizedTaskTypeKey(asRecord(entry).id ?? entry);
    if (!taskType || result.has(taskType)) continue;
    const label = textParam(asRecord(entry), "label") || taskType;
    result.set(taskType, { id: taskType, label: label.slice(0, 80) });
  }
  for (const taskType of Object.keys(asRecord(taskWorkspaceIds))) {
    const key = normalizedTaskTypeKey(taskType);
    if (key && !result.has(key)) result.set(key, { id: key, label: key });
  }
  return [...result.values()];
}

export function normalizeWorkspaceProfile(value, workspaces = []) {
  const source = asRecord(value);
  const workspaceIds = new Set((Array.isArray(workspaces) ? workspaces : []).map((workspace) => String(workspace?.id || "")).filter(Boolean));
  const requestedDefault = textParam(source, "defaultWorkspaceId");
  const primaryWorkspaceId = (Array.isArray(workspaces) ? workspaces : []).find((workspace) => workspace?.isPrimary)?.id ?? null;
  const defaultWorkspaceId = workspaceIds.has(requestedDefault)
    ? requestedDefault
    : (primaryWorkspaceId && workspaceIds.has(primaryWorkspaceId) ? primaryWorkspaceId : [...workspaceIds][0] ?? null);
  const taskWorkspaceIds = taskWorkspaceIdMap(source.taskWorkspaceIds, workspaceIds);
  return {
    version: WORKSPACE_PROFILE_VERSION,
    defaultWorkspaceId,
    agentWorkspaceIds: workspaceIdMap(source.agentWorkspaceIds, workspaceIds),
    taskWorkspaceIds,
    taskTypes: normalizeWorkspaceTaskTypes(source.taskTypes, taskWorkspaceIds, {
      useDefaults: !Array.isArray(source.taskTypes)
    }),
    updatedAt: textParam(source, "updatedAt") || null,
    configured: Boolean(source.configured)
  };
}

export function profileWorkspace(workspaces, profile, { agentId = "", taskType = "", requestedWorkspaceId = "" } = {}) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  if (asRecord(profile).configured !== true) return null;
  const requested = byId.get(requestedWorkspaceId);
  if (requested) return requested;
  const agentWorkspaceId = textParam(asRecord(profile).agentWorkspaceIds, agentId);
  if (agentWorkspaceId && byId.has(agentWorkspaceId)) return byId.get(agentWorkspaceId);
  const taskWorkspaceId = textParam(asRecord(profile).taskWorkspaceIds, normalizedTaskTypeKey(taskType));
  if (taskWorkspaceId && byId.has(taskWorkspaceId)) return byId.get(taskWorkspaceId);
  const defaultWorkspaceId = textParam(profile, "defaultWorkspaceId");
  return defaultWorkspaceId && byId.has(defaultWorkspaceId) ? byId.get(defaultWorkspaceId) : null;
}

function profileTaskWorkspace(workspaces, profile, { taskType = "", requestedWorkspaceId = "" } = {}) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  if (asRecord(profile).configured !== true) return null;
  const requested = byId.get(requestedWorkspaceId);
  if (requested) return requested;
  const taskWorkspaceId = textParam(asRecord(profile).taskWorkspaceIds, normalizedTaskTypeKey(taskType));
  return taskWorkspaceId && byId.has(taskWorkspaceId) ? byId.get(taskWorkspaceId) : null;
}

export function defaultWorkspaceKindForAgent(agent) {
  const identity = `${agent?.role || ""} ${agent?.name || ""}`.toLowerCase();
  if (/(art|image|voice)/.test(identity)) return "asset";
  if (/(designer|design|manager|document)/.test(identity)) return "design";
  return "implementation";
}

export function workspaceKindForProjectWorkspace(workspace) {
  const name = String(workspace?.name || "").toLowerCase();
  const localPath = normalizedWorkspacePath(workspaceLocalPath(workspace));
  const pathName = localPath.split(/[\\/]/).filter(Boolean).at(-1) || "";
  const identity = `${name} ${pathName}`;
  if (/(implementation|unity|unreal|source|code|build|app|server|client)/.test(identity)) return "implementation";
  if (/(asset|art|audio|voice)/.test(identity)) return "asset";
  if (/(design|obsidian|research|reference|spec|docs?)/.test(identity)) return "design";
  if (/(shared|common|library|knowledge)/.test(identity)) return "shared";
  return "implementation";
}

function workspaceKindForTaskType(taskType) {
  if (["design", "documentation"].includes(taskType)) return "design";
  if (["art", "voice"].includes(taskType)) return "asset";
  return "implementation";
}

export function taskTypeAllowsNoAffectedPaths(taskType) {
  return ["design", "documentation"].includes(normalizedTaskTypeKey(taskType));
}

export function chooseTaskWorkspace(workspaces, taskType, requestedWorkspaceId, profile = null, assigneeAgentId = "") {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const configured = profileTaskWorkspace(workspaces, profile, { agentId: assigneeAgentId, taskType, requestedWorkspaceId });
  if (configured) return configured;
  const kind = workspaceKindForTaskType(taskType);
  const requested = requestedWorkspaceId
    ? workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ?? null
    : null;
  const preferred = workspaces.find((workspace) => workspaceKindForProjectWorkspace(workspace) === kind) ?? null;
  const requestedKind = requested ? workspaceKindForProjectWorkspace(requested) : null;
  if (requested && (requestedKind === kind || (kind === "asset" && requestedKind === "implementation"))) return requested;
  const implementationFallback = kind === "asset"
    ? workspaces.find((workspace) => workspaceKindForProjectWorkspace(workspace) === "implementation") ?? null
    : null;
  return preferred
    ?? implementationFallback
    ?? profileWorkspace(workspaces, profile, { agentId: "", taskType: "", requestedWorkspaceId: "" })
    ?? workspaces.find((workspace) => workspace.isPrimary)
    ?? workspaces[0];
}

export function workspaceBinding(workspace) {
  if (!workspace?.id) return null;
  return {
    projectWorkspaceId: workspace.id,
    name: String(workspace.name || "Workspace"),
    kind: workspaceKindForProjectWorkspace(workspace),
    boundAt: now()
  };
}

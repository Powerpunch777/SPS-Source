import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import manifest from "./manifest.js";
import { CodexAppServerClient, getAgentText } from "./codex-app-server-client.js";
import { AgyRoomClient } from "./agy-room-client.js";
import { WORKPLANE_CAPABILITIES, canDelegateTo, hasWorkplaneCapability, isWorkplaneWorker, resolveAgentWorkplaneIdentity } from "./organization-policy.js";
import { listOrganizationTemplates, resolveOrganizationTemplate } from "./organization-templates.js";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOM_STATE_KEY = "ROOM_STATE";
const ROOM_WORK_STATE_KEY = "ROOM_WORK_STATE";
const ROOM_CHECKPOINTS_KEY = "ROOM_CHECKPOINTS";
const ROOM_NATIVE_COMPACTIONS_KEY = "ROOM_NATIVE_COMPACTIONS";
const TASK_ROOM_STATE_KEY = "TASK_ROOM_STATE";
// Historical role Rooms are detected and retired only; no new Room uses them.
const ROOM_PREFIX = "[Agent Room] ";
const PROVISIONED_ROOM_ORIGIN = "plugin:local.room-chat:project-room-provisioning";
const PROVISIONED_AGENT_ROOM_ORIGIN = "plugin:local.room-chat:agent-room-provisioning";
const AGENT_ROOM_OPERATION_ORIGIN = "plugin:local.room-chat:operation:agent-room";
const ROOM_JOB_ENTITY_TYPE = "room_job";
const WORKSPACE_PROFILE_ENTITY_TYPE = "workspace_profile";
const WORKSPACE_PROFILE_EXTERNAL_ID = "workplane-workspace-profile-v1";
const WORKSPACE_PROFILE_VERSION = 1;
// These are compatibility defaults, not a closed workflow taxonomy. A Project
// profile can replace them with its own task-type keys and workspace routes.
const DEFAULT_TASK_TYPE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "design", label: "Design" }),
  Object.freeze({ id: "documentation", label: "Documentation" }),
  Object.freeze({ id: "implementation", label: "Implementation" }),
  Object.freeze({ id: "qa", label: "Quality assurance" }),
  Object.freeze({ id: "art", label: "Art / assets" }),
  Object.freeze({ id: "voice", label: "Voice / audio" })
]);
const TASK_TYPE_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const ACTIVE_ROOM_JOB_STATUSES = new Set(["queued", "starting", "working"]);
const ROOM_ATTACHMENT_CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const ROOM_CONTEXT_RECOVERY_COMMENT_LIMIT = 120;
const ROOM_CONTEXT_RECOVERY_CHAR_LIMIT = 60000;
const ROOM_CONTEXT_RECOVERY_ENTRY_LIMIT = 5000;
const LOCAL_MEMORY_SIDECAR_CONFIG_URL = new URL("../../memory-sidecar/config.local.json", import.meta.url);
const ROOM_MEMORY_SCOPES = new Set(["company", "project", "agent"]);
const ROOM_WAITING_KINDS = new Set(["none", "user", "worker", "environment", "task_review"]);
const ROOM_READY_STATUS = "todo";
const TERMINAL_STATUSES = new Set(["done", "blocked", "cancelled"]);
const ACTIVE_TASK_STATUSES = new Set(["backlog", "todo", "pending", "queued", "running", "in_progress", "in_review"]);
const TASK_WORKER_RETRY_STOP_STATUSES = new Set(["in_review", "done", "cancelled"]);
const TASK_STATUS_ORDER = new Map([["in_progress", 0], ["todo", 1], ["backlog", 2], ["in_review", 3], ["blocked", 4], ["done", 5], ["cancelled", 6]]);
const TASK_MATURITY_LEVELS = new Set(["exploration", "prototype", "committed implementation"]);
const TASK_OWNER_REPORT_STATUSES = new Set(["in_review", "blocked"]);
const PROVIDER_QUOTA_ERROR_CODE = "provider_quota";
// Provider limits are a visible blocker, not a background work queue. The
// owner decides when a blocked Task or Room turn should be attempted again.
const AUTOMATIC_PROVIDER_QUOTA_RETRY_ENABLED = false;
const ROOM_CHAT_TEST_MODE = process.env.SPS_ROOM_CHAT_TEST === "1" || process.env.PAPERCLIP_ROOM_CHAT_TEST === "1";
const PROVIDER_QUOTA_RETRY_INTERVAL_MS = ROOM_CHAT_TEST_MODE ? 50 : 30 * 60 * 1000;
const TASK_ROOM_EXECUTION_POLICY = Object.freeze({
  mode: "normal",
  commentRequired: true,
  stages: [],
  failure: Object.freeze({
    automaticRetry: false,
    preserveAssignee: true,
    wakeRecoveryOwner: false
  })
});
// A Worker may post its report successfully but miss the immediately following
// status update. Normalize only active execution states; never wake parked work.
const TASK_WORKER_DISPOSITION_PENDING_STATUSES = new Set(["todo", "pending", "queued", "running", "in_progress"]);
// Adapter/runtime failures can occur before a Worker is able to submit its own
// blocker report. Treat those as a Worker-capacity block, never as manager work.
const TASK_WORKER_RUNTIME_RECOVERY_CAUSES = new Set(["stranded_assigned_issue", "workspace_validation_failed", "configuration_incomplete"]);
const LEGACY_PROJECT_ROOM_ROLES = Object.freeze([]);
const CODEX_ROOM_SANDBOXES = new Set(["read-only", "workspace-write", "danger-full-access"]);
const CODEX_ROOM_APPROVAL_POLICIES = new Set(["untrusted", "on-request", "never"]);
const ROOM_MESSAGE_MODES = new Set(["agent", "plan", "ask"]);
const roomLocks = new Map();
const projectRoomLocks = new Map();
const roomDocumentWriteLocks = new Map();
const activeThreadContexts = new Map();
const nativeCompactionLocks = new Map();
const manualCodexCompactionThreads = new Set();
const recordedNativeCompactionEvents = new Set();
const activeRoomMessageJobs = new Map();
const activeTaskOwnerReports = new Map();
const processedTaskOwnerReportEvents = new Set();
const activeWorkerRuntimeRecoveries = new Map();
let activeTaskOwnerBoundaryReconcile = null;
let activeProviderQuotaReconcile = null;
let activeRoomQuotaRetryReconcile = null;
let pluginCtx = null;
const codexClients = new Map();
let testCodexClient = null;
let testAgyClientFactory = null;

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  return value === undefined || value === null ? fallback : String(value).trim();
}

function rawTextParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  return value === undefined || value === null ? fallback : String(value);
}

function listParam(params, key) {
  const value = asRecord(params)[key];
  return Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : [];
}

function normalizedTaskTypeKey(value, fallback = "") {
  const key = String(value || "").trim().toLowerCase();
  return TASK_TYPE_KEY_PATTERN.test(key) ? key : fallback;
}

function configuredEnvironmentValue(agent, name) {
  const value = asRecord(asRecord(agent?.adapterConfig).env)[name];
  if (typeof value === "string") return value.trim();
  return textParam(asRecord(value), "value");
}

function configuredEnvironment(agent) {
  const env = {};
  for (const [key, raw] of Object.entries(asRecord(asRecord(agent?.adapterConfig).env))) {
    const value = typeof raw === "string" ? raw.trim() : textParam(asRecord(raw), "value");
    if (value) env[key] = value;
  }
  return env;
}

function normalizeCodexHome(value) {
  const source = String(value || "").trim();
  if (!source) return "";
  try {
    return path.resolve(source).replace(/[\\/]+$/, "").toLowerCase();
  } catch {
    return source.replace(/[\\/]+$/, "").toLowerCase();
  }
}

function codexAccountLabel(directoryName) {
  const name = String(directoryName || "").trim();
  if (name === ".codex") return "Default Codex account";
  const suffix = name.replace(/^\.codex-?/, "").replace(/[-_]+/g, " ").trim();
  if (!suffix) return "Codex account";
  return `${suffix.replace(/\b\w/g, (character) => character.toUpperCase())} Codex account`;
}

function localCodexAccounts(homeDirectory = os.homedir()) {
  const root = path.resolve(homeDirectory);
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && (entry.name === ".codex" || entry.name.startsWith(".codex-")))
    .map((entry) => {
      const accountHome = path.join(root, entry.name);
      return {
        id: `codex-home:${entry.name}`,
        label: codexAccountLabel(entry.name),
        directoryName: entry.name,
        home: accountHome,
        hasAuth: fs.existsSync(path.join(accountHome, "auth.json"))
      };
    })
    .filter((account) => account.hasAuth)
    .sort((left, right) => left.directoryName === ".codex" ? -1 : right.directoryName === ".codex" ? 1 : left.label.localeCompare(right.label));
}

function applyCodexAccountToAdapterConfig(agent, account) {
  const adapterConfig = asRecord(agent?.adapterConfig);
  const existingEnv = asRecord(adapterConfig.env);
  return {
    ...adapterConfig,
    codexAccount: account.directoryName,
    env: {
      ...existingEnv,
      CODEX_HOME: { type: "plain", value: account.home }
    }
  };
}

function codexRoomSandbox(value) {
  const normalized = String(value || "").trim();
  return CODEX_ROOM_SANDBOXES.has(normalized) ? normalized : "danger-full-access";
}

function codexRoomApprovalPolicy(value) {
  const normalized = String(value || "").trim();
  return CODEX_ROOM_APPROVAL_POLICIES.has(normalized) ? normalized : "never";
}

function codexTurnSandboxPolicy(sandbox) {
  if (sandbox === "read-only") return { type: "readOnly", networkAccess: false };
  if (sandbox === "workspace-write") return { type: "workspaceWrite", networkAccess: false, writableRoots: [] };
  return { type: "dangerFullAccess" };
}

function roomMessageMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ROOM_MESSAGE_MODES.has(normalized) ? normalized : "agent";
}

function roomMessageModeLabel(value) {
  const mode = roomMessageMode(value);
  return mode === "ask" ? "Ask mode" : mode === "plan" ? "Plan mode" : "Agent mode";
}

function roomModeInstruction(value) {
  const mode = roomMessageMode(value);
  if (mode === "ask") {
    return "ASK MODE: Answer, explain, or review only. Do not edit files, run mutating commands, create or modify Tasks, save memory, or call SPS tools. State any information you cannot answer from the current Room context.";
  }
  if (mode === "plan") {
    return "PLAN MODE: Inspect the available context and produce a concrete plan only. Do not edit files, run mutating commands, create or modify Tasks, or save memory. You may use read-only SPS context tools when necessary.";
  }
  return "AGENT MODE: Work within your AGENTS.md role rules. Use SPS tools directly only when the user has authorized the relevant action.";
}

function roomModeSandbox(runtime, mode) {
  return roomMessageMode(mode) === "agent" ? runtime?.sandbox || "danger-full-access" : "read-only";
}

function isWorkerOnlyRoomAgent(agent) {
  return resolveAgentWorkplaneIdentity(agent).kind === "worker";
}

function roomWorkplaneBoundary(agent) {
  const identity = resolveAgentWorkplaneIdentity(agent);
  if (identity.kind !== "worker") return "";
  return [
    "LONG-LIVED WORKER ROOM BOUNDARY.",
    "This is a durable conversation and read-only context Room, not an assigned Task Room.",
    "You may answer questions, inspect available context, clarify scope, and propose an implementation or asset plan.",
    "Do not modify repository or workspace files, generate or publish production assets, run builds or mutating automation, call external production services, or perform implementation work from this Room.",
    "Do not create, assign, reassign, review, or complete Tasks. When asked to carry out production work, state that a Lead must first create and assign a finite Task, then wait for that Task Room."
  ].join(" ");
}

function roomRuntimeWithRoomSafety(agent, runtime) {
  if (!isWorkerOnlyRoomAgent(agent)) return runtime;
  if (runtime?.kind === "agy_print") return { ...runtime, sandbox: true };
  return { ...runtime, sandbox: "read-only", approvalPolicy: "never" };
}

function isRoomCliRuntimeAgent(agent) {
  const adapterType = textParam(agent, "adapterType");
  return adapterType === "codex_local" || adapterType === "antigravity_local";
}

function effectiveRoomMessageMode(agent, requestedMode = "agent") {
  return isWorkerOnlyRoomAgent(agent) ? "ask" : roomMessageMode(requestedMode);
}

function workerRoomSandboxDirectory(companyId, issue, agent) {
  const source = [companyId, issue?.projectId, issue?.id, agent?.id].map((value) => String(value || "")).join("\u0000");
  const key = createHash("sha256").update(source).digest("hex").slice(0, 32);
  const directory = path.join(os.homedir(), ".sps", "workplane-room-sandboxes", key);
  fs.mkdirSync(directory, { recursive: true });
  return directory;
}

function roomModeAllowsTool(mode, toolName) {
  const normalized = roomMessageMode(mode);
  if (normalized === "agent") return true;
  if (normalized === "ask") return false;
  return new Set([
    "paperclip.memory_search",
    "paperclip.list_active_tasks",
    "paperclip.list_workers",
    "paperclip.preview_task",
    "paperclip.get_task_context"
  ]).has(toolName);
}

function agentRoomRuntime(runtime, agent) {
  const adapterConfig = asRecord(agent?.adapterConfig);
  if (textParam(agent, "adapterType") === "antigravity_local") {
    return {
      kind: "agy_print",
      enabled: runtime.enableAgyRooms,
      command: textParam(adapterConfig, "command", "agy"),
      model: textParam(adapterConfig, "model", "auto") || "auto",
      sandbox: adapterConfig.sandbox === true,
      timeoutMs: Math.max(0, Number(adapterConfig.timeoutSec) || 0) * 1000,
      extraArgs: Array.isArray(adapterConfig.extraArgs) ? adapterConfig.extraArgs : [],
      env: configuredEnvironment(agent)
    };
  }
  return {
    kind: "codex_app_server",
    enabled: runtime.enableCodexRooms,
    command: runtime.command,
    model: textParam(adapterConfig, "model", "") || runtime.model,
    reasoningEffort: textParam(adapterConfig, "modelReasoningEffort", textParam(adapterConfig, "reasoningEffort", "")) || null,
    codexHome: runtime.codexHome,
    sandbox: runtime.codexSandbox,
    approvalPolicy: runtime.codexApprovalPolicy
  };
}

function defaultAgyCommand() {
  const installed = path.join(os.homedir(), "AppData", "Local", "agy", "bin", "agy.exe");
  return fs.existsSync(installed) ? installed : "agy";
}

function roomRuntimeDisabledResult(agentRuntime) {
  return {
    ok: false,
    code: `${agentRuntime.kind}_rooms_disabled`,
    message: agentRuntime.kind === "agy_print"
      ? "Agy Room runtime is disabled. Enable it before sending a live Worker Room message."
      : "Codex Room runtime is disabled. Configure and enable it before sending a live message."
  };
}

function resolveCodexHomeForAgent(runtime, agent) {
  const configuredAccount = textParam(asRecord(agent?.adapterConfig), "codexAccount");
  if (/^\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(configuredAccount)) {
    return path.join(os.homedir(), configuredAccount);
  }
  return configuredEnvironmentValue(agent, "CODEX_HOME") || runtime.codexHome || textParam(process.env, "CODEX_HOME") || null;
}

function codexClientKey(runtime, agent) {
  return JSON.stringify({ command: runtime.command, codexHome: resolveCodexHomeForAgent(runtime, agent) });
}

function roomThreadIdForCodexRuntime(state, runtime, agent, currentInstructionsFingerprint = agentInstructionsFingerprint(agent)) {
  const threadId = textParam(state?.runtime, "codexThreadId") || null;
  if (!threadId) return null;
  const previousInstructionsFingerprint = textParam(state?.runtime, "instructionsFingerprint") || null;
  if (!previousInstructionsFingerprint || previousInstructionsFingerprint !== currentInstructionsFingerprint) return null;
  const previousAccountKey = textParam(state?.runtime, "codexAccountKey") || null;
  const selectedAccountKey = codexClientKey(runtime, agent);
  const hasExplicitHome = Boolean(resolveCodexHomeForAgent(runtime, agent));
  if (previousAccountKey && previousAccountKey !== selectedAccountKey) return null;
  if (!previousAccountKey && hasExplicitHome) return null;
  return threadId;
}

function roomMemoryRuntime() {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(LOCAL_MEMORY_SIDECAR_CONFIG_URL, "utf8"));
  } catch {
    throw new Error("The local Memory Sidecar companion configuration is unavailable.");
  }
  const host = String(config?.server?.host || "127.0.0.1").trim();
  const port = Number(config?.server?.port || 3188);
  const baseUrl = new URL(`http://${host}:${port}`);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(baseUrl.hostname)) {
    throw new Error("The local Memory Sidecar must use a loopback address.");
  }
  return {
    baseUrl,
    token: String(process.env.MEMORY_SIDECAR_TOKEN || config?.security?.token || "").trim()
  };
}

async function fetchRoomMemory(pathname, options = {}) {
  const runtime = roomMemoryRuntime();
  const url = new URL(pathname, runtime.baseUrl);
  for (const [key, value] of Object.entries(asRecord(options.searchParams))) {
    if (value !== undefined && value !== null && String(value).trim() !== "") url.searchParams.set(key, String(value));
  }
  const headers = { accept: "application/json", ...asRecord(options.headers) };
  if (runtime.token) headers["x-sidecar-token"] = runtime.token;
  const response = await fetch(url, { method: options.method ?? "GET", headers, body: options.body });
  const body = await response.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new Error("The Memory Sidecar returned an invalid response.");
  }
  if (!response.ok) throw new Error(`Memory Sidecar request failed (HTTP ${response.status}).`);
  return data;
}

async function searchRoomMemory(roomContext, query, requestedScopes, limit) {
  const scopes = requestedScopes.length ? requestedScopes : ["company", "project", "agent"];
  const selectedScopes = [...new Set(scopes.filter((scope) => ROOM_MEMORY_SCOPES.has(scope)))];
  if (!selectedScopes.length) throw new Error("Choose one or more of company, project, or agent memory scopes.");
  const itemsById = new Map();
  for (const scope of selectedScopes) {
    if (scope === "project" && !roomContext.projectId) continue;
    const searchParams = { q: query, scope, companyId: roomContext.companyId, limit };
    if (scope === "project") searchParams.projectId = roomContext.projectId;
    if (scope === "agent") searchParams.agentId = roomContext.agentId;
    const result = await fetchRoomMemory("/memory/search", { searchParams });
    for (const item of Array.isArray(result?.items) ? result.items : []) itemsById.set(item.id, item);
  }
  return [...itemsById.values()]
    .sort((left, right) => Number(right.score || 0) - Number(left.score || 0))
    .slice(0, limit);
}

async function proposeRoomMemory(roomContext, input) {
  const content = textParam(input, "content");
  const scope = textParam(input, "scope", "project") || "project";
  if (!content || content.length > 4000) throw new Error("Memory candidate content must be between 1 and 4000 characters.");
  if (!new Set(["company", "project", "agent", "task", "artifact", "user"]).has(scope)) throw new Error("Invalid memory candidate scope.");
  const candidate = await fetchRoomMemory("/memory/candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content,
      scope,
      type: textParam(input, "type", "learning") || "learning",
      tags: listParam(input, "tags").slice(0, 12),
      companyId: roomContext.companyId,
      projectId: roomContext.projectId ?? null,
      agentId: roomContext.agentId,
      issueId: roomContext.issueId,
      source: { kind: "room_chat", roomIssueId: roomContext.issueId, agentName: roomContext.agentName }
    })
  });
  return candidate?.candidate ?? null;
}

function agentRoomOriginId(projectId, agentId) {
  return `project:${projectId}:agent-room:${agentId}`;
}

function agentRoomAgentId(issue) {
  if (![PROVISIONED_AGENT_ROOM_ORIGIN, AGENT_ROOM_OPERATION_ORIGIN].includes(issue?.originKind)) return null;
  const match = String(issue.originId || "").match(/^project:[^:]+:agent-room:(.+)$/);
  return match?.[1] || null;
}

function isAgentRoom(issue) {
  return Boolean(
    agentRoomAgentId(issue) &&
    !issue?.parentId &&
    !issue?.assigneeAgentId &&
    !issue?.assigneeUserId
  );
}

function isLegacyRoleRoom(issue) {
  const legacyOrigin = issue?.originKind === "plugin:local.room-chat:project-room-provisioning"
    || /^project:[^:]+:role-room:/i.test(String(issue?.originId || ""));
  return Boolean(legacyOrigin && !issue?.parentId && !issue?.assigneeAgentId && !issue?.assigneeUserId);
}

function isLongLivedRoom(issue) {
  return isAgentRoom(issue) || isLegacyRoleRoom(issue);
}

function isHiredAgent(agent) {
  const builtIn = asRecord(asRecord(agent?.metadata).paperclipBuiltInAgent);
  return Boolean(
    agent?.id &&
    agent?.name &&
    agent.status !== "terminated" &&
    !textParam(builtIn, "key")
  );
}

function managedAgentRoleId(agent) {
  const match = loadAgentInstructions(agent).match(/<!--\s*PAPERCLIP ROLE:\s*([a-z0-9-]+)\s*-->/i);
  return match?.[1]?.toLowerCase() ?? "";
}

function isTaskWorkerAgent(agent) {
  return isHiredAgent(agent) && isWorkplaneWorker(agent);
}

function agentWorkingDirectory(agent) {
  return textParam(asRecord(agent?.adapterConfig), "cwd");
}

function agentInstructionsPath(agent) {
  const instructionsPath = textParam(asRecord(agent?.adapterConfig), "instructionsFilePath");
  return instructionsPath && path.isAbsolute(instructionsPath) ? instructionsPath : "";
}

function loadAgentInstructions(agent) {
  const path = agentInstructionsPath(agent);
  if (!path || !fs.existsSync(path)) {
    return "No managed Agent AGENTS.md was available. Ask the user to configure this Agent's Instructions before making policy decisions.";
  }
  try {
    const body = fs.readFileSync(path, "utf8").trim();
    return body || "The managed Agent AGENTS.md is empty.";
  } catch {
    return "The managed Agent AGENTS.md could not be read. Report this blocker before making policy decisions.";
  }
}

function agentInstructionsFingerprint(agent, instructions = loadAgentInstructions(agent)) {
  return createHash("sha256")
    .update(JSON.stringify({
      version: 1,
      agentId: textParam(agent, "id"),
      agentName: textParam(agent, "name"),
      agentRole: textParam(agent, "role"),
      instructions
    }), "utf8")
    .digest("hex");
}

function roomRole(issue) {
  if (!issue?.title?.startsWith(ROOM_PREFIX)) return null;
  const role = issue.title.slice(ROOM_PREFIX.length).trim();
  return role || null;
}

function roleRoomTitle(role) {
  return `${ROOM_PREFIX}${role}`;
}

function roleRulesSlug(role) {
  return String(role || "role").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "role";
}

function roleRulesScope(companyId, role) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: "role-agents-md",
    stateKey: roleRulesSlug(role)
  };
}

function defaultRoleAgentsMd(role) {
  const rules = {
    "Manager": `# Manager Role Rules

## Scope

Maintain a clear project plan, task order, milestones, and decision log for the user. Work from approved design artifacts and visible SPS status.

## Rules

- Do not invent product, scope, or schedule decisions outside the current Room objective and approved artifacts.
- Within that boundary, decide task order and delegate finite work when the configured Workplane policy permits it.
- When creating or changing a Task, state its owner, goal, dependency, and review point.
- Surface risks, blockers, and conflicting priorities instead of silently resolving them.
- Keep durable plans and decisions in the project's design repository; keep live discussion in the Room.
`,
    "CTO": `# CTO Role Rules

## Scope

Translate an explicitly approved design into a safe implementation plan and finite Worker Tasks.

## Rules

- Read the relevant design reference before planning implementation.
- Check active SPS Tasks and declared affected paths before creating work.
- Split work by ownership and sequence overlapping files, assets, maps, or modules.
- Every implementation Task needs scope, design reference, affected paths, acceptance criteria, and verification.
- Do not edit production files while acting as CTO unless the user explicitly assigns that implementation work to this role.
- Report a completed plan or a blocker to the user in the originating Room.
`,
    "Designer": `# Designer Role Rules

## Scope

Own game-design documents, UX flows, system specifications, and explicit design decisions in the project's design repository.

## Rules

- Clarify the player's goal, controls, feedback, edge cases, and acceptance criteria.
- Store reviewed design work in the project's design repository according to its stated structure.
- When implementation is useful before formal design is complete, state the uncertainty and use an explicit exploration or prototype Task maturity.
- Hand CTO a precise design reference, constraints, acceptance criteria, and known affected areas.
- Mark assumptions and unresolved choices clearly for user review.
`,
    "Code Worker": `# Code Worker Role Rules

## Scope

Implement only the assigned finite Task in the implementation repository.

## Rules

- Read the Task Room protocol, approved design reference, and current Task comments before editing.
- Change only declared paths and closely necessary support files; report any scope expansion before doing it.
- Do not edit binary engine assets as text.
- Preserve unrelated local work and do not resolve merge conflicts outside the assigned scope.
- Run the Task's requested validation where possible.
- End with a Task Room report listing changed files, validation, remaining risks, and blockers.
`,
    "Art Worker": `# Art Worker Role Rules

## Scope

Produce or prepare only the art assets requested by an assigned finite Task.

## Rules

- Read the Task Room and the relevant design reference before working.
- Keep source art, generated assets, import settings, naming, scale, and target engine paths explicit.
- Do not modify unrelated maps, binary assets, or project-wide visual settings.
- Record the source, output paths, import steps, licensing constraints, and validation performed in the Task Room.
- Escalate missing visual direction, unavailable specialist APIs, or incompatible asset formats before proceeding.
`,
    "Voice Worker": `# Voice Worker Role Rules

## Scope

Prepare voice direction, generated voice assets, and integration notes only for the assigned finite Task.

## Rules

- Use the approved script, character direction, language, and delivery requirements.
- Treat external voice-service credentials and terms as operator-managed; never expose them in comments or files.
- Report output files, formats, sample rate, naming, usage restrictions, and integration steps.
- Do not change unrelated audio settings, dialogue content, or gameplay behavior.
- Escalate missing permissions, voice direction, or service availability before producing final assets.
`,
    "QA Worker": `# QA Worker Role Rules

## Scope

Verify an assigned Task or build and provide evidence-based results.

## Rules

- Start from the Task acceptance criteria and requested verification steps.
- Report reproduction steps, expected result, actual result, severity, environment, and evidence for each defect.
- Remain read-only unless the Task explicitly authorizes an exact correction.
- Do not mark work approved or done; successful results go to user review.
- State untested areas, unavailable environments, and any limits of the evidence.
`
  };
  return rules[role] ?? `# ${role || "Role"} Rules

- Work only within the assigned role, explicit user decisions, and the Task or Room contract.
- Report completion and blockers in SPS.
`;
}

async function loadRoleAgentsMd(ctx, companyId, role) {
  const fallback = {
    version: 1,
    role,
    body: defaultRoleAgentsMd(role),
    updatedAt: null,
    isDefault: true,
    persisted: false
  };
  if (!ctx.state?.get) return fallback;
  const stored = asRecord(await ctx.state.get(roleRulesScope(companyId, role)));
  const body = rawTextParam(stored, "body").trim();
  if (!body) return fallback;
  return {
    version: Number(stored.version) || 1,
    role,
    body,
    updatedAt: textParam(stored, "updatedAt") || null,
    isDefault: stored.isDefault === true,
    persisted: true
  };
}

async function ensureRoleAgentsMd(ctx, companyId, role) {
  const rule = await loadRoleAgentsMd(ctx, companyId, role);
  if (rule.persisted || !ctx.state?.set) return rule;
  await ctx.state.set(roleRulesScope(companyId, role), {
    version: rule.version,
    role,
    body: rule.body,
    updatedAt: null,
    isDefault: true
  });
  return rule;
}

function isProvisionedRoleRoom(issue) {
  const role = roomRole(issue);
  return Boolean(
    role &&
    LEGACY_PROJECT_ROOM_ROLES.includes(role) &&
    !issue?.parentId &&
    !issue?.assigneeAgentId &&
    !issue?.assigneeUserId
  );
}

function queueProjectRoomProvision(projectId, work) {
  const previous = projectRoomLocks.get(projectId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  projectRoomLocks.set(projectId, current.catch(() => {}));
  return current;
}

async function provisionProjectRoleRooms(ctx, companyId, projectId) {
  if (!companyId || !projectId) throw new Error("companyId and projectId are required to provision Role Rooms.");
  return queueProjectRoomProvision(projectId, async () => {
    const issues = await ctx.issues.list({ companyId, projectId, limit: 200 });
    const existingTitles = new Set(issues
      .filter((issue) => !issue.parentId && !issue.assigneeAgentId && !issue.assigneeUserId)
      .map((issue) => issue.title));
    const created = [];
    for (const role of LEGACY_PROJECT_ROOM_ROLES) {
      const title = roleRoomTitle(role);
      if (existingTitles.has(title)) continue;
      const room = await ctx.issues.create({
        companyId,
        projectId,
        parentId: null,
        title,
        description: `Long-lived ${role} Role Room for this project.`,
        status: ROOM_READY_STATUS,
        priority: "medium",
        assigneeAgentId: null,
        originKind: PROVISIONED_ROOM_ORIGIN,
        originId: `project:${projectId}:role-room:${role}`
      });
      created.push({ id: room.id, identifier: room.identifier, role, title });
    }
    return { created, existingCount: LEGACY_PROJECT_ROOM_ROLES.length - created.length };
  });
}

async function provisionProjectAgentRooms(ctx, companyId, projectId) {
  if (!companyId || !projectId) throw new Error("companyId and projectId are required to provision Agent Rooms.");
  return queueProjectRoomProvision(projectId, async () => {
    const [issues, agents] = await Promise.all([
      ctx.issues.list({ companyId, projectId, limit: 500 }),
      ctx.agents.list({ companyId, limit: 200 })
    ]);
    const hiredAgents = agents.filter(isHiredAgent);
    const hiredAgentIds = new Set(hiredAgents.map((agent) => agent.id));
    const retired = [];
    for (const issue of issues) {
      const roomAgentId = agentRoomAgentId(issue);
      if (!roomAgentId || hiredAgentIds.has(roomAgentId) || TERMINAL_STATUSES.has(issue.status)) continue;
      const updated = await ctx.issues.update(issue.id, {
        status: "cancelled",
        description: `${issue.description || ""}\n\nThis Room belonged to a SPS built-in or non-hired Agent and is preserved only for history.`.trim()
      }, companyId);
      retired.push(updated);
    }
    const existingAgentIds = new Set(issues
      .filter((issue) => !TERMINAL_STATUSES.has(issue.status))
      .map(agentRoomAgentId)
      .filter((agentId) => agentId && hiredAgentIds.has(agentId)));
    const created = [];
    for (const agent of hiredAgents) {
      if (existingAgentIds.has(agent.id)) continue;
      const room = await ctx.issues.create({
        companyId,
        projectId,
        parentId: null,
        title: agent.name,
        description: `Long-lived Agent Room for ${agent.name}. The Room is unassigned and uses this Agent's SPS Instructions.`,
        status: ROOM_READY_STATUS,
        priority: "medium",
        assigneeAgentId: null,
        originKind: AGENT_ROOM_OPERATION_ORIGIN,
        originId: agentRoomOriginId(projectId, agent.id),
        surfaceVisibility: "plugin_operation"
      });
      created.push({ id: room.id, identifier: room.identifier, agentId: agent.id, agentName: agent.name, title: room.title });
    }
    return { created, retired, existingCount: existingAgentIds.size };
  });
}

async function provisionAllProjectAgentRooms(ctx, companyId) {
  const projects = await ctx.projects.list({ companyId, limit: 200 });
  for (const project of projects) {
    await provisionProjectAgentRooms(ctx, companyId, project.id);
  }
}

async function reconcileAllProjectAgentRooms(ctx) {
  const companies = await ctx.companies.list({ limit: 200 });
  const summaries = [];
  for (const company of companies) {
    if (!company?.id) continue;
    await provisionAllProjectAgentRooms(ctx, company.id);
    summaries.push({ companyId: company.id });
  }
  return { companyCount: summaries.length, companies: summaries };
}

async function syncAgentRoomTitles(ctx, companyId, agentId) {
  const agent = await ctx.agents.get(agentId, companyId);
  if (!isHiredAgent(agent)) return;
  const projects = await ctx.projects.list({ companyId, limit: 200 });
  for (const project of projects) {
    const issues = await ctx.issues.list({
      companyId,
      projectId: project.id,
      originId: agentRoomOriginId(project.id, agent.id),
      limit: 10
    });
    for (const room of issues) {
      if (room.title === agent.name) continue;
      await ctx.issues.update(room.id, {
        title: agent.name,
        description: `Long-lived Agent Room for ${agent.name}. The Room is unassigned and uses this Agent's SPS Instructions.`
      }, companyId);
    }
  }
}

async function retireLegacyRoleRooms(ctx, companyId, issues) {
  const retired = [];
  for (const issue of issues) {
    if (!isLegacyRoleRoom(issue) || TERMINAL_STATUSES.has(issue.status)) continue;
    const updated = await ctx.issues.update(issue.id, {
      status: "cancelled",
      description: `${issue.description || ""}\n\nSuperseded by one named Agent Room per hired Agent. Preserved for history.`.trim()
    }, companyId);
    retired.push(updated);
  }
  return retired;
}

async function normalizeProvisionedRoleRooms(ctx, companyId, projectId, issues = null) {
  const projectIssues = issues ?? await ctx.issues.list({ companyId, projectId, limit: 200 });
  const migrated = [];
  for (const issue of projectIssues) {
    if (!isProvisionedRoleRoom(issue) || issue.status !== "backlog") continue;
    const updated = await ctx.issues.update(issue.id, { status: ROOM_READY_STATUS }, companyId);
    migrated.push(updated);
  }
  const migratedById = new Map(migrated.map((issue) => [issue.id, issue]));
  return {
    issues: projectIssues.map((issue) => migratedById.get(issue.id) ?? issue),
    migrated
  };
}

function normalizedWorkspacePath(value) {
  return String(value || "").trim().replace(/[\\/]+$/g, "").toLowerCase();
}

function workspaceLocalPath(workspace) {
  return String(workspace?.cwd ?? workspace?.path ?? "").trim();
}

function displayTaskPath(value) {
  // Markdown treats a Windows `\\r` sequence as a line break in some renderers.
  // Task contracts are portable records, so render paths with forward slashes.
  return String(value || "").trim().replace(/\\/g, "/");
}

function normalizeTaskAffectedPaths(paths, workspace) {
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
  // Older profiles could already contain custom routing keys before the UI
  // exposed an editor. Preserve and show those routes on the next save.
  for (const taskType of Object.keys(asRecord(taskWorkspaceIds))) {
    const key = normalizedTaskTypeKey(taskType);
    if (key && !result.has(key)) result.set(key, { id: key, label: key });
  }
  return [...result.values()];
}

function normalizeWorkspaceProfile(value, workspaces = []) {
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

async function loadProjectWorkspaceProfile(ctx, projectId, workspaces = []) {
  const fallback = normalizeWorkspaceProfile({}, workspaces);
  if (!projectId || !ctx.entities?.list) return fallback;
  const records = await ctx.entities.list({
    entityType: WORKSPACE_PROFILE_ENTITY_TYPE,
    scopeKind: "project",
    scopeId: projectId,
    externalId: WORKSPACE_PROFILE_EXTERNAL_ID,
    limit: 1
  });
  const record = records[0] ?? null;
  return normalizeWorkspaceProfile(record?.data, workspaces);
}

async function saveProjectWorkspaceProfile(ctx, projectId, profile, workspaces = []) {
  if (!projectId || !ctx.entities?.upsert) throw new Error("SPS plugin storage is unavailable for Workspace Profiles.");
  const normalized = {
    ...normalizeWorkspaceProfile(profile, workspaces),
    configured: true,
    updatedAt: now()
  };
  await ctx.entities.upsert({
    entityType: WORKSPACE_PROFILE_ENTITY_TYPE,
    scopeKind: "project",
    scopeId: projectId,
    externalId: WORKSPACE_PROFILE_EXTERNAL_ID,
    data: normalized
  });
  return normalized;
}

function profileWorkspace(workspaces, profile, { agentId = "", taskType = "", requestedWorkspaceId = "" } = {}) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  // Preserve legacy routing until a Project explicitly opts into a profile.
  // Once configured, a Lead's explicit Workspace choice overrides profile defaults.
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

function profileTaskWorkspace(workspaces, profile, { agentId = "", taskType = "", requestedWorkspaceId = "" } = {}) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  if (asRecord(profile).configured !== true) return null;
  const requested = byId.get(requestedWorkspaceId);
  if (requested) return requested;
  const taskWorkspaceId = textParam(asRecord(profile).taskWorkspaceIds, normalizedTaskTypeKey(taskType));
  return taskWorkspaceId && byId.has(taskWorkspaceId) ? byId.get(taskWorkspaceId) : null;
}

function defaultWorkspaceKindForAgent(agent) {
  const identity = `${agent?.role || ""} ${agent?.name || ""}`.toLowerCase();
  if (/(art|image|voice)/.test(identity)) return "asset";
  if (/(designer|design|manager|document)/.test(identity)) return "design";
  return "implementation";
}

function workspaceKindForProjectWorkspace(workspace) {
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

function taskTypeAllowsNoAffectedPaths(taskType) {
  // Legacy design/documentation tasks remain compatible. Custom task types
  // still use the explicit path contract so collision checks stay meaningful.
  return ["design", "documentation"].includes(normalizedTaskTypeKey(taskType));
}

function chooseTaskWorkspace(workspaces, taskType, requestedWorkspaceId, profile = null, assigneeAgentId = "") {
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

function workspaceBinding(workspace) {
  if (!workspace?.id) return null;
  return {
    projectWorkspaceId: workspace.id,
    name: String(workspace.name || "Workspace"),
    kind: workspaceKindForProjectWorkspace(workspace),
    boundAt: now()
  };
}

async function listProjectWorkspaces(ctx, companyId, projectId) {
  if (!projectId || !ctx.projects?.listWorkspaces) return null;
  return ctx.projects.listWorkspaces(projectId, companyId);
}

function chooseDefaultWorkspace(agent, workspaces, profile = null) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  const configuredByProfile = profileWorkspace(workspaces, profile, { agentId: agent?.id });
  if (configuredByProfile) return configuredByProfile;
  const configured = normalizedWorkspacePath(agentWorkingDirectory(agent));
  if (configured) {
    const configuredWorkspace = workspaces.find((workspace) => normalizedWorkspacePath(workspaceLocalPath(workspace)) === configured);
    if (configuredWorkspace) return configuredWorkspace;
  }
  const preferredKind = defaultWorkspaceKindForAgent(agent);
  return workspaces.find((workspace) => workspaceKindForProjectWorkspace(workspace) === preferredKind)
    ?? workspaces.find((workspace) => workspace.isPrimary)
    ?? workspaces[0];
}

async function resolveRoomWorkspace(ctx, companyId, issue, agent, state) {
  const workspaces = await listProjectWorkspaces(ctx, companyId, issue.projectId);
  if (workspaces === null) return { workspace: null, workspaces: null, legacy: true };
  const profile = await loadProjectWorkspaceProfile(ctx, issue.projectId, workspaces);
  const currentId = textParam(asRecord(state?.workspace), "projectWorkspaceId");
  const profileSelectedWorkspace = profileWorkspace(workspaces, profile, { agentId: agent?.id });
  const workspace = profileSelectedWorkspace ?? workspaces.find((entry) => entry.id === currentId) ?? chooseDefaultWorkspace(agent, workspaces, profile);
  return { workspace: workspace ?? null, workspaces, profile, legacy: false };
}

async function ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, state) {
  const resolved = await resolveRoomWorkspace(ctx, companyId, issue, agent, state);
  if (!resolved.workspace) return { state, resolved, changed: false };
  const nextBinding = workspaceBinding(resolved.workspace);
  const currentBinding = asRecord(state.workspace);
  const changed = currentBinding.projectWorkspaceId !== nextBinding.projectWorkspaceId
    || currentBinding.kind !== nextBinding.kind
    || currentBinding.name !== nextBinding.name
    || Object.hasOwn(state, "workingDirectory");
  if (!changed) return { state, resolved, changed: false };
  state.workspace = nextBinding;
  delete state.workingDirectory;
  state.version = 3;
  return { state, resolved, changed: true };
}

async function resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state) {
  const resolved = await resolveRoomWorkspace(ctx, companyId, issue, agent, state);
  const workspacePath = workspaceLocalPath(resolved.workspace);
  if (workspacePath && fs.existsSync(workspacePath)) return workspacePath;
  if (resolved.legacy && state.workingDirectory && fs.existsSync(state.workingDirectory)) {
    return state.workingDirectory;
  }
  if (resolved.workspaces && !resolved.workspaces.length) {
    throw new Error("This Project has no registered Workspace. Add a design or implementation Workspace before starting a Room turn.");
  }
  throw new Error("The Room Workspace is unavailable. Select a registered Project Workspace before starting a Room turn.");
}

function agentSessionContextMatches(session, expectedContext) {
  const context = asRecord(session?.context);
  return textParam(context, "projectId") === textParam(expectedContext, "projectId")
    && textParam(context, "projectWorkspaceId") === textParam(expectedContext, "projectWorkspaceId")
    && !textParam(context, "issueId");
}

async function ensureNativeRoomSession(ctx, companyId, issue, agent, state) {
  const binding = await ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, state);
  const workspace = binding.resolved.workspace;
  if (!workspace?.id) {
    throw new Error("This Project has no registered Workspace. Add a design or implementation Workspace before starting a Room turn.");
  }

  const context = {
    projectId: issue.projectId,
    projectWorkspaceId: workspace.id
  };
  const sessions = await ctx.agents.sessions.list(agent.id, companyId);
  const persistedSessionId = textParam(state.runtime, "agentSessionId");
  let session = sessions.find((candidate) => candidate.sessionId === persistedSessionId) ?? null;

  if (session && !agentSessionContextMatches(session, context)) {
    await ctx.agents.sessions.close(session.sessionId, companyId);
    session = null;
  }
  if (!session) {
    session = sessions.find((candidate) => agentSessionContextMatches(candidate, context)) ?? null;
  }
  if (!session) {
    session = await ctx.agents.sessions.create(agent.id, companyId, {
      reason: `Long-lived Room session for ${agent.name}`,
      context
    });
  }

  state.runtime ??= {};
  state.runtime.kind = "paperclip_agent_session";
  state.runtime.agentSessionId = session.sessionId;
  state.runtime.lastRunId = session.lastRunId ?? state.runtime.lastRunId ?? null;
  state.runtime.lastError = session.lastError ?? null;
  state.runtime.codexThreadId = null;
  state.runtime.model = textParam(asRecord(agent.adapterConfig), "model") || null;
  state.runtime.updatedAt = now();
  delete state.runtime.codexAccountKey;
  delete state.runtime.codexHome;
  delete state.runtime.agyCommand;

  return {
    session,
    workspace,
    workingDirectory: await resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state),
    bindingChanged: binding.changed
  };
}

function nativeSessionResultText(event) {
  const payload = asRecord(event?.payload);
  if (event?.eventType === "error") {
    const message = textParam(payload, "error")
      || textParam(payload, "errorCode")
      || textParam(event, "message")
      || "The Agent Session run failed.";
    const error = new Error(message);
    const resultRecord = asRecord(payload.resultJson);
    error.code = textParam(payload, "errorCode") || textParam(resultRecord, "errorCode") || null;
    error.errorFamily = textParam(payload, "errorFamily") || textParam(resultRecord, "errorFamily") || null;
    error.retryNotBefore = textParam(payload, "retryNotBefore") || textParam(resultRecord, "retryNotBefore") || null;
    throw error;
  }
  const result = payload.resultJson;
  const resultRecord = asRecord(result);
  const text = typeof result === "string"
    ? result
    : textParam(resultRecord, "summary")
      || textParam(resultRecord, "message")
      || textParam(resultRecord, "output");
  if (!text) throw new Error("The Agent Session completed without an assistant message.");
  return enforceUtf8Text(text, "Agent Session output");
}

async function startNativeAgentSessionTurn(ctx, { sessionId, companyId, prompt, reason, onEvent }) {
  let resolveTerminal;
  const completion = new Promise((resolve) => {
    resolveTerminal = resolve;
  });
  const response = await ctx.agents.sessions.sendMessage(sessionId, companyId, {
    prompt,
    reason,
    onEvent(event) {
      try {
        onEvent?.(event);
      } catch (error) {
        ctx.logger?.warn?.("Room Agent Session progress event could not be rendered.", {
          sessionId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
      if (event.eventType === "done" || event.eventType === "error") resolveTerminal(event);
    }
  });
  return { runId: response.runId, completion };
}

function now() {
  return new Date().toISOString();
}

const DURABLE_JSON_PREFIX = "paperclip-room-json:v1:";

function parseState(body) {
  if (!body || typeof body !== "string") return null;
  const trimmed = body.trim();
  if (trimmed.startsWith(DURABLE_JSON_PREFIX)) {
    const encoded = trimmed.slice(DURABLE_JSON_PREFIX.length).trim();
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
    try {
      return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const match = body.match(/```json\s*([\s\S]*?)\s*```/i);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
}

function serializeState(state) {
  const encoded = Buffer.from(JSON.stringify(state), "utf8").toString("base64");
  return `${DURABLE_JSON_PREFIX}${encoded}\n`;
}

function newRoomState(issue, agent, legacyWorkingDirectory = "") {
  return {
    version: 3,
    kind: "agent_room",
    roomIssueId: issue.id,
    projectId: issue.projectId ?? null,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role ?? null,
    workspace: null,
    ...(legacyWorkingDirectory ? { workingDirectory: legacyWorkingDirectory } : {}),
    runtime: {
      kind: "paperclip_agent_session",
      agentSessionId: null,
      lastRunId: null,
      lastError: null,
      codexThreadId: null,
      model: null,
      updatedAt: null,
      activity: { status: "idle", kind: null, turnId: null, startedAt: null, updatedAt: null, steps: [], error: null }
    },
    checkpoint: {
      version: 0,
      summary: null,
      sourceCommentId: null,
      createdAt: null,
      compactedAt: null
    },
    pendingTurn: null
  };
}

function roomWorkText(value, limit = 1200) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text.slice(0, limit) : null;
}

function roomWorkReferences(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => roomWorkText(entry, 1000)).filter(Boolean))].slice(0, 24);
}

function normalizeRoomWorkOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const outcome = {
    taskId: roomWorkText(value.taskId, 200),
    identifier: roomWorkText(value.identifier, 200),
    status: roomWorkText(value.status, 80),
    summary: roomWorkText(value.summary, 1600),
    sourceReferences: roomWorkReferences(value.sourceReferences)
  };
  return outcome.taskId || outcome.identifier || outcome.summary ? outcome : null;
}

function normalizeRoomNextCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = {
    summary: roomWorkText(value.summary, 1600),
    kind: roomWorkText(value.kind, 120),
    sourceReferences: roomWorkReferences(value.sourceReferences)
  };
  return candidate.summary ? candidate : null;
}

function normalizeRoomWaitingFor(value) {
  const source = asRecord(value);
  const requestedKind = roomWorkText(source.kind, 80) || "none";
  const kind = ROOM_WAITING_KINDS.has(requestedKind) ? requestedKind : "none";
  return {
    kind,
    detail: kind === "none" ? null : roomWorkText(source.detail, 1200),
    taskId: kind === "none" ? null : roomWorkText(source.taskId, 200)
  };
}

function newRoomWorkState(issue) {
  return {
    version: 1,
    revision: 0,
    kind: "room_work_state",
    roomIssueId: issue.id,
    projectId: issue.projectId ?? null,
    objective: null,
    phase: null,
    latestOutcome: null,
    planReferences: [],
    nextCandidate: null,
    waitingFor: { kind: "none", detail: null, taskId: null },
    updatedAt: null,
    updatedBy: null
  };
}

function normalizeRoomWorkState(value, issue) {
  const base = newRoomWorkState(issue);
  const source = asRecord(value);
  if (source.kind !== "room_work_state" || source.roomIssueId !== issue.id) return base;
  return {
    ...base,
    version: 1,
    revision: Math.max(0, Number(source.revision) || 0),
    objective: roomWorkText(source.objective, 1600),
    phase: roomWorkText(source.phase, 300),
    latestOutcome: normalizeRoomWorkOutcome(source.latestOutcome),
    planReferences: roomWorkReferences(source.planReferences),
    nextCandidate: normalizeRoomNextCandidate(source.nextCandidate),
    waitingFor: normalizeRoomWaitingFor(source.waitingFor),
    updatedAt: roomWorkText(source.updatedAt, 100),
    updatedBy: Object.keys(asRecord(source.updatedBy)).length ? {
      kind: roomWorkText(source.updatedBy.kind, 80),
      agentId: roomWorkText(source.updatedBy.agentId, 200),
      agentName: roomWorkText(source.updatedBy.agentName, 300)
    } : null
  };
}

function mergeRoomWorkState(current, patch, issue, updatedBy = {}) {
  const source = asRecord(patch);
  const next = normalizeRoomWorkState(current, issue);
  const has = (key) => Object.prototype.hasOwnProperty.call(source, key);
  if (has("objective")) next.objective = roomWorkText(source.objective, 1600);
  if (has("phase")) next.phase = roomWorkText(source.phase, 300);
  if (has("latestOutcome")) next.latestOutcome = normalizeRoomWorkOutcome(source.latestOutcome);
  if (has("planReferences")) next.planReferences = roomWorkReferences(source.planReferences);
  if (has("nextCandidate")) next.nextCandidate = normalizeRoomNextCandidate(source.nextCandidate);
  if (has("waitingFor")) next.waitingFor = normalizeRoomWaitingFor(source.waitingFor);
  next.revision += 1;
  next.updatedAt = now();
  next.updatedBy = {
    kind: roomWorkText(updatedBy.kind, 80) || "agent",
    agentId: roomWorkText(updatedBy.agentId, 200),
    agentName: roomWorkText(updatedBy.agentName, 300)
  };
  return next;
}

function taskReviewMode(taskState) {
  return textParam(asRecord(taskState?.review), "mode") === "manual" ? "manual" : "automatic";
}

function newTaskRoomState(issue, roomContext, input) {
  const waitingForWorker = input.workerStatusAtCreation === "paused";
  const reviewMode = input.reviewMode === "manual" ? "manual" : "automatic";
  return {
    version: 1,
    kind: "task_room",
    taskIssueId: issue.id,
    projectId: issue.projectId ?? roomContext.projectId ?? null,
    originatingRoomIssueId: roomContext.issueId,
    owningAgentId: roomContext.agentId,
    owningAgentName: roomContext.agentName,
    owningAgentRole: roomContext.agentRole,
    workerAgentId: input.assigneeAgentId,
    taskType: input.taskType,
    maturity: input.maturity,
    projectWorkspaceId: input.projectWorkspaceId ?? null,
    projectWorkspaceName: input.projectWorkspaceName ?? null,
    declaredAffectedPaths: input.affectedPaths,
    designReferences: input.designReferences,
    acceptanceCriteria: input.acceptanceCriteria,
    verification: input.verification,
    dependencyTaskIds: input.blockedByIssueIds,
    dispatch: {
      status: waitingForWorker ? "waiting_for_worker" : "ready",
      reason: waitingForWorker ? "worker_paused_before_start" : null,
      workerStatusAtCreation: input.workerStatusAtCreation ?? null,
      startedAt: waitingForWorker ? null : now(),
      updatedAt: now()
    },
    review: {
      required: "owning_agent",
      mode: reviewMode,
      status: "not_requested",
      workerReportCommentId: null,
      updatedAt: now()
    }
  };
}

function taskProtocolComment(roomContext, issue, taskState) {
  const reviewMode = taskReviewMode(taskState);
  const lines = [
    "## Task Room Protocol",
    `- Owner Agent: ${roomContext.agentName}`,
    `- Worker: ${taskState.workerAgentId}`,
    `- Task type: ${taskState.taskType}`,
    `- Maturity: ${taskState.maturity}`,
    `- Project Workspace: ${taskState.projectWorkspaceName || taskState.projectWorkspaceId || "Not bound"}`,
    reviewMode === "manual"
      ? "- Completion boundary: a Worker final report moves this Task to in_review and leaves a durable report in the originating Task Owner Room. The next Task Owner turn is started manually; only that Owner can technically verify and mark the Task done. This is not user or product approval."
      : "- Completion boundary: a Worker final report moves this Task to in_review and automatically wakes the originating Task Owner Room. Only that Owner technically verifies and marks the Task done. This is not user or product approval.",
    "- Blocker boundary: quota, permissions, missing design, or unavailable required tools must be reported before marking blocked.",
    "- Final-report gate: post one substantive Worker report before the status change. A title-only report never wakes the owner Room.",
    "- Use `## SPS Final Report` for completion or `## SPS Blocker Report` for a blocker, including outputs or blocker, evidence, risks, and next reviewer.",
    "- Do not search for SPS credentials or retry a submitted final report. Use only the provided Task capability and submit each final report once.",
    "",
    "Affected Paths (relative to the selected Project Workspace):",
    ...(taskState.declaredAffectedPaths.length ? taskState.declaredAffectedPaths.map((path) => `- ${displayTaskPath(path)}`) : ["- Not declared"]),
    "",
    "Design References:",
    ...(taskState.designReferences.length ? taskState.designReferences.map((reference) => `- ${reference}`) : ["- Not required for this task type"]),
    "",
    "Acceptance Criteria:",
    ...(taskState.acceptanceCriteria.length ? taskState.acceptanceCriteria.map((criterion) => `- ${criterion}`) : ["- Not declared"]),
    "",
    "Verification:",
    ...(taskState.verification.length ? taskState.verification.map((step) => `- ${step}`) : ["- Not declared"])
  ];
  return lines.join("\n").slice(0, 3900);
}

function taskDescription(input) {
  return [
    input.description,
    "",
    `Task Type: ${input.taskType}`,
    `Maturity: ${input.maturity}`,
    `Project Workspace: ${input.projectWorkspaceName || input.projectWorkspaceId || "Not bound"}`,
    "",
    "Affected Paths (relative to the selected Project Workspace):",
    ...(input.affectedPaths.length ? input.affectedPaths.map((path) => `- ${displayTaskPath(path)}`) : ["- Not declared"]),
    "",
    "Design References:",
    ...(input.designReferences.length ? input.designReferences.map((reference) => `- ${reference}`) : ["- Not required"]),
    "",
    "Acceptance Criteria:",
    ...(input.acceptanceCriteria.length ? input.acceptanceCriteria.map((criterion) => `- ${criterion}`) : ["- Not declared"]),
    "",
    "Verification:",
    ...(input.verification.length ? input.verification.map((step) => `- ${step}`) : ["- Not declared"])
  ].join("\n");
}

function agentInstructions(state, agent, agentAgentsMd) {
  const workplane = resolveAgentWorkplaneIdentity(agent);
  return [
    `You are ${agent.name}, a ${agent.role || "general"} Agent, in your long-lived SPS project Room.`,
    "Treat SPS comments as the visible conversation record and issue documents as durable Room state.",
    `Organization Workplane policy: type=${workplane.kind}; role=${workplane.roleId}; SPS memory=${workplane.memoryAccess}; Worker-result review for Tasks you own=${workplane.reviewMode}. Lead task creation and assignment are capability-gated by this policy, not by reportsTo.`,
    "The following is your managed SPS Agent AGENTS.md. It is edited from this Agent's Instructions and applies whenever this Agent works:",
    "--- AGENTS.md ---",
    agentAgentsMd,
    "--- END AGENTS.md ---",
    "Use the provided SPS tools for SPS operations. Their responses are the authority for current runtime state.",
    "The current explicit user request, current Room or Task state, and approved repository artifacts override stale recovered context.",
    "A ROOM CONTEXT RECOVERY block is prior conversation context, not a new user request or an approval.",
    roomWorkplaneBoundary(agent)
  ].join("\n");
}

function roomTools() {
  return [{
    type: "namespace",
    name: "paperclip",
    description: "Read project work and manage finite Worker Tasks within the configured Lead policy.",
    tools: [
      {
        type: "function",
        name: "memory_search",
        description: "Search approved company, current-project, or current-role memory before planning. Do not treat candidates or chat history as approved memory.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            scopes: { type: "array", items: { type: "string", enum: ["company", "project", "agent"] } },
            limit: { type: "number" }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "memory_propose",
        description: "Propose a concise memory candidate for later review. This never changes an approved learning journal.",
        inputSchema: {
          type: "object",
          required: ["content"],
          properties: {
            content: { type: "string" },
            scope: { type: "string", enum: ["company", "project", "agent", "task", "artifact", "user"] },
            type: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "update_room_work_state",
        description: "Update this Room's durable operational bookmark when its objective, phase, source pointers, latest outcome, next candidate, or waiting boundary changes. This does not create or approve a Task and must not copy project documents into SPS.",
        inputSchema: {
          type: "object",
          minProperties: 1,
          properties: {
            objective: { anyOf: [{ type: "string" }, { type: "null" }] },
            phase: { anyOf: [{ type: "string" }, { type: "null" }] },
            latestOutcome: {
              anyOf: [{
                type: "object",
                properties: {
                  taskId: { type: "string" },
                  identifier: { type: "string" },
                  status: { type: "string" },
                  summary: { type: "string" },
                  sourceReferences: { type: "array", items: { type: "string" } }
                },
                additionalProperties: false
              }, { type: "null" }]
            },
            planReferences: { type: "array", items: { type: "string" } },
            nextCandidate: {
              anyOf: [{
                type: "object",
                required: ["summary"],
                properties: {
                  summary: { type: "string" },
                  kind: { type: "string" },
                  sourceReferences: { type: "array", items: { type: "string" } }
                },
                additionalProperties: false
              }, { type: "null" }]
            },
            waitingFor: {
              type: "object",
              required: ["kind"],
              properties: {
                kind: { type: "string", enum: ["none", "user", "worker", "environment", "task_review"] },
                detail: { anyOf: [{ type: "string" }, { type: "null" }] },
                taskId: { anyOf: [{ type: "string" }, { type: "null" }] }
              },
              additionalProperties: false
            }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "list_active_tasks",
        description: "List active project Tasks and their declared affected paths before planning work.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        type: "function",
        name: "list_workers",
        description: "List organization workers that can receive a SPS Task assignment.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        type: "function",
        name: "preview_task",
        description: "Preview a finite child Task against active project Tasks before creating it. Use this before every implementation or asset Task.",
        inputSchema: {
          type: "object",
          required: ["affectedPaths"],
          properties: {
            affectedPaths: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "create_task",
        description: "Create one finite child Task owned by this Agent Room and assign a shared Worker. A paused Worker still receives one blocked Task; do not substitute or duplicate it. Use after a collision preview when finite delegated work is needed to advance the current Room objective. Design approval is not mandatory, but maturity must be explicit. Affected paths are always relative to the selected Project Workspace, never to the Project root; for example use `src/app.ts`, not `implementation/src/app.ts` when the selected Workspace is the implementation repository.",
        inputSchema: {
          type: "object",
          required: ["title", "description", "assigneeAgentId", "maturity"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            assigneeAgentId: { type: "string" },
            maturity: { type: "string", enum: ["exploration", "prototype", "committed implementation"] },
            taskType: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{0,63}$", description: "Optional Project task-type key. Use a configured Workspace Profile key when one exists; otherwise use a concise lowercase key such as implementation, research, release, or api-contract." },
            projectWorkspaceId: { type: "string" },
            affectedPaths: { type: "array", description: "Relative to the selected Project Workspace only. Do not prefix the Workspace folder name.", items: { type: "string" } },
            designReferences: { type: "array", items: { type: "string" } },
            acceptanceCriteria: { type: "array", items: { type: "string" } },
            verification: { type: "array", items: { type: "string" } },
            blockedByIssueIds: { type: "array", items: { type: "string" } }
          },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "get_task_context",
        description: "Read a project Task Room's state and recent visible feedback before giving owner-Agent guidance.",
        inputSchema: {
          type: "object",
          required: ["taskId"],
          properties: { taskId: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "start_task",
        description: "Start the same blocked Task after its originally assigned Worker becomes available. This never resumes the Worker, changes assignee, or creates a replacement Task.",
        inputSchema: {
          type: "object",
          required: ["taskId"],
          properties: { taskId: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "post_task_feedback",
        description: "Post feedback into a Task owned by this Agent Room and return it to the assigned Worker for correction or more evidence. This can also reopen a technically completed Task after later user or design review.",
        inputSchema: {
          type: "object",
          required: ["taskId", "message"],
          properties: { taskId: { type: "string" }, message: { type: "string" } },
          additionalProperties: false
        }
      },
      {
        type: "function",
        name: "complete_task",
        description: "Mark an in_review Task owned by this Agent Room done after its Worker evidence satisfies every acceptance criterion. This records Task Owner technical verification, not user or product approval. Workers can never call this.",
        inputSchema: {
          type: "object",
          required: ["taskId", "reviewSummary"],
          properties: {
            taskId: { type: "string" },
            reviewSummary: { type: "string" }
          },
          additionalProperties: false
        }
      }
    ]
  }];
}

async function requireRoom(ctx, companyId, issueId) {
  let issue = await ctx.issues.get(issueId, companyId);
  if (!issue) throw new Error("Room issue was not found.");
  if (isAgentRoom(issue) && issue.status === "backlog") {
    issue = await ctx.issues.update(issue.id, { status: ROOM_READY_STATUS }, companyId);
  }
  const agentId = agentRoomAgentId(issue);
  if (!agentId) throw new Error("Room Chat is available only on a provisioned Agent Room.");
  if (issue.assigneeAgentId) throw new Error("A long-lived Agent Room must remain unassigned.");
  if (issue.parentId) throw new Error("A long-lived Agent Room must be a root project issue.");
  if (TERMINAL_STATUSES.has(issue.status)) throw new Error("Closed Agent Rooms cannot receive chat messages.");
  const agent = await ctx.agents.get(agentId, companyId);
  if (!agent) throw new Error("The Agent linked to this Room was not found.");
  return { issue, agent };
}

async function loadRoomState(ctx, companyId, issue, agent) {
  const document = await ctx.issues.documents.get(issue.id, ROOM_STATE_KEY, companyId);
  const parsed = parseState(document?.body);
  if (parsed && parsed.roomIssueId === issue.id) {
    if (parsed.agentId && parsed.agentId !== agent.id) throw new Error("Room state Agent does not match the linked Agent Room.");
    const upgraded = {
      ...parsed,
      version: Math.max(Number(parsed.version) || 0, 3),
      kind: "agent_room",
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role ?? null
    };
    const bound = await ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, upgraded);
    const identityChanged = parsed.agentId !== agent.id || parsed.agentName !== agent.name || parsed.agentRole !== (agent.role ?? null);
    if (identityChanged || bound.changed) {
      await saveRoomState(ctx, companyId, issue.id, upgraded, "Upgrade Room identity and Workspace binding");
    }
    return upgraded;
  }
  const state = newRoomState(issue, agent, ctx.projects?.listWorkspaces ? "" : agentWorkingDirectory(agent));
  const bound = await ensureRoomWorkspaceBinding(ctx, companyId, issue, agent, state);
  await saveRoomState(ctx, companyId, issue.id, state, "Initialize Room state");
  await upsertRoomDocument(ctx, {
    issueId: issue.id,
    key: ROOM_CHECKPOINTS_KEY,
    body: "[]\n",
    companyId,
    title: "Room checkpoints",
    format: "markdown",
    changeSummary: "Initialize checkpoint history"
  });
  return bound.state;
}

async function saveRoomState(ctx, companyId, issueId, state, changeSummary) {
  return queueRoomDocumentWrite(issueId, ROOM_STATE_KEY, async () => {
    await putRoomDocumentFromInvocation(ctx, {
      issueId,
      key: ROOM_STATE_KEY,
      body: serializeState(state),
      companyId,
      title: "Room state",
      format: "markdown",
      changeSummary
    });
  });
}

async function loadRoomWorkState(ctx, companyId, issue) {
  const document = await ctx.issues.documents.get(issue.id, ROOM_WORK_STATE_KEY, companyId);
  return normalizeRoomWorkState(parseState(document?.body), issue);
}

async function saveRoomWorkState(ctx, companyId, issue, state, changeSummary) {
  const normalized = normalizeRoomWorkState(state, issue);
  return queueRoomDocumentWrite(issue.id, ROOM_WORK_STATE_KEY, async () => {
    await putRoomDocumentFromInvocation(ctx, {
      issueId: issue.id,
      key: ROOM_WORK_STATE_KEY,
      body: serializeState(normalized),
      companyId,
      title: "Room work state",
      format: "markdown",
      changeSummary
    });
    return normalized;
  });
}

async function updateRoomWorkState(ctx, companyId, issue, patch, changeSummary, updatedBy = {}) {
  return queueRoomDocumentWrite(issue.id, ROOM_WORK_STATE_KEY, async () => {
    return retryRoomDocumentWrite(async () => {
      const document = await ctx.issues.documents.get(issue.id, ROOM_WORK_STATE_KEY, companyId);
      const current = normalizeRoomWorkState(parseState(document?.body), issue);
      const next = mergeRoomWorkState(current, patch, issue, updatedBy);
      const runtime = await getRuntimeConfig(ctx);
      await putRoomDocument(runtime.spsApiUrl, {
        issueId: issue.id,
        key: ROOM_WORK_STATE_KEY,
        body: serializeState(next),
        title: "Room work state",
        format: "markdown",
        baseRevisionId: document?.latestRevisionId ?? null,
        changeSummary
      });
      return next;
    });
  });
}

async function upsertRoomDocument(ctx, input) {
  return queueRoomDocumentWrite(input.issueId, input.key, () => putRoomDocumentFromInvocation(ctx, input));
}

async function putRoomDocumentFromInvocation(ctx, input) {
  return retryRoomDocumentWrite(async () => {
    const existing = await ctx.issues.documents.get(input.issueId, input.key, input.companyId);
    const runtime = await getRuntimeConfig(ctx);
    return putRoomDocument(runtime.spsApiUrl, {
      ...input,
      baseRevisionId: existing?.latestRevisionId ?? null
    });
  });
}

function loopbackSPSApiUrl(value) {
  const parsed = new URL(value || "http://127.0.0.1:3100");
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!localHosts.has(parsed.hostname) || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Room document writes require a loopback SPS API URL.");
  }
  return parsed.toString().replace(/\/$/, "");
}

async function paperclipJsonDirect(apiUrl, apiPath, { method = "GET", body, operation = "request" } = {}) {
  if (!String(apiPath || "").startsWith("/api/")) {
    throw new Error("SPS direct requests must use an /api/ path.");
  }
  const response = await fetch(`${loopbackSPSApiUrl(apiUrl)}${apiPath}`, {
    method,
    ...(body === undefined ? {} : {
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    })
  });
  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      result = responseText;
    }
  }
  if (!response.ok) {
    const detail = typeof result === "string" ? result : textParam(asRecord(result), "error") || responseText;
    const error = new Error(`SPS ${operation} failed (HTTP ${response.status})${detail ? `: ${String(detail).slice(0, 400)}` : "."}`);
    error.status = response.status;
    throw error;
  }
  return result;
}

function directArrayPayload(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(asRecord(value)[key])) return asRecord(value)[key];
  }
  return [];
}

async function listCompaniesDirect(apiUrl) {
  const result = await paperclipJsonDirect(apiUrl, "/api/companies", { operation: "Company list" });
  return directArrayPayload(result, ["companies", "items", "data"]);
}

async function listTaskOwnerBoundaryIssues(ctx, companyId) {
  const issues = [];
  for (const status of TASK_OWNER_REPORT_STATUSES) {
    let offset = 0;
    while (true) {
      const batch = await ctx.issues.list({
        companyId,
        status,
        includePluginOperations: true,
        limit: 500,
        offset
      });
      issues.push(...batch);
      if (batch.length < 500) break;
      offset += batch.length;
    }
  }
  return issues;
}

async function listCompanyAgentsDirect(apiUrl, companyId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/companies/${encodeURIComponent(companyId)}/agents`,
    { operation: "Agent list" }
  );
  return directArrayPayload(result, ["agents", "items", "data"]);
}

async function listCompanyIssuesDirect(apiUrl, companyId, projectId = "") {
  const query = new URLSearchParams({ limit: "500" });
  if (projectId) query.set("projectId", projectId);
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/companies/${encodeURIComponent(companyId)}/issues?${query.toString()}`,
    { operation: "Task list" }
  );
  const issues = directArrayPayload(result, ["issues", "items", "data"]);
  return projectId ? issues.filter((issue) => issue.projectId === projectId) : issues;
}

async function listProjectWorkspacesDirect(apiUrl, projectId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/projects/${encodeURIComponent(projectId)}/workspaces`,
    { operation: "Project Workspace list" }
  );
  return directArrayPayload(result, ["workspaces", "items", "data"]);
}

async function getIssueDirect(apiUrl, issueId) {
  return paperclipJsonDirect(apiUrl, `/api/issues/${encodeURIComponent(issueId)}`, { operation: "Task read" });
}

async function createIssueDirect(apiUrl, companyId, input) {
  return paperclipJsonDirect(
    apiUrl,
    `/api/companies/${encodeURIComponent(companyId)}/issues`,
    { method: "POST", body: input, operation: "Task creation" }
  );
}

async function updateIssueDirect(apiUrl, issueId, input) {
  return paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}`,
    { method: "PATCH", body: input, operation: "Task update" }
  );
}

async function listIssueCommentsDirect(apiUrl, issueId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}/comments`,
    { operation: "Task comment list" }
  );
  return directArrayPayload(result, ["comments", "items", "data"]);
}

async function listIssueRunsDirect(apiUrl, issueId) {
  const result = await paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}/runs`,
    { operation: "Task run list" }
  );
  return directArrayPayload(result, ["runs", "items", "data"]);
}

async function createIssueCommentDirect(apiUrl, issueId, body) {
  return paperclipJsonDirect(
    apiUrl,
    `/api/issues/${encodeURIComponent(issueId)}/comments`,
    { method: "POST", body: { body }, operation: "Task comment creation" }
  );
}

async function upsertRoomDocumentOutsideInvocation(apiUrl, input) {
  return queueRoomDocumentWrite(input.issueId, input.key, () => retryRoomDocumentWrite(async () => {
    const existing = await getRoomDocumentDirect(apiUrl, input.issueId, input.key);
    return putRoomDocument(apiUrl, {
      ...input,
      baseRevisionId: existing?.latestRevisionId ?? null
    });
  }));
}

async function updateAgentAdapterConfigDirect(apiUrl, companyId, agentId, adapterConfig) {
  const query = new URLSearchParams({ companyId: String(companyId || "") });
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/agents/${encodeURIComponent(agentId)}?${query.toString()}`;
  const response = await fetch(endpoint, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ adapterConfig, replaceAdapterConfig: true })
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`SPS could not update the Agent configuration (HTTP ${response.status}): ${body || "unknown error"}`);
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function attachmentIdsParam(params) {
  return [...new Set(listParam(params, "attachmentIds"))];
}

function repairUtf8Mojibake(value) {
  const source = String(value ?? "");
  const mojibake = /(?:Ã.|Â.|â..|ð...|ì[\u0080-\u00bf]|í[\u0080-\u00bf]|ë[\u0080-\u00bf]|ê[\u0080-\u00bf])/;
  if (!source || /[^\u0000-\u00ff]/.test(source) || !mojibake.test(source)) return source;
  let repaired = source;
  for (let attempt = 0; attempt < 2 && mojibake.test(repaired); attempt += 1) {
    try {
      const candidate = Buffer.from(repaired, "latin1").toString("utf8");
      if (!candidate || candidate.includes("\ufffd") || candidate === repaired) break;
      repaired = candidate;
    } catch {
      break;
    }
  }
  return repaired;
}

function enforceUtf8Text(value, label = "Text") {
  const text = repairUtf8Mojibake(value).replace(/\r\n/g, "\n");
  if (text.includes("\ufffd")) {
    throw new Error(`${label} contains an invalid UTF-8 replacement character and was not saved to avoid corrupted text.`);
  }
  return text;
}

function enforceTaskContractText(value, label = "Task text") {
  const text = enforceUtf8Text(value, label);
  if (/\?{2,}/.test(text)) {
    throw new Error(`${label} contains a likely lossy encoding sequence (??) and was not saved.`);
  }
  return text;
}

function roomAttachmentName(attachment) {
  const filename = textParam(attachment, "originalFilename") || textParam(attachment, "filename");
  return repairUtf8Mojibake(filename) || `attachment-${textParam(attachment, "id", "file")}`;
}

function safeAttachmentFilename(filename) {
  const basename = path.basename(String(filename || "attachment"));
  const cleaned = basename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim().slice(0, 120);
  return cleaned || "attachment";
}

function safeAttachmentPathSegment(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "unknown";
}

function attachmentContentPath(attachment) {
  const contentPath = textParam(attachment, "contentPath");
  return contentPath || `/api/attachments/${encodeURIComponent(textParam(attachment, "id"))}/content`;
}

function roomAttachmentContentUrl(apiUrl, attachment) {
  return new URL(attachmentContentPath(attachment), `${loopbackSPSApiUrl(apiUrl)}/`).toString();
}

function isCodexImageAttachment(attachment) {
  const contentType = textParam(attachment, "contentType").toLowerCase();
  if (/^image\/(png|jpe?g|webp|gif|avif|bmp)$/i.test(contentType)) return true;
  return /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(roomAttachmentName(attachment));
}

function roomAttachmentCacheRoot() {
  const paperclipHome = String(process.env.PAPERCLIP_HOME || "").trim();
  return paperclipHome
    ? path.join(paperclipHome, "room-attachments")
    : path.join(os.homedir(), ".sps", "room-attachments");
}

function roomAttachmentWorkspaceRoot(workingDirectory) {
  const requestedWorkspace = String(workingDirectory || "").trim();
  if (!requestedWorkspace) {
    throw new Error("A Room Workspace is required before attached files can be prepared for an Agent.");
  }
  const workspaceRoot = path.resolve(requestedWorkspace);
  const attachmentRoot = path.resolve(workspaceRoot, ".sps", "room-attachments");
  const relative = path.relative(workspaceRoot, attachmentRoot);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("The Room attachment staging path must stay inside the selected Project Workspace.");
  }
  return attachmentRoot;
}

function workspaceGitExcludePath(workingDirectory) {
  const dotGitPath = path.join(workingDirectory, ".git");
  if (!fs.existsSync(dotGitPath)) return null;
  const stats = fs.statSync(dotGitPath);
  if (stats.isDirectory()) return path.join(dotGitPath, "info", "exclude");
  if (!stats.isFile()) return null;
  const match = fs.readFileSync(dotGitPath, "utf8").match(/^gitdir:\s*(.+)\s*$/im);
  return match ? path.join(path.resolve(workingDirectory, match[1]), "info", "exclude") : null;
}

function excludeWorkspaceRoomAttachments(workingDirectory) {
  const excludePath = workspaceGitExcludePath(workingDirectory);
  if (!excludePath) return null;
  const rule = ".sps/room-attachments/";
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  if (existing.split(/\r?\n/).some((line) => line.trim().replace(/\\/g, "/") === rule)) return excludePath;
  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  fs.appendFileSync(excludePath, `${existing && !existing.endsWith("\n") ? "\n" : ""}${rule}\n`, "utf8");
  return excludePath;
}

function cleanupRoomAttachmentCache(root = roomAttachmentCacheRoot(), nowMs = Date.now()) {
  if (!fs.existsSync(root)) return [];
  const removed = [];
  for (const roomEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!roomEntry.isDirectory()) continue;
    const roomPath = path.join(root, roomEntry.name);
    for (const attachmentEntry of fs.readdirSync(roomPath, { withFileTypes: true })) {
      if (!attachmentEntry.isDirectory()) continue;
      const attachmentPath = path.join(roomPath, attachmentEntry.name);
      const modifiedAt = fs.statSync(attachmentPath).mtimeMs;
      if (nowMs - modifiedAt <= ROOM_ATTACHMENT_CACHE_RETENTION_MS) continue;
      fs.rmSync(attachmentPath, { recursive: true, force: true });
      removed.push(attachmentPath);
    }
    if (!fs.readdirSync(roomPath).length) fs.rmdirSync(roomPath);
  }
  return removed;
}

function attachmentSnapshot(attachment) {
  return {
    id: textParam(attachment, "id"),
    originalFilename: roomAttachmentName(attachment),
    contentType: textParam(attachment, "contentType") || "application/octet-stream",
    byteSize: Number(attachment?.byteSize) || 0,
    contentPath: attachmentContentPath(attachment),
    openPath: textParam(attachment, "openPath") || null,
    downloadPath: textParam(attachment, "downloadPath") || null
  };
}

async function listIssueAttachmentsDirect(apiUrl, issueId) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/attachments`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`SPS attachment list failed (HTTP ${response.status}).`);
  const result = await response.json();
  return Array.isArray(result) ? result : Array.isArray(result?.attachments) ? result.attachments : [];
}

async function resolveRoomAttachments(apiUrl, issueId, attachmentIds) {
  if (!attachmentIds.length) return [];
  const available = await listIssueAttachmentsDirect(apiUrl, issueId);
  const byId = new Map(available.map((attachment) => [textParam(attachment, "id"), attachment]));
  const missing = attachmentIds.filter((id) => !byId.has(id));
  if (missing.length) throw new Error("One or more selected files are no longer attached to this Room.");
  return attachmentIds.map((id) => attachmentSnapshot(byId.get(id)));
}

function mergeRoomAttachments(...groups) {
  const byId = new Map();
  for (const group of groups) {
    for (const attachment of Array.isArray(group) ? group : []) {
      const snapshot = attachmentSnapshot(attachment);
      if (!snapshot.id || byId.has(snapshot.id)) continue;
      byId.set(snapshot.id, snapshot);
    }
  }
  return [...byId.values()];
}

async function stageRoomAttachments(apiUrl, roomIssueId, attachments, workingDirectory) {
  const workspaceRoot = path.resolve(String(workingDirectory || "").trim());
  const cacheRoot = roomAttachmentWorkspaceRoot(workspaceRoot);
  excludeWorkspaceRoomAttachments(workspaceRoot);
  cleanupRoomAttachmentCache(cacheRoot);
  const roomDirectory = path.join(cacheRoot, safeAttachmentPathSegment(roomIssueId));
  const staged = [];
  for (const attachment of attachments) {
    const attachmentId = textParam(attachment, "id");
    if (!attachmentId) throw new Error("An attached file did not have a SPS attachment id.");
    const directory = path.join(roomDirectory, safeAttachmentPathSegment(attachmentId));
    const localPath = path.join(directory, safeAttachmentFilename(roomAttachmentName(attachment)));
    const partialPath = `${localPath}.partial`;
    const response = await fetch(roomAttachmentContentUrl(apiUrl, attachment));
    if (!response.ok) throw new Error(`Could not read attached file ${roomAttachmentName(attachment)} (HTTP ${response.status}).`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(partialPath, Buffer.from(await response.arrayBuffer()));
    fs.rmSync(localPath, { force: true });
    fs.renameSync(partialPath, localPath);
    fs.utimesSync(directory, new Date(), new Date());
    staged.push({ ...attachment, localPath, isImage: isCodexImageAttachment(attachment) });
  }
  return staged;
}

function roomAttachmentCommentBlock(attachments) {
  if (!attachments.length) return "";
  const rows = attachments.map((attachment) => {
    const label = roomAttachmentName(attachment).replace(/([\[\]])/g, "\\$1");
    return `- [${label}](${attachmentContentPath(attachment)})`;
  });
  return `\n\n**Attached files**\n${rows.join("\n")}\n<!-- paperclip-room-attachments:${attachments.map((attachment) => attachment.id).join(",")} -->`;
}

function roomUserCommentBody(message, attachments, mode = "agent", retryOfCommentId = "") {
  const text = enforceUtf8Text(message, "Room message").trim() || "Please inspect the attached files.";
  const retryMarker = retryOfCommentId ? `\n<!-- paperclip-room-retry-of:${retryOfCommentId} -->` : "";
  return `**User**\n${text}${retryMarker}${roomAttachmentCommentBlock(attachments)}`;
}

const ROOM_RESPONSE_CONTRACT = [
  "SYSTEM-PROVIDED ROOM RESPONSE CONTRACT:",
  "- When the current request asks to show or preview an existing Workspace image, the final response must embed at least one relevant image with Markdown image syntax and a verified absolute local path.",
  "- On Windows, use this form: `![description](<C:/absolute/path/to/image.png>)`. The Room UI converts verified Workspace paths into safe inline previews and clickable file links.",
  "- Do not merely say that an image is shown. If no relevant image exists or its path cannot be verified, say that clearly instead of emitting a broken or invented path.",
  "- Use ordinary Markdown links with verified absolute local paths for other Workspace files that the user should inspect."
].join("\n");

function roomTurnText(message, stagedAttachments, retryOfCommentId = "") {
  const text = enforceUtf8Text(message, "Room message").trim() || "Please inspect the attached files and respond to the user.";
  const retryPreamble = retryOfCommentId
    ? `USER MESSAGE REVISION: This message replaces the earlier user message ${retryOfCommentId}. Treat this revision as the current request. Do not continue or answer the superseded version.\n\n`
    : "";
  if (!stagedAttachments.length) return `${retryPreamble}${text}\n\n${ROOM_RESPONSE_CONTRACT}`;
  const fileContext = stagedAttachments.map((attachment) => {
    const delivery = attachment.isImage ? "also supplied as an image input" : "available as a local file";
    return `- ${roomAttachmentName(attachment)} (${attachment.contentType}, ${attachment.byteSize} bytes): ${attachment.localPath} (${delivery})`;
  });
  return `${retryPreamble}${text}\n\nAttached Room files are durable SPS attachments. Inspect only the files relevant to the request and do not execute untrusted binaries.\n${fileContext.join("\n")}\n\n${ROOM_RESPONSE_CONTRACT}`;
}

function isRoomUserComment(comment) {
  return /^\*\*User\*\*/i.test(String(comment?.body || "").trim());
}

async function validateRoomRetrySource(ctx, companyId, issueId, retryOfCommentId) {
  const sourceCommentId = String(retryOfCommentId || "").trim();
  if (!sourceCommentId) return "";
  if (!ctx.issues.listComments) throw new Error("Room message retry is unavailable because Room comments could not be read.");
  const comments = await ctx.issues.listComments(issueId, companyId);
  const sourceComment = comments.find((comment) => comment.id === sourceCommentId);
  if (!sourceComment || !isRoomUserComment(sourceComment)) {
    throw new Error("The selected message is not a user message in this Room.");
  }
  return sourceCommentId;
}

async function putRoomDocument(apiUrl, input) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(input.issueId)}/documents/${encodeURIComponent(input.key)}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      // SPS's public document API stores durable bodies as Markdown.
      // JSON Room state remains valid content inside a Markdown document.
      format: "markdown",
      body: input.body,
      baseRevisionId: input.baseRevisionId,
      changeSummary: input.changeSummary
    })
  });
  if (!response.ok) {
    const error = new Error(`SPS Room document write failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function isRevisionConflict(error) {
  return error?.status === 409 || error?.status === 500;
}

async function retryRoomDocumentWrite(work) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      if (!isRevisionConflict(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 30 * (attempt + 1)));
    }
  }
  throw new Error("Room document write retry unexpectedly exhausted.");
}

async function getRoomDocumentDirect(apiUrl, issueId, key) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`;
  const response = await fetch(endpoint);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Room document read failed (${response.status}).`);
  return response.json();
}

async function saveRoomStateOutsideInvocation(apiUrl, issueId, state, changeSummary) {
  return queueRoomDocumentWrite(issueId, ROOM_STATE_KEY, async () => {
    return retryRoomDocumentWrite(async () => {
      const existing = await getRoomDocumentDirect(apiUrl, issueId, ROOM_STATE_KEY);
      return putRoomDocument(apiUrl, {
        issueId,
        key: ROOM_STATE_KEY,
        body: serializeState(state),
        title: "Room state",
        format: "markdown",
        baseRevisionId: existing?.latestRevisionId ?? null,
        changeSummary
      });
    });
  });
}

function roomWorkIssue(roomContext) {
  return { id: roomContext.issueId, projectId: roomContext.projectId ?? null };
}

async function loadRoomWorkStateDirect(apiUrl, roomContext) {
  const document = await getRoomDocumentDirect(apiUrl, roomContext.issueId, ROOM_WORK_STATE_KEY);
  return normalizeRoomWorkState(parseState(document?.body), roomWorkIssue(roomContext));
}

async function updateRoomWorkStateOutsideInvocation(roomContext, patch, changeSummary, updatedBy = {}) {
  return queueRoomDocumentWrite(roomContext.issueId, ROOM_WORK_STATE_KEY, async () => {
    return retryRoomDocumentWrite(async () => {
      const document = await getRoomDocumentDirect(roomContext.spsApiUrl, roomContext.issueId, ROOM_WORK_STATE_KEY);
      const issue = roomWorkIssue(roomContext);
      const current = normalizeRoomWorkState(parseState(document?.body), issue);
      const next = mergeRoomWorkState(current, patch, issue, updatedBy);
      await putRoomDocument(roomContext.spsApiUrl, {
        issueId: roomContext.issueId,
        key: ROOM_WORK_STATE_KEY,
        body: serializeState(next),
        title: "Room work state",
        format: "markdown",
        baseRevisionId: document?.latestRevisionId ?? null,
        changeSummary
      });
      return next;
    });
  });
}

async function appendCheckpointOutsideInvocation(apiUrl, issueId, checkpoint) {
  const document = await getRoomDocumentDirect(apiUrl, issueId, ROOM_CHECKPOINTS_KEY);
  let checkpoints = parseState(document?.body);
  if (!Array.isArray(checkpoints)) checkpoints = [];
  checkpoints.push(checkpoint);
  return putRoomDocument(apiUrl, {
    issueId,
    key: ROOM_CHECKPOINTS_KEY,
    body: serializeState(checkpoints),
    title: "Room checkpoints",
    format: "markdown",
    baseRevisionId: document?.latestRevisionId ?? null,
    changeSummary: "Append Room compact checkpoint"
  });
}

function nativeCompactionEventId(message) {
  const params = asRecord(message?.params);
  const threadId = textParam(params, "threadId");
  const turnId = textParam(params, "turnId");
  return threadId && turnId ? `${threadId}:${turnId}` : "";
}

async function appendNativeCompactionOutsideInvocation(apiUrl, issueId, event) {
  const document = await getRoomDocumentDirect(apiUrl, issueId, ROOM_NATIVE_COMPACTIONS_KEY);
  let events = parseState(document?.body);
  if (!Array.isArray(events)) events = [];
  if (events.some((entry) => entry?.id === event.id)) return events;
  events.push(event);
  await putRoomDocument(apiUrl, {
    issueId,
    key: ROOM_NATIVE_COMPACTIONS_KEY,
    body: serializeState(events.slice(-100)),
    title: "Native Codex compactions",
    format: "markdown",
    baseRevisionId: document?.latestRevisionId ?? null,
    changeSummary: "Record native Codex context compaction"
  });
  return events;
}

async function recordNativeCodexCompaction(ctx, message) {
  const itemCompaction = message?.method === "item/completed" && message?.params?.item?.type === "contextCompaction";
  const threadCompaction = message?.method === "thread/compacted";
  if (!itemCompaction && !threadCompaction) return false;
  const eventId = nativeCompactionEventId(message);
  const threadId = textParam(asRecord(message?.params), "threadId");
  const context = activeThreadContexts.get(threadId);
  if (!eventId || !context || manualCodexCompactionThreads.has(threadId) || recordedNativeCompactionEvents.has(eventId)) return false;
  recordedNativeCompactionEvents.add(eventId);
  const run = async () => {
    try {
      await appendNativeCompactionOutsideInvocation(context.spsApiUrl, context.issueId, {
        id: eventId,
        kind: "codex_native_auto",
        threadId,
        turnId: textParam(asRecord(message?.params), "turnId"),
        occurredAt: now(),
        note: "Codex compacted its internal context automatically. SPS conversation and checkpoints remain the durable Room record."
      });
      return true;
    } catch (error) {
      recordedNativeCompactionEvents.delete(eventId);
      ctx.logger?.warn?.("Could not record native Codex compaction.", {
        issueId: context.issueId,
        threadId,
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  };
  const previous = nativeCompactionLocks.get(context.issueId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(run);
  nativeCompactionLocks.set(context.issueId, next);
  try {
    return await next;
  } finally {
    if (nativeCompactionLocks.get(context.issueId) === next) nativeCompactionLocks.delete(context.issueId);
  }
}

async function createRoomCommentOutsideInvocation(apiUrl, issueId, body) {
  const endpoint = `${loopbackSPSApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/comments`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body })
  });
  if (!response.ok) throw new Error(`Room comment write failed (${response.status}).`);
  return response.json();
}

async function appendCheckpoint(ctx, companyId, issueId, checkpoint) {
  const document = await ctx.issues.documents.get(issueId, ROOM_CHECKPOINTS_KEY, companyId);
  let checkpoints = parseState(document?.body);
  if (!Array.isArray(checkpoints)) checkpoints = [];
  checkpoints.push(checkpoint);
  await upsertRoomDocument(ctx, {
    issueId,
    key: ROOM_CHECKPOINTS_KEY,
    body: serializeState(checkpoints),
    companyId,
    title: "Room checkpoints",
    format: "markdown",
    changeSummary: "Append Room compact checkpoint"
  });
}

function roomStreamChannel(issueId) {
  return `room:${issueId}`;
}

function emitRoomEvent(ctx, companyId, issueId, event) {
  if (!ctx.streams?.emit) return;
  const channel = roomStreamChannel(issueId);
  try {
    ctx.streams.open?.(channel, companyId);
    ctx.streams.emit(channel, { issueId, at: now(), ...event });
  } catch (error) {
    ctx.logger?.warn?.("Room stream event was not delivered.", {
      issueId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function roomJobTitle(kind) {
  return {
    room_message: "Room message",
    compact_handoff: "Room compact",
    task_owner_feedback: "Task owner feedback",
    task_owner_report: "Task owner report"
  }[kind] ?? "Room job";
}

function roomJobData(input) {
  return {
    id: input.id,
    companyId: input.companyId,
    roomIssueId: input.roomIssueId,
    taskIssueId: input.taskIssueId ?? null,
    kind: input.kind,
    status: input.status,
    sourceCommentId: input.sourceCommentId ?? null,
    requestedAt: input.requestedAt,
    startedAt: input.startedAt ?? null,
    completedAt: input.completedAt ?? null,
    resultCommentId: input.resultCommentId ?? null,
    error: input.error ?? null,
    payload: asRecord(input.payload)
  };
}

async function createRoomJob(ctx, input) {
  const job = roomJobData({ ...input, id: randomUUID(), status: "queued", requestedAt: now() });
  if (ctx.entities?.upsert) {
    await ctx.entities.upsert({
      entityType: ROOM_JOB_ENTITY_TYPE,
      scopeKind: "issue",
      scopeId: job.roomIssueId,
      externalId: job.id,
      title: roomJobTitle(job.kind),
      status: job.status,
      data: job
    });
  }
  return job;
}

async function updateRoomJob(ctx, job, patch) {
  const next = roomJobData({ ...job, ...patch });
  if (ctx.entities?.upsert) {
    await ctx.entities.upsert({
      entityType: ROOM_JOB_ENTITY_TYPE,
      scopeKind: "issue",
      scopeId: next.roomIssueId,
      externalId: next.id,
      title: roomJobTitle(next.kind),
      status: next.status,
      data: next
    });
  }
  return next;
}

async function listRoomJobs(ctx, issueId) {
  if (!ctx.entities?.list) return [];
  const records = await ctx.entities.list({
    entityType: ROOM_JOB_ENTITY_TYPE,
    scopeKind: "issue",
    scopeId: issueId,
    limit: 100
  });
  return records.map((record) => roomJobData(asRecord(record.data))).filter((job) => job.id && job.roomIssueId === issueId);
}

async function activeRoomJob(ctx, issueId) {
  const jobs = await listRoomJobs(ctx, issueId);
  return jobs.find((job) => ACTIVE_ROOM_JOB_STATUSES.has(job.status)) ?? null;
}

function isRoomProviderQuotaRetryJob(job) {
  const payload = asRecord(job?.payload);
  return textParam(job, "status") === "queued"
    && textParam(payload, "retryRuntime") === "agy"
    && Boolean(textParam(payload, "quotaRetryAt"));
}

async function scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error }) {
  if (!AUTOMATIC_PROVIDER_QUOTA_RETRY_ENABLED) {
    const quotaError = String(error instanceof Error ? error.message : error).slice(0, 500);
    const stoppedJob = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: quotaError,
      payload: {
        ...asRecord(job.payload),
        retryRuntime: null,
        quotaRetryAt: null,
        quotaError
      }
    });
    state.pendingTurn = null;
    state.runtime ??= {};
    state.runtime.lastError = quotaError;
    state.runtime.quotaRetry = {
      status: "disabled",
      runtime: "agy",
      automaticRetry: false,
      retryAt: null,
      updatedAt: now()
    };
    state.runtime.activity ??= { steps: [] };
    state.runtime.activity.status = "error";
    state.runtime.activity.updatedAt = now();
    state.runtime.activity.error = quotaError;
    if (Array.isArray(state.runtime.activity.steps)) {
      state.runtime.activity.steps.push({ id: `quota-block-${Date.now()}`, type: "runtime", label: "Agy quota reached; automatic retry is disabled", status: "error", updatedAt: now() });
    }
    await saveRoomStateOutsideInvocation(runtime.spsApiUrl, issue.id, state, "Record Agy quota block without automatic retry");
    emitRoomEvent(ctx, job.companyId, issue.id, { type: "quota_retry_disabled", job: stoppedJob });
    return { ok: true, retryScheduled: false, retryDisabled: true, job: stoppedJob };
  }
  const current = Date.now();
  const retryAt = providerQuotaRetryAtFromError(error, current);
  const priorAttempt = Math.max(0, Number(asRecord(job.payload).quotaRetryAttempt) || 0);
  const payload = {
    ...asRecord(job.payload),
    retryRuntime: "agy",
    quotaRetryAt: retryAt,
    quotaRetryAttempt: priorAttempt + 1,
    quotaError: String(error instanceof Error ? error.message : error).slice(0, 500)
  };
  const queuedJob = await updateRoomJob(ctx, job, {
    status: "queued",
    startedAt: null,
    completedAt: null,
    error: null,
    payload
  });
  state.pendingTurn = {
    ...asRecord(state.pendingTurn),
    kind: queuedJob.kind,
    jobId: queuedJob.id,
    sourceCommentId: queuedJob.sourceCommentId ?? null,
    retryRuntime: "agy",
    retryAt,
    quotaRetryAttempt: payload.quotaRetryAttempt
  };
  state.runtime ??= {};
  state.runtime.lastError = payload.quotaError;
  state.runtime.quotaRetry = {
    status: "waiting",
    runtime: "agy",
    retryAt,
    attempt: payload.quotaRetryAttempt,
    updatedAt: now()
  };
  state.runtime.activity ??= { steps: [] };
  state.runtime.activity.status = "waiting";
  state.runtime.activity.updatedAt = now();
  state.runtime.activity.error = null;
  if (Array.isArray(state.runtime.activity.steps)) {
    state.runtime.activity.steps.push({ id: `quota-wait-${Date.now()}`, type: "runtime", label: "Agy quota reached; retrying in 30 minutes", status: "waiting", updatedAt: now() });
  }
  await saveRoomStateOutsideInvocation(runtime.spsApiUrl, issue.id, state, "Keep Room Job queued for the next Agy quota retry");
  emitRoomEvent(ctx, job.companyId, issue.id, { type: "quota_retry_scheduled", job: queuedJob, retryAt });
  return { ok: true, retryScheduled: true, retryAt, job: queuedJob };
}

async function launchDueRoomProviderQuotaRetry(ctx, job, current = Date.now()) {
  if (!isRoomProviderQuotaRetryJob(job)) return { launched: false, reason: "not_quota_retry" };
  if (job.kind === "task_owner_report" && job.taskIssueId) {
    const task = await ctx.issues.get(job.taskIssueId, job.companyId).catch(() => null);
    if (task && !TASK_OWNER_REPORT_STATUSES.has(task.status)) {
      const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, job.companyId);
      const taskState = parseState(taskStateDocument?.body);
      const ownerRoom = task.parentId ? await ctx.issues.get(task.parentId, job.companyId).catch(() => null) : null;
      if (taskState?.kind === "task_room" && ownerRoom) {
        const cancelled = await cancelResolvedTaskOwnerQuotaRetry(ctx, {
          companyId: job.companyId,
          task,
          taskState,
          ownerRoom
        });
        return { launched: false, cancelled, reason: "task_status_changed" };
      }
    }
  }
  const retryAt = new Date(textParam(asRecord(job.payload), "quotaRetryAt") || 0).getTime();
  if (!Number.isFinite(retryAt) || retryAt > current) return { launched: false, reason: "not_due" };
  if (activeRoomMessageJobs.has(job.roomIssueId)) return { launched: false, reason: "room_busy" };
  const { issue, agent } = await requireRoom(ctx, job.companyId, job.roomIssueId);
  const state = await loadRoomState(ctx, job.companyId, issue, agent);
  if (textParam(state.pendingTurn, "jobId") !== job.id) return { launched: false, reason: "pending_turn_changed" };
  state.pendingTurn = { ...asRecord(state.pendingTurn), startedAt: now(), retryAt: null, retryRuntime: "agy" };
  beginRoomActivity(state, job.kind, job.id, job.sourceCommentId ?? null);
  state.runtime.activity.steps.push({ id: `quota-retry-${Date.now()}`, type: "runtime", label: "Retrying queued Room turn with Agy", status: "working", updatedAt: now() });
  await saveRoomState(ctx, job.companyId, issue.id, state, "Start due Agy provider quota Room retry");
  const runtime = await getRuntimeConfig(ctx);
  const started = startDurableRoomJob(ctx, { companyId: job.companyId, runtime, job });
  return { launched: started, reason: started ? "launched" : "room_busy" };
}

async function reconcileRoomProviderQuotaRetries(ctx, options = {}) {
  if (activeRoomQuotaRetryReconcile) return activeRoomQuotaRetryReconcile;
  const operation = (async () => {
    if (!ctx.entities?.list) return { scanned: 0, launched: 0, waiting: 0, failed: 0 };
    const current = Number(options.current) || Date.now();
    const records = await ctx.entities.list({ entityType: ROOM_JOB_ENTITY_TYPE, limit: 500 });
    const summary = { scanned: 0, launched: 0, waiting: 0, failed: 0 };
    for (const record of records) {
      const job = roomJobData(asRecord(record.data));
      if (!isRoomProviderQuotaRetryJob(job)) continue;
      summary.scanned += 1;
      try {
        const result = await launchDueRoomProviderQuotaRetry(ctx, job, current);
        if (result.launched) summary.launched += 1;
        else summary.waiting += 1;
      } catch (error) {
        summary.failed += 1;
        ctx.logger?.warn?.("Queued Room provider quota retry could not be launched.", {
          roomIssueId: job.roomIssueId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return summary;
  })();
  activeRoomQuotaRetryReconcile = operation;
  try {
    return await operation;
  } finally {
    if (activeRoomQuotaRetryReconcile === operation) activeRoomQuotaRetryReconcile = null;
  }
}

async function cancelResolvedTaskOwnerQuotaRetry(ctx, { companyId, task, taskState, ownerRoom }) {
  if (TASK_OWNER_REPORT_STATUSES.has(task.status)) return false;
  const jobs = await listRoomJobs(ctx, ownerRoom.id);
  const agent = await ctx.agents.get(agentRoomAgentId(ownerRoom), companyId);
  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  const pendingJobId = textParam(ownerState.pendingTurn, "jobId");
  const notifiedJobId = textParam(asRecord(taskState.ownerNotification), "jobId");
  const job = jobs.find((candidate) => (
    candidate.kind === "task_owner_report"
    && candidate.taskIssueId === task.id
    && (
      isRoomProviderQuotaRetryJob(candidate)
      || (pendingJobId && candidate.id === pendingJobId)
    )
  ));
  const resolvedJobId = job?.id || (pendingJobId && pendingJobId === notifiedJobId ? pendingJobId : "");
  if (!resolvedJobId) return false;

  if (job && ACTIVE_ROOM_JOB_STATUSES.has(job.status)) {
    await updateRoomJob(ctx, job, {
      status: "cancelled",
      completedAt: now(),
      error: `Task moved to ${task.status}; the queued owner report is no longer current.`,
      payload: { ...asRecord(job.payload), quotaRetryAt: null }
    });
  }
  if (textParam(ownerState.pendingTurn, "jobId") === resolvedJobId) {
    ownerState.pendingTurn = null;
    ownerState.runtime ??= {};
    ownerState.runtime.quotaRetry = {
      status: "cancelled",
      runtime: "agy",
      reason: "task_status_changed",
      taskStatus: task.status,
      updatedAt: now()
    };
    finishRoomActivity(ownerState, "completed");
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Release resolved Task owner report quota retry");
  }

  taskState.review = {
    ...asRecord(taskState.review),
    status: "user_reviewed",
    reviewedAt: now(),
    updatedAt: now()
  };
  taskState.ownerNotification = {
    ...asRecord(taskState.ownerNotification),
    status: "completed",
    taskStatus: task.status,
    jobId: resolvedJobId,
    resolvedBy: "task_status_change",
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Close obsolete Task owner report after user resolution"
  });
  return true;
}

async function roomHasActiveWork(ctx, issueId, state) {
  const processJob = activeRoomMessageJobs.get(issueId) ?? null;
  let jobs = await listRoomJobs(ctx, issueId);
  jobs = await reconcileRoomJobLedger(ctx, issueId, state, jobs);
  const persistedJob = jobs.find((job) => ACTIVE_ROOM_JOB_STATUSES.has(job.status)) ?? null;
  const pendingKind = textParam(asRecord(state?.pendingTurn), "kind");
  const activityStatus = textParam(asRecord(state?.runtime?.activity), "status");
  const stateBusy = Boolean(pendingKind) || ["working", "finishing"].includes(activityStatus);

  if (processJob && !persistedJob && !stateBusy) {
    if (activeRoomMessageJobs.get(issueId) === processJob) activeRoomMessageJobs.delete(issueId);
    ctx.logger?.warn?.("Released a stale in-memory Room busy marker after durable completion.", { issueId });
    return false;
  }
  return Boolean(processJob || persistedJob || stateBusy);
}

function terminalRoomJobPatchFromState(job, state) {
  if (textParam(state?.pendingTurn, "jobId") === job.id) return null;
  const activity = asRecord(state?.runtime?.activity);
  const activityMatchesJob = textParam(activity, "jobId") === job.id;
  const status = activityMatchesJob && ["completed", "failed"].includes(textParam(activity, "status"))
    ? textParam(activity, "status")
    : "interrupted";
  return {
    status,
    completedAt: textParam(activity, "updatedAt") || now(),
    resultCommentId: activityMatchesJob ? textParam(activity, "resultCommentId") || null : null,
    error: status === "failed"
      ? textParam(activity, "error") || "The Room Job failed after its Codex turn started."
      : status === "interrupted"
        ? "The Room worker restarted before this Job completed. The submitted message and Room state were preserved."
        : null
  };
}

async function reconcileRoomJobLedger(ctx, issueId, state, knownJobs = null) {
  const jobs = knownJobs ?? await listRoomJobs(ctx, issueId);
  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (!ACTIVE_ROOM_JOB_STATUSES.has(job.status)) continue;
    const patch = terminalRoomJobPatchFromState(job, state);
    if (!patch) continue;
    jobs[index] = await updateRoomJob(ctx, job, patch);
    await reconcileTaskOwnerNotificationForJob(ctx, jobs[index]).catch(() => null);
  }
  return jobs;
}

function queueRoom(roomId, work) {
  const previous = roomLocks.get(roomId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  roomLocks.set(roomId, current.catch(() => {}));
  return current;
}

function trackActiveRoomJob(ctx, issueId, promise, errorMessage = "Background Room Job failed.") {
  activeRoomMessageJobs.set(issueId, promise);
  promise.then(
    () => {},
    (error) => ctx.logger?.error?.(errorMessage, { issueId, message: error instanceof Error ? error.message : String(error) })
  ).finally(() => {
    if (activeRoomMessageJobs.get(issueId) === promise) activeRoomMessageJobs.delete(issueId);
  });
  return promise;
}

function queueRoomDocumentWrite(issueId, key, work) {
  const lockKey = `${issueId}:${key}`;
  const previous = roomDocumentWriteLocks.get(lockKey) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  roomDocumentWriteLocks.set(lockKey, current);
  return current.finally(() => {
    if (roomDocumentWriteLocks.get(lockKey) === current) roomDocumentWriteLocks.delete(lockKey);
  });
}

function mostRecentComments(comments, limit = 100) {
  return [...(Array.isArray(comments) ? comments : [])]
    .sort((left, right) => new Date(left?.createdAt || 0).getTime() - new Date(right?.createdAt || 0).getTime())
    .slice(-limit);
}

function roomTaskBriefSnapshot(task) {
  return {
    id: task.id,
    identifier: task.identifier ?? null,
    title: task.title ?? "Untitled Task",
    status: task.status ?? "unknown",
    assigneeAgentId: task.assigneeAgentId ?? null,
    updatedAt: task.updatedAt ?? task.completedAt ?? task.createdAt ?? null
  };
}

async function listOwnedRoomTasksForBrief(ctx, companyId, issue) {
  if (!issue.projectId || typeof ctx.issues?.list !== "function") return [];
  const issues = await ctx.issues.list({ companyId, projectId: issue.projectId, limit: 500 });
  return issues
    .filter((candidate) => candidate.parentId === issue.id && !isLongLivedRoom(candidate))
    .map(roomTaskBriefSnapshot)
    .sort((left, right) => {
      const leftReview = new Set(["in_review", "blocked"]).has(left.status) ? 0 : 1;
      const rightReview = new Set(["in_review", "blocked"]).has(right.status) ? 0 : 1;
      if (leftReview !== rightReview) return leftReview - rightReview;
      return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    });
}

function roomWorkOutcomeLabel(outcome) {
  if (!outcome) return "Not recorded.";
  const reference = outcome.identifier || outcome.taskId || "Room outcome";
  const status = outcome.status ? ` [${outcome.status}]` : "";
  return `${reference}${status}: ${outcome.summary || "No summary recorded."}`;
}

function roomWorkCandidateLabel(candidate) {
  if (!candidate) return "Not established.";
  return `${candidate.kind ? `${candidate.kind}: ` : ""}${candidate.summary}`;
}

function buildRoomOperatingBrief(workState, tasks = [], agent = null) {
  const active = tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status));
  const review = tasks.filter((task) => new Set(["in_review", "blocked"]).has(task.status));
  const latestTerminal = tasks
    .filter((task) => new Set(["done", "blocked", "cancelled"]).has(task.status))
    .sort((left, right) => new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime())
    .at(0) ?? null;
  const taskLines = tasks.slice(0, 8).map((task) => {
    const reference = task.identifier || task.id;
    return `- ${reference} | ${task.status} | ${task.title} | assignee=${task.assigneeAgentId || "unassigned"}`;
  });
  const waiting = normalizeRoomWaitingFor(workState?.waitingFor);
  const references = roomWorkReferences(workState?.planReferences);
  const workerBoundary = roomWorkplaneBoundary(agent);
  const nextActionInstruction = workerBoundary
    ? "This Worker Room is for discussion and read-only context only. Do not perform production work here. If the current request needs a repository change, asset generation, build, external service action, or Task lifecycle operation, explain that the responsible Lead must create and assign a finite Task first."
    : "Decide the next action yourself; the runtime only supplies state and enforces Task ownership/collision boundaries. Interpret the current request against this state. When it clearly authorizes one in-scope reversible action, perform and report that action in this turn. If a consequential choice or multiple valid next actions remain, ask one focused question.";
  return [
    "ROOM OPERATING BRIEF (system-provided current state; not a user message or automatic controller decision).",
    "Use this small bookmark with the current user request, current AGENTS.md, repository sources, and live Task facts. Repository files remain the authority for product/design/implementation content.",
    `OBJECTIVE: ${workState?.objective || "Not established yet."}`,
    `PHASE: ${workState?.phase || "Not established yet."}`,
    `LATEST RECORDED OUTCOME: ${roomWorkOutcomeLabel(workState?.latestOutcome)}`,
    `PLAN/SOURCE POINTERS:\n${references.length ? references.map((reference) => `- ${reference}`).join("\n") : "- None recorded."}`,
    `NEXT CANDIDATE: ${roomWorkCandidateLabel(workState?.nextCandidate)}`,
    `PERSISTED WAITING BOUNDARY: ${waiting.kind}${waiting.taskId ? ` | task=${waiting.taskId}` : ""}${waiting.detail ? ` | ${waiting.detail}` : ""}`,
    `LIVE OWNED TASKS (${tasks.length} total, ${active.length} active, ${review.length} needing owner review/blocker handling):\n${taskLines.length ? taskLines.join("\n") : "- None."}`,
    `LATEST TERMINAL TASK: ${latestTerminal ? `${latestTerminal.identifier || latestTerminal.id} | ${latestTerminal.status} | ${latestTerminal.title}` : "None."}`,
    nextActionInstruction,
    workerBoundary,
    "When the semantic objective, phase, source pointers, latest outcome, next candidate, or waiting boundary changes, call paperclip.update_room_work_state before the final response. Do not copy full project documents or duplicate the Task list into Room Work State.",
    "END ROOM OPERATING BRIEF."
  ].join("\n\n");
}

async function prepareRoomOperatingBrief(ctx, { companyId, issue, state, agent = null }) {
  let roomAgent = agent;
  if (!roomAgent && state?.agentId && typeof ctx.agents?.get === "function") {
    roomAgent = await ctx.agents.get(state.agentId, companyId).catch(() => null);
  }
  const [workState, tasks] = await Promise.all([
    loadRoomWorkState(ctx, companyId, issue),
    listOwnedRoomTasksForBrief(ctx, companyId, issue)
  ]);
  return { workState, tasks, text: buildRoomOperatingBrief(workState, tasks, roomAgent) };
}

function buildRoomRecoveryContext(state, comments, excludedCommentId = "") {
  const checkpoint = asRecord(state?.checkpoint);
  const checkpointSummary = trimRoomContext(checkpoint.summary, 10000);
  const checkpointSourceId = textParam(checkpoint, "sourceCommentId");
  const excludedId = String(excludedCommentId || "").trim();
  const ordered = mostRecentComments(comments, Number.MAX_SAFE_INTEGER)
    .filter((comment) => comment?.id !== excludedId && String(comment?.body || "").trim());
  let candidates = ordered;
  if (checkpointSummary && checkpointSourceId) {
    const checkpointIndex = ordered.findIndex((comment) => comment.id === checkpointSourceId);
    if (checkpointIndex >= 0) candidates = ordered.slice(checkpointIndex + 1);
  }
  candidates = candidates.slice(-ROOM_CONTEXT_RECOVERY_COMMENT_LIMIT);

  const selected = [];
  let used = checkpointSummary.length;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const comment = candidates[index];
    const timestamp = textParam(comment, "createdAt") || "unknown time";
    const body = trimRoomContext(comment?.body, ROOM_CONTEXT_RECOVERY_ENTRY_LIMIT);
    const entry = `[${timestamp} | comment ${comment.id || "unknown"}]\n${body}`;
    if (selected.length && used + entry.length > ROOM_CONTEXT_RECOVERY_CHAR_LIMIT) break;
    selected.push(entry);
    used += entry.length;
  }
  selected.reverse();
  const latestCommentId = candidates.at(-1)?.id || checkpointSourceId || null;
  return {
    latestCommentId,
    text: [
      "ROOM CONTEXT RECOVERY FROM SPS.",
      "This is durable prior context, not a new user request. Use it to resolve references and continue the current Room conversation. Current AGENTS.md, current Task state, and current SPS tools override obsolete operating instructions in old messages.",
      `DURABLE CHECKPOINT:\n${checkpointSummary || "No prior checkpoint exists. Recover from the transcript below."}`,
      `ROOM TRANSCRIPT AFTER CHECKPOINT:\n${selected.join("\n\n---\n\n") || "No earlier Room comments were available."}`,
      "END ROOM CONTEXT RECOVERY."
    ].join("\n\n")
  };
}

async function prepareCodexRoomTurn(ctx, { companyId, issue, state, threadId, currentText, excludedCommentId = "" }) {
  const operating = await prepareRoomOperatingBrief(ctx, { companyId, issue, state });
  if (textParam(state?.runtime, "contextHydratedThreadId") === threadId) {
    return {
      text: `${operating.text}\n\nCURRENT TURN REQUEST:\n${currentText}`,
      hydrated: false,
      latestCommentId: null,
      workState: operating.workState
    };
  }
  const comments = typeof ctx.issues?.listComments === "function"
    ? await ctx.issues.listComments(issue.id, companyId)
    : [];
  const recovery = buildRoomRecoveryContext(state, comments, excludedCommentId);
  return {
    text: `${recovery.text}\n\n${operating.text}\n\nCURRENT TURN REQUEST:\n${currentText}`,
    hydrated: true,
    latestCommentId: recovery.latestCommentId,
    workState: operating.workState
  };
}

async function prepareNativeRoomTurn(ctx, { companyId, issue, state, sessionId, currentText, excludedCommentId = "" }) {
  const operating = await prepareRoomOperatingBrief(ctx, { companyId, issue, state });
  if (textParam(state?.runtime, "contextHydratedNativeSessionId") === sessionId) {
    return {
      text: `${operating.text}\n\nCURRENT TURN REQUEST:\n${currentText}`,
      hydrated: false,
      latestCommentId: null,
      workState: operating.workState
    };
  }
  const comments = typeof ctx.issues?.listComments === "function"
    ? await ctx.issues.listComments(issue.id, companyId)
    : [];
  const recovery = buildRoomRecoveryContext(state, comments, excludedCommentId);
  return {
    text: `${recovery.text}\n\n${operating.text}\n\nCURRENT TURN REQUEST:\n${currentText}`,
    hydrated: true,
    latestCommentId: recovery.latestCommentId,
    workState: operating.workState
  };
}

function markCodexRoomContextHydrated(state, threadId, prepared) {
  if (!prepared?.hydrated) return;
  state.runtime.contextHydratedThreadId = threadId;
  state.runtime.contextHydratedAt = now();
  state.runtime.contextHydratedThroughCommentId = prepared.latestCommentId ?? null;
}

function markNativeRoomContextHydrated(state, sessionId, prepared) {
  if (!prepared?.hydrated) return;
  state.runtime.contextHydratedNativeSessionId = sessionId;
  state.runtime.contextHydratedNativeAt = now();
  state.runtime.contextHydratedNativeThroughCommentId = prepared.latestCommentId ?? null;
}

async function getRuntimeConfig(ctx) {
  const config = asRecord(await ctx.config.get());
  return {
    enabled: config.enableCodexRooms === true,
    enableCodexRooms: config.enableCodexRooms === true,
    enableAgyRooms: config.enableAgyRooms !== false,
    command: textParam(config, "codexCommand", "codex"),
    model: textParam(config, "codexModel", "") || null,
    codexHome: textParam(config, "codexHome", "") || null,
    codexSandbox: codexRoomSandbox(textParam(config, "codexRoomSandbox", "danger-full-access")),
    codexApprovalPolicy: codexRoomApprovalPolicy(textParam(config, "codexRoomApprovalPolicy", "never")),
    // A provider switch is an explicit product choice, not a hidden retry.
    enableAgyQuotaFallback: config.enableAgyQuotaFallback === true,
    agyFallbackCommand: textParam(config, "agyFallbackCommand", defaultAgyCommand()),
    agyFallbackModel: textParam(config, "agyFallbackModel", "gemini-3.1-pro-high"),
    agyFallbackPrintTimeout: textParam(config, "agyFallbackPrintTimeout", "2h"),
    agyFallbackTimeoutMs: Math.max(0, Number(config.agyFallbackTimeoutSec) || 0) * 1000,
    enableTaskAssignment: config.enableTaskAssignment === true,
    // Prefer the SPS setting while accepting the legacy key from an existing installation.
    spsApiUrl: loopbackSPSApiUrl(textParam(config, "spsApiUrl", textParam(config, "paperclipApiUrl", "http://127.0.0.1:3100")))
  };
}

function isLoopbackHost(host) {
  return new Set(["127.0.0.1", "localhost", "::1"]).has(String(host || "").trim().toLowerCase());
}

function paperclipInstanceConfigPath() {
  const configured = String(process.env.PAPERCLIP_CONFIG_PATH || "").trim();
  return configured || path.join(os.homedir(), ".sps", "instances", "default", "config.json");
}

function environmentHasAuthenticationSecret(environmentPath) {
  try {
    const lines = fs.readFileSync(environmentPath, "utf8").split(/\r?\n/);
    return lines.some((line) => {
      const match = /^\s*(BETTER_AUTH_SECRET|PAPERCLIP_AGENT_JWT_SECRET)\s*=\s*(.*)$/.exec(line);
      if (!match) return false;
      return match[2].trim().replace(/^['\"]|['\"]$/g, "").length > 0;
    });
  } catch {
    return false;
  }
}

function collaborationReadinessFromConfig(config, { hasAuthenticationSecret = false } = {}) {
  const server = asRecord(asRecord(config).server);
  const auth = asRecord(asRecord(config).auth);
  const deploymentMode = textParam(server, "deploymentMode", "local_trusted");
  const exposure = textParam(server, "exposure", "private");
  const listenHost = textParam(server, "host", "127.0.0.1");
  const inferredBind = isLoopbackHost(listenHost) ? "loopback" : new Set(["0.0.0.0", "::"]).has(listenHost) ? "lan" : "custom";
  const bind = textParam(server, "bind", inferredBind);
  const port = Number(server.port) || 3100;
  const allowedHostnames = Array.isArray(server.allowedHostnames)
    ? server.allowedHostnames.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const checks = [];
  const warnings = [];
  const localOnlySafeDefault = deploymentMode === "local_trusted" && bind === "loopback";

  if (localOnlySafeDefault) {
    checks.push({ label: "Access mode", status: "pass", message: "Local-only mode is safely bound to this computer." });
  } else if (deploymentMode === "authenticated") {
    checks.push({
      label: "Authentication secret",
      status: hasAuthenticationSecret ? "pass" : "fail",
      message: hasAuthenticationSecret
        ? "An authentication secret is configured."
        : "Authenticated access needs BETTER_AUTH_SECRET or PAPERCLIP_AGENT_JWT_SECRET in the SPS .env file."
    });
  } else {
    checks.push({ label: "Access mode", status: "fail", message: "Non-local access must use authenticated mode." });
  }

  if (deploymentMode === "authenticated" && exposure === "private") {
    if (bind === "tailnet") {
      checks.push({ label: "Private network", status: "pass", message: "Tailnet private collaboration is configured." });
    } else if (bind === "lan") {
      checks.push({ label: "Private network", status: "warn", message: "Authenticated LAN access is configured. Prefer Tailnet for collaborators outside a trusted LAN." });
    } else {
      checks.push({ label: "Private network", status: "fail", message: "Private collaboration needs a Tailnet or trusted LAN binding." });
    }
    checks.push({
      label: "Trusted hostname",
      status: allowedHostnames.length > 0 ? "pass" : "fail",
      message: allowedHostnames.length > 0
        ? `${allowedHostnames.length} trusted private hostname${allowedHostnames.length === 1 ? " is" : "s are"} configured.`
        : "Add the Tailnet DNS name or trusted private hostname before inviting a collaborator."
    });
  }

  if (deploymentMode === "authenticated" && exposure === "public") {
    const publicBaseUrl = textParam(auth, "publicBaseUrl");
    const hasHttpsBaseUrl = textParam(auth, "baseUrlMode") === "explicit" && publicBaseUrl.startsWith("https://");
    checks.push({
      label: "Public URL",
      status: hasHttpsBaseUrl ? "pass" : "fail",
      message: hasHttpsBaseUrl
        ? "A public HTTPS URL is configured."
        : "Public access needs an explicit HTTPS auth.publicBaseUrl."
    });
  }

  const hasFailures = checks.some((check) => check.status === "fail");
  const collaborationReady = deploymentMode === "authenticated" && bind !== "loopback" && !hasFailures;
  const state = localOnlySafeDefault ? "local_only" : collaborationReady ? "collaboration_ready" : "configuration_incomplete";
  const recommendation = state === "local_only"
    ? "Solo work is ready. For a friend, configure authenticated private Tailnet access rather than exposing this computer directly."
    : state === "collaboration_ready"
      ? "Invite the collaborator as an Operator, then complete the two-person browser acceptance checklist."
      : "Fix the failed checks, restart the Workplane, and run this check again before inviting collaborators.";

  return {
    state,
    localOnlySafeDefault,
    collaborationReady,
    server: { deploymentMode, exposure, bind, listenHost, port, allowedHostnameCount: allowedHostnames.length },
    checks,
    warnings,
    recommendation
  };
}

function readCollaborationReadiness() {
  try {
    const configPath = paperclipInstanceConfigPath();
    if (!fs.existsSync(configPath)) {
      return {
        state: "configuration_unavailable",
        localOnlySafeDefault: false,
        collaborationReady: false,
        server: null,
        checks: [{ label: "SPS configuration", status: "fail", message: "The local SPS configuration file was not found." }],
        warnings: [],
        recommendation: "Start the Workplane once to create its local configuration, then check this page again."
      };
    }
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const environmentPath = path.join(path.dirname(configPath), ".env");
    return collaborationReadinessFromConfig(config, { hasAuthenticationSecret: environmentHasAuthenticationSecret(environmentPath) });
  } catch {
    return {
      state: "configuration_unavailable",
      localOnlySafeDefault: false,
      collaborationReady: false,
      server: null,
      checks: [{ label: "SPS configuration", status: "fail", message: "The local SPS configuration could not be read." }],
      warnings: [],
      recommendation: "Fix the local SPS configuration, restart the Workplane, then check this page again."
    };
  }
}

const PROVIDER_QUOTA_ERROR_RE = /(?:provider_quota|resource_exhausted|usage[_\s-]?limit|quota|rate[_\s-]?limit|too many requests|\b429\b|weekly limit|5[-\s]?hour limit)/i;
const AGY_FALLBACK_MAX_TOOL_STEPS = 10;

function errorDiagnosticText(error) {
  let data = "";
  try {
    data = JSON.stringify(error?.data ?? error?.cause ?? {});
  } catch {
    data = "";
  }
  return `${error instanceof Error ? error.message : String(error || "")}\n${data}`;
}

function isProviderQuotaError(error) {
  return textParam(error, "code") === PROVIDER_QUOTA_ERROR_CODE
    || textParam(error, "errorFamily") === PROVIDER_QUOTA_ERROR_CODE
    || PROVIDER_QUOTA_ERROR_RE.test(errorDiagnosticText(error));
}

function providerQuotaRetryAtFromError(error, current = Date.now()) {
  const requestedAt = new Date(textParam(error, "retryNotBefore") || 0).getTime();
  return new Date(Math.max(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS, Number.isFinite(requestedAt) ? requestedAt : 0)).toISOString();
}

function roomToolContext(runtime, companyId, issue, agent, mode = "agent", workspaceProfile = null) {
  const workplaneIdentity = resolveAgentWorkplaneIdentity(agent);
  return {
    companyId,
    issueId: issue.id,
    projectId: issue.projectId ?? null,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role ?? null,
    workplaneRole: workplaneIdentity.roleId,
    workplaneIdentity,
    spsApiUrl: runtime.spsApiUrl,
    enableTaskAssignment: runtime.enableTaskAssignment,
    mode: roomMessageMode(mode),
    // Dynamic CLI tool calls outlive the plugin invocation. Carry the durable
    // Project routing decision into that call instead of reading plugin storage.
    workspaceProfile: asRecord(workspaceProfile)
  };
}

function workplaneIdentityForRoomContext(roomContext) {
  if (roomContext?.workplaneIdentity?.capabilities) return roomContext.workplaneIdentity;
  return resolveAgentWorkplaneIdentity({
    name: roomContext?.agentName,
    role: roomContext?.workplaneRole || roomContext?.agentRole,
    adapterConfig: {
      workplane: asRecord(roomContext?.workplanePolicy)
    }
  });
}

function roomHasWorkplaneCapability(roomContext, capability) {
  return hasWorkplaneCapability(workplaneIdentityForRoomContext(roomContext), capability);
}

function flatRoomToolCatalog() {
  return roomTools().flatMap((namespace) => (namespace.tools || []).map((tool) => ({
    name: `${namespace.name}.${tool.name}`,
    description: tool.description,
    inputSchema: tool.inputSchema
  })));
}

function parseAgyFallbackEnvelope(text) {
  const raw = enforceUtf8Text(String(text || "").trim(), "Agy fallback output");
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim() || raw;
  let value;
  try {
    value = JSON.parse(fenced);
  } catch {
    return { type: "final", message: raw };
  }
  const record = asRecord(value);
  if (textParam(record, "type") === "tool_call") {
    return {
      type: "tool_call",
      name: textParam(record, "name"),
      arguments: asRecord(record.arguments)
    };
  }
  if (textParam(record, "type") === "final" && textParam(record, "message")) {
    return { type: "final", message: rawTextParam(record, "message").trim() };
  }
  return { type: "final", message: raw };
}

function agyFallbackProtocolPrompt({ agent, state, instructions, preparedText, stagedAttachments, history }) {
  const files = stagedAttachments.length
    ? stagedAttachments.map((attachment) => `- ${roomAttachmentName(attachment)}: ${attachment.localPath}`).join("\n")
    : "None";
  return [
    `You are ${agent.name}, continuing the same long-lived SPS Room turn because its primary Codex account reached provider quota.`,
    "Follow the managed AGENTS.md and the exact current Room request. Do not mention runtime failover unless it materially affects the requested result.",
    "SPS mutations are allowed only through the JSON tool protocol below. Never claim a Task, comment, status, or memory mutation unless the corresponding tool result says ok=true.",
    roomWorkplaneBoundary(agent),
    "Return exactly one JSON object and no surrounding prose on each step.",
    'To call a tool: {"type":"tool_call","name":"paperclip.tool_name","arguments":{...}}',
    'To answer the user: {"type":"final","message":"complete Markdown response"}',
    `MANAGED AGENTS.md:\n${trimRoomContext(instructions, 16000) || "No additional role instructions were supplied."}`,
    `DURABLE CHECKPOINT:\n${trimRoomContext(state?.checkpoint?.summary, 6000) || "No checkpoint exists yet."}`,
    `AVAILABLE PAPERCLIP TOOLS:\n${JSON.stringify(flatRoomToolCatalog())}`,
    `ATTACHED LOCAL FILES:\n${files}`,
    `CURRENT ROOM CONTEXT AND REQUEST:\n${preparedText}`,
    history.length ? `TOOL PROTOCOL HISTORY:\n${history.join("\n\n")}` : "TOOL PROTOCOL HISTORY:\nNone",
    "Return the next single JSON object now."
  ].join("\n\n");
}

async function runAgyRoomFallback(ctx, {
  runtime,
  companyId,
  issue,
  agent,
  state,
  workingDirectory,
  preparedText,
  stagedAttachments = [],
  mode = "agent"
}) {
  const fallbackRuntime = roomRuntimeWithRoomSafety(agent, {
    kind: "agy_print",
    command: runtime.agyFallbackCommand || defaultAgyCommand(),
    model: runtime.agyFallbackModel || "gemini-3.1-pro-high",
    sandbox: false,
    timeoutMs: runtime.agyFallbackTimeoutMs || 0,
    extraArgs: ["--print-timeout", runtime.agyFallbackPrintTimeout || "2h"],
    env: {}
  });
  const client = testAgyClientFactory
    ? testAgyClientFactory({ roomRuntime: fallbackRuntime, workingDirectory, agent, fallback: true })
    : new AgyRoomClient({
        command: fallbackRuntime.command,
        cwd: workingDirectory,
        env: process.env,
        model: fallbackRuntime.model,
        sandbox: false,
        extraArgs: fallbackRuntime.extraArgs,
        requestTimeoutMs: fallbackRuntime.timeoutMs
  });
  const syntheticThreadId = `agy-fallback-${randomUUID()}`;
  const fallbackWorkspaces = await listProjectWorkspaces(ctx, companyId, issue.projectId);
  const fallbackWorkspaceProfile = await loadProjectWorkspaceProfile(ctx, issue.projectId, fallbackWorkspaces);
  const fallbackMode = isWorkerOnlyRoomAgent(agent) ? "ask" : mode;
  activeThreadContexts.set(syntheticThreadId, roomToolContext(runtime, companyId, issue, agent, fallbackMode, fallbackWorkspaceProfile));
  const instructions = loadAgentInstructions(agent);
  const history = [];
  try {
    for (let step = 0; step < AGY_FALLBACK_MAX_TOOL_STEPS; step += 1) {
      const prompt = agyFallbackProtocolPrompt({ agent, state, instructions, preparedText, stagedAttachments, history });
      const started = client.startTurn({ prompt });
      const turn = await started.completion;
      const envelope = parseAgyFallbackEnvelope(turnResultText(turn));
      if (envelope.type === "final") {
        return {
          items: [{ id: `message-agy-fallback-${randomUUID()}`, type: "agentMessage", text: enforceUtf8Text(envelope.message, "Agy fallback final response") }],
          provider: "agy",
          fallbackFrom: "codex",
          turnId: started.turnId
        };
      }
      const [namespace, tool, extra] = envelope.name.split(".");
      if (namespace !== "paperclip" || !tool || extra) {
        throw new Error(`Agy fallback requested an unavailable tool: ${envelope.name || "missing name"}`);
      }
      const response = await handleCodexServerRequest(ctx, {
        method: "item/tool/call",
        params: {
          threadId: syntheticThreadId,
          namespace,
          tool,
          arguments: envelope.arguments,
          callId: `agy-fallback-call-${randomUUID()}`
        }
      });
      const resultText = response?.contentItems?.map((item) => item?.text || "").join("\n").trim() || "{}";
      history.push(`TOOL CALL ${step + 1}: ${JSON.stringify(envelope)}\nTOOL RESULT ${step + 1}: ${trimRoomContext(resultText, 16000)}`);
    }
    throw new Error(`Agy fallback exceeded ${AGY_FALLBACK_MAX_TOOL_STEPS} SPS tool steps.`);
  } finally {
    activeThreadContexts.delete(syntheticThreadId);
    client.stop?.();
  }
}

function codexCompletionWithAgyFallback(ctx, input) {
  return Promise.resolve(input.completion).catch(async (error) => {
    if (!input.runtime.enableAgyQuotaFallback || !isProviderQuotaError(error)) throw error;
    input.state.runtime ??= {};
    input.state.runtime.lastFailover = {
      from: "codex",
      to: "agy",
      reason: PROVIDER_QUOTA_ERROR_CODE,
      model: input.runtime.agyFallbackModel || "gemini-3.1-pro-high",
      at: now()
    };
    const activity = asRecord(input.state.runtime.activity);
    if (Array.isArray(activity.steps)) {
      activity.steps.push({ id: `agy-fallback-${Date.now()}`, type: "runtime", label: "Codex quota reached; continuing with Agy", status: "working", updatedAt: now() });
      activity.updatedAt = now();
    }
    await saveRoomStateOutsideInvocation(input.runtime.spsApiUrl, input.issue.id, input.state, "Record Codex provider quota failover to Agy").catch(() => null);
    return runAgyRoomFallback(ctx, input);
  });
}

async function getCodexClient(ctx, runtime, agent) {
  if (testCodexClient) return testCodexClient;
  const key = codexClientKey(runtime, agent);
  const existing = codexClients.get(key);
  if (existing) return existing;
  const codexHome = resolveCodexHomeForAgent(runtime, agent);
  const client = new CodexAppServerClient({
    command: runtime.command,
    env: codexHome ? { ...process.env, CODEX_HOME: codexHome } : process.env,
    onServerRequest: (request) => handleCodexServerRequest(ctx, request)
  });
  client.onNotification((message) => {
    void recordNativeCodexCompaction(ctx, message);
  });
  codexClients.set(key, client);
  try {
    await client.start();
    return client;
  } catch (error) {
    codexClients.delete(key);
    client.stop();
    throw error;
  }
}

async function openThread(ctx, runtime, state, companyId, issue, agent) {
  const projectWorkspaces = await listProjectWorkspaces(ctx, companyId, issue.projectId);
  const workspaceProfile = await loadProjectWorkspaceProfile(ctx, issue.projectId, projectWorkspaces);
  const instructions = loadAgentInstructions(agent);
  const instructionsFingerprint = agentInstructionsFingerprint(agent, instructions);
  const roomRuntime = roomRuntimeWithRoomSafety(agent, agentRoomRuntime(runtime, agent));
  if (!roomRuntime.enabled) throw new Error(roomRuntimeDisabledResult(roomRuntime).message);
  const workingDirectory = isWorkerOnlyRoomAgent(agent) && roomRuntime.kind === "agy_print"
    ? workerRoomSandboxDirectory(companyId, issue, agent)
    : await resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state);
  if (roomRuntime.kind === "agy_print") {
    const client = testAgyClientFactory
      ? testAgyClientFactory({ roomRuntime, workingDirectory, agent })
      : new AgyRoomClient({
          command: roomRuntime.command,
          cwd: workingDirectory,
          env: { ...process.env, ...roomRuntime.env },
          model: roomRuntime.model,
          sandbox: roomRuntime.sandbox,
          extraArgs: roomRuntime.extraArgs,
          requestTimeoutMs: roomRuntime.timeoutMs
        });
    state.runtime ??= {};
    state.runtime.kind = "agy_print";
    state.runtime.codexThreadId = null;
    state.runtime.instructionsFingerprint = instructionsFingerprint;
    delete state.runtime.codexAccountKey;
    delete state.runtime.codexHome;
    state.runtime.agyCommand = roomRuntime.command;
    state.runtime.model = roomRuntime.model;
    state.runtime.updatedAt = now();
    return {
      client,
      threadId: null,
      roomRuntime,
      workingDirectory,
      agyContext: { agent, instructions, state, workingDirectory }
    };
  }
  const client = await getCodexClient(ctx, roomRuntime, agent);
  state.runtime ??= {};
  const storedThreadId = textParam(state.runtime, "codexThreadId") || null;
  const storedInstructionsFingerprint = textParam(state.runtime, "instructionsFingerprint") || null;
  const instructionsChanged = Boolean(storedThreadId) && storedInstructionsFingerprint !== instructionsFingerprint;
  if (instructionsChanged) {
    state.runtime.lastThreadRotation = {
      threadId: storedThreadId,
      reason: storedInstructionsFingerprint ? "agent_instructions_changed" : "agent_instructions_fingerprint_initialized",
      rotatedAt: now()
    };
    delete state.runtime.contextHydratedThreadId;
    delete state.runtime.contextHydratedAt;
    delete state.runtime.contextHydratedThroughCommentId;
  }
  const requestedThreadId = roomThreadIdForCodexRuntime(state, roomRuntime, agent, instructionsFingerprint);
  const threadOptions = {
    threadId: requestedThreadId,
    cwd: workingDirectory,
    model: roomRuntime.model,
    developerInstructions: agentInstructions(state, agent, instructions),
    sandbox: roomRuntime.sandbox,
    approvalPolicy: roomRuntime.approvalPolicy,
    dynamicTools: roomTools()
  };
  let thread;
  try {
    thread = await client.openRoomThread(threadOptions);
  } catch (error) {
    if (!requestedThreadId) throw error;
    ctx.logger?.warn?.("Stored Codex Room thread could not be resumed; starting a recoverable replacement.", {
      issueId: issue.id,
      threadId: requestedThreadId,
      message: error instanceof Error ? error.message : String(error)
    });
    thread = await client.openRoomThread({ ...threadOptions, threadId: null });
  }
  if (!thread?.id) throw new Error("Codex app-server did not return a Room thread id.");
  activeThreadContexts.set(thread.id, roomToolContext(runtime, companyId, issue, agent, effectiveRoomMessageMode(agent), workspaceProfile));
  state.runtime.codexThreadId = thread.id;
  state.runtime.kind = "codex_app_server";
  state.runtime.model = roomRuntime.model;
  state.runtime.reasoningEffort = roomRuntime.reasoningEffort;
  state.runtime.instructionsFingerprint = instructionsFingerprint;
  state.runtime.codexAccountKey = codexClientKey(roomRuntime, agent);
  state.runtime.codexHome = resolveCodexHomeForAgent(roomRuntime, agent);
  state.runtime.updatedAt = now();
  return { client, threadId: thread.id, roomRuntime, workingDirectory, agyContext: null };
}

function requireUserAction(actionCtx) {
  if (actionCtx?.actor?.type !== "user" || !actionCtx.companyId) {
    throw new Error("Room Chat actions require an authenticated SPS user.");
  }
  return actionCtx.companyId;
}

function requireAgentConfigurationAction(actionCtx) {
  const companyId = requireUserAction(actionCtx);
  if (!actionCtx?.actor?.permissions?.includes("agents:configure")) {
    throw new Error("Only company owners or admins with Agent configuration permission can change Workplane policies or CLI account connections.");
  }
  return companyId;
}

function isAbsoluteWorkspacePath(value) {
  const pathValue = String(value || "").trim();
  return pathValue.startsWith("/") || /^[A-Za-z]:[\\/]/.test(pathValue);
}

function workspaceNameFromInput(name, cwd, repoUrl) {
  const explicit = String(name || "").trim();
  if (explicit) return explicit;
  const localName = String(cwd || "").trim().replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).at(-1);
  if (localName) return localName;
  try {
    const url = new URL(String(repoUrl || ""));
    return url.pathname.replace(/\/+$/, "").split("/").filter(Boolean).at(-1)?.replace(/\.git$/i, "") || "Workspace";
  } catch {
    return "Workspace";
  }
}

async function handleWorkspaceProfileAccess(_ctx, _params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  return {
    companyId,
    canConfigure: Boolean(actionCtx?.actor?.permissions?.includes("agents:configure"))
  };
}

async function handleWorkspaceProfileSave(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const projectId = textParam(params, "projectId");
  if (!projectId) throw new Error("projectId is required.");
  const project = await ctx.projects.get(projectId, companyId);
  if (!project) throw new Error("Project was not found.");
  const workspaces = await listProjectWorkspaces(ctx, companyId, projectId);
  if (!Array.isArray(workspaces)) throw new Error("Project Workspace access is unavailable.");
  const profile = await saveProjectWorkspaceProfile(ctx, projectId, asRecord(params).profile, workspaces);
  return { ok: true, profile };
}

async function handleWorkspaceProfileCreateWorkspace(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const projectId = textParam(params, "projectId");
  const cwd = rawTextParam(params, "cwd").trim();
  const repoUrl = rawTextParam(params, "repoUrl").trim();
  if (!projectId) throw new Error("projectId is required.");
  if (!cwd && !repoUrl) throw new Error("A local folder or repository URL is required.");
  if (cwd && !isAbsoluteWorkspacePath(cwd)) throw new Error("Workspace local folder must be an absolute path.");
  const project = await ctx.projects.get(projectId, companyId);
  if (!project) throw new Error("Project was not found.");
  if (!ctx.projects?.createWorkspace) throw new Error("This SPS server does not yet expose the Workspace write bridge required by Workplane.");
  const created = await ctx.projects.createWorkspace(projectId, {
    name: workspaceNameFromInput(rawTextParam(params, "name"), cwd, repoUrl),
    ...(cwd ? { cwd } : {}),
    ...(repoUrl ? { repoUrl } : {}),
    sourceType: cwd ? "local_path" : "git_repo",
    isPrimary: asRecord(params).isPrimary === true
  }, companyId);
  if (!created) throw new Error("SPS could not create the Project Workspace.");
  const workspaces = await listProjectWorkspaces(ctx, companyId, projectId);
  const existing = await loadProjectWorkspaceProfile(ctx, projectId, workspaces);
  const profile = await saveProjectWorkspaceProfile(ctx, projectId, {
    ...existing,
    defaultWorkspaceId: existing.configured ? existing.defaultWorkspaceId : created.id
  }, workspaces);
  return { ok: true, workspace: created, profile };
}

function turnResultText(turn) {
  const text = getAgentText(turn);
  if (!text) throw new Error("The Room runtime completed without an assistant message.");
  return enforceUtf8Text(text, "Room runtime output");
}

function beginRoomActivity(state, kind, jobId = null, sourceCommentId = null) {
  const timestamp = now();
  state.runtime ??= {};
  state.runtime.activity = {
    status: "working",
    kind,
    jobId,
    sourceCommentId,
    turnId: null,
    startedAt: timestamp,
    updatedAt: timestamp,
    steps: [{ id: "turn", type: "turn", label: "요청을 분석하는 중", status: "working", updatedAt: timestamp }],
    error: null
  };
  return state.runtime.activity;
}

function roomActivityLabel(type, status) {
  const base = {
    reasoning: "요청 분석",
    plan: "작업 계획 정리",
    commandExecution: "도구 실행",
    fileChange: "파일 변경 확인",
    mcpToolCall: "연결 도구 사용",
    dynamicToolCall: "SPS 작업 도구 사용",
    collabAgentToolCall: "협업 Agent 도구 사용",
    webSearch: "웹 검색",
    imageView: "이미지 확인",
    agentMessage: "답변 작성"
  }[type] ?? "작업 진행";
  return status === "completed" ? `${base} 완료` : `${base} 중`;
}

function applyRoomActivityEvent(state, event) {
  const activity = state.runtime?.activity;
  if (!activity || activity.status !== "working") return false;
  const params = event?.params ?? {};
  const timestamp = now();
  if (event?.method === "turn/started") {
    activity.turnId = params.turnId ?? activity.turnId;
    activity.updatedAt = timestamp;
    return true;
  }
  if (!["item/started", "item/completed"].includes(event?.method) || !params.item?.type) return false;
  const status = event.method === "item/completed" ? "completed" : "working";
  const item = params.item;
  const id = item.id ?? `${item.type}:${params.turnId ?? activity.steps.length}`;
  const index = activity.steps.findIndex((step) => step.id === id);
  const priorStep = index >= 0 ? activity.steps[index] : null;
  const reasoningSummary = item.type === "reasoning" && Array.isArray(item.summary)
    ? item.summary.map((entry) => String(entry || "").trim()).filter(Boolean).join("\n").slice(0, 1800)
    : priorStep?.summary ?? null;
  const nextStep = {
    id,
    type: item.type,
    label: roomActivityLabel(item.type, status),
    status,
    updatedAt: timestamp,
    ...(reasoningSummary ? { summary: reasoningSummary } : {})
  };
  if (index >= 0) activity.steps[index] = nextStep;
  else activity.steps.push(nextStep);
  activity.steps = activity.steps.slice(-12);
  activity.turnId = params.turnId ?? activity.turnId;
  activity.updatedAt = timestamp;
  return true;
}

function applyNativeSessionActivityEvent(state, event) {
  const activity = state.runtime?.activity;
  if (!activity || activity.status !== "working" || !event?.runId) return false;
  activity.turnId = event.runId;
  activity.updatedAt = now();

  if (event.eventType === "status") {
    const step = {
      id: "agent-session-status",
      type: "status",
      label: String(event.message || "Agent run status updated").trim().slice(0, 180),
      status: "working",
      updatedAt: activity.updatedAt
    };
    const index = activity.steps.findIndex((candidate) => candidate.id === step.id);
    if (index >= 0) activity.steps[index] = step;
    else activity.steps.push(step);
    return true;
  }
  if (event.eventType !== "chunk") return false;

  const payload = asRecord(event.payload);
  const nestedPayload = asRecord(payload.payload);
  const toolName = textParam(payload, "currentToolName") || textParam(nestedPayload, "toolName");
  const eventType = textParam(payload, "eventType") || textParam(nestedPayload, "type") || "progress";
  const summary = (
    textParam(payload, "lastAssistantSnippet")
    || textParam(event, "message")
    || textParam(payload, "message")
  ).slice(0, 900);
  const label = toolName
    ? `Using ${toolName}`
    : eventType === "reasoning"
      ? "Reviewing context"
      : eventType === "assistant"
        ? "Preparing the response"
        : "Agent work in progress";
  activity.steps.push({
    id: `agent-session:${event.seq ?? activity.steps.length}`,
    type: toolName ? "tool" : eventType,
    label,
    status: "working",
    updatedAt: activity.updatedAt,
    ...(summary ? { summary } : {})
  });
  activity.steps = activity.steps.slice(-20);
  return true;
}

function finishRoomActivity(state, status, error = null) {
  const activity = state.runtime?.activity;
  if (!activity) return;
  activity.status = status;
  activity.error = error ? String(error instanceof Error ? error.message : error).slice(0, 180) : null;
  activity.updatedAt = now();
}

function roomReasoningSummary(state) {
  const summaries = (state.runtime?.activity?.steps ?? [])
    .filter((step) => step.type === "reasoning" && step.summary)
    .map((step) => step.summary)
    .filter((summary, index, all) => all.indexOf(summary) === index);
  return summaries.join("\n\n").slice(0, 3600);
}

function roomActivityReporter(ctx, companyId, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomState(ctx, companyId, issueId, state, changeSummary)).catch(() => {});
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1_000 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update Room activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update Room activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyRoomActivityEvent(state, event)) return;
      dirty = true;
      emitRoomEvent(ctx, companyId, issueId, { type: "activity", activity: state.runtime?.activity ?? null });
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final Room activity");
      return writes;
    }
  };
}

function nativeRoomActivityReporter(ctx, companyId, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomState(ctx, companyId, issueId, state, changeSummary)).catch(() => {});
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1_000 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update native Agent Session activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update native Agent Session activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyNativeSessionActivityEvent(state, event)) return;
      dirty = true;
      emitRoomEvent(ctx, companyId, issueId, { type: "activity", activity: state.runtime?.activity ?? null });
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final native Agent Session activity");
      return writes;
    }
  };
}

// A Codex turn outlives the plugin action that started it. Its progress must
// therefore persist through SPS's loopback API rather than the expired
// action-scoped plugin context.
function roomActivityReporterOutsideInvocation(apiUrl, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomStateOutsideInvocation(apiUrl, issueId, state, changeSummary)).catch(() => {});
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1_000 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update Room activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update Room activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyRoomActivityEvent(state, event)) return;
      dirty = true;
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final Room activity");
      return writes;
    }
  };
}

function nativeRoomActivityReporterOutsideInvocation(apiUrl, issueId, state) {
  let writes = Promise.resolve();
  let lastPersistedAt = 0;
  let persistTimer = null;
  let dirty = false;
  const persist = (changeSummary) => {
    lastPersistedAt = Date.now();
    dirty = false;
    writes = writes.then(() => saveRoomStateOutsideInvocation(apiUrl, issueId, state, changeSummary)).catch(() => {});
  };
  const schedulePersist = () => {
    const remaining = Math.max(0, 1_000 - (Date.now() - lastPersistedAt));
    if (remaining === 0) {
      persist("Update native Agent Session activity");
      return;
    }
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persist("Update native Agent Session activity");
    }, remaining);
  };
  return {
    report(event) {
      if (!applyNativeSessionActivityEvent(state, event)) return;
      dirty = true;
      schedulePersist();
    },
    flush() {
      if (persistTimer !== null) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (dirty) persist("Persist final native Agent Session activity");
      return writes;
    }
  };
}

async function getActiveTasks(ctx, companyId, projectId, roomIssueId) {
  if (!projectId) return [];
  const issues = await ctx.issues.list({ companyId, projectId, limit: 200 });
  return issues.filter((issue) => issue.id !== roomIssueId && issue.parentId && ACTIVE_TASK_STATUSES.has(issue.status));
}

async function getActiveTasksDirect(apiUrl, companyId, projectId, roomIssueId) {
  if (!projectId) return [];
  const issues = await listCompanyIssuesDirect(apiUrl, companyId, projectId);
  return issues.filter((issue) => issue.id !== roomIssueId && issue.parentId && ACTIVE_TASK_STATUSES.has(issue.status));
}

function declaredList(text, heading) {
  const pattern = new RegExp(`${heading}:\\s*([\\s\\S]*?)(?:\\n\\n|$)`, "i");
  const match = String(text || "").match(pattern);
  if (!match) return [];
  return match[1].split(/[,\n]/).map((item) => item.replace(/^[-*]\s*/, "").trim()).filter(Boolean);
}

function declaredPaths(text) {
  return declaredList(text, "Affected Paths");
}

function normalizeAffectedPath(value) {
  return String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/(?:\*\*?|)$/g, "")
    .toLowerCase();
}

function affectedPathsOverlap(left, right) {
  const a = normalizeAffectedPath(left);
  const b = normalizeAffectedPath(right);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function pathsConflict(existingPaths, requestedPaths) {
  return existingPaths.some((existing) => requestedPaths.some((requested) => affectedPathsOverlap(existing, requested)));
}

function declaredDesignReferences(text) {
  return declaredList(text, "Design References");
}

function gitStatusLabel(code) {
  if (code === "??") return "untracked";
  if (code.includes("D")) return "deleted";
  if (code.includes("A")) return "added";
  if (code.includes("R")) return "renamed";
  return "modified";
}

function workspaceGitChanges(workspace) {
  const cwd = String(workspace?.cwd ?? workspace?.path ?? "").trim();
  const name = String(workspace?.name ?? "Workspace");
  const kind = String(asRecord(workspace?.metadata).kind ?? "implementation");
  if (!cwd || !fs.existsSync(cwd)) {
    return { id: workspace?.id ?? null, name, kind, available: false, files: [] };
  }
  try {
    const repositoryRoot = execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      windowsHide: true
    }).trim();
    const workspaceRelativeRoot = path.relative(repositoryRoot, cwd).replace(/\\/g, "/").replace(/^\.\/$/, "");
    // A Project Workspace can intentionally live inside a larger repository.
    // Git reports paths from the repository root, so scope them back to the
    // selected Workspace before returning them to the Room UI.
    const workspacePrefix = workspaceRelativeRoot && !workspaceRelativeRoot.startsWith("../") && workspaceRelativeRoot !== ".."
      ? workspaceRelativeRoot.replace(/\/+$/, "")
      : "";
    const output = execFileSync("git", ["-c", "core.quotepath=false", "-C", cwd, "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      windowsHide: true
    });
    const entries = output.split("\0").filter(Boolean);
    const files = [];
    for (let index = 0; index < entries.length && files.length < 100; index += 1) {
      const entry = entries[index];
      const code = entry.slice(0, 2).trim() || "M";
      const repositoryPath = entry.slice(3).replace(/\\/g, "/");
      const scopedPath = workspacePrefix
        ? repositoryPath === workspacePrefix
          ? path.posix.basename(repositoryPath)
          : repositoryPath.startsWith(`${workspacePrefix}/`)
            ? repositoryPath.slice(workspacePrefix.length + 1)
            : null
        : repositoryPath;
      if (!scopedPath) {
        if ((code.includes("R") || code.includes("C")) && index + 1 < entries.length) index += 1;
        continue;
      }
      const file = {
        workspaceId: workspace?.id ?? null,
        workspaceName: name,
        workspaceKind: kind,
        status: gitStatusLabel(code),
        path: scopedPath
      };
      if (file.path) files.push(file);
      if ((code.includes("R") || code.includes("C")) && index + 1 < entries.length) index += 1;
    }
    return { id: workspace?.id ?? null, name, kind, available: true, files };
  } catch {
    return { id: workspace?.id ?? null, name, kind, available: false, files: [] };
  }
}

function workspaceKindForAgent(agent) {
  const name = String(agent?.name || "").toLowerCase();
  return name === "manager" || name === "designer" || name.includes("document") ? "design" : "implementation";
}

function taskFileReferences(tasks) {
  const seen = new Set();
  const files = [];
  for (const task of tasks) {
    const add = (kind, path) => {
      const cleanPath = String(path || "").trim();
      if (!cleanPath || /^Not (declared|required)/i.test(cleanPath)) return;
      const key = `${kind}:${cleanPath}`;
      if (seen.has(key)) return;
      seen.add(key);
      files.push({ kind, path: cleanPath, taskId: task.id, taskIdentifier: task.identifier, taskTitle: task.title });
    };
    for (const reference of declaredDesignReferences(task.description)) add("design_reference", reference);
    for (const path of declaredPaths(task.description)) add("task_target", path);
  }
  return files;
}

async function previewTask(ctx, companyId, projectId, roomIssueId, affectedPaths) {
  const activeTasks = await getActiveTasks(ctx, companyId, projectId, roomIssueId);
  const normalizedPaths = [...new Set(affectedPaths.map((path) => path.trim()).filter(Boolean))];
  const conflicts = activeTasks.filter((task) => pathsConflict(declaredPaths(task.description), normalizedPaths));
  return {
    affectedPaths: normalizedPaths,
    activeTasks: activeTasks.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      declaredAffectedPaths: declaredPaths(task.description)
    })),
    conflicts: conflicts.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      declaredAffectedPaths: declaredPaths(task.description)
    }))
  };
}

async function previewTaskDirect(apiUrl, companyId, projectId, roomIssueId, affectedPaths) {
  const activeTasks = await getActiveTasksDirect(apiUrl, companyId, projectId, roomIssueId);
  const normalizedPaths = [...new Set(affectedPaths.map((path) => path.trim()).filter(Boolean))];
  const conflicts = activeTasks.filter((task) => pathsConflict(declaredPaths(task.description), normalizedPaths));
  return {
    affectedPaths: normalizedPaths,
    activeTasks: activeTasks.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      declaredAffectedPaths: declaredPaths(task.description)
    })),
    conflicts: conflicts.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      declaredAffectedPaths: declaredPaths(task.description)
    }))
  };
}

async function getProjectTask(ctx, companyId, projectId, taskId) {
  const task = await ctx.issues.get(taskId, companyId);
  if (!task || task.projectId !== projectId || !task.parentId) {
    throw new Error("Task must be a child Task Room in the current project.");
  }
  return task;
}

async function getProjectTaskDirect(apiUrl, companyId, projectId, taskId) {
  const task = await getIssueDirect(apiUrl, taskId);
  if (!task || task.companyId !== companyId || task.projectId !== projectId || !task.parentId) {
    throw new Error("Task must be a child Task Room in the current project.");
  }
  return task;
}

async function getOwnedTaskRoomDirect(roomContext, taskId) {
  const task = await getProjectTaskDirect(
    roomContext.spsApiUrl,
    roomContext.companyId,
    roomContext.projectId,
    taskId
  );
  const stateDocument = await getRoomDocumentDirect(roomContext.spsApiUrl, task.id, TASK_ROOM_STATE_KEY);
  const state = parseState(stateDocument?.body);
  if (
    task.parentId !== roomContext.issueId
    || state?.kind !== "task_room"
    || state.originatingRoomIssueId !== roomContext.issueId
    || state.owningAgentId !== roomContext.agentId
  ) {
    throw new Error("Only the Agent Room that created this Task can modify or complete it.");
  }
  return { task, state };
}

async function handleCodexServerRequest(ctx, request) {
  if (request.method !== "item/tool/call") throw new Error(`Unsupported Codex request: ${request.method}`);
  const params = request.params ?? {};
  const roomContext = activeThreadContexts.get(params.threadId);
  if (!roomContext) throw new Error("Codex tool call does not belong to an active Room.");
  const name = `${params.namespace || ""}.${params.tool || ""}`.replace(/^\./, "");
  const args = asRecord(params.arguments);
  let content;

  try {
  if (!roomModeAllowsTool(roomContext.mode, name)) {
    content = JSON.stringify({
      ok: false,
      code: "tool_not_available_in_room_mode",
      mode: roomMessageMode(roomContext.mode),
      message: `${roomMessageModeLabel(roomContext.mode)} does not permit ${name}. Switch to Agent mode only when the user wants real work performed.`
    });
  } else if (name === "paperclip.memory_search") {
    const memoryAccess = workplaneIdentityForRoomContext(roomContext).memoryAccess;
    const query = textParam(args, "query");
    const limit = Math.max(1, Math.min(Number(args.limit) || 5, 10));
    if (memoryAccess === "none") {
      content = JSON.stringify({ ok: false, code: "memory_read_disabled", message: "This Agent's Organization policy does not allow SPS memory search." });
    } else if (!query || query.length > 500) {
      content = JSON.stringify({ ok: false, code: "invalid_memory_query", message: "Memory search queries must be between 1 and 500 characters." });
    } else {
      const items = await searchRoomMemory(roomContext, query, listParam(args, "scopes"), limit);
      content = JSON.stringify({ ok: true, items }, null, 2);
    }
  } else if (name === "paperclip.memory_propose") {
    const memoryAccess = workplaneIdentityForRoomContext(roomContext).memoryAccess;
    if (memoryAccess !== "read_write") {
      content = JSON.stringify({ ok: false, code: "memory_write_disabled", message: "This Agent's Organization policy allows read-only or no SPS memory access." });
    } else {
      const candidate = await proposeRoomMemory(roomContext, args);
      content = JSON.stringify({ ok: true, candidateId: candidate?.id ?? null, status: candidate?.status ?? "candidate" });
    }
  } else if (name === "paperclip.update_room_work_state") {
    const mutableFields = ["objective", "phase", "latestOutcome", "planReferences", "nextCandidate", "waitingFor"];
    const patch = Object.fromEntries(mutableFields
      .filter((key) => Object.prototype.hasOwnProperty.call(args, key))
      .map((key) => [key, args[key]]));
    if (!Object.keys(patch).length) {
      content = JSON.stringify({ ok: false, code: "work_state_patch_required", message: "Provide at least one Room Work State field to update." });
    } else {
      const workState = await updateRoomWorkStateOutsideInvocation(
        roomContext,
        patch,
        `Update Room operating bookmark from ${roomContext.agentName}`,
        { kind: "agent", agentId: roomContext.agentId, agentName: roomContext.agentName }
      );
      content = JSON.stringify({ ok: true, workState }, null, 2);
    }
  } else if (name === "paperclip.list_active_tasks") {
    const activeTasks = await getActiveTasksDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, roomContext.issueId);
    content = JSON.stringify(activeTasks.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      assigneeAgentId: task.assigneeAgentId ?? null,
      declaredAffectedPaths: declaredPaths(task.description)
    })), null, 2);
  } else if (name === "paperclip.list_workers") {
    if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_assign_tasks", message: "This Agent is not configured as a Lead that can assign Worker Tasks." });
    } else {
      const ownerIdentity = workplaneIdentityForRoomContext(roomContext);
      const agents = await listCompanyAgentsDirect(roomContext.spsApiUrl, roomContext.companyId);
      content = JSON.stringify(agents.filter((agent) => canDelegateTo(ownerIdentity, agent)).map((agent) => {
        const identity = resolveAgentWorkplaneIdentity(agent);
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role ?? null,
          workplaneRole: identity.roleId,
          workplaneKind: identity.kind,
          status: agent.status,
          adapterType: agent.adapterType ?? null,
          maxConcurrentRuns: Number(asRecord(asRecord(agent.runtimeConfig).heartbeat).maxConcurrentRuns) || 1
        };
      }), null, 2);
    }
  } else if (name === "paperclip.preview_task") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project", message: "An Agent Room must belong to a project before it can preview Tasks." });
    } else {
      const preview = await previewTaskDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, roomContext.issueId, listParam(args, "affectedPaths"));
      content = JSON.stringify({ ok: true, ...preview }, null, 2);
    }
  } else if (name === "paperclip.create_task") {
    if (roomContext.enableTaskAssignment !== true) {
      content = JSON.stringify({
        ok: false,
        code: "task_assignment_disabled",
        message: "Worker Task assignment is disabled until the organization adapters are explicitly configured and enabled."
      });
    } else if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project", message: "An Agent Room must belong to a project before it can create Tasks." });
    } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_CREATE)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_create_tasks", message: "Only a configured Lead can create Worker Tasks." });
    } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_assign_tasks", message: "This Lead is not configured to assign Worker Tasks." });
    } else {
      const title = enforceTaskContractText(textParam(args, "title"), "Task title");
      const description = enforceTaskContractText(textParam(args, "description"), "Task description");
      const assigneeAgentId = textParam(args, "assigneeAgentId");
      const requestedTaskType = textParam(args, "taskType", "implementation");
      const taskType = normalizedTaskTypeKey(requestedTaskType);
      const maturity = textParam(args, "maturity");
      const affectedPaths = listParam(args, "affectedPaths");
      const designReferences = listParam(args, "designReferences");
      const acceptanceCriteria = listParam(args, "acceptanceCriteria");
      const verification = listParam(args, "verification");
      const blockedByIssueIds = [...new Set(listParam(args, "blockedByIssueIds"))];
      const requestedProjectWorkspaceId = textParam(args, "projectWorkspaceId");
      const projectWorkspaces = await listProjectWorkspacesDirect(roomContext.spsApiUrl, roomContext.projectId);
      const companyAgents = await listCompanyAgentsDirect(roomContext.spsApiUrl, roomContext.companyId);
      const selectedWorker = companyAgents.find((candidate) => candidate.id === assigneeAgentId) ?? null;
      const workspaceProfile = normalizeWorkspaceProfile(asRecord(roomContext.workspaceProfile), projectWorkspaces);
      const taskWorkspace = chooseTaskWorkspace(
        projectWorkspaces,
        taskType,
        requestedProjectWorkspaceId,
        workspaceProfile,
        selectedWorker?.id ?? assigneeAgentId
      );
      const affectedPathResolution = normalizeTaskAffectedPaths(affectedPaths, taskWorkspace);
      const taskAffectedPaths = affectedPathResolution.paths;
      if (!title || !description || !assigneeAgentId || !maturity) {
        content = JSON.stringify({ ok: false, code: "invalid_task", message: "title, description, assigneeAgentId, and maturity are required." });
      } else if (!taskType) {
        content = JSON.stringify({ ok: false, code: "invalid_task_type", message: "taskType must use a lowercase key containing only letters, numbers, hyphens, or underscores." });
      } else if (!TASK_MATURITY_LEVELS.has(maturity)) {
        content = JSON.stringify({ ok: false, code: "invalid_task_maturity", message: "maturity must be exploration, prototype, or committed implementation." });
      } else if (!selectedWorker || !canDelegateTo(workplaneIdentityForRoomContext(roomContext), selectedWorker)) {
        content = JSON.stringify({ ok: false, code: "invalid_worker", message: "Choose a Worker allowed by this Lead's Delegation Policy." });
      } else if (Array.isArray(projectWorkspaces) && !taskWorkspace) {
        content = JSON.stringify({ ok: false, code: "workspace_required", message: "This Task needs a registered Project Workspace before it can be assigned." });
      } else if (affectedPathResolution.invalid.length) {
        content = JSON.stringify({
          ok: false,
          code: "affected_path_outside_workspace",
          message: "Affected paths must be relative to, or inside, the selected Worker Workspace.",
          workspace: taskWorkspace ? { id: taskWorkspace.id, name: taskWorkspace.name, path: displayTaskPath(workspaceLocalPath(taskWorkspace)) } : null,
          invalidPaths: affectedPathResolution.invalid
        }, null, 2);
      } else if (!taskAffectedPaths.length && !taskTypeAllowsNoAffectedPaths(taskType)) {
        content = JSON.stringify({ ok: false, code: "affected_paths_required", message: "Declare affected paths before creating this Task. Only the legacy design and documentation types may omit paths." });
      } else {
        const preview = await previewTaskDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, roomContext.issueId, taskAffectedPaths);
        const activeTaskIds = new Set(preview.activeTasks.map((task) => task.id));
        const unknownDependencies = blockedByIssueIds.filter((taskId) => !activeTaskIds.has(taskId));
        const missingConflictDependencies = preview.conflicts.filter((task) => !blockedByIssueIds.includes(task.id));
        if (unknownDependencies.length) {
          content = JSON.stringify({ ok: false, code: "invalid_dependency", unknownDependencies });
        } else if (missingConflictDependencies.length) {
          content = JSON.stringify({
            ok: false,
            code: "task_path_conflict",
            message: "Create the Task only after sequencing it behind every conflicting active Task.",
            conflicts: missingConflictDependencies,
            requiredBlockedByIssueIds: missingConflictDependencies.map((task) => task.id)
          }, null, 2);
        } else {
          const taskInput = {
            taskType,
            maturity,
            reviewMode: workplaneIdentityForRoomContext(roomContext).reviewMode,
            affectedPaths: taskAffectedPaths,
            designReferences,
            acceptanceCriteria,
            verification,
            blockedByIssueIds,
            assigneeAgentId,
            workerStatusAtCreation: selectedWorker.status ?? null,
            projectWorkspaceId: taskWorkspace?.id ?? null,
            projectWorkspaceName: taskWorkspace?.name ?? null
          };
          const descriptionWithContract = taskDescription({ description, ...taskInput });
          // SPS wakes an assigned todo Task immediately. Keep the Task parked
          // until its durable state and visible protocol are ready for the first run.
          const created = await createIssueDirect(roomContext.spsApiUrl, roomContext.companyId, {
            projectId: roomContext.projectId,
            projectWorkspaceId: taskInput.projectWorkspaceId,
            parentId: roomContext.issueId,
            title,
            description: descriptionWithContract,
            status: "backlog",
            priority: "medium",
            assigneeAgentId: null,
            blockedByIssueIds,
            executionPolicy: TASK_ROOM_EXECUTION_POLICY,
            originKind: "plugin:local.room-chat:role-tool",
            originId: params.callId
          });
          const taskState = newTaskRoomState(created, roomContext, taskInput);
          try {
            await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
              issueId: created.id,
              key: TASK_ROOM_STATE_KEY,
              body: serializeState(taskState),
              companyId: roomContext.companyId,
              title: "Task Room state",
              format: "markdown",
              changeSummary: "Initialize Task Room state"
            });
            await createIssueCommentDirect(roomContext.spsApiUrl, created.id, taskProtocolComment(roomContext, created, taskState));
            const waitingForWorker = selectedWorker.status === "paused" || selectedWorker.status === "error";
            if (waitingForWorker) {
              await createIssueCommentDirect(
                roomContext.spsApiUrl,
                created.id,
                `## Task waiting for assigned Worker\n${selectedWorker.name} is paused before the first run. Keep this Task assigned to the same Worker. After the Worker is resumed by the Owner, start this same Task with paperclip.start_task; do not create or assign a replacement.`
              );
            }
            const activated = await updateIssueDirect(roomContext.spsApiUrl, created.id, {
              status: waitingForWorker ? "blocked" : "todo",
              assigneeAgentId,
              blockedByIssueIds
            });
            const boundaryState = await updateRoomWorkStateOutsideInvocation(
              roomContext,
              {
                waitingFor: {
                  kind: "worker",
                  taskId: activated.id,
                  detail: waitingForWorker
                    ? `${selectedWorker.name} must be resumed before this assigned Task can start.`
                    : `${selectedWorker.name} is executing the assigned Task.`
                }
              },
              `Record Worker Task boundary for ${activated.identifier || activated.id}`,
              { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
            ).catch(() => null);
            content = JSON.stringify({
              ok: true,
              task: { id: activated.id, identifier: activated.identifier, title: activated.title, status: activated.status, projectWorkspaceId: taskInput.projectWorkspaceId },
              reviewBoundary: "owning_agent",
              reviewMode: taskInput.reviewMode,
              waitingForWorker,
              worker: { id: selectedWorker.id, name: selectedWorker.name, status: selectedWorker.status },
              nextAction: waitingForWorker ? `Resume ${selectedWorker.name}, then start this same Task with paperclip.start_task.` : null,
              blockedByIssueIds,
              workStateUpdated: Boolean(boundaryState)
            }, null, 2);
          } catch (error) {
            await createIssueCommentDirect(roomContext.spsApiUrl, created.id, `## Task Room initialization blocked\n${error.message}`);
            await updateIssueDirect(roomContext.spsApiUrl, created.id, { status: "blocked" });
            content = JSON.stringify({ ok: false, code: "task_room_initialization_failed", taskId: created.id, message: error.message });
          }
        }
      }
    }
  } else if (name === "paperclip.get_task_context") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project" });
    } else {
      const task = await getProjectTaskDirect(roomContext.spsApiUrl, roomContext.companyId, roomContext.projectId, textParam(args, "taskId"));
      const [stateDocument, comments] = await Promise.all([
        getRoomDocumentDirect(roomContext.spsApiUrl, task.id, TASK_ROOM_STATE_KEY),
        listIssueCommentsDirect(roomContext.spsApiUrl, task.id)
      ]);
      content = JSON.stringify({
        ok: true,
        task: { id: task.id, identifier: task.identifier, title: task.title, status: task.status, assigneeAgentId: task.assigneeAgentId ?? null },
        state: parseState(stateDocument?.body),
        comments: mostRecentComments(comments, 30)
      }, null, 2);
    }
  } else if (name === "paperclip.start_task") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project" });
    } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_ASSIGN)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_start_tasks" });
    } else {
      const { task, state } = await getOwnedTaskRoomDirect(roomContext, textParam(args, "taskId"));
      const dispatch = asRecord(state.dispatch);
      const workerAgentId = textParam(state, "workerAgentId") || task.assigneeAgentId;
      const companyAgents = await listCompanyAgentsDirect(roomContext.spsApiUrl, roomContext.companyId);
      const selectedWorker = companyAgents.find((candidate) => candidate.id === workerAgentId && isTaskWorkerAgent(candidate));
      if (task.status !== "blocked" || dispatch.status !== "waiting_for_worker" || dispatch.reason !== "worker_paused_before_start") {
        content = JSON.stringify({
          ok: false,
          code: "task_not_waiting_for_worker",
          status: task.status,
          dispatchStatus: dispatch.status ?? null,
          message: "Only a blocked Task parked because its assigned Worker was paused can be started with this tool."
        });
      } else if (!selectedWorker) {
        content = JSON.stringify({ ok: false, code: "assigned_worker_missing", workerAgentId });
      } else if (selectedWorker.status === "paused") {
        content = JSON.stringify({
          ok: false,
          code: "worker_unavailable",
          worker: { id: selectedWorker.id, name: selectedWorker.name, status: selectedWorker.status },
          message: "The assigned Worker is still paused. The Owner must resume it; keep this same Task blocked."
        });
      } else {
        state.dispatch = {
          ...dispatch,
          status: "ready",
          reason: null,
          workerStatusAtStart: selectedWorker.status ?? null,
          startedAt: now(),
          updatedAt: now()
        };
        await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
          issueId: task.id,
          key: TASK_ROOM_STATE_KEY,
          body: serializeState(state),
          companyId: roomContext.companyId,
          title: "Task Room state",
          format: "markdown",
          changeSummary: "Start Task after assigned Worker resumed"
        });
        const activated = await updateIssueDirect(roomContext.spsApiUrl, task.id, {
          status: "todo",
          assigneeAgentId: selectedWorker.id,
          blockedByIssueIds: Array.isArray(state.dependencyTaskIds) ? state.dependencyTaskIds : []
        });
        await updateRoomWorkStateOutsideInvocation(
          roomContext,
          { waitingFor: { kind: "worker", taskId: activated.id, detail: `${selectedWorker.name} is executing the resumed Task.` } },
          `Record resumed Worker Task boundary for ${activated.identifier || activated.id}`,
          { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
        ).catch(() => null);
        content = JSON.stringify({
          ok: true,
          task: { id: activated.id, identifier: activated.identifier, title: activated.title, status: activated.status, assigneeAgentId: activated.assigneeAgentId ?? null },
          reusedTask: true,
          worker: { id: selectedWorker.id, name: selectedWorker.name, status: selectedWorker.status }
        }, null, 2);
      }
    }
  } else if (name === "paperclip.post_task_feedback") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project" });
    } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_REVIEW)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_post_feedback" });
    } else {
      const { task, state } = await getOwnedTaskRoomDirect(roomContext, textParam(args, "taskId"));
      const message = enforceTaskContractText(textParam(args, "message"), "Task feedback");
      if (!message) {
        content = JSON.stringify({ ok: false, code: "feedback_message_required" });
      } else if (!["in_review", "blocked", "done"].includes(task.status)) {
        content = JSON.stringify({
          ok: false,
          code: "task_not_awaiting_owner_feedback",
          message: "Task feedback can restart work after the assigned Worker reports in_review or blocked, or reopen a technically completed Task after later review.",
          taskStatus: task.status
        });
      } else {
        const feedbackBody = `## ${roomContext.agentName} Feedback\n${message}`;
        const previousStateBody = serializeState(state);
        const previousReview = asRecord(state.review);
        const previousNotification = asRecord(state.ownerNotification);
        const feedbackAt = now();
        const priorReportCommentId = textParam(previousReview, "workerReportCommentId")
          || textParam(previousNotification, "reportCommentId");
        const priorReportFingerprint = textParam(previousReview, "workerReportFingerprint")
          || textParam(previousNotification, "reportFingerprint");
        if (priorReportCommentId || priorReportFingerprint || Object.keys(previousNotification).length > 0) {
          const history = Array.isArray(state.reviewHistory) ? state.reviewHistory : [];
          state.reviewHistory = [...history, {
            outcome: "correction_requested",
            workerReportCommentId: priorReportCommentId || null,
            workerReportFingerprint: priorReportFingerprint || null,
            ownerNotificationStatus: textParam(previousNotification, "status") || null,
            ownerNotificationResultCommentId: textParam(previousNotification, "resultCommentId") || null,
            closedAt: feedbackAt
          }].slice(-20);
        }
        const previousCorrectionRound = Number(previousReview.correctionRound ?? 0);
        const correctionRound = Number.isFinite(previousCorrectionRound)
          ? Math.max(0, Math.trunc(previousCorrectionRound)) + 1
          : 1;
        state.review = {
          required: "owning_agent",
          status: "correction_requested",
          correctionRound,
          feedbackCommentId: null,
          feedbackByAgentId: roomContext.agentId,
          feedbackByAgentName: roomContext.agentName,
          updatedAt: feedbackAt
        };
        delete state.ownerNotification;
        state.dispatch = {
          ...asRecord(state.dispatch),
          status: "feedback_pending",
          reason: null,
          updatedAt: feedbackAt
        };
        await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
          issueId: task.id,
          key: TASK_ROOM_STATE_KEY,
          body: serializeState(state),
          companyId: roomContext.companyId,
          title: "Task Room state",
          format: "markdown",
          changeSummary: "Prepare Task correction cycle before owner feedback dispatch"
        });
        let restarted;
        try {
          restarted = await updateIssueDirect(roomContext.spsApiUrl, task.id, {
            status: "todo",
            comment: feedbackBody
          });
        } catch (error) {
          await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
            issueId: task.id,
            key: TASK_ROOM_STATE_KEY,
            body: previousStateBody,
            companyId: roomContext.companyId,
            title: "Task Room state",
            format: "markdown",
            changeSummary: "Restore Task review cycle after feedback dispatch failure"
          }).catch(() => {});
          throw error;
        }
        const comment = asRecord(restarted?.comment);
        state.review.feedbackCommentId = textParam(comment, "id") || null;
        state.dispatch = {
          ...asRecord(state.dispatch),
          status: "ready",
          feedbackRestartedAt: feedbackAt,
          updatedAt: now()
        };
        await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
          issueId: task.id,
          key: TASK_ROOM_STATE_KEY,
          body: serializeState(state),
          companyId: roomContext.companyId,
          title: "Task Room state",
          format: "markdown",
          changeSummary: "Restart Task correction cycle after owner feedback"
        });
        await updateRoomWorkStateOutsideInvocation(
          roomContext,
          { waitingFor: { kind: "worker", taskId: restarted.id, detail: "The assigned Worker is addressing owner feedback in the same Task." } },
          `Record Task correction boundary for ${restarted.identifier || restarted.id}`,
          { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
        ).catch(() => null);
        content = JSON.stringify({
          ok: true,
          task: {
            id: restarted.id,
            identifier: restarted.identifier,
            title: restarted.title,
            status: restarted.status,
            assigneeAgentId: restarted.assigneeAgentId ?? null
          },
          commentId: textParam(comment, "id") || null,
          correctionRound
        }, null, 2);
      }
    }
  } else if (name === "paperclip.complete_task") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project" });
    } else if (!roomHasWorkplaneCapability(roomContext, WORKPLANE_CAPABILITIES.TASK_COMPLETE)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_complete_tasks" });
    } else {
      const { task, state } = await getOwnedTaskRoomDirect(roomContext, textParam(args, "taskId"));
      const reviewSummary = enforceTaskContractText(textParam(args, "reviewSummary"), "Task review summary");
      const workerReportCommentId = textParam(asRecord(state.review), "workerReportCommentId");
      if (task.status !== "in_review") {
        content = JSON.stringify({ ok: false, code: "task_not_in_review", status: task.status, message: "Only an in_review Task can be technically verified and marked done." });
      } else if (!workerReportCommentId) {
        content = JSON.stringify({ ok: false, code: "worker_evidence_missing", message: "A substantive Worker final report must be recorded before completion." });
      } else if (!reviewSummary) {
        content = JSON.stringify({ ok: false, code: "review_summary_required" });
      } else {
        const completed = await updateIssueDirect(roomContext.spsApiUrl, task.id, { status: "done" });
        const previousReview = { ...asRecord(state.review) };
        delete previousReview.acceptedByAgentId;
        delete previousReview.acceptedByAgentName;
        delete previousReview.acceptedAt;
        delete previousReview.summary;
        state.review = {
          ...previousReview,
          required: "owning_agent",
          status: "owner_verified",
          verifiedByAgentId: roomContext.agentId,
          verifiedByAgentName: roomContext.agentName,
          verifiedAt: now(),
          verificationSummary: reviewSummary
        };
        await upsertRoomDocumentOutsideInvocation(roomContext.spsApiUrl, {
          issueId: task.id,
          key: TASK_ROOM_STATE_KEY,
          body: serializeState(state),
          companyId: roomContext.companyId,
          title: "Task Room state",
          format: "markdown",
          changeSummary: "Record Task Owner technical verification"
        });
        const boundaryState = await updateRoomWorkStateOutsideInvocation(
          roomContext,
          {
            latestOutcome: {
              taskId: completed.id,
              identifier: completed.identifier,
              status: completed.status,
              summary: reviewSummary,
              sourceReferences: [completed.identifier || completed.id]
            },
            waitingFor: {
              kind: "user",
              taskId: completed.id,
              detail: "Technical completion has been reported in this Agent Room and is available for user review."
            }
          },
          `Record completed Task boundary for ${completed.identifier || completed.id}`,
          { kind: "runtime", agentId: roomContext.agentId, agentName: roomContext.agentName }
        ).catch(() => null);
        content = JSON.stringify({
          ok: true,
          task: { id: completed.id, identifier: completed.identifier, title: completed.title, status: completed.status },
          verifiedByAgentId: roomContext.agentId,
          userApprovalGranted: false,
          workStateUpdated: Boolean(boundaryState)
        });
      }
    }
  } else {
    content = JSON.stringify({ ok: false, code: "unknown_tool", tool: name });
  }
  } catch (error) {
    content = JSON.stringify({
      ok: false,
      code: "paperclip_tool_request_failed",
      tool: name,
      message: String(error instanceof Error ? error.message : error)
    }, null, 2);
  }
  return { success: true, contentItems: [{ type: "inputText", text: content }] };
}

async function handleRoomView(ctx, params) {
  const companyId = textParam(params, "companyId");
  const issueId = textParam(params, "issueId");
  if (!companyId || !issueId) throw new Error("companyId and issueId are required.");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const [state, workState, checkpointDocument, nativeCompactionsDocument, comments, runtime, initialJobs] = await Promise.all([
    loadRoomState(ctx, companyId, issue, agent),
    loadRoomWorkState(ctx, companyId, issue),
    ctx.issues.documents.get(issue.id, ROOM_CHECKPOINTS_KEY, companyId),
    ctx.issues.documents.get(issue.id, ROOM_NATIVE_COMPACTIONS_KEY, companyId),
    ctx.issues.listComments(issue.id, companyId),
    getRuntimeConfig(ctx),
    listRoomJobs(ctx, issue.id)
  ]);
  let jobs = initialJobs;
  const roomRuntime = agentRoomRuntime(runtime, agent);
  const pendingJobId = textParam(state.pendingTurn, "jobId");
  const pendingJob = jobs.find((job) => job.id === pendingJobId) ?? null;
  if (pendingJob && ACTIVE_ROOM_JOB_STATUSES.has(pendingJob.status) && !activeRoomMessageJobs.has(issue.id)) {
    const interrupted = await updateRoomJob(ctx, pendingJob, {
      status: "interrupted",
      completedAt: now(),
      error: "The Room worker restarted before this Job completed. The user message and Room state were preserved."
    });
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", interrupted.error);
    await saveRoomState(ctx, companyId, issue.id, state, "Mark interrupted Room Job after worker restart");
    emitRoomEvent(ctx, companyId, issue.id, { type: "interrupted", job: interrupted });
    jobs.splice(jobs.findIndex((job) => job.id === pendingJob.id), 1, interrupted);
  }
  jobs = await reconcileRoomJobLedger(ctx, issue.id, state, jobs);
  const attachments = await listIssueAttachmentsDirect(runtime.spsApiUrl, issue.id).catch((error) => {
    ctx.logger?.warn?.("Room attachment list failed.", {
      issueId: issue.id,
      message: error instanceof Error ? error.message : String(error)
    });
    return [];
  });
  return {
    room: {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      agentId: agent.id,
      agentName: agent.name,
      agentRole: agent.role ?? null,
      projectId: issue.projectId ?? null
    },
    state,
    workState,
    checkpoints: parseState(checkpointDocument?.body) ?? [],
    nativeCompactions: Array.isArray(parseState(nativeCompactionsDocument?.body)) ? parseState(nativeCompactionsDocument.body).slice(-100) : [],
    comments: mostRecentComments(comments, 100),
    attachments: attachments.slice(-100).map(attachmentSnapshot),
    jobs: jobs.slice(-20),
    runtime: {
      enabled: roomRuntime.enabled,
      kind: roomRuntime.kind,
      model: roomRuntime.model || null,
      reasoningEffort: roomRuntime.reasoningEffort || null,
      taskAssignmentEnabled: runtime.enableTaskAssignment
    }
  };
}

async function handleCodexAccountsView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const [agents, runtime] = await Promise.all([
    ctx.agents.list({ companyId, limit: 200 }),
    getRuntimeConfig(ctx)
  ]);
  const accounts = localCodexAccounts();
  const defaultHome = runtime.codexHome || textParam(process.env, "CODEX_HOME") || path.join(os.homedir(), ".codex");
  return {
    accounts: accounts.map(({ id, label, directoryName, home }) => ({ id, label, directoryName, home })),
    agents: agents
      .filter(isHiredAgent)
      .filter((agent) => textParam(agent, "adapterType") === "codex_local")
      .map((agent) => {
        const effectiveHome = configuredEnvironmentValue(agent, "CODEX_HOME") || defaultHome;
        const selected = accounts.find((account) => normalizeCodexHome(account.home) === normalizeCodexHome(effectiveHome));
        return {
          id: agent.id,
          name: agent.name,
          role: agent.role ?? "general",
          model: textParam(asRecord(agent.adapterConfig), "model", "Default") || "Default",
          selectedAccountId: selected?.id ?? null,
          effectiveHome,
          usesExplicitAccount: Boolean(configuredEnvironmentValue(agent, "CODEX_HOME"))
        };
      })
  };
}

const WORKPLANE_ROLE_ID_RE = /^[a-z][a-z0-9-]{0,63}$/;

function normalizeWorkplaneRoleId(value) {
  const roleId = textParam({ value }, "value").toLowerCase().replace(/\s+/g, "-");
  if (!WORKPLANE_ROLE_ID_RE.test(roleId)) {
    throw new Error("Workplane role ID must use lowercase letters, numbers, and hyphens and start with a letter.");
  }
  return roleId;
}

function normalizeWorkplaneMemoryAccess(value) {
  const memoryAccess = textParam({ value }, "value").toLowerCase();
  if (!new Set(["read_write", "read", "none"]).has(memoryAccess)) {
    throw new Error("Workplane memory access must be read_write, read, or none.");
  }
  return memoryAccess;
}

function normalizeWorkplaneReviewMode(value) {
  const reviewMode = textParam({ value }, "value").toLowerCase();
  if (!new Set(["automatic", "manual"]).has(reviewMode)) {
    throw new Error("Workplane review mode must be automatic or manual.");
  }
  return reviewMode;
}

function organizationAgentSummary(agent) {
  const identity = resolveAgentWorkplaneIdentity(agent);
  return {
    id: agent.id,
    urlKey: agent.urlKey ?? agent.id,
    name: agent.name,
    paperclipRole: agent.role ?? "general",
    adapterType: agent.adapterType ?? null,
    model: textParam(asRecord(agent.adapterConfig), "model") || null,
    status: agent.status ?? null,
    workplane: identity
  };
}

async function handleOrganizationSettingsView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const agents = await ctx.agents.list({ companyId, limit: 200 });
  const hiredAgents = agents.filter(isHiredAgent);
  return {
    templates: listOrganizationTemplates().map((template) => {
      const preview = resolveOrganizationTemplate(template.id, hiredAgents);
      return {
        ...template,
        eligibleAgentCount: preview.assignments.length,
        configuredAgentCount: preview.skippedConfiguredAgentIds.length,
        unmatchedAgentCount: preview.unmatchedAgentIds.length
      };
    }).filter((template) => !template.visibleWhenEligible || template.eligibleAgentCount > 0),
    agents: hiredAgents
      .map(organizationAgentSummary)
      .sort((left, right) => left.name.localeCompare(right.name))
  };
}

async function handleOrganizationAgentPolicySave(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const agentId = textParam(params, "agentId");
  const kind = textParam(params, "kind").toLowerCase();
  if (!agentId) throw new Error("agentId is required.");
  if (!new Set(["lead", "worker", "hybrid"]).has(kind)) {
    throw new Error("Workplane kind must be lead, worker, or hybrid.");
  }
  const roleId = normalizeWorkplaneRoleId(textParam(params, "roleId", kind));
  const requestedTargets = [...new Set(listParam(params, "assignableRoleIds").map(normalizeWorkplaneRoleId))];
  const assignableRoleIds = kind === "worker"
    ? []
    : requestedTargets.length
      ? requestedTargets
      : ["worker", "hybrid"];
  const agent = await ctx.agents.get(agentId, companyId);
  if (!isHiredAgent(agent)) throw new Error("Only a hired Agent can receive a Workplane role.");
  const existingIdentity = resolveAgentWorkplaneIdentity(agent);
  const memoryAccess = normalizeWorkplaneMemoryAccess(textParam(params, "memoryAccess", existingIdentity.memoryAccess));
  const reviewMode = normalizeWorkplaneReviewMode(textParam(params, "reviewMode", existingIdentity.reviewMode));
  const adapterConfig = {
    ...asRecord(agent.adapterConfig),
    workplane: {
      ...asRecord(asRecord(agent.adapterConfig).workplane),
      roleId,
      kind,
      assignableRoleIds,
      memoryAccess,
      reviewMode
    }
  };
  const runtime = await getRuntimeConfig(ctx);
  await updateAgentAdapterConfigDirect(runtime.spsApiUrl, companyId, agent.id, adapterConfig);
  const updated = { ...agent, adapterConfig };
  return {
    ok: true,
    agent: organizationAgentSummary(updated),
    nextRoomTurn: "The new Workplane role, delegation, memory, and review policies apply when this Agent starts its next Room or Task turn. Existing Task ownership and Task review mode remain unchanged."
  };
}

async function handleOrganizationSettingsAccess(_ctx, _params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  return {
    companyId,
    canConfigureAgents: Boolean(actionCtx?.actor?.permissions?.includes("agents:configure"))
  };
}

async function handleOrganizationCollaborationReadiness(_ctx, _params, actionCtx) {
  requireAgentConfigurationAction(actionCtx);
  return readCollaborationReadiness();
}

async function handleOrganizationTemplateApply(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const templateId = textParam(params, "templateId");
  if (!templateId) throw new Error("templateId is required.");

  const agents = (await ctx.agents.list({ companyId, limit: 200 })).filter(isHiredAgent);
  const preview = resolveOrganizationTemplate(templateId, agents);
  if (!preview.template.actionable) {
    throw new Error("This template is a manual starting point and cannot be applied automatically.");
  }

  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const runtime = await getRuntimeConfig(ctx);
  const updated = [];
  const failures = [];
  for (const assignment of preview.assignments) {
    const agent = agentsById.get(assignment.agentId);
    if (!agent) continue;
    const adapterConfig = {
      ...asRecord(agent.adapterConfig),
      workplane: {
        ...asRecord(asRecord(agent.adapterConfig).workplane),
        ...assignment.policy
      }
    };
    try {
      await updateAgentAdapterConfigDirect(runtime.spsApiUrl, companyId, agent.id, adapterConfig);
      updated.push({ id: agent.id, name: agent.name, workplane: assignment.policy });
    } catch (error) {
      failures.push({ id: agent.id, name: agent.name, error: String(error instanceof Error ? error.message : error) });
    }
  }

  return {
    ok: failures.length === 0,
    template: preview.template,
    updated,
    skippedConfiguredAgentIds: preview.skippedConfiguredAgentIds,
    unmatchedAgentIds: preview.unmatchedAgentIds,
    failures,
    nextRoomTurn: "Updated Agents use explicit generic Workplane policies from their next Room or Task turn. Existing Rooms and Tasks were not changed."
  };
}

async function handleCodexAccountSelect(ctx, params, actionCtx) {
  const companyId = requireAgentConfigurationAction(actionCtx);
  const agentId = textParam(params, "agentId");
  const accountId = textParam(params, "accountId");
  if (!agentId || !accountId) throw new Error("agentId and accountId are required.");
  const account = localCodexAccounts().find((candidate) => candidate.id === accountId);
  if (!account) throw new Error("The selected Codex account is no longer signed in on this computer. Refresh the account list and choose an available account.");
  const agent = await ctx.agents.get(agentId, companyId);
  if (!isHiredAgent(agent) || textParam(agent, "adapterType") !== "codex_local") {
    throw new Error("Only a Codex CLI Agent can be assigned a Codex account.");
  }
  const runtime = await getRuntimeConfig(ctx);
  const adapterConfig = applyCodexAccountToAdapterConfig(agent, account);
  await updateAgentAdapterConfigDirect(runtime.spsApiUrl, companyId, agent.id, adapterConfig);
  return {
    ok: true,
    agentId: agent.id,
    account: { id: account.id, label: account.label, home: account.home },
    nextRoomSession: "A Room using a different Codex account starts a new Codex CLI session on its next message. SPS Room history and checkpoints remain available."
  };
}

async function handleRoomTaskSummary(ctx, params) {
  const companyId = textParam(params, "companyId");
  const issueId = textParam(params, "issueId");
  if (!companyId || !issueId) throw new Error("companyId and issueId are required.");
  const room = await ctx.issues.get(issueId, companyId);
  if (!isAgentRoom(room) || !room.projectId) return { room: null, tasks: [], activeTaskCount: 0, referencedFiles: [] };
  const [issues, agents] = await Promise.all([
    ctx.issues.list({ companyId, projectId: room.projectId, limit: 500 }),
    ctx.agents?.list ? ctx.agents.list({ companyId, limit: 200 }) : Promise.resolve([])
  ]);
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const tasks = issues
    .filter((issue) => issue.parentId === room.id && !isLongLivedRoom(issue))
    .map((issue) => {
      const worker = agentsById.get(issue.assigneeAgentId);
      return {
        id: issue.id,
        identifier: issue.identifier ?? issue.id,
        title: issue.title,
        status: issue.status,
        description: issue.description ?? "",
        updatedAt: issue.updatedAt ?? null,
        assigneeAgent: worker ? { id: worker.id, name: worker.name, role: worker.role ?? null } : null
      };
    })
    .sort(compareTasks);
  return {
    room: { id: room.id, identifier: room.identifier, title: room.title, projectId: room.projectId },
    tasks,
    activeTaskCount: tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status)).length,
    referencedFiles: taskFileReferences(tasks)
  };
}

async function handleRoomWorkspaceView(ctx, params) {
  const roomView = await handleRoomView(ctx, params);
  const taskSummary = await handleRoomTaskSummary(ctx, params);
  const companyId = textParam(params, "companyId");
  const projectId = roomView.room.projectId;
  const project = projectId ? await ctx.projects.get(projectId, companyId) : null;
  const agent = await ctx.agents.get(roomView.room.agentId, companyId);
  // Resolve through the current Project profile so changing the profile is visible
  // before the next Room turn persists the new binding.
  const resolvedWorkspace = await resolveRoomWorkspace(ctx, companyId, roomView.room, agent, roomView.state);
  const projectWorkspaces = resolvedWorkspace.workspaces;
  const selectedWorkspace = resolvedWorkspace.workspace;
  const workingDirectory = workspaceLocalPath(selectedWorkspace) || roomView.state?.workingDirectory || "";
  const workspaceSetupState = projectWorkspaces === null
    ? "legacy"
    : !projectWorkspaces.length || !selectedWorkspace
      ? "missing"
      : !workingDirectory || !fs.existsSync(workingDirectory)
        ? "unavailable"
        : "ready";
  const workspaces = workingDirectory ? [workspaceGitChanges({
    id: roomView.room.agentId,
    name: `${roomView.room.agentName} 작업 폴더`,
    cwd: workingDirectory,
    metadata: { kind: workspaceKindForAgent(agent) }
  })] : [];
  return {
    ...roomView,
    project: project ? {
      id: project.id,
      name: project.name ?? project.slug ?? project.id,
      routeKey: project.urlKey ?? project.slug ?? project.id
    } : null,
    tasks: taskSummary.tasks,
    activeTaskCount: taskSummary.activeTaskCount,
    referencedFiles: taskSummary.referencedFiles,
    workspaces,
    workspaceBinding: roomView.state?.workspace ?? null,
    workspaceSetup: {
      state: workspaceSetupState,
      registeredCount: Array.isArray(projectWorkspaces) ? projectWorkspaces.length : null,
      selectedName: selectedWorkspace?.name ?? null
    },
    workspaceLinkTargets: (Array.isArray(projectWorkspaces) ? projectWorkspaces : [])
      .map((workspace) => ({
        projectId,
        workspaceId: workspace.id,
        workspaceName: workspace.name ?? "Workspace",
        rootPath: workspaceLocalPath(workspace)
      }))
      .filter((workspace) => workspace.projectId && workspace.workspaceId && workspace.rootPath),
    changedFileCount: workspaces.reduce((count, workspace) => count + workspace.files.length, 0)
  };
}

function workplaneIssueSummary(issue, parentRoom = null) {
  return {
    id: issue.id,
    identifier: issue.identifier ?? issue.id,
    title: issue.title,
    status: issue.status,
    parentId: issue.parentId ?? null,
    agentId: agentRoomAgentId(issue),
    agentName: isAgentRoom(issue) ? issue.title : null,
    assigneeAgentId: issue.assigneeAgentId ?? null,
    assigneeUserId: issue.assigneeUserId ?? null,
    updatedAt: issue.updatedAt ?? null,
    parentRoom: parentRoom ? {
      id: parentRoom.id,
      identifier: parentRoom.identifier ?? parentRoom.id,
      title: parentRoom.title,
      agentId: agentRoomAgentId(parentRoom),
      agentName: isAgentRoom(parentRoom) ? parentRoom.title : null
    } : null
  };
}

function compareTasks(left, right) {
  const statusDifference = (TASK_STATUS_ORDER.get(left.status) ?? 99) - (TASK_STATUS_ORDER.get(right.status) ?? 99);
  if (statusDifference !== 0) return statusDifference;
  return String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? ""));
}

function projectTaskSummary(issue, project, parentRoom = null) {
  return {
    ...workplaneIssueSummary(issue, parentRoom),
    project: project ? { id: project.id, name: project.name ?? project.slug ?? project.id } : null
  };
}

async function handleProjectWorkplaneView(ctx, params) {
  const companyId = textParam(params, "companyId");
  const projectId = textParam(params, "projectId");
  if (!companyId || !projectId) throw new Error("companyId and projectId are required.");
  const project = await ctx.projects.get(projectId, companyId);
  if (!project) throw new Error("Project was not found.");
  const provisioned = await provisionProjectAgentRooms(ctx, companyId, projectId);
  const initialIssues = await ctx.issues.list({ companyId, projectId, limit: 500 });
  const retiredLegacyRooms = await retireLegacyRoleRooms(ctx, companyId, initialIssues);
  const [issues, agents, workspaces] = await Promise.all([
    ctx.issues.list({ companyId, projectId, limit: 500 }),
    ctx.agents.list({ companyId, limit: 200 }),
    listProjectWorkspaces(ctx, companyId, projectId)
  ]);
  const workspaceProfile = await loadProjectWorkspaceProfile(ctx, projectId, workspaces);
  const hiredAgents = agents.filter(isHiredAgent);
  const agentsById = new Map(hiredAgents.map((agent) => [agent.id, agent]));
  const rooms = issues.filter((issue) => (
    isAgentRoom(issue) &&
    !TERMINAL_STATUSES.has(issue.status) &&
    agentsById.has(agentRoomAgentId(issue))
  ));
  const activeLegacyRoleRoomCount = issues.filter((issue) => isLegacyRoleRoom(issue) && !TERMINAL_STATUSES.has(issue.status)).length;
  const taskCount = issues.filter((issue) => !isLongLivedRoom(issue) && issue.projectId === projectId).length;
  return {
    project: { id: project.id, name: project.name ?? project.slug ?? projectId, routeKey: project.urlKey ?? project.slug ?? projectId },
    provisionedAgentRoomCount: provisioned.created.length,
    retiredNonHiredAgentRoomCount: provisioned.retired.length,
    retiredLegacyRoleRoomCount: retiredLegacyRooms.length,
    activeLegacyRoleRoomCount,
    rooms: rooms.map((room) => ({
      ...workplaneIssueSummary(room),
      agent: agentsById.get(agentRoomAgentId(room)) ? {
        id: agentsById.get(agentRoomAgentId(room)).id,
        name: agentsById.get(agentRoomAgentId(room)).name,
        role: agentsById.get(agentRoomAgentId(room)).role ?? null,
        status: agentsById.get(agentRoomAgentId(room)).status
      } : null
    })),
    workspaceProfile: {
      profile: workspaceProfile,
      workspaces: (Array.isArray(workspaces) ? workspaces : []).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        path: workspaceLocalPath(workspace),
        repoUrl: workspace.repoUrl ?? null,
        isPrimary: workspace.isPrimary === true
      })),
      agents: hiredAgents.map((agent) => ({ id: agent.id, name: agent.name, role: agent.role ?? null }))
    },
    taskCount
  };
}

async function handleProjectTasksView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const selectedProjectId = textParam(params, "projectId");
  const projects = await ctx.projects.list({ companyId, limit: 200 });
  const projectSummaries = projects.map((project) => ({ id: project.id, name: project.name ?? project.slug ?? project.id }));
  if (!selectedProjectId) {
    return {
      projects: projectSummaries,
      selectedProjectId: null,
      requiresProjectSelection: true,
      tasks: []
    };
  }
  const selectedProject = projects.find((project) => project.id === selectedProjectId);
  if (!selectedProject) throw new Error("Project was not found.");
  const [issues, agents] = await Promise.all([
    ctx.issues.list({ companyId, projectId: selectedProjectId, limit: 500 }),
    ctx.agents?.list ? ctx.agents.list({ companyId, limit: 200 }) : Promise.resolve([])
  ]);
  const roomsById = new Map(issues.filter(isLongLivedRoom).map((room) => [room.id, room]));
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const tasks = issues
    .filter((issue) => issue.projectId === selectedProjectId && !isLongLivedRoom(issue))
    .map((issue) => {
      const worker = agentsById.get(issue.assigneeAgentId);
      return {
        ...projectTaskSummary(issue, selectedProject, roomsById.get(issue.parentId) ?? null),
        assigneeAgent: worker ? { id: worker.id, name: worker.name, role: worker.role ?? null } : null
      };
    })
    .sort(compareTasks);
  return {
    projects: projectSummaries,
    project: { id: selectedProject.id, name: selectedProject.name ?? selectedProject.slug ?? selectedProject.id },
    selectedProjectId,
    requiresProjectSelection: false,
    tasks
  };
}

async function handleRoleRulesView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const roles = await Promise.all(LEGACY_PROJECT_ROOM_ROLES.map(async (role) => {
    const rule = await ensureRoleAgentsMd(ctx, companyId, role);
    return {
      role,
      slug: roleRulesSlug(role),
      body: rule.body,
      version: rule.version,
      updatedAt: rule.updatedAt,
      isDefault: rule.isDefault
    };
  }));
  return { roles };
}

async function handleRoleRulesSave(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const role = textParam(params, "role");
  const body = rawTextParam(params, "body").trim();
  if (!LEGACY_PROJECT_ROOM_ROLES.includes(role)) {
    throw new Error("Legacy Role Room instructions are no longer editable. Configure the hired Agent's Instructions instead.");
  }
  if (!body) throw new Error("AGENTS.md content is required.");
  if (body.length > 24000) throw new Error("AGENTS.md content must be 24000 characters or fewer.");
  if (!ctx.state?.set) throw new Error("SPS plugin state is unavailable.");
  const record = { version: 1, role, body, updatedAt: now(), isDefault: false };
  await ctx.state.set(roleRulesScope(companyId, role), record);
  return { ok: true, role, updatedAt: record.updatedAt };
}

// The native SPS Task chat is the only Task UI. This data handler remains
// internal because Task protocol tests and automation still need a bounded Task snapshot.
async function handleTaskRoomView(ctx, params) {
  const companyId = textParam(params, "companyId");
  const issueId = textParam(params, "issueId");
  if (!companyId || !issueId) throw new Error("companyId and issueId are required.");
  const task = await ctx.issues.get(issueId, companyId);
  if (!task || !task.parentId) throw new Error("Task Room is available only on a child Task issue.");
  const [taskStateDocument, comments, parentRoom, runtime, worker] = await Promise.all([
    ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId),
    ctx.issues.listComments(task.id, companyId),
    ctx.issues.get(task.parentId, companyId),
    getRuntimeConfig(ctx),
    task.assigneeAgentId && ctx.agents?.get ? ctx.agents.get(task.assigneeAgentId, companyId).catch(() => null) : Promise.resolve(null)
  ]);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room") {
    throw new Error("This Task has no Task Room state. Legacy Direct Task test runs do not provide collaborative Task Room state.");
  }
  return {
    task: {
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      assigneeAgentId: task.assigneeAgentId ?? null
    },
    state: taskState,
    ownerRoom: parentRoom ? { id: parentRoom.id, title: parentRoom.title } : null,
    worker: worker ? { id: worker.id, name: worker.name, role: worker.role ?? null } : null,
    comments: mostRecentComments(comments, 100),
    runtime: { enabled: runtime.enabled }
  };
}

async function handleTaskOwnerFeedback(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) {
    return { ok: false, code: "codex_rooms_disabled", message: "Enable the Codex Room runtime before requesting owner feedback." };
  }
  const issueId = textParam(params, "issueId");
  const message = textParam(params, "message");
  if (!message) return { ok: false, code: "message_required", message: "A feedback request is required." };
  const task = await ctx.issues.get(issueId, companyId);
  if (!task || !task.parentId) throw new Error("Task Room is available only on a child Task issue.");
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room") throw new Error("This Task has no collaborative Task Room state.");
  if (taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
  const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, taskState.originatingRoomIssueId);
  if (taskState.owningAgentId !== agent.id) throw new Error("Task Room owner Agent does not match the originating Room.");
  if (activeRoomMessageJobs.has(ownerRoom.id) || await activeRoomJob(ctx, ownerRoom.id)) {
    return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  }
  const requestComment = await ctx.issues.createComment(task.id, `## User Request for ${agent.name} Feedback\n${message}`, companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_feedback",
    sourceCommentId: requestComment.id ?? null,
    payload: { message }
  });
  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: requestComment.id ?? null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id);
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist queued Task owner feedback Job");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  const started = startDurableRoomJob(ctx, { companyId, runtime, job });
  if (!started) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  return { ok: true, accepted: true, taskId: task.id, ownerAgent: agent.name, jobId: job.id };
}

async function handleRoomBootstrap(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const issueId = textParam(params, "issueId");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const requestedWorkspaceId = textParam(params, "workspaceId");
  const requestedWorkingDirectory = textParam(params, "workingDirectory");
  const state = await loadRoomState(ctx, companyId, issue, agent);
  const resolved = await resolveRoomWorkspace(ctx, companyId, issue, agent, state);
  if (!Array.isArray(resolved.workspaces) || !resolved.workspaces.length) {
    return { ok: false, code: "workspace_required", message: "Add a registered Project Workspace before configuring this Room." };
  }
  const selected = requestedWorkspaceId
    ? resolved.workspaces.find((workspace) => workspace.id === requestedWorkspaceId)
    : requestedWorkingDirectory
      ? resolved.workspaces.find((workspace) => normalizedWorkspacePath(workspaceLocalPath(workspace)) === normalizedWorkspacePath(requestedWorkingDirectory))
      : resolved.workspace;
  if (!selected) {
    return { ok: false, code: "workspace_not_found", message: "Select one of this Project's registered Workspaces. Raw folder paths are not accepted." };
  }
  state.workspace = workspaceBinding(selected);
  delete state.workingDirectory;
  state.version = 3;
  state.runtime.updatedAt = now();
  await saveRoomState(ctx, companyId, issue.id, state, "Update Room Workspace binding");
  return {
    ok: true,
    state,
    workspaces: resolved.workspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      kind: workspaceKindForProjectWorkspace(workspace),
      isPrimary: workspace.isPrimary === true
    }))
  };
}

async function runRoomMessageInBackground(ctx, { companyId, issueId, runtime, sourceCommentId, message }) {
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (state.pendingTurn?.kind !== "room_message" || state.pendingTurn?.sourceCommentId !== sourceCommentId) return;
  let activity = null;
  try {
    const { client, threadId } = await openThread(ctx, runtime, state, companyId, issue, agent);
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Room Codex thread for background turn");
    activity = roomActivityReporter(ctx, companyId, issue.id, state);
    const prepared = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: message,
      excludedCommentId: sourceCommentId
    });
    const turn = await client.runTurn({ threadId, text: prepared.text, onProgress: activity.report });
    markCodexRoomContextHydrated(state, threadId, prepared);
    await activity.flush();
    const assistantMessage = turnResultText(turn);
    const reasoningSummary = roomReasoningSummary(state);
    if (reasoningSummary) {
      await ctx.issues.createComment(issue.id, `**${agent.name} · 생각 요약**\n${reasoningSummary}`, companyId);
    }
    const assistantComment = await ctx.issues.createComment(issue.id, `**${agent.name}**\n${assistantMessage}`, companyId);
    state.runtime.updatedAt = now();
    state.lastCommentId = assistantComment.id ?? sourceCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    await saveRoomState(ctx, companyId, issue.id, state, "Persist completed background Room turn");
  } catch (error) {
    await activity?.flush();
    finishRoomActivity(state, "failed", error);
    await saveRoomState(ctx, companyId, issue.id, state, "Persist failed background Room turn for recovery");
    throw error;
  }
}

function startRoomMessageInBackground(ctx, input) {
  if (activeRoomMessageJobs.has(input.issueId)) return false;
  const job = queueRoom(input.issueId, () => runRoomMessageInBackground(ctx, input));
  trackActiveRoomJob(ctx, input.issueId, job, "Background Room turn failed.");
  return true;
}

async function handleRoomSend(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) {
    return { ok: false, code: "codex_rooms_disabled", message: "Codex Room runtime is disabled. Configure and enable it before sending a live message." };
  }
  const issueId = textParam(params, "issueId");
  const message = textParam(params, "message");
  if (!message) return { ok: false, code: "message_required", message: "A Room message is required." };
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (activeRoomMessageJobs.has(issue.id)) {
    return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  }
  const userComment = await ctx.issues.createComment(issue.id, roomUserCommentBody(message, [], "agent"), companyId);
  state.pendingTurn = { kind: "room_message", sourceCommentId: userComment.id ?? null, message, startedAt: now() };
  beginRoomActivity(state, "room_message");
  await saveRoomState(ctx, companyId, issue.id, state, "Persist queued Room message before background turn");
  const started = startRoomMessageInBackground(ctx, {
    companyId,
    issueId: issue.id,
    runtime,
    sourceCommentId: userComment.id ?? null,
    message
  });
  if (!started) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  return { ok: true, accepted: true, sourceCommentId: userComment.id ?? null };
}

async function handleRoomCompact(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) return { ok: false, code: "codex_rooms_disabled", message: "Codex Room runtime is disabled." };
  const issueId = textParam(params, "issueId");
  return queueRoom(issueId, async () => {
    const { issue, agent } = await requireRoom(ctx, companyId, issueId);
    const state = await loadRoomState(ctx, companyId, issue, agent);
    const { client, threadId } = await openThread(ctx, runtime, state, companyId, issue, agent);
    state.pendingTurn = { kind: "compact_handoff", sourceCommentId: state.lastCommentId ?? null, startedAt: now() };
    await saveRoomState(ctx, companyId, issue.id, state, "Persist Room thread before compact handoff");
    const prepared = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const handoffTurn = await client.runTurn({
      threadId,
      text: prepared.text
    });
    markCodexRoomContextHydrated(state, threadId, prepared);
    const summary = turnResultText(handoffTurn);
    const comments = await ctx.issues.listComments(issue.id, companyId);
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary,
      sourceCommentId: mostRecentComments(comments, 1).at(-1)?.id ?? state.lastCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    state.pendingTurn = null;
    await saveRoomState(ctx, companyId, issue.id, state, "Write pre-compact Room handoff");
    await appendCheckpoint(ctx, companyId, issue.id, checkpoint);
    let compacted = { compacted: false, checkpointOnly: true };
    if (typeof client.compactThread === "function") {
      if (threadId) manualCodexCompactionThreads.add(threadId);
      try {
        compacted = await client.compactThread(threadId);
      } finally {
        if (threadId) manualCodexCompactionThreads.delete(threadId);
      }
    }
    if (compacted.compacted === true) state.checkpoint.compactedAt = now();
    state.runtime.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record native Codex compact completion");
    return { ok: true, checkpoint: state.checkpoint, compacted: compacted.compacted };
  });
}

async function runDurableRoomMessage(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let state = null;
  let activity = null;
  let issue = null;
  let agent = null;
  try {
    ({ issue, agent } = await requireRoom(ctx, companyId, job.roomIssueId));
    state = await loadRoomState(ctx, companyId, issue, agent);
    if (state.pendingTurn?.jobId !== job.id) return;
    if (isRoomCliRuntimeAgent(agent)) {
      if (textParam(agent, "adapterType") === "codex_local" && textParam(asRecord(job.payload), "retryRuntime") === "agy") {
        const workingDirectory = isWorkerOnlyRoomAgent(agent)
          ? workerRoomSandboxDirectory(companyId, issue, agent)
          : await resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state);
        job = await updateRoomJob(ctx, job, { status: "working" });
        await saveRoomState(ctx, companyId, issue.id, state, "Bind Agy fallback runtime for queued Room Job");
        emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
        activity = roomActivityReporter(ctx, companyId, issue.id, state);
        const requestedAttachments = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
        const stagedAttachments = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments, workingDirectory);
        const fallbackSessionId = `agy-quota-retry-${job.id}`;
        const prepared = await prepareNativeRoomTurn(ctx, {
          companyId,
          issue,
          state,
          sessionId: fallbackSessionId,
          currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments, textParam(job.payload, "retryOfCommentId")),
          excludedCommentId: job.sourceCommentId
        });
        const turn = await runAgyRoomFallback(ctx, {
          runtime,
          companyId,
          issue,
          agent,
          state,
          workingDirectory,
          preparedText: prepared.text,
          stagedAttachments,
          mode: effectiveRoomMessageMode(agent)
        });
        markNativeRoomContextHydrated(state, fallbackSessionId, prepared);
        await activity.flush();
        const assistantComment = await ctx.issues.createComment(issue.id, `**${agent.name}**\n${turnResultText(turn)}`, companyId);
        state.runtime.updatedAt = now();
        state.runtime.lastError = null;
        state.runtime.quotaRetry = { ...asRecord(state.runtime.quotaRetry), status: "resolved", resolvedAt: now(), resultCommentId: assistantComment.id ?? null };
        state.lastCommentId = assistantComment.id ?? job.sourceCommentId ?? null;
        state.pendingTurn = null;
        finishRoomActivity(state, "completed");
        await saveRoomState(ctx, companyId, issue.id, state, "Persist completed Agy quota retry Room Job");
        job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: assistantComment.id ?? null, payload: { ...asRecord(job.payload), quotaRetryAt: null } });
        emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, activity: state.runtime.activity });
        return job;
      }
      const { client, threadId, roomRuntime, workingDirectory, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
      job = await updateRoomJob(ctx, job, { status: "working" });
      await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for Room Job");
      emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
      activity = roomActivityReporter(ctx, companyId, issue.id, state);
      const requestedAttachments = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
      const stagedAttachments = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments, workingDirectory);
      const prepared = await prepareCodexRoomTurn(ctx, {
        companyId,
        issue,
        state,
        threadId,
        currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments, textParam(job.payload, "retryOfCommentId")),
        excludedCommentId: job.sourceCommentId
      });
      const started = await startRoomTurn(
        client,
        threadId,
        prepared.text,
        stagedAttachments,
        agyContext,
        roomRuntime,
        effectiveRoomMessageMode(agent),
        activity
      );
      if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared);
      state.runtime.lastError = null;
      state.runtime.activity.turnId = started.turnId;
      state.runtime.activity.updatedAt = now();
      await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server Room run");
      const turn = roomRuntime.kind === "codex_app_server"
        ? await codexCompletionWithAgyFallback(ctx, {
            completion: started.completion,
            runtime,
            companyId,
            issue,
            agent,
            state,
            workingDirectory,
            preparedText: prepared.text,
            stagedAttachments,
            mode: effectiveRoomMessageMode(agent)
          })
        : await started.completion;
      await activity.flush();
      const assistantComment = await ctx.issues.createComment(issue.id, `**${agent.name}**\n${turnResultText(turn)}`, companyId);
      state.runtime.updatedAt = now();
      state.runtime.lastError = null;
      state.lastCommentId = assistantComment.id ?? job.sourceCommentId ?? null;
      state.pendingTurn = null;
      finishRoomActivity(state, "completed");
      await saveRoomState(ctx, companyId, issue.id, state, "Persist completed Codex app-server Room Job");
      job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: assistantComment.id ?? null });
      emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, activity: state.runtime.activity });
      return job;
    }
    const { session } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for Room Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    activity = nativeRoomActivityReporter(ctx, companyId, issue.id, state);
    const prepared = await prepareNativeRoomTurn(ctx, {
      companyId,
      issue,
      state,
      sessionId: session.sessionId,
      currentText: textParam(job.payload, "message"),
      excludedCommentId: job.sourceCommentId
    });
    const started = await startNativeAgentSessionTurn(ctx, {
      sessionId: session.sessionId,
      companyId,
      prompt: prepared.text,
      reason: job.kind === "task_owner_report" ? "Review a Worker Task report in the owner Room" : "Continue the long-lived Agent Room",
      onEvent: activity.report
    });
    markNativeRoomContextHydrated(state, session.sessionId, prepared);
    state.runtime.lastRunId = started.runId;
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started.runId;
    state.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record started native Agent Session run");
    const terminalEvent = await started.completion;
    await activity.flush();
    const assistantMessage = nativeSessionResultText(terminalEvent);
    const assistantComment = await ctx.issues.createComment(issue.id, `**${agent.name}**\n${assistantMessage}`, companyId);
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.lastCommentId = assistantComment.id ?? job.sourceCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    await saveRoomState(ctx, companyId, issue.id, state, "Persist completed Room Job");
    job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: assistantComment.id ?? null });
    emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, activity: state.runtime.activity });
  } catch (error) {
    await activity?.flush();
    if (state && issue && isProviderQuotaError(error)) {
      const scheduled = await scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error });
      return scheduled.job;
    }
    if (state) {
      state.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
      state.pendingTurn = null;
      finishRoomActivity(state, "failed", error);
      await saveRoomState(ctx, companyId, job.roomIssueId, state, "Persist failed Room Job");
    }
    job = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    emitRoomEvent(ctx, companyId, job.roomIssueId, { type: "failed", job });
    throw error;
  }
  return job;
}

async function runDurableRoomCompact(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let state = null;
  let activity = null;
  let issue = null;
  let agent = null;
  try {
    ({ issue, agent } = await requireRoom(ctx, companyId, job.roomIssueId));
    state = await loadRoomState(ctx, companyId, issue, agent);
    if (state.pendingTurn?.jobId !== job.id) return;
    if (isRoomCliRuntimeAgent(agent)) {
      const { client, threadId, roomRuntime, workingDirectory, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
      job = await updateRoomJob(ctx, job, { status: "working" });
      await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for checkpoint Job");
      emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
      activity = roomActivityReporter(ctx, companyId, issue.id, state);
      const prepared = await prepareCodexRoomTurn(ctx, {
        companyId,
        issue,
        state,
        threadId,
        currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
      });
      const started = await startRoomTurn(
        client,
        threadId,
        prepared.text,
        [],
        agyContext,
        roomRuntime,
        effectiveRoomMessageMode(agent),
        activity
      );
      if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared);
      state.runtime.lastError = null;
      state.runtime.activity.turnId = started.turnId;
      await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server checkpoint run");
      const turn = roomRuntime.kind === "codex_app_server"
        ? await codexCompletionWithAgyFallback(ctx, {
            completion: started.completion,
            runtime,
            companyId,
            issue,
            agent,
            state,
            workingDirectory,
            preparedText: prepared.text,
            stagedAttachments: [],
            mode: effectiveRoomMessageMode(agent)
          })
        : await started.completion;
      await activity.flush();
      const checkpoint = {
        version: (state.checkpoint?.version ?? 0) + 1,
        summary: turnResultText(turn),
        sourceCommentId: state.lastCommentId ?? job.sourceCommentId ?? null,
        createdAt: now(),
        compactedAt: null
      };
      state.checkpoint = checkpoint;
      await saveRoomState(ctx, companyId, issue.id, state, "Write Codex app-server Room checkpoint");
      await appendCheckpoint(ctx, companyId, issue.id, checkpoint);
      let compacted = { compacted: false, checkpointOnly: true };
      if (turn?.fallbackFrom !== "codex" && typeof client.compactThread === "function") {
        if (threadId) manualCodexCompactionThreads.add(threadId);
        try {
          compacted = await client.compactThread(threadId);
        } finally {
          if (threadId) manualCodexCompactionThreads.delete(threadId);
        }
      }
      if (compacted.compacted === true) state.checkpoint.compactedAt = now();
      state.runtime.updatedAt = now();
      state.runtime.lastError = null;
      state.pendingTurn = null;
      finishRoomActivity(state, "completed");
      state.runtime.activity.checkpointOnly = compacted.checkpointOnly === true;
      state.runtime.activity.compacted = compacted.compacted === true;
      await saveRoomState(ctx, companyId, issue.id, state, "Record completed Codex app-server checkpoint Job");
      job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), payload: { ...job.payload, ...compacted } });
      emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, checkpoint });
      return job;
    }
    const { session } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for checkpoint Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    activity = nativeRoomActivityReporter(ctx, companyId, issue.id, state);
    const prepared = await prepareNativeRoomTurn(ctx, {
      companyId,
      issue,
      state,
      sessionId: session.sessionId,
      currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const started = await startNativeAgentSessionTurn(ctx, {
      sessionId: session.sessionId,
      companyId,
      prompt: prepared.text,
      reason: "Create a durable Room checkpoint",
      onEvent: activity.report
    });
    markNativeRoomContextHydrated(state, session.sessionId, prepared);
    state.runtime.lastRunId = started.runId;
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started.runId;
    await saveRoomState(ctx, companyId, issue.id, state, "Record started native checkpoint run");
    const terminalEvent = await started.completion;
    await activity.flush();
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary: nativeSessionResultText(terminalEvent),
      sourceCommentId: state.lastCommentId ?? job.sourceCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    await saveRoomState(ctx, companyId, issue.id, state, "Write native Room checkpoint");
    await appendCheckpoint(ctx, companyId, issue.id, checkpoint);
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.checkpointOnly = true;
    await saveRoomState(ctx, companyId, issue.id, state, "Record completed native Room checkpoint Job");
    job = await updateRoomJob(ctx, job, {
      status: "completed",
      completedAt: now(),
      payload: { ...job.payload, compacted: false, checkpointOnly: true }
    });
    emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, checkpoint });
  } catch (error) {
    await activity?.flush();
    if (state && issue && isProviderQuotaError(error)) {
      const scheduled = await scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error });
      return scheduled.job;
    }
    if (state) {
      state.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
      state.pendingTurn = null;
      finishRoomActivity(state, "failed", error);
      await saveRoomState(ctx, companyId, job.roomIssueId, state, "Persist failed Room compact Job");
    }
    job = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    emitRoomEvent(ctx, companyId, job.roomIssueId, { type: "failed", job });
    throw error;
  }
}

async function runDurableTaskOwnerFeedback(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let ownerState = null;
  let activity = null;
  let ownerRoom = null;
  let agent = null;
  try {
    const task = await ctx.issues.get(job.taskIssueId, companyId);
    if (!task?.parentId) throw new Error("Task Room is no longer available.");
    const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
    const taskState = parseState(taskStateDocument?.body);
    if (!taskState || taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
    ({ issue: ownerRoom, agent } = await requireRoom(ctx, companyId, task.parentId));
    ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
    if (ownerState.pendingTurn?.jobId !== job.id) return;
    const comments = await ctx.issues.listComments(task.id, companyId);
    if (textParam(agent, "adapterType") === "codex_local") {
      const { client, threadId, roomRuntime, workingDirectory } = await openThread(ctx, runtime, ownerState, companyId, ownerRoom, agent);
      job = await updateRoomJob(ctx, job, { status: "working" });
      await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind Codex app-server thread for Task feedback Job");
      emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
      activity = roomActivityReporter(ctx, companyId, ownerRoom.id, ownerState);
      const feedbackPrompt = [
        "TASK ROOM FEEDBACK REQUEST.",
        "Respond only with concise guidance for the Worker in this Task Room.",
        "Do not create a new Task, implement work, or change Task status.",
        `Task: ${task.identifier ?? task.id} ${task.title}`,
        `Task state: ${JSON.stringify(taskState)}`,
        `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
        `User request: ${textParam(job.payload, "message")}`
      ].join("\n\n");
      const prepared = await prepareCodexRoomTurn(ctx, {
        companyId,
        issue: ownerRoom,
        state: ownerState,
        threadId,
        currentText: feedbackPrompt
      });
      const started = await startRoomTurn(
        client,
        threadId,
        prepared.text,
        [],
        null,
        roomRuntime,
        "agent",
        activity
      );
      markCodexRoomContextHydrated(ownerState, threadId, prepared);
      ownerState.runtime.lastError = null;
      ownerState.runtime.activity.turnId = started.turnId;
      ownerState.runtime.activity.updatedAt = now();
      await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started Codex app-server Task feedback run");
      const turn = await codexCompletionWithAgyFallback(ctx, {
        completion: started.completion,
        runtime,
        companyId,
        issue: ownerRoom,
        agent,
        state: ownerState,
        workingDirectory,
        preparedText: prepared.text,
        stagedAttachments: [],
        mode: "agent"
      });
      await activity.flush();
      const feedbackComment = await ctx.issues.createComment(task.id, `## ${agent.name} Feedback\n${turnResultText(turn)}`, companyId);
      ownerState.runtime.updatedAt = now();
      ownerState.runtime.lastError = null;
      ownerState.lastCommentId = feedbackComment.id ?? job.sourceCommentId ?? null;
      ownerState.pendingTurn = null;
      finishRoomActivity(ownerState, "completed");
      await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist completed Codex app-server Task feedback Job");
      job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: feedbackComment.id ?? null });
      emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "completed", job, activity: ownerState.runtime.activity });
      return job;
    }
    const { session } = await ensureNativeRoomSession(ctx, companyId, ownerRoom, agent, ownerState);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind native Agent Session for Task feedback Job");
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
    activity = nativeRoomActivityReporter(ctx, companyId, ownerRoom.id, ownerState);
    const feedbackPrompt = [
      "TASK ROOM FEEDBACK REQUEST.",
      "Respond only with concise guidance for the Worker in this Task Room.",
      "Do not create a new Task, implement work, or change Task status.",
      `Task: ${task.identifier ?? task.id} ${task.title}`,
      `Task state: ${JSON.stringify(taskState)}`,
      `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
      `User request: ${textParam(job.payload, "message")}`
    ].join("\n\n");
    const prepared = await prepareNativeRoomTurn(ctx, {
      companyId,
      issue: ownerRoom,
      state: ownerState,
      sessionId: session.sessionId,
      currentText: feedbackPrompt
    });
    const started = await startNativeAgentSessionTurn(ctx, {
      sessionId: session.sessionId,
      companyId,
      prompt: prepared.text,
      reason: "Prepare owner feedback for a Worker Task",
      onEvent: activity.report
    });
    markNativeRoomContextHydrated(ownerState, session.sessionId, prepared);
    ownerState.runtime.lastRunId = started.runId;
    ownerState.runtime.lastError = null;
    ownerState.runtime.activity.turnId = started.runId;
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started native Task feedback run");
    const terminalEvent = await started.completion;
    await activity.flush();
    const feedbackComment = await ctx.issues.createComment(task.id, `## ${agent.name} Feedback\n${nativeSessionResultText(terminalEvent)}`, companyId);
    ownerState.runtime.updatedAt = now();
    ownerState.runtime.lastRunId = terminalEvent.runId;
    ownerState.runtime.lastError = null;
    ownerState.lastCommentId = feedbackComment.id ?? job.sourceCommentId ?? null;
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "completed");
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist completed Task feedback Job");
    job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: feedbackComment.id ?? null });
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "completed", job, activity: ownerState.runtime.activity });
  } catch (error) {
    await activity?.flush();
    if (ownerState && ownerRoom && isProviderQuotaError(error)) {
      const scheduled = await scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue: ownerRoom, state: ownerState, error });
      return scheduled.job;
    }
    if (ownerState) {
      ownerState.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
      ownerState.pendingTurn = null;
      finishRoomActivity(ownerState, "failed", error);
      await saveRoomState(ctx, companyId, job.roomIssueId, ownerState, "Persist failed Task feedback Job");
    }
    job = await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    emitRoomEvent(ctx, companyId, job.roomIssueId, { type: "failed", job });
    throw error;
  }
}

function trimRoomContext(value, limit) {
  const text = String(value || "").trim();
  return text.length > limit ? text.slice(text.length - limit) : text;
}

function buildAgyRoomPrompt({ agent, instructions, state, comments = [], text, stagedAttachments = [], mode = "agent" }) {
  const recentComments = comments
    .slice(-18)
    .map((comment) => trimRoomContext(comment?.body, 1400))
    .filter(Boolean)
    .join("\n\n---\n\n");
  const checkpoint = trimRoomContext(state?.checkpoint?.summary, 5000);
  const files = stagedAttachments.length
    ? stagedAttachments.map((attachment) => `- ${roomAttachmentName(attachment)}: ${attachment.localPath}`).join("\n")
    : "None";
  const identity = resolveAgentWorkplaneIdentity(agent);
  const kindLabel = identity.kind === "unconfigured" ? "Agent" : identity.kind;
  return [
    `You are ${agent.name}, a ${agent.role || "general"} ${kindLabel} in a long-lived SPS project Room.`,
    "Follow the role instructions below. Respond to the current request only. Do not claim SPS Task creation or status changes unless the user can verify them in SPS.",
    roomWorkplaneBoundary(agent),
    `ROLE INSTRUCTIONS:\n${trimRoomContext(instructions, 12000) || "No additional role instructions were supplied."}`,
    `DURABLE ROOM CHECKPOINT:\n${checkpoint || "No checkpoint exists yet."}`,
    `RECENT ROOM CONVERSATION:\n${trimRoomContext(recentComments, 16000) || "No earlier Room messages."}`,
    `ATTACHED LOCAL FILES:\n${files}`,
    `RUN MODE:\n${roomMessageModeLabel(mode)}\n${roomModeInstruction(mode)}`,
    `CURRENT REQUEST:\n${text}`
  ].join("\n\n");
}

async function startRoomTurn(client, threadId, text, stagedAttachments = [], agyContext = null, roomRuntime = null, mode = "agent", activityReporter = null) {
  const selectedMode = roomMessageMode(mode);
  if (client?.kind === "agy_print") {
    if (!agyContext) throw new Error("Agy Room context is missing.");
    return client.startTurn({
      prompt: buildAgyRoomPrompt({ ...agyContext, text, stagedAttachments, mode: selectedMode })
    });
  }
  const threadContext = activeThreadContexts.get(threadId);
  if (threadContext) threadContext.mode = selectedMode;
  const input = [
    { type: "text", text: `${roomModeInstruction(selectedMode)}\n\n${text}` },
    ...stagedAttachments
      .filter((attachment) => attachment.isImage)
      .map((attachment) => ({ type: "localImage", path: attachment.localPath, detail: "auto" }))
  ];
  const turnRequest = {
    threadId,
    input,
    onProgress: activityReporter?.report,
    approvalPolicy: roomRuntime?.approvalPolicy || "never",
    sandboxPolicy: codexTurnSandboxPolicy(roomModeSandbox(roomRuntime, selectedMode)),
    ...(roomRuntime?.reasoningEffort ? { effort: roomRuntime.reasoningEffort } : {}),
    summary: "auto"
  };
  if (typeof client.startTurn === "function") return await client.startTurn(turnRequest);
  const started = await client.request("turn/start", turnRequest);
  const turnId = started?.turn?.id;
  if (!turnId) throw new Error("Codex app-server did not return a turn id.");
  return { turnId, completion: client.waitForTurn(threadId, turnId) };
}

async function completeRoomTurnOutsideInvocation({
  apiUrl,
  issueId,
  agentName,
  state,
  completion,
  activityReporter = null,
  resultVisibilityResolver = null,
  onProviderQuota = null
}) {
  try {
    const turn = await completion;
    const assistantMessage = turnResultText(turn);
    const visibility = resultVisibilityResolver
      ? await resultVisibilityResolver({ assistantMessage, turn })
      : { publish: true };
    const publishResult = visibility?.publish !== false;
    const visibleAssistantMessage = typeof visibility?.transformAssistantMessage === "function"
      ? visibility.transformAssistantMessage(assistantMessage)
      : assistantMessage;
    const assistantComment = publishResult
      ? await createRoomCommentOutsideInvocation(apiUrl, issueId, `**${agentName}**\n${visibleAssistantMessage}`)
      : null;
    state.runtime.updatedAt = now();
    state.lastCommentId = assistantComment?.id ?? state.lastCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.resultCommentId = assistantComment?.id ?? null;
    state.runtime.activity.resultSuppressed = !publishResult;
    state.runtime.activity.suppressionReason = !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null;
    await activityReporter?.flush();
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist completed Room turn");
    return {
      ok: true,
      resultCommentId: assistantComment?.id ?? null,
      suppressed: !publishResult,
      suppressionReason: !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null
    };
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed Room turn");
    } catch {
      // Keep the original Room-turn failure as the visible error whenever recovery persistence also fails.
    }
    return { ok: false, error: message };
  }
}

async function completeRoomCompactOutsideInvocation({ apiUrl, issueId, state, completion, client, threadId, activityReporter = null, onProviderQuota = null }) {
  try {
    const turn = await completion;
    await activityReporter?.flush();
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary: turnResultText(turn),
      sourceCommentId: state.lastCommentId ?? state.pendingTurn?.sourceCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    await appendCheckpointOutsideInvocation(apiUrl, issueId, checkpoint);
    let compacted = { compacted: false, checkpointOnly: true };
    if (turn?.fallbackFrom !== "codex" && typeof client.compactThread === "function") {
      if (threadId) manualCodexCompactionThreads.add(threadId);
      try {
        compacted = await client.compactThread(threadId);
      } finally {
        if (threadId) manualCodexCompactionThreads.delete(threadId);
      }
    }
    state.checkpoint.compactedAt = now();
    state.runtime.updatedAt = now();
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.compacted = compacted.compacted === true;
    state.runtime.activity.checkpointOnly = compacted.checkpointOnly === true;
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Record completed Room compact");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed Room compact");
    } catch {
      // Preserve the original compact failure when state recovery also fails.
    }
  }
}

async function completeTaskOwnerFeedbackOutsideInvocation({ apiUrl, taskIssueId, ownerRoomIssueId, agentName, ownerState, completion, activityReporter = null, onProviderQuota = null }) {
  try {
    const turn = await completion;
    await activityReporter?.flush();
    const feedbackComment = await createRoomCommentOutsideInvocation(apiUrl, taskIssueId, `## ${agentName} Feedback\n${turnResultText(turn)}`);
    ownerState.runtime.updatedAt = now();
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "completed");
    ownerState.runtime.activity.resultCommentId = feedbackComment.id ?? null;
    await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist completed Task feedback");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist failed Task feedback");
    } catch {
      // Preserve the original feedback failure when state recovery also fails.
    }
  }
}

async function completeNativeRoomTurnOutsideInvocation({
  apiUrl,
  issueId,
  agentName,
  state,
  completion,
  activityReporter,
  resultVisibilityResolver = null,
  onProviderQuota = null
}) {
  try {
    const terminalEvent = await completion;
    await activityReporter?.flush();
    const assistantMessage = nativeSessionResultText(terminalEvent);
    const visibility = resultVisibilityResolver
      ? await resultVisibilityResolver({ assistantMessage, terminalEvent })
      : { publish: true };
    const publishResult = visibility?.publish !== false;
    const visibleAssistantMessage = typeof visibility?.transformAssistantMessage === "function"
      ? visibility.transformAssistantMessage(assistantMessage)
      : assistantMessage;
    const assistantComment = publishResult
      ? await createRoomCommentOutsideInvocation(apiUrl, issueId, `**${agentName}**\n${visibleAssistantMessage}`)
      : null;
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.lastCommentId = assistantComment?.id ?? state.lastCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.resultCommentId = assistantComment?.id ?? null;
    state.runtime.activity.resultSuppressed = !publishResult;
    state.runtime.activity.suppressionReason = !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null;
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist completed native Agent Session turn");
    return {
      ok: true,
      resultCommentId: assistantComment?.id ?? null,
      suppressed: !publishResult,
      suppressionReason: !publishResult ? textParam(visibility, "reason") || "internal_task_feedback" : null
    };
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    const message = String(error instanceof Error ? error.message : error).slice(0, 500);
    state.runtime.updatedAt = now();
    state.runtime.lastError = message;
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed native Agent Session turn");
    } catch {
      // Preserve the Agent Session failure when recovery persistence also fails.
    }
    return { ok: false, error: message };
  }
}

async function completeNativeRoomCheckpointOutsideInvocation({ apiUrl, issueId, state, completion, activityReporter, onProviderQuota = null }) {
  try {
    const terminalEvent = await completion;
    await activityReporter?.flush();
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary: nativeSessionResultText(terminalEvent),
      sourceCommentId: state.lastCommentId ?? state.pendingTurn?.sourceCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    await appendCheckpointOutsideInvocation(apiUrl, issueId, checkpoint);
    state.runtime.updatedAt = now();
    state.runtime.lastRunId = terminalEvent.runId;
    state.runtime.lastError = null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    state.runtime.activity.checkpointOnly = true;
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist native Agent Session checkpoint");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    state.runtime.updatedAt = now();
    state.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed native Agent Session checkpoint");
    } catch {
      // Preserve the Agent Session failure when recovery persistence also fails.
    }
  }
}

async function completeNativeTaskOwnerFeedbackOutsideInvocation({ apiUrl, taskIssueId, ownerRoomIssueId, agentName, ownerState, completion, activityReporter, onProviderQuota = null }) {
  try {
    const terminalEvent = await completion;
    await activityReporter?.flush();
    const feedbackComment = await createRoomCommentOutsideInvocation(
      apiUrl,
      taskIssueId,
      `## ${agentName} Feedback\n${nativeSessionResultText(terminalEvent)}`
    );
    ownerState.runtime.updatedAt = now();
    ownerState.runtime.lastRunId = terminalEvent.runId;
    ownerState.runtime.lastError = null;
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "completed");
    ownerState.runtime.activity.resultCommentId = feedbackComment.id ?? null;
    await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist completed native Task feedback");
  } catch (error) {
    if (onProviderQuota && isProviderQuotaError(error)) {
      await activityReporter?.flush();
      return onProviderQuota(error);
    }
    ownerState.runtime.updatedAt = now();
    ownerState.runtime.lastError = String(error instanceof Error ? error.message : error).slice(0, 500);
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    try {
      await activityReporter?.flush();
      await saveRoomStateOutsideInvocation(apiUrl, ownerRoomIssueId, ownerState, "Persist failed native Task feedback");
    } catch {
      // Preserve the Agent Session failure when recovery persistence also fails.
    }
  }
}

async function launchRoomMessageWithinAction(ctx, {
  companyId,
  runtime,
  job: initialJob,
  issue,
  agent,
  state,
  completionObserver = null,
  resultVisibilityResolver = null
}) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  if (isRoomCliRuntimeAgent(agent)) {
    const { client, threadId, roomRuntime, workingDirectory, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
    const activityReporter = roomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for Room Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    const requestedAttachments = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
    const stagedAttachments = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments, workingDirectory);
    const prepared = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments, textParam(job.payload, "retryOfCommentId")),
      excludedCommentId: job.sourceCommentId
    });
    const started = await startRoomTurn(
      client,
      threadId,
      prepared.text,
      stagedAttachments,
      agyContext,
      roomRuntime,
      effectiveRoomMessageMode(agent),
      activityReporter
    );
    if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared);
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started.turnId;
    state.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server Room run");
    const resilientCompletion = roomRuntime.kind === "codex_app_server"
      ? codexCompletionWithAgyFallback(ctx, {
          completion: started.completion,
          runtime,
          companyId,
          issue,
          agent,
          state,
          workingDirectory,
          preparedText: prepared.text,
          stagedAttachments,
          mode: effectiveRoomMessageMode(agent)
        })
      : started.completion;
    const baseCompletion = completeRoomTurnOutsideInvocation({
      apiUrl: runtime.spsApiUrl,
      issueId: issue.id,
      agentName: agent.name,
      state,
      completion: resilientCompletion,
      activityReporter,
      resultVisibilityResolver,
      onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
    });
    const completion = baseCompletion.then(async (result) => {
      if (completionObserver && !result?.retryScheduled) await completionObserver(result);
      return result;
    });
    trackActiveRoomJob(ctx, issue.id, completion);
    return { ...job, completion };
  }
  const { session, workingDirectory } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
  const activityReporter = nativeRoomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
  job = await updateRoomJob(ctx, job, { status: "working" });
  await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for Room Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  const requestedAttachments = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
  const stagedAttachments = await stageRoomAttachments(runtime.spsApiUrl, issue.id, requestedAttachments, workingDirectory);
  const retryOfCommentId = textParam(job.payload, "retryOfCommentId");
  const prepared = await prepareNativeRoomTurn(ctx, {
    companyId,
    issue,
    state,
    sessionId: session.sessionId,
    currentText: roomTurnText(textParam(job.payload, "message"), stagedAttachments, retryOfCommentId),
    excludedCommentId: job.sourceCommentId
  });
  const started = await startNativeAgentSessionTurn(ctx, {
    sessionId: session.sessionId,
    companyId,
    prompt: prepared.text,
    reason: job.kind === "task_owner_report" ? "Review a Worker Task report in the owner Room" : "Continue the long-lived Agent Room",
    onEvent: activityReporter.report
  });
  markNativeRoomContextHydrated(state, session.sessionId, prepared);
  state.runtime.lastRunId = started.runId;
  state.runtime.lastError = null;
  state.runtime.activity.turnId = started.runId;
  state.runtime.activity.updatedAt = now();
  await saveRoomState(ctx, companyId, issue.id, state, "Record started native Agent Session run");

  const baseCompletion = completeNativeRoomTurnOutsideInvocation({
    apiUrl: runtime.spsApiUrl,
    issueId: issue.id,
    agentName: agent.name,
    state,
    completion: started.completion,
    activityReporter,
    resultVisibilityResolver,
    onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
  });
  const completion = baseCompletion.then(async (result) => {
    if (completionObserver && !result?.retryScheduled) await completionObserver(result);
    return result;
  });
  trackActiveRoomJob(ctx, issue.id, completion);
  return { ...job, completion };
}

async function launchRoomCompactWithinAction(ctx, { companyId, runtime, job: initialJob, issue, agent, state }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  if (isRoomCliRuntimeAgent(agent)) {
    const { client, threadId, roomRuntime, workingDirectory, agyContext } = await openThread(ctx, runtime, state, companyId, issue, agent);
    const activityReporter = roomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Codex app-server thread for checkpoint Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    const prepared = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue,
      state,
      threadId,
      currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const started = await startRoomTurn(
      client,
      threadId,
      prepared.text,
      [],
      agyContext,
      roomRuntime,
      effectiveRoomMessageMode(agent),
      activityReporter
    );
    if (roomRuntime.kind === "codex_app_server") markCodexRoomContextHydrated(state, threadId, prepared);
    state.runtime.lastError = null;
    state.runtime.activity.turnId = started.turnId;
    state.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record started Codex app-server checkpoint run");
    const resilientCompletion = roomRuntime.kind === "codex_app_server"
      ? codexCompletionWithAgyFallback(ctx, {
          completion: started.completion,
          runtime,
          companyId,
          issue,
          agent,
          state,
          workingDirectory,
          preparedText: prepared.text,
          stagedAttachments: [],
          mode: effectiveRoomMessageMode(agent)
        })
      : started.completion;
    const completion = completeRoomCompactOutsideInvocation({
      apiUrl: runtime.spsApiUrl,
      issueId: issue.id,
      state,
      completion: resilientCompletion,
      client,
      threadId,
      activityReporter,
      onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
    });
    trackActiveRoomJob(ctx, issue.id, completion);
    return job;
  }
  const { session } = await ensureNativeRoomSession(ctx, companyId, issue, agent, state);
  const activityReporter = nativeRoomActivityReporterOutsideInvocation(runtime.spsApiUrl, issue.id, state);
  job = await updateRoomJob(ctx, job, { status: "working" });
  await saveRoomState(ctx, companyId, issue.id, state, "Bind native Agent Session for checkpoint Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  const prepared = await prepareNativeRoomTurn(ctx, {
    companyId,
    issue,
    state,
    sessionId: session.sessionId,
    currentText: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
  });
  const started = await startNativeAgentSessionTurn(ctx, {
    sessionId: session.sessionId,
    companyId,
    prompt: prepared.text,
    reason: "Create a durable Room checkpoint",
    onEvent: activityReporter.report
  });
  markNativeRoomContextHydrated(state, session.sessionId, prepared);
  state.runtime.lastRunId = started.runId;
  state.runtime.lastError = null;
  state.runtime.activity.turnId = started.runId;
  state.runtime.activity.updatedAt = now();
  await saveRoomState(ctx, companyId, issue.id, state, "Record started native checkpoint run");
  const completion = completeNativeRoomCheckpointOutsideInvocation({
    apiUrl: runtime.spsApiUrl,
    issueId: issue.id,
    state,
    completion: started.completion,
    activityReporter,
    onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue, state, error })
  });
  trackActiveRoomJob(ctx, issue.id, completion);
  return job;
}

async function launchTaskOwnerFeedbackWithinAction(ctx, { companyId, runtime, job: initialJob, task, taskState, comments, ownerRoom, agent, ownerState }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  if (textParam(agent, "adapterType") === "codex_local") {
    const { client, threadId, roomRuntime, workingDirectory } = await openThread(ctx, runtime, ownerState, companyId, ownerRoom, agent);
    const activityReporter = roomActivityReporterOutsideInvocation(runtime.spsApiUrl, ownerRoom.id, ownerState);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind Codex app-server thread for Task feedback Job");
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
    const feedbackPrompt = [
      "TASK ROOM FEEDBACK REQUEST.",
      "Respond only with concise guidance for the Worker in this Task Room.",
      "Do not create a new Task, implement work, or change Task status.",
      `Task: ${task.identifier ?? task.id} ${task.title}`,
      `Task state: ${JSON.stringify(taskState)}`,
      `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
      `User request: ${textParam(job.payload, "message")}`
    ].join("\n\n");
    const prepared = await prepareCodexRoomTurn(ctx, {
      companyId,
      issue: ownerRoom,
      state: ownerState,
      threadId,
      currentText: feedbackPrompt
    });
    const started = await startRoomTurn(
      client,
      threadId,
      prepared.text,
      [],
      null,
      roomRuntime,
      "agent",
      activityReporter
    );
    markCodexRoomContextHydrated(ownerState, threadId, prepared);
    ownerState.runtime.lastError = null;
    ownerState.runtime.activity.turnId = started.turnId;
    ownerState.runtime.activity.updatedAt = now();
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started Codex app-server Task feedback run");
    const resilientCompletion = codexCompletionWithAgyFallback(ctx, {
      completion: started.completion,
      runtime,
      companyId,
      issue: ownerRoom,
      agent,
      state: ownerState,
      workingDirectory,
      preparedText: prepared.text,
      stagedAttachments: [],
      mode: "agent"
    });
    const completion = completeTaskOwnerFeedbackOutsideInvocation({
      apiUrl: runtime.spsApiUrl,
      taskIssueId: task.id,
      ownerRoomIssueId: ownerRoom.id,
      agentName: agent.name,
      ownerState,
      completion: resilientCompletion,
      activityReporter,
      onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue: ownerRoom, state: ownerState, error })
    });
    trackActiveRoomJob(ctx, ownerRoom.id, completion);
    return job;
  }
  const { session } = await ensureNativeRoomSession(ctx, companyId, ownerRoom, agent, ownerState);
  const activityReporter = nativeRoomActivityReporterOutsideInvocation(runtime.spsApiUrl, ownerRoom.id, ownerState);
  job = await updateRoomJob(ctx, job, { status: "working" });
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind native Agent Session for Task feedback Job");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  const feedbackPrompt = [
    "TASK ROOM FEEDBACK REQUEST.",
    "Respond only with concise guidance for the Worker in this Task Room.",
    "Do not create a new Task, implement work, or change Task status.",
    `Task: ${task.identifier ?? task.id} ${task.title}`,
    `Task state: ${JSON.stringify(taskState)}`,
    `Recent Task comments: ${mostRecentComments(comments, 12).map((comment) => comment.body).join("\n---\n")}`,
    `User request: ${textParam(job.payload, "message")}`
  ].join("\n\n");
  const prepared = await prepareNativeRoomTurn(ctx, {
    companyId,
    issue: ownerRoom,
    state: ownerState,
    sessionId: session.sessionId,
    currentText: feedbackPrompt
  });
  const started = await startNativeAgentSessionTurn(ctx, {
    sessionId: session.sessionId,
    companyId,
    prompt: prepared.text,
    reason: "Prepare owner feedback for a Worker Task",
    onEvent: activityReporter.report
  });
  markNativeRoomContextHydrated(ownerState, session.sessionId, prepared);
  ownerState.runtime.lastRunId = started.runId;
  ownerState.runtime.lastError = null;
  ownerState.runtime.activity.turnId = started.runId;
  ownerState.runtime.activity.updatedAt = now();
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Record started native Task feedback run");
  const completion = completeNativeTaskOwnerFeedbackOutsideInvocation({
    apiUrl: runtime.spsApiUrl,
    taskIssueId: task.id,
    ownerRoomIssueId: ownerRoom.id,
    agentName: agent.name,
    ownerState,
    completion: started.completion,
    activityReporter,
    onProviderQuota: (error) => scheduleRoomProviderQuotaRetry(ctx, { runtime, job, issue: ownerRoom, state: ownerState, error })
  });
  trackActiveRoomJob(ctx, ownerRoom.id, completion);
  return job;
}

function startDurableRoomJob(ctx, input) {
  const issueId = input.job.roomIssueId;
  if (activeRoomMessageJobs.has(issueId)) return false;
  const runner = ["room_message", "task_owner_report"].includes(input.job.kind)
    ? runDurableRoomMessage
    : input.job.kind === "compact_handoff"
      ? runDurableRoomCompact
      : runDurableTaskOwnerFeedback;
  const promise = queueRoom(issueId, () => runner(ctx, input));
  trackActiveRoomJob(ctx, issueId, promise);
  return true;
}

async function handleRoomSendJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  const issueId = textParam(params, "issueId");
  const message = textParam(params, "message");
  const attachmentIds = attachmentIdsParam(params);
  const retryOfCommentId = textParam(params, "retryOfCommentId");
  if (!message && !attachmentIds.length) return { ok: false, code: "message_required", message: "Write a message or attach at least one file." };
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const validatedRetryOfCommentId = await validateRoomRetrySource(ctx, companyId, issue.id, retryOfCommentId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (await roomHasActiveWork(ctx, issue.id, state)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const attachments = await resolveRoomAttachments(runtime.spsApiUrl, issue.id, attachmentIds);
  const userComment = await ctx.issues.createComment(issue.id, roomUserCommentBody(message, attachments, "agent", validatedRetryOfCommentId), companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: issue.id,
    kind: "room_message",
    sourceCommentId: userComment.id ?? null,
    payload: { message, attachments, ...(validatedRetryOfCommentId ? { retryOfCommentId: validatedRetryOfCommentId } : {}) }
  });
  state.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: userComment.id ?? null, startedAt: now() };
  beginRoomActivity(state, job.kind, job.id, userComment.id ?? null);
  await saveRoomState(ctx, companyId, issue.id, state, "Persist queued Room message Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  try {
    await launchRoomMessageWithinAction(ctx, { companyId, runtime, job, issue, agent, state });
    return { ok: true, accepted: true, sourceCommentId: userComment.id ?? null, jobId: job.id };
  } catch (error) {
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    await saveRoomState(ctx, companyId, issue.id, state, "Persist failed Room launch");
    await updateRoomJob(ctx, job, {
      status: "failed",
      completedAt: now(),
      error: String(error instanceof Error ? error.message : error).slice(0, 500)
    });
    throw error;
  }
}

async function handleRoomCompactJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  const issueId = textParam(params, "issueId");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (await roomHasActiveWork(ctx, issue.id, state)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: issue.id,
    kind: "compact_handoff",
    sourceCommentId: state.lastCommentId ?? null,
    payload: {}
  });
  state.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: job.sourceCommentId, startedAt: now() };
  beginRoomActivity(state, job.kind, job.id);
  await saveRoomState(ctx, companyId, issue.id, state, "Persist queued Room compact Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  try {
    await launchRoomCompactWithinAction(ctx, { companyId, runtime, job, issue, agent, state });
    return { ok: true, accepted: true, jobId: job.id };
  } catch (error) {
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    await saveRoomState(ctx, companyId, issue.id, state, "Persist failed Room compact launch");
    await updateRoomJob(ctx, job, { status: "failed", completedAt: now(), error: String(error instanceof Error ? error.message : error).slice(0, 500) });
    throw error;
  }
}

async function handleTaskOwnerFeedbackJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  const taskId = textParam(params, "issueId");
  const message = textParam(params, "message");
  if (!message) return { ok: false, code: "message_required", message: "A feedback request is required." };
  const task = await ctx.issues.get(taskId, companyId);
  if (!task?.parentId) throw new Error("Task Room is available only on a child Task issue.");
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
  const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, task.parentId);
  if (taskState.owningAgentId !== agent.id) throw new Error("Task Room owner Agent does not match the originating Room.");
  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  if (await roomHasActiveWork(ctx, ownerRoom.id, ownerState)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const requestComment = await ctx.issues.createComment(task.id, `## User Request for ${agent.name} Feedback\n${message}`, companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_feedback",
    sourceCommentId: requestComment.id ?? null,
    payload: { message }
  });
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: requestComment.id ?? null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id);
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist queued Task feedback Job");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  const comments = await ctx.issues.listComments(task.id, companyId);
  try {
    await launchTaskOwnerFeedbackWithinAction(ctx, { companyId, runtime, job, task, taskState, comments, ownerRoom, agent, ownerState });
    return { ok: true, accepted: true, taskId: task.id, ownerAgent: agent.name, jobId: job.id };
  } catch (error) {
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist failed Task feedback launch");
    await updateRoomJob(ctx, job, { status: "failed", completedAt: now(), error: String(error instanceof Error ? error.message : error).slice(0, 500) });
    throw error;
  }
}

function taskStatusTransition(event) {
  const payload = asRecord(event?.payload);
  const patch = asRecord(payload.patch);
  return {
    previousStatus: textParam(asRecord(payload._previous), "status"),
    nextStatus: textParam(payload, "status") || textParam(patch, "status")
  };
}

const TASK_BOUNDARY_REPORT_MIN_CHARS = 220;

function taskReportFingerprint(body) {
  const text = String(body || "").replace(/\s+/g, " ").trim();
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

function taskCommentAgentId(comment) {
  return textParam(comment, "authorAgentId") || textParam(comment, "derivedAuthorAgentId");
}

function taskBoundaryReportKind(body) {
  const text = String(body || "").trim();
  if (!text) return null;
  const heading = text.match(/^\s*##\s*SPS\s+(Blocker|Final)\s+Report\b/im)?.[1]?.toLowerCase();
  if (heading === "blocker") return "blocked";
  if (heading === "final") return "in_review";
  const bracketed = text.match(/\[\s*(?:SPS\s+)?(Blocker|Final)\s+Report\s*\]\s*$/im)?.[1]?.toLowerCase();
  if (bracketed === "blocker") return "blocked";
  if (bracketed === "final") return "in_review";
  return null;
}

function isSubstantiveTaskBoundaryReport(body, kind) {
  const text = String(body || "").trim();
  if (text.length < TASK_BOUNDARY_REPORT_MIN_CHARS) return false;
  if (kind === "blocked") {
    return /(?:blocker|blocked|permission|quota|dependency|권한|한도|의존|차단|중단)/iu.test(text)
      && /(?:impact|next|needed|영향|필요|다음|요청)/iu.test(text);
  }
  const utf8EvidenceGroups = [
    /(?:changed\s+(?:files|paths)|outputs?|affected\s+paths?|implementation\s+paths?|files?\s+changed|변경\s*(?:파일|경로|요약|사항)|산출물|수행\s*내용|구현\s*경로)/iu,
    /(?:verification|validation|tests?|build|passed|failed|return\s+code|검증|테스트|빌드|통과|실패|확인)/iu,
    /(?:risk|reviewer|next|remaining|unverified|미검증|위험|검토자|다음|남은)/iu
  ];
  return utf8EvidenceGroups.filter((pattern) => pattern.test(text)).length >= 2;
}

function taskReportBelongsToCurrentReviewCycle(comment, comments, taskState) {
  const review = asRecord(taskState?.review);
  const correctionHistory = (Array.isArray(taskState?.reviewHistory) ? taskState.reviewHistory : [])
    .map(asRecord)
    .filter((entry) => textParam(entry, "outcome") === "correction_requested");
  const feedbackCommentId = textParam(review, "feedbackCommentId");
  const hasCorrectionBoundary = textParam(review, "status") === "correction_requested"
    || Boolean(feedbackCommentId)
    || correctionHistory.length > 0;
  if (!hasCorrectionBoundary) return true;
  const feedbackComment = feedbackCommentId
    ? mostRecentComments(comments, Number.MAX_SAFE_INTEGER).find((candidate) => candidate?.id === feedbackCommentId)
    : null;
  const cutoffCandidates = [
    feedbackComment?.createdAt,
    textParam(review, "status") === "correction_requested" ? review.updatedAt : null,
    ...correctionHistory.map((entry) => entry.closedAt)
  ]
    .map((value) => Date.parse(String(value || "")))
    .filter(Number.isFinite);
  if (!cutoffCandidates.length) return false;
  const reportCreatedAt = Date.parse(String(comment?.createdAt || ""));
  return Number.isFinite(reportCreatedAt) && reportCreatedAt > Math.max(...cutoffCandidates);
}

function latestTaskBoundaryReport(comments, taskState, expectedKind = null) {
  const workerAgentId = textParam(taskState, "workerAgentId");
  return mostRecentComments(comments, 100)
    .slice()
    .reverse()
    .map((comment) => ({
      comment,
      kind: taskBoundaryReportKind(comment?.body),
      authorAgentId: taskCommentAgentId(comment),
      fingerprint: taskReportFingerprint(comment?.body)
    }))
    .find(({ comment, kind, authorAgentId }) => (
      kind
      && (!expectedKind || kind === expectedKind)
      && authorAgentId === workerAgentId
      && taskReportBelongsToCurrentReviewCycle(comment, comments, taskState)
      && isSubstantiveTaskBoundaryReport(comment?.body, kind)
    )) ?? null;
}

function taskBoundaryReportById(comments, taskState, reportCommentId) {
  const workerAgentId = textParam(taskState, "workerAgentId");
  return mostRecentComments(comments, 100)
    .map((comment) => ({
      comment,
      kind: taskBoundaryReportKind(comment?.body),
      authorAgentId: taskCommentAgentId(comment),
      fingerprint: taskReportFingerprint(comment?.body)
    }))
    .find(({ comment, kind, authorAgentId }) => (
      comment?.id === reportCommentId
      && kind
      && authorAgentId === workerAgentId
      && taskReportBelongsToCurrentReviewCycle(comment, comments, taskState)
      && isSubstantiveTaskBoundaryReport(comment?.body, kind)
    )) ?? null;
}

function taskBoundaryAlreadyReported(taskState, report) {
  const review = asRecord(taskState?.review);
  const notification = asRecord(taskState?.ownerNotification);
  const priorReportId = textParam(notification, "reportCommentId") || textParam(review, "workerReportCommentId");
  const priorFingerprint = textParam(notification, "reportFingerprint") || textParam(review, "workerReportFingerprint");
  const notificationStatus = textParam(notification, "status");
  const manualReportPosted = notificationStatus === "manual_pending" && Boolean(textParam(notification, "roomReportCommentId"));
  return (["working", "completed"].includes(notificationStatus) || manualReportPosted)
    && (priorReportId === report.comment.id || (priorFingerprint && priorFingerprint === report.fingerprint));
}

async function recordManualTaskOwnerReview(ctx, { companyId, eventId, task, taskState, ownerRoom, report }) {
  if (taskBoundaryAlreadyReported(taskState, report)) {
    return { skipped: true, reason: "duplicate_worker_report" };
  }
  const blocked = task.status === "blocked";
  taskState.review ??= {};
  taskState.review.mode = "manual";
  taskState.review.status = blocked ? "blocked_reported" : "owner_review_pending";
  taskState.review.workerReportCommentId = report.comment.id;
  taskState.review.workerReportFingerprint = report.fingerprint;
  taskState.review.updatedAt = now();
  taskState.ownerNotification = {
    eventId,
    status: "manual_pending",
    taskStatus: task.status,
    reportCommentId: report.comment.id,
    reportFingerprint: report.fingerprint,
    roomReportCommentId: null,
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Record manual Task owner review boundary"
  });
  const ownerComment = await ctx.issues.createComment(
    ownerRoom.id,
    [
      "**Worker Task report awaiting manual Lead review**",
      `${task.identifier ?? task.id} is ${task.status}. The assigned Worker posted its substantive ${blocked ? "blocker" : "final"} report in the Task Room.`,
      "This review policy does not wake the Lead automatically. Start the next Lead Room turn when you want technical review, feedback, or completion. This is not a user approval request."
    ].join("\n\n"),
    companyId
  );
  taskState.ownerNotification.roomReportCommentId = ownerComment?.id ?? null;
  taskState.ownerNotification.updatedAt = now();
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Publish manual Task owner review notice"
  });
  return { ok: true, taskId: task.id, ownerRoomIssueId: ownerRoom.id };
}

function taskOwnerReportPrompt(task, taskState, comments) {
  const recentComments = mostRecentComments(comments, 16)
    .map((comment) => trimRoomContext(comment?.body, 1800))
    .filter(Boolean)
    .join("\n\n---\n\n");
  const blocked = task.status === "blocked";
  return [
    "AUTOMATIC TASK OWNER REPORT.",
    "A Worker Task owned by this long-lived Agent Room has reached a review boundary.",
    "Review the Task result as the originating owning Agent. reportsTo does not affect this ownership. Do not perform the Worker's production work yourself.",
    blocked
      ? "The Task is blocked. Explain the exact blocker, its impact, and the smallest user decision or environment change needed. Do not retry or mark it done."
      : "The Task is in_review. Check the reported outputs and actual verification against every acceptance criterion. If all criteria are satisfied, call paperclip.complete_task and then report that the Task was technically verified and marked done. If anything is missing, call paperclip.post_task_feedback with exact corrections and do not mark it done. A correction turn is internal to the Task Room and will not be published as a user-facing Room report.",
    "Task Owner verification is a technical completion decision, never user, product, design, cost, release, or publication approval. Never say that you approved or accepted the work on the user's behalf. Use completion language such as '수락 기준 충족을 확인해 완료 처리했습니다' and include explicit user review items.",
    "Do not create request_confirmation, ask_user_questions, approvals, or any other Task interaction. A Task never asks the user for approval. Keep every user-facing report, question, blocker, and result in this Agent Room. The user may review or reopen a completed Task later.",
    "Before the user-facing Room report, update the durable Room Work State if this result changes the latest outcome, phase, next candidate, source pointers, or waiting boundary. Derive a next candidate from approved repository plans when one is uniquely supported; otherwise record no candidate and ask one focused Room question. Never invent the next step from Task titles alone.",
    `Task: ${task.identifier ?? task.id} ${task.title}`,
    `Task status: ${task.status}`,
    `Task description:\n${trimRoomContext(task.description, 12000) || "No description."}`,
    `Task Room state:\n${trimRoomContext(JSON.stringify(taskState), 6000)}`,
    `Recent Task Room comments:\n${trimRoomContext(recentComments, 16000) || "No Worker report comment was found."}`
  ].join("\n\n");
}

async function latestTaskRoomStateOutsideInvocation(apiUrl, task, fallback) {
  const document = await getRoomDocumentDirect(apiUrl, task.id, TASK_ROOM_STATE_KEY);
  const current = parseState(document?.body);
  if (
    current?.kind === "task_room"
    && current.taskIssueId === task.id
    && current.originatingRoomIssueId === task.parentId
  ) return current;
  return fallback;
}

async function taskOwnerRoomResultVisibilityOutsideInvocation({ apiUrl, task, expectedStatus }) {
  if (expectedStatus !== "in_review") return { publish: true };
  try {
    const taskState = await latestTaskRoomStateOutsideInvocation(apiUrl, task, null);
    const reviewStatus = textParam(asRecord(taskState?.review), "status");
    if (reviewStatus === "correction_requested") {
      return { publish: false, reason: "task_feedback_continues_in_task_room" };
    }
    if (reviewStatus === "owner_verified") {
      return {
        publish: true,
        transformAssistantMessage: normalizeTaskOwnerCompletionReport
      };
    }
  } catch {
    // When disposition state cannot be read, preserve the result instead of hiding a potentially important failure.
  }
  return { publish: true };
}

function normalizeTaskOwnerCompletionReport(message) {
  let normalized = String(message || "");
  const replaceKoreanApproval = (_match, prefix, subject) => (
    `${prefix}${String(subject).trim()}의 수락 기준 충족을 확인해 완료 처리했습니다.`
  );
  normalized = normalized.replace(
    /(^|\n)([^\n.!?]{1,160}?)(?:을|를)\s+(?:승인|수락)(?:(?:하고|하여|해)\s+완료\s+처리|\s+완료(?:\s+처리)?|\s+처리)?했습니다[.!]?/g,
    replaceKoreanApproval
  );
  normalized = normalized.replace(
    /\bI\s+(?:have\s+)?(?:approved|accepted)\s+(?:this|the)\s+(?:Task|work)\b/gi,
    "I technically verified the Task and marked it done"
  );
  normalized = normalized.replace(
    /(^|\n)([^\n.!?]{1,160}?)\s+(?:was|is|has been)\s+(?:approved|accepted)(?:\s+and\s+(?:marked|set)\s+done)?[.!]?/gi,
    (_match, prefix, subject) => `${prefix}${String(subject).trim()} was technically verified and marked done.`
  );
  return normalized;
}

async function completeTaskOwnerNotificationOutsideInvocation({
  apiUrl,
  task,
  eventId,
  expectedStatus,
  jobId,
  reportCommentId,
  reportFingerprint,
  result
}) {
  const taskState = await latestTaskRoomStateOutsideInvocation(apiUrl, task, null);
  if (!taskState) return { skipped: true, reason: "task_room_state_missing" };

  const notification = asRecord(taskState.ownerNotification);
  if (textParam(notification, "reportCommentId") !== reportCommentId) {
    return { skipped: true, reason: "review_cycle_changed" };
  }

  taskState.ownerNotification = {
    ...notification,
    eventId,
    status: result?.ok ? "completed" : "failed",
    taskStatus: expectedStatus,
    jobId,
    reportCommentId,
    reportFingerprint,
    resultCommentId: result?.resultCommentId ?? null,
    ...(result?.ok ? {} : {
      error: String(result?.error || "The owner Room turn failed.").slice(0, 500)
    }),
    updatedAt: now()
  };
  await upsertRoomDocumentOutsideInvocation(apiUrl, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    title: "Task Room state",
    format: "markdown",
    changeSummary: result?.ok
      ? "Complete automatic Task owner report"
      : "Record failed automatic Task owner report"
  });
  return { ok: result?.ok === true };
}

function activeRoomProcessBlocksOwnerReport(ownerState, existingJob, activeProcessJob) {
  if (!activeProcessJob) return false;
  if (ownerState?.pendingTurn || existingJob) return true;
  return ["working", "finishing"].includes(textParam(ownerState?.runtime?.activity, "status"));
}

async function runAutomaticTaskOwnerReport(ctx, { companyId, eventId, taskIssueId, ownerRoomIssueId, expectedStatus, reportCommentId, reportFingerprint }) {
  const task = await ctx.issues.get(taskIssueId, companyId);
  if (!task || task.status !== expectedStatus || !TASK_OWNER_REPORT_STATUSES.has(task.status)) {
    return { skipped: true, reason: "task_status_changed" };
  }
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room" || taskState.originatingRoomIssueId !== ownerRoomIssueId) {
    return { skipped: true, reason: "task_room_state_missing" };
  }

  const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, ownerRoomIssueId);
  if (taskState.owningAgentId !== agent.id) {
    return { skipped: true, reason: "task_owner_agent_mismatch" };
  }
  const runtime = await getRuntimeConfig(ctx);

  const ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
  let ownerJobs = await listRoomJobs(ctx, ownerRoom.id);
  ownerJobs = await reconcileRoomJobLedger(ctx, ownerRoom.id, ownerState, ownerJobs);
  const existingJob = ownerJobs.find((job) => ACTIVE_ROOM_JOB_STATUSES.has(job.status)) ?? null;
  const activeProcessJob = activeRoomMessageJobs.get(ownerRoom.id) ?? null;
  const processJobBlocks = activeRoomProcessBlocksOwnerReport(ownerState, existingJob, activeProcessJob);
  if (ownerState.pendingTurn && !existingJob && !activeProcessJob) {
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", "Recovered stale Room activity before automatic Task owner report.");
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Recover stale Room activity before Task owner report");
  } else if (ownerState.pendingTurn || existingJob || processJobBlocks) {
    // The scheduled Workplane reconciliation Job retries this durable boundary
    // with a fresh core invocation scope after the owner Room becomes idle.
    return { skipped: true, reason: "owner_room_busy" };
  }

  const comments = await ctx.issues.listComments(task.id, companyId);
  const report = latestTaskBoundaryReport(comments, taskState, task.status);
  if (!report || report.kind !== task.status || report.comment.id !== reportCommentId || report.fingerprint !== reportFingerprint) {
    return { skipped: true, reason: "worker_report_missing_or_changed" };
  }
  if (taskBoundaryAlreadyReported(taskState, report)) {
    return { skipped: true, reason: "duplicate_worker_report" };
  }
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_report",
    sourceCommentId: null,
    payload: { message: taskOwnerReportPrompt(task, taskState, comments), eventId, taskStatus: task.status, reportCommentId }
  });
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id, null);
  await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist queued automatic Task owner report");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });

  taskState.review ??= {};
  taskState.review.status = task.status === "blocked" ? "blocked_reported" : "owner_review_requested";
  taskState.review.workerReportCommentId = report.comment.id;
  taskState.review.workerReportFingerprint = report.fingerprint;
  taskState.review.updatedAt = now();
  taskState.ownerNotification = {
    eventId,
    status: "working",
    taskStatus: task.status,
    jobId: job.id,
    reportCommentId: report.comment.id,
    reportFingerprint: report.fingerprint,
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Queue automatic Task owner report"
  });

  let launched;
  try {
    launched = await launchRoomMessageWithinAction(ctx, {
      companyId,
      runtime,
      job,
      issue: ownerRoom,
      agent,
      state: ownerState,
      resultVisibilityResolver: () => taskOwnerRoomResultVisibilityOutsideInvocation({
        apiUrl: runtime.spsApiUrl,
        task,
        expectedStatus
      }),
      completionObserver: (result) => completeTaskOwnerNotificationOutsideInvocation({
        apiUrl: runtime.spsApiUrl,
        task,
        eventId,
        expectedStatus,
        jobId: job.id,
        reportCommentId,
        reportFingerprint,
        result
      })
    });
  } catch (error) {
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "failed", error);
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist failed automatic Task owner report launch").catch(() => {});
    const failedTaskState = await latestTaskRoomStateOutsideInvocation(runtime.spsApiUrl, task, taskState).catch(() => taskState);
    failedTaskState.ownerNotification = {
      ...asRecord(failedTaskState.ownerNotification),
      eventId,
      status: "failed",
      taskStatus: expectedStatus,
      jobId: job.id,
      reportCommentId,
      reportFingerprint,
      error: String(error instanceof Error ? error.message : error).slice(0, 500),
      updatedAt: now()
    };
    await upsertRoomDocumentOutsideInvocation(runtime.spsApiUrl, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(failedTaskState),
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Record failed automatic Task owner report"
    }).catch(() => {});
    await createRoomCommentOutsideInvocation(
      runtime.spsApiUrl,
      ownerRoom.id,
      `**System - Task owner report failed**\n${task.identifier ?? task.id} could not be reviewed automatically: ${String(error instanceof Error ? error.message : error).slice(0, 500)}`
    ).catch(() => {});
    throw error;
  }
  return {
    ok: true,
    taskId: task.id,
    ownerRoomIssueId: ownerRoom.id,
    jobId: job.id,
    completion: launched.completion
  };
}

function issueRunTimestamp(run) {
  return new Date(run?.finishedAt || run?.startedAt || run?.createdAt || 0).getTime() || 0;
}

function sortedIssueRuns(runs) {
  return [...(Array.isArray(runs) ? runs : [])].sort((left, right) => issueRunTimestamp(right) - issueRunTimestamp(left));
}

function issueRunErrorFamily(run) {
  const result = asRecord(run?.resultJson);
  return textParam(run, "errorFamily") || textParam(result, "errorFamily") || textParam(run, "errorCode");
}

function isProviderQuotaRun(run) {
  return issueRunErrorFamily(run) === PROVIDER_QUOTA_ERROR_CODE;
}

function issueRunRetryNotBefore(run) {
  const result = asRecord(run?.resultJson);
  const value = textParam(run, "retryNotBefore")
    || textParam(result, "retryNotBefore")
    || textParam(result, "providerQuotaRetryNotBefore")
    || textParam(result, "transientRetryNotBefore");
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null;
}

function providerQuotaRecoveryAction(action) {
  const evidence = asRecord(action?.evidence);
  return textParam(evidence, "latestRunErrorCode") === PROVIDER_QUOTA_ERROR_CODE
    || textParam(evidence, "latestRunErrorFamily") === PROVIDER_QUOTA_ERROR_CODE;
}

function nextProviderQuotaRetryAt(run, current = Date.now()) {
  const requested = issueRunRetryNotBefore(run);
  const requestedAt = new Date(requested || 0).getTime();
  return new Date(Math.max(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS, Number.isFinite(requestedAt) ? requestedAt : 0)).toISOString();
}

function providerQuotaRetryState(run, currentState = {}, current = Date.now()) {
  const runId = textParam(run, "runId") || textParam(run, "id");
  const previous = asRecord(currentState);
  const sameRun = textParam(previous, "lastFailedRunId") === runId;
  return {
    ...previous,
    status: sameRun && textParam(previous, "status") ? textParam(previous, "status") : "waiting",
    provider: "agy",
    intervalMinutes: 30,
    lastFailedRunId: runId || textParam(previous, "lastFailedRunId") || null,
    nextRetryAt: sameRun && textParam(previous, "nextRetryAt")
      ? textParam(previous, "nextRetryAt")
      : nextProviderQuotaRetryAt(run, current),
    attempt: sameRun ? Math.max(0, Number(previous.attempt) || 0) : Math.max(0, Number(previous.attempt) || 0) + 1,
    lastWakeRunId: sameRun ? textParam(previous, "lastWakeRunId") || null : null,
    updatedAt: sameRun && textParam(previous, "updatedAt") ? textParam(previous, "updatedAt") : now()
  };
}

function workerRuntimeRecoveryAction(task, taskState) {
  const action = asRecord(task?.activeRecoveryAction);
  const workerAgentId = textParam(taskState, "workerAgentId");
  const cause = textParam(action, "cause");
  const returnedWorkerId = textParam(action, "returnOwnerAgentId") || textParam(action, "previousOwnerAgentId");
  if (!textParam(action, "id") || !workerAgentId) return null;
  if (textParam(action, "kind") !== "stranded_assigned_issue") return null;
  if (!TASK_WORKER_RUNTIME_RECOVERY_CAUSES.has(cause)) return null;
  if (returnedWorkerId !== workerAgentId) return null;
  return action;
}

function recoveryWorkerAgentId(task) {
  const action = asRecord(task?.activeRecoveryAction);
  const cause = textParam(action, "cause");
  const workerAgentId = textParam(action, "returnOwnerAgentId") || textParam(action, "previousOwnerAgentId");
  if (!textParam(action, "id") || !workerAgentId) return "";
  if (textParam(action, "kind") !== "stranded_assigned_issue") return "";
  if (!TASK_WORKER_RUNTIME_RECOVERY_CAUSES.has(cause)) return "";
  return workerAgentId;
}

async function recoverLegacyTaskRoomState(ctx, event, task) {
  const workerAgentId = recoveryWorkerAgentId(task);
  if (!workerAgentId || !task.parentId) return null;

  let ownerRoom;
  let ownerAgent;
  let worker;
  try {
    ({ issue: ownerRoom, agent: ownerAgent } = await requireRoom(ctx, event.companyId, task.parentId));
    worker = await ctx.agents.get(workerAgentId, event.companyId);
  } catch {
    return null;
  }
  // reportsTo is organization metadata, not Task authorization. Recover only
  // when the parent is a real Agent Room and the assignee is a managed Worker.
  if (!worker || !isTaskWorkerAgent(worker)) return null;

  const state = {
    version: 1,
    kind: "task_room",
    taskIssueId: task.id,
    projectId: task.projectId ?? ownerRoom.projectId ?? null,
    originatingRoomIssueId: ownerRoom.id,
    owningAgentId: ownerAgent.id,
    owningAgentName: ownerAgent.name,
    owningAgentRole: ownerAgent.role ?? null,
    workerAgentId,
    taskType: "general",
    projectWorkspaceId: task.projectWorkspaceId ?? null,
    projectWorkspaceName: null,
    declaredAffectedPaths: [],
    designReferences: [],
    acceptanceCriteria: [],
    verification: [],
    dependencyTaskIds: [],
    review: {
      required: "owning_agent",
      status: "not_requested",
      workerReportCommentId: null,
      updatedAt: now()
    },
    legacyRecovery: true
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(state),
    companyId: event.companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Recover direct Worker Task Room state after runtime failure"
  });
  return state;
}

function workerRuntimeRecoveryFailure(action) {
  const evidence = asRecord(action?.evidence);
  return textParam(evidence, "latestRunErrorCode") || textParam(action, "cause") || "runtime_unavailable";
}

function workerRuntimeRecoveryAlreadyReported(taskState, actionId) {
  const notification = asRecord(taskState?.ownerNotification);
  return textParam(notification, "kind") === "runtime_block"
    && textParam(notification, "recoveryActionId") === actionId
    && ["working", "completed", "queued"].includes(textParam(notification, "status"));
}

function workerRuntimeBlockOwnerPrompt(task, taskState, worker, action) {
  const evidence = asRecord(action?.evidence);
  return [
    "AUTOMATIC WORKER RUNTIME BLOCK REPORT.",
    "A Worker could not complete its assigned Task because its local runtime failed before it could submit a Worker blocker report.",
    "Do not perform the Worker's production work yourself. Do not reassign or close the Task. The Task remains assigned to the Worker and is blocked until its runtime is repaired or resumed.",
    "Report the blocker to the user in this long-lived Agent Room: identify the affected Task, the exact runtime failure class, the impact, and the smallest next step. Do not create any Task approval or question interaction. Usually the next step is restoring the runtime or quota and then manually resuming the Worker before the owner moves the Task back to todo.",
    `Task: ${task.identifier ?? task.id} ${task.title}`,
    `Task status: ${task.status}`,
    `Assigned Worker: ${worker?.name ?? textParam(taskState, "workerAgentId")}`,
    `Runtime failure class: ${workerRuntimeRecoveryFailure(action)}`,
    `Recovery cause: ${textParam(action, "cause")}`,
    `Last failed run: ${textParam(evidence, "latestRunId") || "unknown"}`,
    `Task description:\n${trimRoomContext(task.description, 12000) || "No description."}`,
    `Task Room state:\n${trimRoomContext(JSON.stringify(taskState), 6000)}`
  ].join("\n\n");
}

async function runAutomaticWorkerRuntimeBlockReport(ctx, input) {
  const task = await ctx.issues.get(input.taskIssueId, input.companyId);
  if (!task || task.status !== "blocked") return { skipped: true, reason: "task_status_changed" };

  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, input.companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room" || taskState.originatingRoomIssueId !== input.ownerRoomIssueId) {
    return { skipped: true, reason: "task_room_state_missing" };
  }
  if (workerRuntimeRecoveryAlreadyReported(taskState, input.recoveryActionId)) {
    return { skipped: true, reason: "duplicate_runtime_block" };
  }

  const { issue: ownerRoom, agent: ownerAgent } = await requireRoom(ctx, input.companyId, input.ownerRoomIssueId);
  if (taskState.owningAgentId !== ownerAgent.id) {
    return { skipped: true, reason: "task_owner_agent_mismatch" };
  }
  const runtime = await getRuntimeConfig(ctx);
  const worker = await ctx.agents.get(input.workerAgentId, input.companyId).catch(() => null);
  const failureClass = workerRuntimeRecoveryFailure(input.recoveryAction);
  const summary = `**System - Worker runtime blocked**\n${task.identifier ?? task.id} ${task.title} is blocked because ${worker?.name ?? "the assigned Worker"} could not run (${failureClass}). The Task remains assigned to that Worker; no manager production work is authorized.`;

  const ownerState = await loadRoomState(ctx, input.companyId, ownerRoom, ownerAgent);
  const existingJob = await activeRoomJob(ctx, ownerRoom.id);
  if (ownerState.pendingTurn || existingJob) {
    await ctx.issues.createComment(ownerRoom.id, `${summary}\nThe owner Room is busy, so this report is left here for the next review turn.`, input.companyId);
    taskState.review ??= {};
    taskState.review.status = "runtime_blocked";
    taskState.review.runtimeRecoveryActionId = input.recoveryActionId;
    taskState.review.updatedAt = now();
    taskState.ownerNotification = {
      eventId: input.eventId,
      kind: "runtime_block",
      status: "queued",
      taskStatus: "blocked",
      recoveryActionId: input.recoveryActionId,
      failureClass,
      updatedAt: now()
    };
    await upsertRoomDocument(ctx, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(taskState),
      companyId: input.companyId,
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Queue Worker runtime block for the next owner Room turn"
    });
    return { skipped: true, reason: "owner_room_busy" };
  }

  const sourceComment = await ctx.issues.createComment(ownerRoom.id, summary, input.companyId);
  const job = await createRoomJob(ctx, {
    companyId: input.companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_report",
    sourceCommentId: sourceComment.id ?? null,
    payload: {
      message: workerRuntimeBlockOwnerPrompt(task, taskState, worker, input.recoveryAction),
      eventId: input.eventId,
      taskStatus: "blocked",
      recoveryActionId: input.recoveryActionId,
      runtimeBlock: true
    }
  });
  ownerState.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: sourceComment.id ?? null, startedAt: now() };
  beginRoomActivity(ownerState, job.kind, job.id, sourceComment.id ?? null);
  await saveRoomState(ctx, input.companyId, ownerRoom.id, ownerState, "Persist queued Worker runtime block report");
  emitRoomEvent(ctx, input.companyId, ownerRoom.id, { type: "job", job });

  taskState.review ??= {};
  taskState.review.status = "runtime_blocked";
  taskState.review.runtimeRecoveryActionId = input.recoveryActionId;
  taskState.review.updatedAt = now();
  taskState.ownerNotification = {
    eventId: input.eventId,
    kind: "runtime_block",
    status: "working",
    taskStatus: "blocked",
    jobId: job.id,
    recoveryActionId: input.recoveryActionId,
    failureClass,
    updatedAt: now()
  };
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId: input.companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: "Queue automatic Worker runtime block owner report"
  });

  try {
    const completedJob = await runDurableRoomMessage(ctx, { companyId: input.companyId, runtime, job });
    taskState.ownerNotification = {
      ...taskState.ownerNotification,
      status: "completed",
      resultCommentId: completedJob?.resultCommentId ?? null,
      updatedAt: now()
    };
    await upsertRoomDocument(ctx, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(taskState),
      companyId: input.companyId,
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Complete automatic Worker runtime block owner report"
    });
    return { ok: true, taskId: task.id, ownerRoomIssueId: ownerRoom.id, jobId: job.id };
  } catch (error) {
    taskState.ownerNotification = {
      ...taskState.ownerNotification,
      status: "failed",
      error: String(error instanceof Error ? error.message : error).slice(0, 500),
      updatedAt: now()
    };
    await upsertRoomDocument(ctx, {
      issueId: task.id,
      key: TASK_ROOM_STATE_KEY,
      body: serializeState(taskState),
      companyId: input.companyId,
      title: "Task Room state",
      format: "markdown",
      changeSummary: "Record failed Worker runtime block owner report"
    }).catch(() => {});
    throw error;
  }
}

async function normalizeWorkerRuntimeRecovery(ctx, event, task, taskState) {
  const recoveryAction = workerRuntimeRecoveryAction(task, taskState);
  if (!recoveryAction) return null;
  const existing = activeWorkerRuntimeRecoveries.get(task.id);
  if (existing) return { scheduled: false, reason: "worker_runtime_recovery_in_progress", completion: existing };

  const completion = (async () => {
    const runtime = await getRuntimeConfig(ctx);
    const workerAgentId = textParam(taskState, "workerAgentId");
    const worker = await ctx.agents.get(workerAgentId, event.companyId).catch(() => null);

    if (providerQuotaRecoveryAction(recoveryAction)) {
      const evidence = asRecord(recoveryAction.evidence);
      const failedRun = {
        runId: textParam(evidence, "latestRunId"),
        errorCode: PROVIDER_QUOTA_ERROR_CODE,
        resultJson: {
          errorFamily: PROVIDER_QUOTA_ERROR_CODE,
          retryNotBefore: textParam(evidence, "retryNotBefore") || null
        }
      };
      await paperclipJsonDirect(runtime.spsApiUrl, `/api/issues/${encodeURIComponent(task.id)}/recovery-actions/resolve`, {
        method: "POST",
        body: {
          actionId: recoveryAction.id,
          outcome: "false_positive",
          sourceIssueStatus: "in_review",
          resolutionNote: "Provider quota blocks this assigned Task. Automatic retry is disabled, so preserve the Worker assignment and report the blocker through the Task owner Room."
        },
        operation: "Worker provider quota recovery resolution"
      });
      await updateIssueDirect(runtime.spsApiUrl, task.id, { status: "blocked" });
      await updateIssueDirect(runtime.spsApiUrl, task.id, {
        assigneeAgentId: workerAgentId,
        assigneeUserId: null,
        executionPolicy: taskExecutionPolicyWithAutomaticRetry(task, false)
      });
      taskState.quotaRetry = providerQuotaRetryState(failedRun, taskState.quotaRetry);
      taskState.quotaRetry.status = "disabled";
      taskState.quotaRetry.holdReason = "provider_quota";
      taskState.quotaRetry.automaticRetry = false;
      taskState.quotaRetry.nextRetryAt = null;
      await upsertRoomDocument(ctx, {
        issueId: task.id,
        key: TASK_ROOM_STATE_KEY,
        body: serializeState(taskState),
        companyId: event.companyId,
        title: "Task Room state",
        format: "markdown",
        changeSummary: "Record Worker provider quota block with automatic retry disabled"
      });
      const eventId = textParam(event, "eventId") || `${task.id}:runtime:${recoveryAction.id}`;
      return runAutomaticWorkerRuntimeBlockReport(ctx, {
        companyId: event.companyId,
        eventId,
        taskIssueId: task.id,
        ownerRoomIssueId: taskState.originatingRoomIssueId,
        workerAgentId,
        recoveryActionId: recoveryAction.id,
        recoveryAction
      });
    }

    // A failed adapter cannot safely accept a reassignment. Pausing it first
    // prevents SPS from launching another costly retry while blocked.
    if (textParam(worker, "status") === "error") {
      await paperclipJsonDirect(runtime.spsApiUrl, `/api/agents/${encodeURIComponent(workerAgentId)}/pause`, {
        method: "POST",
        body: {},
        operation: "Worker runtime pause"
      });
    }

    await paperclipJsonDirect(runtime.spsApiUrl, `/api/issues/${encodeURIComponent(task.id)}/recovery-actions/resolve`, {
      method: "POST",
      body: {
        actionId: recoveryAction.id,
        outcome: "false_positive",
        sourceIssueStatus: "in_review",
        resolutionNote: "Worker runtime failure is a blocked capacity condition. Preserve the Worker assignment and report through the Task owner Room; manager production work is not authorized."
      },
      operation: "Worker runtime recovery resolution"
    });
    // Block before restoring the Worker assignment. SPS may otherwise
    // dispatch a fresh Worker run as part of the reassignment mutation.
    await updateIssueDirect(runtime.spsApiUrl, task.id, { status: "blocked" });
    await updateIssueDirect(runtime.spsApiUrl, task.id, { assigneeAgentId: workerAgentId, assigneeUserId: null });

    const eventId = textParam(event, "eventId") || `${task.id}:runtime:${recoveryAction.id}`;
    return runAutomaticWorkerRuntimeBlockReport(ctx, {
      companyId: event.companyId,
      eventId,
      taskIssueId: task.id,
      ownerRoomIssueId: taskState.originatingRoomIssueId,
      workerAgentId,
      recoveryActionId: recoveryAction.id,
      recoveryAction
    });
  })();
  activeWorkerRuntimeRecoveries.set(task.id, completion);
  try {
    const result = await completion;
    return {
      scheduled: true,
      normalized: true,
      reason: "worker_runtime_recovery_normalized",
      taskId: task.id,
      completion,
      result
    };
  } finally {
    if (activeWorkerRuntimeRecoveries.get(task.id) === completion) activeWorkerRuntimeRecoveries.delete(task.id);
  }
}

async function writeProviderQuotaRetryState(ctx, companyId, task, taskState, changeSummary) {
  await upsertRoomDocument(ctx, {
    issueId: task.id,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary
  });
}

function issueExecutionAutomaticallyRetries(task) {
  return asRecord(asRecord(task?.executionPolicy).failure).automaticRetry === true;
}

function taskExecutionPolicyWithAutomaticRetry(task, automaticRetry) {
  const policy = asRecord(task?.executionPolicy);
  const failure = asRecord(policy.failure);
  return {
    ...policy,
    mode: textParam(policy, "mode") || "normal",
    stages: Array.isArray(policy.stages) ? policy.stages : [],
    failure: {
      ...failure,
      automaticRetry,
      preserveAssignee: failure.preserveAssignee !== false,
      wakeRecoveryOwner: failure.wakeRecoveryOwner === true
    },
    commentRequired: policy.commentRequired !== false
  };
}

async function disableTaskAutomaticRetry(ctx, runtime, companyId, task, taskState) {
  const wasAutomatic = issueExecutionAutomaticallyRetries(task);
  const priorQuotaRetry = asRecord(taskState?.quotaRetry);
  const hadQuotaRetry = Object.keys(priorQuotaRetry).length > 0;
  const executionPolicy = taskExecutionPolicyWithAutomaticRetry(task, false);
  if (wasAutomatic) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { executionPolicy });
    task.executionPolicy = executionPolicy;
  }

  const runs = sortedIssueRuns(await listIssueRunsDirect(runtime.spsApiUrl, task.id));
  const scheduledRuns = runs.filter((run) => textParam(run, "status") === "scheduled_retry");
  const desiredStatus = textParam(task, "status");
  for (const run of scheduledRuns) {
    const runId = textParam(run, "runId") || textParam(run, "id");
    if (!runId) continue;
    await paperclipJsonDirect(runtime.spsApiUrl, `/api/heartbeat-runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      body: {},
      operation: "Cancel disabled Task automatic retry"
    });
  }
  // Cancelling a scheduled core run can transiently reopen its Issue. Restore
  // the user's visible Task status after cancellation.
  if (scheduledRuns.length > 0 && desiredStatus) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { status: desiredStatus, executionPolicy });
    task.status = desiredStatus;
    task.executionPolicy = executionPolicy;
  }

  if (hadQuotaRetry || wasAutomatic || scheduledRuns.length > 0) {
    taskState.quotaRetry = {
      ...priorQuotaRetry,
      status: "disabled",
      provider: textParam(priorQuotaRetry, "provider") || "agy",
      automaticRetry: false,
      scheduledRunId: null,
      nextRetryAt: null,
      updatedAt: now()
    };
    await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Disable Task automatic provider retry");
  }
  return { changed: wasAutomatic || hadQuotaRetry || scheduledRuns.length > 0, cancelledRuns: scheduledRuns.length };
}

async function cancelResolvedTaskWorkerQuotaRetry(ctx, { companyId, task, taskState }) {
  const desiredStatus = textParam(task, "status");
  if (!TASK_WORKER_RETRY_STOP_STATUSES.has(desiredStatus)) return false;

  const wasAutomatic = issueExecutionAutomaticallyRetries(task);
  const quotaRetry = asRecord(taskState?.quotaRetry);
  const hadQuotaRetry = Boolean(Object.keys(quotaRetry).length);
  if (!wasAutomatic && !hadQuotaRetry) return false;

  const runtime = await getRuntimeConfig(ctx);
  const executionPolicy = taskExecutionPolicyWithAutomaticRetry(task, false);
  if (wasAutomatic) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { executionPolicy });
    task.executionPolicy = executionPolicy;
  }

  const runs = sortedIssueRuns(await listIssueRunsDirect(runtime.spsApiUrl, task.id));
  const scheduledRuns = runs.filter((run) => textParam(run, "status") === "scheduled_retry");
  for (const run of scheduledRuns) {
    const runId = textParam(run, "runId") || textParam(run, "id");
    if (!runId) continue;
    await paperclipJsonDirect(runtime.spsApiUrl, `/api/heartbeat-runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      body: {},
      operation: "Resolved Task Worker retry cancellation"
    });
  }

  if (hadQuotaRetry) {
    taskState.quotaRetry = {
      ...quotaRetry,
      status: "resolved",
      resolvedBy: "task_status_change",
      resolvedTaskStatus: desiredStatus,
      scheduledRunId: null,
      activeRunId: null,
      nextRetryAt: null,
      updatedAt: now()
    };
    await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Close Worker provider quota retry at Task review or completion");
  }

  // Cancelling a core continuation can briefly reopen the issue. Reassert the
  // user's review/terminal state only after every scheduled run is cancelled.
  if (scheduledRuns.length || wasAutomatic) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, {
      status: desiredStatus,
      executionPolicy
    });
    task.status = desiredStatus;
    task.executionPolicy = executionPolicy;
  }
  return scheduledRuns.length > 0 || wasAutomatic || hadQuotaRetry;
}

async function reconcileProviderQuotaTask(ctx, runtime, companyId, task, agentsById, current = Date.now()) {
  const document = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(document?.body);
  if (!taskState || taskState.kind !== "task_room") return { outcome: "skipped", reason: "task_room_state_missing" };
  const workerAgentId = textParam(taskState, "workerAgentId") || textParam(task, "assigneeAgentId");
  const worker = agentsById.get(workerAgentId);
  if (!worker || textParam(worker, "adapterType") !== "antigravity_local") {
    return { outcome: "skipped", reason: "not_agy_worker" };
  }

  if (!AUTOMATIC_PROVIDER_QUOTA_RETRY_ENABLED) {
    const disabled = await disableTaskAutomaticRetry(ctx, runtime, companyId, task, taskState);
    return { outcome: "automatic_retry_disabled", ...disabled };
  }

  if (!issueExecutionAutomaticallyRetries(task)) {
    await updateIssueDirect(runtime.spsApiUrl, task.id, { executionPolicy: TASK_ROOM_EXECUTION_POLICY });
    task.executionPolicy = TASK_ROOM_EXECUTION_POLICY;
  }

  const runs = sortedIssueRuns(await listIssueRunsDirect(runtime.spsApiUrl, task.id));
  const scheduled = runs.find((run) => textParam(run, "status") === "scheduled_retry");
  if (scheduled) {
    const nextRetryAt = textParam(scheduled, "scheduledRetryAt") || issueRunRetryNotBefore(scheduled);
    const previous = asRecord(taskState.quotaRetry);
    if (
      textParam(previous, "status") !== "core_scheduled"
      || textParam(previous, "scheduledRunId") !== (textParam(scheduled, "runId") || textParam(scheduled, "id"))
      || textParam(previous, "nextRetryAt") !== nextRetryAt
    ) {
      taskState.quotaRetry = {
        ...previous,
        status: "core_scheduled",
        provider: "agy",
        intervalMinutes: 30,
        lastFailedRunId: textParam(scheduled, "retryOfRunId") || textParam(previous, "lastFailedRunId") || null,
        scheduledRunId: textParam(scheduled, "runId") || textParam(scheduled, "id") || null,
        nextRetryAt: nextRetryAt || new Date(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS).toISOString(),
        updatedAt: now()
      };
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Track SPS's scheduled provider quota retry");
    }
    return { outcome: "core_scheduled", nextRetryAt: taskState.quotaRetry.nextRetryAt };
  }

  const latest = runs[0];
  if (!latest) return { outcome: "skipped", reason: "no_runs" };
  const latestStatus = textParam(latest, "status");
  if (["queued", "running"].includes(latestStatus)) {
    if (taskState.quotaRetry && textParam(taskState.quotaRetry, "status") !== "executing") {
      taskState.quotaRetry = { ...asRecord(taskState.quotaRetry), status: "executing", activeRunId: textParam(latest, "runId") || textParam(latest, "id") || null, updatedAt: now() };
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Record active provider quota retry run");
    }
    return { outcome: "executing" };
  }

  if (!isProviderQuotaRun(latest)) {
    if (taskState.quotaRetry && textParam(taskState.quotaRetry, "status") !== "resolved") {
      taskState.quotaRetry = {
        ...asRecord(taskState.quotaRetry),
        status: "resolved",
        resolvedByRunId: textParam(latest, "runId") || textParam(latest, "id") || null,
        resolvedRunStatus: latestStatus || null,
        nextRetryAt: null,
        updatedAt: now()
      };
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Close provider quota retry after a non-quota terminal run");
    }
    return { outcome: "resolved", runStatus: latestStatus || null };
  }

  const previousQuotaRetry = JSON.stringify(asRecord(taskState.quotaRetry));
  taskState.quotaRetry = providerQuotaRetryState(latest, taskState.quotaRetry, current);
  const retryAt = new Date(taskState.quotaRetry.nextRetryAt || 0).getTime();
  if (!Number.isFinite(retryAt) || retryAt > current) {
    if (JSON.stringify(taskState.quotaRetry) !== previousQuotaRetry) {
      await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Persist the next 30-minute provider quota retry");
    }
    return { outcome: "waiting", nextRetryAt: taskState.quotaRetry.nextRetryAt };
  }

  if (["paused", "error"].includes(textParam(worker, "status"))) {
    taskState.quotaRetry = {
      ...taskState.quotaRetry,
      status: "waiting_for_worker",
      nextRetryAt: new Date(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS).toISOString(),
      updatedAt: now()
    };
    await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Defer provider quota retry while the assigned Worker is unavailable");
    return { outcome: "waiting_for_worker", nextRetryAt: taskState.quotaRetry.nextRetryAt };
  }

  const failedRunId = textParam(latest, "runId") || textParam(latest, "id");
  let wakeRunId = null;
  if (textParam(task, "status") === "blocked" && textParam(taskState.quotaRetry, "holdReason") === "provider_quota") {
    const activated = await updateIssueDirect(runtime.spsApiUrl, task.id, {
      status: "todo",
      assigneeAgentId: workerAgentId,
      assigneeUserId: null,
      executionPolicy: TASK_ROOM_EXECUTION_POLICY
    });
    wakeRunId = textParam(activated, "executionRunId") || `assignment:${Date.now()}`;
  } else {
    const wake = await paperclipJsonDirect(runtime.spsApiUrl, `/api/agents/${encodeURIComponent(workerAgentId)}/wakeup`, {
      method: "POST",
      body: {
        source: "automation",
        triggerDetail: "system",
        reason: "provider_quota_retry",
        payload: { issueId: task.id, taskId: task.id, retryOfRunId: failedRunId },
        idempotencyKey: `provider-quota:${task.id}:${failedRunId}:${taskState.quotaRetry.attempt}`
      },
      operation: "Worker provider quota retry wakeup"
    });
    wakeRunId = textParam(wake, "id") || textParam(wake, "runId") || null;
  }
  taskState.quotaRetry = {
    ...taskState.quotaRetry,
    status: "dispatched",
    lastWakeRunId: wakeRunId,
    dispatchedAt: now(),
    nextRetryAt: new Date(current + PROVIDER_QUOTA_RETRY_INTERVAL_MS).toISOString(),
    updatedAt: now()
  };
  await writeProviderQuotaRetryState(ctx, companyId, task, taskState, "Dispatch the same Worker Task after its provider quota wait");
  return { outcome: "dispatched", wakeRunId, nextRetryAt: taskState.quotaRetry.nextRetryAt };
}

async function reconcileProviderQuotaRetries(ctx, options = {}) {
  if (activeProviderQuotaReconcile) return activeProviderQuotaReconcile;
  const operation = (async () => {
    const runtime = await getRuntimeConfig(ctx);
    const companies = await listCompaniesDirect(runtime.spsApiUrl);
    const current = Number(options.current) || Date.now();
    const summary = { companies: companies.length, scanned: 0, waiting: 0, scheduled: 0, dispatched: 0, resolved: 0, skipped: 0, failed: 0 };
    for (const company of companies) {
      const [agents, issues] = await Promise.all([
        listCompanyAgentsDirect(runtime.spsApiUrl, company.id),
        listCompanyIssuesDirect(runtime.spsApiUrl, company.id)
      ]);
      const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
      const tasks = issues.filter((issue) => issue?.parentId && (ACTIVE_TASK_STATUSES.has(issue.status) || issue.status === "blocked"));
      for (const task of tasks) {
        summary.scanned += 1;
        try {
          const result = await reconcileProviderQuotaTask(ctx, runtime, company.id, task, agentsById, current);
          if (["waiting", "waiting_for_worker"].includes(result.outcome)) summary.waiting += 1;
          else if (result.outcome === "core_scheduled") summary.scheduled += 1;
          else if (result.outcome === "dispatched") summary.dispatched += 1;
          else if (result.outcome === "resolved") summary.resolved += 1;
          else summary.skipped += 1;
        } catch (error) {
          summary.failed += 1;
          ctx.logger?.warn?.("Provider quota retry reconciliation failed for one Task.", {
            companyId: company.id,
            issueId: task.id,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    return summary;
  })();
  activeProviderQuotaReconcile = operation;
  try {
    return await operation;
  } finally {
    if (activeProviderQuotaReconcile === operation) activeProviderQuotaReconcile = null;
  }
}

async function handleTaskStatusUpdated(ctx, event) {
  if (!event?.companyId || !event?.entityId) return { scheduled: false, reason: "missing_event_identity" };
  const { previousStatus, nextStatus } = taskStatusTransition(event);

  const task = await ctx.issues.get(event.entityId, event.companyId);
  if (!task?.parentId) return { scheduled: false, reason: "not_child_task" };
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, event.companyId);
  let taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.kind !== "task_room" || taskState.originatingRoomIssueId !== task.parentId) {
    taskState = await recoverLegacyTaskRoomState(ctx, event, task);
    if (!taskState) return { scheduled: false, reason: "not_collaborative_task_room" };
  }

  const ownerRoom = await ctx.issues.get(task.parentId, event.companyId);
  const ownerAgentId = agentRoomAgentId(ownerRoom);
  if (!ownerAgentId || taskState.owningAgentId !== ownerAgentId) {
    return { scheduled: false, reason: "task_owner_agent_mismatch" };
  }

  const workerRetryClosed = await cancelResolvedTaskWorkerQuotaRetry(ctx, {
    companyId: event.companyId,
    task,
    taskState
  });
  if (workerRetryClosed && ["done", "cancelled"].includes(task.status)) {
    return { scheduled: false, reason: "resolved_task_worker_retry_cancelled" };
  }

  if (await cancelResolvedTaskOwnerQuotaRetry(ctx, {
    companyId: event.companyId,
    task,
    taskState,
    ownerRoom
  })) {
    return { scheduled: false, reason: "resolved_task_owner_retry_cancelled" };
  }

  const runtimeRecovery = await normalizeWorkerRuntimeRecovery(ctx, event, task, taskState);
  if (runtimeRecovery) return runtimeRecovery;
  if (taskState.workerAgentId !== task.assigneeAgentId) {
    return { scheduled: false, reason: "task_worker_assignment_mismatch" };
  }

  const eventAgentId = event.actorType === "agent" ? event.actorId : textParam(asRecord(event.payload), "agentId");
  if (nextStatus === "done" && eventAgentId && eventAgentId === taskState.workerAgentId) {
    return continueTaskOwnerReportAfterStatusNormalization(ctx, event, {
      task,
      previousStatus: task.status,
      status: "in_review",
      reason: "worker_done_requires_task_owner_verification"
    });
  }

  const comments = await ctx.issues.listComments(task.id, event.companyId);
  const expectedReportKind = TASK_OWNER_REPORT_STATUSES.has(task.status) ? task.status : null;
  const report = latestTaskBoundaryReport(comments, taskState, expectedReportKind);
  if (!report && TASK_WORKER_DISPOSITION_PENDING_STATUSES.has(task.status)) {
    return { scheduled: false, reason: "awaiting_substantive_worker_report" };
  }
  if (
    report
    && TASK_WORKER_DISPOSITION_PENDING_STATUSES.has(task.status)
    && !taskBoundaryAlreadyReported(taskState, report)
  ) {
    return continueTaskOwnerReportAfterStatusNormalization(ctx, event, {
      task,
      previousStatus: task.status,
      status: report.kind,
      reason: "substantive_worker_report_requires_disposition",
      reportCommentId: report.comment.id
    });
  }
  if (!TASK_OWNER_REPORT_STATUSES.has(task.status)) return { scheduled: false, reason: "not_owner_report_status" };
  if (!report) return { scheduled: false, reason: "awaiting_substantive_worker_report" };
  if (report.kind !== task.status) return { scheduled: false, reason: "worker_report_status_mismatch" };
  report.fingerprint = taskReportFingerprint(report.comment.body);
  const ownerRoomIssueId = taskState.originatingRoomIssueId;
  const reportKey = `${task.id}:${report.comment.id}:${report.fingerprint}`;
  const existingReport = activeTaskOwnerReports.get(reportKey);
  if (existingReport) {
    return {
      scheduled: false,
      reason: "worker_report_in_progress",
      taskId: task.id,
      ownerRoomIssueId,
      completion: existingReport
    };
  }
  if (taskBoundaryAlreadyReported(taskState, report)) return { scheduled: false, reason: "duplicate_worker_report" };

  const eventId = textParam(event, "eventId") || `${task.id}:${previousStatus}:${nextStatus || task.status}:${report.comment.id}`;
  if (processedTaskOwnerReportEvents.has(eventId)) return { scheduled: false, reason: "duplicate_event" };
  processedTaskOwnerReportEvents.add(eventId);
  if (processedTaskOwnerReportEvents.size > 1000) processedTaskOwnerReportEvents.delete(processedTaskOwnerReportEvents.values().next().value);

  await updateRoomWorkState(
    ctx,
    event.companyId,
    ownerRoom,
    {
      latestOutcome: {
        taskId: task.id,
        identifier: task.identifier,
        status: task.status,
        summary: task.status === "blocked"
          ? "The assigned Worker reported a blocker that requires the owning Agent's handling."
          : "The assigned Worker submitted evidence for the owning Agent's technical review.",
        sourceReferences: [task.identifier || task.id]
      },
      waitingFor: {
        kind: "task_review",
        taskId: task.id,
        detail: task.status === "blocked"
          ? "The owning Agent must assess the Worker blocker and report or correct it in this Room."
          : "The owning Agent must verify the Worker evidence against the Task contract."
      }
    },
    `Record Task owner review boundary for ${task.identifier || task.id}`,
    { kind: "runtime", agentId: ownerAgentId, agentName: taskState.owningAgentName }
  ).catch((error) => {
    ctx.logger?.warn?.("Room Work State could not record the Task review boundary.", {
      roomIssueId: ownerRoom.id,
      taskIssueId: task.id,
      message: error instanceof Error ? error.message : String(error)
    });
  });

  if (taskReviewMode(taskState) === "manual") {
    const recorded = await recordManualTaskOwnerReview(ctx, {
      companyId: event.companyId,
      eventId,
      task,
      taskState,
      ownerRoom,
      report
    });
    return {
      scheduled: false,
      reason: recorded?.reason || "manual_task_owner_review_pending",
      taskId: task.id,
      ownerRoomIssueId,
      manualReviewRecorded: recorded?.ok === true
    };
  }

  const launchPromise = runAutomaticTaskOwnerReport(ctx, {
    companyId: event.companyId,
    eventId,
    taskIssueId: task.id,
    ownerRoomIssueId,
    expectedStatus: task.status,
    reportCommentId: report.comment.id,
    reportFingerprint: report.fingerprint
  });
  activeTaskOwnerReports.set(reportKey, launchPromise);
  try {
    const launched = await launchPromise;
    if (launched?.skipped) {
      if (activeTaskOwnerReports.get(reportKey) === launchPromise) activeTaskOwnerReports.delete(reportKey);
      return {
        scheduled: false,
        reason: launched.reason,
        taskId: task.id,
        ownerRoomIssueId
      };
    }
    const completion = launched?.completion ?? Promise.resolve(launched);
    activeTaskOwnerReports.set(reportKey, completion);
    completion.finally(() => {
      if (activeTaskOwnerReports.get(reportKey) === completion) activeTaskOwnerReports.delete(reportKey);
    }).catch(() => {});
    return { scheduled: true, taskId: task.id, ownerRoomIssueId, completion };
  } catch (error) {
    if (activeTaskOwnerReports.get(reportKey) === launchPromise) activeTaskOwnerReports.delete(reportKey);
    throw error;
  }
}

async function continueTaskOwnerReportAfterStatusNormalization(ctx, event, input) {
  await ctx.issues.update(input.task.id, { status: input.status }, event.companyId);
  const followUp = await handleTaskStatusUpdated(ctx, {
    ...event,
    eventId: `${textParam(event, "eventId") || randomUUID()}:normalized:${input.status}`,
    eventType: "plugin.task-owner-status-normalized",
    occurredAt: now(),
    entityId: input.task.id,
    entityType: "issue",
    payload: {
      ...asRecord(event.payload),
      status: input.status,
      _previous: { status: input.previousStatus }
    }
  });
  const joinedExistingWake = followUp.reason === "worker_report_in_progress" && Boolean(followUp.completion);
  return {
    ...followUp,
    scheduled: followUp.scheduled === true || joinedExistingWake,
    normalized: true,
    reason: input.reason,
    followUpReason: followUp.reason,
    joinedExistingWake,
    status: input.status,
    ...(input.reportCommentId ? { reportCommentId: input.reportCommentId } : {})
  };
}

async function reconcileTaskOwnerReportBoundaries(ctx, options = {}) {
  if (activeTaskOwnerBoundaryReconcile) return activeTaskOwnerBoundaryReconcile;
  const operation = (async () => {
    const runId = textParam(options, "runId") || `task-owner-boundary-reconcile:${Date.now()}`;
    const summary = { runId, companies: 0, scanned: 0, scheduled: 0, healthy: 0, skipped: 0, failed: 0 };
    const companies = await ctx.companies.list({ limit: 200 });
    summary.companies = companies.length;
    for (const company of companies) {
      const seenTaskIds = new Set();
      const tasks = await listTaskOwnerBoundaryIssues(ctx, company.id);
      for (const task of tasks) {
        if (!task?.parentId || seenTaskIds.has(task.id)) continue;
        seenTaskIds.add(task.id);
        summary.scanned += 1;
        try {
          const result = await handleTaskStatusUpdated(ctx, {
            eventId: `${runId}:${task.id}:${task.updatedAt || task.status}`,
            eventType: "plugin.task-owner-boundary-reconcile",
            occurredAt: now(),
            actorType: "plugin",
            actorId: manifest.id,
            companyId: company.id,
            entityId: task.id,
            entityType: "issue",
            payload: { status: task.status, _previous: { status: task.status } }
          });
          if (result.scheduled) summary.scheduled += 1;
          else if (["duplicate_worker_report", "worker_report_in_progress"].includes(result.reason)) summary.healthy += 1;
          else summary.skipped += 1;
        } catch (error) {
          summary.failed += 1;
          ctx.logger?.warn?.("Task owner boundary reconciliation failed for one Task.", {
            companyId: company.id,
            issueId: task.id,
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    return summary;
  })();
  activeTaskOwnerBoundaryReconcile = operation;
  try {
    return await operation;
  } finally {
    if (activeTaskOwnerBoundaryReconcile === operation) activeTaskOwnerBoundaryReconcile = null;
  }
}

async function handleTaskOwnerReportReconcile(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const taskId = textParam(params, "issueId") || textParam(params, "taskId");
  if (!taskId) throw new Error("issueId is required.");
  const task = await ctx.issues.get(taskId, companyId);
  if (!task?.parentId) throw new Error("Task owner report reconciliation is available only on a child Task issue.");
  if (!TASK_OWNER_REPORT_STATUSES.has(task.status)) {
    const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
    const taskState = parseState(taskStateDocument?.body);
    const ownerRoom = await ctx.issues.get(task.parentId, companyId);
    if (taskState?.kind === "task_room" && ownerRoom && await cancelResolvedTaskOwnerQuotaRetry(ctx, {
      companyId,
      task,
      taskState,
      ownerRoom
    })) {
      return {
        ok: true,
        scheduled: false,
        code: "resolved_task_owner_retry_cancelled",
        message: "The resolved Task's obsolete owner report retry was cancelled and the Room was released.",
        taskStatus: task.status
      };
    }
    return {
      ok: false,
      scheduled: false,
      code: "task_not_at_report_boundary",
      message: "Only an in_review or blocked Task can reconcile its latest Worker report.",
      taskStatus: task.status
    };
  }
  const occurredAt = now();
  const result = await handleTaskStatusUpdated(ctx, {
    eventId: `manual-task-owner-report-reconcile:${task.id}:${occurredAt}`,
    eventType: "plugin.action",
    occurredAt,
    actorType: "user",
    actorId: textParam(asRecord(actionCtx?.actor), "id") || null,
    companyId,
    entityId: task.id,
    entityType: "issue",
    payload: { status: task.status, _previous: { status: task.status } }
  });
  const { completion: _completion, ...outcome } = result;
  return {
    ok: result.scheduled === true || result.reason === "duplicate_worker_report",
    ...outcome
  };
}

function reconcileTaskOwnerNotificationStateForJob(taskState, job) {
  if (job?.kind !== "task_owner_report" || !job?.taskIssueId || ACTIVE_ROOM_JOB_STATUSES.has(job.status)) return false;
  const notification = asRecord(taskState?.ownerNotification);
  if (textParam(notification, "jobId") !== job.id || textParam(notification, "status") !== "working") return false;
  const completed = job.status === "completed";
  taskState.ownerNotification = {
    ...notification,
    status: completed ? "completed" : "failed",
    resultCommentId: job.resultCommentId ?? notification.resultCommentId ?? null,
    ...(completed ? {} : { error: textParam(job, "error") || `Task owner report Job ended with status ${job.status}.` }),
    updatedAt: now()
  };
  return true;
}

async function reconcileTaskOwnerNotificationForJob(ctx, job) {
  if (job?.kind !== "task_owner_report" || !job?.taskIssueId || ACTIVE_ROOM_JOB_STATUSES.has(job.status)) return false;
  const document = await ctx.issues.documents.get(job.taskIssueId, TASK_ROOM_STATE_KEY, job.companyId);
  const taskState = parseState(document?.body);
  if (!taskState || taskState.kind !== "task_room" || !reconcileTaskOwnerNotificationStateForJob(taskState, job)) return false;
  await upsertRoomDocument(ctx, {
    issueId: job.taskIssueId,
    key: TASK_ROOM_STATE_KEY,
    body: serializeState(taskState),
    companyId: job.companyId,
    title: "Task Room state",
    format: "markdown",
    changeSummary: job.status === "completed"
      ? "Reconcile completed Task owner report Job"
      : "Release interrupted Task owner report for retry"
  });
  return true;
}

function isRetiredRoomJobError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message === "Room issue was not found."
    || message === "Closed Agent Rooms cannot receive chat messages."
    || message === "The Agent linked to this Room was not found.";
}

async function reconcileInterruptedRoomJobs(ctx) {
  const summary = { scanned: 0, reconciled: 0, retired: 0, failed: 0 };
  if (!ctx.entities?.list) return summary;
  const records = await ctx.entities.list({ entityType: ROOM_JOB_ENTITY_TYPE, limit: 500 });
  for (const record of records) {
    const job = roomJobData(asRecord(record.data));
    if (!job.id || !job.companyId || !job.roomIssueId) continue;
    summary.scanned += 1;
    if (!ACTIVE_ROOM_JOB_STATUSES.has(job.status)) {
      await reconcileTaskOwnerNotificationForJob(ctx, job).catch((error) => {
        ctx.logger?.warn?.("Terminal Task owner report notification could not be reconciled.", {
          roomIssueId: job.roomIssueId,
          taskIssueId: job.taskIssueId,
          message: error instanceof Error ? error.message : String(error)
        });
      });
      continue;
    }
    if (activeRoomMessageJobs.has(job.roomIssueId)) continue;
    try {
      const { issue, agent } = await requireRoom(ctx, job.companyId, job.roomIssueId);
      const state = await loadRoomState(ctx, job.companyId, issue, agent);
      if (isRoomProviderQuotaRetryJob(job) && textParam(state.pendingTurn, "jobId") === job.id) {
        await launchDueRoomProviderQuotaRetry(ctx, job).catch(() => null);
        continue;
      }
      let patch = terminalRoomJobPatchFromState(job, state);
      if (!patch) {
        patch = {
          status: "interrupted",
          completedAt: now(),
          error: "The plugin worker restarted before this Job completed. The submitted message and Room state were preserved."
        };
      }
      const reconciled = await updateRoomJob(ctx, job, patch);
      if (textParam(state.pendingTurn, "jobId") === job.id) {
        state.pendingTurn = null;
        finishRoomActivity(state, "failed", reconciled.error);
        await saveRoomState(ctx, job.companyId, issue.id, state, "Mark interrupted Room Job during startup reconciliation");
      }
      await reconcileTaskOwnerNotificationForJob(ctx, reconciled);
      emitRoomEvent(ctx, job.companyId, issue.id, { type: reconciled.status, job: reconciled });
      summary.reconciled += 1;
    } catch (error) {
      if (isRetiredRoomJobError(error)) {
        const retired = await updateRoomJob(ctx, job, {
          status: "interrupted",
          completedAt: now(),
          error: "The Agent Room is no longer active. This interrupted Job was retired during reconciliation."
        });
        await reconcileTaskOwnerNotificationForJob(ctx, retired).catch(() => null);
        summary.retired += 1;
        continue;
      }
      summary.failed += 1;
      ctx.logger?.warn?.("Room Job could not be reconciled after worker restart.", {
        roomIssueId: job.roomIssueId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return summary;
}

const plugin = definePlugin({
  async setup(ctx) {
    pluginCtx = ctx;
    ctx.data.register("room-chat-view", (params) => handleRoomView(ctx, params));
    ctx.data.register("room-task-summary", (params) => handleRoomTaskSummary(ctx, params));
    ctx.data.register("room-workspace-view", (params) => handleRoomWorkspaceView(ctx, params));
    ctx.data.register("task-room-view", (params) => handleTaskRoomView(ctx, params));
    ctx.data.register("project-workplane-view", (params) => handleProjectWorkplaneView(ctx, params));
    ctx.data.register("project-tasks-view", (params) => handleProjectTasksView(ctx, params));
    ctx.data.register("codex-accounts-view", (params) => handleCodexAccountsView(ctx, params));
    ctx.data.register("organization-settings-view", (params) => handleOrganizationSettingsView(ctx, params));
    ctx.actions.register("room-bootstrap", (params, actionCtx) => handleRoomBootstrap(ctx, params, actionCtx));
    ctx.actions.register("room-send", (params, actionCtx) => handleRoomSendJob(ctx, params, actionCtx));
    ctx.actions.register("room-compact", (params, actionCtx) => handleRoomCompactJob(ctx, params, actionCtx));
    ctx.actions.register("task-request-owner-feedback", (params, actionCtx) => handleTaskOwnerFeedbackJob(ctx, params, actionCtx));
    ctx.actions.register("task-reconcile-owner-report", (params, actionCtx) => handleTaskOwnerReportReconcile(ctx, params, actionCtx));
    ctx.actions.register("codex-account-select", (params, actionCtx) => handleCodexAccountSelect(ctx, params, actionCtx));
    ctx.actions.register("organization-agent-policy-save", (params, actionCtx) => handleOrganizationAgentPolicySave(ctx, params, actionCtx));
    ctx.actions.register("organization-settings-access", (params, actionCtx) => handleOrganizationSettingsAccess(ctx, params, actionCtx));
    ctx.actions.register("organization-collaboration-readiness", (params, actionCtx) => handleOrganizationCollaborationReadiness(ctx, params, actionCtx));
    ctx.actions.register("organization-template-apply", (params, actionCtx) => handleOrganizationTemplateApply(ctx, params, actionCtx));
    ctx.actions.register("workspace-profile-access", (params, actionCtx) => handleWorkspaceProfileAccess(ctx, params, actionCtx));
    ctx.actions.register("workspace-profile-save", (params, actionCtx) => handleWorkspaceProfileSave(ctx, params, actionCtx));
    ctx.actions.register("workspace-profile-create-workspace", (params, actionCtx) => handleWorkspaceProfileCreateWorkspace(ctx, params, actionCtx));
    ctx.jobs.register("workplane-reconcile", async (job) => {
      const roomSummary = await reconcileAllProjectAgentRooms(ctx);
      const interruptedRoomJobSummary = await reconcileInterruptedRoomJobs(ctx);
      const ownerSummary = await reconcileTaskOwnerReportBoundaries(ctx, { runId: `job:${job.runId}` });
      ctx.logger?.info?.("Workplane reconciliation completed.", {
        runId: job.runId,
        trigger: job.trigger,
        roomSummary,
        interruptedRoomJobSummary,
        ownerSummary,
        quotaRetryPolicy: "manual_only"
      });
    });
    ctx.events.on("project.created", async (event) => {
      if (!event.companyId || !event.entityId) return;
      try {
        await provisionProjectAgentRooms(ctx, event.companyId, event.entityId);
      } catch (error) {
        ctx.logger.error("Default project Agent Room provisioning failed.", {
          projectId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("agent.created", async (event) => {
      if (!event.companyId) return;
      try {
        await provisionAllProjectAgentRooms(ctx, event.companyId);
      } catch (error) {
        ctx.logger.error("Agent Room provisioning for existing Projects failed.", {
          agentId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("agent.updated", async (event) => {
      if (!event.companyId || !event.entityId) return;
      try {
        await provisionAllProjectAgentRooms(ctx, event.companyId);
        await syncAgentRoomTitles(ctx, event.companyId, event.entityId);
      } catch (error) {
        ctx.logger.error("Agent Room reconciliation failed after an Agent update.", {
          agentId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("agent.deleted", async (event) => {
      if (!event.companyId) return;
      try {
        await provisionAllProjectAgentRooms(ctx, event.companyId);
      } catch (error) {
        ctx.logger.error("Agent Room reconciliation failed after an Agent deletion.", {
          agentId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("issue.updated", async (event) => {
      try {
        await handleTaskStatusUpdated(ctx, event);
      } catch (error) {
        ctx.logger?.error?.("Task owner Room report scheduling failed.", {
          issueId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
    ctx.events.on("issue.comment.created", async (event) => {
      try {
        await handleTaskStatusUpdated(ctx, event);
      } catch (error) {
        ctx.logger?.error?.("Worker Task report disposition failed.", {
          issueId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
  },
  async shutdown() {
    for (const client of codexClients.values()) client.stop();
    codexClients.clear();
    testCodexClient = null;
    testAgyClientFactory = null;
    activeThreadContexts.clear();
    nativeCompactionLocks.clear();
    roomDocumentWriteLocks.clear();
    manualCodexCompactionThreads.clear();
    recordedNativeCompactionEvents.clear();
    processedTaskOwnerReportEvents.clear();
    activeTaskOwnerReports.clear();
    activeWorkerRuntimeRecoveries.clear();
    activeTaskOwnerBoundaryReconcile = null;
    activeProviderQuotaReconcile = null;
    activeRoomQuotaRetryReconcile = null;
    pluginCtx = null;
  }
});

function setActiveThreadContextForTest(threadId, context) {
  if (context) activeThreadContexts.set(threadId, context);
  else activeThreadContexts.delete(threadId);
}

function setCodexClientForTest(client) {
  testCodexClient = client;
}

function setAgyClientFactoryForTest(factory) {
  testAgyClientFactory = factory;
}

function setActiveRoomJobForTest(issueId, promise) {
  if (promise) activeRoomMessageJobs.set(issueId, promise);
  else activeRoomMessageJobs.delete(issueId);
}

export { agentInstructions, agentInstructionsFingerprint, agentRoomAgentId, agentRoomRuntime, agentSessionContextMatches, appendCheckpoint, appendNativeCompactionOutsideInvocation, applyCodexAccountToAdapterConfig, applyNativeSessionActivityEvent, attachmentIdsParam, buildAgyRoomPrompt, buildRoomOperatingBrief, cancelResolvedTaskOwnerQuotaRetry, cancelResolvedTaskWorkerQuotaRetry, chooseDefaultWorkspace, chooseTaskWorkspace, cleanupRoomAttachmentCache, codexAccountLabel, codexClientKey, configuredEnvironment, configuredEnvironmentValue, defaultWorkspaceKindForAgent, enforceUtf8Text, ensureNativeRoomSession, excludeWorkspaceRoomAttachments, fetchRoomMemory, getCodexClient, getRuntimeConfig, handleCodexAccountSelect, handleCodexAccountsView, handleCodexServerRequest, handleOrganizationAgentPolicySave, handleOrganizationSettingsView, handleProjectTasksView, handleProjectWorkplaneView, handleRoomBootstrap, handleRoomCompact, handleRoomCompactJob, handleRoomSend, handleRoomSendJob, handleRoomTaskSummary, handleRoomView, handleRoomWorkspaceView, handleTaskOwnerFeedback, handleTaskOwnerFeedbackJob, handleTaskOwnerReportReconcile, handleTaskRoomView, handleTaskStatusUpdated, isAgentRoom, isCodexImageAttachment, isLongLivedRoom, isProviderQuotaError, isProviderQuotaRun, isRoomProviderQuotaRetryJob, isRoomUserComment, isWorkerOnlyRoomAgent, listIssueAttachmentsDirect, listIssueRunsDirect, listRoomJobs, loadAgentInstructions, loadRoomState, loadRoomWorkState, localCodexAccounts, mergeRoomAttachments, mergeRoomWorkState, mostRecentComments, nativeCompactionEventId, nativeSessionResultText, newRoomState, newRoomWorkState, nextProviderQuotaRetryAt, normalizeCodexHome, normalizeRoomWorkState, parseAgyFallbackEnvelope, parseState, prepareCodexRoomTurn, prepareNativeRoomTurn, proposeRoomMemory, providerQuotaRetryAtFromError, providerQuotaRetryState, provisionProjectAgentRooms, provisionAllProjectAgentRooms, queueProjectRoomProvision, queueRoomDocumentWrite, reconcileAllProjectAgentRooms, reconcileInterruptedRoomJobs, reconcileProviderQuotaRetries, reconcileProviderQuotaTask, reconcileRoomProviderQuotaRetries, reconcileTaskOwnerReportBoundaries, recordNativeCodexCompaction, repairUtf8Mojibake, resolveCodexHomeForAgent, resolveRoomAttachments, retryRoomDocumentWrite, roomAttachmentCommentBlock, roomAttachmentName, roomAttachmentWorkspaceRoot, roomHasActiveWork, roomRole, roomRuntimeDisabledResult, roomRuntimeWithRoomSafety, roomThreadIdForCodexRuntime, roomTools, roomTurnText, roomUserCommentBody, roomWorkplaneBoundary, runAgyRoomFallback, saveRoomState, saveRoomStateOutsideInvocation, saveRoomWorkState, scheduleRoomProviderQuotaRetry, searchRoomMemory, serializeState, setActiveRoomJobForTest, setActiveThreadContextForTest, setAgyClientFactoryForTest, setCodexClientForTest, stageRoomAttachments, startNativeAgentSessionTurn, startRoomTurn, syncAgentRoomTitles, taskOwnerReportPrompt, taskOwnerRoomResultVisibilityOutsideInvocation, taskStatusTransition, updateAgentAdapterConfigDirect, updateRoomWorkStateOutsideInvocation, validateRoomRetrySource, workspaceGitChanges, workspaceGitExcludePath, workspaceKindForProjectWorkspace, workspaceLocalPath };
export { activeRoomProcessBlocksOwnerReport, isSubstantiveTaskBoundaryReport, reconcileTaskOwnerNotificationStateForJob, taskBoundaryReportKind };
export { collaborationReadinessFromConfig, handleOrganizationCollaborationReadiness, handleOrganizationSettingsAccess, readCollaborationReadiness, requireAgentConfigurationAction };
export { handleWorkspaceProfileAccess, handleWorkspaceProfileCreateWorkspace, handleWorkspaceProfileSave, loadProjectWorkspaceProfile, normalizeWorkspaceProfile, profileWorkspace, saveProjectWorkspaceProfile };
export default plugin;
if (!ROOM_CHAT_TEST_MODE) runWorker(plugin, import.meta.url);

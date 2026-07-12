import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import manifest from "./manifest.js";
import { CodexAppServerClient, getAgentText } from "./codex-app-server-client.js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOM_STATE_KEY = "ROOM_STATE";
const ROOM_CHECKPOINTS_KEY = "ROOM_CHECKPOINTS";
const TASK_ROOM_STATE_KEY = "TASK_ROOM_STATE";
const ROOM_PREFIX = "[Agent Room] ";
const PROVISIONED_ROOM_ORIGIN = "plugin:local.room-chat:project-room-provisioning";
const PROVISIONED_AGENT_ROOM_ORIGIN = "plugin:local.room-chat:agent-room-provisioning";
const AGENT_ROOM_OPERATION_ORIGIN = "plugin:local.room-chat:operation:agent-room";
const ROOM_JOB_ENTITY_TYPE = "room_job";
const ACTIVE_ROOM_JOB_STATUSES = new Set(["queued", "starting", "working"]);
const ROLE_ROOM_READY_STATUS = "todo";
const TERMINAL_STATUSES = new Set(["done", "blocked", "cancelled"]);
const ACTIVE_TASK_STATUSES = new Set(["backlog", "todo", "pending", "queued", "running", "in_progress", "in_review"]);
const TASK_STATUS_ORDER = new Map([["in_progress", 0], ["todo", 1], ["backlog", 2], ["in_review", 3], ["blocked", 4], ["done", 5], ["cancelled", 6]]);
const TASK_OWNER_AGENT_ROLES = new Set(["ceo", "cto", "designer"]);
const DEFAULT_PROJECT_ROOM_ROLES = ["Manager", "CTO", "Designer", "Code Worker", "Art Worker", "Voice Worker", "QA Worker"];
const roomLocks = new Map();
const projectRoomLocks = new Map();
const activeThreadContexts = new Map();
const activeRoomMessageJobs = new Map();
let pluginCtx = null;
let codexClient = null;

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
  return Boolean(roomRole(issue) && !issue?.parentId && !issue?.assigneeAgentId && !issue?.assigneeUserId);
}

function isLongLivedRoom(issue) {
  return isAgentRoom(issue) || isLegacyRoleRoom(issue);
}

function isHiredAgent(agent) {
  return Boolean(agent?.id && agent?.name && agent.status !== "terminated");
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

Maintain a clear project plan, task order, milestones, and decision log for the user. Work from approved design artifacts and visible Paperclip status.

## Rules

- Do not invent product, scope, or schedule decisions that the user has not approved.
- Keep implementation requests behind the user's explicit instruction to proceed.
- When creating or changing a Task, state its owner, goal, dependency, and review point.
- Surface risks, blockers, and conflicting priorities instead of silently resolving them.
- Keep durable plans and decisions in the project's design repository; keep live discussion in the Room.
`,
    "CTO": `# CTO Role Rules

## Scope

Translate an explicitly approved design into a safe implementation plan and finite Worker Tasks.

## Rules

- Read the relevant design reference before planning implementation.
- Check active Paperclip Tasks and declared affected paths before creating work.
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
- Do not request implementation until the user explicitly asks to implement the approved design.
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
- Report completion and blockers in Paperclip.
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
    DEFAULT_PROJECT_ROOM_ROLES.includes(role) &&
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
    for (const role of DEFAULT_PROJECT_ROOM_ROLES) {
      const title = roleRoomTitle(role);
      if (existingTitles.has(title)) continue;
      const room = await ctx.issues.create({
        companyId,
        projectId,
        parentId: null,
        title,
        description: `Long-lived ${role} Role Room for this project.`,
        status: ROLE_ROOM_READY_STATUS,
        priority: "medium",
        assigneeAgentId: null,
        originKind: PROVISIONED_ROOM_ORIGIN,
        originId: `project:${projectId}:role-room:${role}`
      });
      created.push({ id: room.id, identifier: room.identifier, role, title });
    }
    return { created, existingCount: DEFAULT_PROJECT_ROOM_ROLES.length - created.length };
  });
}

async function provisionProjectAgentRooms(ctx, companyId, projectId) {
  if (!companyId || !projectId) throw new Error("companyId and projectId are required to provision Agent Rooms.");
  return queueProjectRoomProvision(projectId, async () => {
    const [issues, agents] = await Promise.all([
      ctx.issues.list({ companyId, projectId, limit: 500 }),
      ctx.agents.list({ companyId, limit: 200 })
    ]);
    const existingAgentIds = new Set(issues.map(agentRoomAgentId).filter(Boolean));
    const created = [];
    for (const agent of agents.filter(isHiredAgent)) {
      if (existingAgentIds.has(agent.id)) continue;
      const room = await ctx.issues.create({
        companyId,
        projectId,
        parentId: null,
        title: agent.name,
        description: `Long-lived Agent Room for ${agent.name}. The Room is unassigned and uses this Agent's Paperclip Instructions.`,
        status: ROLE_ROOM_READY_STATUS,
        priority: "medium",
        assigneeAgentId: null,
        originKind: AGENT_ROOM_OPERATION_ORIGIN,
        originId: agentRoomOriginId(projectId, agent.id),
        surfaceVisibility: "plugin_operation"
      });
      created.push({ id: room.id, identifier: room.identifier, agentId: agent.id, agentName: agent.name, title: room.title });
    }
    return { created, existingCount: existingAgentIds.size };
  });
}

async function provisionAllProjectAgentRooms(ctx, companyId) {
  const projects = await ctx.projects.list({ companyId, limit: 200 });
  for (const project of projects) {
    await provisionProjectAgentRooms(ctx, companyId, project.id);
  }
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
        description: `Long-lived Agent Room for ${agent.name}. The Room is unassigned and uses this Agent's Paperclip Instructions.`
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
    const updated = await ctx.issues.update(issue.id, { status: ROLE_ROOM_READY_STATUS }, companyId);
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

function defaultWorkspaceKindForAgent(agent) {
  const identity = `${agent?.role || ""} ${agent?.name || ""}`.toLowerCase();
  if (/(art|image|voice)/.test(identity)) return "asset";
  if (/(designer|design|manager|document)/.test(identity)) return "design";
  return "implementation";
}

function workspaceKindForProjectWorkspace(workspace) {
  const identity = `${workspace?.name || ""} ${workspaceLocalPath(workspace)}`.toLowerCase();
  if (/(design|obsidian)/.test(identity)) return "design";
  if (/(shared|common|library|knowledge)/.test(identity)) return "shared";
  if (/(asset|art|audio|voice)/.test(identity)) return "asset";
  return "implementation";
}

function workspaceKindForTaskType(taskType) {
  if (["design", "documentation"].includes(taskType)) return "design";
  if (["art", "voice"].includes(taskType)) return "asset";
  return "implementation";
}

function chooseTaskWorkspace(workspaces, taskType, requestedWorkspaceId) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
  if (requestedWorkspaceId) return workspaces.find((workspace) => workspace.id === requestedWorkspaceId) ?? null;
  const kind = workspaceKindForTaskType(taskType);
  return workspaces.find((workspace) => workspaceKindForProjectWorkspace(workspace) === kind)
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

function chooseDefaultWorkspace(agent, workspaces) {
  if (!Array.isArray(workspaces) || !workspaces.length) return null;
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
  const currentId = textParam(asRecord(state?.workspace), "projectWorkspaceId");
  const workspace = workspaces.find((entry) => entry.id === currentId) ?? chooseDefaultWorkspace(agent, workspaces);
  return { workspace: workspace ?? null, workspaces, legacy: false };
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

function now() {
  return new Date().toISOString();
}

function parseState(body) {
  if (!body || typeof body !== "string") return null;
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
  return `${JSON.stringify(state, null, 2)}\n`;
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
      kind: "codex_app_server",
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

function newTaskRoomState(issue, roomContext, input) {
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
    projectWorkspaceId: input.projectWorkspaceId ?? null,
    projectWorkspaceName: input.projectWorkspaceName ?? null,
    declaredAffectedPaths: input.affectedPaths,
    designReferences: input.designReferences,
    acceptanceCriteria: input.acceptanceCriteria,
    verification: input.verification,
    dependencyTaskIds: input.blockedByIssueIds,
    review: {
      required: "user",
      status: "not_requested",
      workerReportCommentId: null,
      updatedAt: now()
    }
  };
}

function taskProtocolComment(roomContext, issue, taskState) {
  const lines = [
    "## Task Room Protocol",
    `- Owner Agent: ${roomContext.agentName}`,
    `- Worker: ${taskState.workerAgentId}`,
    `- Task type: ${taskState.taskType}`,
    `- Project Workspace: ${taskState.projectWorkspaceName || taskState.projectWorkspaceId || "Not bound"}`,
    "- Completion boundary: Worker result moves this Task to in_review; the user closes it after review.",
    "- Blocker boundary: quota, permissions, missing design, or unavailable required tools must be reported before marking blocked.",
    "",
    "Affected Paths:",
    ...(taskState.declaredAffectedPaths.length ? taskState.declaredAffectedPaths.map((path) => `- ${path}`) : ["- Not declared"]),
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
    `Project Workspace: ${input.projectWorkspaceName || input.projectWorkspaceId || "Not bound"}`,
    "",
    "Affected Paths:",
    ...(input.affectedPaths.length ? input.affectedPaths.map((path) => `- ${path}`) : ["- Not declared"]),
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
  return [
    `You are ${agent.name}, a ${agent.role || "general"} Agent, in your long-lived Paperclip project Room.`,
    "Treat Paperclip comments as the visible conversation record and issue documents as durable Room state.",
    "The following is your managed Paperclip Agent AGENTS.md. It is edited from this Agent's Instructions and applies whenever this Agent works:",
    "--- AGENTS.md ---",
    agentAgentsMd,
    "--- END AGENTS.md ---",
    "Project-specific constraints and approved decisions come only from the Task contract, explicitly referenced design artifacts, and explicit user decisions.",
    "You are not managed by a hidden controller. Decide within your role and use the Paperclip dynamic tools directly when necessary.",
    "Do not create implementation work until the user explicitly asks to proceed with implementation and the relevant design artifact is identified.",
    "When work completes or is blocked by quota, permissions, missing design, or a required external tool, report it clearly in the originating Room or Task.",
    "Never expose credentials or treat a Room checkpoint as an approved project design decision."
  ].join("\n");
}

function roomTools() {
  return [{
    type: "namespace",
    name: "paperclip",
    description: "Read project work and create explicitly authorized Paperclip Tasks.",
    tools: [
      {
        type: "function",
        name: "list_active_tasks",
        description: "List active project Tasks and their declared affected paths before planning work.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        type: "function",
        name: "list_workers",
        description: "List organization workers that can receive a Paperclip Task assignment.",
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
        description: "Create one finite child Task under this Agent Room and assign the selected Worker. Use only after user authorization, a preview, and an identified design reference for CTO implementation work.",
        inputSchema: {
          type: "object",
          required: ["title", "description", "assigneeAgentId"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            assigneeAgentId: { type: "string" },
            taskType: { type: "string", enum: ["design", "implementation", "qa", "art", "voice", "documentation"] },
            projectWorkspaceId: { type: "string" },
            affectedPaths: { type: "array", items: { type: "string" } },
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
        name: "post_task_feedback",
        description: "Post owner-Agent feedback into a Task Room. Do not use it to mark a Task done or bypass user review.",
        inputSchema: {
          type: "object",
          required: ["taskId", "message"],
          properties: { taskId: { type: "string" }, message: { type: "string" } },
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
    issue = await ctx.issues.update(issue.id, { status: ROLE_ROOM_READY_STATUS }, companyId);
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
  await upsertRoomDocument(ctx, {
    issueId,
    key: ROOM_STATE_KEY,
    body: serializeState(state),
    companyId,
    title: "Room state",
    format: "markdown",
    changeSummary
  });
}

async function upsertRoomDocument(ctx, input) {
  const existing = await ctx.issues.documents.get(input.issueId, input.key, input.companyId);
  const runtime = await getRuntimeConfig(ctx);
  return putRoomDocument(runtime.paperclipApiUrl, {
    ...input,
    baseRevisionId: existing?.latestRevisionId ?? null
  });
}

function loopbackPaperclipApiUrl(value) {
  const parsed = new URL(value || "http://127.0.0.1:3100");
  const localHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!localHosts.has(parsed.hostname) || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Room document writes require a loopback Paperclip API URL.");
  }
  return parsed.toString().replace(/\/$/, "");
}

function attachmentIdsParam(params) {
  return [...new Set(listParam(params, "attachmentIds"))];
}

function roomAttachmentName(attachment) {
  const filename = textParam(attachment, "originalFilename") || textParam(attachment, "filename");
  return filename || `attachment-${textParam(attachment, "id", "file")}`;
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
  return new URL(attachmentContentPath(attachment), `${loopbackPaperclipApiUrl(apiUrl)}/`).toString();
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
    : path.join(os.homedir(), ".paperclip", "room-attachments");
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
  const endpoint = `${loopbackPaperclipApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/attachments`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error(`Paperclip attachment list failed (HTTP ${response.status}).`);
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

async function stageRoomAttachments(apiUrl, roomIssueId, attachments) {
  const roomDirectory = path.join(roomAttachmentCacheRoot(), safeAttachmentPathSegment(roomIssueId));
  const staged = [];
  for (const attachment of attachments) {
    const attachmentId = textParam(attachment, "id");
    if (!attachmentId) throw new Error("An attached file did not have a Paperclip attachment id.");
    const directory = path.join(roomDirectory, safeAttachmentPathSegment(attachmentId));
    const localPath = path.join(directory, safeAttachmentFilename(roomAttachmentName(attachment)));
    const partialPath = `${localPath}.partial`;
    const response = await fetch(roomAttachmentContentUrl(apiUrl, attachment));
    if (!response.ok) throw new Error(`Could not read attached file ${roomAttachmentName(attachment)} (HTTP ${response.status}).`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(partialPath, Buffer.from(await response.arrayBuffer()));
    fs.renameSync(partialPath, localPath);
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

function roomUserCommentBody(message, attachments) {
  const text = String(message || "").trim() || "Please inspect the attached files.";
  return `**User**\n${text}${roomAttachmentCommentBlock(attachments)}`;
}

function roomTurnText(message, stagedAttachments) {
  const text = String(message || "").trim() || "Please inspect the attached files and respond to the user.";
  if (!stagedAttachments.length) return text;
  const fileContext = stagedAttachments.map((attachment) => {
    const delivery = attachment.isImage ? "also supplied as an image input" : "available as a local file";
    return `- ${roomAttachmentName(attachment)} (${attachment.contentType}, ${attachment.byteSize} bytes): ${attachment.localPath} (${delivery})`;
  });
  return `${text}\n\nAttached Room files are durable Paperclip attachments. Inspect only the files relevant to the request and do not execute untrusted binaries.\n${fileContext.join("\n")}`;
}

async function putRoomDocument(apiUrl, input) {
  const endpoint = `${loopbackPaperclipApiUrl(apiUrl)}/api/issues/${encodeURIComponent(input.issueId)}/documents/${encodeURIComponent(input.key)}`;
  const response = await fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: input.title,
      // Paperclip's public document API stores durable bodies as Markdown.
      // JSON Room state remains valid content inside a Markdown document.
      format: "markdown",
      body: input.body,
      baseRevisionId: input.baseRevisionId,
      changeSummary: input.changeSummary
    })
  });
  if (!response.ok) {
    throw new Error(`Paperclip Room document write failed (HTTP ${response.status}).`);
  }
  return response.json();
}

async function getRoomDocumentDirect(apiUrl, issueId, key) {
  const endpoint = `${loopbackPaperclipApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`;
  const response = await fetch(endpoint);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Room document read failed (${response.status}).`);
  return response.json();
}

async function saveRoomStateOutsideInvocation(apiUrl, issueId, state, changeSummary) {
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
}

async function createRoomCommentOutsideInvocation(apiUrl, issueId, body) {
  const endpoint = `${loopbackPaperclipApiUrl(apiUrl)}/api/issues/${encodeURIComponent(issueId)}/comments`;
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
    body: `${JSON.stringify(checkpoints, null, 2)}\n`,
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
    task_owner_feedback: "Task owner feedback"
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

function queueRoom(roomId, work) {
  const previous = roomLocks.get(roomId) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(work);
  roomLocks.set(roomId, current.catch(() => {}));
  return current;
}

async function getRuntimeConfig(ctx) {
  const config = asRecord(await ctx.config.get());
  return {
    enabled: config.enableCodexRooms === true,
    command: textParam(config, "codexCommand", "codex"),
    model: textParam(config, "codexModel", "") || null,
    enableTaskAssignment: config.enableTaskAssignment === true,
    paperclipApiUrl: loopbackPaperclipApiUrl(textParam(config, "paperclipApiUrl", "http://127.0.0.1:3100"))
  };
}

async function getCodexClient(ctx, runtime) {
  if (codexClient) return codexClient;
  codexClient = new CodexAppServerClient({
    command: runtime.command,
    onServerRequest: (request) => handleCodexServerRequest(ctx, request)
  });
  await codexClient.start();
  return codexClient;
}

async function openThread(ctx, runtime, state, companyId, issue, agent) {
  const workingDirectory = await resolveRoomWorkingDirectory(ctx, companyId, issue, agent, state);
  const client = await getCodexClient(ctx, runtime);
  const instructions = loadAgentInstructions(agent);
  const thread = await client.openRoomThread({
    threadId: state.runtime?.codexThreadId ?? null,
    cwd: workingDirectory,
    model: runtime.model,
    developerInstructions: agentInstructions(state, agent, instructions),
    dynamicTools: roomTools()
  });
  if (!thread?.id) throw new Error("Codex app-server did not return a Room thread id.");
  activeThreadContexts.set(thread.id, {
    companyId,
    issueId: issue.id,
    projectId: issue.projectId ?? null,
    agentId: agent.id,
    agentName: agent.name,
    agentRole: agent.role ?? null
  });
  state.runtime.codexThreadId = thread.id;
  state.runtime.model = runtime.model;
  state.runtime.updatedAt = now();
  return { client, threadId: thread.id };
}

function requireUserAction(actionCtx) {
  if (actionCtx?.actor?.type !== "user" || !actionCtx.companyId) {
    throw new Error("Room Chat actions require an authenticated Paperclip user.");
  }
  return actionCtx.companyId;
}

function turnResultText(turn) {
  const text = getAgentText(turn);
  if (!text) throw new Error("Codex completed the Room turn without an assistant message.");
  return text;
}

function beginRoomActivity(state, kind, jobId = null) {
  const timestamp = now();
  state.runtime ??= {};
  state.runtime.activity = {
    status: "working",
    kind,
    jobId,
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
    dynamicToolCall: "Paperclip 작업 도구 사용",
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

async function getActiveTasks(ctx, companyId, projectId, roomIssueId) {
  if (!projectId) return [];
  const issues = await ctx.issues.list({ companyId, projectId, limit: 200 });
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
    const output = execFileSync("git", ["-C", cwd, "status", "--porcelain=v1", "--untracked-files=all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
      windowsHide: true
    });
    const files = output.split(/\r?\n/).filter(Boolean).slice(0, 100).map((line) => {
      const code = line.slice(0, 2).trim() || "M";
      return {
        workspaceId: workspace?.id ?? null,
        workspaceName: name,
        workspaceKind: kind,
        status: gitStatusLabel(code),
        path: line.slice(3).trim()
      };
    }).filter((file) => file.path);
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
  const conflicts = activeTasks.filter((task) => declaredPaths(task.description).some((path) => normalizedPaths.includes(path)));
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

async function handleCodexServerRequest(ctx, request) {
  if (request.method !== "item/tool/call") throw new Error(`Unsupported Codex request: ${request.method}`);
  const params = request.params ?? {};
  const roomContext = activeThreadContexts.get(params.threadId);
  if (!roomContext) throw new Error("Codex tool call does not belong to an active Room.");
  const name = `${params.namespace || ""}.${params.tool || ""}`.replace(/^\./, "");
  const args = asRecord(params.arguments);
  let content;

  if (name === "paperclip.list_active_tasks") {
    const activeTasks = await getActiveTasks(ctx, roomContext.companyId, roomContext.projectId, roomContext.issueId);
    content = JSON.stringify(activeTasks.map((task) => ({
      id: task.id,
      identifier: task.identifier,
      title: task.title,
      status: task.status,
      assigneeAgentId: task.assigneeAgentId ?? null,
      declaredAffectedPaths: declaredPaths(task.description)
    })), null, 2);
  } else if (name === "paperclip.list_workers") {
    const agents = await ctx.agents.list({ companyId: roomContext.companyId, limit: 100 });
    content = JSON.stringify(agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      role: agent.role ?? null,
      status: agent.status,
      adapterType: agent.adapterType ?? null
    })), null, 2);
  } else if (name === "paperclip.preview_task") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project", message: "An Agent Room must belong to a project before it can preview Tasks." });
    } else {
      const preview = await previewTask(ctx, roomContext.companyId, roomContext.projectId, roomContext.issueId, listParam(args, "affectedPaths"));
      content = JSON.stringify({ ok: true, ...preview }, null, 2);
    }
  } else if (name === "paperclip.create_task") {
    const runtime = await getRuntimeConfig(ctx);
    if (!runtime.enableTaskAssignment) {
      content = JSON.stringify({
        ok: false,
        code: "task_assignment_disabled",
        message: "Worker Task assignment is disabled until the organization adapters are explicitly configured and enabled."
      });
    } else if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project", message: "An Agent Room must belong to a project before it can create Tasks." });
    } else if (!TASK_OWNER_AGENT_ROLES.has(roomContext.agentRole)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_create_tasks", message: "Only CEO, CTO, or Designer Agents can create Worker Tasks." });
    } else {
      const title = textParam(args, "title");
      const description = textParam(args, "description");
      const assigneeAgentId = textParam(args, "assigneeAgentId");
      const taskType = textParam(args, "taskType", "implementation");
      const affectedPaths = listParam(args, "affectedPaths");
      const designReferences = listParam(args, "designReferences");
      const acceptanceCriteria = listParam(args, "acceptanceCriteria");
      const verification = listParam(args, "verification");
      const blockedByIssueIds = [...new Set(listParam(args, "blockedByIssueIds"))];
      const requestedProjectWorkspaceId = textParam(args, "projectWorkspaceId");
      const projectWorkspaces = await listProjectWorkspaces(ctx, roomContext.companyId, roomContext.projectId);
      const taskWorkspace = chooseTaskWorkspace(projectWorkspaces, taskType, requestedProjectWorkspaceId);
      if (!title || !description || !assigneeAgentId) {
        content = JSON.stringify({ ok: false, code: "invalid_task", message: "title, description, and assigneeAgentId are required." });
      } else if (Array.isArray(projectWorkspaces) && !taskWorkspace) {
        content = JSON.stringify({ ok: false, code: "workspace_required", message: "This Task needs a registered Project Workspace before it can be assigned." });
      } else if (!affectedPaths.length && !["design", "documentation"].includes(taskType)) {
        content = JSON.stringify({ ok: false, code: "affected_paths_required", message: "Declare affected paths before creating implementation, QA, art, or voice Tasks." });
      } else if (roomContext.agentRole === "cto" && taskType === "implementation" && !designReferences.length) {
        content = JSON.stringify({ ok: false, code: "design_reference_required", message: "CTO implementation Tasks require at least one approved design reference." });
      } else {
        const preview = await previewTask(ctx, roomContext.companyId, roomContext.projectId, roomContext.issueId, affectedPaths);
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
            affectedPaths,
            designReferences,
            acceptanceCriteria,
            verification,
            blockedByIssueIds,
            assigneeAgentId,
            projectWorkspaceId: taskWorkspace?.id ?? null,
            projectWorkspaceName: taskWorkspace?.name ?? null
          };
          const descriptionWithContract = taskDescription({ description, ...taskInput });
        const created = await ctx.issues.create({
          companyId: roomContext.companyId,
          projectId: roomContext.projectId,
          parentId: roomContext.issueId,
          title,
          description: descriptionWithContract,
          status: "todo",
          priority: "medium",
          assigneeAgentId,
          blockedByIssueIds,
          originKind: "plugin:local.room-chat:role-tool",
          originId: params.callId
        });
          const taskState = newTaskRoomState(created, roomContext, taskInput);
          try {
            await upsertRoomDocument(ctx, {
              issueId: created.id,
              key: TASK_ROOM_STATE_KEY,
              body: serializeState(taskState),
              companyId: roomContext.companyId,
              title: "Task Room state",
              format: "markdown",
              changeSummary: "Initialize Task Room state"
            });
            await ctx.issues.createComment(created.id, taskProtocolComment(roomContext, created, taskState), roomContext.companyId);
            content = JSON.stringify({
              ok: true,
              task: { id: created.id, identifier: created.identifier, title: created.title, status: created.status, projectWorkspaceId: taskInput.projectWorkspaceId },
              reviewBoundary: "user_required",
              blockedByIssueIds
            }, null, 2);
          } catch (error) {
            await ctx.issues.createComment(created.id, `## Task Room initialization blocked\n${error.message}`, roomContext.companyId);
            await ctx.issues.update(created.id, { status: "blocked" }, roomContext.companyId);
            content = JSON.stringify({ ok: false, code: "task_room_initialization_failed", taskId: created.id, message: error.message });
          }
        }
      }
    }
  } else if (name === "paperclip.get_task_context") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project" });
    } else {
      const task = await getProjectTask(ctx, roomContext.companyId, roomContext.projectId, textParam(args, "taskId"));
      const [stateDocument, comments] = await Promise.all([
        ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, roomContext.companyId),
        ctx.issues.listComments(task.id, roomContext.companyId)
      ]);
      content = JSON.stringify({
        ok: true,
        task: { id: task.id, identifier: task.identifier, title: task.title, status: task.status, assigneeAgentId: task.assigneeAgentId ?? null },
        state: parseState(stateDocument?.body),
        comments: comments.slice(-30)
      }, null, 2);
    }
  } else if (name === "paperclip.post_task_feedback") {
    if (!roomContext.projectId) {
      content = JSON.stringify({ ok: false, code: "missing_project" });
    } else if (!TASK_OWNER_AGENT_ROLES.has(roomContext.agentRole)) {
      content = JSON.stringify({ ok: false, code: "agent_cannot_post_feedback" });
    } else {
      const task = await getProjectTask(ctx, roomContext.companyId, roomContext.projectId, textParam(args, "taskId"));
      const message = textParam(args, "message");
      if (!message) {
        content = JSON.stringify({ ok: false, code: "feedback_message_required" });
      } else {
        const comment = await ctx.issues.createComment(task.id, `## ${roomContext.agentName} Feedback\n${message}`, roomContext.companyId);
        content = JSON.stringify({ ok: true, taskId: task.id, commentId: comment.id ?? null });
      }
    }
  } else {
    content = JSON.stringify({ ok: false, code: "unknown_tool", tool: name });
  }
  return { success: true, contentItems: [{ type: "inputText", text: content }] };
}

async function handleRoomView(ctx, params) {
  const companyId = textParam(params, "companyId");
  const issueId = textParam(params, "issueId");
  if (!companyId || !issueId) throw new Error("companyId and issueId are required.");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const [state, checkpointDocument, comments, runtime, jobs] = await Promise.all([
    loadRoomState(ctx, companyId, issue, agent),
    ctx.issues.documents.get(issue.id, ROOM_CHECKPOINTS_KEY, companyId),
    ctx.issues.listComments(issue.id, companyId),
    getRuntimeConfig(ctx),
    listRoomJobs(ctx, issue.id)
  ]);
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
  const attachments = await listIssueAttachmentsDirect(runtime.paperclipApiUrl, issue.id).catch((error) => {
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
    checkpoints: parseState(checkpointDocument?.body) ?? [],
    comments: comments.slice(-100),
    attachments: attachments.slice(-100).map(attachmentSnapshot),
    jobs: jobs.slice(-20),
    runtime: { enabled: runtime.enabled, taskAssignmentEnabled: runtime.enableTaskAssignment }
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
  const projectWorkspaces = await listProjectWorkspaces(ctx, companyId, projectId);
  const agent = await ctx.agents.get(roomView.room.agentId, companyId);
  const selectedWorkspaceId = textParam(asRecord(roomView.state?.workspace), "projectWorkspaceId");
  const selectedWorkspace = Array.isArray(projectWorkspaces)
    ? projectWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null
    : null;
  const workingDirectory = selectedWorkspace?.path || roomView.state?.workingDirectory || "";
  const workspaces = workingDirectory ? [workspaceGitChanges({
    id: roomView.room.agentId,
    name: `${roomView.room.agentName} 작업 폴더`,
    cwd: workingDirectory,
    metadata: { kind: workspaceKindForAgent(agent) }
  })] : [];
  return {
    ...roomView,
    project: project ? { id: project.id, name: project.name ?? project.slug ?? project.id } : null,
    tasks: taskSummary.tasks,
    activeTaskCount: taskSummary.activeTaskCount,
    referencedFiles: taskSummary.referencedFiles,
    workspaces,
    workspaceBinding: roomView.state?.workspace ?? null,
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
  const [issues, agents] = await Promise.all([
    ctx.issues.list({ companyId, projectId, limit: 500 }),
    ctx.agents.list({ companyId, limit: 200 })
  ]);
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const rooms = issues.filter(isAgentRoom);
  const activeLegacyRoleRoomCount = issues.filter((issue) => isLegacyRoleRoom(issue) && !TERMINAL_STATUSES.has(issue.status)).length;
  const taskCount = issues.filter((issue) => !isLongLivedRoom(issue) && issue.projectId === projectId).length;
  return {
    project: { id: project.id, name: project.name ?? project.slug ?? projectId },
    provisionedAgentRoomCount: provisioned.created.length,
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
    selectedProjectId,
    requiresProjectSelection: false,
    tasks
  };
}

async function handleRoleRulesView(ctx, params) {
  const companyId = textParam(params, "companyId");
  if (!companyId) throw new Error("companyId is required.");
  const roles = await Promise.all(DEFAULT_PROJECT_ROOM_ROLES.map(async (role) => {
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
  if (!DEFAULT_PROJECT_ROOM_ROLES.includes(role)) {
    throw new Error("Only a default project role can be edited from Role AGENTS.md.");
  }
  if (!body) throw new Error("AGENTS.md content is required.");
  if (body.length > 24000) throw new Error("AGENTS.md content must be 24000 characters or fewer.");
  if (!ctx.state?.set) throw new Error("Paperclip plugin state is unavailable.");
  const record = { version: 1, role, body, updatedAt: now(), isDefault: false };
  await ctx.state.set(roleRulesScope(companyId, role), record);
  return { ok: true, role, updatedAt: record.updatedAt };
}

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
    comments: comments.slice(-100),
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
    const turn = await client.runTurn({ threadId, text: message, onProgress: activity.report });
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
  activeRoomMessageJobs.set(input.issueId, job);
  job.then(
    () => {},
    (error) => ctx.logger?.error?.("Background Room turn failed.", { issueId: input.issueId, message: error instanceof Error ? error.message : String(error) })
  ).finally(() => activeRoomMessageJobs.delete(input.issueId));
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
  const userComment = await ctx.issues.createComment(issue.id, `**User**\n${message}`, companyId);
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
    const handoffTurn = await client.runTurn({
      threadId,
      text: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const summary = turnResultText(handoffTurn);
    const comments = await ctx.issues.listComments(issue.id, companyId);
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary,
      sourceCommentId: comments.at(-1)?.id ?? state.lastCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    state.pendingTurn = null;
    await saveRoomState(ctx, companyId, issue.id, state, "Write pre-compact Room handoff");
    await appendCheckpoint(ctx, companyId, issue.id, checkpoint);
    const compacted = await client.compactThread(threadId);
    state.checkpoint.compactedAt = now();
    state.runtime.updatedAt = now();
    await saveRoomState(ctx, companyId, issue.id, state, "Record native Codex compact completion");
    return { ok: true, checkpoint: state.checkpoint, compacted: compacted.compacted };
  });
}

async function runDurableRoomMessage(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let state = null;
  let activity = null;
  try {
    const { issue, agent } = await requireRoom(ctx, companyId, job.roomIssueId);
    state = await loadRoomState(ctx, companyId, issue, agent);
    if (state.pendingTurn?.jobId !== job.id) return;
    const { client, threadId } = await openThread(ctx, runtime, state, companyId, issue, agent);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Room Codex thread for Room Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    activity = roomActivityReporter(ctx, companyId, issue.id, state);
    const turn = await client.runTurn({
      threadId,
      text: textParam(job.payload, "message"),
      onProgress: activity.report
    });
    await activity.flush();
    const assistantMessage = turnResultText(turn);
    const reasoningSummary = roomReasoningSummary(state);
    if (reasoningSummary) await ctx.issues.createComment(issue.id, `**${agent.name} reasoning summary**\n${reasoningSummary}`, companyId);
    const assistantComment = await ctx.issues.createComment(issue.id, `**${agent.name}**\n${assistantMessage}`, companyId);
    state.runtime.updatedAt = now();
    state.lastCommentId = assistantComment.id ?? job.sourceCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    await saveRoomState(ctx, companyId, issue.id, state, "Persist completed Room Job");
    job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: assistantComment.id ?? null });
    emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, activity: state.runtime.activity });
  } catch (error) {
    await activity?.flush();
    if (state) {
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
}

async function runDurableRoomCompact(ctx, { companyId, runtime, job: initialJob }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  let state = null;
  try {
    const { issue, agent } = await requireRoom(ctx, companyId, job.roomIssueId);
    state = await loadRoomState(ctx, companyId, issue, agent);
    if (state.pendingTurn?.jobId !== job.id) return;
    const { client, threadId } = await openThread(ctx, runtime, state, companyId, issue, agent);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, issue.id, state, "Bind Room Codex thread for compact Job");
    emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
    const handoffTurn = await client.runTurn({
      threadId,
      text: "INTERNAL ROOM CHECKPOINT. Return only a concise handoff summary with current goal, confirmed decisions, referenced artifacts, active or blocked Tasks, open questions, and the next action. Do not greet the user and do not invent decisions."
    });
    const checkpoint = {
      version: (state.checkpoint?.version ?? 0) + 1,
      summary: turnResultText(handoffTurn),
      sourceCommentId: state.lastCommentId ?? job.sourceCommentId ?? null,
      createdAt: now(),
      compactedAt: null
    };
    state.checkpoint = checkpoint;
    await saveRoomState(ctx, companyId, issue.id, state, "Write pre-compact Room handoff");
    await appendCheckpoint(ctx, companyId, issue.id, checkpoint);
    const compacted = await client.compactThread(threadId);
    state.checkpoint.compactedAt = now();
    state.runtime.updatedAt = now();
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    await saveRoomState(ctx, companyId, issue.id, state, "Record completed Room compact Job");
    job = await updateRoomJob(ctx, job, {
      status: "completed",
      completedAt: now(),
      payload: { ...job.payload, compacted: compacted.compacted === true }
    });
    emitRoomEvent(ctx, companyId, issue.id, { type: "completed", job, checkpoint });
  } catch (error) {
    if (state) {
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
  try {
    const task = await ctx.issues.get(job.taskIssueId, companyId);
    if (!task?.parentId) throw new Error("Task Room is no longer available.");
    const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
    const taskState = parseState(taskStateDocument?.body);
    if (!taskState || taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
    const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, task.parentId);
    ownerState = await loadRoomState(ctx, companyId, ownerRoom, agent);
    if (ownerState.pendingTurn?.jobId !== job.id) return;
    const comments = await ctx.issues.listComments(task.id, companyId);
    const { client, threadId } = await openThread(ctx, runtime, ownerState, companyId, ownerRoom, agent);
    job = await updateRoomJob(ctx, job, { status: "working" });
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Bind Room Codex thread for Task feedback Job");
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
    const activity = roomActivityReporter(ctx, companyId, ownerRoom.id, ownerState);
    const turn = await client.runTurn({
      threadId,
      text: [
        "TASK ROOM FEEDBACK REQUEST.",
        "Respond only with concise guidance for the Worker in this Task Room.",
        "Do not create a new Task, implement work, or change Task status.",
        `Task: ${task.identifier ?? task.id} ${task.title}`,
        `Task state: ${JSON.stringify(taskState)}`,
        `Recent Task comments: ${comments.slice(-12).map((comment) => comment.body).join("\n---\n")}`,
        `User request: ${textParam(job.payload, "message")}`
      ].join("\n\n"),
      onProgress: activity.report
    });
    await activity.flush();
    const feedbackComment = await ctx.issues.createComment(task.id, `## ${agent.name} Feedback\n${turnResultText(turn)}`, companyId);
    ownerState.runtime.updatedAt = now();
    ownerState.lastCommentId = feedbackComment.id ?? job.sourceCommentId ?? null;
    ownerState.pendingTurn = null;
    finishRoomActivity(ownerState, "completed");
    await saveRoomState(ctx, companyId, ownerRoom.id, ownerState, "Persist completed Task feedback Job");
    job = await updateRoomJob(ctx, job, { status: "completed", completedAt: now(), resultCommentId: feedbackComment.id ?? null });
    emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "completed", job, activity: ownerState.runtime.activity });
  } catch (error) {
    if (ownerState) {
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

async function startRoomTurn(client, threadId, text, stagedAttachments = []) {
  const input = [
    { type: "text", text },
    ...stagedAttachments
      .filter((attachment) => attachment.isImage)
      .map((attachment) => ({ type: "localImage", path: attachment.localPath, detail: "auto" }))
  ];
  const started = await client.request("turn/start", {
    threadId,
    input
  });
  const turnId = started?.turn?.id;
  if (!turnId) throw new Error("Codex app-server did not return a turn id.");
  return { turnId, completion: client.waitForTurn(threadId, turnId) };
}

async function completeRoomTurnOutsideInvocation({ apiUrl, issueId, agentName, state, completion }) {
  try {
    const turn = await completion;
    const assistantMessage = turnResultText(turn);
    const assistantComment = await createRoomCommentOutsideInvocation(apiUrl, issueId, `**${agentName}**\n${assistantMessage}`);
    state.runtime.updatedAt = now();
    state.lastCommentId = assistantComment.id ?? state.lastCommentId ?? null;
    state.pendingTurn = null;
    finishRoomActivity(state, "completed");
    await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist completed Room turn");
  } catch (error) {
    state.pendingTurn = null;
    finishRoomActivity(state, "failed", error);
    try {
      await saveRoomStateOutsideInvocation(apiUrl, issueId, state, "Persist failed Room turn");
    } catch {
      // Keep the original Room-turn failure as the visible error whenever recovery persistence also fails.
    }
  }
}

async function launchRoomMessageWithinAction(ctx, { companyId, runtime, job: initialJob, issue, agent, state }) {
  let job = await updateRoomJob(ctx, initialJob, { status: "starting", startedAt: now() });
  const { client, threadId } = await openThread(ctx, runtime, state, companyId, issue, agent);
  job = await updateRoomJob(ctx, job, { status: "working" });
  await saveRoomState(ctx, companyId, issue.id, state, "Bind Room Codex thread for Room Job");
  emitRoomEvent(ctx, companyId, issue.id, { type: "job", job });
  const attachments = Array.isArray(job.payload?.attachments) ? job.payload.attachments : [];
  const stagedAttachments = await stageRoomAttachments(runtime.paperclipApiUrl, issue.id, attachments);
  const started = await startRoomTurn(
    client,
    threadId,
    roomTurnText(textParam(job.payload, "message"), stagedAttachments),
    stagedAttachments
  );
  state.runtime.activity.turnId = started.turnId;
  state.runtime.activity.updatedAt = now();
  await saveRoomState(ctx, companyId, issue.id, state, "Record started Room turn");

  const completion = completeRoomTurnOutsideInvocation({
    apiUrl: runtime.paperclipApiUrl,
    issueId: issue.id,
    agentName: agent.name,
    state,
    completion: started.completion
  });
  activeRoomMessageJobs.set(issue.id, completion);
  completion.finally(() => activeRoomMessageJobs.delete(issue.id));
  return job;
}

function startDurableRoomJob(ctx, input) {
  const issueId = input.job.roomIssueId;
  if (activeRoomMessageJobs.has(issueId)) return false;
  const runner = input.job.kind === "room_message"
    ? runDurableRoomMessage
    : input.job.kind === "compact_handoff"
      ? runDurableRoomCompact
      : runDurableTaskOwnerFeedback;
  const promise = queueRoom(issueId, () => runner(ctx, input));
  activeRoomMessageJobs.set(issueId, promise);
  promise.then(
    () => {},
    (error) => ctx.logger?.error?.("Background Room Job failed.", { issueId, message: error instanceof Error ? error.message : String(error) })
  ).finally(() => activeRoomMessageJobs.delete(issueId));
  return true;
}

async function handleRoomSendJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) return { ok: false, code: "codex_rooms_disabled", message: "Codex Room runtime is disabled. Configure and enable it before sending a live message." };
  const issueId = textParam(params, "issueId");
  const message = textParam(params, "message");
  const attachmentIds = attachmentIdsParam(params);
  if (!message && !attachmentIds.length) return { ok: false, code: "message_required", message: "Write a message or attach at least one file." };
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  const state = await loadRoomState(ctx, companyId, issue, agent);
  if (activeRoomMessageJobs.has(issue.id) || state.pendingTurn) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const attachments = await resolveRoomAttachments(runtime.paperclipApiUrl, issue.id, attachmentIds);
  const userComment = await ctx.issues.createComment(issue.id, roomUserCommentBody(message, attachments), companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: issue.id,
    kind: "room_message",
    sourceCommentId: userComment.id ?? null,
    payload: { message, attachments }
  });
  state.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: userComment.id ?? null, startedAt: now() };
  beginRoomActivity(state, job.kind, job.id);
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
  if (!runtime.enabled) return { ok: false, code: "codex_rooms_disabled", message: "Codex Room runtime is disabled." };
  const issueId = textParam(params, "issueId");
  const { issue, agent } = await requireRoom(ctx, companyId, issueId);
  if (activeRoomMessageJobs.has(issue.id) || await activeRoomJob(ctx, issue.id)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const state = await loadRoomState(ctx, companyId, issue, agent);
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
  if (!startDurableRoomJob(ctx, { companyId, runtime, job })) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  return { ok: true, accepted: true, jobId: job.id };
}

async function handleTaskOwnerFeedbackJob(ctx, params, actionCtx) {
  const companyId = requireUserAction(actionCtx);
  const runtime = await getRuntimeConfig(ctx);
  if (!runtime.enabled) return { ok: false, code: "codex_rooms_disabled", message: "Codex Room runtime is disabled." };
  const taskId = textParam(params, "issueId");
  const message = textParam(params, "message");
  if (!message) return { ok: false, code: "message_required", message: "A feedback request is required." };
  const task = await ctx.issues.get(taskId, companyId);
  if (!task?.parentId) throw new Error("Task Room is available only on a child Task issue.");
  const taskStateDocument = await ctx.issues.documents.get(task.id, TASK_ROOM_STATE_KEY, companyId);
  const taskState = parseState(taskStateDocument?.body);
  if (!taskState || taskState.originatingRoomIssueId !== task.parentId) throw new Error("Task Room owner does not match the Task parent.");
  const { issue: ownerRoom, agent } = await requireRoom(ctx, companyId, task.parentId);
  if (activeRoomMessageJobs.has(ownerRoom.id) || await activeRoomJob(ctx, ownerRoom.id)) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  const requestComment = await ctx.issues.createComment(task.id, `## User Request for ${agent.name} Feedback\n${message}`, companyId);
  const job = await createRoomJob(ctx, {
    companyId,
    roomIssueId: ownerRoom.id,
    taskIssueId: task.id,
    kind: "task_owner_feedback",
    sourceCommentId: requestComment.id ?? null,
    payload: { message }
  });
  const state = await loadRoomState(ctx, companyId, ownerRoom, agent);
  state.pendingTurn = { kind: job.kind, jobId: job.id, sourceCommentId: requestComment.id ?? null, startedAt: now() };
  beginRoomActivity(state, job.kind, job.id);
  await saveRoomState(ctx, companyId, ownerRoom.id, state, "Persist queued Task feedback Job");
  emitRoomEvent(ctx, companyId, ownerRoom.id, { type: "job", job });
  if (!startDurableRoomJob(ctx, { companyId, runtime, job })) return { ok: false, code: "room_busy", message: `${agent.name} is already working in this Room.` };
  return { ok: true, accepted: true, taskId: task.id, ownerAgent: agent.name, jobId: job.id };
}

async function reconcileInterruptedRoomJobs(ctx) {
  if (!ctx.entities?.list) return;
  const records = await ctx.entities.list({ entityType: ROOM_JOB_ENTITY_TYPE, limit: 500 });
  for (const record of records) {
    const job = roomJobData(asRecord(record.data));
    if (!job.id || !job.companyId || !job.roomIssueId || !ACTIVE_ROOM_JOB_STATUSES.has(job.status)) continue;
    if (activeRoomMessageJobs.has(job.roomIssueId)) continue;
    const interrupted = await updateRoomJob(ctx, job, {
      status: "interrupted",
      completedAt: now(),
      error: "The plugin worker restarted before this Job completed. The submitted message and Room state were preserved."
    });
    try {
      const { issue, agent } = await requireRoom(ctx, job.companyId, job.roomIssueId);
      const state = await loadRoomState(ctx, job.companyId, issue, agent);
      if (textParam(state.pendingTurn, "jobId") === job.id) {
        state.pendingTurn = null;
        finishRoomActivity(state, "failed", interrupted.error);
        await saveRoomState(ctx, job.companyId, issue.id, state, "Mark interrupted Room Job during startup reconciliation");
      }
      emitRoomEvent(ctx, job.companyId, issue.id, { type: "interrupted", job: interrupted });
    } catch (error) {
      ctx.logger?.warn?.("Room Job was marked interrupted but its Room state could not be reconciled.", {
        roomIssueId: job.roomIssueId,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }
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
    ctx.actions.register("room-bootstrap", (params, actionCtx) => handleRoomBootstrap(ctx, params, actionCtx));
    ctx.actions.register("room-send", (params, actionCtx) => handleRoomSendJob(ctx, params, actionCtx));
    ctx.actions.register("room-compact", (params, actionCtx) => handleRoomCompactJob(ctx, params, actionCtx));
    ctx.actions.register("task-request-owner-feedback", (params, actionCtx) => handleTaskOwnerFeedbackJob(ctx, params, actionCtx));
    void reconcileInterruptedRoomJobs(ctx).catch((error) => {
      ctx.logger?.warn?.("Room Job startup reconciliation failed.", {
        message: error instanceof Error ? error.message : String(error)
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
        await syncAgentRoomTitles(ctx, event.companyId, event.entityId);
      } catch (error) {
        ctx.logger.error("Agent Room name sync failed.", {
          agentId: event.entityId,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
  },
  async shutdown() {
    codexClient?.stop();
    codexClient = null;
    activeThreadContexts.clear();
    pluginCtx = null;
  }
});

function setActiveThreadContextForTest(threadId, context) {
  if (context) activeThreadContexts.set(threadId, context);
  else activeThreadContexts.delete(threadId);
}

function setCodexClientForTest(client) {
  codexClient = client;
}

export { agentInstructions, agentRoomAgentId, appendCheckpoint, attachmentIdsParam, chooseDefaultWorkspace, defaultWorkspaceKindForAgent, handleCodexServerRequest, handleProjectTasksView, handleProjectWorkplaneView, handleRoomBootstrap, handleRoomCompact, handleRoomCompactJob, handleRoomSend, handleRoomSendJob, handleRoomTaskSummary, handleRoomView, handleRoomWorkspaceView, handleTaskOwnerFeedback, handleTaskOwnerFeedbackJob, handleTaskRoomView, isAgentRoom, isCodexImageAttachment, isLongLivedRoom, listIssueAttachmentsDirect, listRoomJobs, loadAgentInstructions, loadRoomState, newRoomState, parseState, provisionProjectAgentRooms, provisionAllProjectAgentRooms, resolveRoomAttachments, roomAttachmentCommentBlock, roomRole, roomTurnText, roomUserCommentBody, setActiveThreadContextForTest, setCodexClientForTest, stageRoomAttachments, startRoomTurn, syncAgentRoomTitles, workspaceKindForProjectWorkspace, workspaceLocalPath };
export default plugin;
if (process.env.PAPERCLIP_ROOM_CHAT_TEST !== "1") runWorker(plugin, import.meta.url);

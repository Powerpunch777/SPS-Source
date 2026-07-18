import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleTaskStatusUpdated, parseState } = await import("../dist/worker.js");

const companyId = "company-runtime-block";
const projectId = "project-runtime-block";
const ownerRoomId = "room-designer";
const taskId = "task-image-runtime-block";
const workerId = "agent-image-worker";
const ownerId = "agent-designer";
const owner = {
  id: ownerId,
  name: "Designer",
  role: "designer",
  status: "idle",
  adapterType: "test_local",
  adapterConfig: { cwd: process.cwd() }
};
const worker = {
  id: workerId,
  name: "Image Worker",
  role: "image-worker",
  reportsTo: ownerId,
  status: "error",
  adapterType: "agy_local",
  adapterConfig: { cwd: process.cwd() }
};
const ownerRoom = {
  id: ownerRoomId,
  companyId,
  projectId,
  title: owner.name,
  status: "todo",
  parentId: null,
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: `project:${projectId}:agent-room:${ownerId}`
};
const task = {
  id: taskId,
  identifier: "CMP-201",
  companyId,
  projectId,
  parentId: ownerRoomId,
  title: "Export approved pixel character sheet",
  description: "Create the approved 32x32 PNG asset.",
  status: "in_progress",
  assigneeAgentId: null,
  activeRecoveryAction: {
    id: "recovery-runtime-1",
    kind: "stranded_assigned_issue",
    cause: "stranded_assigned_issue",
    previousOwnerAgentId: workerId,
    returnOwnerAgentId: workerId,
    evidence: { latestRunErrorCode: "adapter_failed", latestRunId: "run-failed-1" }
  }
};
const taskState = {
  version: 1,
  kind: "task_room",
  taskIssueId: taskId,
  projectId,
  originatingRoomIssueId: ownerRoomId,
  owningAgentId: ownerId,
  owningAgentName: owner.name,
  owningAgentRole: owner.role,
  workerAgentId: workerId,
  taskType: "art",
  declaredAffectedPaths: ["Assets/Art/"],
  designReferences: ["Design/ArtBrief.md"],
  acceptanceCriteria: ["PNG exists."],
  verification: ["Inspect PNG dimensions."],
  dependencyTaskIds: [],
  review: { required: "owning_agent", status: "not_requested" }
};
const roomState = {
  version: 3,
  kind: "agent_room",
  roomIssueId: ownerRoomId,
  projectId,
  agentId: ownerId,
  agentName: owner.name,
  agentRole: owner.role,
  workingDirectory: process.cwd(),
  workspace: { projectWorkspaceId: "workspace-runtime-block", name: "Design repository", kind: "design", boundAt: new Date().toISOString() },
  runtime: { kind: "codex_app_server", codexThreadId: "thread-designer", model: null, updatedAt: null, activity: { status: "idle", steps: [] } },
  checkpoint: { version: 0, summary: null, sourceCommentId: null, createdAt: null, compactedAt: null },
  pendingTurn: null
};

const documents = new Map([
  [`${ownerRoomId}:ROOM_STATE`, { latestRevisionId: "room-rev-1", body: `${JSON.stringify(roomState)}\n` }],
  [`${taskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-1", body: `${JSON.stringify(taskState)}\n` }]
]);
const comments = new Map([[ownerRoomId, []], [taskId, []]]);
const issues = new Map([[ownerRoomId, ownerRoom], [taskId, task]]);
const entities = new Map();
const originalFetch = globalThis.fetch;
const directCalls = [];
let ownerPrompt = "";
const nativeSessions = [];

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = new URL(String(url));
  const method = String(init.method || "GET").toUpperCase();
  const pathname = decodeURIComponent(requestUrl.pathname);
  directCalls.push({ method, pathname, body: init.body ? JSON.parse(String(init.body)) : null });

  const documentMatch = pathname.match(/^\/api\/issues\/([^/]+)\/documents\/([^/]+)$/);
  if (documentMatch) {
    const key = `${documentMatch[1]}:${documentMatch[2]}`;
    if (method === "GET") {
      const document = documents.get(key);
      return new Response(JSON.stringify(document ?? { error: "not found" }), { status: document ? 200 : 404 });
    }
    if (method === "PUT") {
      const payload = JSON.parse(String(init.body));
      const document = { latestRevisionId: `revision-${documents.size + 1}`, body: payload.body };
      documents.set(key, document);
      return new Response(JSON.stringify(document), { status: 200 });
    }
  }

  if (pathname === `/api/agents/${workerId}/pause` && method === "POST") {
    worker.status = "paused";
    return new Response(JSON.stringify(worker), { status: 200 });
  }
  if (pathname === `/api/issues/${taskId}/recovery-actions/resolve` && method === "POST") {
    task.activeRecoveryAction = null;
    task.status = "in_review";
    return new Response(JSON.stringify(task), { status: 200 });
  }
  if (pathname === `/api/issues/${taskId}` && method === "PATCH") {
    Object.assign(task, JSON.parse(String(init.body)));
    return new Response(JSON.stringify(task), { status: 200 });
  }
  throw new Error(`Unexpected Paperclip request: ${method} ${requestUrl}`);
};

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, enableAgyRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async (issueId) => issues.get(issueId) ?? null,
    listComments: async (issueId) => comments.get(issueId) ?? [],
    createComment: async (issueId, body) => {
      const item = { id: `comment-${(comments.get(issueId) ?? []).length + 1}`, body, createdAt: new Date().toISOString() };
      comments.set(issueId, [...(comments.get(issueId) ?? []), item]);
      return item;
    },
    documents: { get: async (issueId, key) => documents.get(`${issueId}:${key}`) ?? null }
  },
  agents: {
    get: async (agentId) => ({ [ownerId]: owner, [workerId]: worker })[agentId] ?? null,
    sessions: {
      list: async () => nativeSessions,
      create: async (_agentId, _companyId, options) => {
        const session = {
          sessionId: "session-runtime-block", agentId: owner.id, companyId, status: "active", createdAt: new Date().toISOString(),
          context: options.context, lastRunId: null, lastError: null
        };
        nativeSessions.push(session);
        return session;
      },
      close: async () => {},
      sendMessage: async (_sessionId, _companyId, options) => {
        ownerPrompt = options.prompt;
        const runId = `run-runtime-block-${Date.now()}`;
        setTimeout(() => options.onEvent({
          sessionId: "session-runtime-block", runId, seq: 1, eventType: "done", stream: "system", message: "Run completed",
          payload: { status: "succeeded", resultJson: { summary: "The Image Worker runtime is unavailable. The Task remains blocked and assigned to Image Worker until its runtime is restored." } }
        }), 0);
        return { runId };
      }
    }
  },
  projects: { listWorkspaces: async () => [{ id: "workspace-runtime-block", name: "Design repository", path: process.cwd(), isPrimary: true }] },
  entities: {
    upsert: async (record) => {
      entities.set(record.externalId, { ...record, data: record.data });
      return entities.get(record.externalId);
    },
    list: async ({ scopeId } = {}) => [...entities.values()].filter((record) => !scopeId || record.scopeId === scopeId)
  },
  streams: { open: () => {}, emit: () => {} },
  logger: { error: () => {}, warn: () => {} }
};

const result = await handleTaskStatusUpdated(ctx, {
  eventId: "event-worker-runtime-failed",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:01.000Z",
  actorType: "system",
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_progress", _previous: { status: "in_progress" } }
});

assert.equal(result.normalized, true);
assert.equal(result.reason, "worker_runtime_recovery_normalized");
assert.equal(task.status, "blocked");
assert.equal(task.assigneeAgentId, workerId);
assert.equal(task.activeRecoveryAction, null);
assert.equal(worker.status, "paused");
assert.equal(directCalls.some((call) => call.pathname.includes("/interactions")), false);
assert.equal(directCalls.some((call) => call.pathname === `/api/agents/${workerId}/pause`), true);
assert.equal(directCalls.some((call) => call.pathname.endsWith("/recovery-actions/resolve")), true);
assert.match(ownerPrompt, /AUTOMATIC WORKER RUNTIME BLOCK REPORT/);
assert.match(ownerPrompt, /Do not create any Task approval or question interaction/);
assert.match(comments.get(ownerRoomId)[0].body, /System - Worker runtime blocked/);
const savedTaskState = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
assert.equal(savedTaskState.review.status, "runtime_blocked");
assert.equal(savedTaskState.ownerNotification.kind, "runtime_block");
assert.equal(savedTaskState.ownerNotification.status, "completed");
assert.equal([...entities.values()].some((record) => record.data.kind === "task_owner_report" && record.status === "completed"), true);

// A manually-created direct-report Task can miss TASK_ROOM_STATE. Its first
// runtime failure must still remain with the Worker rather than being taken by
// the parent Agent. This mirrors the Paperclip core recovery path in CMP-158.
documents.delete(`${taskId}:TASK_ROOM_STATE`);
comments.set(ownerRoomId, []);
comments.set(taskId, []);
entities.clear();
directCalls.length = 0;
worker.status = "error";
task.status = "in_progress";
task.assigneeAgentId = null;
task.activeRecoveryAction = {
  id: "recovery-runtime-legacy",
  kind: "stranded_assigned_issue",
  cause: "stranded_assigned_issue",
  previousOwnerAgentId: workerId,
  returnOwnerAgentId: workerId,
  evidence: { latestRunErrorCode: "adapter_failed", latestRunId: "run-failed-legacy" }
};

const legacyResult = await handleTaskStatusUpdated(ctx, {
  eventId: "event-worker-runtime-legacy-failed",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:01:01.000Z",
  actorType: "system",
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_progress", _previous: { status: "in_progress" } }
});

assert.equal(legacyResult.normalized, true);
assert.equal(task.status, "blocked");
assert.equal(task.assigneeAgentId, workerId);
assert.equal(worker.status, "paused");
const recoveredLegacyState = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
assert.equal(recoveredLegacyState.legacyRecovery, true);
assert.equal(recoveredLegacyState.workerAgentId, workerId);
assert.equal(recoveredLegacyState.originatingRoomIssueId, ownerRoomId);
assert.equal(recoveredLegacyState.ownerNotification.kind, "runtime_block");
assert.equal(directCalls.some((call) => call.pathname.includes("/interactions")), false);

// Provider quota keeps the same Worker and Task blocked, but it is visible to
// the owner instead of being retried in the background.
documents.set(`${taskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-quota", body: `${JSON.stringify(taskState)}\n` });
comments.set(ownerRoomId, []);
comments.set(taskId, []);
entities.clear();
directCalls.length = 0;
worker.status = "idle";
worker.adapterType = "antigravity_local";
task.status = "in_progress";
task.assigneeAgentId = null;
task.activeRecoveryAction = {
  id: "recovery-provider-quota",
  kind: "stranded_assigned_issue",
  cause: "stranded_assigned_issue",
  previousOwnerAgentId: workerId,
  returnOwnerAgentId: workerId,
  evidence: { latestRunErrorCode: "provider_quota", latestRunId: "run-provider-quota" }
};

const quotaResult = await handleTaskStatusUpdated(ctx, {
  eventId: "event-worker-provider-quota",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:02:01.000Z",
  actorType: "system",
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_progress", _previous: { status: "in_progress" } }
});

assert.equal(quotaResult.normalized, true);
assert.equal(quotaResult.reason, "worker_runtime_recovery_normalized");
assert.equal(task.status, "blocked");
assert.equal(task.assigneeAgentId, workerId);
assert.equal(worker.status, "idle");
assert.equal(directCalls.some((call) => call.pathname === `/api/agents/${workerId}/pause`), false);
assert.ok(comments.get(ownerRoomId).length >= 1);
const quotaTaskState = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
assert.equal(quotaTaskState.quotaRetry.status, "disabled");
assert.equal(quotaTaskState.quotaRetry.provider, "agy");
assert.equal(quotaTaskState.quotaRetry.lastFailedRunId, "run-provider-quota");
assert.equal(quotaTaskState.quotaRetry.automaticRetry, false);
assert.equal(quotaTaskState.quotaRetry.nextRetryAt, null);

globalThis.fetch = originalFetch;
console.log("PASS Runtime Worker failures stay assigned; provider quota blocks visibly through the owner Room without an automatic retry");

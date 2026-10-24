const DURABLE_JSON_PREFIX = "paperclip-room-json:v1:";
const ROOM_WAITING_KINDS = new Set([
  "none",
  "user",
  "worker",
  "environment",
  "task_review",
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function textParam(params, key, fallback = "") {
  const value = asRecord(params)[key];
  return typeof value === "string" ? value.trim() : fallback;
}

export function now() {
  return new Date().toISOString();
}

export function parseState(body) {
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

export function serializeState(state) {
  const encoded = Buffer.from(JSON.stringify(state), "utf8").toString("base64");
  return `${DURABLE_JSON_PREFIX}${encoded}\n`;
}

export function newRoomState(issue, agent, legacyWorkingDirectory = "") {
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
      activity: {
        status: "idle",
        kind: null,
        turnId: null,
        startedAt: null,
        updatedAt: null,
        steps: [],
        error: null,
      },
    },
    checkpoint: {
      version: 0,
      summary: null,
      sourceCommentId: null,
      createdAt: null,
      compactedAt: null,
    },
    pendingTurn: null,
  };
}

function roomWorkText(value, limit = 1200) {
  const text = value === undefined || value === null ? "" : String(value).trim();
  return text ? text.slice(0, limit) : null;
}

export function roomWorkReferences(value) {
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
    sourceReferences: roomWorkReferences(value.sourceReferences),
  };
  return outcome.taskId || outcome.identifier || outcome.summary ? outcome : null;
}

function normalizeRoomNextCandidate(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = {
    summary: roomWorkText(value.summary, 1600),
    kind: roomWorkText(value.kind, 120),
    sourceReferences: roomWorkReferences(value.sourceReferences),
  };
  return candidate.summary ? candidate : null;
}

export function normalizeRoomWaitingFor(value) {
  const source = asRecord(value);
  const requestedKind = roomWorkText(source.kind, 80) || "none";
  const kind = ROOM_WAITING_KINDS.has(requestedKind) ? requestedKind : "none";
  return {
    kind,
    detail: kind === "none" ? null : roomWorkText(source.detail, 1200),
    taskId: kind === "none" ? null : roomWorkText(source.taskId, 200),
  };
}

export function newRoomWorkState(issue) {
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
    updatedBy: null,
  };
}

export function normalizeRoomWorkState(value, issue) {
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
    updatedBy: Object.keys(asRecord(source.updatedBy)).length
      ? {
          kind: roomWorkText(source.updatedBy.kind, 80),
          agentId: roomWorkText(source.updatedBy.agentId, 200),
          agentName: roomWorkText(source.updatedBy.agentName, 300),
        }
      : null,
  };
}

export function mergeRoomWorkState(current, patch, issue, updatedBy = {}) {
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
    agentName: roomWorkText(updatedBy.agentName, 300),
  };
  return next;
}

export function taskReviewMode(taskState) {
  return textParam(asRecord(taskState?.review), "mode") === "manual" ? "manual" : "automatic";
}

export function newTaskRoomState(issue, roomContext, input) {
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
      updatedAt: now(),
    },
    review: {
      required: "owning_agent",
      mode: reviewMode,
      status: "not_requested",
      workerReportCommentId: null,
      updatedAt: now(),
    },
  };
}

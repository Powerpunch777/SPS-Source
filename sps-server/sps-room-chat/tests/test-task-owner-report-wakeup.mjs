import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { activeRoomProcessBlocksOwnerReport, handleTaskStatusUpdated, isSubstantiveTaskBoundaryReport, parseState, reconcileRoomProviderQuotaRetries, reconcileTaskOwnerNotificationStateForJob, reconcileTaskOwnerReportBoundaries, taskBoundaryReportKind, taskOwnerRoomResultVisibilityOutsideInvocation } = await import("../dist/worker.js");

const koreanWorkerReport = [
  "## SPS Final Report",
  "",
  "변경 요약: 구현 경로의 플레이어 이동, 적 보상, 상점 구매와 렌더 순서를 수정했습니다.",
  "주요 파일: Assets/Scripts/SoulArcherGame.cs, Assets/Scripts/SoulArcherModels.cs, Tests/Editor/SoulArcherModelsTests.cs.",
  "검증 결과: EditMode 테스트 10개가 모두 통과했고 컴파일과 Windows 빌드는 return code 0으로 끝났습니다.",
  "미검증 및 남은 위험: 전체 플레이스루와 밸런스 검토는 독립 QA에서 확인해야 합니다.",
  "다음 검토자: 손영하-CTO."
].join("\n");
assert.equal(taskBoundaryReportKind(koreanWorkerReport), "in_review");
assert.equal(isSubstantiveTaskBoundaryReport(koreanWorkerReport, "in_review"), true);

const interruptedOwnerState = {
  ownerNotification: {
    status: "working",
    jobId: "owner-report-job",
    reportCommentId: "worker-report-comment"
  }
};
assert.equal(reconcileTaskOwnerNotificationStateForJob(interruptedOwnerState, {
  id: "owner-report-job",
  taskIssueId: "task-1",
  kind: "task_owner_report",
  status: "interrupted",
  error: "Plugin worker restarted."
}), true);
assert.equal(interruptedOwnerState.ownerNotification.status, "failed");
assert.equal(interruptedOwnerState.ownerNotification.error, "Plugin worker restarted.");

assert.equal(activeRoomProcessBlocksOwnerReport({
  pendingTurn: null,
  runtime: { activity: { status: "completed" } }
}, null, Promise.resolve()), false);
assert.equal(activeRoomProcessBlocksOwnerReport({
  pendingTurn: { kind: "task_owner_report", jobId: "active-owner-job" },
  runtime: { activity: { status: "working" } }
}, null, Promise.resolve()), true);

const companyId = "company-owner-report";
const projectId = "project-owner-report";
const ownerRoomId = "room-designer";
const taskId = "task-art";
const workerId = "agent-image-worker";
const owner = {
  id: "agent-designer",
  name: "Designer",
  role: "designer",
  status: "idle",
  adapterType: "test_local",
  adapterConfig: { cwd: process.cwd() }
};
const ownerRoom = {
  id: ownerRoomId,
  companyId,
  projectId,
  title: owner.name,
  status: "todo",
  parentId: null,
  assigneeAgentId: null,
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: `project:${projectId}:agent-room:${owner.id}`
};
const task = {
  id: taskId,
  identifier: "CMP-200",
  companyId,
  projectId,
  parentId: ownerRoomId,
  title: "Create character sheet",
  description: "Create the approved character sheet.\n\nAcceptance Criteria:\n- PNG exists.",
  status: "in_progress",
  assigneeAgentId: workerId
};
const taskState = {
  version: 1,
  kind: "task_room",
  taskIssueId: taskId,
  projectId,
  originatingRoomIssueId: ownerRoomId,
  owningAgentId: owner.id,
  owningAgentName: owner.name,
  owningAgentRole: owner.role,
  workerAgentId: workerId,
  taskType: "art",
  declaredAffectedPaths: ["References/Art/"],
  designReferences: ["Design/ArtBrief.md"],
  acceptanceCriteria: ["PNG exists."],
  verification: ["Inspect PNG dimensions."],
  dependencyTaskIds: [],
  review: { required: "owning_agent", status: "not_requested", workerReportCommentId: null, updatedAt: new Date().toISOString() }
};
const roomState = {
  version: 3,
  kind: "agent_room",
  roomIssueId: ownerRoomId,
  projectId,
  agentId: owner.id,
  agentName: owner.name,
  agentRole: owner.role,
  workingDirectory: process.cwd(),
  workspace: { projectWorkspaceId: "workspace-owner-report", name: "Design repository", kind: "design", boundAt: new Date().toISOString() },
  runtime: { kind: "codex_app_server", codexThreadId: "thread-designer", model: null, updatedAt: null, activity: { status: "idle", steps: [] } },
  checkpoint: { version: 0, summary: null, sourceCommentId: null, createdAt: null, compactedAt: null },
  pendingTurn: null
};

const documents = new Map([
  [`${ownerRoomId}:ROOM_STATE`, { latestRevisionId: "room-rev-1", body: `${JSON.stringify(roomState)}\n` }],
  [`${taskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-1", body: `${JSON.stringify(taskState)}\n` }]
]);
const comments = new Map([
  [taskId, [{
    id: "title-only-report",
    authorAgentId: workerId,
    body: "[Image Worker Final Report]",
    createdAt: "2026-07-13T00:00:00.000Z"
  }]],
  [ownerRoomId, []]
]);
const entities = new Map();
const issues = new Map([[ownerRoomId, ownerRoom], [taskId, task]]);
const originalFetch = globalThis.fetch;
let ownerPrompt = "";
const nativeSessions = [];
let simulateOwnerVerification = false;
let ownerCompletionDelayMs = 40;
const testWarnings = [];

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = new URL(String(url));
  const method = String(init.method || "GET").toUpperCase();
  if (requestUrl.pathname === "/api/companies" && method === "GET") {
    return new Response(JSON.stringify([{ id: companyId, name: "Owner Report Test Company" }]), { status: 200 });
  }
  const companyIssuesMatch = decodeURIComponent(requestUrl.pathname).match(/^\/api\/companies\/([^/]+)\/issues$/);
  if (companyIssuesMatch && method === "GET") {
    const status = requestUrl.searchParams.get("status");
    const offset = Number.parseInt(requestUrl.searchParams.get("offset") || "0", 10);
    const limit = Number.parseInt(requestUrl.searchParams.get("limit") || "500", 10);
    const rows = [...issues.values()]
      .filter((issue) => issue.companyId === companyIssuesMatch[1] && (!status || issue.status === status))
      .slice(offset, offset + limit);
    return new Response(JSON.stringify(rows), { status: 200 });
  }
  const commentMatch = decodeURIComponent(requestUrl.pathname).match(/^\/api\/issues\/([^/]+)\/comments$/);
  if (commentMatch && method === "POST") {
    const payload = JSON.parse(String(init.body));
    const issueComments = comments.get(commentMatch[1]) ?? [];
    const item = {
      id: `comment-${issueComments.length + 1}`,
      body: payload.body,
      createdAt: new Date().toISOString()
    };
    comments.set(commentMatch[1], [...issueComments, item]);
    return new Response(JSON.stringify(item), { status: 201 });
  }
  const match = decodeURIComponent(requestUrl.pathname).match(/^\/api\/issues\/([^/]+)\/documents\/([^/]+)$/);
  if (!match) throw new Error(`Unexpected Paperclip request: ${method} ${requestUrl}`);
  const key = `${match[1]}:${match[2]}`;
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
  throw new Error(`Unexpected Paperclip request: ${method} ${requestUrl}`);
};

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, enableAgyRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async (issueId) => issues.get(issueId) ?? null,
    update: async (issueId, patch) => {
      Object.assign(issues.get(issueId), patch);
      return issues.get(issueId);
    },
    listComments: async (issueId) => comments.get(issueId) ?? [],
    createComment: async (issueId, body) => {
      const item = { id: `comment-${(comments.get(issueId) ?? []).length + 1}`, body, createdAt: new Date().toISOString() };
      comments.set(issueId, [...(comments.get(issueId) ?? []), item]);
      return item;
    },
    documents: { get: async (issueId, key) => documents.get(`${issueId}:${key}`) ?? null }
  },
  agents: {
    get: async (agentId) => agentId === owner.id ? owner : null,
    sessions: {
      list: async () => nativeSessions,
      create: async (_agentId, _companyId, options) => {
        const session = {
          sessionId: "session-owner-report", agentId: owner.id, companyId, status: "active", createdAt: new Date().toISOString(),
          context: options.context, lastRunId: null, lastError: null
        };
        nativeSessions.push(session);
        return session;
      },
      close: async () => {},
      sendMessage: async (_sessionId, _companyId, options) => {
        ownerPrompt = options.prompt;
        const runId = `run-owner-report-${Date.now()}`;
        setTimeout(() => {
          const shouldVerify = simulateOwnerVerification;
          if (shouldVerify) {
            const key = `${taskId}:TASK_ROOM_STATE`;
            const verifiedState = parseState(documents.get(key).body);
            verifiedState.review = {
              ...verifiedState.review,
              status: "owner_verified",
              verifiedByAgentId: owner.id,
              verifiedAt: new Date().toISOString()
            };
            documents.set(key, { latestRevisionId: "task-rev-owner-verified", body: `${JSON.stringify(verifiedState)}\n` });
            task.status = "done";
            simulateOwnerVerification = false;
          }
          options.onEvent({
          sessionId: "session-owner-report", runId, seq: 1, eventType: "done", stream: "system", message: "Run completed",
          payload: {
            status: "succeeded",
            resultJson: {
              summary: shouldVerify
                ? "CMP-200 산출물을 수락했습니다.\nThe Task was approved."
                : "CMP-200 산출물과 검증 기록을 확인했습니다. 수락 기준 충족 여부를 검토했습니다."
            }
          }
          });
        }, ownerCompletionDelayMs);
        return { runId };
      }
    }
  },
  projects: { listWorkspaces: async () => [{ id: "workspace-owner-report", name: "Design repository", path: process.cwd(), isPrimary: true }] },
  entities: {
    upsert: async (record) => {
      const stored = { ...record, data: record.data };
      entities.set(record.externalId, stored);
      return stored;
    },
    list: async ({ scopeId } = {}) => [...entities.values()].filter((record) => !scopeId || record.scopeId === scopeId)
  },
  streams: { open: () => {}, emit: () => {} },
  logger: { error: () => {}, warn: (...args) => testWarnings.push(args) }
};

const titleOnly = await handleTaskStatusUpdated(ctx, {
  eventId: "event-title-only-report",
  eventType: "issue.comment.created",
  occurredAt: "2026-07-13T00:00:01.000Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_progress", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(titleOnly.normalized, undefined);
assert.equal(titleOnly.reason, "awaiting_substantive_worker_report");
assert.equal(comments.get(ownerRoomId).length, 0);

const workerReport = {
  id: "worker-report",
  authorAgentId: workerId,
  body: [
    "## SPS Final Report",
    "",
    "Changed paths: References/Art/hero.png and References/Art/README.md.",
    "Outputs: a 32x32 PNG character sheet and its documented palette.",
    "Verification: inspected dimensions, alpha channel, and palette membership; all checks passed.",
    "Remaining risks: visual review is still required before user acceptance.",
    "Next reviewer: Designer."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:02.000Z"
};
comments.set(taskId, [...comments.get(taskId), workerReport]);

const disposition = await handleTaskStatusUpdated(ctx, {
  eventId: "event-substantive-report-without-status-change",
  eventType: "issue.comment.created",
  occurredAt: "2026-07-13T00:00:02.100Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_progress", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(disposition.normalized, true);
assert.equal(disposition.reason, "substantive_worker_report_requires_disposition");
assert.equal(disposition.followUpReason, undefined);
assert.equal(disposition.scheduled, true);
assert.equal(disposition.status, "in_review");
assert.equal(disposition.reportCommentId, workerReport.id);
assert.equal(task.status, "in_review");

const result = await handleTaskStatusUpdated(ctx, {
  eventId: "event-substantive-report-dispositioned",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:02.200Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(result.scheduled, false);
assert.equal(result.reason, "worker_report_in_progress");
const concurrentDuplicate = await handleTaskStatusUpdated(ctx, {
  eventId: "event-substantive-report-concurrent-duplicate",
  eventType: "issue.comment.created",
  occurredAt: "2026-07-13T00:00:02.250Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_review" }, agentId: workerId }
});
assert.equal(concurrentDuplicate.scheduled, false);
assert.equal(concurrentDuplicate.reason, "worker_report_in_progress");
await disposition.completion;
ownerCompletionDelayMs = 0;

const ownerComments = comments.get(ownerRoomId);
assert.equal(ownerComments.length, 1);
assert.match(ownerComments.at(-1).body, /수락 기준 충족 여부/);
assert.match(ownerPrompt, /AUTOMATIC TASK OWNER REPORT/);
assert.match(ownerPrompt, /Changed paths: References\/Art\/hero\.png/);
assert.match(ownerPrompt, /paperclip\.complete_task/i);
assert.match(ownerPrompt, /technical completion decision/);
assert.match(ownerPrompt, /Never say that you approved or accepted/);
assert.equal([...entities.values()].some((record) => record.data.kind === "task_owner_report" && record.status === "working"), true);
const savedTaskState = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
assert.equal(savedTaskState.review.status, "owner_review_requested");
assert.equal(savedTaskState.review.workerReportCommentId, workerReport.id);
assert.equal(savedTaskState.ownerNotification.status, "completed");
assert.equal(savedTaskState.ownerNotification.reportCommentId, workerReport.id);

const mismatchedLaterBlocker = {
  id: "worker-report-later-mismatched-blocker",
  authorAgentId: workerId,
  body: [
    "## SPS Blocker Report",
    "",
    "Blocker: a duplicate wake cannot access the already completed run context.",
    "Impact: this later duplicate run cannot add evidence to the submitted final result.",
    "Evidence: the Task is already in_review with a substantive Final Report.",
    "Next action: keep the explicit in_review boundary and review the matching Final Report."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:02.500Z"
};
comments.set(taskId, [...comments.get(taskId), mismatchedLaterBlocker]);
const mismatchedLaterBoundary = await handleTaskStatusUpdated(ctx, {
  eventId: "event-mismatched-later-blocker",
  eventType: "issue.comment.created",
  occurredAt: "2026-07-13T00:00:02.600Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_review" }, agentId: workerId }
});
assert.equal(mismatchedLaterBoundary.scheduled, false);
assert.equal(mismatchedLaterBoundary.reason, "duplicate_worker_report");
assert.equal(task.status, "in_review");

const duplicateReport = { ...workerReport, id: "worker-report-duplicate", createdAt: "2026-07-13T00:00:03.000Z" };
comments.set(taskId, [...comments.get(taskId), duplicateReport]);
const duplicate = await handleTaskStatusUpdated(ctx, {
  eventId: "event-duplicate-worker-report",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:03.100Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_review" }, agentId: workerId }
});
assert.equal(duplicate.scheduled, false);
assert.equal(duplicate.reason, "duplicate_worker_report");

const correctionState = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
correctionState.reviewHistory = [{
  outcome: "correction_requested",
  workerReportCommentId: workerReport.id,
  workerReportFingerprint: correctionState.review.workerReportFingerprint,
  ownerNotificationStatus: correctionState.ownerNotification.status,
  ownerNotificationResultCommentId: correctionState.ownerNotification.resultCommentId,
  closedAt: "2026-07-13T00:00:03.200Z"
}];
correctionState.review = {
  required: "owning_agent",
  status: "owner_review_requested",
  correctionRound: 1,
  feedbackCommentId: "owner-feedback-1",
  feedbackByAgentId: owner.id,
  feedbackByAgentName: owner.name,
  updatedAt: "2026-07-13T00:00:03.200Z"
};
delete correctionState.ownerNotification;
documents.set(`${taskId}:TASK_ROOM_STATE`, {
  latestRevisionId: "task-rev-correction-1",
  body: `${JSON.stringify(correctionState)}\n`
});
const activeCorrectionState = structuredClone(correctionState);
activeCorrectionState.review.status = "correction_requested";
documents.set(`${taskId}:TASK_ROOM_STATE`, {
  latestRevisionId: "task-rev-active-correction-1",
  body: `${JSON.stringify(activeCorrectionState)}\n`
});
const correctionVisibility = await taskOwnerRoomResultVisibilityOutsideInvocation({
  apiUrl: "http://127.0.0.1:3100",
  task,
  expectedStatus: "in_review"
});
assert.equal(correctionVisibility.publish, false);
assert.equal(correctionVisibility.reason, "task_feedback_continues_in_task_room");
documents.set(`${taskId}:TASK_ROOM_STATE`, {
  latestRevisionId: "task-rev-correction-1",
  body: `${JSON.stringify(correctionState)}\n`
});
task.status = "in_review";
const staleAfterFeedback = await handleTaskStatusUpdated(ctx, {
  eventId: "event-stale-report-after-feedback",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:03.250Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "todo" }, agentId: workerId }
});
assert.equal(staleAfterFeedback.scheduled, false);
assert.equal(staleAfterFeedback.reason, "awaiting_substantive_worker_report");
const correctionBlocker = {
  id: "worker-correction-blocker",
  authorAgentId: workerId,
  body: [
    "## SPS Blocker Report",
    "",
    "Blocker: the correction source cannot be read by the assigned runtime.",
    "Impact: the requested outline correction cannot be verified or completed.",
    "Evidence: the approved reference path is unavailable in the current Workspace.",
    "Next action: restore the declared reference path and resume the same Worker Task."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:03.260Z"
};
comments.set(taskId, [...comments.get(taskId), correctionBlocker]);
const correctedBoundary = await handleTaskStatusUpdated(ctx, {
  eventId: "event-correction-blocker-at-review-boundary",
  eventType: "issue.comment.created",
  occurredAt: "2026-07-13T00:00:03.270Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_review" }, agentId: workerId }
});
assert.equal(correctedBoundary.scheduled, false);
assert.equal(correctedBoundary.reason, "awaiting_substantive_worker_report");
assert.equal(task.status, "in_review");
task.status = "in_progress";
const revisedReport = {
  id: "worker-report-revised",
  authorAgentId: workerId,
  body: [
    "## SPS Final Report",
    "",
    "Changed paths: References/Art/hero.png and References/Art/README.md.",
    "Outputs: corrected the 32x32 PNG outline and updated the palette documentation requested by Designer.",
    "Verification: inspected dimensions, alpha channel, palette membership, and the corrected outline; all checks passed.",
    "Remaining risks: none within the approved correction scope.",
    "Next reviewer: Designer."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:03.300Z"
};
comments.set(taskId, [...comments.get(taskId), revisedReport]);
const ownerCommentCountBeforeRevisedReport = comments.get(ownerRoomId).length;
simulateOwnerVerification = true;
const revisedDisposition = await handleTaskStatusUpdated(ctx, {
  eventId: "event-revised-report-without-status-change",
  eventType: "issue.comment.created",
  occurredAt: "2026-07-13T00:00:03.400Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_progress", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(revisedDisposition.normalized, true);
assert.equal(revisedDisposition.scheduled, true);
assert.equal(revisedDisposition.status, "in_review");
assert.equal(revisedDisposition.reportCommentId, revisedReport.id);
await revisedDisposition.completion;
for (let attempt = 0; attempt < 100; attempt += 1) {
  const current = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
  if (current?.ownerNotification?.status === "completed" && current.ownerNotification.reportCommentId === revisedReport.id) break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(comments.get(ownerRoomId).length, ownerCommentCountBeforeRevisedReport + 1);
const revisedTaskState = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
assert.equal(revisedTaskState.review.workerReportCommentId, revisedReport.id);
assert.equal(revisedTaskState.ownerNotification.reportCommentId, revisedReport.id);
assert.equal(revisedTaskState.ownerNotification.status, "completed");
assert.equal(revisedTaskState.review.status, "owner_verified");
assert.equal(revisedTaskState.reviewHistory.at(-1).outcome, "correction_requested");
assert.doesNotMatch(comments.get(ownerRoomId).at(-1).body, /승인했습니다|수락했습니다|\bapproved\b|\baccepted\b/i);
assert.match(comments.get(ownerRoomId).at(-1).body, /수락 기준 충족을 확인해 완료 처리했습니다/);
assert.match(comments.get(ownerRoomId).at(-1).body, /technically verified and marked done/);

task.status = "blocked";
comments.set(taskId, [...comments.get(taskId), {
  id: "worker-blocker-report",
  authorAgentId: workerId,
  body: [
    "## SPS Blocker Report",
    "",
    "Blocker: the required licensed source asset is unavailable in the assigned workspace.",
    "Impact: the requested export cannot be produced without substituting unapproved material.",
    "Evidence: the declared source path is absent and the design references require the original asset.",
    "Next action: Designer must provide an approved replacement source or revise the acceptance criteria."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:04.000Z"
}]);
const blocked = await handleTaskStatusUpdated(ctx, {
  eventId: "event-blocked",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:01.500Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "blocked", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(blocked.scheduled, true);
await blocked.completion;
assert.match(ownerPrompt, /The Task is blocked/);
assert.equal(parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body).review.status, "blocked_reported");

task.status = "done";
const normalized = await handleTaskStatusUpdated(ctx, {
  eventId: "event-worker-done",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:02.000Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "done", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(normalized.normalized, true);
assert.equal(task.status, "in_review");

const mismatchedOwnerState = parseState(documents.get(`${taskId}:TASK_ROOM_STATE`).body);
mismatchedOwnerState.owningAgentId = "agent-other-cto";
documents.set(`${taskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-owner-mismatch", body: `${JSON.stringify(mismatchedOwnerState)}\n` });
const ownerMismatch = await handleTaskStatusUpdated(ctx, {
  eventId: "event-owner-agent-mismatch",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:05.000Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(ownerMismatch.scheduled, false);
assert.equal(ownerMismatch.reason, "task_owner_agent_mismatch");

mismatchedOwnerState.owningAgentId = owner.id;
documents.set(`${taskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-worker-mismatch", body: `${JSON.stringify(mismatchedOwnerState)}\n` });
task.assigneeAgentId = "agent-other-worker";
const workerMismatch = await handleTaskStatusUpdated(ctx, {
  eventId: "event-worker-assignment-mismatch",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:06.000Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: taskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(workerMismatch.scheduled, false);
assert.equal(workerMismatch.reason, "task_worker_assignment_mismatch");

task.status = "done";
task.assigneeAgentId = workerId;
entities.clear();
const watchdogOwnerRoomId = "room-designer-watchdog";
const watchdogOwnerRoom = {
  ...ownerRoom,
  id: watchdogOwnerRoomId,
  originId: `project:watchdog-project:agent-room:${owner.id}`
};
const watchdogOwnerRoomState = {
  ...structuredClone(roomState),
  roomIssueId: watchdogOwnerRoomId,
  runtime: { ...structuredClone(roomState.runtime), codexThreadId: "thread-designer-watchdog" }
};
issues.set(watchdogOwnerRoomId, watchdogOwnerRoom);
documents.set(`${watchdogOwnerRoomId}:ROOM_STATE`, {
  latestRevisionId: "room-rev-watchdog",
  body: `${JSON.stringify(watchdogOwnerRoomState)}\n`
});
comments.set(watchdogOwnerRoomId, []);
const watchdogTaskId = "task-art-watchdog";
const watchdogTask = {
  ...task,
  id: watchdogTaskId,
  identifier: "CMP-201",
  parentId: watchdogOwnerRoomId,
  title: "Recover a missed owner wake",
  status: "in_review",
  assigneeAgentId: workerId
};
const watchdogTaskState = {
  ...structuredClone(taskState),
  taskIssueId: watchdogTaskId,
  originatingRoomIssueId: watchdogOwnerRoomId,
  review: { required: "owning_agent", status: "not_requested", workerReportCommentId: null, updatedAt: new Date().toISOString() }
};
issues.set(watchdogTaskId, watchdogTask);
documents.set(`${watchdogTaskId}:TASK_ROOM_STATE`, {
  latestRevisionId: "task-rev-watchdog",
  body: `${JSON.stringify(watchdogTaskState)}\n`
});
comments.set(watchdogTaskId, [{
  id: "worker-report-watchdog",
  authorAgentId: workerId,
  body: [
    "## SPS Final Report",
    "",
    "Changed paths: References/Art/watchdog.png.",
    "Outputs: recreated the approved test sprite.",
    "Verification: checked PNG dimensions and alpha channel; all checks passed.",
    "Remaining risks: visual review is required.",
    "Next reviewer: Designer."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:07.000Z"
}]);
const watchdogOwnerCommentCount = comments.get(watchdogOwnerRoomId).length;
const watchdog = await reconcileTaskOwnerReportBoundaries(ctx, { runId: "watchdog-test-first" });
assert.equal(watchdog.scheduled, 1, JSON.stringify({ watchdog, testWarnings }));
for (let attempt = 0; attempt < 100; attempt += 1) {
  const current = parseState(documents.get(`${watchdogTaskId}:TASK_ROOM_STATE`).body);
  if (current?.ownerNotification?.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(parseState(documents.get(`${watchdogTaskId}:TASK_ROOM_STATE`).body).ownerNotification.status, "completed");
assert.equal(comments.get(watchdogOwnerRoomId).length, watchdogOwnerCommentCount + 1);
const watchdogDuplicate = await reconcileTaskOwnerReportBoundaries(ctx, { runId: "watchdog-test-second" });
assert.equal(watchdogDuplicate.scheduled, 0);
assert.equal(comments.get(watchdogOwnerRoomId).length, watchdogOwnerCommentCount + 1);

const busyOwnerRoomId = "room-designer-busy";
const busyTaskId = "task-art-busy";
const busyJobId = "room-job-busy";
const busyOwnerRoom = {
  ...ownerRoom,
  id: busyOwnerRoomId,
  originId: `project:busy-project:agent-room:${owner.id}`
};
const busyOwnerRoomState = {
  ...structuredClone(roomState),
  roomIssueId: busyOwnerRoomId,
  pendingTurn: { kind: "room_message", jobId: busyJobId, sourceCommentId: "busy-source", startedAt: new Date().toISOString() },
  runtime: {
    ...structuredClone(roomState.runtime),
    codexThreadId: "thread-designer-busy",
    activity: { status: "working", kind: "room_message", jobId: busyJobId, steps: [] }
  }
};
const busyTask = {
  ...task,
  id: busyTaskId,
  identifier: "CMP-202",
  parentId: busyOwnerRoomId,
  title: "Retry an owner wake after the Room becomes idle",
  status: "in_review",
  assigneeAgentId: workerId
};
const busyTaskState = {
  ...structuredClone(taskState),
  taskIssueId: busyTaskId,
  originatingRoomIssueId: busyOwnerRoomId,
  review: { required: "owning_agent", status: "not_requested", workerReportCommentId: null, updatedAt: new Date().toISOString() }
};
issues.set(busyOwnerRoomId, busyOwnerRoom);
issues.set(busyTaskId, busyTask);
documents.set(`${busyOwnerRoomId}:ROOM_STATE`, { latestRevisionId: "room-rev-busy", body: `${JSON.stringify(busyOwnerRoomState)}\n` });
documents.set(`${busyTaskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-busy", body: `${JSON.stringify(busyTaskState)}\n` });
comments.set(busyOwnerRoomId, []);
comments.set(busyTaskId, [{
  id: "worker-report-busy",
  authorAgentId: workerId,
  body: [
    "## SPS Final Report",
    "",
    "Changed paths: References/Art/busy-retry.png and References/Art/README.md.",
    "Outputs: completed the approved sprite and documented the exact palette and export settings.",
    "Verification: checked dimensions, alpha, palette membership, deterministic hash, and repository scope; all checks passed.",
    "Remaining risks: visual review remains with the originating Designer Task Owner.",
    "Next reviewer: Designer."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:08.000Z"
}]);
entities.set(busyJobId, {
  entityType: "room_job",
  scopeKind: "issue",
  scopeId: busyOwnerRoomId,
  externalId: busyJobId,
  status: "working",
  data: {
    id: busyJobId,
    companyId,
    roomIssueId: busyOwnerRoomId,
    taskIssueId: null,
    kind: "room_message",
    status: "working",
    sourceCommentId: "busy-source",
    requestedAt: new Date().toISOString(),
    startedAt: new Date().toISOString()
  }
});

const busyFirstPass = await reconcileTaskOwnerReportBoundaries(ctx, { runId: "watchdog-busy-first" });
assert.equal(busyFirstPass.scheduled, 0);
assert.equal(parseState(documents.get(`${busyTaskId}:TASK_ROOM_STATE`).body).review.workerReportCommentId, null);

busyOwnerRoomState.pendingTurn = null;
busyOwnerRoomState.runtime.activity = { status: "idle", steps: [] };
documents.set(`${busyOwnerRoomId}:ROOM_STATE`, { latestRevisionId: "room-rev-busy-idle", body: `${JSON.stringify(busyOwnerRoomState)}\n` });
entities.delete(busyJobId);
const busyRetryPass = await reconcileTaskOwnerReportBoundaries(ctx, { runId: "scheduled-job-busy-retry" });
assert.equal(busyRetryPass.scheduled, 1);
for (let attempt = 0; attempt < 100; attempt += 1) {
  const current = parseState(documents.get(`${busyTaskId}:TASK_ROOM_STATE`).body);
  if (current?.ownerNotification?.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 10));
}
const retriedBusyTaskState = parseState(documents.get(`${busyTaskId}:TASK_ROOM_STATE`).body);
assert.equal(retriedBusyTaskState.review.workerReportCommentId, "worker-report-busy");
assert.equal(retriedBusyTaskState.ownerNotification.status, "completed");
assert.equal(comments.get(busyOwnerRoomId).length, 1);

const quotaOwnerRoomId = "room-designer-quota-resolved";
const quotaTaskId = "task-art-quota-resolved";
const quotaJobId = "room-job-quota-resolved";
const quotaOwnerRoom = { ...ownerRoom, id: quotaOwnerRoomId, originId: `project:quota-project:agent-room:${owner.id}` };
const quotaOwnerState = {
  ...structuredClone(roomState),
  roomIssueId: quotaOwnerRoomId,
  pendingTurn: { kind: "task_owner_report", jobId: quotaJobId, retryRuntime: "agy", retryAt: "2026-07-13T01:00:00.000Z" },
  runtime: {
    ...structuredClone(roomState.runtime),
    activity: { status: "waiting", kind: "task_owner_report", jobId: quotaJobId, steps: [] },
    quotaRetry: { status: "waiting", runtime: "agy", retryAt: "2026-07-13T01:00:00.000Z" }
  }
};
const quotaTask = { ...task, id: quotaTaskId, identifier: "CMP-203", parentId: quotaOwnerRoomId, status: "done", assigneeAgentId: workerId };
const quotaTaskState = {
  ...structuredClone(taskState),
  taskIssueId: quotaTaskId,
  originatingRoomIssueId: quotaOwnerRoomId,
  review: { required: "owning_agent", status: "owner_review_requested", updatedAt: new Date().toISOString() },
  ownerNotification: { status: "working", jobId: quotaJobId, taskStatus: "in_review" }
};
issues.set(quotaOwnerRoomId, quotaOwnerRoom);
issues.set(quotaTaskId, quotaTask);
documents.set(`${quotaOwnerRoomId}:ROOM_STATE`, { latestRevisionId: "room-rev-quota-resolved", body: `${JSON.stringify(quotaOwnerState)}\n` });
documents.set(`${quotaTaskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-quota-resolved", body: `${JSON.stringify(quotaTaskState)}\n` });
comments.set(quotaTaskId, []);
entities.set(quotaJobId, {
  entityType: "room_job",
  scopeKind: "issue",
  scopeId: quotaOwnerRoomId,
  externalId: quotaJobId,
  status: "queued",
  data: {
    id: quotaJobId,
    companyId,
    roomIssueId: quotaOwnerRoomId,
    taskIssueId: quotaTaskId,
    kind: "task_owner_report",
    status: "queued",
    requestedAt: new Date().toISOString(),
    payload: { retryRuntime: "agy", quotaRetryAt: "2026-07-13T01:00:00.000Z" }
  }
});
const resolvedQuotaRetry = await handleTaskStatusUpdated(ctx, {
  eventId: "event-user-resolved-quota-owner-report",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:30:00.000Z",
  actorType: "user",
  actorId: "local-board",
  companyId,
  entityId: quotaTaskId,
  entityType: "issue",
  payload: { status: "done", _previous: { status: "in_review" } }
});
assert.equal(resolvedQuotaRetry.reason, "resolved_task_owner_retry_cancelled");
assert.equal(entities.get(quotaJobId).status, "cancelled");
assert.equal(parseState(documents.get(`${quotaOwnerRoomId}:ROOM_STATE`).body).pendingTurn, null);
const resolvedQuotaTaskState = parseState(documents.get(`${quotaTaskId}:TASK_ROOM_STATE`).body);
assert.equal(resolvedQuotaTaskState.review.status, "user_reviewed");
assert.equal(resolvedQuotaTaskState.ownerNotification.status, "completed");

quotaOwnerState.pendingTurn = { kind: "task_owner_report", jobId: quotaJobId, retryRuntime: "agy", retryAt: "2026-07-13T02:00:00.000Z" };
quotaOwnerState.runtime.activity = { status: "waiting", kind: "task_owner_report", jobId: quotaJobId, steps: [] };
documents.set(`${quotaOwnerRoomId}:ROOM_STATE`, { latestRevisionId: "room-rev-quota-missed-event", body: `${JSON.stringify(quotaOwnerState)}\n` });
quotaTaskState.review.status = "owner_review_requested";
quotaTaskState.ownerNotification.status = "working";
documents.set(`${quotaTaskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-quota-missed-event", body: `${JSON.stringify(quotaTaskState)}\n` });
entities.set(quotaJobId, {
  entityType: "room_job",
  scopeKind: "issue",
  scopeId: quotaOwnerRoomId,
  externalId: quotaJobId,
  status: "queued",
  data: {
    id: quotaJobId,
    companyId,
    roomIssueId: quotaOwnerRoomId,
    taskIssueId: quotaTaskId,
    kind: "task_owner_report",
    status: "queued",
    requestedAt: new Date().toISOString(),
    payload: { retryRuntime: "agy", quotaRetryAt: "2026-07-13T02:00:00.000Z" }
  }
});
const missedEventReconcile = await reconcileRoomProviderQuotaRetries(ctx, { current: Date.parse("2026-07-13T01:00:00.000Z") });
assert.equal(missedEventReconcile.scanned, 1);
assert.equal(entities.get(quotaJobId).status, "cancelled");
assert.equal(parseState(documents.get(`${quotaOwnerRoomId}:ROOM_STATE`).body).pendingTurn, null);

const manualOwnerRoomId = "room-designer-manual-review";
const manualTaskId = "task-art-manual-review";
const manualOwnerRoom = { ...ownerRoom, id: manualOwnerRoomId, originId: `project:manual-review:agent-room:${owner.id}` };
const manualTask = {
  ...task,
  id: manualTaskId,
  identifier: "CMP-204",
  parentId: manualOwnerRoomId,
  title: "Leave a manual review report",
  status: "in_review",
  assigneeAgentId: workerId
};
const manualTaskState = {
  ...structuredClone(taskState),
  taskIssueId: manualTaskId,
  originatingRoomIssueId: manualOwnerRoomId,
  review: { required: "owning_agent", mode: "manual", status: "not_requested", workerReportCommentId: null, updatedAt: new Date().toISOString() }
};
issues.set(manualOwnerRoomId, manualOwnerRoom);
issues.set(manualTaskId, manualTask);
documents.set(`${manualTaskId}:TASK_ROOM_STATE`, { latestRevisionId: "task-rev-manual", body: `${JSON.stringify(manualTaskState)}\n` });
comments.set(manualOwnerRoomId, []);
comments.set(manualTaskId, [{
  id: "worker-report-manual",
  authorAgentId: workerId,
  body: [
    "## SPS Final Report",
    "",
    "Changed paths: References/Art/manual-review.png and References/Art/README.md.",
    "Outputs: created a validated asset and documented its import path.",
    "Verification: checked dimensions, alpha channel, and repository scope; all checks passed.",
    "Remaining risks: the originating Lead should inspect visual consistency before release.",
    "Next reviewer: Designer."
  ].join("\n"),
  createdAt: "2026-07-13T00:00:09.000Z"
}]);
const nativeSessionCountBeforeManualReview = nativeSessions.length;
const manualReview = await handleTaskStatusUpdated(ctx, {
  eventId: "event-manual-task-owner-review",
  eventType: "issue.updated",
  occurredAt: "2026-07-13T00:00:09.100Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: manualTaskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_progress" }, agentId: workerId }
});
assert.equal(manualReview.scheduled, false);
assert.equal(manualReview.reason, "manual_task_owner_review_pending");
assert.equal(manualReview.manualReviewRecorded, true);
assert.equal(nativeSessions.length, nativeSessionCountBeforeManualReview);
assert.equal(comments.get(manualOwnerRoomId).length, 1);
assert.match(comments.get(manualOwnerRoomId)[0].body, /awaiting manual Lead review/);
const savedManualTaskState = parseState(documents.get(`${manualTaskId}:TASK_ROOM_STATE`).body);
assert.equal(savedManualTaskState.review.mode, "manual");
assert.equal(savedManualTaskState.review.status, "owner_review_pending");
assert.equal(savedManualTaskState.ownerNotification.status, "manual_pending");
assert.ok(savedManualTaskState.ownerNotification.roomReportCommentId);
const manualDuplicate = await handleTaskStatusUpdated(ctx, {
  eventId: "event-manual-task-owner-review-duplicate",
  eventType: "issue.comment.created",
  occurredAt: "2026-07-13T00:00:09.200Z",
  actorType: "agent",
  actorId: workerId,
  companyId,
  entityId: manualTaskId,
  entityType: "issue",
  payload: { status: "in_review", _previous: { status: "in_review" }, agentId: workerId }
});
assert.equal(manualDuplicate.scheduled, false);
assert.equal(manualDuplicate.reason, "duplicate_worker_report");
assert.equal(comments.get(manualOwnerRoomId).length, 1);

globalThis.fetch = originalFetch;
console.log("PASS Worker reports wake their owning Agent Room, including scheduled reconciliation after a busy Room becomes idle");

import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomSendJob, handleRoomView, mostRecentComments, parseState, runQueuedRoomJobs, setActiveRoomJobForTest } = await import("../dist/worker.js");

const companyId = "company-job";
const roomId = "room-job";
const agent = { id: "agent-job", name: "Designer", role: "designer", status: "idle", adapterConfig: {} };
const issue = {
  id: roomId,
  title: agent.name,
  status: "todo",
  parentId: null,
  assigneeAgentId: null,
  projectId: "project-job",
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: `project:project-job:agent-room:${agent.id}`
};
const initialState = {
  version: 3,
  kind: "agent_room",
  roomIssueId: roomId,
  projectId: issue.projectId,
  agentId: agent.id,
  agentName: agent.name,
  agentRole: agent.role,
  workingDirectory: process.cwd(),
  workspace: null,
  runtime: { kind: "codex_app_server", codexThreadId: null, model: null, updatedAt: null, activity: { status: "idle", steps: [] } },
  checkpoint: { version: 0, summary: null, sourceCommentId: null, createdAt: null, compactedAt: null },
  pendingTurn: null
};
const documents = new Map([["ROOM_STATE", { latestRevisionId: "state-1", body: `${JSON.stringify(initialState)}\n` }]]);
const comments = [];
const entities = new Map();
const streamEvents = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const requestUrl = String(url);
  const method = init?.method || "GET";
  if (requestUrl.endsWith("/comments") && method === "POST") {
    const comment = { id: `comment-${comments.length + 1}`, body: JSON.parse(init.body).body };
    comments.push(comment);
    return new Response(JSON.stringify(comment), { status: 200 });
  }
  const key = decodeURIComponent(requestUrl.split("/").at(-1));
  if (method === "GET") return new Response(JSON.stringify(documents.get(key)), { status: 200 });
  const payload = JSON.parse(init.body);
  const document = { latestRevisionId: `rev-${documents.size + 1}`, body: payload.body };
  documents.set(key, document);
  return new Response(JSON.stringify(document), { status: 200 });
};

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => issue,
    listComments: async () => comments,
    createComment: async (_issueId, body) => {
      const comment = { id: `comment-${comments.length + 1}`, body };
      comments.push(comment);
      return comment;
    },
    documents: { get: async (_issueId, key) => documents.get(key) ?? null }
  },
  agents: {
    get: async () => agent,
    sessions: {
      list: async () => [],
      create: async (_agentId, _companyId, options) => ({
        sessionId: "session-job", agentId: agent.id, companyId, status: "active", createdAt: new Date().toISOString(),
        context: options.context, lastRunId: null, lastError: null
      }),
      close: async () => {},
      sendMessage: async (_sessionId, _companyId, options) => {
        setTimeout(() => options.onEvent({
          sessionId: "session-job", runId: "run-job", seq: 1, eventType: "done", stream: "system", message: "Run completed",
          payload: { status: "succeeded", resultJson: { summary: "The design request is recorded." } }
        }), 5);
        return { runId: "run-job" };
      }
    }
  },
  projects: { listWorkspaces: async () => [{ id: "workspace-job", name: "Design repository", path: process.cwd(), isPrimary: true }] },
  entities: {
    upsert: async (record) => { entities.set(record.externalId, { ...record, data: record.data }); return entities.get(record.externalId); },
    list: async () => [...entities.values()]
  },
  streams: { open: () => {}, emit: (_channel, event) => streamEvents.push(event) }
};

const result = await handleRoomSendJob(ctx, { issueId: roomId, message: "Preserve this decision." }, { actor: { type: "user" }, companyId });
assert.equal(result.ok, true);
assert.equal(result.accepted, true);
assert.equal(result.queued, true);
assert.equal(comments[0].body.includes("Preserve this decision."), true);
const firstDispatch = await runQueuedRoomJobs(ctx);
assert.equal(firstDispatch.completed, 1);
const state = parseState(documents.get("ROOM_STATE").body);
assert.equal(state.pendingTurn, null);
assert.equal(state.runtime.activity.status, "completed");
assert.equal(comments.at(-1).body.includes("design request is recorded"), true);
const view = await handleRoomView(ctx, { companyId, issueId: roomId });
assert.equal(entities.get(result.jobId).status, "completed");
assert.equal(view.jobs.find((job) => job.id === result.jobId)?.status, "completed");
assert.equal(streamEvents.some((event) => event.type === "job"), true);

setActiveRoomJobForTest(roomId, new Promise(() => {}));
const recovered = await handleRoomSendJob(ctx, { issueId: roomId, message: "Continue after the completed report." }, { actor: { type: "user" }, companyId });
assert.equal(recovered.ok, true);
assert.equal(recovered.accepted, true);
const recoveredDispatch = await runQueuedRoomJobs(ctx);
assert.equal(recoveredDispatch.completed, 1);
assert.equal(comments.some((comment) => comment.body.includes("Continue after the completed report.")), true);

const descendingHistory = Array.from({ length: 120 }, (_, index) => {
  const number = 120 - index;
  return {
    id: `history-${number}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, number)).toISOString(),
    body: `History ${number}`
  };
});
const recentHistory = mostRecentComments(descendingHistory, 100);
assert.equal(recentHistory.length, 100);
assert.equal(recentHistory[0].id, "history-21");
assert.equal(recentHistory.at(-1).id, "history-120");

globalThis.fetch = originalFetch;
console.log("PASS native Room Session is queued by the action, completed in a fresh scheduler scope, reconciles its durable job ledger, and keeps the newest comments visible");

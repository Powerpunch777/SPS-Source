import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomCompactJob, parseState, runQueuedRoomJobs } = await import("../dist/worker.js");

const companyId = "company-compact-job";
const roomId = "room-compact-job";
const agent = { id: "agent-compact-job", name: "Designer", role: "designer", status: "idle", adapterConfig: {} };
const issue = {
  id: roomId,
  title: agent.name,
  status: "todo",
  parentId: null,
  assigneeAgentId: null,
  projectId: "project-compact-job",
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: `project:project-compact-job:agent-room:${agent.id}`
};
const state = {
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
const documents = new Map([
  ["ROOM_STATE", { latestRevisionId: "state-1", body: `${JSON.stringify(state)}\n` }],
  ["ROOM_CHECKPOINTS", { latestRevisionId: "checkpoints-1", body: "[]\n" }]
]);
const entities = new Map();
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const requestUrl = String(url);
  const key = decodeURIComponent(requestUrl.split("/").at(-1));
  const method = init?.method || "GET";
  if (method === "GET") {
    const document = documents.get(key);
    return document ? new Response(JSON.stringify(document), { status: 200 }) : new Response(null, { status: 404 });
  }
  const payload = JSON.parse(init.body);
  const document = { latestRevisionId: `revision-${documents.size + 1}`, body: payload.body };
  documents.set(key, document);
  return new Response(JSON.stringify(document), { status: 200 });
};

let terminalCallback = null;

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => issue,
    documents: { get: async (_issueId, key) => documents.get(key) ?? null }
  },
  agents: {
    get: async () => agent,
    sessions: {
      list: async () => [],
      create: async (_agentId, _companyId, options) => ({
        sessionId: "session-compact-job", agentId: agent.id, companyId, status: "active", createdAt: new Date().toISOString(),
        context: options.context, lastRunId: null, lastError: null
      }),
      close: async () => {},
      sendMessage: async (_sessionId, _companyId, options) => {
        terminalCallback = options.onEvent;
        setTimeout(() => terminalCallback({
          sessionId: "session-compact-job",
          runId: "run-compact-job",
          seq: 1,
          eventType: "done",
          stream: "system",
          message: "Run completed",
          payload: { status: "succeeded", resultJson: { summary: "Goal and next action are recorded." } }
        }), 5);
        return { runId: "run-compact-job" };
      }
    }
  },
  projects: { listWorkspaces: async () => [{ id: "workspace-compact-job", name: "Design repository", path: process.cwd(), isPrimary: true }] },
  entities: {
    upsert: async (record) => { entities.set(record.externalId, { ...record, data: record.data }); return entities.get(record.externalId); },
    list: async () => [...entities.values()]
  },
  streams: { open: () => {}, emit: () => {} }
};

const result = await handleRoomCompactJob(ctx, { issueId: roomId }, { actor: { type: "user" }, companyId });
assert.equal(result.ok, true);
assert.equal(entities.get(result.jobId).status, "queued");
const dispatch = await runQueuedRoomJobs(ctx);
assert.equal(dispatch.completed, 1);
const finalState = parseState(documents.get("ROOM_STATE").body);
assert.equal(finalState.pendingTurn, null);
assert.equal(finalState.runtime.activity.status, "completed");
assert.equal(finalState.checkpoint.summary, "Goal and next action are recorded.");
assert.equal(finalState.checkpoint.compactedAt, null);
assert.equal(finalState.runtime.activity.checkpointOnly, true);
assert.equal(parseState(documents.get("ROOM_CHECKPOINTS").body).length, 1);

globalThis.fetch = originalFetch;
console.log("PASS native Room checkpoint is queued by the action and completes in a fresh scheduler scope");

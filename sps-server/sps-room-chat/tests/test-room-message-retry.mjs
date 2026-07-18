import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomSendJob } = await import("../dist/worker.js");

const companyId = "company-retry";
const roomId = "room-retry";
const originalCommentId = "comment-original";
const agent = { id: "agent-retry", name: "Designer", role: "designer", status: "idle", adapterConfig: {} };
const issue = {
  id: roomId,
  title: agent.name,
  status: "todo",
  parentId: null,
  assigneeAgentId: null,
  projectId: "project-retry",
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: `project:project-retry:agent-room:${agent.id}`
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
  runtime: { kind: "codex_app_server", codexThreadId: null, model: null, updatedAt: null, activity: { status: "idle", steps: [] } },
  checkpoint: { version: 0, summary: null, sourceCommentId: null, createdAt: null, compactedAt: null },
  pendingTurn: null
};
const documents = new Map([["ROOM_STATE", { latestRevisionId: "state-1", body: `${JSON.stringify(initialState)}\n` }]]);
const comments = [{ id: originalCommentId, body: "**User**\nOriginal request" }];
const entities = new Map();
let turnInput = "";
let actionCompleted = false;
let postActionDocumentReads = 0;
let postActionStreamEvents = 0;
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = String(url);
  const method = init.method || "GET";
  if (requestUrl.endsWith("/comments") && method === "POST") {
    const comment = { id: `comment-${comments.length + 1}`, body: JSON.parse(init.body).body };
    comments.push(comment);
    return new Response(JSON.stringify(comment), { status: 200 });
  }
  const key = decodeURIComponent(requestUrl.split("/").at(-1));
  if (method === "GET") return new Response(JSON.stringify(documents.get(key)), { status: 200 });
  const payload = JSON.parse(init.body);
  const document = { latestRevisionId: `revision-${documents.size + 1}`, body: payload.body };
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
    documents: {
      get: async (_issueId, key) => {
        if (actionCompleted) postActionDocumentReads += 1;
        return documents.get(key) ?? null;
      }
    }
  },
  agents: {
    get: async () => agent,
    sessions: {
      list: async () => [],
      create: async (_agentId, _companyId, options) => ({
        sessionId: "session-retry", agentId: agent.id, companyId, status: "active", createdAt: new Date().toISOString(),
        context: options.context, lastRunId: null, lastError: null
      }),
      close: async () => {},
      sendMessage: async (_sessionId, _companyId, options) => {
        turnInput = options.prompt;
        setTimeout(() => {
          options.onEvent({ sessionId: "session-retry", runId: "run-retry", seq: 1, eventType: "chunk", stream: "system", message: "Checking the revision.", payload: { eventType: "reasoning", lastAssistantSnippet: "Checking the revision." } });
          options.onEvent({ sessionId: "session-retry", runId: "run-retry", seq: 2, eventType: "done", stream: "system", message: "Run completed", payload: { status: "succeeded", resultJson: { summary: "Revised request recorded." } } });
        }, 5);
        return { runId: "run-retry" };
      }
    }
  },
  projects: { listWorkspaces: async () => [{ id: "workspace-retry", name: "Design repository", path: process.cwd(), isPrimary: true }] },
  entities: {
    upsert: async (record) => { entities.set(record.externalId, { ...record, data: record.data }); return entities.get(record.externalId); },
    list: async () => [...entities.values()]
  },
  streams: {
    open: () => { if (actionCompleted) postActionStreamEvents += 1; },
    emit: () => { if (actionCompleted) postActionStreamEvents += 1; }
  }
};

const result = await handleRoomSendJob(ctx, {
  issueId: roomId,
  message: "Revised request",
  retryOfCommentId: originalCommentId
}, { actor: { type: "user" }, companyId });
assert.equal(result.ok, true);
assert.match(comments.find((comment) => comment.id === result.sourceCommentId).body, new RegExp(`paperclip-room-retry-of:${originalCommentId}`));
assert.match(turnInput, /USER MESSAGE REVISION/);
assert.match(turnInput, new RegExp(originalCommentId));
actionCompleted = true;
for (let attempt = 0; attempt < 30 && !comments.some((comment) => comment.body.includes("Revised request recorded.")); attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(comments.some((comment) => comment.body.includes("Revised request recorded.")), true);
assert.equal(postActionDocumentReads, 0, "progress persistence must not use the expired action-scoped document API");
assert.equal(postActionStreamEvents, 0, "progress persistence must not emit through an expired action-scoped stream");

globalThis.fetch = originalFetch;
console.log("PASS Room retries preserve the original message and send the revised instruction as current");

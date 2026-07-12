import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomSendJob, setCodexClientForTest } = await import("../dist/worker.js");

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

setCodexClientForTest({
  openRoomThread: async () => ({ id: "thread-job" }),
  request: async (method) => {
    assert.equal(method, "turn/start");
    return { turn: { id: "turn-job" } };
  },
  waitForTurn: async () => ({ items: [{ type: "agentMessage", text: "The design request is recorded." }] })
});

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => issue,
    createComment: async (_issueId, body) => {
      const comment = { id: `comment-${comments.length + 1}`, body };
      comments.push(comment);
      return comment;
    },
    documents: { get: async (_issueId, key) => documents.get(key) ?? null }
  },
  agents: { get: async () => agent },
  entities: {
    upsert: async (record) => { entities.set(record.externalId, { ...record, data: record.data }); return entities.get(record.externalId); },
    list: async () => [...entities.values()]
  },
  streams: { open: () => {}, emit: (_channel, event) => streamEvents.push(event) }
};

const result = await handleRoomSendJob(ctx, { issueId: roomId, message: "Preserve this decision." }, { actor: { type: "user" }, companyId });
assert.equal(result.ok, true);
assert.equal(result.accepted, true);
assert.equal(comments[0].body.includes("Preserve this decision."), true);
for (let attempt = 0; attempt < 30; attempt += 1) {
  const state = JSON.parse(documents.get("ROOM_STATE").body);
  if (state.pendingTurn === null && state.runtime.activity.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
const state = JSON.parse(documents.get("ROOM_STATE").body);
assert.equal(state.pendingTurn, null);
assert.equal(state.runtime.activity.status, "completed");
assert.equal(comments.at(-1).body.includes("design request is recorded"), true);
assert.equal(entities.get(result.jobId).status, "working");
assert.equal(streamEvents.some((event) => event.type === "job"), true);

setCodexClientForTest(null);
globalThis.fetch = originalFetch;
console.log("PASS Room starts within the action scope and persists completion outside that scope");

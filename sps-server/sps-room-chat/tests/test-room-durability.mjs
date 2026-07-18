import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomSend, parseState, setCodexClientForTest } = await import("../dist/worker.js");

const companyId = "company-durability";
const roomId = "room-durability";
const agent = { id: "agent-designer", name: "Designer", role: "designer", status: "idle", adapterConfig: {} };
const initialState = {
  version: 2,
  kind: "agent_room",
  roomIssueId: roomId,
  projectId: "project-durability",
  agentId: agent.id,
  agentName: agent.name,
  agentRole: agent.role,
  workingDirectory: process.cwd(),
  runtime: { kind: "codex_app_server", codexThreadId: null, model: null, updatedAt: null },
  checkpoint: { version: 0, summary: null, sourceCommentId: null, createdAt: null, compactedAt: null },
  pendingTurn: null
};
const documents = new Map([["ROOM_STATE", { latestRevisionId: "state-1", body: `${JSON.stringify(initialState)}\n` }]]);
const comments = [];
const writes = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const key = decodeURIComponent(String(url).split("/").at(-1));
  const payload = JSON.parse(init.body);
  const updated = { latestRevisionId: `revision-${writes.length + 1}`, body: payload.body, format: payload.format };
  documents.set(key, updated);
  writes.push(parseState(payload.body));
  return new Response(JSON.stringify(updated), { status: 200 });
};

setCodexClientForTest({
  openRoomThread: async () => ({ id: "thread-durable" }),
  runTurn: async ({ onProgress }) => {
    onProgress?.({ method: "item/started", params: { threadId: "thread-durable", turnId: "turn-durable", item: { id: "reasoning-1", type: "reasoning", summary: ["Confirm the request before continuing."] } } });
    throw new Error("simulated sudden process loss");
  }
});

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => ({
      id: roomId, title: agent.name, status: "todo", parentId: null, assigneeAgentId: null, projectId: "project-durability",
      originKind: "plugin:local.room-chat:agent-room-provisioning",
      originId: `project:project-durability:agent-room:${agent.id}`
    }),
    documents: { get: async (_issueId, key) => documents.get(key) ?? null },
    listComments: async () => comments,
    createComment: async (_issueId, body) => {
      const comment = { id: `comment-${comments.length + 1}`, createdAt: new Date().toISOString(), body };
      comments.push(comment);
      return comment;
    }
  },
  agents: { get: async () => agent }
};

const result = await handleRoomSend(ctx, { issueId: roomId, message: "Please preserve this design request." }, { actor: { type: "user" }, companyId });
assert.equal(result.ok, true);
assert.equal(result.accepted, true);
for (let attempt = 0; attempt < 20 && writes.length < 4; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(comments.length, 1);
assert.match(comments[0].body, /Please preserve this design request/);
assert.equal(writes.length, 4);
assert.equal(writes[0].runtime.codexThreadId, null);
assert.equal(writes[0].pendingTurn.kind, "room_message");
assert.equal(writes[0].pendingTurn.sourceCommentId, "comment-1");
assert.equal(writes[0].runtime.activity.status, "working");
assert.equal(writes[1].runtime.codexThreadId, "thread-durable");
assert.equal(writes[2].runtime.activity.steps.at(-1).label, "요청 분석 중");
assert.equal(writes[2].runtime.activity.steps.at(-1).summary, "Confirm the request before continuing.");
assert.equal(writes[3].runtime.activity.status, "failed");

setCodexClientForTest(null);
globalThis.fetch = originalFetch;
console.log("PASS Room preserves user message and thread ID before a failed turn");

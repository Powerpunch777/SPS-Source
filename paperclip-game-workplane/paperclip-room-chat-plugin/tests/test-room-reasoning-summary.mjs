import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomSend, setCodexClientForTest } = await import("../dist/worker.js");

const companyId = "company-reasoning";
const roomId = "room-reasoning";
const agent = { id: "agent-cto", name: "CTO", role: "cto", status: "idle", adapterConfig: {} };
const initialState = {
  version: 2,
  kind: "agent_room",
  roomIssueId: roomId,
  projectId: "project-reasoning",
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
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const key = decodeURIComponent(String(url).split("/").at(-1));
  const payload = JSON.parse(init.body);
  const updated = { latestRevisionId: `revision-${documents.size + 1}`, body: payload.body, format: payload.format };
  documents.set(key, updated);
  return new Response(JSON.stringify(updated), { status: 200 });
};

setCodexClientForTest({
  openRoomThread: async () => ({ id: "thread-reasoning" }),
  runTurn: async ({ onProgress }) => {
    onProgress?.({ method: "item/completed", params: {
      threadId: "thread-reasoning",
      turnId: "turn-reasoning",
      item: { id: "reasoning-1", type: "reasoning", summary: ["Inspect the requested constraints before replying."] }
    } });
    return { items: [{ type: "agentMessage", text: "The request is ready for review." }] };
  }
});

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => ({
      id: roomId, title: agent.name, status: "todo", parentId: null, assigneeAgentId: null, projectId: "project-reasoning",
      originKind: "plugin:local.room-chat:agent-room-provisioning",
      originId: `project:project-reasoning:agent-room:${agent.id}`
    }),
    documents: { get: async (_issueId, key) => documents.get(key) ?? null },
    createComment: async (_issueId, body) => {
      const comment = { id: `comment-${comments.length + 1}`, body };
      comments.push(comment);
      return comment;
    }
  },
  agents: { get: async () => agent }
};

const result = await handleRoomSend(ctx, { issueId: roomId, message: "Review this request." }, { actor: { type: "user" }, companyId });
assert.equal(result.accepted, true);
for (let attempt = 0; attempt < 20 && comments.length < 3; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(comments.length, 3);
assert.match(comments[0].body, /Review this request/);
assert.match(comments[1].body, /CTO/);
assert.match(comments[1].body, /Inspect the requested constraints/);
assert.match(comments[2].body, /The request is ready for review/);

setCodexClientForTest(null);
globalThis.fetch = originalFetch;
console.log("PASS Room persists public reasoning summary before the final reply");

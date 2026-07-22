import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomCompact, parseState, setCodexClientForTest } = await import("../dist/worker.js");

const companyId = "company-compact";
const roomId = "room-compact";
const agent = { id: "agent-cto", name: "Primary CTO", role: "cto", status: "idle", adapterConfig: {} };
const initialState = {
  version: 2,
  kind: "agent_room",
  roomIssueId: roomId,
  projectId: "project-compact",
  agentId: agent.id,
  agentName: agent.name,
  agentRole: agent.role,
  workingDirectory: process.cwd(),
  runtime: { kind: "codex_app_server", codexThreadId: null, model: null, updatedAt: null },
  checkpoint: { version: 0, summary: null, sourceCommentId: null, createdAt: null, compactedAt: null }
};
const documents = new Map([
  ["ROOM_STATE", { latestRevisionId: "state-1", body: `${JSON.stringify(initialState)}\n` }],
  ["ROOM_CHECKPOINTS", { latestRevisionId: "checkpoints-1", body: "[]\n" }]
]);
const writes = [];
const memoryLifecycleEvents = [];
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const key = decodeURIComponent(String(url).split("/").at(-1));
  const payload = JSON.parse(init.body);
  const updated = { latestRevisionId: `revision-${writes.length + 1}`, body: payload.body, format: payload.format };
  documents.set(key, updated);
  writes.push({ key, payload: parseState(payload.body) });
  return new Response(JSON.stringify(updated), { status: 200 });
};

const fakeClient = {
  openRoomThread: async () => ({ id: "thread-compact" }),
  runTurn: async () => ({ items: [{ type: "agentMessage", text: "Current goal: verify compact.\nNext action: review the saved checkpoint." }] }),
  compactThread: async (threadId) => ({ compacted: threadId === "thread-compact" })
};
setCodexClientForTest(fakeClient);

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => ({
      id: roomId, title: agent.name, status: "todo", parentId: null, assigneeAgentId: null, projectId: "project-compact",
      originKind: "plugin:local.room-chat:agent-room-provisioning",
      originId: `project:project-compact:agent-room:${agent.id}`
    }),
    listComments: async () => [{ id: "comment-before-compact", body: "Earlier room context" }],
    documents: { get: async (_issueId, key) => documents.get(key) ?? null }
  },
  agents: { get: async () => agent },
  memory: {
    publishLifecycle: async (event) => { memoryLifecycleEvents.push(event); }
  }
};

const result = await handleRoomCompact(ctx, { issueId: roomId }, { actor: { type: "user" }, companyId });
assert.equal(result.ok, true);
assert.equal(result.compacted, true);
assert.equal(writes.length, 4);
assert.deepEqual(writes.map((write) => write.key), ["ROOM_STATE", "ROOM_STATE", "ROOM_CHECKPOINTS", "ROOM_STATE"]);
assert.equal(writes[0].payload.pendingTurn.kind, "compact_handoff");
assert.equal(writes[0].payload.runtime.codexThreadId, "thread-compact");
assert.equal(writes[1].payload.checkpoint.compactedAt, null);
assert.equal(writes[1].payload.pendingTurn, null);
assert.equal(writes[2].payload.length, 1);
assert.equal(writes[2].payload[0].summary, "Current goal: verify compact.\nNext action: review the saved checkpoint.");
assert.equal(writes[3].payload.checkpoint.compactedAt !== null, true);
assert.equal(writes[3].payload.runtime.codexThreadId, "thread-compact");
assert.deepEqual(memoryLifecycleEvents.map((event) => event.eventType), ["room.checkpoint", "room.compacted"]);
assert.deepEqual(memoryLifecycleEvents.map((event) => event.idempotencyKey), [
  `room:${roomId}:room.checkpoint:1`,
  `room:${roomId}:room.compacted:1`
]);

setCodexClientForTest(null);
globalThis.fetch = originalFetch;
console.log("PASS Room compact writes handoff before native compact completion");

import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomSendJob, handleRoomView, parseState, setAgyClientFactoryForTest } = await import("../dist/worker.js");

const companyId = "company-agy";
const roomId = "room-agy";
const agent = {
  id: "worker-agy",
  name: "QA Worker",
  role: "qa",
  status: "idle",
  adapterType: "antigravity_local",
  adapterConfig: {
    command: "agy",
    model: "gemini-3.5-flash",
    workplane: { kind: "worker", roleId: "qa-worker" },
    env: { TEST_ROOM_ENV: { type: "plain", value: "enabled" } }
  }
};
const issue = {
  id: roomId, title: agent.name, status: "todo", parentId: null, assigneeAgentId: null, projectId: "project-agy",
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: `project:project-agy:agent-room:${agent.id}`
};
const initialState = {
  version: 3, kind: "agent_room", roomIssueId: roomId, projectId: issue.projectId,
  agentId: agent.id, agentName: agent.name, agentRole: agent.role,
  workspace: { projectWorkspaceId: "workspace-agy", name: "Agy Workspace", kind: "implementation", boundAt: "2026-07-13T00:00:00.000Z" },
  runtime: { kind: "codex_app_server", codexThreadId: null, model: null, updatedAt: null, activity: { status: "idle", steps: [] } },
  checkpoint: { version: 1, summary: "Prior QA decision.", sourceCommentId: "checkpoint-comment", createdAt: null, compactedAt: null },
  pendingTurn: null
};
const documents = new Map([["ROOM_STATE", { latestRevisionId: "state-1", body: `${JSON.stringify(initialState)}\n` }]]);
const comments = [];
const entities = new Map();
const prompts = [];
let roomRuntime = null;
let roomWorkingDirectory = null;
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
  const document = { latestRevisionId: `revision-${documents.size + 1}`, body: payload.body };
  documents.set(key, document);
  return new Response(JSON.stringify(document), { status: 200 });
};

const ctx = {
  config: { get: async () => ({ enableCodexRooms: false, enableAgyRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => issue,
    listComments: async () => comments,
    createComment: async (_issueId, body) => ({ id: `comment-${comments.push({ id: `comment-${comments.length + 1}`, body })}`, body }),
    documents: { get: async (_issueId, key) => documents.get(key) ?? null }
  },
  agents: {
    get: async () => agent,
    sessions: {
      list: async () => { throw new Error("Worker Agy Room must not open a native Agent Session."); },
      create: async () => { throw new Error("Worker Agy Room must not open a native Agent Session."); }
    }
  },
  projects: { listWorkspaces: async () => [{ id: "workspace-agy", name: "Agy Workspace", path: process.cwd(), isPrimary: true }] },
  entities: { upsert: async (record) => { entities.set(record.externalId, { ...record, data: record.data }); return entities.get(record.externalId); }, list: async () => [...entities.values()] },
  streams: { open: () => {}, emit: () => {} }
};

setAgyClientFactoryForTest(({ roomRuntime: runtime, workingDirectory }) => {
  roomRuntime = runtime;
  roomWorkingDirectory = workingDirectory;
  return {
    kind: "agy_print",
    startTurn: ({ prompt }) => {
      prompts.push(prompt);
      return {
        turnId: "agy-worker-room",
        completion: Promise.resolve({ items: [{ type: "agentMessage", text: "QA review is ready." }] })
      };
    },
    stop: () => {}
  };
});

const result = await handleRoomSendJob(ctx, { issueId: roomId, message: "Check this QA scenario." }, { actor: { type: "user" }, companyId });
assert.equal(result.ok, true);
for (let attempt = 0; attempt < 30; attempt += 1) {
  const state = parseState(documents.get("ROOM_STATE").body);
  if (state.runtime.activity.status === "completed" && state.pendingTurn === null) break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
const finalState = parseState(documents.get("ROOM_STATE").body);
assert.equal(finalState.runtime.kind, "agy_print");
assert.equal(finalState.runtime.model, "gemini-3.5-flash");
assert.equal(finalState.runtime.activity.status, "completed");
assert.equal(finalState.pendingTurn, null);
assert.match(prompts[0], /Check this QA scenario/);
assert.match(prompts[0], /LONG-LIVED WORKER ROOM BOUNDARY/);
assert.match(comments.at(-1).body, /QA review is ready/);
assert.equal(roomRuntime.sandbox, true);
assert.match(roomWorkingDirectory.replace(/\\/g, "/"), /\.sps\/workplane-room-sandboxes\//);
const roomView = await handleRoomView(ctx, { companyId, issueId: roomId });
assert.equal(roomView.runtime.kind, "agy_print");
assert.equal(roomView.runtime.model, "gemini-3.5-flash");

setAgyClientFactoryForTest(null);
globalThis.fetch = originalFetch;
console.log("PASS Agy Worker Room uses a sandboxed Room-only process and never opens a native Agent Session");

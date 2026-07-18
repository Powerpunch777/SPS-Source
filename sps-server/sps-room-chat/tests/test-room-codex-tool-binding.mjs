import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { handleRoomSendJob, parseState, setCodexClientForTest } = await import("../dist/worker.js");

const companyId = "company-codex-tools";
const projectId = "project-codex-tools";
const roomId = "room-codex-tools";
const instructionsDirectory = await mkdtemp(path.join(os.tmpdir(), "paperclip-room-instructions-"));
const instructionsPath = path.join(instructionsDirectory, "AGENTS.md");
await writeFile(instructionsPath, "<!-- PAPERCLIP ROLE: cto -->\nOwn technical architecture and runtime verification.\n", "utf8");
const agent = {
  id: "agent-codex-tools",
  name: "CTO",
  role: "cto",
  status: "idle",
  adapterType: "codex_local",
  adapterConfig: { model: "gpt-test", modelReasoningEffort: "xhigh", instructionsFilePath: instructionsPath }
};
const issue = {
  id: roomId,
  title: agent.name,
  status: "todo",
  parentId: null,
  assigneeAgentId: null,
  projectId,
  originKind: "plugin:local.room-chat:agent-room-provisioning",
  originId: `project:${projectId}:agent-room:${agent.id}`
};
const initialState = {
  version: 3,
  kind: "agent_room",
  roomIssueId: roomId,
  projectId,
  agentId: agent.id,
  agentName: agent.name,
  agentRole: agent.role,
  workspace: null,
  runtime: { kind: "paperclip_agent_session", agentSessionId: null, codexThreadId: null, model: null, updatedAt: null, activity: { status: "idle", steps: [] } },
  checkpoint: { version: 0, summary: null, sourceCommentId: null, createdAt: null, compactedAt: null },
  pendingTurn: null
};
const documents = new Map([["ROOM_STATE", { latestRevisionId: "state-1", body: JSON.stringify(initialState) }]]);
const comments = [
  {
    id: "historic-user",
    createdAt: "2026-07-13T11:05:23.020Z",
    body: "**User**\nRetry the deleted CMP-158 verification Task."
  },
  {
    id: "historic-designer",
    createdAt: "2026-07-13T11:06:30.427Z",
    body: "**CTO**\nCMP-158 was blocked because the assigned Worker reached its quota."
  }
];
const entities = new Map();
const originalFetch = globalThis.fetch;
const openedThreads = [];
const startedTurns = [];

globalThis.fetch = async (url, init = {}) => {
  const requestUrl = String(url);
  const method = String(init.method || "GET").toUpperCase();
  if (requestUrl.endsWith("/comments") && method === "POST") {
    const comment = { id: `comment-${comments.length + 1}`, createdAt: new Date().toISOString(), body: JSON.parse(init.body).body };
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
  openRoomThread: async (options) => {
    const id = options.threadId || (openedThreads.length === 0 ? "thread-codex-tools" : "thread-codex-tools-rotated");
    openedThreads.push(options);
    return { id };
  },
  startTurn: async (options) => {
    startedTurns.push(options);
    options.onProgress?.({
      method: "item/completed",
      params: {
        threadId: options.threadId,
        turnId: "turn-codex-tools",
        item: { id: "tool-step", type: "dynamicToolCall" }
      }
    });
    return {
      turnId: "turn-codex-tools",
      completion: Promise.resolve({ items: [{ type: "agentMessage", text: "The Room tool path is active." }] })
    };
  }
});

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, enableTaskAssignment: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: {
    get: async () => issue,
    listComments: async () => comments,
    createComment: async (_issueId, body) => {
      const comment = { id: `comment-${comments.length + 1}`, createdAt: new Date().toISOString(), body };
      comments.push(comment);
      return comment;
    },
    documents: { get: async (_issueId, key) => documents.get(key) ?? null }
  },
  agents: {
    get: async () => agent,
    sessions: {
      list: async () => { throw new Error("Codex Room must not use the generic Agent Session path."); }
    }
  },
  projects: {
    listWorkspaces: async () => [{ id: "workspace-codex-tools", name: "Implementation", path: process.cwd(), isPrimary: true }]
  },
  entities: {
    upsert: async (record) => {
      const stored = { ...record, data: record.data };
      entities.set(record.externalId, stored);
      return stored;
    },
    list: async () => [...entities.values()]
  },
  streams: { open: () => {}, emit: () => {} }
};

const result = await handleRoomSendJob(
  ctx,
  { issueId: roomId, message: "Create work only through the Room tools." },
  { actor: { type: "user" }, companyId }
);
assert.equal(result.ok, true);
assert.ok(openedThreads[0]);
const toolNames = openedThreads[0].dynamicTools[0].tools.map((tool) => tool.name);
assert.ok(toolNames.includes("create_task"));
assert.ok(toolNames.includes("start_task"));
assert.ok(toolNames.includes("post_task_feedback"));
assert.ok(toolNames.includes("complete_task"));
assert.ok(toolNames.includes("update_room_work_state"));
assert.match(openedThreads[0].developerInstructions, /Use the provided SPS tools/);
assert.match(openedThreads[0].developerInstructions, /current explicit user request/);
assert.ok(startedTurns[0]);
assert.match(startedTurns[0].input[0].text, /ROOM CONTEXT RECOVERY FROM SPS/);
assert.match(startedTurns[0].input[0].text, /ROOM OPERATING BRIEF/);
assert.match(startedTurns[0].input[0].text, /CMP-158 was blocked because the assigned Worker reached its quota/);
assert.match(startedTurns[0].input[0].text, /CURRENT TURN REQUEST:\nCreate work only through the Room tools/);
assert.equal(startedTurns[0].effort, "xhigh");
assert.equal(startedTurns[0].summary, "auto");

for (let attempt = 0; attempt < 30; attempt += 1) {
  const state = parseState(documents.get("ROOM_STATE").body);
  if (state.pendingTurn === null && state.runtime.activity.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
const finalState = parseState(documents.get("ROOM_STATE").body);
assert.equal(finalState.runtime.kind, "codex_app_server");
assert.equal(finalState.runtime.codexThreadId, "thread-codex-tools");
assert.equal(finalState.runtime.contextHydratedThreadId, "thread-codex-tools");
assert.equal(finalState.runtime.contextHydratedThroughCommentId, "historic-designer");
assert.equal(finalState.pendingTurn, null);
assert.equal(finalState.runtime.activity.status, "completed");
assert.match(comments.at(-1).body, /Room tool path is active/);

const secondResult = await handleRoomSendJob(
  ctx,
  { issueId: roomId, message: "Continue without repeating the recovery transcript." },
  { actor: { type: "user" }, companyId }
);
assert.equal(secondResult.ok, true);
for (let attempt = 0; attempt < 30; attempt += 1) {
  const state = parseState(documents.get("ROOM_STATE").body);
  if (state.pendingTurn === null && state.runtime.activity.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.equal(openedThreads.at(-1).threadId, "thread-codex-tools");
assert.doesNotMatch(startedTurns.at(-1).input[0].text, /ROOM CONTEXT RECOVERY FROM SPS/);
assert.match(startedTurns.at(-1).input[0].text, /ROOM OPERATING BRIEF/);
assert.match(startedTurns.at(-1).input[0].text, /Continue without repeating the recovery transcript/);

await writeFile(instructionsPath, "<!-- PAPERCLIP ROLE: cto -->\nOwn technical architecture, runtime verification, and build acceptance.\n", "utf8");
const rotatedResult = await handleRoomSendJob(
  ctx,
  { issueId: roomId, message: "Use the updated CTO role boundary." },
  { actor: { type: "user" }, companyId }
);
assert.equal(rotatedResult.ok, true);
for (let attempt = 0; attempt < 30; attempt += 1) {
  const state = parseState(documents.get("ROOM_STATE").body);
  if (state.pendingTurn === null && state.runtime.activity.status === "completed") break;
  await new Promise((resolve) => setTimeout(resolve, 5));
}
const rotatedState = parseState(documents.get("ROOM_STATE").body);
assert.equal(openedThreads.at(-1).threadId, null);
assert.match(openedThreads.at(-1).developerInstructions, /build acceptance/);
assert.equal(rotatedState.runtime.codexThreadId, "thread-codex-tools-rotated");
assert.equal(rotatedState.runtime.contextHydratedThreadId, "thread-codex-tools-rotated");
assert.equal(rotatedState.runtime.lastThreadRotation.threadId, "thread-codex-tools");
assert.equal(rotatedState.runtime.lastThreadRotation.reason, "agent_instructions_changed");
assert.match(startedTurns.at(-1).input[0].text, /ROOM CONTEXT RECOVERY FROM SPS/);

setCodexClientForTest(null);
globalThis.fetch = originalFetch;
await rm(instructionsDirectory, { recursive: true, force: true });
console.log("PASS Codex Room Jobs preserve the long-lived thread and bind Paperclip dynamic tools");

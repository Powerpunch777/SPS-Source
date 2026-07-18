import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const {
  buildRoomOperatingBrief,
  mergeRoomWorkState,
  newRoomWorkState,
  parseState,
  prepareCodexRoomTurn,
  prepareNativeRoomTurn,
  serializeState,
  updateRoomWorkStateOutsideInvocation
} = await import("../dist/worker.js");

const companyId = "company-work-state";
const issue = { id: "room-work-state", projectId: "project-work-state" };
const base = newRoomWorkState(issue);
assert.equal(base.kind, "room_work_state");
assert.equal(base.waitingFor.kind, "none");

const focused = mergeRoomWorkState(base, {
  objective: "Ship the approved combat prototype.",
  phase: "Art production",
  planReferences: ["Design/ArtProductionBrief.md"],
  latestOutcome: { taskId: "task-forest", identifier: "CMP-10", status: "done", summary: "Forest tiles verified." },
  nextCandidate: { kind: "art", summary: "Produce the cave environment set.", sourceReferences: ["Design/ArtProductionBrief.md#environment"] },
  waitingFor: { kind: "user", taskId: "task-forest", detail: "Review the completed forest set." }
}, issue, { kind: "agent", agentId: "designer", agentName: "Designer" });
assert.equal(focused.revision, 1);
assert.equal(focused.nextCandidate.summary, "Produce the cave environment set.");

const waitingOnWorker = mergeRoomWorkState(focused, {
  waitingFor: { kind: "worker", taskId: "task-cave", detail: "Image Worker is producing the cave set." }
}, issue, { kind: "runtime", agentId: "designer", agentName: "Designer" });
assert.equal(waitingOnWorker.objective, focused.objective);
assert.equal(waitingOnWorker.nextCandidate.summary, focused.nextCandidate.summary);
assert.equal(waitingOnWorker.waitingFor.kind, "worker");
assert.equal(waitingOnWorker.revision, 2);

const tasks = [{
  id: "task-cave",
  identifier: "CMP-11",
  title: "Create cave environment set",
  status: "in_review",
  assigneeAgentId: "image-worker",
  updatedAt: "2026-07-15T00:00:00.000Z"
}];
const brief = buildRoomOperatingBrief(waitingOnWorker, tasks);
assert.match(brief, /OBJECTIVE: Ship the approved combat prototype/);
assert.match(brief, /CMP-11 \| in_review \| Create cave environment set/);
assert.match(brief, /NEXT CANDIDATE: art: Produce the cave environment set/);
assert.match(brief, /runtime only supplies state and enforces Task ownership/);
assert.doesNotMatch(brief, /brief continuation command such as/);

const documents = new Map([["ROOM_WORK_STATE", { body: serializeState(waitingOnWorker) }]]);
const comments = [{ id: "comment-1", createdAt: "2026-07-15T00:00:00.000Z", body: "**Designer**\nForest work completed." }];
const ctx = {
  issues: {
    documents: { get: async (_issueId, key) => documents.get(key) ?? null },
    list: async () => [{ ...tasks[0], parentId: issue.id }],
    listComments: async () => comments
  }
};
const hydratedState = { runtime: { contextHydratedThreadId: "thread-1", contextHydratedNativeSessionId: "session-1" } };
const preparedCodex = await prepareCodexRoomTurn(ctx, {
  companyId,
  issue,
  state: hydratedState,
  threadId: "thread-1",
  currentText: "Carry out the current request."
});
assert.equal(preparedCodex.hydrated, false);
assert.match(preparedCodex.text, /ROOM OPERATING BRIEF/);
assert.match(preparedCodex.text, /CURRENT TURN REQUEST:\nCarry out the current request/);

const preparedNative = await prepareNativeRoomTurn(ctx, {
  companyId,
  issue,
  state: hydratedState,
  sessionId: "session-1",
  currentText: "Review the current result."
});
assert.equal(preparedNative.hydrated, false);
assert.match(preparedNative.text, /ROOM OPERATING BRIEF/);

const recovered = await prepareCodexRoomTurn(ctx, {
  companyId,
  issue,
  state: { runtime: {}, checkpoint: { summary: "Prior checkpoint", sourceCommentId: "comment-1" } },
  threadId: "thread-2",
  currentText: "Resume after recovery."
});
assert.equal(recovered.hydrated, true);
assert.match(recovered.text, /ROOM CONTEXT RECOVERY FROM SPS/);
assert.match(recovered.text, /ROOM OPERATING BRIEF/);

const originalFetch = globalThis.fetch;
let storedDocument = null;
globalThis.fetch = async (_url, init = {}) => {
  const method = String(init.method || "GET").toUpperCase();
  if (method === "GET") {
    return storedDocument
      ? new Response(JSON.stringify(storedDocument), { status: 200 })
      : new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  }
  const payload = JSON.parse(String(init.body));
  storedDocument = { ...payload, latestRevisionId: `revision-${Date.now()}` };
  return new Response(JSON.stringify(storedDocument), { status: 200 });
};

const roomContext = {
  paperclipApiUrl: "http://127.0.0.1:3100",
  companyId,
  projectId: issue.projectId,
  issueId: issue.id,
  agentId: "designer",
  agentName: "Designer"
};
await updateRoomWorkStateOutsideInvocation(roomContext, {
  objective: "Design the game",
  nextCandidate: { summary: "Define the HUD", kind: "design", sourceReferences: ["Design/UI.md"] }
}, "Initialize test focus", { kind: "agent", agentId: "designer", agentName: "Designer" });
await updateRoomWorkStateOutsideInvocation(roomContext, {
  waitingFor: { kind: "worker", taskId: "task-ui", detail: "Document Worker is preparing the UI spec." }
}, "Record test boundary", { kind: "runtime", agentId: "designer", agentName: "Designer" });
const persisted = parseState(storedDocument.body);
assert.equal(persisted.revision, 2);
assert.equal(persisted.objective, "Design the game");
assert.equal(persisted.nextCandidate.summary, "Define the HUD");
assert.equal(persisted.waitingFor.taskId, "task-ui");
globalThis.fetch = originalFetch;

console.log("PASS Room Work State persists a compact focus bookmark and is injected on every Codex and native Room turn");

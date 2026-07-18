import assert from "node:assert/strict";

const {
  agentInstructions,
  buildAgyRoomPrompt,
  buildRoomOperatingBrief,
  roomRuntimeWithRoomSafety,
  roomWorkplaneBoundary
} = await import("../dist/worker.js");

const worker = {
  id: "worker-room-boundary",
  name: "Code Worker",
  role: "code worker",
  adapterType: "codex_local",
  adapterConfig: { workplane: { kind: "worker", roleId: "code-worker" } }
};
const lead = {
  id: "lead-room-boundary",
  name: "CTO",
  role: "cto",
  adapterType: "codex_local",
  adapterConfig: { workplane: { kind: "lead", roleId: "cto" } }
};
const hybrid = {
  id: "hybrid-room-boundary",
  name: "Technical Lead",
  role: "technical lead",
  adapterType: "codex_local",
  adapterConfig: { workplane: { kind: "hybrid", roleId: "technical-lead" } }
};

assert.match(roomWorkplaneBoundary(worker), /LONG-LIVED WORKER ROOM BOUNDARY/);
assert.match(roomWorkplaneBoundary(worker), /Lead must first create and assign a finite Task/);
assert.equal(roomWorkplaneBoundary(lead), "");
assert.equal(roomWorkplaneBoundary(hybrid), "");

assert.equal(
  roomRuntimeWithRoomSafety(worker, { kind: "codex_app_server", sandbox: "danger-full-access", approvalPolicy: "on-request" }).sandbox,
  "read-only"
);
assert.equal(roomRuntimeWithRoomSafety(worker, { kind: "agy_print", sandbox: false }).sandbox, true);
assert.equal(roomRuntimeWithRoomSafety(lead, { kind: "codex_app_server", sandbox: "workspace-write" }).sandbox, "workspace-write");
assert.equal(roomRuntimeWithRoomSafety(hybrid, { kind: "codex_app_server", sandbox: "danger-full-access" }).sandbox, "danger-full-access");

assert.match(agentInstructions({}, worker, "Execute only assigned Task contracts."), /LONG-LIVED WORKER ROOM BOUNDARY/);
assert.doesNotMatch(agentInstructions({}, lead, "Own the implementation."), /LONG-LIVED WORKER ROOM BOUNDARY/);
assert.match(buildRoomOperatingBrief({}, [], worker), /This Worker Room is for discussion and read-only context only/);
assert.doesNotMatch(buildRoomOperatingBrief({}, [], lead), /This Worker Room is for discussion and read-only context only/);

const workerPrompt = buildAgyRoomPrompt({ agent: worker, instructions: "Execute only assigned Tasks.", state: {}, text: "Please edit the project." });
const leadPrompt = buildAgyRoomPrompt({ agent: lead, instructions: "Own delivery.", state: {}, text: "Plan the next action." });
assert.match(workerPrompt, /a code worker worker in a long-lived SPS project Room/);
assert.match(workerPrompt, /LONG-LIVED WORKER ROOM BOUNDARY/);
assert.match(leadPrompt, /a cto lead in a long-lived SPS project Room/);
assert.doesNotMatch(leadPrompt, /LONG-LIVED WORKER ROOM BOUNDARY/);

console.log("PASS Worker Rooms are read-only conversations while Lead and Hybrid Rooms retain their configured execution role");

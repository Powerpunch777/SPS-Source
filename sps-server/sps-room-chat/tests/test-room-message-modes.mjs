import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const worker = await import("../dist/worker.js");
const manifest = (await import("../dist/manifest.js")).default;

assert.equal(worker.roomMessageMode, undefined);
assert.equal(worker.roomModeInstruction, undefined);
assert.doesNotMatch(worker.roomUserCommentBody("Question", [], "plan"), /paperclip-room-mode/);
assert.deepEqual(
  manifest.capabilities.filter((capability) => capability.startsWith("agent.sessions.")),
  ["agent.sessions.create", "agent.sessions.list", "agent.sessions.send", "agent.sessions.close"]
);

console.log("PASS Room exposes one role-governed message path backed by native Agent Sessions");

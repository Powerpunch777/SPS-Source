import assert from "node:assert/strict";
import {
  applyRoomActivityEvent,
  beginRoomActivity,
  createRoomActivityRuntime,
} from "../src/room-activity.js";

const state = {};
beginRoomActivity(state, "room_message", "job-1", "comment-1");
assert.equal(state.runtime.activity.steps[0].label, "요청 분석 중");

const writes = [];
const published = [];
const runtime = createRoomActivityRuntime({
  emitRoomEvent: (_ctx, _companyId, _issueId, event) => published.push(event),
  saveRoomState: async (_ctx, _companyId, _issueId, _state, summary) => { writes.push(summary); },
  saveRoomStateDurably: async () => {},
});
const reporter = runtime.roomActivityReporter({}, "company", "room", state);
reporter.report({ method: "item/started", params: { turnId: "turn-1", item: { id: "reason", type: "reasoning" } } });
reporter.report({
  method: "item/completed",
  params: { turnId: "turn-1", item: { id: "reason", type: "reasoning", summary: ["작업 범위를 확인했습니다."] } },
});
await reporter.flush();
assert.deepEqual(writes, ["Update Room activity", "Persist final Room activity"]);
assert.equal(published.length, 2);
assert.equal(state.runtime.activity.steps.at(-1).label, "요청 분석 완료");
assert.equal(state.runtime.activity.steps.at(-1).summary, "작업 범위를 확인했습니다.");

await new Promise((resolve) => setTimeout(resolve, 1_050));
assert.equal(writes.length, 2, "flush must clear the pending throttled timer");

const failedState = {};
beginRoomActivity(failedState, "room_message");
let attempts = 0;
const failingRuntime = createRoomActivityRuntime({
  emitRoomEvent: () => {},
  saveRoomState: async () => { attempts += 1; throw new Error("storage unavailable"); },
  saveRoomStateDurably: async () => { throw new Error("storage unavailable"); },
});
const failingReporter = failingRuntime.roomActivityReporter({}, "company", "room", failedState);
failingReporter.report({ method: "item/started", params: { item: { id: "tool", type: "commandExecution" } } });
await assert.doesNotReject(() => failingReporter.flush());
assert.equal(attempts, 1);

assert.equal(applyRoomActivityEvent({}, { method: "item/started", params: { item: { type: "plan" } } }), false);

console.log("Room activity throttle, flush, storage failure, and timer cleanup tests passed.");

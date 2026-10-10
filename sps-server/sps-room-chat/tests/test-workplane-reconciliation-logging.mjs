import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { workplaneReconciliationHasActivity } = await import("../dist/worker.js");

assert.equal(workplaneReconciliationHasActivity({
  roomMemorySummary: { rooms: 8, checkpointsPublished: 0, compactionsPublished: 0, failed: 0 },
  interruptedRoomJobSummary: { scanned: 20, reconciled: 0, retired: 0, failed: 0 },
  ownerSummary: { scanned: 4, scheduled: 0, healthy: 0, skipped: 4, failed: 0 },
  queuedRoomJobSummary: { scanned: 0, started: 0, completed: 0, waiting: 0, skipped: 0, failed: 0 }
}), false, "idle scans should not produce a reconciliation log");

assert.equal(workplaneReconciliationHasActivity({
  roomMemorySummary: { checkpointsPublished: 1 },
  interruptedRoomJobSummary: {},
  ownerSummary: {},
  queuedRoomJobSummary: {}
}), true, "published memory should remain visible");

assert.equal(workplaneReconciliationHasActivity({
  roomMemorySummary: {},
  interruptedRoomJobSummary: {},
  ownerSummary: { scheduled: 1 },
  queuedRoomJobSummary: {}
}), true, "scheduled owner work should remain visible");

assert.equal(workplaneReconciliationHasActivity({
  roomMemorySummary: {},
  interruptedRoomJobSummary: {},
  ownerSummary: {},
  queuedRoomJobSummary: { failed: 1 }
}), true, "reconciliation failures should remain visible");

console.log("workplane reconciliation logging tests passed");

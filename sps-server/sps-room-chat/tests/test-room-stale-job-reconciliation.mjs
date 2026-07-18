import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { reconcileInterruptedRoomJobs } = await import("../dist/worker.js");

const staleJob = {
  id: "stale-room-job",
  companyId: "company-stale-room",
  roomIssueId: "deleted-room",
  taskIssueId: null,
  kind: "room_message",
  status: "working",
  sourceCommentId: "comment-stale",
  requestedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
  completedAt: null,
  resultCommentId: null,
  error: null,
  payload: {}
};
const entities = new Map([[staleJob.id, {
  externalId: staleJob.id,
  entityType: "sps_room_job",
  scopeKind: "issue",
  scopeId: staleJob.roomIssueId,
  status: staleJob.status,
  data: staleJob
}]]);
const warnings = [];
const ctx = {
  entities: {
    list: async () => [...entities.values()],
    upsert: async (record) => {
      entities.set(record.externalId, { ...record });
      return entities.get(record.externalId);
    }
  },
  issues: {
    get: async () => null,
    documents: { get: async () => null }
  },
  logger: { warn: (...args) => warnings.push(args) }
};

const summary = await reconcileInterruptedRoomJobs(ctx);
const retired = entities.get(staleJob.id);
assert.deepEqual(summary, { scanned: 1, reconciled: 0, retired: 1, failed: 0 });
assert.equal(retired.status, "interrupted");
assert.equal(retired.data.status, "interrupted");
assert.match(retired.data.error, /no longer active/i);
assert.equal(warnings.length, 0);

console.log("PASS stale Room Jobs are retired once instead of warning on every reconciliation");

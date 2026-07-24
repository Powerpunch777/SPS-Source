import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { reconcileRoomMemoryLifecycle } = await import("../dist/worker.js");

const companyId = "company-memory-reconcile";
const projectId = "project-memory-reconcile";
const roomId = "room-memory-reconcile";
const markers = new Map();
const publications = [];

const ctx = {
  companies: { list: async () => [{ id: companyId }] },
  projects: { list: async () => [{ id: projectId }] },
  issues: {
    list: async () => [{
      id: roomId,
      projectId,
      parentId: null,
      assigneeAgentId: null,
      assigneeUserId: null,
      originKind: "plugin:local.room-chat:agent-room-provisioning",
      originId: `project:${projectId}:agent-room:agent-a`
    }],
    documents: {
      get: async () => ({
        body: JSON.stringify([{
          version: 4,
          summary: "A durable checkpoint that must not be sent to the Core lifecycle payload.",
          compactedAt: "2026-07-22T00:00:00.000Z"
        }])
      })
    }
  },
  state: {
    get: async ({ scopeKind, scopeId, stateKey }) => markers.get(`${scopeKind}:${scopeId}:${stateKey}`) ?? null,
    set: async ({ scopeKind, scopeId, stateKey }, value) => markers.set(`${scopeKind}:${scopeId}:${stateKey}`, value)
  },
  memory: {
    publishLifecycle: async (event) => { publications.push(event); }
  },
  logger: { warn: () => {} }
};

const first = await reconcileRoomMemoryLifecycle(ctx);
assert.deepEqual(first, {
  companies: 1,
  rooms: 1,
  checkpointsPublished: 1,
  compactionsPublished: 1,
  failed: 0
});
assert.deepEqual(publications.map((event) => event.eventType), ["room.checkpoint", "room.compacted"]);
assert.equal(publications.every((event) => !Object.hasOwn(event, "summary")), true);

const second = await reconcileRoomMemoryLifecycle(ctx);
assert.equal(second.checkpointsPublished, 0);
assert.equal(second.compactionsPublished, 0);
assert.equal(publications.length, 2);
console.log("PASS Room lifecycle reconciliation publishes one content-free checkpoint and compaction");

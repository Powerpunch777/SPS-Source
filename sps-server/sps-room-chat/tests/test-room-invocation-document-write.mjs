import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { parseState, saveRoomState } = await import("../dist/worker.js");

const writes = [];
const ctx = {
  issues: {
    documents: {
      async get() {
        return null;
      },
      async upsert(input) {
        writes.push(input);
        return { latestRevisionId: `revision-${writes.length}`, ...input };
      }
    }
  }
};

const state = { kind: "agent_room", durable: "SPS SDK capability write" };
await saveRoomState(ctx, "company", "room-invocation-document", state, "Persist queued Room message");

assert.equal(writes.length, 1);
assert.equal(writes[0].issueId, "room-invocation-document");
assert.equal(writes[0].key, "ROOM_STATE");
assert.equal(writes[0].companyId, "company");
assert.equal(writes[0].title, "Room state");
assert.equal(writes[0].format, "markdown");
assert.equal(writes[0].baseRevisionId, null);
assert.equal(writes[0].changeSummary, "Persist queued Room message");
assert.deepEqual(parseState(writes[0].body), state);

console.log("PASS Room action document writes use the Core capability gateway");

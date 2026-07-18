import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { parseState, saveRoomState, saveRoomStateOutsideInvocation } = await import("../dist/worker.js");

const issueId = "room-state-write-lock";
const originalFetch = globalThis.fetch;
let document = { latestRevisionId: "revision-1", body: "{}\n" };
const writes = [];
let injectExternalRevisionOnce = true;

globalThis.fetch = async (_url, init = {}) => {
  if ((init.method || "GET") === "GET") return new Response(JSON.stringify(document), { status: 200 });
  const payload = JSON.parse(init.body);
  // Model Paperclip's database commit point, where an obsolete revision loses.
  await new Promise((resolve) => setTimeout(resolve, 5));
  if (injectExternalRevisionOnce) {
    injectExternalRevisionOnce = false;
    document = { latestRevisionId: "revision-external", body: "{\"revision\":\"external\"}\n" };
    return new Response("stale revision", { status: 409 });
  }
  if (payload.baseRevisionId !== document.latestRevisionId) return new Response("stale revision", { status: 500 });
  document = {
    latestRevisionId: `revision-${writes.length + 2}`,
    body: payload.body
  };
  writes.push(parseState(payload.body));
  return new Response(JSON.stringify(document), { status: 200 });
};

const ctx = {
  config: { get: async () => ({ enableCodexRooms: true, paperclipApiUrl: "http://127.0.0.1:3100" }) },
  issues: { documents: { get: async () => document } }
};

const inActionState = { revision: "in-action" };
const completedTurnState = { revision: "outside-invocation" };
await Promise.all([
  saveRoomState(ctx, "company", issueId, inActionState, "Persist in-action Room state"),
  saveRoomStateOutsideInvocation("http://127.0.0.1:3100", issueId, completedTurnState, "Persist completed Room turn")
]);

assert.deepEqual(writes, [inActionState, completedTurnState]);
assert.deepEqual(parseState(document.body), completedTurnState);

globalThis.fetch = originalFetch;
console.log("PASS concurrent Room state writes are serialized and retried against the latest revision");

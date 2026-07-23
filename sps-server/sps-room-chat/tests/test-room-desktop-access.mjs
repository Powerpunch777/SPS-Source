import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
process.env.SPS_DESKTOP_ACCESS_TOKEN = "desktop-token-for-test";

const { parseState, saveRoomStateOutsideInvocation } = await import("../dist/worker.js");

const originalFetch = globalThis.fetch;
const observedHeaders = [];
let document = null;

globalThis.fetch = async (_url, init = {}) => {
  const headers = new Headers(init.headers);
  observedHeaders.push(headers);
  if (headers.get("x-sps-desktop-access") !== process.env.SPS_DESKTOP_ACCESS_TOKEN) {
    return new Response(JSON.stringify({ error: "desktop_access_required" }), { status: 403 });
  }
  if ((init.method || "GET") === "GET") {
    return document
      ? new Response(JSON.stringify(document), { status: 200 })
      : new Response("missing", { status: 404 });
  }
  const payload = JSON.parse(init.body);
  document = { latestRevisionId: "desktop-access-revision", body: payload.body };
  return new Response(JSON.stringify(document), { status: 200 });
};

const state = { version: 3, roomIssueId: "desktop-access-room" };
await saveRoomStateOutsideInvocation("http://127.0.0.1:31310", "desktop-access-room", state, "Verify desktop access");

assert.equal(observedHeaders.length, 2);
assert.ok(observedHeaders.every((headers) => headers.get("x-sps-desktop-access") === process.env.SPS_DESKTOP_ACCESS_TOKEN));
assert.deepEqual(parseState(document.body), state);

globalThis.fetch = originalFetch;
delete process.env.SPS_DESKTOP_ACCESS_TOKEN;
console.log("PASS Room Worker includes the ephemeral SPS Desktop access token on direct Owner Host calls");

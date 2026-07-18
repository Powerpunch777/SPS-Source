import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { parseState, recordNativeCodexCompaction, setActiveThreadContextForTest } = await import("../dist/worker.js");

const roomId = "room-native-compact";
const threadId = "thread-native-compact";
const documents = new Map();
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url, init) => {
  const requestUrl = String(url);
  const key = decodeURIComponent(requestUrl.split("/").at(-1));
  const method = init?.method || "GET";
  if (method === "GET") {
    const document = documents.get(key);
    return document ? new Response(JSON.stringify(document), { status: 200 }) : new Response(null, { status: 404 });
  }
  const payload = JSON.parse(init.body);
  const document = { latestRevisionId: `revision-${documents.size + 1}`, body: payload.body };
  documents.set(key, document);
  return new Response(JSON.stringify(document), { status: 200 });
};

setActiveThreadContextForTest(threadId, {
  companyId: "company-native-compact",
  issueId: roomId,
  projectId: "project-native-compact",
  agentId: "agent-native-compact",
  paperclipApiUrl: "http://127.0.0.1:3100"
});

const event = {
  method: "item/completed",
  params: {
    threadId,
    turnId: "turn-native-compact",
    item: { type: "contextCompaction" }
  }
};
const ctx = { logger: { warn: () => assert.fail("native compact recording should not warn") } };

assert.equal(await recordNativeCodexCompaction(ctx, event), true);
assert.equal(await recordNativeCodexCompaction(ctx, event), false);
assert.equal(await recordNativeCodexCompaction(ctx, {
  method: "thread/compacted",
  params: { threadId, turnId: "turn-native-compact-legacy-notification" }
}), true);
const records = parseState(documents.get("ROOM_NATIVE_COMPACTIONS").body);
assert.equal(records.length, 2);
assert.equal(records[0].id, `${threadId}:turn-native-compact`);
assert.equal(records[0].kind, "codex_native_auto");
assert.equal(records[1].id, `${threadId}:turn-native-compact-legacy-notification`);

setActiveThreadContextForTest(threadId, null);
globalThis.fetch = originalFetch;
console.log("PASS native Codex automatic compaction is durable and deduplicated");

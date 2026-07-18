import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServerClient, getAgentText } from "../dist/codex-app-server-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const mockServer = path.join(here, "mock-codex-app-server.mjs");
const client = new CodexAppServerClient({
  command: process.execPath,
  args: [mockServer],
  requestTimeoutMs: 3000
});

const thread = await client.openRoomThread({
  cwd: process.cwd(),
  developerInstructions: "test",
  dynamicTools: []
});
assert.equal(thread.id, "thread-1");
const progressEvents = [];
const turn = await client.runTurn({ threadId: thread.id, text: "hello", onProgress: (event) => progressEvents.push(event.method) });
assert.equal(getAgentText(turn), "mock room reply");
assert.deepEqual(progressEvents, ["turn/started", "item/started", "item/completed", "turn/completed"]);
const started = await client.startTurn({ threadId: thread.id, input: [{ type: "text", text: "streaming hello" }], effort: "xhigh", summary: "auto" });
assert.equal(started.turnId, "turn-2");
assert.equal(getAgentText(await started.completion), "mock room reply");
const stalledClient = new CodexAppServerClient({
  command: process.execPath,
  args: [mockServer],
  cwd: process.cwd(),
  turnIdleTimeoutMs: 25
});
const stalledThread = await stalledClient.openRoomThread({ cwd: process.cwd(), sandbox: "danger-full-access", approvalPolicy: "never" });
await assert.rejects(
  stalledClient.runTurn({ threadId: stalledThread.id, text: "stall forever" }),
  /turn stalled for 25ms without progress/
);
stalledClient.stop();
const compacted = await client.compactThread(thread.id);
assert.equal(compacted.compacted, true);
client.stop();
console.log("PASS codex app-server client start, turn, and native compact protocol");

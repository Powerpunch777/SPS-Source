import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodexAppServerClient, getAgentText } from "../dist/codex-app-server-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = new CodexAppServerClient({
  command: process.execPath,
  args: [path.join(here, "mock-codex-app-server.mjs")],
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
const compacted = await client.compactThread(thread.id);
assert.equal(compacted.compacted, true);
client.stop();
console.log("PASS codex app-server client start, turn, and native compact protocol");

import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { roomTools } = await import("../dist/worker.js");

const tools = roomTools().flatMap((namespace) => namespace.tools || []);
const memorySearch = tools.find((tool) => tool.name === "memory_search");
const memoryPropose = tools.find((tool) => tool.name === "memory_propose");

assert.ok(memorySearch);
assert.deepEqual(memorySearch.inputSchema.properties.scopes.items.enum, ["company", "project", "agent"]);
assert.ok(memoryPropose);
assert.equal(memoryPropose.inputSchema.required.includes("content"), true);

console.log("PASS Room dynamic tools expose approved-memory recall and candidate proposal");

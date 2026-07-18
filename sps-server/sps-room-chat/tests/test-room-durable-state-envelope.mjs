import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { parseState, serializeState } = await import("../dist/worker.js");

function normalizePaperclipMultilineText(value) {
  return value
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n");
}

const state = {
  kind: "agent_room",
  korean: "\uc7a5\uae30\uae30\uc5b5\uacfc \uc791\uc5c5 \uacbd\ub85c\ub97c \uadf8\ub300\ub85c \ubcf4\uc874\ud569\ub2c8\ub2e4.",
  progressSummary: "C:\\workspace\\tool\\new-run\nworker completed",
  nestedLog: JSON.stringify({ line: "first\nsecond", path: "C:\\room\\state" })
};

const serialized = serializeState(state);
assert.match(serialized, /^paperclip-room-json:v1:[A-Za-z0-9+/]+=*\n$/);
assert.equal(normalizePaperclipMultilineText(serialized), serialized);
assert.deepEqual(parseState(normalizePaperclipMultilineText(serialized)), state);

assert.deepEqual(parseState(`${JSON.stringify(state)}\n`), state);
assert.deepEqual(parseState(`\`\`\`json\n${JSON.stringify(state)}\n\`\`\``), state);
assert.equal(parseState("paperclip-room-json:v1:not-base64!"), null);

console.log("Room durable state envelope regression passed.");

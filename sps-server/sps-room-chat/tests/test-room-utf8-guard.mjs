import assert from "node:assert/strict";

process.env.PAPERCLIP_ROOM_CHAT_TEST = "1";
const { enforceUtf8Text, repairUtf8Mojibake } = await import("../dist/worker.js");

const mojibake = "\u00ec\u0086\u0090\u00ec\u0098\u0081\u00ed\u0095\u0098";
const korean = "\uc190\uc601\ud558";
assert.equal(repairUtf8Mojibake(mojibake), korean);
assert.equal(enforceUtf8Text(mojibake, "Room message"), korean);
assert.equal(enforceUtf8Text("plain ASCII", "Room message"), "plain ASCII");
assert.throws(
  () => enforceUtf8Text("broken \ufffd text", "Room runtime output"),
  /invalid UTF-8 replacement character and was not saved/
);

console.log("PASS Room UTF-8 guard repairs recoverable mojibake and rejects corrupted text");

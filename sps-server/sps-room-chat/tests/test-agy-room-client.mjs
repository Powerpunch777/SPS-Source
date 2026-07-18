import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { AgyRoomClient } from "../dist/agy-room-client.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = new AgyRoomClient({
  command: process.execPath,
  argsPrefix: [path.join(here, "mock-agy-room.mjs")],
  cwd: process.cwd(),
  requestTimeoutMs: 3000
});
const started = client.startTurn({ prompt: "CURRENT REQUEST:\nReturn a test reply." });
assert.match(started.turnId, /^agy-/);
const turn = await started.completion;
assert.equal(turn.items[0].type, "agentMessage");
assert.equal(turn.items[0].text, "mock agy room reply");
client.stop();

const splitUtf8Spawn = () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  setImmediate(() => {
    const output = Buffer.from("\uC548\uB155\uD558\uC138\uC694, \uC0AC\uC591 \uD655\uC778\n", "utf8");
    const splitAt = Buffer.from("\uC548\uB155\uD558\uC138\uC694, ", "utf8").length + 1;
    child.stdout.write(output.subarray(0, splitAt));
    setImmediate(() => {
      child.stdout.end(output.subarray(splitAt));
      child.stderr.end();
      setImmediate(() => child.emit("close", 0));
    });
  });
  return child;
};

const utf8Client = new AgyRoomClient({
  spawn: splitUtf8Spawn,
  cwd: process.cwd(),
  requestTimeoutMs: 3000
});
const utf8Turn = await utf8Client.startTurn({ prompt: "CURRENT REQUEST:\nReturn Korean text." }).completion;
assert.equal(utf8Turn.items[0].text, "\uC548\uB155\uD558\uC138\uC694, \uC0AC\uC591 \uD655\uC778");
assert.equal(utf8Turn.items[0].text.includes("\uFFFD"), false);
utf8Client.stop();

const invalidUtf8Spawn = () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  setImmediate(() => {
    child.stdout.end(Buffer.from([0xed, 0xa0, 0x80]));
    child.stderr.end();
    setImmediate(() => child.emit("close", 0));
  });
  return child;
};

const invalidUtf8Client = new AgyRoomClient({
  spawn: invalidUtf8Spawn,
  cwd: process.cwd(),
  requestTimeoutMs: 3000
});
await assert.rejects(
  () => invalidUtf8Client.startTurn({ prompt: "CURRENT REQUEST:\nReturn invalid bytes." }).completion,
  /invalid UTF-8 on stdout; the response was not saved/
);
invalidUtf8Client.stop();

const quotaSpawn = () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  setImmediate(() => {
    child.stdout.end();
    child.stderr.end("RESOURCE_EXHAUSTED: usage quota reached\n");
    setImmediate(() => child.emit("close", 1));
  });
  return child;
};
const quotaClient = new AgyRoomClient({ spawn: quotaSpawn, cwd: process.cwd(), requestTimeoutMs: 3000 });
const quotaError = await quotaClient.startTurn({ prompt: "CURRENT REQUEST:\nRetry later." }).completion.catch((error) => error);
assert.equal(quotaError.code, "provider_quota");
assert.equal(quotaError.errorFamily, "provider_quota");
assert.equal(quotaError.retryNotBefore, undefined);
quotaClient.stop();

let capturedLongPrompt = "";
let capturedLongArgs = [];
let capturedLongOptions = null;
const longPromptSpawn = (_command, args, options) => {
  capturedLongArgs = args;
  capturedLongOptions = options;
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  child.stdin.setEncoding("utf8");
  child.stdin.on("data", (chunk) => { capturedLongPrompt += chunk; });
  child.stdin.once("end", () => {
    child.stdout.end("long prompt accepted\n");
    child.stderr.end();
    setImmediate(() => child.emit("close", 0));
  });
  return child;
};
const longPrompt = `CURRENT REQUEST:\n${"context ".repeat(20000)}`;
const longPromptClient = new AgyRoomClient({ spawn: longPromptSpawn, cwd: process.cwd(), requestTimeoutMs: 3000 });
const longPromptTurn = await longPromptClient.startTurn({ prompt: longPrompt }).completion;
assert.equal(longPromptTurn.items[0].text, "long prompt accepted");
assert.equal(capturedLongPrompt, longPrompt);
assert.equal(capturedLongArgs.includes(longPrompt), false);
assert.deepEqual(capturedLongOptions.stdio, ["pipe", "pipe", "pipe"]);
longPromptClient.stop();

let capturedSandboxArgs = [];
const sandboxSpawn = (_command, args) => {
  capturedSandboxArgs = args;
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  setImmediate(() => {
    child.stdout.end("sandbox response\n");
    child.stderr.end();
    child.emit("close", 0);
  });
  return child;
};
const sandboxClient = new AgyRoomClient({ spawn: sandboxSpawn, cwd: process.cwd(), sandbox: true, requestTimeoutMs: 3000 });
await sandboxClient.startTurn({ prompt: "CURRENT REQUEST:\nExplain the Task scope." }).completion;
assert.ok(capturedSandboxArgs.includes("--sandbox"));
assert.equal(capturedSandboxArgs.includes("--dangerously-skip-permissions"), false);
sandboxClient.stop();

console.log("PASS Agy Room client streams long prompts over stdin, preserves split UTF-8, rejects invalid output, and classifies provider quota");

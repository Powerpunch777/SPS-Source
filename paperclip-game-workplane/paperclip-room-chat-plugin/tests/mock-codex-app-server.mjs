import readline from "node:readline";

let turn = 0;
const respond = (id, result) => process.stdout.write(`${JSON.stringify({ id, result })}\n`);
const notify = (method, params) => process.stdout.write(`${JSON.stringify({ method, params })}\n`);

readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "initialize") {
    if (request.params?.capabilities?.experimentalApi !== true) {
      return process.stdout.write(`${JSON.stringify({ id: request.id, error: { message: "thread/start.dynamicTools requires experimentalApi capability" } })}\n`);
    }
    return respond(request.id, { codexHome: "mock" });
  }
  if (request.method === "initialized") return;
  if (request.method === "thread/start") return respond(request.id, { thread: { id: "thread-1" } });
  if (request.method === "thread/resume") return respond(request.id, { thread: { id: request.params.threadId } });
  if (request.method === "turn/start") {
    const id = `turn-${++turn}`;
    const text = request.params.input?.[0]?.text?.includes("CHECKPOINT") ? "goal: test\nnext: compact" : "mock room reply";
    respond(request.id, { turn: { id } });
    notify("item/started", { threadId: request.params.threadId, turnId: id, item: { id: `reasoning-${id}`, type: "reasoning", summary: ["Review the request before replying."] } });
    notify("item/completed", { threadId: request.params.threadId, turnId: id, completedAtMs: Date.now(), item: { id: `item-${id}`, type: "agentMessage", text } });
    notify("turn/completed", { threadId: request.params.threadId, turn: { id, status: "completed" } });
    return;
  }
  if (request.method === "thread/compact/start") {
    respond(request.id, {});
    const id = `compact-${++turn}`;
    notify("item/completed", { threadId: request.params.threadId, turnId: id, completedAtMs: Date.now(), item: { id: `item-${id}`, type: "contextCompaction" } });
    notify("turn/completed", { threadId: request.params.threadId, turn: { id, status: "completed" } });
    return;
  }
  respond(request.id, {});
});

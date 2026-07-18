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
  if (request.method === "thread/start" || request.method === "thread/resume") {
    if (request.params?.sandbox !== "danger-full-access" || request.params?.approvalPolicy !== "never") {
      return process.stdout.write(`${JSON.stringify({ id: request.id, error: { message: "Room thread permissions were not forwarded" } })}\n`);
    }
    return respond(request.id, { thread: { id: request.method === "thread/start" ? "thread-1" : request.params.threadId } });
  }
  if (request.method === "turn/start") {
    if (request.params?.approvalPolicy !== "never" || request.params?.sandboxPolicy?.type !== "dangerFullAccess") {
      return process.stdout.write(`${JSON.stringify({ id: request.id, error: { message: "Room turn permissions were not forwarded" } })}\n`);
    }
    if (request.params.input?.[0]?.text === "streaming hello" && (request.params.effort !== "xhigh" || request.params.summary !== "auto")) {
      return process.stdout.write(`${JSON.stringify({ id: request.id, error: { message: "Room reasoning settings were not forwarded" } })}\n`);
    }
    const id = `turn-${++turn}`;
    if (request.params.input?.[0]?.text === "stall forever") {
      respond(request.id, { turn: { id } });
      notify("turn/started", { threadId: request.params.threadId, turnId: id });
      return;
    }
    const text = request.params.input?.[0]?.text?.includes("CHECKPOINT") ? "goal: test\nnext: compact" : "mock room reply";
    respond(request.id, { turn: { id } });
    notify("item/started", { threadId: request.params.threadId, turnId: id, item: { id: `reasoning-${id}`, type: "reasoning", summary: ["Review the request before replying."] } });
    notify("item/completed", { threadId: request.params.threadId, turnId: id, completedAtMs: Date.now(), item: { id: `item-${id}`, type: "agentMessage", text } });
    notify("turn/completed", { threadId: request.params.threadId, turn: { id, status: "completed" } });
    return;
  }
  if (request.method === "turn/interrupt") {
    respond(request.id, {});
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

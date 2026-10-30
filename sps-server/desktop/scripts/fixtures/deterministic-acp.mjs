import readline from "node:readline";

const sessionId = "sps-deterministic-session";
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

function result(id, value) {
  send({ id, result: value });
}

input.on("line", (line) => {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }
  if (request.id === undefined || typeof request.method !== "string") return;

  if (request.method === "initialize") {
    result(request.id, {
      protocolVersion: request.params?.protocolVersion ?? 1,
      agentCapabilities: {},
      authMethods: [],
      agentInfo: { name: "SPS deterministic ACP", version: "1.0.0" },
    });
    return;
  }

  if (request.method === "session/new") {
    result(request.id, { sessionId });
    return;
  }

  if (request.method === "session/prompt") {
    send({
      method: "session/update",
      params: {
        sessionId: request.params?.sessionId ?? sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Deterministic test response." },
        },
      },
    });
    result(request.id, { stopReason: "end_turn" });
    return;
  }

  if (["session/cancel", "session/close", "nes/close"].includes(request.method)) {
    result(request.id, {});
    return;
  }

  send({ id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } });
});

import readline from "node:readline";

const sessionId = "sps-deterministic-marketplace-session";
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

function result(id, value) {
  send({ id, result: value });
}

function failure(id, message) {
  send({ id, error: { code: -32602, message } });
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
      agentInfo: { name: "SPS deterministic Marketplace ACP", version: "1.0.0" },
    });
    return;
  }

  if (request.method === "session/new") {
    const mcpServers = Array.isArray(request.params?.mcpServers) ? request.params.mcpServers : [];
    if (!mcpServers.some((server) => server?.name === "sps-marketplace")) {
      failure(request.id, "The read-only SPS Marketplace MCP server was not injected.");
      return;
    }
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
          content: {
            type: "text",
            text: "Deterministic Marketplace Assistant response. Plugin lifecycle state was not changed.",
          },
        },
      },
    });
    result(request.id, { stopReason: "end_turn" });
    return;
  }

  if (request.method === "session/cancel" || request.method === "session/close" || request.method === "nes/close") {
    result(request.id, {});
    return;
  }

  send({ id: request.id, error: { code: -32601, message: `Method not found: ${request.method}` } });
});

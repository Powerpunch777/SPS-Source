import readline from "node:readline";
import { spawn } from "node:child_process";

const sessionId = "sps-deterministic-marketplace-session";
const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let marketplaceServer = null;

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

function result(id, value) {
  send({ id, result: value });
}

function failure(id, message) {
  send({ id, error: { code: -32602, message } });
}

async function searchMarketplace() {
  if (!marketplaceServer) throw new Error("The Marketplace MCP server was not initialized.");
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter((entry) => typeof entry[1] === "string"),
  );
  const injectedEnvironment = Object.fromEntries(
    (Array.isArray(marketplaceServer.env) ? marketplaceServer.env : []).map((entry) => [entry.name, entry.value]),
  );
  const child = spawn(marketplaceServer.command, Array.isArray(marketplaceServer.args) ? marketplaceServer.args : [], {
    env: { ...inheritedEnvironment, ...injectedEnvironment },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const responses = new Map();
  const output = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  output.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const pending = responses.get(message.id);
    if (!pending) return;
    responses.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message || "Marketplace MCP request failed."));
    else pending.resolve(message.result);
  });
  let requestId = 0;
  const request = (method, params) => new Promise((resolveRequest, rejectRequest) => {
    const id = ++requestId;
    const timeout = setTimeout(() => {
      responses.delete(id);
      rejectRequest(new Error(`Marketplace MCP ${method} timed out.`));
    }, 15_000);
    responses.set(id, {
      resolve(value) {
        clearTimeout(timeout);
        resolveRequest(value);
      },
      reject(error) {
        clearTimeout(timeout);
        rejectRequest(error);
      },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
  try {
    await request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "sps-deterministic-marketplace-acp", version: "1.0.0" },
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    const toolResult = await request("tools/call", {
      name: "search_marketplace_plugins",
      arguments: { q: "small team", limit: 5 },
    });
    if (toolResult.isError) throw new Error("search_marketplace_plugins returned an MCP error.");
    const text = toolResult.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (!text) throw new Error("search_marketplace_plugins returned no readable result.");
    return text;
  } catch (error) {
    if (stderr.trim()) throw new Error(`${error.message}\nMarketplace MCP stderr: ${stderr.trim()}`);
    throw error;
  } finally {
    output.close();
    child.stdin.end();
    if (child.exitCode === null) child.kill();
  }
}

input.on("line", async (line) => {
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
    marketplaceServer = mcpServers.find((server) => server?.name === "sps-marketplace") ?? null;
    if (!marketplaceServer) {
      failure(request.id, "The read-only SPS Marketplace MCP server was not injected.");
      return;
    }
    result(request.id, { sessionId });
    return;
  }

  if (request.method === "session/prompt") {
    let searchResult;
    try {
      searchResult = await searchMarketplace();
    } catch (error) {
      failure(request.id, `Marketplace MCP search failed: ${error.message}`);
      return;
    }
    send({
      method: "session/update",
      params: {
        sessionId: request.params?.sessionId ?? sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: `Deterministic Marketplace Assistant response. search_marketplace_plugins result:\n${searchResult}\nPlugin lifecycle state was not changed.`,
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

import { createPublicKey, verify } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeartbeatMessage,
  buildSignedRequestMessage,
  checkSpsNodeCommandLease,
  disconnectSpsNode,
  canonicalJson,
  claimSpsNodeCommand,
  createNodeIdentity,
  createSignedNodeRequest,
  executeSpsNodeCommand,
  startSpsDesktopAuth,
  pollSpsDesktopAuth,
  probeSpsHub,
  createSignedHeartbeat,
  listSpsCompanies,
  listSpsProjects,
  registerSpsNode,
  resolveSpsNodeExecutable,
  resolveSpsNodeInvocation,
  resolveSpsNodeWorkspace,
  scanLocalCapabilities,
  sendSpsNodeHeartbeat,
  SpsHubRequestError,
} from "../src/index.mjs";
import { createHash } from "node:crypto";
import { parseLmStudioModels, parseOllamaModels } from "../src/capability-scan.mjs";

async function startMockHub() {
  const events = [];
  const completions = [];
  const leases = [];
  const server = createServer((request, response) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { rawBody += chunk; });
    request.on("end", () => {
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (request.url?.endsWith("/lease")) {
        leases.push({ headers: request.headers, body });
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ active: true, status: "running" }));
        return;
      }
      if (request.url?.endsWith("/events")) {
        events.push({ headers: request.headers, body });
        response.statusCode = 204;
        response.end();
        return;
      }
      if (request.url?.endsWith("/complete")) {
        completions.push({ headers: request.headers, body });
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ id: "command-1", status: body.status }));
        return;
      }
      response.statusCode = 404;
      response.end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.equal(typeof address, "object");
  assert.ok(address && "port" in address);
  return {
    hubUrl: `http://127.0.0.1:${address.port}`,
    events,
    completions,
    leases,
    close: async () => await new Promise((resolve) => server.close(resolve)),
  };
}

test("generates an Ed25519 identity and signs the shared heartbeat message", () => {
  const identity = createNodeIdentity();
  const heartbeat = createSignedHeartbeat({
    identity,
    nodeId: "00000000-0000-4000-8000-000000000001",
    timestamp: "2026-07-18T00:00:00.000Z",
    nonce: "A".repeat(32),
  });
  const verified = verify(
    null,
    Buffer.from(buildHeartbeatMessage({
      nodeId: "00000000-0000-4000-8000-000000000001",
      timestamp: heartbeat.timestamp,
      nonce: heartbeat.nonce,
    }), "utf8"),
    createPublicKey(identity.publicKeyPem),
    Buffer.from(heartbeat.signature, "base64"),
  );
  assert.equal(verified, true);
});

test("signs canonical Desktop command requests without including private key material", () => {
  const identity = createNodeIdentity();
  const payload = { body: "hello", sequence: 2, stream: "stdout" };
  const request = createSignedNodeRequest({
    identity,
    nodeId: "00000000-0000-4000-8000-000000000002",
    method: "POST",
    path: "/sps-nodes/00000000-0000-4000-8000-000000000002/commands/a/events",
    payload,
    timestamp: "2026-07-18T00:00:00.000Z",
    nonce: "C".repeat(32),
  });
  const bodySha256 = createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
  const verified = verify(
    null,
    Buffer.from(buildSignedRequestMessage({
      nodeId: "00000000-0000-4000-8000-000000000002",
      method: "POST",
      path: "/sps-nodes/00000000-0000-4000-8000-000000000002/commands/a/events",
      timestamp: request.timestamp,
      nonce: request.nonce,
      bodySha256,
    }), "utf8"),
    createPublicKey(identity.publicKeyPem),
    Buffer.from(request.signature, "base64"),
  );
  assert.equal(verified, true);
  assert.equal(JSON.stringify(request).includes("privateKeyPem"), false);
});

test("publishes only capability names and versions, not executable paths", async () => {
  const capabilities = await scanLocalCapabilities({
    findCommand: (command) => ["claude", "codex", "gemini", "opencode", "pi", "ollama"].includes(command),
    readVersion: (command) => `${command} 1.2.3`,
    readModels: () => [],
  });
  assert.deepEqual(capabilities, [
    { kind: "claude_cli", label: "Claude Code", version: "claude 1.2.3" },
    { kind: "codex_cli", label: "Codex CLI", version: "codex 1.2.3" },
    { kind: "gemini_cli", label: "Gemini CLI", version: "gemini 1.2.3" },
    { kind: "opencode_cli", label: "OpenCode CLI", version: "opencode 1.2.3" },
    { kind: "pi_cli", label: "Pi CLI", version: "pi 1.2.3" },
    { kind: "ollama", label: "Ollama", version: "ollama 1.2.3" },
  ]);
  assert.equal(JSON.stringify(capabilities).includes("C:\\\\"), false);
});

test("publishes bounded local model identifiers without local filesystem paths", async () => {
  const capabilities = await scanLocalCapabilities({
    findCommand: (command) => ["ollama", "lms"].includes(command),
    readVersion: (command) => `${command} 1.2.3`,
    readModels: (command) => command === "ollama"
      ? ["qwen2.5-coder:7b", "C:\\Users\\member\\model.gguf", "qwen2.5-coder:7b"]
      : ["lmstudio-community/qwen3-4b", "/Users/member/model.gguf"],
  });
  assert.deepEqual(capabilities, [
    { kind: "ollama", label: "Ollama", version: "ollama 1.2.3", models: ["qwen2.5-coder:7b"] },
    { kind: "lm_studio", label: "LM Studio", version: "lms 1.2.3", models: ["lmstudio-community/qwen3-4b"] },
  ]);
  assert.equal(JSON.stringify(capabilities).includes("member"), false);
});

test("parses official Ollama and LM Studio model listings conservatively", () => {
  assert.deepEqual(parseOllamaModels([
    "NAME                         ID              SIZE      MODIFIED",
    "qwen2.5-coder:7b            123456          4.7 GB    2 days ago",
    "llama3.2:latest              654321          2.0 GB    1 day ago",
  ].join("\n")), ["qwen2.5-coder:7b", "llama3.2:latest"]);
  assert.deepEqual(parseLmStudioModels(JSON.stringify({
    models: [
      { modelKey: "lmstudio-community/qwen3-4b" },
      { path: "C:\\Users\\member\\private-model.gguf" },
      { name: "openai/gpt-oss-20b" },
    ],
  })), ["lmstudio-community/qwen3-4b", "openai/gpt-oss-20b"]);
});

test("prefers a Windows executable over an npm shell wrapper", async () => {
  const resolved = await resolveSpsNodeExecutable("codex", {
    platform: "win32",
    findWindowsCommand: async () => [
      "C:\\Users\\member\\AppData\\Roaming\\npm\\codex.cmd",
      "C:\\Program Files\\SPS\\codex.exe",
    ],
  });
  assert.equal(resolved, "C:\\Program Files\\SPS\\codex.exe");
});

test("runs the Codex npm wrapper through node.exe without a command shell", async () => {
  const invocation = await resolveSpsNodeInvocation("codex", ["--version"], {
    platform: "win32",
    findWindowsCommand: async (command) => command === "node.exe"
      ? ["C:\\Program Files\\nodejs\\node.exe"]
      : ["C:\\Users\\member\\AppData\\Roaming\\npm\\codex.cmd"],
    readFile: async () => 'endLocal & "%_prog%" "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*',
    fileExists: async (filePath) => filePath.endsWith("node_modules\\@openai\\codex\\bin\\codex.js"),
  });
  assert.equal(invocation.executable, "C:\\Program Files\\nodejs\\node.exe");
  assert.deepEqual(invocation.args, [
    "C:\\Users\\member\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js",
    "--version",
  ]);
});

test("runs any supported npm CLI wrapper through node.exe without a command shell", async () => {
  const invocation = await resolveSpsNodeInvocation("lms", ["chat", "qwen3"], {
    platform: "win32",
    findWindowsCommand: async (command) => command === "node.exe"
      ? ["C:\\Program Files\\nodejs\\node.exe"]
      : ["C:\\Users\\member\\AppData\\Roaming\\npm\\lms.cmd"],
    readFile: async () => 'endLocal & "%_prog%" "%dp0%\\node_modules\\@lmstudio\\cli\\bin\\lms.mjs" %*',
    fileExists: async (filePath) => filePath.endsWith("node_modules\\@lmstudio\\cli\\bin\\lms.mjs"),
  });
  assert.equal(invocation.executable, "C:\\Program Files\\nodejs\\node.exe");
  assert.deepEqual(invocation.args, [
    "C:\\Users\\member\\AppData\\Roaming\\npm\\node_modules\\@lmstudio\\cli\\bin\\lms.mjs",
    "chat",
    "qwen3",
  ]);
});

test("requires an explicit workspace mapping for every project-bound command", async () => {
  await assert.rejects(
    resolveSpsNodeWorkspace(
      { projectId: "project-1" },
      { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
    ),
    /No local workspace is configured for SPS project project-1/,
  );
});

test("uses the Node owner's project mapping instead of the default workspace", async () => {
  const projectWorkspace = process.cwd();
  const resolved = await resolveSpsNodeWorkspace(
    { projectId: "project-1" },
    {
      defaultWorkspacePath: "C:\\must-not-be-used",
      projectWorkspaces: { "project-1": projectWorkspace },
    },
  );
  assert.equal(resolved, projectWorkspace);
});

test("executes a local Node process and returns streamed output through the signed Hub protocol", async () => {
  const hub = await startMockHub();
  try {
    const result = await executeSpsNodeCommand({
      command: {
        id: "command-1",
        projectId: null,
        command: process.execPath,
        args: ["-e", "process.stdout.write('SPS node output\\n')"],
        env: {},
        stdin: null,
        lastEventSeq: 0,
      },
      hubUrl: hub.hubUrl,
      nodeId: "node-1",
      identity: createNodeIdentity(),
      accessToken: "board-token",
      profile: {
        defaultWorkspacePath: process.cwd(),
        projectWorkspaces: {},
      },
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.timedOut, false);
    assert.equal(result.workspace, process.cwd());
    assert.equal(hub.events.map((event) => event.body.body).join(""), "SPS node output\n");
    assert.equal(hub.events.every((event) => event.headers.authorization === "Bearer board-token"), true);
    assert.equal(hub.events.every((event) => typeof event.body.signature === "string"), true);
    assert.equal(hub.leases.length >= 1, true);
    assert.equal(hub.completions.length, 1);
    assert.equal(hub.completions[0]?.body.status, "succeeded");
  } finally {
    await hub.close();
  }
});

test("uses the Hub API for registration and signed heartbeats", async () => {
  const identity = createNodeIdentity();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: "node-1", status: "pending" }), { status: 201 });
  };
  await registerSpsNode({
    fetchImpl,
    hubUrl: "https://sps.example.test/",
    companyId: "company-1",
    identity,
    displayName: "Friend PC",
    platform: "Windows",
    appVersion: "0.1.0",
    capabilities: [],
  });
  await sendSpsNodeHeartbeat({
    fetchImpl,
    hubUrl: "https://sps.example.test/",
    nodeId: "node-1",
    identity,
    timestamp: "2026-07-18T00:00:00.000Z",
    nonce: "B".repeat(32),
  });
  assert.equal(requests[0].url, "https://sps.example.test/api/companies/company-1/sps-nodes");
  assert.equal(requests[1].url, "https://sps.example.test/api/sps-nodes/node-1/heartbeat");
  assert.equal(JSON.parse(requests[0].options.body).privateKeyPem, undefined);
  assert.equal(JSON.parse(requests[1].options.body).signature.length > 0, true);
});

test("checks Hub health before any sign-in or Node registration", async () => {
  const requests = [];
  const health = await probeSpsHub({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ ok: true, service: "sps" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    hubUrl: "https://sps.example.test/stale-path",
  });

  assert.deepEqual(health, { ok: true, service: "sps" });
  assert.equal(requests[0].url, "https://sps.example.test/api/health");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.headers.authorization, undefined);
});

test("preserves Hub denial status when a Node heartbeat is rejected", async () => {
  const identity = createNodeIdentity();
  await assert.rejects(
    sendSpsNodeHeartbeat({
      fetchImpl: async () => new Response(JSON.stringify({ error: "This SPS Node has been revoked" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
      hubUrl: "https://sps.example.test",
      nodeId: "node-1",
      identity,
    }),
    (error) => error instanceof SpsHubRequestError
      && error.status === 403
      && error.message === "This SPS Node has been revoked",
  );
});

test("lets a computer remove its own Node with its protected SPS Desktop session", async () => {
  const requests = [];
  await disconnectSpsNode({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ id: "node-1", status: "revoked" }), { status: 200 });
    },
    hubUrl: "https://sps.example.test",
    nodeId: "node-1",
    accessToken: "board-token",
  });
  assert.equal(requests[0].url, "https://sps.example.test/api/sps-nodes/node-1/disconnect");
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.headers.authorization, "Bearer board-token");
});

test("claims Node commands through a signed Board-authenticated request", async () => {
  const identity = createNodeIdentity();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(null, { status: 204 });
  };
  const result = await claimSpsNodeCommand({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    nodeId: "node-1",
    identity,
    accessToken: "board-token",
  });
  assert.equal(result, null);
  assert.equal(requests[0].url, "https://sps.example.test/api/sps-nodes/node-1/commands/claim-next");
  assert.equal(requests[0].options.headers.authorization, "Bearer board-token");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(typeof body.signature, "string");
  assert.equal(body.privateKeyPem, undefined);
});

test("checks the signed command lease before a long-running local command continues", async () => {
  const identity = createNodeIdentity();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ active: false, status: "failed", error: "access revoked" }), { status: 200 });
  };
  const lease = await checkSpsNodeCommandLease({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    nodeId: "node-1",
    identity,
    accessToken: "board-token",
    commandId: "command-1",
  });
  assert.equal(lease.active, false);
  assert.equal(requests[0].url, "https://sps.example.test/api/sps-nodes/node-1/commands/command-1/lease");
  assert.equal(requests[0].options.headers.authorization, "Bearer board-token");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(typeof body.signature, "string");
});

test("uses the existing Hub browser-approval challenge for Desktop sign-in", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({
      id: "challenge-1",
      token: "challenge-secret",
      boardApiToken: "board-token",
      approvalUrl: "https://sps.example.test/cli-auth/challenge-1?token=challenge-secret",
      status: "pending",
    }), { status: 201 });
  };
  const auth = await startSpsDesktopAuth({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    companyId: "company-1",
  });
  assert.equal(auth.boardApiToken, "board-token");
  await pollSpsDesktopAuth({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    challengeId: auth.id,
    challengeToken: auth.token,
  });
  assert.equal(requests[0].url, "https://sps.example.test/api/cli-auth/challenges");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    command: "SPS Desktop Node connection",
    clientName: "SPS Desktop",
    requestedAccess: "board",
    requestedCompanyId: "company-1",
  });
  assert.equal(requests[1].url, "https://sps.example.test/api/cli-auth/challenges/challenge-1?token=challenge-secret");
  assert.equal(requests[1].options.method, "GET");
});

test("can authenticate before choosing a company and then list allowed companies", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(url.endsWith("/companies")
      ? [{ id: "company-1", name: "Acme Robotics" }]
      : { id: "challenge-1", token: "challenge-secret", boardApiToken: "board-token" }), {
      status: url.endsWith("/companies") ? 200 : 201,
    });
  };
  await startSpsDesktopAuth({ fetchImpl, hubUrl: "https://sps.example.test" });
  const companies = await listSpsCompanies({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    accessToken: "board-token",
  });
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    command: "SPS Desktop Node connection",
    clientName: "SPS Desktop",
    requestedAccess: "board",
  });
  assert.equal(requests[1].url, "https://sps.example.test/api/companies");
  assert.equal(requests[1].options.headers.authorization, "Bearer board-token");
  assert.deepEqual(companies, [{ id: "company-1", name: "Acme Robotics" }]);
});

test("lists only projects available to the signed-in Desktop member", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify([{ id: "project-1", name: "Mobile game" }]), { status: 200 });
  };
  const projects = await listSpsProjects({
    fetchImpl,
    hubUrl: "https://sps.example.test",
    companyId: "company-1",
    accessToken: "board-token",
  });
  assert.deepEqual(projects, [{ id: "project-1", name: "Mobile game" }]);
  assert.equal(requests[0].url, "https://sps.example.test/api/companies/company-1/projects");
  assert.equal(requests[0].options.headers.authorization, "Bearer board-token");
});

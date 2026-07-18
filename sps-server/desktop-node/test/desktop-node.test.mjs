import { createPublicKey, verify } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHeartbeatMessage,
  buildSignedRequestMessage,
  canonicalJson,
  claimSpsNodeCommand,
  createNodeIdentity,
  createSignedNodeRequest,
  startSpsDesktopAuth,
  pollSpsDesktopAuth,
  createSignedHeartbeat,
  listSpsCompanies,
  listSpsProjects,
  registerSpsNode,
  resolveSpsNodeExecutable,
  resolveSpsNodeInvocation,
  scanLocalCapabilities,
  sendSpsNodeHeartbeat,
} from "../src/index.mjs";
import { createHash } from "node:crypto";

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

test("publishes only capability names and versions, not executable paths", () => {
  const capabilities = scanLocalCapabilities({
    findCommand: (command) => command === "codex" || command === "opencode" || command === "ollama",
    readVersion: (command) => `${command} 1.2.3`,
  });
  assert.deepEqual(capabilities, [
    { kind: "codex_cli", label: "Codex CLI", version: "codex 1.2.3" },
    { kind: "opencode_cli", label: "OpenCode CLI", version: "opencode 1.2.3" },
    { kind: "ollama", label: "Ollama", version: "ollama 1.2.3" },
  ]);
  assert.equal(JSON.stringify(capabilities).includes("C:\\\\"), false);
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

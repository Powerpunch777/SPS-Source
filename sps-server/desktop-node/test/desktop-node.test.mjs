import { constants, createPublicKey, publicEncrypt, verify } from "node:crypto";
import { createServer } from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSpsWindowsSmbMappingRequest,
  formatSpsWindowsNetUseError,
  buildHeartbeatMessage,
  buildSignedRequestMessage,
  assertSpsNodeCommandRuntime,
  buildSpsNodeRuntimeEnvironment,
  cancelSpsNodeCommands,
  checkSpsNodeCommandLease,
  checkSpsPluginNodeRunLease,
  disconnectSpsNode,
  canonicalJson,
  claimSpsNodeCommand,
  claimSpsPluginNodeRun,
  appendSpsPluginNodeRunEvent,
  completeSpsPluginNodeRun,
  createNodeIdentity,
  createSignedNodeRequest,
  executeSpsNodeCommand,
  getSpsDesktopAccount,
  startSpsDesktopAuth,
  pollSpsDesktopAuth,
  probeSpsHub,
  createSignedHeartbeat,
  listSpsCompanies,
  listSpsProjects,
  registerSpsNode,
  resolveSpsNodeExecutable,
  resolveSpsNodeCodexHome,
  resolveSpsNodeInvocation,
  resolveSpsNodeWorkspace,
  isSpsHostSharedWorkspacePath,
  openSpsHostProjectShare,
  scanLocalCapabilities,
  scanLocalRunnerProfiles,
  sendSpsNodeHeartbeat,
  spsMarketplaceMcpRuntimeEnvironment,
  SpsHubRequestError,
} from "../src/index.mjs";
import { createHash } from "node:crypto";
import { parseLmStudioModels, parseOllamaModels } from "../src/capability-scan.mjs";
import { sealSpsHostProjectShareCredential } from "../../desktop/src/host-project-share.mjs";

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
  assert.equal(identity.transportAlgorithm, "rsa-oaep-sha256");
  assert.match(identity.transportPublicKeyPem, /BEGIN PUBLIC KEY/);
  assert.match(identity.transportPrivateKeyPem, /BEGIN PRIVATE KEY/);
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

test("loads the signed-in Google account through the protected Desktop endpoint", async () => {
  const requests = [];
  const account = await getSpsDesktopAccount({
    hubUrl: "https://owner.example.test",
    accessToken: "desktop-token",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          user: { id: "user-1", name: "Jimin Park", email: "jimin@example.test" },
        }),
      };
    },
  });

  assert.deepEqual(account, { id: "user-1", name: "Jimin Park", email: "jimin@example.test" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://owner.example.test/api/cli-auth/me");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.headers.authorization, "Bearer desktop-token");
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

test("publishes safe Runner Profile availability without local credentials", async () => {
  const runners = await scanLocalRunnerProfiles({
    findCommand: (command) => command === "codex",
    readVersion: () => "codex 1.2.3",
    readModels: () => [],
  });
  assert.equal(runners.length, 1);
  assert.deepEqual(runners[0], {
    runnerKey: "codex_cli:default",
    kind: "codex_cli",
    label: "Codex CLI",
    version: "codex 1.2.3",
    credentialStatus: "unknown",
    availability: {
      status: "unknown",
      observedAt: runners[0].availability.observedAt,
      source: "node_probe",
      confidence: 25,
    },
  });
  assert.match(runners[0].availability.observedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(JSON.stringify(runners).includes("privateKeyPem"), false);
  assert.equal(JSON.stringify(runners).includes("CODEX_HOME"), false);
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

test("requires a Host-issued shared project folder for every Member project command", async () => {
  await assert.rejects(
    resolveSpsNodeWorkspace(
      { projectId: "project-1" },
      { connectionKind: "remote", defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
    ),
    /Owner Host must configure an SPS shared project folder/,
  );
});

test("uses the Owner Host's project source mapping instead of the default workspace", async () => {
  const projectWorkspace = process.cwd();
  const resolved = await resolveSpsNodeWorkspace(
    { projectId: "project-1" },
    {
      connectionKind: "owner-host",
      defaultWorkspacePath: "C:\\must-not-be-used",
      projectWorkspaces: { "project-1": projectWorkspace },
    },
  );
  assert.equal(resolved, projectWorkspace);
});

test("accepts only a Host-issued Windows UNC path for a Member project command", async () => {
  const hostShare = "\\\\sps-host\\sps-project-1";
  assert.equal(isSpsHostSharedWorkspacePath(hostShare, "win32"), true);
  assert.equal(isSpsHostSharedWorkspacePath("C:\\member\\project", "win32"), false);

  const resolved = await resolveSpsNodeWorkspace(
    { projectId: "project-1", cwdHint: hostShare },
    { connectionKind: "remote", defaultWorkspacePath: "", projectWorkspaces: {} },
    {
      platform: "win32",
      resolvePath: (value) => value,
      stat: async () => ({ isDirectory: () => true }),
    },
  );
  assert.equal(resolved, hostShare);
});

test("formats Windows Host Source connection failures without leaking localized output", () => {
  assert.equal(
    formatSpsWindowsNetUseError(Buffer.from("System error 86 has occurred.")),
    "Windows rejected the SPS Host Source credential (system error 86). Ask the Host to revoke and grant Source access again.",
  );
  assert.equal(
    formatSpsWindowsNetUseError(Buffer.from("System error 1219 has occurred.")),
    "Windows already has a connection to this SPS Host with different credentials (system error 1219). Close that connection and retry.",
  );
  assert.equal(
    formatSpsWindowsNetUseError(Buffer.from("unclassified localized output")),
    "Windows could not connect the SPS Host project share.",
  );
});

test("keeps the Host Source password out of the Windows process arguments", () => {
  const password = "sps-secret-password-1234";
  const request = buildSpsWindowsSmbMappingRequest([
    "use",
    "\\\\main-computer.tailnet.ts.net\\SPS_source",
    "/user:main-computer\\spsws_node",
    "*",
  ], password);
  assert.equal(request.action, "map");
  assert.equal(request.localPath, "");
  assert.equal(Buffer.from(request.password, "base64").toString("utf8"), password);
  assert.equal(JSON.stringify([
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
  ]).includes(password), false);
  assert.deepEqual(
    buildSpsWindowsSmbMappingRequest(["use", "\\\\main-computer\\SPS_source", "/delete", "/y"]),
    {
      action: "remove",
      sharePath: Buffer.from("\\\\main-computer\\SPS_source", "utf8").toString("base64"),
      localPath: "",
      username: "",
      password: "",
    },
  );
  assert.equal(
    Buffer.from(buildSpsWindowsSmbMappingRequest([
      "use",
      "\\\\main-computer\\SPS_source",
      "/local:Z:",
      "/delete",
      "/y",
    ]).localPath, "base64").toString("utf8"),
    "Z:",
  );
});

test("opens a Host project share only from a Node-sealed credential and removes it after the command", async () => {
  const identity = createNodeIdentity();
  const sharePath = "\\\\sps-host.tailnet.ts.net\\SPS_Project_1";
  const password = "pA4%8m_Q4-J9nZ5r!B6c";
  const envelope = publicEncrypt(
    {
      key: identity.transportPublicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(JSON.stringify({
      version: 1,
      sharePath,
      username: "SPS-HOST\\spsws_node_1",
      password,
    }), "utf8"),
  ).toString("base64");
  const calls = [];
  const mounted = await openSpsHostProjectShare({
    kind: "sps_host_share",
    shareId: "share-1",
    sharePath,
    credentialAlgorithm: "rsa-oaep-sha256",
    credentialEnvelope: envelope,
  }, identity.transportPrivateKeyPem, {
    platform: "win32",
    expectedSharePath: sharePath,
    runNetUse: async (args, stdin) => {
      calls.push({ args, stdin });
      return args.includes("/delete") ? null : { localPath: "Z:\\" };
    },
  });
  assert.equal(mounted.sharePath, sharePath);
  assert.equal(mounted.workspacePath, "Z:\\");
  assert.deepEqual(calls[0], {
    args: ["use", sharePath, "/user:SPS-HOST\\spsws_node_1", "*"],
    stdin: password,
  });
  assert.equal(JSON.stringify(calls[0].args).includes(password), false);
  await mounted.close();
  assert.deepEqual(calls[1], {
    args: ["use", sharePath, "/local:Z:", "/delete", "/y"],
    stdin: undefined,
  });
});

test("opens a hybrid Host project-share envelope that exceeds direct RSA payload limits", async () => {
  const identity = createNodeIdentity();
  const sharePath = "\\\\main-computer.tail1725c2.ts.net\\SPS_f7987a5dffb6430893d2bfaf72d18d74";
  const password = "pA4%8m_Q4-J9nZ5r!B6c";
  const envelope = sealSpsHostProjectShareCredential({
    sharePath,
    hostAccountName: "MAIN-COMPUTER",
    transportPublicKey: identity.transportPublicKeyPem,
    username: "spsws_b6bc1dc2d7e748",
    password,
  });
  const calls = [];
  const mounted = await openSpsHostProjectShare({
    kind: "sps_host_share",
    shareId: "share-hybrid-1",
    sharePath,
    credentialAlgorithm: "rsa-oaep-sha256+a256gcm",
    credentialEnvelope: envelope,
  }, identity.transportPrivateKeyPem, {
    platform: "win32",
    expectedSharePath: sharePath,
    runNetUse: async (args, stdin) => {
      calls.push({ args, stdin });
      return args.includes("/delete") ? null : { localPath: "Y:\\" };
    },
  });
  assert.deepEqual(calls[0], {
    args: ["use", sharePath, "/user:MAIN-COMPUTER\\spsws_b6bc1dc2d7e748", "*"],
    stdin: password,
  });
  await mounted.close();
});

test("resolves only a signed-in local Codex profile selected by the Hub", async () => {
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-node-codex-profile-"));
  try {
    await fs.mkdir(path.join(homeRoot, ".codex-plus-b"));
    await fs.writeFile(path.join(homeRoot, ".codex-plus-b", "auth.json"), "{}", "utf8");
    const command = { env: { PAPERCLIP_CODEX_ACCOUNT: ".codex-plus-b" } };
    assert.equal(
      await resolveSpsNodeCodexHome(command, { USERPROFILE: homeRoot }),
      path.join(homeRoot, ".codex-plus-b"),
    );
    assert.equal(
      await resolveSpsNodeCodexHome({ env: {} }, { USERPROFILE: homeRoot }),
      path.join(homeRoot, ".codex-plus-b"),
    );
    await fs.mkdir(path.join(homeRoot, ".codex-plus-c"));
    await fs.writeFile(path.join(homeRoot, ".codex-plus-c", "auth.json"), "{}", "utf8");
    await assert.rejects(
      resolveSpsNodeCodexHome({ env: {} }, { USERPROFILE: homeRoot }),
      /multiple signed-in Codex profiles/,
    );
    await assert.rejects(
      resolveSpsNodeCodexHome({ env: { PAPERCLIP_CODEX_ACCOUNT: "../other" } }, { USERPROFILE: homeRoot }),
      /invalid Codex profile name/,
    );
    await assert.rejects(
      resolveSpsNodeCodexHome({ env: { PAPERCLIP_CODEX_ACCOUNT: ".codex" } }, { USERPROFILE: homeRoot }),
      /multiple signed-in Codex profiles/,
    );
  } finally {
    await fs.rm(homeRoot, { recursive: true, force: true });
  }
});

test("executes a local Node process and returns streamed output through the signed Hub protocol", async () => {
  const hub = await startMockHub();
  const homeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sps-node-command-profile-"));
  try {
    await fs.mkdir(path.join(homeRoot, ".codex"));
    await fs.writeFile(path.join(homeRoot, ".codex", "auth.json"), "{}", "utf8");
    const result = await executeSpsNodeCommand({
      command: {
        id: "command-1",
        projectId: null,
        command: "codex",
        runtimeKind: "codex_cli",
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
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: ["-e", "process.stdout.write('SPS node output\\n')"],
      }),
      hostEnvironment: { USERPROFILE: homeRoot },
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
    await fs.rm(homeRoot, { recursive: true, force: true });
    await hub.close();
  }
});

test("executes a plugin-owned run through the Host Source route and plugin queue lifecycle", async () => {
  const events = [];
  const completions = [];
  const sourceClaims = [];
  let routeClosed = false;
  const result = await executeSpsNodeCommand({
    command: {
      id: "plugin-run-1",
      pluginKey: "sps.example-workplane",
      subjectKey: "build:1",
      projectId: null,
      workspaceSourceId: "source-1",
      cwdHint: "\\\\sps-host\\source-1",
      command: "agy",
      runtimeKind: "agy_cli",
      args: ["-e", "process.stdout.write('plugin run output\\n')"],
      env: {},
      stdin: null,
      lastEventSeq: 0,
    },
    hubUrl: "https://sps.example.test",
    nodeId: "member-node-1",
    identity: createNodeIdentity(),
    accessToken: "board-token",
    profile: { connectionKind: "remote", defaultWorkspacePath: "C:\\Members\\must-not-be-used" },
    claimWorkspaceSourceRoute: async (input) => {
      sourceClaims.push(input);
      return { sourceId: "source-1", sharePath: "\\\\sps-host\\source-1", credentialEnvelope: "sealed" };
    },
    openWorkspaceSourceRoute: async (route) => {
      assert.equal(route.sourceId, "source-1");
      return { workspacePath: process.cwd(), close: async () => { routeClosed = true; } };
    },
    resolveWorkspace: async () => { throw new Error("mapped Source must bypass the UNC resolver"); },
    resolveInvocation: async () => ({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(process.env.SPS_WORKSPACE_PATH + '\\n')"],
    }),
    checkCommandLease: async () => ({ active: true, status: "running" }),
    appendCommandEvent: async (input) => { events.push(input); },
    completeCommand: async (input) => { completions.push(input); return { id: input.commandId, status: input.completion.status }; },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.workspace, process.cwd());
  assert.equal(sourceClaims.length, 1);
  assert.equal(sourceClaims[0].sourceId, "source-1");
  assert.equal(events.map((event) => event.body).join(""), `${process.cwd()}\n`);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].commandId, "plugin-run-1");
  assert.equal(completions[0].completion.status, "succeeded");
  assert.equal(routeClosed, true);
});

test("rejects remote command paths and mismatched runtime commands", () => {
  assert.throws(
    () => assertSpsNodeCommandRuntime({ runtimeKind: "codex_cli", command: "powershell.exe" }),
    /approved only for codex/,
  );
  assert.throws(
    () => assertSpsNodeCommandRuntime({ runtimeKind: "codex_cli", command: "C:\\Windows\\System32\\cmd.exe" }),
    /remote command path/,
  );
  assert.doesNotThrow(
    () => assertSpsNodeCommandRuntime({ runtimeKind: "codex_cli", command: "codex.cmd" }),
  );
});

test("passes only runtime-safe environment variables to a local CLI", () => {
  const environment = buildSpsNodeRuntimeEnvironment(
    { PAPERCLIP_API_KEY: "agent-token", OPENAI_API_KEY: "override", TERM: "xterm" },
    { Path: "C:\\bin", USERPROFILE: "C:\\Users\\friend", OPENAI_API_KEY: "host-secret", CODEX_HOME: "C:\\private", CUSTOM_SECRET: "hidden" },
  );
  assert.equal(environment.Path, "C:\\bin");
  assert.equal(environment.USERPROFILE, "C:\\Users\\friend");
  assert.equal(environment.PAPERCLIP_API_KEY, "agent-token");
  assert.equal(environment.OPENAI_API_KEY, undefined);
  assert.equal(environment.CODEX_HOME, undefined);
  assert.equal(environment.CUSTOM_SECRET, undefined);
});

test("injects trusted local Marketplace MCP runtime paths after Hub environment filtering", () => {
  const environment = {
    ...buildSpsNodeRuntimeEnvironment(
      {
        SPS_MARKETPLACE_MCP_NODE: "C:\\hub-controlled\\node.exe",
        SPS_MARKETPLACE_MCP_ENTRY: "C:\\hub-controlled\\assistant.js",
        PAPERCLIP_API_KEY: "agent-token",
      },
      {
        USERPROFILE: "C:\\Users\\member",
        SPS_MARKETPLACE_MCP_NODE: "C:\\host\\should-not-leak-from-host-env",
      },
    ),
    ...spsMarketplaceMcpRuntimeEnvironment({
      nodeCommand: "C:\\SPS\\resources\\sps-owner-host-runtime\\bin\\node.exe",
      entryPath: "C:\\SPS\\resources\\sps-owner-host-runtime\\node_modules\\@sps\\mcp-server\\dist\\marketplace-assistant-stdio.js",
    }),
  };

  assert.equal(environment.SPS_MARKETPLACE_MCP_NODE, "C:\\SPS\\resources\\sps-owner-host-runtime\\bin\\node.exe");
  assert.equal(environment.SPS_MARKETPLACE_MCP_ENTRY, "C:\\SPS\\resources\\sps-owner-host-runtime\\node_modules\\@sps\\mcp-server\\dist\\marketplace-assistant-stdio.js");
  assert.equal(environment.PAPERCLIP_API_KEY, "agent-token");
});

test("leaves ordinary command environment unchanged when no Marketplace MCP runtime is available", () => {
  const environment = {
    ...buildSpsNodeRuntimeEnvironment(
      { PAPERCLIP_API_KEY: "agent-token", TERM: "xterm" },
      { Path: "C:\\bin", USERPROFILE: "C:\\Users\\member" },
    ),
    ...spsMarketplaceMcpRuntimeEnvironment(null),
  };

  assert.deepEqual(environment, {
    Path: "C:\\bin",
    USERPROFILE: "C:\\Users\\member",
    PAPERCLIP_API_KEY: "agent-token",
    TERM: "xterm",
  });
});

test("injects the local Marketplace MCP runtime into spawn env without allowing Hub values to replace it", async () => {
  const hub = await startMockHub();
  const nodeCommand = path.resolve(os.tmpdir(), "sps-marketplace-mcp-node.exe");
  const entryPath = path.resolve(os.tmpdir(), "sps-marketplace-mcp-entry.mjs");
  try {
    const result = await executeSpsNodeCommand({
      command: {
        id: "marketplace-mcp-runtime",
        projectId: null,
        command: "agy",
        runtimeKind: "agy_cli",
        args: [],
        env: {
          SPS_MARKETPLACE_MCP_NODE: "C:\\hub\\must-not-win.exe",
          SPS_MARKETPLACE_MCP_ENTRY: "C:\\hub\\must-not-win.mjs",
        },
        stdin: null,
        lastEventSeq: 0,
      },
      hubUrl: hub.hubUrl,
      nodeId: "node-marketplace-mcp",
      identity: createNodeIdentity(),
      accessToken: "board-token",
      profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
      marketplaceMcpRuntime: { nodeCommand, entryPath },
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: [
          "-e",
          "process.stdout.write(JSON.stringify({ node: process.env.SPS_MARKETPLACE_MCP_NODE, entry: process.env.SPS_MARKETPLACE_MCP_ENTRY }))",
        ],
      }),
      hostEnvironment: {},
    });

    assert.equal(result.exitCode, 0);
    const output = JSON.parse(hub.events.map((event) => event.body.body).join(""));
    assert.deepEqual(output, { node: nodeCommand, entry: entryPath });
  } finally {
    await hub.close();
  }
});

test("does not add Marketplace MCP runtime variables to a normal command", async () => {
  const hub = await startMockHub();
  try {
    const result = await executeSpsNodeCommand({
      command: {
        id: "normal-command-without-marketplace-mcp",
        projectId: null,
        command: "agy",
        runtimeKind: "agy_cli",
        args: [],
        env: {
          SPS_MARKETPLACE_MCP_NODE: "C:\\hub\\must-not-forward.exe",
          SPS_MARKETPLACE_MCP_ENTRY: "C:\\hub\\must-not-forward.mjs",
        },
        stdin: null,
        lastEventSeq: 0,
      },
      hubUrl: hub.hubUrl,
      nodeId: "node-normal-command",
      identity: createNodeIdentity(),
      accessToken: "board-token",
      profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: [
          "-e",
          "process.stdout.write(JSON.stringify({ node: process.env.SPS_MARKETPLACE_MCP_NODE, entry: process.env.SPS_MARKETPLACE_MCP_ENTRY }))",
        ],
      }),
      hostEnvironment: {},
    });

    assert.equal(result.exitCode, 0);
    assert.deepEqual(JSON.parse(hub.events.map((event) => event.body.body).join("")), {});
  } finally {
    await hub.close();
  }
});

test("cancels a running local command when this Desktop Node disconnects", async () => {
  const hub = await startMockHub();
  try {
    const execution = executeSpsNodeCommand({
      command: {
        id: "command-cancel",
        projectId: null,
        command: "agy",
        runtimeKind: "agy_cli",
        args: [],
        env: {},
        stdin: null,
        lastEventSeq: 0,
      },
      hubUrl: hub.hubUrl,
      nodeId: "node-1",
      identity: createNodeIdentity(),
      accessToken: "board-token",
      profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
      resolveInvocation: async () => ({
        executable: process.execPath,
        args: ["-e", "setTimeout(() => process.exit(0), 30000)"],
      }),
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(await cancelSpsNodeCommands("Desktop disconnected"), 1);
    const result = await execution;
    assert.notEqual(result.exitCode, 0);
    assert.equal(hub.completions[0]?.body.status, "failed");
    assert.equal(hub.completions[0]?.body.error, "Desktop disconnected");
  } finally {
    await hub.close();
  }
});

test("does not start a command that races with Desktop Node disconnection", async () => {
  const hub = await startMockHub();
  try {
    const execution = executeSpsNodeCommand({
      command: {
        id: "command-race",
        projectId: null,
        command: "agy",
        runtimeKind: "agy_cli",
        args: [],
        env: {},
        stdin: null,
        lastEventSeq: 0,
      },
      hubUrl: hub.hubUrl,
      nodeId: "node-1",
      identity: createNodeIdentity(),
      accessToken: "board-token",
      profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
      resolveInvocation: async () => {
        await new Promise((resolve) => setTimeout(resolve, 80));
        return {
          executable: process.execPath,
          args: ["-e", "setTimeout(() => process.exit(0), 30000)"],
        };
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(await cancelSpsNodeCommands("Desktop disconnected before launch"), 1);
    await assert.rejects(execution, /Desktop disconnected before launch/);
    assert.equal(hub.completions[0]?.body.error, "Desktop disconnected before launch");
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
    runners: [{
      runnerKey: "codex_cli:personal",
      kind: "codex_cli",
      label: "Codex CLI",
      profileLabel: "Personal",
      credentialStatus: "unknown",
      availability: {
        status: "unknown",
        observedAt: "2026-07-22T00:00:00.000Z",
        source: "node_probe",
      },
    }],
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
  assert.equal(requests[0].options.headers.origin, "https://sps.example.test");
  assert.equal(requests[1].options.headers.origin, "https://sps.example.test");
  assert.equal(JSON.parse(requests[0].options.body).privateKeyPem, undefined);
  assert.equal(JSON.parse(requests[0].options.body).runners[0].profileLabel, "Personal");
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

test("preserves Hub denial status and code when a Node heartbeat is rejected", async () => {
  const identity = createNodeIdentity();
  await assert.rejects(
    sendSpsNodeHeartbeat({
      fetchImpl: async () => new Response(JSON.stringify({ error: "This SPS Node has been revoked", code: "sps_node_revoked" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
      hubUrl: "https://sps.example.test",
      nodeId: "node-1",
      identity,
    }),
    (error) => error instanceof SpsHubRequestError
      && error.status === 403
      && error.message === "This SPS Node has been revoked"
      && error.code === "sps_node_revoked",
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

test("acknowledges a cancelled plugin lease only after its Windows process tree exits", { skip: process.platform !== "win32", timeout: 25_000 }, async () => {
  let cancel = false;
  let pids = [];
  let completed = false;
  const isAlive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
  try {
    const result = await executeSpsNodeCommand({
      command: { id: "cancel-process-tree", pluginKey: "sps.cancel-test", subjectKey: "execution:one", command: "agy", runtimeKind: "agy_cli", args: [], env: {}, stdin: null, lastEventSeq: 0, timeoutMs: 15_000 },
      hubUrl: "https://sps.example.test", nodeId: "node-1", identity: createNodeIdentity(), accessToken: "test-token",
      profile: { defaultWorkspacePath: process.cwd(), projectWorkspaces: {} },
      resolveInvocation: async () => ({ executable: process.execPath, args: ["-e",
        "const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(JSON.stringify([process.pid,child.pid]));setInterval(()=>{},1000);" ] }),
      appendCommandEvent: async input => {
        if (input.stream === "stdout") { pids = JSON.parse(input.body.trim()); cancel = true; }
      },
      checkCommandLease: async () => cancel ? { active: false, status: "cancelling", error: "Cancellation requested by test." } : { active: true, status: "running" },
      completeCommand: async input => {
        expectStopped();
        assert.equal(input.completion.status, "failed");
        assert.match(input.completion.error, /Cancellation requested/);
        completed = true;
      },
    });
    function expectStopped() {
      assert.equal(pids.length, 2);
      for (const pid of pids) assert.equal(isAlive(pid), false, `Owned process ${pid} is still running`);
    }
    assert.equal(completed, true);
    assert.equal(result.timedOut, false);
    expectStopped();
  } finally {
    for (const pid of pids) { if (isAlive(pid)) { try { process.kill(pid, "SIGKILL"); } catch {} } }
  }
});

test("uses a separate signed queue for workflow-neutral plugin runs", async () => {
  const identity = createNodeIdentity();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith("/claim-next")) return new Response(null, { status: 204 });
    if (url.endsWith("/lease")) {
      return new Response(JSON.stringify({ active: true, status: "running" }), { status: 200 });
    }
    if (url.endsWith("/events")) return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ id: "run-1", status: "succeeded" }), { status: 200 });
  };
  const input = {
    fetchImpl,
    hubUrl: "https://sps.example.test",
    nodeId: "node-1",
    identity,
    accessToken: "board-token",
  };

  assert.equal(await claimSpsPluginNodeRun(input), null);
  await appendSpsPluginNodeRunEvent({
    ...input,
    commandId: "run-1",
    sequence: 1,
    stream: "stdout",
    body: "ready\n",
  });
  assert.deepEqual(await checkSpsPluginNodeRunLease({ ...input, commandId: "run-1" }), {
    active: true,
    status: "running",
  });
  await completeSpsPluginNodeRun({
    ...input,
    commandId: "run-1",
    completion: { status: "succeeded", exitCode: 0, signal: null, timedOut: false, error: null },
  });

  assert.deepEqual(requests.map((request) => request.url), [
    "https://sps.example.test/api/sps-nodes/node-1/plugin-runs/claim-next",
    "https://sps.example.test/api/sps-nodes/node-1/plugin-runs/run-1/events",
    "https://sps.example.test/api/sps-nodes/node-1/plugin-runs/run-1/lease",
    "https://sps.example.test/api/sps-nodes/node-1/plugin-runs/run-1/complete",
  ]);
  for (const request of requests) {
    const body = JSON.parse(request.options.body);
    assert.equal(typeof body.signature, "string");
    assert.equal(body.privateKeyPem, undefined);
  }
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

test("uses a Core-local SPS Identity session cookie without exposing a central bearer token", async () => {
  const requests = [];
  const companies = await listSpsCompanies({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify([{ id: "company-1", name: "Acme Robotics" }]), { status: 200 });
    },
    hubUrl: "https://sps.example.test",
    sessionCookie: "core-session-token",
  });

  assert.deepEqual(companies, [{ id: "company-1", name: "Acme Robotics" }]);
  assert.equal(requests[0].options.headers.authorization, undefined);
  assert.equal(requests[0].options.headers.cookie, "sps_identity_session=core-session-token");
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

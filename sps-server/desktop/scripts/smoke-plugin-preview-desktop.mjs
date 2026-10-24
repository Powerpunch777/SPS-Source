import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { access, copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { inspectPluginArchive } from "@sonparkserver/plugin-sdk/registry/archive-inspector-v1.mjs";
import { calculateStaticCapabilitiesDigest } from "@sonparkserver/plugin-sdk/registry/static-package-manifest-v1.mjs";
import { resolveDeveloperPackageArtifact } from "../src/developer-package-artifact.mjs";
import { parseE2eHostReadyTimeout } from "./e2e-host-ready-timeout.mjs";
import { buildLiveBuilderPrompt, collectAuthoringSnapshot, verifyLiveBuilderChanges } from "./live-builder-authoring.mjs";

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedBinary = process.env.SPS_DESKTOP_E2E_BINARY?.trim();
const liveAuthoring = process.argv.includes("--live-authoring");
const hostReadyTimeoutMs = parseE2eHostReadyTimeout(process.env.SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS);
const sourceElectron = path.join(desktopRoot, "node_modules", "electron", "dist", "electron.exe");
const sdkRoot = path.join(desktopRoot, "node_modules", "@sonparkserver", "plugin-sdk");
const sdkCliPath = path.join(sdkRoot, "cli", "sps-plugin.mjs");

if (process.platform !== "win32") throw new Error("SPS Plugin Preview Desktop E2E targets Windows.");
if (packagedBinary) await access(packagedBinary);
else await access(sourceElectron);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const base64Url = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
const errorText = (error) => error instanceof Error ? error.message : String(error);
const step = (message) => console.log(`[preview-e2e] ${message}`);
const cleanupTimeout = (promise, label, milliseconds = 15_000) => Promise.race([
  promise,
  delay(milliseconds).then(() => { throw new Error(`${label} cleanup timed out after ${milliseconds}ms.`); }),
]);

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address()?.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function removeRetry(target) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 }); return; } catch (error) { lastError = error; await delay(300); }
  }
  throw lastError;
}

async function stopTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  await execFileAsync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
    timeout: 15_000,
    windowsHide: true,
  }).catch(() => undefined);
  await Promise.race([once(child, "exit").catch(() => undefined), delay(10_000)]);
}

async function stopTemporaryPostgres(targetRoot) {
  const command = [
    "$needle = ($env:SPS_E2E_ROOT -replace '\\\\', '/');",
    "Get-CimInstance Win32_Process |",
    "  Where-Object { $_.Name -eq 'postgres.exe' -and (($_.CommandLine -replace '\\\\', '/') -like \"*$needle*\") } |",
    "  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(" ");
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    env: { ...process.env, SPS_E2E_ROOT: targetRoot },
    timeout: 15_000,
    windowsHide: true,
  });
}

function mockIdentity() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = keys.publicKey.export({ format: "jwk" });
  const codes = new Set();
  const refreshTokens = new Set();
  let origin;
  let signIns = 0;
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url({ alg: "RS256", kid: "preview-e2e", typ: "JWT" });
    const payload = base64Url({ iss: origin, aud: "sps-core", sub: "preview-e2e-owner", email: "preview-e2e@example.test", name: "Preview E2E Owner", scope: "sps.core.session", iat: now, nbf: now - 1, exp: now + 3600 });
    const input = `${header}.${payload}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString("base64url")}`;
  };
  const response = () => {
    const refresh_token = `refresh-${randomBytes(18).toString("base64url")}`;
    refreshTokens.add(refresh_token);
    signIns += 1;
    return { access_token: token(), refresh_token, expires_in: 3600, account: { subject: "preview-e2e-owner", email: "preview-e2e@example.test", name: "Preview E2E Owner", picture: null } };
  };
  const server = createServer(async (request, result) => {
    const url = new URL(request.url || "/", origin || "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") return result.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [{ ...publicJwk, kid: "preview-e2e", alg: "RS256", use: "sig" }] }));
    if (request.method === "GET" && url.pathname === "/v1/desktop/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_uri") || "");
      const state = url.searchParams.get("state");
      if (!state) return result.writeHead(400).end("Missing state");
      const code = `code-${randomBytes(18).toString("base64url")}`;
      codes.add(code); redirect.searchParams.set("code", code); redirect.searchParams.set("state", state);
      return result.writeHead(302, { location: redirect.toString() }).end();
    }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
    if (request.method === "POST" && url.pathname === "/v1/desktop/token") {
      if (!codes.delete(String(body.code || ""))) return result.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid code" }));
      return result.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(response()));
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/refresh") {
      if (!refreshTokens.has(String(body.refresh_token || ""))) return result.writeHead(400).end(JSON.stringify({ error: "invalid refresh" }));
      return result.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(response()));
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/revoke") return result.writeHead(204).end();
    return result.writeHead(404).end("Not found");
  });
  return {
    async start() { await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); origin = `http://127.0.0.1:${server.address().port}`; return { origin, get signIns() { return signIns; } }; },
    async close() {
      if (!server.listening) return;
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function targets(port) { return await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) }).then((response) => response.json()); }
async function waitTarget(port, child, predicate, label, timeout = 150_000) {
  const end = Date.now() + timeout; let last = [];
  while (Date.now() < end) {
    if (child.exitCode !== null) throw new Error(`Desktop exited before ${label} (exit ${child.exitCode}).`);
    try { last = await targets(port); const found = last.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl && predicate(entry)); if (found) return found; } catch {}
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${label}: ${last.map((entry) => `${entry.title} ${entry.url}`).join(" | ")}`);
}

async function cdpFor(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await Promise.race([once(socket, "open"), delay(8_000).then(() => { throw new Error("Timed out opening CDP."); })]);
  let id = 0;
  const command = (method, params = {}, timeoutMs = 20_000) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => { socket.removeEventListener("message", listener); reject(new Error(`CDP ${method} timed out.`)); }, timeoutMs);
    const listener = (event) => { const message = JSON.parse(event.data); if (message.id !== requestId) return; clearTimeout(timeout); socket.removeEventListener("message", listener); message.error ? reject(new Error(message.error.message)) : resolve(message.result); };
    socket.addEventListener("message", listener); socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  return {
    command,
    async evaluate(expression, awaitPromise = false, timeoutMs = 20_000) { const result = await command("Runtime.evaluate", { expression, awaitPromise, returnByValue: true }, timeoutMs); if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Page evaluation failed."); return result.result?.value; },
    close: async () => {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, "close").catch(() => undefined);
      socket.close();
      await Promise.race([closed, delay(2_000)]);
    },
  };
}

async function waitPage(cdp, predicate, label, timeout = 60_000) {
  const end = Date.now() + timeout; let page;
  while (Date.now() < end) {
    try { page = await cdp.evaluate("({ url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 5000) || '' })"); if (predicate(page)) return page; } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(page)}`);
}

async function registryCall(cdp, expression, timeoutMs = 20_000) { return await cdp.evaluate(`(async () => await (${expression}))()`, true, timeoutMs); }
async function workspaceApi(cdp, pathName, options = {}) {
  const result = await cdp.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(pathName)}, {
      method: ${JSON.stringify(options.method || "GET")},
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: ${options.body === undefined ? "undefined" : JSON.stringify(JSON.stringify(options.body))},
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
  })()`, true);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`API ${options.method || "GET"} ${pathName} failed (${result.status}): ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

async function executeBuilderTool(cdp, runContext, toolName, parameters) {
  return await workspaceApi(cdp, "/api/plugins/tools/execute", {
    method: "POST",
    body: {
      tool: `sps.plugin-discovery:${toolName}`,
      parameters,
      runContext,
    },
  });
}

function lifecycleSnapshot(plugins) {
  return (Array.isArray(plugins) ? plugins : [])
    .map((plugin) => ({
      id: plugin.id,
      pluginKey: plugin.pluginKey,
      status: plugin.status,
      version: plugin.manifestJson?.version ?? null,
    }))
    .sort((left, right) => String(left.pluginKey).localeCompare(String(right.pluginKey)));
}
async function waitFixture(cdp, expected, label, timeout = 30_000) {
  const end = Date.now() + timeout;
  let value;
  while (Date.now() < end) {
    try {
      value = await cdp.evaluate("globalThis.__SPS_PLUGIN_PREVIEW_FIXTURE_V1__");
      if (Object.entries(expected).every(([key, expectedValue]) => value?.[key] === expectedValue)) return value;
    } catch {}
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}

async function makePlugin(directory, { withUi = true } = {}) {
  await execFileAsync(process.execPath, [
    sdkCliPath,
    "init",
    directory,
    "--id", "local.preview-desktop-e2e",
    "--package", "@sps/preview-desktop-e2e",
    "--name", "SPS Preview Desktop E2E",
    "--version", "0.1.0",
  ], { cwd: desktopRoot, windowsHide: true });
  const sdkLink = path.join(directory, "node_modules", "@sonparkserver", "plugin-sdk");
  await mkdir(path.dirname(sdkLink), { recursive: true });
  await symlink(sdkRoot, sdkLink, "junction");
  if (!withUi) return;
  const manifestPath = path.join(directory, "dist", "manifest.js");
  const capabilities = ["plugin.state.read", "ui.page.register"];
  const runtimeManifest = (await readFile(manifestPath, "utf8"))
    .replace('capabilities: ["plugin.state.read"]', `capabilities: ${JSON.stringify(capabilities)}`)
    .replace('entrypoints: { worker: "./dist/worker.js" }', 'entrypoints: { worker: "./dist/worker.js", ui: "./dist/ui" }')
    .replace('  sps:', '  ui: { slots: [{ type: "page", id: "builder-fixture", routePath: "builder-fixture", displayName: "Builder Fixture", exportName: "BuilderFixture" }] },\n  sps:');
  await writeFile(manifestPath, runtimeManifest);
  const staticPath = path.join(directory, "sps-plugin.json");
  const staticManifest = JSON.parse(await readFile(staticPath, "utf8"));
  staticManifest.capabilities = capabilities;
  staticManifest.permissionsDigest = calculateStaticCapabilitiesDigest(capabilities);
  staticManifest.runtime.manifestSha256 = createHash("sha256").update(runtimeManifest).digest("hex");
  await writeFile(staticPath, `${JSON.stringify(staticManifest, null, 2)}\n`);
  const packagePath = path.join(directory, "package.json");
  const packageManifest = JSON.parse(await readFile(packagePath, "utf8"));
  packageManifest.files.push("dist/ui");
  await writeFile(packagePath, `${JSON.stringify(packageManifest, null, 2)}\n`);
  await mkdir(path.join(directory, "dist", "ui"));
  await writeFile(path.join(directory, "dist", "ui", "index.js"), [
    'import { createElement, useState } from "react";',
    'export function BuilderFixture() {',
    '  const [count, setCount] = useState(0);',
    '  return createElement("main", {style:{padding:24}},',
    '    createElement("h1", null, "Builder Preview Fixture"),',
    '    createElement("button", {id:"builder-fixture-count", onClick:()=>setCount(value=>value+1)}, `Count: ${count}`));',
    '}',
  ].join("\n"));
}

const identity = mockIdentity();
const debugPort = await freePort();
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sps-plugin-preview-desktop-e2e-"));
const userData = path.join(temporaryRoot, "user-data");
const pluginDirectory = path.join(temporaryRoot, "external-plugin");
const packageArchivePath = path.join(temporaryRoot, "artifacts", "preview-desktop-e2e.spsplugin");
let child; let setup; let workspace; let registry; let preview; let workspaceTarget; let output = "";
let liveAgent = null;
let liveRunId = null;
let authoredFiles = null;
let liveArtifact = null;

try {
  if (liveAuthoring) await makePlugin(pluginDirectory, { withUi: false });
  step("starting mock SPS Identity");
  const identityState = await identity.start();
  const binary = packagedBinary || sourceElectron;
  step(`launching ${packagedBinary ? "packaged" : "source"} Desktop`);
  child = spawn(binary, [`--user-data-dir=${userData}`, `--remote-debugging-port=${debugPort}`, "--remote-allow-origins=*", ...(packagedBinary ? [] : ["."])], {
    cwd: packagedBinary ? path.dirname(binary) : desktopRoot,
    env: { ...process.env, SPS_IDENTITY_URL: identityState.origin, SPS_DESKTOP_E2E: "1", SPS_DESKTOP_E2E_USER_DATA_DIR: userData, SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1", SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => { output = `${output}${chunk}`.slice(-16_000); };
  child.stdout?.on("data", capture); child.stderr?.on("data", capture);

  setup = await cdpFor(await waitTarget(debugPort, child, (entry) => entry.title === "SPS Desktop", "SPS sign-in window"));
  await waitPage(setup, (page) => page.text.includes("SPS"), "SPS sign-in UI");
  step("signing in and creating Owner Host");
  await setup.evaluate("document.querySelector('#start-sps-account')?.click()");
  await waitPage(setup, () => identityState.signIns > 0, "mock Identity callback", 35_000);
  await waitPage(setup, (page) => page.text.includes("Create") || page.text.includes("Server"), "Owner Host choice");
  await setup.evaluate("document.querySelector('#create-owner-server')?.click()");

  workspaceTarget = await waitTarget(debugPort, child, (entry) => /^http:\/\/127\.0\.0\.1:\d+\//.test(entry.url || ""), "Owner Workspace", hostReadyTimeoutMs);
  workspace = await cdpFor(workspaceTarget);
  await waitPage(workspace, (page) => page.text.includes("Workspace") || page.text.includes("Dashboard"), "Workspace UI", 90_000);
  const companies = await workspaceApi(workspace, "/api/companies");
  const company = Array.isArray(companies) ? companies[0] : null;
  assert.ok(company?.id && company?.issuePrefix, `Owner Host did not create a Workspace: ${JSON.stringify(companies)}`);
  let agents = await workspaceApi(workspace, `/api/companies/${company.id}/agents`);
  if (!Array.isArray(agents) || agents.length === 0) {
    agents = [await workspaceApi(workspace, `/api/companies/${company.id}/agents`, {
      method: "POST",
      body: { name: "Plugin Builder E2E Agent", role: "engineer", adapterType: "process", adapterConfig: {} },
    })];
  }
  const agent = agents[0];
  if (liveAuthoring) {
    liveAgent = await workspaceApi(workspace, `/api/companies/${company.id}/agents`, {
      method: "POST",
      body: {
        name: "Builder Live Author", role: "engineer", adapterType: "codex_local",
        adapterConfig: {
          command: process.env.SPS_DESKTOP_E2E_CODEX_COMMAND?.trim() || "codex",
          engine: "cli", cwd: pluginDirectory, model: "gpt-6-luna", reasoningEffort: "xhigh", fastMode: true,
          dangerouslyBypassApprovalsAndSandbox: false,
          extraArgs: ["--sandbox", "workspace-write", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--skip-git-repo-check", "-c", 'windows.sandbox="mxc"', "-c", 'approval_policy="never"', "-c", "sandbox_workspace_write.network_access=false"],
          timeoutSec: 300, graceSec: 5,
        },
      },
    });
  }
  let projects = await workspaceApi(workspace, `/api/companies/${company.id}/projects`);
  if (!Array.isArray(projects) || projects.length === 0) {
    projects = [await workspaceApi(workspace, `/api/companies/${company.id}/projects`, {
      method: "POST",
      body: { name: "Plugin Builder E2E Project", status: "in_progress" },
    })];
  }
  const project = projects[0];
  const run = await workspaceApi(workspace, `/api/agents/${agent.id}/heartbeat/invoke`, { method: "POST", body: {} });
  assert.ok(run?.id, `Plugin Builder E2E Agent did not create a run: ${JSON.stringify(run)}`);
  const runContext = { agentId: agent.id, runId: run.id, companyId: company.id, projectId: project.id };

  const toolDeadline = Date.now() + 30_000;
  let builderTools = [];
  while (Date.now() < toolDeadline) {
    builderTools = await workspaceApi(workspace, "/api/plugins/tools?pluginId=sps.plugin-discovery");
    if (Array.isArray(builderTools) && builderTools.length === 7) break;
    await delay(250);
  }
  const builderPluginState = await workspaceApi(workspace, "/api/plugins");
  assert.deepEqual(
    builderTools.map((tool) => tool.name).sort(),
    [
      "sps.plugin-discovery:builder-delegate-worker",
      "sps.plugin-discovery:builder-worker-result",
      "sps.plugin-discovery:create-sps-plugin-package",
      "sps.plugin-discovery:create-sps-plugin-project",
      "sps.plugin-discovery:inspect-sps-plugin-build",
      "sps.plugin-discovery:open-sps-plugin-preview",
      "sps.plugin-discovery:run-sps-authoring-step",
    ],
    `Plugin Builder tools did not register. Plugins: ${JSON.stringify(builderPluginState)}`,
  );
  const projectRecord = await executeBuilderTool(workspace, runContext, "create-sps-plugin-project", {
    goal: "Create and verify an external SPS plugin through the public SDK.",
    displayName: "SPS Preview Desktop E2E",
    pluginId: "local.preview-desktop-e2e",
    projectRef: "external-plugin",
  });
  const authoringSessionId = projectRecord?.result?.data?.authoringSessionId;
  assert.match(authoringSessionId ?? "", /^spsas_/);
  const productionBefore = lifecycleSnapshot(await workspaceApi(workspace, "/api/plugins"));

  await workspace.evaluate(`location.assign(${JSON.stringify(`/${company.issuePrefix}/builder`)})`);
  await waitPage(
    workspace,
    (page) => page.url.includes("/builder") && page.text.includes("Plugin Builder"),
    "Plugin Builder authoring surface",
  );
  await workspace.evaluate(`document.querySelector('.bc-header .bc-button').click()`);
  await waitPage(workspace, page => page.text.includes("Authoring projects"), "Builder authoring panel");
  await workspace.evaluate(`document.querySelector('.bc-evidence').open = true`);
  await waitPage(workspace, page => page.text.includes("SPS Preview Desktop E2E"), "Builder authoring project evidence");
  if (liveAgent) {
    await workspace.evaluate(`(() => {
      const select = document.querySelector('[aria-label="Lead 선택"]');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(liveAgent.id)});
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await workspace.evaluate("document.querySelector('[aria-label=\"Lead 선택\"]').value"), liveAgent.id);
  }
  step("opening Developer Registry from Workspace");
  const opened = await workspace.evaluate("window.spsDesktopWorkspace?.openPluginRegistries ? window.spsDesktopWorkspace.openPluginRegistries() : Promise.reject(new Error('Workspace Registry bridge unavailable'))", true);
  assert.equal(opened?.opened, true, "Workspace did not open the real Registry window.");
  registry = await cdpFor(await waitTarget(
    debugPort,
    child,
    (entry) => entry.title?.startsWith("SPS Plugin Sources"),
    "Plugin Registry",
  ));
  await waitPage(registry, (page) => page.text.includes("Local Development Registry"), "Developer Registry UI");
  assert.equal(await registryCall(registry, "window.spsRegistry.getDeveloperContext()"), null);
  step("opening a project handoff from a new Builder conversation without sending an AI message");
  await waitPage(workspace, page => page.text.includes("프로젝트 연결"), "Builder project context action");
  await workspace.evaluate(`(() => {
    const textarea = document.querySelector('.bc-composer textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Unsent plugin draft');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const transfer = new DataTransfer();
    transfer.items.add(new File(['Unsent attachment'], 'draft.txt', { type: 'text/plain' }));
    const input = document.querySelector('.bc-composer input[type=file]');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitPage(workspace, page => page.text.includes("draft.txt"), "unsent attachment before project linking");
  await workspace.evaluate("document.querySelector('.bc-project-open').click()");
  await waitPage(registry, page => page.text.includes("No project linked."), "scoped Developer Registry context");
  let developerContext = await registryCall(registry, "window.spsRegistry.getDeveloperContext()");
  assert.equal(developerContext.context.companyId, company.id);
  assert.equal(developerContext.context.pluginId, "sps.plugin-discovery");
  const linkedConversation = await workspaceApi(workspace, "/api/plugins/sps.plugin-discovery/bridge/data", {
    method: "POST", body: { key: "plugin-builder-workspace", companyId: company.id, params: {} },
  });
  const conversation = linkedConversation.data.conversations.find(item => item.id === developerContext.context.contextId);
  assert.ok(conversation, "Project handoff did not create a real Builder conversation");
  assert.deepEqual(conversation.messages, [], "Linking a project must not send an AI prompt");
  assert.equal(await workspace.evaluate("document.querySelector('.bc-composer textarea').value"), "Unsent plugin draft");
  assert.equal(await workspace.evaluate("document.querySelector('.bc-file-chip')?.textContent.includes('draft.txt')"), true);
  const screenshotDirectory = process.env.SPS_DESKTOP_E2E_SCREENSHOT_DIR?.trim();
  if (screenshotDirectory) {
    await mkdir(screenshotDirectory, { recursive: true });
    const font = await registry.evaluate(`(async () => {
      await document.fonts.ready;
      return [...document.fonts].some(font => font.family === 'Pretendard Variable' && font.status === 'loaded');
    })()`, true);
    assert.equal(font, true, "Registry did not load bundled typography");
    const screenshot = await registry.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(screenshotDirectory, "plugin-registry.png"), Buffer.from(screenshot.data, "base64"));
  }

  step("creating and connecting external SDK plugin");
  if (!liveAuthoring) await makePlugin(pluginDirectory);
  const connected = await registryCall(registry, `window.spsRegistry.connectDeveloperProject(${JSON.stringify({ sourcePath: pluginDirectory, sourceLabel: "external-plugin", displayName: "Preview Desktop E2E" })})`);
  assert.match(connected.id, /^dev-/);
  await registry.evaluate("document.querySelector('#refresh-developer-projects').click()");
  await waitPage(registry, page => page.text.includes("Link to this context"), "explicit project reference choice");
  await registry.evaluate("document.querySelector('.link-developer-context').click()");
  await waitPage(registry, page => page.text.includes("Linked: Preview Desktop E2E"), "saved project reference");
  const getContextExpression = `window.spsDesktopWorkspace.getDeveloperProjectContext(${JSON.stringify(developerContext.context)})`;
  let linkedContext = await workspace.evaluate(getContextExpression, true);
  assert.equal(linkedContext.project.id, connected.id);
  assert.equal(linkedContext.project.verified, false);
  assert.equal(Object.hasOwn(linkedContext.project, "sourcePath"), false);
  assert.equal(JSON.stringify(linkedContext).includes(pluginDirectory), false);
  const otherContext = { ...developerContext.context, contextId: randomUUID() };
  assert.equal((await workspace.evaluate(`window.spsDesktopWorkspace.getDeveloperProjectContext(${JSON.stringify(otherContext)})`, true)).project, null);
  const otherCompany = await workspaceApi(workspace, "/api/companies", { method: "POST", body: { name: "Context isolation E2E" } });
  assert.equal((await workspace.evaluate(`window.spsDesktopWorkspace.getDeveloperProjectContext(${JSON.stringify({ ...developerContext.context, companyId: otherCompany.id })})`, true)).project, null);
  await assert.rejects(() => workspace.evaluate(`window.spsDesktopWorkspace.getDeveloperProjectContext(${JSON.stringify({ ...developerContext.context, sourcePath: pluginDirectory })})`, true));
  await workspace.evaluate("document.querySelector('.bc-project-refresh').click()");
  await waitPage(workspace, page => page.text.includes("Preview Desktop E2E"), "linked project in Builder");
  if (screenshotDirectory) {
    const screenshot = await workspace.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(screenshotDirectory, "builder-linked-project.png"), Buffer.from(screenshot.data, "base64"));
  }
  const oldContextToken = developerContext.contextToken;
  await workspace.evaluate(`window.spsDesktopWorkspace.openDeveloperProjectContext(${JSON.stringify(developerContext.context)})`, true);
  await waitPage(registry, page => page.text.includes("Linked: Preview Desktop E2E"), "reopened scoped review");
  developerContext = await registryCall(registry, "window.spsRegistry.getDeveloperContext()");
  assert.notEqual(developerContext.contextToken, oldContextToken);
  await assert.rejects(() => registryCall(registry, `window.spsRegistry.clearDeveloperContext(${JSON.stringify({ contextToken: oldContextToken })})`));
  await registry.evaluate("document.querySelector('#clear-developer-context').click()");
  await waitPage(registry, page => page.text.includes("No project linked."), "explicit reference unlink");
  assert.equal((await workspace.evaluate(getContextExpression, true)).project, null);
  await access(path.join(pluginDirectory, "package.json"));
  await registry.evaluate("document.querySelector('.link-developer-context').click()");
  await waitPage(registry, page => page.text.includes("Linked: Preview Desktop E2E"), "explicit reference relink");
  step("verified context isolation, stale-window denial, explicit unlink and unchanged source files");
  if (!liveAuthoring) {
    step("checking failed Preview feedback without starting an AI run");
    const manifestPath = path.join(pluginDirectory, "dist", "manifest.js");
    const staticPath = path.join(pluginDirectory, "sps-plugin.json");
    const originalManifest = await readFile(manifestPath);
    const originalStatic = await readFile(staticPath);
    const invalidManifest = originalManifest.toString("utf8").replace('primitives: []', 'primitives: [{ name: "invalid.fixture" }]');
    assert.notEqual(invalidManifest, originalManifest.toString("utf8"));
    const invalidStatic = JSON.parse(originalStatic.toString("utf8"));
    invalidStatic.runtime.manifestSha256 = createHash("sha256").update(invalidManifest).digest("hex");
    await writeFile(manifestPath, invalidManifest);
    await writeFile(staticPath, `${JSON.stringify(invalidStatic, null, 2)}\n`);
    const staticGates = await registryCall(registry, `window.spsRegistry.runDeveloperGates(${JSON.stringify({ projectId: connected.id })})`, 180_000);
    assert.deepEqual(staticGates.reports.map(report => report.success), [true, true, true]);
    assert.equal((await workspace.evaluate(getContextExpression, true)).validationFeedback.status, "passed");
    await assert.rejects(() => registryCall(registry, `window.spsRegistry.applyDeveloperCandidate(${JSON.stringify({ projectId: connected.id })})`, 180_000), /Invalid plugin manifest/);
    const feedback = (await workspace.evaluate(getContextExpression, true)).validationFeedback;
    assert.equal(feedback.status, "failed");
    assert.equal(feedback.kind, "preview");
    assert.ok(feedback.diagnostics.some(item => item.code === "PREVIEW_CANDIDATE_FAILED"));
    const originalDraft = await workspace.evaluate("document.querySelector('.bc-composer textarea').value");
    const attachmentsBefore = await workspace.evaluate("document.querySelectorAll('.bc-file-chip').length");
    const readConversation = async () => {
      const value = await workspaceApi(workspace, "/api/plugins/sps.plugin-discovery/bridge/data", {
        method: "POST", body: { key: "plugin-builder-workspace", companyId: company.id, params: {} },
      });
      return value.data.conversations.find(item => item.id === developerContext.context.contextId);
    };
    const messagesBefore = (await readConversation()).messages.length;
    await workspace.evaluate("document.querySelector('.bc-project-refresh').click()");
    await waitPage(workspace, page => page.text.includes("Preview · 실패"), "failed Preview feedback in Builder");
    await workspace.evaluate("document.querySelector('.bc-validation-feedback details').open = true");
    await waitPage(workspace, page => page.text.includes("PREVIEW_CANDIDATE_FAILED"), "failed Preview diagnostic details");
    await workspace.evaluate("document.querySelector('.bc-validation-add').click()");
    const draftDeadline = Date.now() + 10_000;
    let feedbackDraft = "";
    while (Date.now() < draftDeadline) {
      feedbackDraft = await workspace.evaluate("document.querySelector('.bc-composer textarea').value");
      if (feedbackDraft.includes("PREVIEW_CANDIDATE_FAILED")) break;
      await delay(100);
    }
    assert.ok(feedbackDraft.startsWith(originalDraft));
    assert.ok(feedbackDraft.includes("PREVIEW_CANDIDATE_FAILED"));
    assert.ok(!feedbackDraft.includes(pluginDirectory));
    assert.equal(await workspace.evaluate("document.querySelectorAll('.bc-file-chip').length"), attachmentsBefore);
    assert.equal((await readConversation()).messages.length, messagesBefore, "Adding feedback automatically sent an AI message.");
    assert.equal(await workspace.evaluate("document.querySelector('.bc-validation-add').disabled"), true);
    if (screenshotDirectory) {
      const screenshot = await workspace.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(path.join(screenshotDirectory, "builder-validation-feedback.png"), Buffer.from(screenshot.data, "base64"));
    }
    await writeFile(manifestPath, originalManifest);
    await writeFile(staticPath, originalStatic);
    await workspace.evaluate(`(() => {
      const textarea = document.querySelector('.bc-composer textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, ${JSON.stringify(originalDraft)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    step("failed Preview feedback reached the existing draft without changing attachments or sending a message");
  }
  if (liveAuthoring) {
    step("sending real Builder authoring request to the dedicated workspace-write CLI Agent");
    const beforeFiles = await collectAuthoringSnapshot(pluginDirectory);
    const prompt = buildLiveBuilderPrompt();
    await workspace.evaluate(`(() => {
      const textarea = document.querySelector('.bc-composer textarea');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, ${JSON.stringify(prompt)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await workspace.evaluate("document.querySelector('.bc-composer').requestSubmit()");
    const end = Date.now() + 330_000;
    let turn = null;
    while (Date.now() < end) {
      const current = await workspaceApi(workspace, "/api/plugins/sps.plugin-discovery/bridge/data", {
        method: "POST", body: { key: "plugin-builder-workspace", companyId: company.id, params: {} },
      });
      const chat = current.data.conversations.find(entry => entry.id === developerContext.context.contextId);
      turn = chat?.messages.find(entry => entry.role === "assistant");
      if (turn?.runId) liveRunId = turn.runId;
      if (turn && !turn.recoveryPending && ["completed", "failed", "cancelled", "interrupted"].includes(turn.status)) break;
      await delay(1_000);
    }
    assert.equal(turn?.status, "completed", `Live Builder authoring did not complete: ${JSON.stringify({ status: turn?.status, recoveryPending: turn?.recoveryPending, message: turn?.content?.slice(0, 1000) })}`);
    authoredFiles = await collectAuthoringSnapshot(pluginDirectory);
    assert.match(liveRunId ?? "", /^[a-f0-9-]{36}$/i, "Live Builder did not return a run ID.");
    const liveRun = await workspaceApi(workspace, `/api/heartbeat-runs/${encodeURIComponent(liveRunId)}`);
    assert.equal(liveRun.status, "succeeded");
    const events = await workspaceApi(workspace, `/api/heartbeat-runs/${liveRunId}/events?limit=200`);
    const invocation = events.find(event => event.eventType === "adapter.invoke")?.payload;
    assert.equal(path.resolve(invocation?.cwd ?? ""), path.resolve(pluginDirectory), "CLI did not execute in the approved test project.");
    assert.ok(invocation.commandArgs.includes("workspace-write"));
    assert.ok(invocation.commandArgs.includes('windows.sandbox="mxc"'));
    assert.ok(!invocation.commandArgs.includes("--dangerously-bypass-approvals-and-sandbox"));
    assert.ok(invocation.commandArgs.includes('service_tier="fast"'));
    assert.equal(invocation.commandArgs[invocation.commandArgs.indexOf("--model") + 1], "gpt-6-luna");
    assert.ok(invocation.commandArgs.includes('model_reasoning_effort="xhigh"'));
    let changedPaths;
    try { changedPaths = verifyLiveBuilderChanges(beforeFiles, authoredFiles); }
    catch (error) {
      const changed = Object.keys(authoredFiles).filter(key => beforeFiles[key] !== authoredFiles[key]);
      throw new Error(`${errorText(error)} Changed paths: ${JSON.stringify(changed)}. CLI reply: ${turn.content?.slice(-4000) ?? ""}`);
    }
    step(`live CLI authored ${changedPaths.length} allowed files through the Builder conversation`);
  }
  await executeBuilderTool(workspace, runContext, "run-sps-authoring-step", {
    authoringSessionId,
    objective: liveAuthoring ? "Live CLI authored the external plugin through Builder." : "Create the public SDK project and connect it to Desktop Developer Mode.",
    status: "passed",
    evidence: [
      { kind: "workspace_file", ref: "external-plugin/package.json", label: "Plugin package" },
      { kind: "workspace_file", ref: "external-plugin/dist/manifest.js", label: "Plugin manifest" },
    ],
  });
  let gates;
  try {
    gates = await registryCall(registry, `window.spsRegistry.runDeveloperGates(${JSON.stringify({ projectId: connected.id })})`, 180_000);
  } catch (error) {
    const diagnosticResult = await registryCall(
      registry,
      `window.spsRegistry.listPreviewDiagnostics(${JSON.stringify({ projectId: connected.id, limit: 200 })})`,
    ).catch(() => null);
    throw new Error(`${errorText(error)} Developer diagnostics: ${JSON.stringify(diagnosticResult)}`);
  }
  assert.deepEqual(gates.reports.map((report) => report.success), [true, true, true], JSON.stringify(gates.reports));
  assert.equal((await workspace.evaluate(getContextExpression, true)).validationFeedback.status, "passed");
  await executeBuilderTool(workspace, runContext, "inspect-sps-plugin-build", {
    authoringSessionId,
    status: "passed",
    summary: "Desktop reproduced build, validation, and test gates.",
    evidence: gates.reports.map((report) => ({ kind: "test", ref: `developer-gates/${connected.id}/${report.command}`, label: `${report.command} gate` })),
  });
  await executeBuilderTool(workspace, runContext, "open-sps-plugin-preview", {
    authoringSessionId,
    summary: "Open the verified candidate in isolated Plugin Preview.",
    evidence: [{ kind: "preview", ref: `preview/${connected.id}`, label: "Isolated Preview request" }],
  });
  const applied = await registryCall(registry, `window.spsRegistry.applyDeveloperCandidate(${JSON.stringify({ projectId: connected.id })})`, 180_000);
  assert.equal(applied.isolated, true);
  assert.equal(applied.plugin?.status, "ready");
  linkedContext = await workspace.evaluate(getContextExpression, true);
  assert.equal(linkedContext.project.verified, true);
  assert.equal(linkedContext.validationFeedback.kind, "preview");
  assert.equal(linkedContext.validationFeedback.status, "passed");

  step("verifying isolated Preview and production Workspace coexist");
  const mainTarget = await waitTarget(debugPort, child, (entry) => entry.id === workspaceTarget.id, "main Workspace still open");
  const previewTarget = await waitTarget(debugPort, child, (entry) => /^http:\/\/127\.0\.0\.1:\d+\//.test(entry.url || "") && entry.id !== mainTarget.id, "isolated Preview CDP target");
  preview = await cdpFor(previewTarget);
  const initialFixture = await preview.evaluate("globalThis.__SPS_PLUGIN_PREVIEW_FIXTURE_V1__");
  assert.equal(initialFixture?.role, "host");
  assert.equal(initialFixture?.viewport, "desktop");
  assert.equal(initialFixture?.uiState, "live");
  assert.ok(await workspace.evaluate("Boolean(document.body?.isConnected)"), "Main Workspace did not coexist with Preview.");
  const previewCompanies = await workspaceApi(preview, "/api/companies");
  assert.ok(previewCompanies[0]?.issuePrefix, "Preview did not create its isolated Workspace");
  await preview.evaluate(`location.assign(${JSON.stringify(`/${previewCompanies[0].issuePrefix}/builder-fixture`)})`);
  await waitPage(preview, page => page.text.includes("Builder Preview Fixture") && page.text.includes("Count: 0"), "actual generated plugin UI");
  await preview.evaluate(`document.querySelector('#builder-fixture-count').click()`);
  await waitPage(preview, page => page.text.includes("Count: 1"), "generated plugin UI interaction");
  if (screenshotDirectory) {
    const screenshot = await preview.command("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path.join(screenshotDirectory, "generated-plugin-preview.png"), Buffer.from(screenshot.data, "base64"));
  }
  const artifact = await resolveDeveloperPackageArtifact({ vaultRoot: path.join(userData, "owner-vault"), build: applied.lastKnownGood });
  assert.equal(artifact.sha256, applied.lastKnownGood.deployment.artifactSha256);
  assert.equal((await inspectPluginArchive(artifact.archivePath)).valid, true);
  if (liveAuthoring) liveArtifact = artifact;
  await registry.evaluate(`document.querySelector('#refresh-developer-projects').click()`);
  await waitPage(registry, page => page.text.includes("Show verified package"), "verified package access button");
  await registry.evaluate(`document.querySelector('.reveal-developer-package').click()`);
  await waitPage(registry, page => page.text.includes("Opened the last Preview-verified package") && page.text.includes(artifact.sha256), "verified package reveal handoff");

  step("switching fixture to Member, mobile, and error state");
  const state = await registryCall(registry, "window.spsRegistry.getPreviewState()");
  const updated = await registryCall(registry, `window.spsRegistry.updatePreviewEnvironment(${JSON.stringify({ projectId: connected.id, fixture: { role: "member", viewport: "mobile", uiState: "error", fixtures: { node: { enabled: true }, runtime: { enabled: true }, source: { enabled: true } } } })})`);
  assert.equal(updated.fixture.role, "member");
  assert.equal(updated.buildId, state.buildId);
  const reloadedFixture = await waitFixture(preview, { role: "member", viewport: "mobile", uiState: "error" }, "Preview fixture reload");
  assert.deepEqual({ role: reloadedFixture?.role, viewport: reloadedFixture?.viewport, uiState: reloadedFixture?.uiState }, { role: "member", viewport: "mobile", uiState: "error" });

  step("packing the verified external plugin without changing production lifecycle");
  await mkdir(path.dirname(packageArchivePath), { recursive: true });
  await execFileAsync(process.execPath, [sdkCliPath, "pack", pluginDirectory, "--out", packageArchivePath, "--overwrite"], {
    cwd: desktopRoot,
    windowsHide: true,
  });
  const archive = await inspectPluginArchive(packageArchivePath);
  assert.equal(archive.valid, true, archive.errors.join("\n"));
  assert.equal(archive.package.staticManifest.plugin.id, "local.preview-desktop-e2e");
  await executeBuilderTool(workspace, runContext, "create-sps-plugin-package", {
    authoringSessionId,
    packageRef: "artifacts/preview-desktop-e2e.spsplugin",
    packageVersion: "0.1.0",
    summary: "Created the verified package candidate with the public SDK CLI.",
    evidence: [{ kind: "test", ref: `developer-gates/${connected.id}/complete`, label: "All Developer Mode gates" }],
  });
  const ledger = await workspaceApi(workspace, "/api/plugins/sps.plugin-discovery/bridge/data", {
    method: "POST",
    body: { key: "plugin-builder-workspace", companyId: company.id, params: {} },
  });
  const authored = ledger?.data?.authoringSessions?.find((session) => session.id === authoringSessionId);
  assert.deepEqual(authored?.events?.map((event) => event.type), ["project", "authoring", "build", "preview", "package"]);
  assert.equal(authored?.status, "packaged");
  assert.deepEqual(lifecycleSnapshot(await workspaceApi(workspace, "/api/plugins")), productionBefore);
  assert.equal(productionBefore.some((plugin) => plugin.pluginKey === "local.preview-desktop-e2e"), false);

  // Page.crash produces Electron's renderer-only render-process-gone event.
  // It is intentionally scoped to Preview; no test IPC or production bypass is used.
  step("crashing only the Preview renderer");
  let crashed = false;
  try { await preview.command("Page.crash"); crashed = true; } catch { crashed = true; }
  assert.equal(crashed, true);
  await waitPage(workspace, (page) => Boolean(page.text), "main Workspace after Preview renderer crash", 30_000);
  let diagnostics = [];
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const diagnosticResult = await registryCall(
      registry,
      `window.spsRegistry.listPreviewDiagnostics(${JSON.stringify({ projectId: connected.id, limit: 200 })})`,
    );
    assert.equal(diagnosticResult?.warning, null, diagnosticResult?.warning);
    diagnostics = Array.isArray(diagnosticResult?.events) ? diagnosticResult.events : [];
    if (diagnostics.some((entry) => entry.code === "PREVIEW_RENDERER_GONE" || entry.code === "PREVIEW_RENDERER_LOAD_FAILED")) break;
    await delay(350);
  }
  const rendererFailure = diagnostics.find((entry) => entry.code === "PREVIEW_RENDERER_GONE" || entry.code === "PREVIEW_RENDERER_LOAD_FAILED");
  assert.ok(rendererFailure, `Preview renderer failure was not recorded: ${JSON.stringify(diagnostics)}`);
  const safeDiagnostics = JSON.stringify(diagnostics);
  assert.doesNotMatch(safeDiagnostics, new RegExp(pluginDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  // Manifest errors may name the legitimate `secrets.use` capability.
  assert.doesNotMatch(safeDiagnostics, /"(?:access_token|refresh_token|authorization|password|secret)"\s*:|Bearer\s+(?!\[redacted\])[A-Za-z0-9._~+/=-]{8,}|\bsk-[A-Za-z0-9_-]{12,}/i);
  await registryCall(registry, `window.spsRegistry.removeDeveloperProject(${JSON.stringify({ projectId: connected.id })})`);
  const disconnected = await workspace.evaluate(getContextExpression, true);
  assert.equal(disconnected.project, null);
  assert.equal(disconnected.missingProject, true);
  await workspace.evaluate("document.querySelector('.bc-project-refresh').click()");
  await waitPage(workspace, page => page.text.includes("연결했던 프로젝트가 목록에서 제거되었습니다"), "dangling link in Builder");
  await access(path.join(pluginDirectory, "package.json"));
  await registryCall(registry, `window.spsRegistry.clearDeveloperContext(${JSON.stringify({ contextToken: developerContext.contextToken })})`);
  assert.equal((await workspace.evaluate(getContextExpression, true)).missingProject, false);
  step("verified redacted diagnostics and live production Workspace");
  if (liveAuthoring) {
    await mkdir(path.join(desktopRoot, "dist"), { recursive: true });
    const retained = await mkdtemp(path.join(desktopRoot, "dist", "builder-live-verified-"));
    const retainedArchive = path.join(retained, "builder-preview-fixture.spsplugin");
    await copyFile(liveArtifact.archivePath, retainedArchive);
    assert.equal(createHash("sha256").update(await readFile(retainedArchive)).digest("hex"), liveArtifact.sha256);
    await writeFile(path.join(retained, "result.json"), `${JSON.stringify({
      schemaVersion: 1, evidenceKind: "development-smoke", model: "gpt-6-luna",
      reasoningEffort: "xhigh", fastMode: true, sandbox: "workspace-write",
      actualRunSucceeded: true, fileHashes: authoredFiles,
      packageSha256: liveArtifact.sha256, previewCounter: "Count: 1",
      installedInProduction: false,
    }, null, 2)}\n`, { flag: "wx" });
    step(`retained verified development package in ${path.basename(retained)}`);
  }
  console.log(`SPS Plugin Preview Desktop E2E passed (${packagedBinary ? "packaged" : "source"}${liveAuthoring ? ", live CLI authoring" : ""}).`);
} catch (error) {
  const notes = [];
  for (const [name, cdp] of [["setup", setup], ["workspace", workspace], ["registry", registry], ["preview", preview]]) {
    if (!cdp) continue;
    try { notes.push(`${name}: ${JSON.stringify(await cdp.evaluate("({ url: location.href, title: document.title, text: document.body?.innerText?.slice(0, 2000) || '' })"))}`); } catch (diagnosticError) { notes.push(`${name}: ${errorText(diagnosticError)}`); }
  }
  throw new Error(`${errorText(error)}\n${notes.join("\n")}\n${output.trim()}`);
} finally {
  step("cleaning isolated E2E processes and data");
  await cleanupTimeout(
    Promise.all([setup, workspace, registry, preview].filter(Boolean).map((cdp) => cdp.close().catch(() => undefined))),
    "CDP sessions",
  ).catch((error) => console.warn(errorText(error)));
  step("CDP sessions closed");
  await cleanupTimeout(stopTree(child), "Desktop process tree").catch((error) => console.warn(errorText(error)));
  step("Desktop process tree stopped");
  const postgresStopped = await cleanupTimeout(stopTemporaryPostgres(temporaryRoot), "temporary PostgreSQL processes")
    .then(() => true)
    .catch((error) => { console.warn(errorText(error)); return false; });
  step(postgresStopped ? "temporary PostgreSQL processes stopped" : "temporary PostgreSQL process cleanup could not be confirmed");
  await cleanupTimeout(identity.close(), "mock Identity server").catch((error) => console.warn(errorText(error)));
  step("mock Identity server closed");
  await cleanupTimeout(removeRetry(temporaryRoot), "temporary data", 20_000)
    .catch((error) => console.warn(`Could not remove Preview Desktop E2E temp data: ${errorText(error)}`));
  step("cleanup complete");
}

// The test has no work left after the successful try path and cleanup above.
// Flush a non-empty final record so every earlier step reaches the parent
// process, then terminate any platform fetch handles that Node may retain.
await new Promise((resolve) => process.stdout.write("[preview-e2e] evidence flushed\n", resolve));
process.exit(0);

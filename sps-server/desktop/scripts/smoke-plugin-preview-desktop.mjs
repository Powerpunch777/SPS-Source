import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { access, mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { inspectPluginArchive } from "@sonparkserver/plugin-sdk/registry/archive-inspector-v1.mjs";

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedBinary = process.env.SPS_DESKTOP_E2E_BINARY?.trim();
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

async function makePlugin(directory) {
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
}

const identity = mockIdentity();
const debugPort = await freePort();
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sps-plugin-preview-desktop-e2e-"));
const userData = path.join(temporaryRoot, "user-data");
const pluginDirectory = path.join(temporaryRoot, "external-plugin");
const packageArchivePath = path.join(temporaryRoot, "artifacts", "preview-desktop-e2e.spsplugin");
let child; let setup; let workspace; let registry; let preview; let workspaceTarget; let output = "";

try {
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

  workspaceTarget = await waitTarget(debugPort, child, (entry) => /^http:\/\/127\.0\.0\.1:\d+\//.test(entry.url || ""), "Owner Workspace", 240_000);
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
    if (Array.isArray(builderTools) && builderTools.length === 5) break;
    await delay(250);
  }
  const builderPluginState = await workspaceApi(workspace, "/api/plugins");
  assert.deepEqual(
    builderTools.map((tool) => tool.name).sort(),
    [
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
    (page) => page.url.includes("/builder") && page.text.includes("Plugin Builder") && page.text.includes("SPS Preview Desktop E2E"),
    "Plugin Builder authoring surface",
  );
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

  step("creating and connecting external SDK plugin");
  await makePlugin(pluginDirectory);
  await executeBuilderTool(workspace, runContext, "run-sps-authoring-step", {
    authoringSessionId,
    objective: "Create the public SDK project and connect it to Desktop Developer Mode.",
    status: "passed",
    evidence: [
      { kind: "workspace_file", ref: "external-plugin/package.json", label: "Plugin package" },
      { kind: "workspace_file", ref: "external-plugin/src/manifest.js", label: "Plugin manifest" },
    ],
  });
  const connected = await registryCall(registry, `window.spsRegistry.connectDeveloperProject(${JSON.stringify({ sourcePath: pluginDirectory, sourceLabel: "external-plugin", displayName: "Preview Desktop E2E" })})`);
  assert.match(connected.id, /^dev-/);
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

  step("verifying isolated Preview and production Workspace coexist");
  const mainTarget = await waitTarget(debugPort, child, (entry) => entry.id === workspaceTarget.id, "main Workspace still open");
  const previewTarget = await waitTarget(debugPort, child, (entry) => /^http:\/\/127\.0\.0\.1:\d+\//.test(entry.url || "") && entry.id !== mainTarget.id, "isolated Preview CDP target");
  preview = await cdpFor(previewTarget);
  const initialFixture = await preview.evaluate("globalThis.__SPS_PLUGIN_PREVIEW_FIXTURE_V1__");
  assert.equal(initialFixture?.role, "host");
  assert.equal(initialFixture?.viewport, "desktop");
  assert.equal(initialFixture?.uiState, "live");
  assert.ok(await workspace.evaluate("Boolean(document.body?.isConnected)"), "Main Workspace did not coexist with Preview.");

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
  assert.doesNotMatch(safeDiagnostics, /access_token|refresh_token|authorization|password|secret/i);
  step("verified redacted diagnostics and live production Workspace");
  console.log(`SPS Plugin Preview Desktop E2E passed (${packagedBinary ? "packaged" : "source"}).`);
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

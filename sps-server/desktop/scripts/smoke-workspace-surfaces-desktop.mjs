import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtemp, rm, access } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { once } from "node:events";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const packagedBinary = process.env.SPS_DESKTOP_E2E_BINARY?.trim();

if (process.platform !== "win32") {
  throw new Error("Workspace Surfaces Desktop E2E currently targets the Windows release.");
}
if (!packagedBinary) {
  throw new Error("Set SPS_DESKTOP_E2E_BINARY to a packaged SPS Desktop.exe.");
}
await access(packagedBinary);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function base64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

async function findAvailablePort() {
  return await new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : port ? resolve(port) : reject(new Error("Could not reserve a CDP port.")));
    });
  });
}

async function removeTemporaryDirectory(directory) {
  let lastError = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
      return;
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }
  throw lastError;
}

async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  await execFileAsync("taskkill", ["/pid", String(child.pid), "/T", "/F"]).catch(() => undefined);
  await Promise.race([once(child, "exit").catch(() => undefined), delay(8_000)]);
}

async function stopPackagedRuntimeOrphans() {
  const runtimeSuffix = "sps-server/desktop/dist/win-unpacked/resources/sps-owner-host-runtime";
  const script = [
    `$suffix = ${JSON.stringify(runtimeSuffix)}`,
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    "  ($_.Name -eq 'node.exe' -or $_.Name -eq 'postgres.exe') -and",
    "  $_.CommandLine -and",
    "  (($_.CommandLine -replace '\\\\', '/').IndexOf($suffix, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)",
    "}",
    "$targets | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    "Start-Sleep -Milliseconds 300",
    "$remaining = Get-CimInstance Win32_Process | Where-Object {",
    "  ($_.Name -eq 'node.exe' -or $_.Name -eq 'postgres.exe') -and",
    "  $_.CommandLine -and",
    "  (($_.CommandLine -replace '\\\\', '/').IndexOf($suffix, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)",
    "}",
    "if (@($remaining).Count -gt 0) { throw \"Packaged Owner Host runtime processes remain after E2E cleanup.\" }",
  ].join("\n");
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
}

function createMockIdentityServer() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = keys.publicKey.export({ format: "jwk" });
  const codes = new Map();
  const refreshTokens = new Set();
  const issued = [];
  let origin = null;

  function accessToken() {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url({ alg: "RS256", kid: "sps-desktop-e2e", typ: "JWT" });
    const payload = base64Url({
      iss: origin,
      aud: "sps-core",
      sub: "sps-desktop-e2e-owner",
      email: "desktop-e2e-owner@example.test",
      name: "SPS Desktop E2E Owner",
      scope: "sps.core.session",
      iat: now,
      nbf: now - 1,
      exp: now + 60 * 60,
    });
    const input = `${header}.${payload}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString("base64url")}`;
  }

  function tokenResponse() {
    const refreshToken = `refresh-${randomBytes(18).toString("base64url")}`;
    refreshTokens.add(refreshToken);
    const response = {
      access_token: accessToken(),
      refresh_token: refreshToken,
      expires_in: 3600,
      account: {
        subject: "sps-desktop-e2e-owner",
        email: "desktop-e2e-owner@example.test",
        name: "SPS Desktop E2E Owner",
        picture: null,
      },
    };
    issued.push(response);
    return response;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", origin || "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify({ keys: [{ ...publicJwk, kid: "sps-desktop-e2e", alg: "RS256", use: "sig" }] }));
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/desktop/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state");
      if (!redirectUri || !state) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Missing SPS Desktop redirect state.");
        return;
      }
      const code = `code-${randomBytes(18).toString("base64url")}`;
      codes.set(code, true);
      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", code);
      redirect.searchParams.set("state", state);
      response.writeHead(302, { location: redirect.toString(), "cache-control": "no-store" });
      response.end();
      return;
    }
    let body = {};
    if (request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { body = {}; }
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/token") {
      if (!codes.delete(String(body.code || ""))) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid desktop authorization code" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(tokenResponse()));
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/refresh") {
      if (!refreshTokens.has(String(body.refresh_token || ""))) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid refresh token" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      response.end(JSON.stringify(tokenResponse()));
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/revoke") {
      refreshTokens.delete(String(body.refresh_token || ""));
      response.writeHead(204).end();
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  return {
    async start() {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      const address = server.address();
      assert.ok(address && typeof address === "object", "Mock Identity did not bind a loopback address.");
      origin = `http://127.0.0.1:${address.port}`;
      return { origin, issued };
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

async function listTargets(port) {
  return await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) }).then((response) => response.json());
}

async function waitForTarget(port, child, predicate, description, timeoutMs = 120_000) {
  const expiresAt = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < expiresAt) {
    if (child.exitCode !== null) throw new Error(`SPS Desktop exited before ${description} (exit ${child.exitCode}).`);
    try {
      lastTargets = await listTargets(port);
      const match = lastTargets.find((target) => target?.type === "page" && target.webSocketDebuggerUrl && predicate(target));
      if (match) return match;
    } catch {
      // Electron has not published CDP targets yet.
    }
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${description}. CDP targets: ${lastTargets.map((target) => `${target.title || "untitled"} ${target.url || ""}`).join(" | ")}`);
}

async function openCdp(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await Promise.race([
    once(socket, "open"),
    delay(8_000).then(() => { throw new Error("Timed out opening a Desktop CDP session."); }),
  ]);
  let id = 0;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timeout = setTimeout(() => reject(new Error(`CDP ${method} timed out.`)), 10_000);
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== requestId) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    socket.addEventListener("message", listener);
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  return {
    async command(method, params = {}) {
      return await call(method, params);
    },
    async evaluate(expression, awaitPromise = false) {
      const result = await call("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Desktop page evaluation failed.");
      return result.result?.value;
    },
    async close() { socket.close(); },
  };
}

async function describePage(cdp) {
  return await cdp.evaluate(`({ title: document.title, route: location.href, body: document.body?.innerText?.slice(0, 4000) || "" })`);
}

async function click(cdp, selector, label) {
  const result = await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, reason: "not found" };
    if (element.disabled) return { ok: false, reason: "disabled" };
    element.scrollIntoView({ block: "center", inline: "center" });
    element.click();
    return { ok: true, text: element.textContent || "" };
  })()`);
  assert.equal(result?.ok, true, `${label} could not be clicked: ${result?.reason || "unknown"}`);
}

async function waitForPage(cdp, predicate, description, timeoutMs = 45_000) {
  const expiresAt = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < expiresAt) {
    try {
      last = await describePage(cdp);
      if (predicate(last)) return last;
    } catch {
      // Navigation can briefly detach the current document.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${description}. Last page: ${JSON.stringify(last)}`);
}

async function api(cdp, pathName, options = {}) {
  const result = await cdp.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(pathName)}, {
      method: ${JSON.stringify(options.method || "GET")},
      credentials: "include",
      headers: { "content-type": "application/json", ...( ${JSON.stringify(options.headers || {})} ) },
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

async function navigateByDomLink(cdp, suffix, label) {
  const selector = `a[href$="${suffix}"]`;
  await click(cdp, selector, label);
}

const mockIdentity = createMockIdentityServer();
const debugPort = await findAvailablePort();
const userDataDirectory = await mkdtemp(path.join(os.tmpdir(), "sps-workspace-surfaces-e2e-"));
let child = null;
let setupCdp = null;
let workspaceCdp = null;
let appOutput = "";

try {
  const { origin: identityUrl, issued } = await mockIdentity.start();
  child = spawn(packagedBinary, [
    `--user-data-dir=${userDataDirectory}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
  ], {
    cwd: path.dirname(packagedBinary),
    env: {
      ...process.env,
      SPS_IDENTITY_URL: identityUrl,
      SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1",
      SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1",
      SPS_DESKTOP_E2E: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const captureOutput = (chunk) => {
    appOutput = `${appOutput}${chunk.toString()}`.slice(-24_000);
  };
  child.stdout?.on("data", captureOutput);
  child.stderr?.on("data", captureOutput);

  const setupTarget = await waitForTarget(
    debugPort,
    child,
    (target) => target.title === "SPS Desktop",
    "the SPS Desktop setup window",
  );
  setupCdp = await openCdp(setupTarget);
  await waitForPage(setupCdp, (page) => page.body.includes("SPS"), "the SPS setup content");
  await click(setupCdp, "#start-sps-account", "SPS sign-in");
  await waitForPage(setupCdp, () => issued.length > 0, "the mock Identity authorization callback", 30_000);
  await waitForPage(setupCdp, (page) => page.body.includes("Create") || page.body.includes("Server"), "the post-sign-in Host choice", 45_000);
  await click(setupCdp, "#create-owner-server", "Create SPS Server");

  const workspaceTarget = await waitForTarget(
    debugPort,
    child,
    (target) => /^http:\/\/127\.0\.0\.1:\d+\//.test(target.url || ""),
    "the authenticated SPS Workspace BrowserWindow",
    150_000,
  );
  workspaceCdp = await openCdp(workspaceTarget);
  await waitForPage(workspaceCdp, (page) => page.body.includes("Workspace") || page.body.includes("Dashboard"), "the Workspace Core UI", 90_000);

  const companies = await api(workspaceCdp, "/api/companies");
  const company = Array.isArray(companies) ? companies[0] : null;
  assert.ok(company?.id && company?.issuePrefix, `The isolated Host did not create a Workspace: ${JSON.stringify(companies)}`);
  const companyPrefix = company.issuePrefix;

  // A new Core Workspace deliberately redirects an empty company to the
  // Assistant setup surface. This isolated, non-running fixture keeps the
  // test focused on the neutral Dashboard contract rather than onboarding.
  const assistants = await api(workspaceCdp, `/api/companies/${company.id}/agents`);
  if (!Array.isArray(assistants) || assistants.length === 0) {
    await api(workspaceCdp, `/api/companies/${company.id}/agents`, {
      method: "POST",
      body: {
        name: "Workspace Surfaces E2E Assistant",
        role: "engineer",
        adapterType: "process",
        adapterConfig: {},
      },
    });
  }

  await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/dashboard`)})`);
  const neutral = await waitForPage(
    workspaceCdp,
    (page) => page.body.includes("Neutral Workspace") || page.body.includes("No Dashboard widgets yet"),
    "the unselected Neutral Workspace Shell",
  );
  assert.ok(neutral.route.includes(`/${companyPrefix}/dashboard`), `Neutral Workspace route was unexpected: ${neutral.route}`);

  // A fresh SPS Host intentionally starts with Plugin Builder only. Install the
  // packaged reference Workplane through the real Host API so this flow also
  // verifies optional local-package installation without changing that default.
  const packagedTeamWorkplanePath = path.join(
    path.dirname(packagedBinary),
    "resources",
    "sps-owner-host-runtime",
    "sps-room-chat",
  );
  await api(workspaceCdp, "/api/plugins/install", {
    method: "POST",
    body: {
      packageName: packagedTeamWorkplanePath,
      isLocalPath: true,
    },
  });

  const installed = await api(workspaceCdp, `/api/plugins/companies/${company.id}`);
  const plugins = installed?.plugins ?? [];
  const builder = plugins.find((plugin) => plugin.pluginKey === "sps.plugin-discovery" || /plugin builder/i.test(`${plugin.pluginKey} ${plugin.displayName}`));
  const teamWorkplane = plugins.find((plugin) => /room-chat|team workplane/i.test(`${plugin.pluginKey} ${plugin.displayName}`));
  assert.ok(builder?.id, `Bundled Plugin Builder is unavailable: ${JSON.stringify(plugins)}`);
  assert.ok(teamWorkplane?.id, `Bundled Team Workplane is unavailable: ${JSON.stringify(plugins)}`);

  await api(workspaceCdp, `/api/plugins/${builder.id}/companies/${company.id}/activation`, {
    method: "PUT",
    body: { enabled: true },
  });
  await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/builder`)})`);
  await waitForPage(
    workspaceCdp,
    (page) => page.route.includes("/builder") && page.body.includes("Plugin Builder") && page.body.includes("Authoring projects"),
    "the Plugin Builder project surface",
  );

  await api(workspaceCdp, `/api/plugins/${teamWorkplane.id}/companies/${company.id}/activation`, {
    method: "PUT",
    body: { enabled: true },
  });
  let teamRuntime = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    teamRuntime = await api(workspaceCdp, `/api/plugins/${teamWorkplane.id}/dashboard`);
    if (teamRuntime?.worker?.status === "running") break;
    await delay(250);
  }
  if (teamRuntime?.worker?.status !== "running") {
    const teamLogs = await api(workspaceCdp, `/api/plugins/${teamWorkplane.id}/logs?limit=50`);
    throw new Error(
      `Team Workplane worker did not become ready: ${JSON.stringify({
        plugin: teamWorkplane,
        runtime: teamRuntime,
        logs: teamLogs,
      })}`,
    );
  }
  let providers = [];
  let teamProvider = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    providers = await api(workspaceCdp, `/api/companies/${company.id}/workspace-shell/providers`);
    teamProvider = providers.find((provider) => provider.pluginId === teamWorkplane.id) ?? null;
    if (teamProvider?.shell?.id) break;
    await delay(250);
  }
  if (!teamProvider?.shell?.id) {
    throw new Error(`Team Workplane did not expose a Workspace Shell: ${JSON.stringify(providers)}`);
  }
  await api(workspaceCdp, `/api/companies/${company.id}/workspace-shell`, {
    method: "PUT",
    body: { pluginId: teamWorkplane.id, shellId: teamProvider.shell.id },
  });
  await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/dashboard`)})`);
  const teamWidgetPage = await waitForPage(
    workspaceCdp,
    (page) => page.body.includes("Team Workplane"),
    "the Team Workplane Dashboard widget",
  );
  assert.doesNotMatch(
    teamWidgetPage.body,
    /No worker registered|worker is unavailable|failed to load/i,
    "The active Team Workplane Dashboard widget did not reach its worker.",
  );
  const teamDashboard = await api(workspaceCdp, `/api/companies/${company.id}/workspace-dashboard`);
  assert.ok(teamDashboard.widgets?.some((widget) => widget.pluginId === teamWorkplane.id), "Team Workplane Dashboard widget was not registered.");
  await navigateByDomLink(workspaceCdp, "/inbox", "Inbox navigation");
  await waitForPage(workspaceCdp, (page) => page.body.includes("Inbox") && page.body.includes("Plugin reports"), "the Workspace Inbox screen");
  await api(workspaceCdp, `/api/companies/${company.id}/workspace-inbox`);

  await api(workspaceCdp, `/api/plugins/${teamWorkplane.id}/companies/${company.id}/activation`, {
    method: "PUT",
    body: { enabled: false },
  });
  await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/dashboard`)})`);
  const fallback = await waitForPage(
    workspaceCdp,
    (page) => page.body.includes("Neutral Shell restored"),
    "the Neutral Shell fallback warning",
  );
  assert.match(fallback.body, /selected shell/i, `Neutral fallback did not explain the disabled Shell: ${fallback.body}`);

  console.log("Packaged SPS Desktop Workspace Surfaces E2E passed.");
} catch (error) {
  const diagnostics = [];
  for (const [label, cdp] of [["setup", setupCdp], ["workspace", workspaceCdp]]) {
    if (!cdp) continue;
    try { diagnostics.push(`${label}: ${JSON.stringify(await describePage(cdp))}`); } catch (diagnosticError) { diagnostics.push(`${label}: ${errorText(diagnosticError)}`); }
  }
  if (appOutput.trim()) diagnostics.push(`app-output:\n${appOutput.trim()}`);
  throw new Error(`${errorText(error)}\n${diagnostics.join("\n")}`);
} finally {
  const quitCdp = workspaceCdp ?? setupCdp;
  if (quitCdp && child?.exitCode === null) {
    await quitCdp.command("Browser.close").catch(() => undefined);
    await Promise.race([once(child, "exit").catch(() => undefined), delay(20_000)]);
  }
  await workspaceCdp?.close().catch(() => undefined);
  await setupCdp?.close().catch(() => undefined);
  await stopProcessTree(child);
  await stopPackagedRuntimeOrphans();
  await mockIdentity.close().catch(() => undefined);
  await removeTemporaryDirectory(userDataDirectory).catch((error) => {
    console.warn(`Could not remove isolated SPS Desktop E2E data: ${errorText(error)}`);
  });
}

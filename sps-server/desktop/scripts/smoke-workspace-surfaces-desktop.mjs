import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { access, readFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { once } from "node:events";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { parseE2eHostReadyTimeout } from "./e2e-host-ready-timeout.mjs";
import { runNoAiChecklistAcceptance } from "./no-ai-checklist-acceptance.mjs";
import { saveCoreRecoverySettings } from "../src/core-recovery-store.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT } from "./preview-e2e-cleanup-contract.mjs";
import { shutdownPreviewE2eDesktop } from "./preview-e2e-shutdown.mjs";
import { createWorkspaceE2eChildTracker } from "./workspace-e2e-child-tracker.mjs";
import { workspaceE2eCleanupDisposition, workspaceE2eCleanupFailureReason } from "./workspace-e2e-cleanup-contract.mjs";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";
import { annotatePreviewE2eCdpFailure, snapshotPreviewE2eFailure } from "./preview-e2e-failure-diagnostics.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopVersion = JSON.parse(await readFile(path.join(scriptDirectory, "..", "package.json"), "utf8")).version;
const packagedBinary = process.env.SPS_DESKTOP_E2E_BINARY?.trim();
const sourceElectron = process.env.SPS_DESKTOP_E2E_SOURCE === "1"
  ? path.join(scriptDirectory, "..", "node_modules", "electron", "dist", "electron.exe")
  : null;
const hostReadyTimeoutMs = parseE2eHostReadyTimeout(process.env.SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS);
const keepE2eData = process.env.SPS_DESKTOP_E2E_KEEP_DATA === "1";
const screenshotPath = process.env.SPS_DESKTOP_E2E_SCREENSHOT?.trim() || null;
const runtimeDiscovery = process.argv.includes("--runtime-discovery");
const noAiChecklist = runtimeDiscovery || process.argv.includes("--no-ai-checklist");
const nativeManagement = process.argv.includes("--native-management");
const executionControlOnly = process.argv.includes("--execution-control");
const ownedJobCleanupPending = process.argv.includes(OWNED_JOB_CLEANUP_ARGUMENT);
const launched = createWorkspaceE2eChildTracker();
let cleanupDisposition;

if (process.platform !== "win32") {
  throw new Error("Workspace Surfaces Desktop E2E currently targets the Windows release.");
}
if (!packagedBinary && !sourceElectron) {
  throw new Error("Set SPS_DESKTOP_E2E_BINARY to a packaged SPS Desktop.exe.");
}
await access(packagedBinary || sourceElectron);
if (noAiChecklist && !sourceElectron) throw new Error("The No-AI reference fixture is source-only acceptance, not packaged release evidence.");
if (nativeManagement && (!sourceElectron || packagedBinary || noAiChecklist)) throw new Error("Prepared Native management is a separate source-only acceptance mode.");
if (executionControlOnly && (!sourceElectron || packagedBinary || noAiChecklist || nativeManagement)) {
  throw new Error("Workspace execution control is a separate source-only acceptance mode.");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function base64Url(value) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

const d2RequestMonitorStartExpression = String.raw`(() => {
  const originalFetch = window.fetch;
  window.__spsD2OriginalFetch = originalFetch;
  window.__spsD2Requests = [];
  window.fetch = function(input, init) {
    const requestUrl = input instanceof Request
      ? input.url
      : input instanceof URL
        ? input.href
        : String(input);
    window.__spsD2Requests.push(requestUrl);
    return originalFetch.call(window, input, init);
  };
})()`;

const d2RequestMonitorStopExpression = String.raw`(() => {
  const requests = window.__spsD2Requests || [];
  if (window.__spsD2OriginalFetch) window.fetch = window.__spsD2OriginalFetch;
  delete window.__spsD2OriginalFetch;
  delete window.__spsD2Requests;
  return requests;
})()`;

function legacyWorkspaceDataRequests(requestUrls) {
  return requestUrls.filter((requestUrl) => {
    const pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
    return pathname.endsWith("/agents") || pathname.endsWith("/workspace-dashboard");
  });
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

async function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  await execFileAsync("taskkill", ["/pid", String(child.pid), "/T", "/F"],
    { timeout: 15_000, windowsHide: true }).catch(() => undefined);
  await Promise.race([once(child, "exit").catch(() => undefined), delay(8_000)]);
}

async function assertNoPackagedRuntimeOrphans(userDataDirectory) {
  const runtimeSuffix = path.join(userDataDirectory, "owner-host-runtime").replaceAll("\\", "/");
  const script = [
    `$suffix = ${JSON.stringify(runtimeSuffix)}`,
    "$targets = Get-CimInstance Win32_Process | Where-Object {",
    "  ($_.Name -eq 'node.exe' -or $_.Name -eq 'postgres.exe') -and",
    "  $_.CommandLine -and",
    "  (($_.CommandLine -replace '\\\\', '/').IndexOf($suffix, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)",
    "}",
    "if (@($targets).Count -gt 0) { throw \"Packaged Owner Host runtime processes remain after E2E cleanup.\" }",
  ].join("\n");
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 15_000, windowsHide: true });
}

async function boundedCleanup(operation, label, timeoutMs = 15_000) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} cleanup timed out.`), {
      code: "ERR_WORKSPACE_E2E_CLEANUP_TIMEOUT",
    })), timeoutMs);
  })]); }
  finally { clearTimeout(timer); }
}

function createMockIdentityServer() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = keys.publicKey.export({ format: "jwk" });
  const codes = new Map();
  const refreshTokens = new Set();
  const issued = [];
  const capturedAuthorizationUrls = [];
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
      const challenge = url.searchParams.get("code_challenge");
      const deviceId = url.searchParams.get("device_id");
      let callback;
      try { callback = new URL(redirectUri); } catch { callback = null; }
      if (!callback || callback.protocol !== "http:" || callback.hostname !== "127.0.0.1"
        || callback.pathname !== "/oauth2/callback" || !callback.port || callback.username || callback.password
        || !/^[A-Za-z0-9_-]{43}$/.test(state || "") || !/^[A-Za-z0-9_-]{43}$/.test(challenge || "")
        || url.searchParams.get("code_challenge_method") !== "S256"
        || !/^[A-Za-z0-9_-]{16,128}$/.test(deviceId || "")) {
        response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        response.end("Missing SPS Desktop redirect state.");
        return;
      }
      const code = `code-${randomBytes(18).toString("base64url")}`;
      codes.set(code, { challenge, deviceId });
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
    if (request.method === "POST" && url.pathname === "/__e2e/capture-authorization") {
      const authorizationUrl = body?.authorizationUrl;
      let authorization;
      try { authorization = new URL(authorizationUrl); } catch { authorization = null; }
      if (request.socket.remoteAddress !== "127.0.0.1" || !authorization || authorization.origin !== origin
        || authorization.pathname !== "/v1/desktop/authorize" || authorization.username || authorization.password
        || authorization.hash || !authorization.searchParams.has("state")) {
        response.writeHead(400, { "content-type": "application/json", "cache-control": "no-store" });
        response.end(JSON.stringify({ error: "invalid E2E authorization capture" }));
        return;
      }
      capturedAuthorizationUrls.push(authorization.href);
      response.writeHead(204, { "cache-control": "no-store" }).end();
      return;
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/token") {
      const code = codes.get(String(body.code || ""));
      const challenge = typeof body.code_verifier === "string"
        ? createHash("sha256").update(body.code_verifier).digest("base64url") : null;
      if (!code || challenge !== code.challenge || body.device_id !== code.deviceId) {
        response.writeHead(400, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "invalid desktop authorization code" }));
        return;
      }
      codes.delete(String(body.code));
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
    capturedAuthorizationUrls,
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

async function followCapturedIdentityAuthorization(mockIdentity, expectedOrigin) {
  const expiresAt = Date.now() + 30_000;
  while (!mockIdentity.capturedAuthorizationUrls.length && Date.now() < expiresAt) await delay(50);
  assert.equal(mockIdentity.capturedAuthorizationUrls.length, 1,
    "Source E2E must capture one SPS Identity authorization URL without launching a system browser.");
  const authorizationUrl = mockIdentity.capturedAuthorizationUrls.shift();
  const authorization = new URL(authorizationUrl);
  assert.equal(authorization.origin, expectedOrigin);
  assert.equal(authorization.pathname, "/v1/desktop/authorize");
  assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
  assert.match(authorization.searchParams.get("state") || "", /^[A-Za-z0-9_-]{43}$/);
  assert.match(authorization.searchParams.get("code_challenge") || "", /^[A-Za-z0-9_-]{43}$/);
  const response = await fetch(authorization, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200, "Mock Identity must complete the actual state/PKCE callback.");
  const callbackPage = await response.text();
  assert.match(callbackPage, /sign-in|sign in|completed/i);
}

async function openCdp(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  let socketFailed = false;
  const socketFailure = () => {
    if (socketFailed) return;
    socketFailed = true;
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      socket.removeEventListener("message", request.listener);
      request.reject(new Error("CDP socket closed before the response arrived."));
    }
    pending.clear();
  };
  let opened = false;
  let rejectOpen;
  let openTimeout;
  let openingListener;
  const onSocketFailure = () => {
    socketFailure();
    if (!opened) {
      clearTimeout(openTimeout);
      if (openingListener) socket.removeEventListener("open", openingListener);
      rejectOpen?.(new Error("CDP socket failed before opening."));
    }
    try { socket.close(); } catch {}
  };
  socket.addEventListener("close", onSocketFailure);
  socket.addEventListener("error", onSocketFailure);
  await new Promise((resolve, reject) => {
    rejectOpen = reject;
    openingListener = () => {
      opened = true;
      clearTimeout(openTimeout);
      socket.removeEventListener("open", openingListener);
      resolve();
    };
    openTimeout = setTimeout(() => {
      socket.removeEventListener("open", openingListener);
      reject(new Error("Timed out opening a Desktop CDP session after 8000ms."));
      socket.close();
    }, 8_000);
    socket.addEventListener("open", openingListener);
  });
  rejectOpen = null;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    if (socketFailed) {
      reject(new Error("CDP socket is closed."));
      return;
    }
    const requestId = ++id;
    const listener = (event) => {
      let message;
      try { message = JSON.parse(event.data); }
      catch {
        pending.delete(requestId);
        clearTimeout(timeout);
        socket.removeEventListener("message", listener);
        reject(new Error("CDP returned a malformed JSON response."));
        socketFailure();
        socket.close();
        return;
      }
      if (message.id !== requestId) return;
      const active = pending.get(requestId);
      if (!active) return;
      clearTimeout(active.timeout);
      pending.delete(requestId);
      socket.removeEventListener("message", listener);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };
    const timeout = setTimeout(() => {
      pending.delete(requestId);
      socket.removeEventListener("message", listener);
      reject(new Error(`CDP ${method} timed out after 10000ms.`));
      socketFailure();
      socket.close();
    }, 10_000);
    pending.set(requestId, { reject, listener, timeout });
    socket.addEventListener("message", listener);
    try { socket.send(JSON.stringify({ id: requestId, method, params })); }
    catch (error) {
      clearTimeout(timeout);
      pending.delete(requestId);
      socket.removeEventListener("message", listener);
      reject(error);
    }
  });
  return {
    async command(method, params = {}) {
      return await call(method, params);
    },
    async evaluate(expression, awaitPromise = false) {
      const result = await call("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
      if (result.exceptionDetails) throw annotatePreviewE2eCdpFailure(
        new Error(result.exceptionDetails.text || "Desktop page evaluation failed."), result.exceptionDetails);
      return result.result?.value;
    },
    async close() {
      socketFailure();
      socket.close();
    },
  };
}

function recoveryPhase(value) {
  console.log(`[workspace-e2e] native recovery phase=${value}`);
}

async function requestBrowserShutdown() {
  if (setupCdp && await setupCdp.evaluate("Boolean(document.querySelector('#quit-desktop'))").catch(() => false)) {
    // Exercise the real trusted Settings button, not a test-only Main command.
    await click(setupCdp, "#quit-desktop", "Quit SPS Desktop through Core Settings");
    return;
  }
  // Browser.close belongs to the browser endpoint, not an isolated renderer
  // partition. Use only the debug port of this exact owned launch generation.
  const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(2000) })
    .then(response => { if (!response.ok) throw new Error("Owned browser endpoint unavailable"); return response.json(); });
  const endpoint = new URL(version.webSocketDebuggerUrl);
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.protocol, "ws:");
  assert.equal(endpoint.port, String(debugPort));
  assert.match(endpoint.pathname, /^\/devtools\/browser\/[A-Za-z0-9-]+$/);
  const browser = await openCdp(version);
  try { await browser.command("Browser.close"); }
  finally { await browser.close(); }
}

async function describePage(cdp) {
  return await cdp.evaluate(`({ title: document.title, route: location.href, body: document.body?.innerText?.slice(0, 4000) || "",
    workspaceEntry: document.querySelector('[data-sps-workspace-entry]')?.getAttribute('data-sps-workspace-entry') || null,
    checklistReady: document.querySelector('[data-testid="checklist-jobs"]')?.textContent === "Jobs: 1",
    legacyLayout: Boolean(document.querySelector('#main-content') && document.querySelector('aside') && document.querySelector('nav[aria-label="breadcrumb"]')),
    usageReady: Boolean(document.querySelector('[data-testid="sps-plugin-usage"] table')) && document.querySelector('[aria-label="Refresh execution usage"]')?.disabled === false,
    usagePeriod: document.querySelector('#sps-usage-period')?.value,
    historyText: document.querySelector('[data-testid="sps-plugin-executions"]')?.innerText?.slice(0, 4000) || "",
    historyReady: document.querySelector('[aria-label="Refresh execution history"]')?.disabled === false,
    historyLane: document.querySelector('[aria-label="Execution lane"]')?.value,
    historyRunIds: [...document.querySelectorAll('[data-testid="sps-plugin-executions"] button[aria-label^="View execution "]')].map(button => button.getAttribute('aria-label').slice(15)),
    historyDetail: document.querySelector('[data-testid="sps-execution-detail"]')?.innerText?.slice(0, 4000) || "",
    nativeManagement: (() => {
      const statusRegion = document.querySelector("#status-region");
      if (!statusRegion) return null;
      const devicesStatus = document.querySelector("#native-devices-status");
      const refreshButton = document.querySelector("#refresh-native-devices");
      return {
        hostBusy: statusRegion.getAttribute("aria-busy") === "true",
        hostMessage: document.querySelector("#status-message")?.textContent?.trim() ?? null,
        devicesBusy: devicesStatus?.getAttribute("aria-busy") === "true",
        devicesMessage: devicesStatus?.textContent?.trim() ?? null,
        refreshDisabled: refreshButton ? refreshButton.disabled : null,
      };
    })() })`);
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

async function waitForEnabled(cdp, selector, label) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      return Boolean(element && !element.disabled);
    })()`)) return;
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${label} to become available.`);
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

async function captureScreenshot(cdp, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const result = await cdp.command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(outputPath, Buffer.from(result.data, "base64"));
}

const mockIdentity = createMockIdentityServer();
let debugPort = await findAvailablePort();
const fixture = await createWorkspaceE2eFixture();
const userDataDirectory = fixture.directory;
if (keepE2eData) console.log(`Preserving SPS Workspace E2E data at: ${userDataDirectory}`);
let child = null;
let setupCdp = null;
let workspaceCdp = null;
let appOutput = "";
let nativeManagementStage = "bootstrap";
let acceptanceFailure = null;
let failurePhase = "owner_creation";

try {
  const { origin: identityUrl, issued } = await mockIdentity.start();
  const binary = packagedBinary || sourceElectron;
  function launchDesktop(extraArgs = []) {
    child = spawn(binary, [
    `--user-data-dir=${userDataDirectory}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    ...extraArgs,
    ...(packagedBinary ? [] : ["."]),
  ], {
    cwd: packagedBinary ? path.dirname(binary) : path.resolve(scriptDirectory, ".."),
    env: {
      ...process.env,
      SPS_IDENTITY_URL: identityUrl,
      SPS_DESKTOP_E2E_USER_DATA_DIR: userDataDirectory,
      SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1",
      SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1",
      SPS_DESKTOP_E2E: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
    launched.track(child);
    const captureOutput = (chunk) => {
      appOutput = `${appOutput}${chunk.toString()}`.slice(-24_000);
    };
    child.stdout?.on("data", captureOutput);
    child.stderr?.on("data", captureOutput);
  }
  launchDesktop();

  async function closeDesktopForRestart() {
    if (child.exitCode === null) {
      // Arm exit observation before closing CDP: Chromium can close the socket
      // without acknowledging Browser.close, even after a clean process exit.
      const exited = once(child, "exit");
      let closeError;
      void requestBrowserShutdown().catch(error => { closeError = error; });
      let timer;
      try {
        await Promise.race([exited, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Desktop graceful shutdown timed out: ${closeError?.message ?? "exit not observed"}`)), 30_000);
        })]);
      } finally {
        clearTimeout(timer);
      }
    }

    assert.equal(child.exitCode, 0, "Desktop must shut down cleanly before reusing its temporary Host");
    const prior = await launched.waitForOutputEnd(5000);
    assert.equal(prior.orderly, prior.children, "Every earlier Main must exit zero before reusing the temporary Host");
    assert.equal(prior.outputFailed, 0, "Earlier Main output streams must not fail during restart");
    assert.equal(prior.outputEnded, prior.children * 2,
      "Every earlier Main must close its output before the temporary Host can be reused");
    await workspaceCdp?.close().catch(() => undefined);
    await setupCdp?.close().catch(() => undefined);
    workspaceCdp = null;
    setupCdp = null;
    // Main exit can precede Chromium's final debug-listener release. Never
    // discover a new process through the preceding process's endpoint.
    const previousDebugPort = debugPort;
    for (let attempt = 0; attempt < 8 && debugPort === previousDebugPort; attempt++) {
      debugPort = await findAvailablePort();
    }
    assert.notEqual(debugPort, previousDebugPort, "A restarted Desktop needs a fresh debugging endpoint");
  }

  const setupTarget = await waitForTarget(
    debugPort,
    child,
    (target) => target.title === "SPS Desktop",
    "the SPS Desktop setup window",
  );
  setupCdp = await openCdp(setupTarget);
  await waitForPage(setupCdp, (page) => page.body.includes("SPS"), "the SPS setup content");
  await waitForEnabled(setupCdp, "#start-sps-account", "SPS sign-in readiness");
  await click(setupCdp, "#start-sps-account", "SPS sign-in");
  await followCapturedIdentityAuthorization(mockIdentity, identityUrl);
  console.log("[no-ai] mock Identity authorization followed the real loopback state/PKCE callback without starting a system browser");
  await waitForPage(setupCdp, () => issued.length > 0, "the mock Identity authorization callback", 30_000);
  await waitForPage(setupCdp, (page) => page.body.includes("Create") || page.body.includes("Server"), "the post-sign-in Host choice", 45_000);
  if (screenshotPath && sourceElectron && !executionControlOnly) {
    const directory = path.dirname(screenshotPath);
    for (const [width, height] of [[1024, 720], [620, 760]]) {
      await setupCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await setupCdp.evaluate(`document.fonts.ready`, true);
      await captureScreenshot(setupCdp, path.join(directory, `server-choice-${width}x${height}.png`));
      await click(setupCdp, "#show-join-server", "Show invitation input");
      const form = await setupCdp.evaluate(`(() => {
        const input = document.querySelector('#invite-code');
        return { visible: !document.querySelector('#join-server-form').hidden,
          focused: document.activeElement === input, overflow: document.documentElement.scrollWidth > innerWidth };
      })()`);
      assert.equal(form.visible, true);
      assert.equal(form.focused, true);
      assert.equal(form.overflow, false);
      await captureScreenshot(setupCdp, path.join(directory, `server-join-${width}x${height}.png`));
      await click(setupCdp, "#show-join-server", "Hide invitation input");
    }
    await setupCdp.command("Emulation.clearDeviceMetricsOverride");
  }
  await click(setupCdp, "#create-owner-server", "Create SPS Server");

  const workspaceTarget = await waitForTarget(
    debugPort,
    child,
    (target) => /^http:\/\/127\.0\.0\.1:\d+\//.test(target.url || ""),
    "the authenticated SPS Workspace BrowserWindow",
    hostReadyTimeoutMs,
  );
  workspaceCdp = await openCdp(workspaceTarget);
  await waitForPage(workspaceCdp, (page) => page.workspaceEntry === "empty" || page.body.includes("Workspace") || page.body.includes("Dashboard"), "the Workspace Core UI", 90_000);
  await workspaceCdp.evaluate(`localStorage.setItem("sps.theme", "light")`);

  const companies = await api(workspaceCdp, "/api/companies");
  const company = Array.isArray(companies) ? companies[0] : null;
  assert.ok(company?.id && company?.issuePrefix, `The isolated Host did not create a Workspace: ${JSON.stringify(companies)}`);
  const companyPrefix = company.issuePrefix;

  if (sourceElectron && !executionControlOnly) {
    const clearedShell = await api(workspaceCdp, `/api/companies/${company.id}/workspace-shell`, {
      method: "PUT",
      body: { pluginId: null },
    });
    assert.equal(clearedShell.mode, "neutral");
    assert.equal(clearedShell.providerPluginId, null);
    const entryPlugins = await api(workspaceCdp, `/api/plugins/companies/${company.id}`);
    for (const plugin of entryPlugins?.plugins ?? []) {
      if (plugin.activation?.enabled !== true) continue;
      await api(workspaceCdp, `/api/plugins/${plugin.id}/companies/${company.id}/activation`, {
        method: "PUT",
        body: { enabled: false },
      });
    }
    const inactiveEntryPlugins = await api(workspaceCdp, `/api/plugins/companies/${company.id}`);
    assert.deepEqual(
      (inactiveEntryPlugins?.plugins ?? []).filter((plugin) => plugin.activation?.enabled === true).map((plugin) => plugin.id),
      [],
      "The neutral entry fixture must have no active default plugins.",
    );
    const agentsBeforeEntry = await api(workspaceCdp, `/api/companies/${company.id}/agents`);
    assert.ok(Array.isArray(agentsBeforeEntry), `Agent state was not an array: ${JSON.stringify(agentsBeforeEntry)}`);
    assert.equal(agentsBeforeEntry.length, 0, "The empty Workspace entry must start without Agents.");

    await workspaceCdp.evaluate(d2RequestMonitorStartExpression);
    const rootPath = `/${companyPrefix}`;
    await workspaceCdp.evaluate(`(() => {
      history.pushState({}, "", ${JSON.stringify(rootPath)});
      dispatchEvent(new PopStateEvent("popstate"));
    })()`);
    const emptyEntry = await waitForPage(
      workspaceCdp,
      (page) => page.workspaceEntry === "empty",
      "the independent empty Workspace entry",
    );
    const emptyEntryRequests = await workspaceCdp.evaluate(d2RequestMonitorStopExpression);
    assert.equal(new URL(emptyEntry.route).pathname.replace(/\/$/, ""), rootPath.replace(/\/$/, ""), `Empty entry redirected away from the Workspace root: ${emptyEntry.route}`);
    const emptyEntryDom = await workspaceCdp.evaluate(`(() => ({
      marker: document.querySelector('[data-sps-workspace-entry]')?.getAttribute('data-sps-workspace-entry') || null,
      emptyMessage: document.body.innerText.includes('No default plugin selected.'),
      manageHref: [...document.querySelectorAll('a')].find(link => link.textContent.trim() === 'Manage plugins')?.getAttribute('href') || null,
      legacyChrome: Boolean(document.querySelector('#main-content, aside, nav[aria-label="breadcrumb"]')),
      legacyLinks: [...document.querySelectorAll('a[href$="/dashboard"], a[href$="/inbox"], a[href$="/company/settings/agents"], a[href$="/assistants/new"]')].map(link => link.getAttribute('href')),
      legacyCopy: /Agent|Dashboard/.test(document.body.innerText),
    }))()`);
    assert.equal(emptyEntryDom.marker, "empty");
    assert.equal(emptyEntryDom.emptyMessage, true, "The neutral root did not render its empty-state message.");
    const expectedManagerPath = `${rootPath}/company/settings/instance/plugins`;
    assert.ok(emptyEntryDom.manageHref, `Manage plugins link was missing: ${JSON.stringify(emptyEntryDom)}`);
    assert.equal(new URL(emptyEntryDom.manageHref, emptyEntry.route).pathname, expectedManagerPath, `Manage plugins link target was unexpected: ${JSON.stringify(emptyEntryDom)}`);
    assert.equal(emptyEntryDom.legacyChrome, false, `The empty entry rendered legacy navigation or breadcrumbs: ${JSON.stringify(emptyEntryDom)}`);
    assert.deepEqual(emptyEntryDom.legacyLinks, [], `The empty entry rendered legacy workspace navigation: ${JSON.stringify(emptyEntryDom.legacyLinks)}`);
    assert.equal(emptyEntryDom.legacyCopy, false, "The empty entry rendered legacy Agent or Dashboard content.");
    const legacyRequests = legacyWorkspaceDataRequests(emptyEntryRequests);
    assert.deepEqual(legacyRequests, [], `The empty entry fetched legacy Agent or Dashboard data: ${JSON.stringify(legacyRequests)}`);

    for (const [width, height] of [[620, 760], [1000, 760]]) {
      await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await workspaceCdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
      const layout = await workspaceCdp.evaluate(`(() => ({ viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        entryWidth: document.querySelector('[data-sps-workspace-entry]')?.getBoundingClientRect().width || 0 }))()`);
      assert.ok(layout.documentWidth <= layout.viewport, `Empty Workspace entry overflows at ${width}x${height}: ${JSON.stringify(layout)}`);
      assert.ok(layout.entryWidth > 0 && layout.entryWidth <= layout.viewport, `Empty Workspace entry does not fit at ${width}x${height}: ${JSON.stringify(layout)}`);
      if (screenshotPath) {
        await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), `neutral-entry-${width}x${height}.png`));
      }
    }
    await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");

    await click(workspaceCdp, 'a[href$="/company/settings/instance/plugins"]', "Open Manage plugins from the empty Workspace entry");
    const manager = await waitForPage(
      workspaceCdp,
      (page) => new URL(page.route).pathname.endsWith("/company/settings/instance/plugins")
        && page.body.includes("Plugins")
        && page.body.includes("Plugin lifecycle and installation")
        && page.legacyLayout,
      "the legacy Plugin Manager layout from the empty Workspace entry",
    );
    assert.equal(manager.legacyLayout, true, "Plugin management must retain the legacy Layout, sidebar, and breadcrumbs.");

    await workspaceCdp.evaluate(d2RequestMonitorStartExpression);
    await workspaceCdp.evaluate(`(() => {
      history.pushState({}, "", ${JSON.stringify(rootPath)});
      dispatchEvent(new PopStateEvent("popstate"));
    })()`);
    const returnedEntry = await waitForPage(workspaceCdp, (page) => page.workspaceEntry === "empty", "return to the empty Workspace entry");
    const returnRequests = await workspaceCdp.evaluate(d2RequestMonitorStopExpression);
    assert.deepEqual(legacyWorkspaceDataRequests(returnRequests), [], `Returning to the empty entry fetched legacy Agent or Dashboard data: ${JSON.stringify(returnRequests)}`);
    assert.equal(new URL(returnedEntry.route).pathname.replace(/\/$/, ""), rootPath.replace(/\/$/, ""));
    const agentsAfterEntry = await api(workspaceCdp, `/api/companies/${company.id}/agents`);
    assert.equal(agentsAfterEntry.length, 0, "Opening and leaving the empty entry must not synthesize an Agent.");
    console.log("D2 neutral entry E2E: zero Agents/default activations, independent root, legacy Plugin Manager link, and 620/1000px fit.");
  }

  if (executionControlOnly) {
    failurePhase = "workspace_execution_control";
    console.log("[execution-control] actual source Desktop opened its isolated Core Workspace.");
    const controlPath = `/api/companies/${company.id}/execution-control`;
    const agentsBefore = await api(workspaceCdp, `/api/companies/${company.id}/agents`);
    assert.equal(agentsBefore.length, 0, "Execution controls must not require an Agent.");
    const other = await api(workspaceCdp, "/api/companies", { method: "POST", body: { name: "Independent execution fixture" } });
    assert.ok(other.id && other.id !== company.id);
    const initial = await api(workspaceCdp, controlPath);
    assert.equal(initial.canControl, true, "The real Desktop Host must have control authority.");
    assert.equal(initial.state, "running");
    const openSettings = async () => {
      await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/company/settings`)})`);
      await waitForPage(workspaceCdp, page => page.body.includes("Host settings") && page.body.includes("Workspace 실행"), "baseline Host execution controls");
    };
    const waitForControl = async (state, revision) => {
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const value = await api(workspaceCdp, controlPath);
        if (value.state === state && value.revision === revision) return value;
        await delay(100);
      }
      throw new Error(`Workspace execution control did not reach ${state}.`);
    };
    await openSettings();
    await waitForEnabled(workspaceCdp, '[data-sps-execution-action="pause"]', "Workspace pause action");
    await click(workspaceCdp, '[data-sps-execution-action="pause"]', "Pause Workspace through baseline Host settings");
    const paused = await waitForControl("paused", initial.revision + 1);
    assert.equal(paused.epoch, initial.epoch);
    assert.equal((await api(workspaceCdp, `/api/companies/${other.id}/execution-control`)).state, "running");
    await waitForPage(workspaceCdp, page => page.body.includes("일시정지 — 새 작업 대기"), "paused execution state");
    await waitForEnabled(workspaceCdp, '[data-sps-execution-action="stop"]', "Workspace stop action");
    await click(workspaceCdp, '[data-sps-execution-action="stop"]', "Stop Workspace through baseline Host settings");
    const stopped = await waitForControl("stopped", paused.revision + 1);
    console.log("[execution-control] baseline Host settings pause and stop reached durable Core state.");
    assert.equal(BigInt(stopped.epoch), BigInt(initial.epoch) + 1n);
    const staleStatus = await workspaceCdp.evaluate(`(async () => (await fetch(${JSON.stringify(controlPath)}, {
      method:'POST', headers:{'content-type':'application/json'}, credentials:'include',
      body:JSON.stringify({action:'resume',expectedRevision:${initial.revision}}) })).status)()`, true);
    assert.equal(staleStatus, 409, "A stale settings action must not resume the Workspace.");
    await waitForPage(workspaceCdp, page => page.body.includes("중지됨"), "stopped execution state");
    for (const [width, height] of [[620, 760], [1000, 760]]) {
      await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      const fits = await workspaceCdp.evaluate(`document.documentElement.scrollWidth <= innerWidth`);
      assert.equal(fits, true, "Execution controls must fit the Host settings viewport.");
    }
    await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
    if (screenshotPath) await captureScreenshot(workspaceCdp, screenshotPath);
    await closeDesktopForRestart();
    launchDesktop(["--sps-core-settings"]);
    setupCdp = await openCdp(await waitForTarget(debugPort, child, target => target.title === "SPS Core Settings", "restart Core Settings"));
    await waitForPage(setupCdp, page => page.body.includes("SPS"), "restart Core Settings readiness");
    await waitForEnabled(setupCdp, '[data-action="open-workspace"]', "Core Settings Workspace action");
    await click(setupCdp, '[data-action="open-workspace"]', "Reopen actual Host after restart");
    workspaceCdp = await openCdp(await waitForTarget(debugPort, child, target => /^http:\/\/127\.0\.0\.1:\d+\//.test(target.url || ""), "restarted Workspace", hostReadyTimeoutMs));
    await waitForPage(workspaceCdp, page => page.body.includes("Workspace") || page.workspaceEntry === "empty", "restarted Workspace UI");
    const persisted = await api(workspaceCdp, controlPath);
    assert.equal(persisted.state, "stopped");
    assert.equal(persisted.epoch, stopped.epoch);
    assert.equal(persisted.revision, stopped.revision);
    console.log("[execution-control] stopped state and revision survived the owned Main/Core restart.");
    await openSettings();
    await waitForPage(workspaceCdp, page => page.body.includes("중지됨"), "persisted stopped UI after restart");
    await waitForEnabled(workspaceCdp, '[data-sps-execution-action="resume"]', "Workspace resume action");
    await click(workspaceCdp, '[data-sps-execution-action="resume"]', "Resume future Workspace work");
    const resumed = await waitForControl("running", stopped.revision + 1);
    assert.equal(resumed.epoch, stopped.epoch);
    assert.equal((await api(workspaceCdp, `/api/companies/${other.id}/execution-control`)).state, "running");
    assert.equal((await api(workspaceCdp, `/api/companies/${company.id}/agents`)).length, 0);
    console.log("[execution-control] actual source Electron/Core baseline Host settings: pause, stop, stale revision denial, separate Workspace, persisted stop across Main/Core restart, and resume passed; zero Agents, no provider.");
  } else if (nativeManagement) {
    // Seed only this stopped temporary Host, not a production IPC or an automated
    // approval of the real security confirmation. Main must read it independently.
    await closeDesktopForRestart();
    nativeManagementStage = "fixture_prepare";
    let prepared;
    try {
      const environment = { ...process.env };
      delete environment.ELECTRON_RUN_AS_NODE;
      delete environment.NODE_OPTIONS;
      const result = await execFileAsync(sourceElectron, [
        path.join(scriptDirectory, "prepare-native-host-e2e-fixture.mjs"),
        "--isolated-prepared-native-host-fixture", userDataDirectory,
      ], { env: environment, timeout: 40_000, maxBuffer: 8192, windowsHide: true });
      const reports = result.stdout.split(/\r?\n/).filter(line => line.startsWith("{"));
      assert.equal(reports.length, 1);
      prepared = JSON.parse(reports[0]);
      assert.deepEqual(Object.keys(prepared).sort(), ["kind", "hostId", "serverSpkiSha256", "lanEnabled", "electronVersion", "nodeVersion"].sort());
      assert.equal(prepared.kind, "sps.native.prepared-host-fixture");
      assert.match(prepared.hostId, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/);
      assert.match(prepared.serverSpkiSha256, /^[0-9a-f]{64}$/);
      assert.equal(prepared.lanEnabled, false);
      assert.match(prepared.electronVersion, /^\d+\.\d+\.\d+$/);
      assert.match(prepared.nodeVersion, /^\d+\.\d+\.\d+$/);
    } catch {
      throw new Error("The isolated prepared Native Host fixture failed.");
    }
    const recovery = await saveCoreRecoverySettings({ userDataPath: userDataDirectory, disabled: true });
    assert.equal(recovery.pluginsDisabled, true);
    for (const phase of ["prepared", "separate-process-reload"]) {
      nativeManagementStage = "settings_launch";
      launchDesktop(["--sps-core-settings"]);
      nativeManagementStage = "settings_target";
      setupCdp = await openCdp(await waitForTarget(debugPort, child,
        target => target.title === "SPS Core Settings", "prepared Native Host settings"));
      nativeManagementStage = "settings_identity_view";
      await waitForPage(setupCdp, page => page.body.includes("Identity prepared"), "protected Native identity status");
      nativeManagementStage = "settings_status";
      const before = await setupCdp.evaluate("window.spsCoreSettings.getStatus()", true);
      assert.equal(before.canManageHost, true);
      assert.equal(before.nativeConnectivity.state, "identity_prepared");
      assert.equal(before.nativeConnectivity.serverSpkiSha256, prepared.serverSpkiSha256);
      assert.equal(before.nativeConnectivity.lanEnabled, false);
      assert.equal(before.recovery.pluginsDisabled, true);
      assert.equal(await setupCdp.evaluate("typeof window.spsDesktopWorkspace"), "undefined");
      nativeManagementStage = "host_start";
      await click(setupCdp, '[data-action="open-workspace"]', "Start the actual prepared Host from independent Settings");
      workspaceCdp = await openCdp(await waitForTarget(debugPort, child,
        target => /^http:\/\/127\.0\.0\.1:\d+\//.test(target.url || ""), "prepared Host Workspace", hostReadyTimeoutMs));
      await waitForPage(workspaceCdp, page => page.workspaceEntry === "empty", "prepared empty Workspace");
      assert.deepEqual(await api(workspaceCdp, `/api/companies/${company.id}/agents`), []);
      nativeManagementStage = "authority_checks";
      const runtimeGate = await workspaceCdp.evaluate(`(async () => {
        const response = await fetch('/api/plugins/ui-contributions', { credentials: 'include' });
        return { status: response.status, code: (await response.json()).code };
      })()`, true);
      assert.deepEqual(runtimeGate, { status: 423, code: "plugin_recovery_active" });
      const rendererManagement = await workspaceCdp.evaluate("fetch('/api/sps/member-devices/status', { credentials: 'include' }).then(response => response.status)", true);
      assert.equal(rendererManagement, 403, "A normal Workspace renderer must not acquire the Main-only Host management proof.");
      nativeManagementStage = "device_read";
      await click(setupCdp, "#refresh-native-devices", "Read real Main-to-Core Native device state with plugin startup disabled");
      await waitForPage(setupCdp, page => page.body.includes("No Native devices are registered.")
        && !page.body.includes("Startup deferred (recovery)"), "available empty Native device list and refreshed Host status");
      const running = await setupCdp.evaluate("window.spsCoreSettings.getStatus()", true);
      assert.equal(running.host.startupDeferred, false);
      assert.match(running.host.state, /^running/);
      const devices = await setupCdp.evaluate("window.spsCoreSettings.listNativeDevices()", true);
      assert.deepEqual(devices, { state: "available", lanEnabled: false, devices: [] });
      nativeManagementStage = "invitation_read";
      assert.equal(await workspaceCdp.evaluate("fetch('/api/sps/native-pairings', { credentials: 'include' }).then(response => response.status)", true),
        403, "The ordinary Workspace renderer must not acquire the Main-only invitation management proof.");
      await click(setupCdp, "#refresh-native-invitations", "Read Host invitations explicitly without Agents or Plugins");
      await waitForPage(setupCdp, page => page.body.includes("No Host invitations are available."), "available empty Host invitation list");
      const invitations = await setupCdp.evaluate("window.spsCoreSettings.listNativeInvitations()", true);
      assert.deepEqual(invitations, { state: "available", invitations: [] });
      if (screenshotPath) await captureScreenshot(setupCdp, path.join(path.dirname(screenshotPath), `native-management-${phase}.png`));
      console.log(`[native-management] ${phase}: real Main/Core session and Host binding, zero Agents, plugin startup blocked, renderer management denied, LAN OFF.`);
      nativeManagementStage = "shutdown";
      await closeDesktopForRestart();
    }
    console.log(`Prepared Native Host management functional assertions passed (Electron ${prepared.electronVersion}, Node ${prepared.nodeVersion}); cleanup qualification pending; no actual security confirmation, enrollment, device approval or two-PC claim.`);
  } else if (noAiChecklist) {
    failurePhase = "workspace_surfaces";
    await runNoAiChecklistAcceptance({
      cdp: workspaceCdp, company, api, click, captureScreenshot, screenshotPath, temporaryRoot: userDataDirectory, runtimeDiscovery,
      restart: async ({ companyPrefix, pluginId }) => {
        failurePhase = "workspace_restart";
        await closeDesktopForRestart();
        launchDesktop();
        const restartedTarget = await waitForTarget(debugPort, child,
          target => /^http:\/\/127\.0\.0\.1:\d+\//.test(target.url || ""), "restarted No-AI Host Workspace", hostReadyTimeoutMs);
        workspaceCdp = await openCdp(restartedTarget);
        // Startup may correctly restore the separate model-fixture Workspace.
        // Reopen the exact reference UI before checking its persisted state.
        const expectedPath = `/${companyPrefix}/plugins/${pluginId}`;
        const expectedUrl = new URL(expectedPath, restartedTarget.url).href;
        // CDP can report the intended HTTP target before its document commits.
        // Absolute Page.navigate is valid even while that document is blank.
        await workspaceCdp.command("Page.navigate", { url: expectedUrl });
        await waitForPage(workspaceCdp, page => page.route === expectedUrl && page.checklistReady === true,
          "restarted reference Workspace checklist UI");
        failurePhase = "workspace_surfaces";
        return workspaceCdp;
      },
      openRecovery: async () => {
        failurePhase = "native_recovery";
        recoveryPhase("close-prior-generation");
        await closeDesktopForRestart();
        recoveryPhase("launch-settings-generation");
        launchDesktop(["--sps-core-settings"]);
        recoveryPhase("wait-settings-target");
        setupCdp = await openCdp(await waitForTarget(debugPort, child, target => target.title === "SPS Core Settings", "independent Native recovery"));
        recoveryPhase("evaluate-settings-status");
        const recovery = await setupCdp.evaluate(`(async () => ({
          status: await window.spsCoreSettings.getStatus(), origin: location.protocol,
          workspaceBridge: typeof window.spsDesktopWorkspace, scripts: document.scripts.length
        }))()`, true);
        assert.equal(recovery.origin, "file:");
        assert.equal(recovery.workspaceBridge, "undefined");
        assert.equal(recovery.scripts, 1);
        assert.ok(recovery.status.recovery);
        recoveryPhase("evaluate-native-device-state");
        const devicesBeforePreparation = await setupCdp.evaluate("window.spsCoreSettings.listNativeDevices()", true);
        assert.deepEqual(devicesBeforePreparation, { state: "identity_required", lanEnabled: false, devices: [] },
          "A signed-in Owner without prepared Native keys must not invent device state or enable LAN.");
        recoveryPhase("wait-status-render");
        await waitForPage(setupCdp, page => page.nativeManagement?.hostBusy === false
          && page.nativeManagement.hostMessage === "Current local desktop status."
          && page.nativeManagement.devicesBusy === false
          && page.nativeManagement.devicesMessage === "Prepare Host identity first"
          && page.nativeManagement.refreshDisabled === false,
        "loaded Native recovery Host status, identity-required device state, and enabled refresh control");
        recoveryPhase("click-device-refresh");
        await click(setupCdp, "#refresh-native-devices", "Refresh Native device management without Agent or Plugin dependencies");
        recoveryPhase("wait-device-refresh");
        await waitForPage(setupCdp, page => !page.body.includes("Loading native devices..."), "Native device management unavailable state");
        if (screenshotPath) await captureScreenshot(setupCdp, path.join(path.dirname(screenshotPath), "no-ai-native-recovery.png"));
        recoveryPhase("complete");
      },
    });
  } else {
  // This fixture uses only an isolated, no-provider process. It neither uses
  // the developer's AI credentials nor changes their Workspace data.
  const assistants = await api(workspaceCdp, `/api/companies/${company.id}/agents`);
  if (!Array.isArray(assistants) || assistants.length === 0) {
    await api(workspaceCdp, `/api/companies/${company.id}/agents`, {
      method: "POST",
      body: {
        name: "Workspace Surfaces E2E Assistant",
        role: "engineer",
        adapterType: "process",
        adapterConfig: sourceElectron ? { command: process.execPath, args: ["-e", "console.log('Builder cancellation fixture ready'); setInterval(() => {}, 1000)"], timeoutSec: 90, graceSec: 1 } : {},
      },
    });
  }

  await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/dashboard`)})`);
  const neutral = await waitForPage(
    workspaceCdp,
    (page) => page.body.includes("Neutral Workspace") || page.body.includes("No plugin updates to show"),
    "the unselected Neutral Workspace Shell",
  );
  assert.ok(neutral.route.includes(`/${companyPrefix}/dashboard`), `Neutral Workspace route was unexpected: ${neutral.route}`);

  if (sourceElectron) {
    await click(workspaceCdp, 'a[href$="/company/settings/agents"]', "Open Agent management from Dashboard");
    await waitForPage(workspaceCdp, page => page.route.endsWith("/company/settings/agents") && page.body.includes("Add Agent"), "Agent directory");
    await click(workspaceCdp, 'a[href$="/assistants/new"]', "Add Agent from Settings");
    await waitForPage(workspaceCdp, page => page.body.includes("Default working folder") && page.body.includes("Add Agent"), "Agent registration form");
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('[aria-label="Agent name"]').value`), "", "Registration must not reuse a misleading Assistant name");
    await workspaceCdp.evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Cancel').click()`);
    await waitForPage(workspaceCdp, page => page.route.endsWith("/company/settings/agents") && page.body.includes("Add Agent"), "Cancelled Agent registration returns to directory");
    console.log("Agent management E2E: Dashboard link, Settings directory, empty registration, Cancel without saving.");
  }

  // A fresh SPS Host intentionally starts with Plugin Builder only. Install the
  // packaged reference Workplane through the real Host API so this flow also
  // verifies optional local-package installation without changing that default.
  const packagedTeamWorkplanePath = packagedBinary ? path.join(
    userDataDirectory,
    "owner-host-runtime",
    desktopVersion,
    "sps-room-chat",
  ) : path.resolve(scriptDirectory, "..", "..", "sps-room-chat");
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
    (page) => page.route.includes("/builder") && page.body.includes("Plugin Builder") && page.body.includes("무엇을 만들까요?"),
    "the Plugin Builder project surface",
  );
  if (screenshotPath && sourceElectron) {
    const builderFont = await workspaceCdp.evaluate(`getComputedStyle(document.querySelector('.sps-builder')).fontFamily`);
    assert.match(builderFont, /Pretendard/);
    await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), "plugin-builder.png"));
    await workspaceCdp.evaluate(`[...document.querySelectorAll('.bc-header .bc-button')].find(button => button.textContent === '작업 패널').click()`);
    for (const [width, height] of [[1024, 720], [1440, 900]]) {
      await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await workspaceCdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
      const builderLayout = await workspaceCdp.evaluate(`(() => {
        const box = document.querySelector('.bc-compose-box').getBoundingClientRect();
        return { bottom: box.bottom, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
          panel: Boolean(document.querySelector('.bc-panel')), separator: Boolean(document.querySelector('.bc-resizer[role="separator"]')) };
      })()`);
      assert.equal(builderLayout.overflow, false);
      assert.ok(builderLayout.bottom <= builderLayout.height);
      assert.equal(builderLayout.panel, true);
      assert.equal(builderLayout.separator, true);
      await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), `plugin-builder-panel-${width}x${height}.png`));
    }
    await click(workspaceCdp, ".bc-panel-head button", "Close Builder work panel");
    await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
  }

  if (sourceElectron) {
    await workspaceCdp.evaluate(`document.querySelector('.bc-composer textarea').focus()`);
    await workspaceCdp.command("Input.insertText", { text: "Test the exact-run cancellation control." });
    await click(workspaceCdp, ".bc-composer button.primary", "Send Builder fixture turn");
    let runningRun = null;
    const runDeadline = Date.now() + 45_000;
    while (Date.now() < runDeadline) {
      const state = await api(workspaceCdp, `/api/plugins/${builder.id}/bridge/data`, {
        method: "POST", body: { key: "plugin-builder-workspace", companyId: company.id, params: {} },
      });
      const message = state?.data?.conversations?.[0]?.messages?.find(item => item.role === "assistant");
      if (message?.runId) {
        const observed = await api(workspaceCdp, `/api/heartbeat-runs/${message.runId}`);
        if (observed.processPid && observed.status === "running") { runningRun = observed; break; }
        assert.ok(!["failed", "cancelled", "succeeded"].includes(observed.status), `Builder fixture ended before stop: ${JSON.stringify(observed)}`);
      }
      await delay(250);
    }
    assert.ok(runningRun?.processPid, "Builder did not start the isolated process fixture.");
    assert.equal(runningRun.contextSnapshot?.spsExecutionRuntime?.adapterType, "process", "Execution runtime must be snapshotted before the process starts.");
    await click(workspaceCdp, '.bc-composer button[title="현재 Lead 응답만 중지"]', "Stop the exact Builder Lead run");
    await waitForPage(workspaceCdp, page => page.body.includes("중지 완료"), "confirmed Builder process termination", 30_000);
    const stopped = await api(workspaceCdp, `/api/heartbeat-runs/${runningRun.id}`);
    assert.equal(stopped.status, "cancelled");
    assert.equal(stopped.contextSnapshot?.spsSessionCancellationTermination, "confirmed");
    let alive = true;
    try { process.kill(runningRun.processPid, 0); } catch (error) { if (error.code === "ESRCH") alive = false; else throw error; }
    assert.equal(alive, false, "Builder showed stopped before its process exited.");
    if (screenshotPath) await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), "plugin-builder-stopped.png"));
    console.log("Builder stop E2E: exact Lead run cancelled, process exit verified, no provider used.");

    const writeDraft = async text => {
      await workspaceCdp.evaluate(`(() => {
        const input = document.querySelector('.bc-composer textarea');
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
    };
    await writeDraft("Unsent existing conversation draft");
    await workspaceCdp.evaluate(`(() => {
      const file = new File(['unsent attachment'], 'draft-notes.txt', {type:'text/plain'});
      const originalRead = File.prototype.arrayBuffer;
      File.prototype.arrayBuffer = function () {
        File.prototype.arrayBuffer = originalRead;
        return new Promise(resolve => { window.auditFinishAttachment = () => resolve(new TextEncoder().encode('unsent attachment').buffer); });
      };
      const files = new DataTransfer(); files.items.add(file);
      const input = document.querySelector('.bc-composer input[type=file]'); input.files = files.files;
      input.dispatchEvent(new Event('change', {bubbles:true}));
    })()`);
    assert.equal(await workspaceCdp.evaluate(`Boolean(window.auditFinishAttachment)`), true, "Deferred file-read fixture did not start");
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('.bc-composer button.primary').disabled`), true);
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('[aria-label="새 대화 시작"]').disabled`), true);
    await workspaceCdp.evaluate(`[...document.querySelectorAll('.bc-header .bc-button')].find(button => button.textContent === '작업 패널').click()`);
    await workspaceCdp.evaluate(`window.auditFinishAttachment(); delete window.auditFinishAttachment`);
    await waitForPage(workspaceCdp, page => page.body.includes("draft-notes.txt"), "unsent attachment");
    await workspaceCdp.evaluate(`(() => {
      window.auditOriginalConfirm = window.confirm;
      window.auditDiscardPrompts = 0;
      window.confirm = () => { window.auditDiscardPrompts++; return false; };
      [...document.querySelectorAll('.bc-panel button')].find(button => button.textContent === 'Agent 관리').click();
    })()`);
    assert.equal(await workspaceCdp.evaluate(`window.auditDiscardPrompts`), 1);
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('.bc-composer textarea').value`), "Unsent existing conversation draft");
    await workspaceCdp.evaluate(`window.confirm = window.auditOriginalConfirm; delete window.auditOriginalConfirm; delete window.auditDiscardPrompts`);
    await click(workspaceCdp, '[aria-label="새 대화 시작"]', "Switch to new conversation without discarding draft");
    await writeDraft("Unsent new conversation draft");
    await click(workspaceCdp, ".bc-chat-link", "Return to previous conversation");
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('.bc-composer textarea').value`), "Unsent existing conversation draft");
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('.bc-file-chip').textContent.includes('draft-notes.txt')`), true);
    await click(workspaceCdp, '[aria-label="새 대화 시작"]', "Return to new conversation draft");
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('.bc-composer textarea').value`), "Unsent new conversation draft");
    await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width: 540, height: 800, deviceScaleFactor: 1, mobile: false });
    assert.equal(await workspaceCdp.evaluate(`getComputedStyle(document.querySelector('.bc-history-toggle')).display !== 'none'`), true);
    await click(workspaceCdp, ".bc-history-toggle", "Open conversation history at narrow width");
    assert.equal(await workspaceCdp.evaluate(`getComputedStyle(document.querySelector('.bc-rail')).display !== 'none'`), true);
    const mobileBounds = await workspaceCdp.evaluate(`(() => {
      const rail = document.querySelector('.bc-rail').getBoundingClientRect();
      const main = document.querySelector('.bc-main').getBoundingClientRect();
      return { railWidth: rail.width, mainWidth: main.width, overflow: document.documentElement.scrollWidth > innerWidth };
    })()`);
    assert.ok(mobileBounds.railWidth > 200 && mobileBounds.mainWidth > 200 && !mobileBounds.overflow, `Narrow-width history has no usable width: ${JSON.stringify(mobileBounds)}`);
    if (screenshotPath) await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), "plugin-builder-history-540x800.png"));
    await click(workspaceCdp, ".bc-chat-link", "Choose conversation at narrow width");
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('.bc-composer textarea').value`), "Unsent existing conversation draft");
    assert.equal(await workspaceCdp.evaluate(`document.querySelector('.bc-history-toggle').getAttribute('aria-expanded')`), "false");
    await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
    console.log("Builder draft E2E: text and attachment preserved across conversations; narrow-width history remains reachable.");

    // Read the same real Core run through Host diagnostics, without seeding a
    // second usage ledger or contacting a paid provider.
    await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/company/settings/instance/plugins/${builder.id}`)})`);
    await waitForPage(workspaceCdp, page => page.body.includes("Configuration") && page.body.includes("Status"), "Plugin settings");
    const statusSelector = '[role="tab"][id$="-trigger-status"]';
    // Radix Tabs activates on pointer-down or keyboard, not a synthetic click.
    await workspaceCdp.evaluate(`document.querySelector(${JSON.stringify(statusSelector)}).focus()`);
    await workspaceCdp.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await workspaceCdp.command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await waitForPage(workspaceCdp, page => page.usageReady, "real execution usage summary");
    const summaryBounds = await workspaceCdp.evaluate(`(() => {
      const panel = document.querySelector('[data-testid="sps-plugin-usage"]');
      return { times: [...panel.querySelectorAll('time')].map(time => time.dateTime), text: panel.textContent };
    })()`);
    const usageParams = new URLSearchParams({ pluginId: builder.id, from: summaryBounds.times[0], to: summaryBounds.times[1] });
    const usage = await api(workspaceCdp, `/api/companies/${company.id}/sps-executions/summary?${usageParams}`);
    assert.ok(usage.executionCount >= 1, "Real Builder run is absent from Host usage");
    assert.ok(usage.terminalCount >= 1);
    assert.equal(usage.tokens.inputTokens.reported, null, "No-provider fixture must not fabricate usage");
    assert.ok(usage.tokens.inputTokens.unavailableExecutions >= 1);
    assert.equal(usage.costs.incrementalApi.reported, null);
    for (const [value, milliseconds] of [["7d", 7 * 86400000], ["30d", 30 * 86400000], ["24h", 86400000]]) {
      await workspaceCdp.evaluate(`(() => {
        const select = document.querySelector('#sps-usage-period');
        select.value = ${JSON.stringify(value)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitForPage(workspaceCdp, page => page.usageReady && page.usagePeriod === value, `usage period ${value}`);
      const range = await workspaceCdp.evaluate(`[...document.querySelector('[data-testid="sps-plugin-usage"]').querySelectorAll('time')].map(time => time.dateTime)`);
      assert.equal(Date.parse(range[1]) - Date.parse(range[0]), milliseconds);
    }
    await click(workspaceCdp, '[aria-label="Refresh execution usage"]', "Refresh usage");
    await waitForPage(workspaceCdp, page => page.usageReady, "refreshed usage");
    if (screenshotPath) {
      for (const [width, height] of [[1024, 720], [1440, 900]]) {
        await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await workspaceCdp.evaluate(`document.querySelector('[data-testid="sps-plugin-usage"]').scrollIntoView({ block: 'start' })`);
        const layout = await workspaceCdp.evaluate(`(() => {
          const panel = document.querySelector('[data-testid="sps-plugin-usage"]').getBoundingClientRect();
          const refresh = document.querySelector('[aria-label="Refresh execution usage"]').getBoundingClientRect();
          return { documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
            panelLeft: panel.left, panelRight: panel.right, refreshRight: refresh.right,
            tablesFit: [...document.querySelectorAll('[data-testid="sps-plugin-usage"] table')].every(table => table.scrollWidth <= table.parentElement.clientWidth + 1) };
        })()`);
        assert.ok(layout.documentWidth <= layout.viewport && layout.panelLeft >= 0 && layout.panelRight <= layout.viewport && layout.refreshRight <= layout.viewport && layout.tablesFit,
          `Usage layout clipped at ${width}: ${JSON.stringify(layout)}`);
        await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), `plugin-usage-${width}x${height}.png`));
      }
      await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
    }
    console.log("Usage UI E2E: real scoped run, unknown usage, 24h/7d/30d selection and refresh verified.");
    const historyEndpoint = `/api/companies/${company.id}/sps-executions`;
    const history = await api(workspaceCdp, `${historyEndpoint}?${new URLSearchParams({ pluginId: builder.id, limit: "20" })}`);
    assert.ok(history.items.some(item => item.runId === runningRun.id && item.lane === "agent_session"), "Stopped Builder run is absent from Host history");
    await waitForPage(workspaceCdp, page => page.historyReady && page.historyRunIds.includes(runningRun.id), "Host execution history");
    await workspaceCdp.evaluate(`document.querySelector('[data-testid="sps-plugin-executions"]').scrollIntoView({ block: 'start' })`);
    await click(workspaceCdp, `[aria-label="View execution ${runningRun.id}"]`, "Open the stopped Builder execution");
    await waitForPage(workspaceCdp, page => page.historyDetail.includes(runningRun.id) && /cancelled/i.test(page.historyDetail), "scoped execution detail");
    const detail = await api(workspaceCdp, `${historyEndpoint}/agent_session/${runningRun.id}?${new URLSearchParams({ pluginId: builder.id })}`);
    assert.equal(detail.termination, "confirmed");
    assert.equal(detail.usage.inputTokens.value, null);
    if (screenshotPath) {
      await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width: 1024, height: 720, deviceScaleFactor: 1, mobile: false });
      await workspaceCdp.evaluate(`document.querySelector('[data-testid="sps-execution-detail"]').scrollIntoView({ block: 'start' })`);
      assert.equal(await workspaceCdp.evaluate(`(() => {
        const panel = document.querySelector('[data-testid="sps-execution-detail"]');
        return document.documentElement.scrollWidth <= innerWidth && panel.scrollWidth <= panel.clientWidth + 1;
      })()`), true, "Execution detail overflowed at minimum desktop width");
      await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), "plugin-execution-detail-1024x720.png"));
      await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
    }
    const setLane = async lane => {
      await workspaceCdp.evaluate(`(() => {
        const select = document.querySelector('[aria-label="Execution lane"]');
        select.value = ${JSON.stringify(lane)};
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    };
    await setLane("node");
    await waitForPage(workspaceCdp, page => page.historyReady && page.historyLane === "node" && page.historyText.includes("No executions"), "empty Node history");
    assert.equal(await workspaceCdp.evaluate(`Boolean(document.querySelector('[data-testid="sps-execution-detail"]'))`), false, "Lane change retained stale detail");
    await setLane("agent_session");
    await waitForPage(workspaceCdp, page => page.historyReady && page.historyLane === "agent_session" && page.historyRunIds.includes(runningRun.id), "Agent-session history");
    await click(workspaceCdp, '[aria-label="Refresh execution history"]', "Refresh execution history");
    await waitForPage(workspaceCdp, page => page.historyReady && page.historyRunIds.includes(runningRun.id), "refreshed execution history");
    if (screenshotPath) {
      for (const [width, height] of [[1024, 720], [1440, 900]]) {
        await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await workspaceCdp.evaluate(`document.querySelector('[data-testid="sps-plugin-executions"]').scrollIntoView({ block: 'start' })`);
        const fits = await workspaceCdp.evaluate(`(() => {
          const panel = document.querySelector('[data-testid="sps-plugin-executions"]');
          const bounds = panel.getBoundingClientRect();
          return document.documentElement.scrollWidth <= innerWidth && bounds.left >= 0 && bounds.right <= innerWidth
            && [...panel.querySelectorAll('table')].every(table => table.scrollWidth <= table.parentElement.clientWidth + 1);
        })()`);
        assert.equal(fits, true, `Execution history clipped at ${width}`);
        await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), `plugin-executions-${width}x${height}.png`));
      }
      await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
    }
    console.log("History UI E2E: exact stopped run, safe detail, lane isolation and refresh verified.");
  }

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
  if (sourceElectron) {
    const defaultRoute = teamProvider.shell.defaultRoute;
    assert.ok(defaultRoute?.startsWith("/"), `Team Workplane Shell did not declare a company-relative defaultRoute: ${JSON.stringify(teamProvider.shell)}`);
    const selectedRootPath = `/${companyPrefix}${defaultRoute}`;
    await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}`)})`);
    const selectedRoot = await waitForPage(
      workspaceCdp,
      (page) => new URL(page.route).pathname.replace(/\/$/, "").toLowerCase() === selectedRootPath.replace(/\/$/, "").toLowerCase(),
      "the selected Team Workplane Shell default route from the Workspace root",
    );
    assert.equal(new URL(selectedRoot.route).pathname.replace(/\/$/, "").toLowerCase(), selectedRootPath.replace(/\/$/, "").toLowerCase());
  }
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

  if (screenshotPath && sourceElectron) {
    const project = await api(workspaceCdp, `/api/companies/${company.id}/projects`, {
      method: "POST", body: { name: "UI inspection project", status: "in_progress" },
    });
    await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/agent-rooms?project=${project.id}`)})`);
    await waitForPage(workspaceCdp, page => page.body.includes("UI inspection project") && page.body.includes("Rooms"), "internal project workplane");
    await click(workspaceCdp, ".rw-project-card", "Open the test Agent Room");
    await waitForPage(workspaceCdp, page => /room=/.test(page.route) && /보내기|Send|메시지/.test(page.body), "internal Agent Room composer");
    for (const [width, height] of [[1024, 720], [1440, 900]]) {
      await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      await workspaceCdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
      const room = await workspaceCdp.evaluate(`(() => {
        const shell = document.querySelector('.rw-shell');
        return { font: getComputedStyle(shell).fontFamily,
          overflow: document.documentElement.scrollWidth > innerWidth,
          composer: Boolean(shell.querySelector('.rw-composer')),
          composerBottom: shell.querySelector('.rw-composer')?.getBoundingClientRect().bottom,
          viewportHeight: innerHeight };
      })()`);
      assert.match(room.font, /Pretendard/);
      assert.equal(room.overflow, false);
      assert.equal(room.composer, true);
      assert.ok(room.composerBottom <= room.viewportHeight, "Room composer extends below the viewport");
      await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), `agent-room-${width}x${height}.png`));
    }
    await click(workspaceCdp, ".rw-context-trigger", "Open Room context panel");
    const contextLayout = await workspaceCdp.evaluate(`(() => {
      const main = document.querySelector('.rw-main').getBoundingClientRect();
      const composer = document.querySelector('.rw-composer-surface').getBoundingClientRect();
      const headerActions = document.querySelector('.rw-header-actions').getBoundingClientRect();
      return { mainRight: main.right, composerRight: composer.right, actionsRight: headerActions.right };
    })()`);
    assert.ok(contextLayout.composerRight <= contextLayout.mainRight, "Open context panel clips the Room composer");
    assert.ok(contextLayout.actionsRight <= contextLayout.mainRight, "Open context panel clips the Room header actions");
    await captureScreenshot(workspaceCdp, path.join(path.dirname(screenshotPath), "agent-room-context.png"));
    await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
  }

  await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}/company/settings/instance/plugins`)})`);
  await waitForPage(
    workspaceCdp,
    (page) => page.body.includes("Plugins") && page.body.includes("Plugin lifecycle and installation"),
    "the Core Plugins management surface",
  );
  if (screenshotPath) {
    const font = await workspaceCdp.evaluate(`(async () => {
      await document.fonts.ready;
      return { family: getComputedStyle(document.body).fontFamily,
        loaded: [...document.fonts].some(font => font.family === 'Pretendard Variable' && font.status === 'loaded') };
    })()`, true);
    if (sourceElectron) assert.ok(font.loaded, `Bundled UI font was not loaded: ${JSON.stringify(font)}`);
    await captureScreenshot(workspaceCdp, screenshotPath);
    console.log(`Saved SPS Workspace screenshot: ${screenshotPath}`);
    if (sourceElectron) {
      for (const [width, height] of [[1024, 720], [1280, 800], [1440, 900]]) {
        await workspaceCdp.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await workspaceCdp.evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`, true);
        const layout = await workspaceCdp.evaluate(`(() => {
          const main = document.getElementById('main-content');
          return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
            contentWidth: main.clientWidth, contentScrollWidth: main.scrollWidth,
            clippedActions: [...main.querySelectorAll('button')].filter(button => {
              const box = button.getBoundingClientRect();
              return box.width > 0 && (box.left < 0 || box.right > innerWidth);
            }).map(button => button.getAttribute('aria-label') || button.textContent) };
        })()`);
        assert.ok(layout.documentWidth <= layout.viewport && layout.contentScrollWidth <= layout.contentWidth + 1,
          `Horizontal overflow at ${width}x${height}: ${JSON.stringify(layout)}`);
        assert.deepEqual(layout.clippedActions, [], `Clipped actions at ${width}x${height}`);
        const responsivePath = path.join(path.dirname(screenshotPath), `${path.parse(screenshotPath).name}-${width}x${height}.png`);
        await captureScreenshot(workspaceCdp, responsivePath);
        console.log(`Verified responsive Workspace: ${width}x${height}`);
      }
      await workspaceCdp.command("Emulation.clearDeviceMetricsOverride");
    }
  }

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
    (page) => page.body.includes("Default Workspace restored"),
    "the Neutral Shell fallback warning",
  );
  assert.match(fallback.body, /selected shell/i, `Neutral fallback did not explain the disabled Shell: ${fallback.body}`);
  if (sourceElectron) {
    await workspaceCdp.evaluate(`location.assign(${JSON.stringify(`/${companyPrefix}`)})`);
    const unavailableEntry = await waitForPage(
      workspaceCdp,
      (page) => page.workspaceEntry === "empty",
      "the generic empty entry after the selected Shell becomes unavailable",
    );
    const unavailableDom = await workspaceCdp.evaluate(`(() => ({
      marker: document.querySelector('[data-sps-workspace-entry]')?.getAttribute('data-sps-workspace-entry') || null,
      unavailableMessage: document.body.innerText.includes('The selected plugin is unavailable.'),
      privateFallbackDetail: /Selected Shell plugin is not active/i.test(document.body.innerText),
      legacyChrome: Boolean(document.querySelector('#main-content, aside, nav[aria-label="breadcrumb"]')),
    }))()`);
    assert.equal(new URL(unavailableEntry.route).pathname.replace(/\/$/, ""), `/${companyPrefix}`.replace(/\/$/, ""));
    assert.equal(unavailableDom.marker, "empty");
    assert.equal(unavailableDom.unavailableMessage, true, `Unavailable Shell did not use the generic empty state: ${JSON.stringify(unavailableDom)}`);
    assert.equal(unavailableDom.privateFallbackDetail, false, "Unavailable Shell leaked internal fallback detail on the independent root.");
    assert.equal(unavailableDom.legacyChrome, false, "Unavailable Shell root rendered legacy navigation or breadcrumbs.");
  }

  console.log(`SPS Desktop Workspace Surfaces functional assertions passed (${packagedBinary ? "packaged" : "source"}); cleanup qualification pending.`);
  }
} catch (error) {
  acceptanceFailure = error;
  if (nativeManagement) {
    const safeSnapshot = setupCdp ? await setupCdp.evaluate(`(async () => {
      const api = window.spsCoreSettings;
      const status = typeof api?.getStatus === 'function' ? await api.getStatus() : null;
      const native = status?.nativeConnectivity;
      const knownStates = ['identity_prepared', 'identity_not_current', 'recovery_required', 'unavailable', 'not_prepared', 'host_required'];
      return { settingsApi: Boolean(api), canManageHost: status?.canManageHost === true,
        identityPreparedText: Boolean(document.body?.innerText?.includes('Identity prepared')),
        nativeState: knownStates.includes(native?.state) ? native.state : 'other',
        hasPin: /^[0-9a-f]{64}$/.test(native?.serverSpkiSha256 ?? ''),
        pluginsDisabled: status?.recovery?.pluginsDisabled === true };
    })()`, true).catch(() => null) : null;
    const failureSha256 = createHash("sha256").update(errorText(error)).digest("hex");
    acceptanceFailure = new Error(`Prepared Native Host source E2E failed (stage=${nativeManagementStage}, failureSha256=${failureSha256}, snapshot=${JSON.stringify(safeSnapshot)}).`);
    throw acceptanceFailure;
  }
  const diagnostics = [];
  diagnostics.push(`Failure stage summary: ${JSON.stringify(snapshotPreviewE2eFailure(error, failurePhase))}`);
  for (const [label, cdp] of [["setup", setupCdp], ["workspace", workspaceCdp]]) {
    if (!cdp) continue;
    try { diagnostics.push(`${label}: ${JSON.stringify(await describePage(cdp))}`); } catch (diagnosticError) { diagnostics.push(`${label}: ${errorText(diagnosticError)}`); }
  }
  if (appOutput.trim()) diagnostics.push(`app-output:\n${appOutput.trim()}`);
  acceptanceFailure = new Error(`${errorText(error)}\n${diagnostics.join("\n")}`);
  throw acceptanceFailure;
} finally {
  const failedStages = new Set();
  let cleanupStage = "desktop_shutdown";
  const attempt = async (stage, operation) => {
    try { return await operation(); }
    catch (error) {
      failedStages.add(stage);
        const reason = workspaceE2eCleanupFailureReason(stage, error);
      console.log(`[workspace-e2e] cleanup failure: ${JSON.stringify({ stage, reason })}`);
      return null;
    }
  };
  try {
    if (workspaceCdp) await workspaceCdp.evaluate(d2RequestMonitorStopExpression).catch(() => undefined);
    const quitCdp = workspaceCdp ?? setupCdp;
    let forceStopRequested = false, closeRequestFailed = false;
    const shutdownStartedAt = Date.now();
    const stopped = await attempt("desktop_shutdown", () => shutdownPreviewE2eDesktop({ child,
      requestBrowserClose: quitCdp ? () => requestBrowserShutdown().catch(error => {
        closeRequestFailed = true; throw error;
      }) : undefined,
      forceStop: target => { forceStopRequested = true; return stopProcessTree(target); } }));
    console.log(`[workspace-e2e] final Main shutdown: ${JSON.stringify({ ...stopped, forceStopRequested,
      closeRequestFailed, elapsedMs: Date.now() - shutdownStartedAt })}`);
    await workspaceCdp?.close().catch(() => undefined);
    await setupCdp?.close().catch(() => undefined);
    if (!ownedJobCleanupPending) await attempt("packaged_orphans", () => assertNoPackagedRuntimeOrphans(userDataDirectory));
    const identityClosed = await attempt("identity_close", () => boundedCleanup(mockIdentity.close(), "mock Identity").then(() => true));
    let temporaryDataRemoved = false;
    if (!keepE2eData) {
      temporaryDataRemoved = await attempt("temporary_data", () => boundedCleanup(fixture.remove(), "temporary data", 20_000)
        .then(() => true)) === true;
    }
    cleanupStage = "output_end";
    const processEvidence = await launched.waitForOutputEnd(5000);
    console.log(`[workspace-e2e] owned Main/output summary: ${JSON.stringify(processEvidence)}`);
    cleanupStage = "qualification";
    cleanupDisposition = workspaceE2eCleanupDisposition({ delegated: ownedJobCleanupPending, ...processEvidence,
      finalDesktopGraceful: stopped?.graceful === true, temporaryDataRemoved, identityClosed: identityClosed === true });
  } catch { failedStages.add(cleanupStage); }
  finally { launched.dispose(); }
  if (failedStages.size) throw new AggregateError([
    ...(acceptanceFailure ? [acceptanceFailure] : []),
    new Error(`Workspace E2E cleanup stages failed: ${[...failedStages].join(",")}.`),
  ], "Workspace E2E cleanup is incomplete; the test cannot be accepted.");
}

if (ownedJobCleanupPending) console.log("[workspace-e2e] standalone child is not qualified; natural owned-Job cleanup is pending");
else console.log("[workspace-e2e] local Main/output/data cleanup confirmed; not whole-descendant or physical qualification");
await new Promise(resolve => process.stdout.write("[workspace-e2e] evidence flushed\n", resolve));
process.exit(cleanupDisposition.exitCode);

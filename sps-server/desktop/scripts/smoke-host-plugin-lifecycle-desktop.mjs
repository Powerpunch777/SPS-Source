import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { once } from "node:events";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagedBinary = process.env.SPS_DESKTOP_E2E_BINARY?.trim();
const sourceElectron = path.join(desktopRoot, "node_modules", "electron", "dist", "electron.exe");
const liveAgent = process.argv.includes("--live-agent");
const deterministicAcp = path.join(desktopRoot, "scripts", "fixtures", "deterministic-marketplace-acp.mjs");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const textOf = (error) => error instanceof Error ? error.message : String(error);
const encoded = (value) => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

if (process.platform !== "win32") throw new Error("Host plugin lifecycle Desktop E2E targets Windows.");
if (packagedBinary) await access(packagedBinary);
else await access(sourceElectron);
if (!liveAgent) await access(deterministicAcp);

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

async function stopTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  await execFileAsync("taskkill", ["/pid", String(child.pid), "/T", "/F"]).catch(() => undefined);
  await Promise.race([once(child, "exit").catch(() => undefined), delay(10_000)]);
}

async function removeRetry(target) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try { await rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 }); return; }
    catch { await delay(300); }
  }
  throw new Error(`Could not remove ${target}`);
}

function mockIdentity() {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicJwk = keys.publicKey.export({ format: "jwk" });
  const codes = new Set();
  const refreshTokens = new Set();
  let origin = null;
  let signIns = 0;
  const accessToken = () => {
    const now = Math.floor(Date.now() / 1000);
    const header = encoded({ alg: "RS256", kid: "lifecycle-e2e", typ: "JWT" });
    const payload = encoded({ iss: origin, aud: "sps-core", sub: "lifecycle-e2e-owner", email: "lifecycle-e2e@example.test", name: "Lifecycle E2E Owner", scope: "sps.core.session", iat: now, nbf: now - 1, exp: now + 3600 });
    const input = `${header}.${payload}`;
    return `${input}.${sign("RSA-SHA256", Buffer.from(input), keys.privateKey).toString("base64url")}`;
  };
  const tokenResponse = () => {
    const refresh = `refresh-${randomBytes(18).toString("base64url")}`;
    refreshTokens.add(refresh);
    signIns += 1;
    return { access_token: accessToken(), refresh_token: refresh, expires_in: 3600, account: { subject: "lifecycle-e2e-owner", email: "lifecycle-e2e@example.test", name: "Lifecycle E2E Owner", picture: null } };
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", origin || "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [{ ...publicJwk, kid: "lifecycle-e2e", alg: "RS256", use: "sig" }] }));
    if (request.method === "GET" && url.pathname === "/v1/desktop/authorize") {
      const redirect = new URL(url.searchParams.get("redirect_uri") || "");
      const state = url.searchParams.get("state");
      if (!state) return response.writeHead(400).end("Missing state");
      const code = `code-${randomBytes(18).toString("base64url")}`;
      codes.add(code); redirect.searchParams.set("code", code); redirect.searchParams.set("state", state);
      return response.writeHead(302, { location: redirect.toString() }).end();
    }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    let body = {}; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch {}
    if (request.method === "POST" && url.pathname === "/v1/desktop/token") {
      if (!codes.delete(String(body.code || ""))) return response.writeHead(400).end(JSON.stringify({ error: "invalid code" }));
      return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(tokenResponse()));
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/refresh") {
      if (!refreshTokens.has(String(body.refresh_token || ""))) return response.writeHead(400).end(JSON.stringify({ error: "invalid refresh" }));
      return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(tokenResponse()));
    }
    if (request.method === "POST" && url.pathname === "/v1/desktop/revoke") return response.writeHead(204).end();
    return response.writeHead(404).end("Not found");
  });
  return {
    async start() {
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
      origin = `http://127.0.0.1:${server.address().port}`;
      return { origin, get signIns() { return signIns; } };
    },
    close: async () => server.listening ? new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) : undefined,
  };
}

async function targets(port) { return await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2000) }).then((response) => response.json()); }
async function waitTarget(port, child, predicate, label, timeout = 150000) {
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
  await Promise.race([once(socket, "open"), delay(8000).then(() => { throw new Error("Timed out opening CDP."); })]);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.method !== "Page.javascriptDialogOpening") return;
    socket.send(JSON.stringify({ id: 0, method: "Page.handleJavaScriptDialog", params: { accept: true } }));
  });
  const enablePage = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("CDP Page.enable timed out.")), 10000);
    const listener = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timer); socket.removeEventListener("message", listener);
      message.error ? reject(new Error(message.error.message)) : resolve(message.result);
    };
    socket.addEventListener("message", listener);
    socket.send(JSON.stringify({ id: 1, method: "Page.enable", params: {} }));
  });
  await enablePage;
  let id = 0;
  const call = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => reject(new Error(`CDP ${method} timed out.`)), timeout);
    const listener = (event) => { const message = JSON.parse(event.data); if (message.id !== requestId) return; clearTimeout(timer); socket.removeEventListener("message", listener); message.error ? reject(new Error(message.error.message)) : resolve(message.result); };
    socket.addEventListener("message", listener); socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  return {
    command: call,
    evaluate: async (expression, awaitPromise = false, timeout = 20000) => {
      const result = await call("Runtime.evaluate", { expression, awaitPromise, returnByValue: true }, timeout);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Page evaluation failed.");
      return result.result?.value;
    },
    close: async () => { if (socket.readyState !== WebSocket.CLOSED) socket.close(); },
  };
}

async function page(cdp) { return await cdp.evaluate("({ url: location.href, title: document.title, text: document.body?.innerText || '' })"); }
async function waitPage(cdp, predicate, label, timeout = 60000) {
  const end = Date.now() + timeout; let current;
  while (Date.now() < end) { try { current = await page(cdp); if (await predicate(current)) return current; } catch {} await delay(250); }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(current)}`);
}
async function clickText(cdp, texts, label, { exact = false, scopeText = null } = {}) {
  const candidates = Array.isArray(texts) ? texts : [texts];
  const result = await cdp.evaluate(`(() => {
    const wanted = ${JSON.stringify(candidates)};
    const exact = ${JSON.stringify(exact)};
    const nodes = [...document.querySelectorAll('button,[role="button"],a')];
    const normalized = (value) => (value || '').replace(/\\s+/g, ' ').trim();
    const inScope = (element) => {
      if (!${JSON.stringify(scopeText)}) return true;
      const row = element.closest('li,[role="listitem"],section,.divide-y > div') || element.parentElement;
      return normalized(row?.textContent).includes(${JSON.stringify(scopeText)});
    };
    const node = nodes.find((element) => inScope(element) && wanted.some((text) => text.startsWith('#')
      ? element.id === text.slice(1)
      : exact ? normalized(element.textContent) === text : normalized(element.textContent).includes(text) || element.getAttribute('title') === text || element.getAttribute('aria-label') === text));
    if (!node) return { ok: false, reason: 'not found', body: document.body?.innerText?.slice(0, 5000) || '' };
    if (node.disabled || node.getAttribute('aria-disabled') === 'true') return { ok: false, reason: 'disabled', text: normalized(node.textContent) };
    node.scrollIntoView({ block: 'center', inline: 'center' }); node.click();
    return { ok: true, text: normalized(node.textContent), title: node.getAttribute('title') };
  })()`);
  assert.equal(result?.ok, true, `${label} could not be clicked: ${result?.reason || "unknown"}. ${result?.body || result?.text || ""}`);
  return result;
}
async function setField(cdp, selector, value, label) {
  const result = await cdp.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return { ok: false, reason: 'not found' };
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value')?.set;
    setter?.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  })()`);
  assert.equal(result?.ok, true, `${label} field could not be filled: ${result?.reason || "unknown"}`);
}
async function api(cdp, pathName, options = {}) {
  const result = await cdp.evaluate(`(async () => {
    const response = await fetch(${JSON.stringify(pathName)}, { method: ${JSON.stringify(options.method || "GET")}, credentials: 'include', headers: { 'content-type': 'application/json' }, body: ${options.body === undefined ? "undefined" : JSON.stringify(JSON.stringify(options.body))} });
    const text = await response.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: response.status, body };
  })()`, true);
  if (result.status < 200 || result.status >= 300) throw new Error(`API ${options.method || "GET"} ${pathName} failed (${result.status}): ${JSON.stringify(result.body)}`);
  return result.body;
}
function lifecycleSnapshot(records) {
  return (Array.isArray(records) ? records : []).map((record) => ({ id: record.id, key: record.pluginKey, status: record.status })).sort((a, b) => a.key.localeCompare(b.key));
}
async function waitPlugin(cdp, pluginId, predicate, label) {
  const end = Date.now() + 30000; let record;
  while (Date.now() < end) { const records = await api(cdp, "/api/plugins"); record = records.find((item) => item.id === pluginId); if (predicate(record)) return record; await delay(300); }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(record)}`);
}
async function waitActivation(cdp, companyId, pluginId, enabled, label) {
  const end = Date.now() + 30000; let activation = null;
  while (Date.now() < end) {
    const result = await api(cdp, `/api/plugins/companies/${companyId}`);
    activation = result?.plugins?.find((item) => item.id === pluginId)?.activation ?? null;
    if (activation?.enabled === enabled) return activation;
    await delay(300);
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(activation)}`);
}
async function maybeApproveCapabilityUpdate(cdp, pluginId, pluginName) {
  const reviewAvailable = await cdp.evaluate(`(() => [...document.querySelectorAll('a,button')].some((element) => {
    const row = element.closest('li,[role="listitem"],section,.divide-y > div') || element.parentElement;
    return (element.textContent || '').includes('Review update') && (row?.textContent || '').includes(${JSON.stringify(pluginName)});
  }))()`);
  if (!reviewAvailable) return false;
  await clickText(cdp, "Review update", "Plugin Settings capability review", { scopeText: pluginName });
  await waitPage(cdp, (current) => /New capabilities|approve these additional capabilities/i.test(current.text), "Plugin Settings capability review");
  const checkbox = await cdp.evaluate(`(() => {
    const element = document.querySelector('[id^="approve-capabilities-"]');
    if (!element || element.disabled) return false;
    element.click();
    return true;
  })()`);
  assert.equal(checkbox, true, "Capability approval checkbox was not available.");
  await clickText(cdp, "Approve and apply update", "Plugin Settings capability approval");
  await waitPage(cdp, (current) => !/Approve and apply update/.test(current.text), "approved Plugin Settings update");
  assert.ok(pluginId, "Capability review must remain scoped to the selected plugin.");
  return true;
}

const identity = mockIdentity();
const debugPort = await freePort();
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sps-host-plugin-lifecycle-e2e-"));
const userData = path.join(temporaryRoot, "user-data");
let child; let setup; let workspace; let registry; let output = ""; let company = null; let succeeded = false;

try {
  const identityState = await identity.start();
  const binary = packagedBinary || sourceElectron;
  child = spawn(binary, [`--user-data-dir=${userData}`, `--remote-debugging-port=${debugPort}`, "--remote-allow-origins=*", ...(packagedBinary ? [] : ["."])], {
    cwd: packagedBinary ? path.dirname(binary) : desktopRoot,
    env: { ...process.env, SPS_IDENTITY_URL: identityState.origin, SPS_DESKTOP_E2E: "1", SPS_DESKTOP_E2E_USER_DATA_DIR: userData, SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1", SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const capture = (chunk) => { output = `${output}${chunk}`.slice(-20000); };
  child.stdout?.on("data", capture); child.stderr?.on("data", capture);

  setup = await cdpFor(await waitTarget(debugPort, child, (entry) => entry.title === "SPS Desktop", "SPS sign-in window"));
  await waitPage(setup, (current) => current.text.includes("SPS"), "SPS sign-in UI");
  await clickText(setup, ["#start-sps-account", "Sign in", "Continue with Google"], "SPS sign-in");
  await waitPage(setup, () => identityState.signIns > 0, "mock Identity callback", 35000);
  await waitPage(setup, (current) => /Create|Server/.test(current.text), "Owner Host choice");
  await clickText(setup, ["#create-owner-server", "Create Owner Host", "Create Server", "Create"], "Create Owner Host");

  workspace = await cdpFor(await waitTarget(debugPort, child, (entry) => /^http:\/\/127\.0\.0\.1:\d+\//.test(entry.url || ""), "Owner Workspace", 240000));
  await waitPage(workspace, (current) => /Workspace|Dashboard/.test(current.text), "Workspace UI", 90000);
  const companies = await api(workspace, "/api/companies");
  company = Array.isArray(companies) ? companies[0] : null;
  assert.ok(company?.id && company?.issuePrefix, `Owner Host did not create a Workspace: ${JSON.stringify(companies)}`);
  const agents = await api(workspace, `/api/companies/${company.id}/agents`);
  const lifecycleAgentName = liveAgent ? "Lifecycle Live Agent" : "Lifecycle Deterministic Agent";
  let lifecycleAgent = Array.isArray(agents) ? agents.find((agent) => agent.name === lifecycleAgentName) : null;
  if (!lifecycleAgent) lifecycleAgent = await api(workspace, `/api/companies/${company.id}/agents`, {
    method: "POST",
    body: {
      name: lifecycleAgentName,
      role: "engineer",
      adapterType: "codex_local",
      adapterConfig: liveAgent
        ? { engine: "acp" }
        : { engine: "acp", agentCommand: `"${process.execPath}" "${deterministicAcp}"` },
    },
  });
  assert.ok(lifecycleAgent?.id, "Host plugin lifecycle E2E could not create its Agent.");

  const before = lifecycleSnapshot(await api(workspace, "/api/plugins"));
  await workspace.evaluate(`location.assign(${JSON.stringify(`/${company.issuePrefix}/company/settings/instance/plugins`)})`);
  let managerPage = await waitPage(
    workspace,
    (current) => !current.text.includes("Loading SPS extensions...")
      && (current.text.includes("Marketplace") || current.text.includes("Install Plugin")),
    "ready Workspace plugin manager",
  );
  const hasGenericInstall = managerPage.text.includes("Install Plugin");

  // Marketplace Assistant is allowed to search and explain verified metadata,
  // but it must not mutate production plugin lifecycle state.
  await clickText(workspace, "Marketplace", "Workspace Marketplace tab", { exact: true });
  await waitPage(workspace, (current) => current.text.includes("Marketplace Assistant"), "Marketplace Assistant panel");
  const assistantBefore = lifecycleSnapshot(await api(workspace, "/api/plugins"));
  const assistantAgent = await workspace.evaluate(`(() => {
    const select = document.querySelector('#marketplace-assistant-agent');
    const option = [...(select?.options || [])].find((entry) => entry.value === ${JSON.stringify(lifecycleAgent.id)});
    return select && option ? option.value : null;
  })()`);
  assert.ok(assistantAgent, "Marketplace Assistant did not expose an allowed Agent.");
  await setField(workspace, "#marketplace-assistant-agent", assistantAgent, "Marketplace Assistant Agent");
  await clickText(workspace, "Open", "Marketplace Assistant session", { exact: true });
  await waitPage(workspace, (current) => current.text.includes("Conversation"), "Marketplace Assistant conversation");
  await setField(workspace, '[aria-label="Assistant message"]', "Which verified plugin helps with a small team?", "Marketplace Assistant message");
  await clickText(workspace, "Send", "Marketplace Assistant message send");
  await waitPage(workspace, (current) => current.text.includes("Working"), "Marketplace Assistant work start", 15000);
  await waitPage(workspace, () => workspace.evaluate(`(() => {
    const transcript = document.querySelector('[aria-label="Assistant transcript"]')?.innerText || '';
    const body = document.body?.innerText || '';
    return transcript.includes('Which verified plugin helps with a small team?')
      && /Marketplace Assistant|System/.test(transcript)
      && ${liveAgent ? "true" : "transcript.includes('Deterministic Marketplace Assistant response.') && transcript.includes('search_marketplace_plugins result:')"}
      && !body.includes('Working');
  })()`), "Marketplace Assistant terminal response", 90000);
  assert.deepEqual(lifecycleSnapshot(await api(workspace, "/api/plugins")), assistantBefore, "Marketplace Assistant changed plugin lifecycle state.");

  // Plugin Builder may create authoring records and previews, but it must not
  // install, enable, disable, or remove a production plugin by merely opening it.
  const builderBefore = lifecycleSnapshot(await api(workspace, "/api/plugins"));
  await workspace.evaluate(`location.assign(${JSON.stringify(`/${company.issuePrefix}/builder`)})`);
  await waitPage(workspace, (current) => current.text.includes("Plugin Builder"), "Plugin Builder surface");
  assert.deepEqual(lifecycleSnapshot(await api(workspace, "/api/plugins")), builderBefore, "Opening Plugin Builder changed plugin lifecycle state.");
  await workspace.evaluate(`location.assign(${JSON.stringify(`/${company.issuePrefix}/company/settings/instance/plugins`)})`);
  managerPage = await waitPage(workspace, (current) => /Plugins|Extensions|SPS Extensions/.test(current.text), "Workspace plugin manager after read-only surfaces");

  // The baseline SPS UI delegates host installation to the signed Registry.
  // This is still an actual Desktop UI action; no lifecycle API is called.
  if (!hasGenericInstall) {
    await clickText(workspace, "Marketplace", "Workspace Marketplace tab", { exact: true });
    await waitPage(workspace, (current) => current.text.includes("Open secure install review"), "Workspace secure install review control");
    await clickText(workspace, "Open secure install review", "Workspace secure install review");
    registry = await cdpFor(await waitTarget(debugPort, child, (entry) => entry.title?.startsWith("SPS Plugin Sources"), "Plugin Registry UI"));
    await waitPage(registry, (current) => /Registry|Plugin sources|review/i.test(current.text), "Plugin Registry screen");
    await waitPage(
      registry,
      () => registry.evaluate(`Boolean(document.querySelector('.stage-release:not([disabled])'))`),
      "verified Registry release",
      90_000,
    );
    await clickText(registry, "Stage for review", "Registry stage release");
    await waitPage(registry, () => registry.evaluate(`Boolean(document.querySelector('.enable-stage:not([disabled])'))`), "Registry staged release");
    await clickText(registry, ["Apply this exact reviewed plugin version", "Enable reviewed version", "Apply this verified version"], "Registry install/enable review", { exact: false });
    await waitPage(registry, () => registry.evaluate(`(() => {
      const notice = document.querySelector('#notice');
      return Boolean(notice && !notice.classList.contains('error') && / is ready[.]$/.test(notice.textContent || ''));
    })()`), "Registry install result");
    managerPage = await waitPage(workspace, (current) => /Plugins|Extensions|SPS Extensions/.test(current.text), "Workspace plugin manager after Registry install");
  } else {
    await clickText(workspace, "Install Plugin", "Workspace Install Plugin");
    await waitPage(workspace, (current) => /npm Package Name|Install Plugin/.test(current.text), "Workspace install dialog");
    await clickText(workspace, "Cancel", "Workspace install dialog cancellation");
    throw new Error("The generic Plugin Manager install dialog needs an explicit test package path; configure a signed fixture before running this harness.");
  }

  const afterInstall = await api(workspace, "/api/plugins");
  const candidate = afterInstall.find((record) => !before.some((previous) => previous.id === record.id && previous.status === record.status)) ?? afterInstall.find((record) => record.status !== "uninstalled");
  assert.ok(candidate?.id, `No lifecycle candidate appeared after the UI install flow: ${JSON.stringify({ before, afterInstall })}`);
  const candidateId = candidate.id;
  const candidateName = candidate.manifestJson?.displayName ?? candidate.pluginKey;
  const lifecycleBeforeWorkspaceActions = lifecycleSnapshot(await api(workspace, "/api/plugins"));

  // All remaining lifecycle transitions are performed only through Workspace UI.
  await workspace.evaluate(`location.assign(${JSON.stringify(`/${company.issuePrefix}/company/settings/instance/plugins`)})`);
  await waitPage(workspace, (current) => current.text.includes(candidateName), "candidate in Workspace manager");
  await maybeApproveCapabilityUpdate(workspace, candidateId, candidateName);
  const initialActivation = await api(workspace, `/api/plugins/companies/${company.id}`)
    .then((result) => result?.plugins?.find((item) => item.id === candidateId)?.activation ?? null);
  if (candidate.status !== "ready" || initialActivation?.enabled !== true) {
    await clickText(workspace, ["Start and use", "Use in this Workspace", "Enable"], "Workspace enable", { scopeText: candidateName });
  }
  await waitPlugin(workspace, candidateId, (record) => record.status === "ready", "plugin ready after enable");
  await waitActivation(workspace, company.id, candidateId, true, "plugin active in Workspace after enable");
  await clickText(workspace, ["Stop using", "Disable"], "Workspace disable", { scopeText: candidateName });
  await waitActivation(workspace, company.id, candidateId, false, "plugin inactive in Workspace");
  await waitPlugin(workspace, candidateId, (record) => record.status === "ready", "plugin remains Host-ready while Workspace is disabled");
  await clickText(workspace, ["Use in this Workspace", "Start and use", "Enable"], "Workspace re-enable", { scopeText: candidateName });
  await waitPlugin(workspace, candidateId, (record) => record.status === "ready", "plugin ready after re-enable");
  await waitActivation(workspace, company.id, candidateId, true, "plugin active in Workspace after re-enable");

  await clickText(workspace, "Uninstall", "Workspace uninstall dialog", { scopeText: candidateName });
  await waitPage(workspace, (current) => /Uninstall Plugin/.test(current.text), "uninstall confirmation dialog");
  await clickText(workspace, "Cancel", "uninstall cancellation");
  await waitPage(workspace, (current) => current.text.includes(candidateName), "plugin after uninstall cancellation");
  assert.ok((await api(workspace, "/api/plugins")).some((record) => record.id === candidateId), "Uninstall cancellation removed the plugin.");

  await clickText(workspace, "Uninstall", "Workspace uninstall confirmation dialog", { scopeText: candidateName });
  await waitPage(workspace, (current) => /Uninstall Plugin/.test(current.text), "uninstall confirmation dialog again");
  await clickText(workspace, ["Uninstall and keep summaries", "Uninstall and delete summaries"], "Workspace uninstall confirmation");
  await waitPlugin(workspace, candidateId, (record) => !record || record.status === "uninstalled", "plugin uninstalled");

  const productionAfter = lifecycleSnapshot(await api(workspace, "/api/plugins"));
  assert.deepEqual(productionAfter.filter((record) => record.id !== candidateId), lifecycleBeforeWorkspaceActions.filter((record) => record.id !== candidateId), "Marketplace/Builder flow changed an unrelated lifecycle record.");
  assert.match(managerPage.text, /Plugins|Extensions/);
  succeeded = true;
  console.log(JSON.stringify({ ok: true, lifecycle: ["install", "enable", "disable", "re-enable", "uninstall-cancel", "uninstall-confirm"], assistantLifecycleUnchanged: true }, null, 2));
} catch (error) {
  const diagnostics = [];
  for (const [label, cdp] of [["setup", setup], ["workspace", workspace], ["registry", registry]]) {
    if (!cdp) continue;
    try { diagnostics.push(`${label}: ${JSON.stringify(await page(cdp))}`); } catch (diagnosticError) { diagnostics.push(`${label}: ${textOf(diagnosticError)}`); }
  }
  if (workspace && company?.id) {
    try {
      const runs = await api(workspace, `/api/companies/${company.id}/heartbeat-runs?limit=5`);
      diagnostics.push(`heartbeat-runs: ${JSON.stringify(runs)}`);
      for (const run of (Array.isArray(runs) ? runs.slice(0, 2) : [])) {
        if (!run?.id) continue;
        const [detail, events, log] = await Promise.all([
          api(workspace, `/api/heartbeat-runs/${run.id}`).catch((requestError) => ({ error: textOf(requestError) })),
          api(workspace, `/api/heartbeat-runs/${run.id}/events?limit=100`).catch((requestError) => ({ error: textOf(requestError) })),
          api(workspace, `/api/heartbeat-runs/${run.id}/log?limitBytes=131072`).catch((requestError) => ({ error: textOf(requestError) })),
        ]);
        diagnostics.push(`heartbeat-run-${run.id}: ${JSON.stringify({ detail, events, log })}`);
      }
    } catch (requestError) {
      diagnostics.push(`heartbeat-diagnostics: ${textOf(requestError)}`);
    }
  }
  if (output.trim()) diagnostics.push(`app-output:\n${output.trim()}`);
  const diagnosticsPath = process.env.SPS_DESKTOP_E2E_DIAGNOSTICS_PATH?.trim();
  if (diagnosticsPath) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(diagnosticsPath, `${textOf(error)}\n${diagnostics.join("\n")}\n`, "utf8").catch(() => undefined);
  }
  throw new Error(`${textOf(error)}\n${diagnostics.join("\n")}`);
} finally {
  const cdp = workspace ?? setup;
  if (cdp && child?.exitCode === null) { await cdp.command("Browser.close").catch(() => undefined); await Promise.race([once(child, "exit").catch(() => undefined), delay(20000)]); }
  await registry?.close().catch(() => undefined);
  await workspace?.close().catch(() => undefined);
  await setup?.close().catch(() => undefined);
  await stopTree(child);
  await identity.close().catch(() => undefined);
  if (!succeeded && process.env.SPS_DESKTOP_E2E_KEEP_FAILED === "1") {
    console.error(`Preserved failed E2E data: ${temporaryRoot}`);
  } else {
    await removeRetry(userData).catch(() => undefined);
    await removeRetry(temporaryRoot).catch(() => undefined);
  }
}

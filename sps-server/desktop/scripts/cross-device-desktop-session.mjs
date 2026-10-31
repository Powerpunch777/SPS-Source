import assert from "node:assert/strict";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnWindowsJobSupervisor } from "../../desktop-node/src/windows-job-supervisor.mjs";
import { inspectCrossDeviceCandidate } from "./cross-device-candidate-guards.mjs";
import { assertPlainDirectory } from "./installer-ci-safety.mjs";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function requireCrossDeviceIdentityOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Cross-device fixture Identity must be one exact loopback origin.");
  }
  return url.origin;
}

export function requireCrossDeviceDebugEndpoint(value, port, kind) {
  const url = new URL(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !["page", "browser"].includes(kind)
    || url.protocol !== "ws:" || url.hostname !== "127.0.0.1" || url.port !== String(port)
    || url.username || url.password || url.search || url.hash
    || !new RegExp(`^/devtools/${kind}/[A-Za-z0-9-]+$`).test(url.pathname)) {
    throw new Error("Cross-device CDP endpoint escaped the owned loopback browser.");
  }
  return url.href;
}

export function assertCrossDeviceBrowserOwnership(commandLine, executable, profile, port) {
  const args = commandLine?.arguments;
  if (!Array.isArray(args) || args.some(argument => typeof argument !== "string" || argument.includes("\0"))
    || typeof executable !== "string" || typeof profile !== "string"
    || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Cross-device CDP browser ownership could not be verified.");
  }
  if (args[0] !== executable) throw new Error("Cross-device CDP browser executable does not match the candidate.");
  const profileFlags = args.filter(argument => /^--(?:user-data-dir|profile-directory|disk-cache-dir|data-path)(?:=|$)/i.test(argument));
  const debugFlags = args.filter(argument => /^--remote-debugging-port(?:=|$)/i.test(argument));
  if (profileFlags.length !== 1 || profileFlags[0] !== `--user-data-dir=${profile}`
    || debugFlags.length !== 1 || debugFlags[0] !== `--remote-debugging-port=${port}`) {
    throw new Error("Cross-device CDP browser profile or debug port does not match the owned session.");
  }
  return true;
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function bounded(operation, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not complete within its observation bound.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function connectPage(target, port, kind = "page") {
  const socket = new WebSocket(requireCrossDeviceDebugEndpoint(target.webSocketDebuggerUrl, port, kind));
  const pending = new Map();
  let nextId = 0;
  const rejectPending = () => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error("Owned cross-device CDP socket closed."));
    }
    pending.clear();
  };
  socket.addEventListener("error", rejectPending);
  socket.addEventListener("close", rejectPending);
  try {
    await bounded(new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("Owned cross-device CDP connection failed.")), { once: true });
    }), 8_000, "Cross-device CDP connection");
  } catch (error) { socket.close(); throw error; }
  socket.addEventListener("message", event => {
    let message;
    try {
      if (typeof event.data !== "string" || Buffer.byteLength(event.data) > 1024 * 1024) throw new Error();
      message = JSON.parse(event.data);
    } catch { rejectPending(); socket.close(); return; }
    const entry = pending.get(message?.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    if (message.error) entry.reject(new Error("Owned cross-device CDP command was rejected."));
    else entry.resolve(message.result);
  });
  const command = (method, params = {}, timeoutMs = 15_000) => new Promise((resolve, reject) => {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 360_000) {
      return reject(new Error("Invalid owned CDP observation bound."));
    }
    if (socket.readyState !== WebSocket.OPEN) return reject(new Error("Owned CDP socket is not open."));
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Owned cross-device CDP command timed out."));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { socket.send(JSON.stringify({ id, method, params })); }
    catch { pending.delete(id); clearTimeout(timer); reject(new Error("Owned CDP command could not be sent.")); }
  });
  return {
    command,
    async evaluate(expression, timeoutMs) {
      const result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
      if (result.exceptionDetails) throw new Error("Cross-device fixture renderer rejected its action.");
      return result.result?.value;
    },
    close() { rejectPending(); socket.close(); },
  };
}

// This is an isolated test session, not a new product launch or remote-control API.
export async function createCrossDeviceDesktopSession({ fixtureRoot, expected, role, identityOrigin }) {
  if (process.platform !== "win32" || !["host", "runner"].includes(role)) {
    throw new Error("Cross-device Desktop fixture requires an explicit Windows Host or Runner role.");
  }
  const identityUrl = requireCrossDeviceIdentityOrigin(identityOrigin);
  const candidate = await inspectCrossDeviceCandidate({ fixtureRoot, expected });
  const expectedTuple = Object.freeze({ desktopVersion: candidate.baseline.desktopVersion,
    sourceRevision: candidate.baseline.sourceRevision, coreRevision: candidate.baseline.core.revision,
    sdkRevision: candidate.baseline.pluginSdk.revision });
  const profile = path.join(fixtureRoot, `${role}-profile`);
  await mkdir(profile); // Refuse to adopt any existing user or abandoned test profile.
  const profileIdentity = await lstat(profile, { bigint: true });
  let child;
  let setup;
  let port;
  const executable = path.join(fixtureRoot, "candidate", "SPS Desktop.exe");
  let output = "";
  const sockets = new Set();
  const assertProfile = async () => {
    assert.equal(await assertPlainDirectory(profile), profile);
    const current = await lstat(profile, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    assert.equal(current.dev, profileIdentity.dev);
    assert.equal(current.ino, profileIdentity.ino);
    assert.equal(current.birthtimeNs, profileIdentity.birthtimeNs);
  };
  async function targets() {
    await assertBrowserOwnership();
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(2_000) });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function assertBrowserOwnership() {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(2_000) });
    assert.equal(response.status, 200);
    const browser = await connectPage(await response.json(), port, "browser");
    try {
      const commandLine = await browser.command("Browser.getBrowserCommandLine");
      assertCrossDeviceBrowserOwnership(commandLine, executable, profile, port);
    } finally { browser.close(); }
  }
  async function page(predicate, timeout = 120_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const terminal = child?.exitCode;
      if (terminal !== null && terminal !== undefined) throw new Error("Owned Desktop supervisor exited before the page was ready.");
      let list;
      try { list = await targets(); } catch { list = []; }
      const target = list.find(row => row.type === "page" && predicate(row));
      if (target) {
        const connected = await connectPage(target, port);
        sockets.add(connected);
        return connected;
      }
      await delay(200);
    }
    throw new Error("Owned Desktop page did not become ready.");
  }
  async function start() {
    assert.equal(child, undefined, "Stop the owned session before restarting it.");
    await assertProfile();
    assert.deepEqual(await inspectCrossDeviceCandidate({ fixtureRoot, expected: expectedTuple }), candidate);
    port = await availablePort();
    const helperPath = path.join(fixtureRoot, "candidate", "resources", "sps-windows-job-supervisor", "SpsWindowsJobSupervisor.exe");
    const helper = await lstat(helperPath);
    assert.ok(helper.isFile() && !helper.isSymbolicLink() && helper.nlink === 1 && helper.size > 0);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => typeof value === "string"
      && !/^(?:SPS_|PAPERCLIP_|NODE_OPTIONS$|ELECTRON_RUN_AS_NODE$|DATABASE_URL$)/i.test(key)));
    const windows = env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows";
    for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
    env.PATH = [path.join(fixtureRoot, "bin"), path.join(windows, "System32"), windows,
      path.join(env.ProgramFiles ?? "C:\\Program Files", "Tailscale")].join(path.delimiter);
    Object.assign(env, { SPS_IDENTITY_URL: identityUrl, SPS_DESKTOP_E2E: "1", SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1",
      SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1", SPS_DESKTOP_E2E_USER_DATA_DIR: profile });
    child = spawnWindowsJobSupervisor({ executable, args: ["--sps-core-settings", `--user-data-dir=${profile}`,
      `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", "--remote-allow-origins=*", "--enable-automation"],
    cwd: path.dirname(executable), env }, { helperPath });
    child.stdout.on("data", bytes => { output = `${output}${bytes}`.slice(-24_000); });
    child.stderr.on("data", bytes => { output = `${output}${bytes}`.slice(-24_000); });
    try {
      await child.supervisorReady;
      const setupUrl = pathToFileURL(path.join(fixtureRoot, "candidate", "resources", "app.asar", "renderer", "index.html")).href;
      setup = await page(row => row.url === setupUrl);
      const readyDeadline = Date.now() + 15_000;
      let ready = false;
      while (Date.now() < readyDeadline) {
        ready = await setup.evaluate("document.readyState === 'complete' && Boolean(window.spsDesktop) && Boolean(document.querySelector('#start-sps-account')) && !document.querySelector('#start-sps-account').disabled");
        if (ready) break;
        await delay(100);
      }
      assert.equal(ready, true, "Owned setup renderer did not finish its initial status rendering.");
      return { candidate, role };
    } catch (error) {
      const failedChild = child;
      for (const socket of sockets) socket.close();
      sockets.clear();
      setup = undefined;
      if (failedChild) {
        try {
          const terminal = await failedChild.terminateOwnedJob();
          if (terminal?.activeProcesses === 0) child = undefined;
        } catch { /* Preserve an unconfirmed owner and the original startup failure. */ }
      }
      throw error;
    }
  }
  async function stop() {
    if (!child) return { natural: true, alreadyStopped: true };
    let settings;
    let terminationConfirmed = false;
    try {
      const settingsUrl = pathToFileURL(path.join(fixtureRoot, "candidate", "resources", "app.asar", "renderer", "core-settings.html")).href;
      settings = await page(row => row.url === settingsUrl, 15_000);
      assert.equal(await settings.evaluate("(() => { const button = document.querySelector('#quit-desktop'); if (document.readyState !== 'complete' || !window.spsCoreSettings || !button || button.disabled || button.hidden) return false; button.click(); return true; })()"), true,
        "Could not request normal Desktop quit through its owned Core Settings button.");
      const terminal = await bounded(child.waitForOwnedJobTermination(), 30_000, "Owned Desktop shutdown");
      assert.deepEqual(terminal, { type: "exit", activeProcesses: 0, code: 0 });
      terminationConfirmed = true;
      await assertProfile();
      return { natural: true, activeProcesses: 0, code: 0 };
    } catch (error) {
      // Cleanup is confined to the retained native Job and is NEVER a passing exit.
      await child.terminateOwnedJob().then(result => { terminationConfirmed = result.activeProcesses === 0; }).catch(() => {});
      throw error;
    } finally {
      settings?.close();
      for (const socket of sockets) socket.close();
      sockets.clear();
      // Keep an unconfirmed native owner reachable; do not silently lose the
      // only handle that could still safely stop its descendants.
      if (terminationConfirmed) child = undefined;
      setup = undefined;
      output = "";
    }
  }
  return {
    candidate, profile, start, stop, page,
    async setupAction(method, input) {
      const allowed = new Set(["getStatus", "createOwnerServer", "inspectTeamAccess", "enablePrivateTeamAccess",
        "disablePrivateTeamAccess", "saveProfile", "connectNode", "disconnectNode", "openWorkspace"]);
      assert.ok(allowed.has(method));
      const longAction = ["createOwnerServer", "enablePrivateTeamAccess", "disablePrivateTeamAccess"].includes(method);
      return setup.evaluate(`window.spsDesktop[${JSON.stringify(method)}](${input === undefined ? "" : JSON.stringify(input)})`, longAction ? 360_000 : 15_000);
    },
    async beginSignIn() {
      return setup.evaluate("(() => { const b = document.querySelector('#start-sps-account'); if (!b || b.disabled) throw new Error('Sign-in is not ready'); b.click(); return true; })()");
    },
    async workspaceApi(apiPath, options = {}) {
      assert.match(apiPath, /^\/api\/(?:companies|plugins|sps-nodes)(?:\/|$)/);
      const status = await setup.evaluate("window.spsDesktop.getStatus()");
      const origin = new URL(status.profile.hubUrl).origin;
      assert.ok(origin.startsWith("http://127.0.0.1:") || origin.startsWith("https://"));
      const workspace = await page(row => row.url.startsWith(`${origin}/`));
      try {
        return await workspace.evaluate(`(async () => {
          const response = await fetch(${JSON.stringify(apiPath)}, { credentials: 'include',
            method: ${JSON.stringify(options.method ?? "GET")}, headers: {'content-type':'application/json'},
            ${options.body === undefined ? "" : `body: JSON.stringify(${JSON.stringify(options.body)}),`}
          });
          if (!response.ok) throw new Error('Scoped fixture API request failed');
          return response.status === 204 ? null : response.json();
        })()`);
      } finally { workspace.close(); sockets.delete(workspace); }
    },
    async verifyLoadedRuntime() {
      await assertProfile();
      const actual = JSON.parse(await readFile(path.join(profile, "owner-host-runtime", expectedTuple.desktopVersion, "sps-release-baseline.json"), "utf8"));
      assert.deepEqual(actual, candidate.baseline);
      return { loadedBaselineMatchesCandidate: true };
    },
  };
}

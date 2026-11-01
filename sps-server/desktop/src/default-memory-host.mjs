import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { spawn as spawnChildProcess } from "node:child_process";

export const SPS_DEFAULT_MEMORY_PORT = 31_880;

function isUsablePort(value) {
  return Number.isInteger(value) && value > 0 && value < 65_536;
}

function asMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}

function childHasExited(child) {
  return Boolean(child && (child.exitCode != null || child.signalCode != null));
}

function waitForChildClose(owner, timeoutMs) {
  if (owner.closed) return Promise.resolve(true);
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      owner.child.removeListener("close", finish);
      resolve(owner.closed);
    };
    const timer = setTimeout(finish, timeoutMs);
    owner.child.once("close", finish);
    if (owner.closed) finish();
  });
}

function terminateWindowsProcessTree(pid) {
  if (process.platform !== "win32" || !Number.isInteger(pid) || pid <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const child = spawnChildProcess("taskkill", ["/pid", String(pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.once("error", () => resolve());
    child.once("exit", () => resolve());
  });
}

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findOpenPort({ start = SPS_DEFAULT_MEMORY_PORT, attempts = 100, isAvailable = canListen } = {}) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const port = start + offset;
    if (!isUsablePort(port)) break;
    if (await isAvailable(port)) return port;
  }
  throw new Error("SPS Default Memory could not reserve a local sidecar port.");
}

function parseConfig(raw, configPath) {
  try {
    const config = JSON.parse(raw);
    const port = Number(config?.server?.port);
    const token = String(config?.security?.token ?? "").trim();
    if (!isUsablePort(port) || !token) throw new Error("server.port and security.token are required.");
    return config;
  } catch (error) {
    throw new Error(`SPS Default Memory config is invalid at ${configPath}: ${asMessage(error)}`);
  }
}

export function defaultMemoryVaultLayout(ownerVaultRoot) {
  const root = path.join(path.resolve(ownerVaultRoot), "memory");
  return {
    root,
    configPath: path.join(root, "config.json"),
    dataDir: path.join(root, "data"),
    journalsDir: path.join(root, "journals"),
  };
}

export function createSpsDefaultMemoryConfig({ ownerVaultRoot, port, token = crypto.randomBytes(32).toString("hex") } = {}) {
  if (!ownerVaultRoot) throw new Error("SPS Default Memory requires an Owner Vault root.");
  if (!isUsablePort(port)) throw new Error("SPS Default Memory requires a valid loopback port.");
  const layout = defaultMemoryVaultLayout(ownerVaultRoot);
  return {
    server: { host: "127.0.0.1", port },
    security: { allowedOrigins: [], token },
    dataDir: layout.dataDir,
    journalRoot: layout.journalsDir,
    journals: [],
  };
}

export function spsDefaultMemoryUrl(config) {
  const port = Number(config?.server?.port);
  if (!isUsablePort(port)) throw new Error("SPS Default Memory config has no valid server.port.");
  return `http://127.0.0.1:${port}`;
}

export async function ensureSpsDefaultMemoryConfig({
  ownerVaultRoot,
  fsApi = fs,
  findPort = findOpenPort,
  randomToken = () => crypto.randomBytes(32).toString("hex"),
} = {}) {
  const layout = defaultMemoryVaultLayout(ownerVaultRoot);
  try {
    const raw = await fsApi.readFile(layout.configPath, "utf8");
    const config = parseConfig(raw, layout.configPath);
    return { config, layout, created: false };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const config = createSpsDefaultMemoryConfig({
    ownerVaultRoot,
    port: await findPort(),
    token: randomToken(),
  });
  await fsApi.mkdir(layout.root, { recursive: true });
  const temporaryPath = `${layout.configPath}.${process.pid}.${Date.now()}.tmp`;
  await fsApi.writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  await fsApi.rename(temporaryPath, layout.configPath);
  return { config, layout, created: true };
}

async function healthAt(url, token, fetchImpl) {
  try {
    const response = await fetchImpl(new URL("/health", url), {
      headers: token ? { "x-sidecar-token": token } : {},
      signal: AbortSignal.timeout(2_500),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.ok === true ? payload : null;
  } catch {
    return null;
  }
}

export function createSpsDefaultMemoryManager({
  url,
  token,
  configPath,
  resolveEntry = async () => null,
  nodeCommand = process.execPath,
  resolveNodeCommand = async () => nodeCommand,
  spawn = spawnChildProcess,
  fetchImpl = fetch,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  startupAttempts = 80,
  terminateTree = terminateWindowsProcessTree,
  gracefulStopMs = 5_000,
  exitConfirmationMs = 5_000,
} = {}) {
  if (!url || !token || !configPath) throw new Error("SPS Default Memory requires URL, token, and config path.");
  if (![gracefulStopMs, exitConfirmationMs].every(value => Number.isSafeInteger(value) && value >= 1 && value <= 15_000)) {
    throw new TypeError("SPS Default Memory stop waits must be bounded integers.");
  }
  let owner = null;
  let startedAt = null;
  let lastError = null;
  let observedUnowned = false;
  let generation = 0;
  let starting = null;
  const stopping = new Set();
  const emptyReferences = Object.freeze({ available: true, references: Object.freeze([]) });
  const unavailableReferences = Object.freeze({ available: false, references: Object.freeze([]) });

  function referencesFor(command, entry) {
    const paths = [["command", command, "file"], ["entry", entry, "file"],
      ["cwd", path.dirname(entry), "directory"], ["config", configPath, "file"]];
    if (paths.some(([, value]) => typeof value !== "string" || !path.isAbsolute(value)
      || path.resolve(value) !== value || /[\u0000-\u001f\u007f]/.test(value)
      || (process.platform === "win32" ? !/^[A-Za-z]:\\$/.test(path.parse(value).root) : path.parse(value).root !== "/"))) {
      return unavailableReferences;
    }
    const id = crypto.randomUUID();
    return Object.freeze({ available: true, references: Object.freeze(paths.map(([label, value, kind]) => Object.freeze({
      source: "desktop-memory-runtime", ownerId: `${id}:${label}`, state: "retained", path: value, kind,
    }))) });
  }

  async function inspect() {
    const observed = owner;
    const observedGeneration = generation;
    let health = await healthAt(url, token, fetchImpl);
    if (observed !== owner || observedGeneration !== generation) health = null;
    if (owner) {
      if (childHasExited(owner.child) || owner.uncertainStop || stopping.size) return { state: "stopping", url, health: null, startedAt, lastError };
      return { state: health ? "running" : "starting", url, health, startedAt, lastError };
    }
    if (health) {
      observedUnowned = true;
      return { state: "running-existing", url, health, startedAt: null, lastError };
    }
    return { state: "stopped", url, health: null, startedAt: null, lastError };
  }

  async function startOwned(expectedGeneration) {
    const current = await inspect();
    if (generation !== expectedGeneration) return inspect();
    if (current.state !== "stopped") return current;
    try {
      const entry = await resolveEntry();
      if (generation !== expectedGeneration) return inspect();
      if (!entry) {
        lastError = "SPS Default Memory runtime is not installed on this computer.";
        return inspect();
      }
      const command = await resolveNodeCommand();
      if (generation !== expectedGeneration) return inspect();
      if (!command) {
        lastError = "SPS Default Memory Node runtime is not installed on this computer.";
        return inspect();
      }
      const references = referencesFor(command, entry);
      const child = spawn(command, [entry, "--config", configPath], {
        cwd: path.dirname(entry),
        stdio: "ignore",
        windowsHide: true,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          MEMORY_SIDECAR_CONFIG: configPath,
          MEMORY_SIDECAR_TOKEN: token,
        },
      });
      const launched = { child, closed: false, uncertainStop: false, references };
      owner = launched;
      startedAt = new Date().toISOString();
      lastError = null;
      child.once("error", error => { if (owner === launched) lastError = asMessage(error); });
      child.once("exit", (code) => {
        if (owner !== launched) return;
        if (code && code !== 0) lastError = `SPS Default Memory exited with code ${code}.`;
      });
      child.once("close", () => {
        launched.closed = true;
        if (owner !== launched) return;
        owner = null;
        startedAt = null;
        if (launched.uncertainStop && (child.exitCode === 0 || child.signalCode != null)) lastError = null;
      });
    } catch (error) {
      if (generation === expectedGeneration) lastError = asMessage(error);
      return inspect();
    }

    for (let attempt = 0; attempt < startupAttempts; attempt += 1) {
      await delay(250);
      if (generation !== expectedGeneration) return inspect();
      const state = await inspect();
      if (generation !== expectedGeneration) return inspect();
      if (state.state === "running") return state;
      if (state.state === "stopped" || state.state === "stopping") return state;
    }
    lastError = "SPS Default Memory did not become ready in time.";
    return inspect();
  }

  function start() {
    if (stopping.size) return Promise.all([...stopping]).then(inspect);
    if (starting) return starting;
    const operation = startOwned(generation);
    starting = operation;
    const clear = () => { if (starting === operation) starting = null; };
    void operation.then(clear, clear);
    return operation;
  }

  async function stopOwned(force, pendingStart) {
    // Start continuations are generation-fenced after every await. Join their
    // preparation before a caller can discard this manager or its paths.
    if (pendingStart) await pendingStart;
    const retained = owner;
    if (!retained) return inspect();
    const { child } = retained;
    try {
      if (!childHasExited(child)) {
        if (!force) {
          child.kill("SIGINT");
          await waitForChildClose(retained, gracefulStopMs);
        }
        if (!retained.closed && !childHasExited(child)) {
          if (!Number.isInteger(child.pid) || child.pid <= 0) throw new Error("Memory PID is unavailable.");
          await terminateTree(child.pid);
        }
      }
      if (!await waitForChildClose(retained, exitConfirmationMs)) throw new Error("Memory close was not observed.");
    } catch {
      if (!retained.closed) {
        if (owner === retained) retained.uncertainStop = true;
        lastError = "SPS Default Memory process closure has not been confirmed; its runtime remains retained.";
        throw Object.assign(new Error(lastError), { code: "default_memory_stop_unconfirmed" });
      }
    }
    if (owner === retained) owner = null;
    if (!owner) startedAt = null;
    if (child.exitCode === 0 || child.signalCode != null) lastError = null;
    return inspect();
  }

  function stop({ force = false } = {}) {
    if (!force && stopping.size) return Promise.all([...stopping]).then(inspect);
    generation += 1;
    const operation = stopOwned(force, starting);
    stopping.add(operation);
    const clear = () => stopping.delete(operation);
    void operation.then(clear, clear);
    return operation;
  }

  function readRuntimeArtifactReferences() {
    if (observedUnowned) return unavailableReferences;
    if (owner) return owner.references;
    return starting || stopping.size ? unavailableReferences : emptyReferences;
  }

  return { inspect, start, stop, readRuntimeArtifactReferences };
}

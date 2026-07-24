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

function waitForChildExit(child, timeoutMs) {
  if (!child || child.exitCode != null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
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
} = {}) {
  if (!url || !token || !configPath) throw new Error("SPS Default Memory requires URL, token, and config path.");
  let ownedChild = null;
  let startedAt = null;
  let lastError = null;

  async function inspect() {
    const health = await healthAt(url, token, fetchImpl);
    if (health) {
      lastError = null;
      return { state: ownedChild ? "running" : "running-existing", url, health, startedAt, lastError };
    }
    if (ownedChild && ownedChild.exitCode == null) return { state: "starting", url, health: null, startedAt, lastError };
    return { state: "stopped", url, health: null, startedAt: null, lastError };
  }

  async function start() {
    const current = await inspect();
    if (current.state !== "stopped") return current;
    const entry = await resolveEntry();
    if (!entry) {
      lastError = "SPS Default Memory runtime is not installed on this computer.";
      return inspect();
    }
    try {
      const command = await resolveNodeCommand();
      if (!command) {
        lastError = "SPS Default Memory Node runtime is not installed on this computer.";
        return inspect();
      }
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
      ownedChild = child;
      startedAt = new Date().toISOString();
      lastError = null;
      child.once("error", (error) => { lastError = asMessage(error); });
      child.once("exit", (code) => {
        if (code && code !== 0) lastError = `SPS Default Memory exited with code ${code}.`;
        ownedChild = null;
        startedAt = null;
      });
    } catch (error) {
      lastError = asMessage(error);
      return inspect();
    }

    for (let attempt = 0; attempt < startupAttempts; attempt += 1) {
      await delay(250);
      const state = await inspect();
      if (state.state === "running") return state;
      if (state.state === "stopped") return state;
    }
    lastError = "SPS Default Memory did not become ready in time.";
    return inspect();
  }

  async function stop({ force = false } = {}) {
    const child = ownedChild;
    if (child && child.exitCode == null) {
      if (force) {
        await terminateTree(child.pid);
      } else {
        child.kill("SIGINT");
        await waitForChildExit(child, 5_000);
        if (child.exitCode == null) await terminateTree(child.pid);
      }
    }
    ownedChild = null;
    startedAt = null;
    return inspect();
  }

  return { inspect, start, stop };
}

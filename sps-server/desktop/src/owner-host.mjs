import fs from "node:fs/promises";
import path from "node:path";
import { spawn as spawnChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";

function asMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}

function hostDiagnostics(value) {
  const text = String(value || "")
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/(token|secret|password|authorization)\s*([:=])\s*\S+/gi, "$1$2[redacted]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://[redacted]")
    .trim();
  if (!text) return "";
  return text.split(/\r?\n/).filter(Boolean).slice(-12).join("\n").slice(-2_000);
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
    const taskkill = spawnChildProcess("taskkill", ["/pid", String(pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
    taskkill.once("error", () => resolve());
    taskkill.once("exit", () => resolve());
  });
}

async function healthAt(url, fetchImpl) {
  try {
    const response = await fetchImpl(new URL("/api/health", url), { signal: AbortSignal.timeout(2_500) });
    if (!response.ok) return null;
    const payload = await response.json();
    return payload?.status === "ok" ? payload : null;
  } catch {
    return null;
  }
}

async function fileExists(entry, fsApi) {
  try {
    await fsApi.access(entry);
    return true;
  } catch {
    return false;
  }
}

async function removeDirectoryWithRetry(target, { fsApi, delay, attempts = 20 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await fsApi.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      const retryable = ["EACCES", "EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code);
      if (!retryable || attempt === attempts - 1) throw error;
      await delay(Math.min(1_000, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

function removeDirectoryInBackground(target, options) {
  void removeDirectoryWithRetry(target, options).catch(() => undefined);
}

async function moveDirectoryAside(target, { fsApi, delay } = {}) {
  const stale = `${target}.stale-${process.pid}-${Date.now()}`;
  try {
    await fsApi.rename(target, stale);
    return stale;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    await removeDirectoryWithRetry(target, { fsApi, delay });
    return null;
  }
}

async function findTsxLoader(coreRoot, fsApi) {
  const pnpmRoot = path.join(coreRoot, "node_modules", ".pnpm");
  let entries;
  try {
    entries = await fsApi.readdir(pnpmRoot, { withFileTypes: true });
  } catch {
    return null;
  }
  const entry = entries.find((candidate) => candidate.isDirectory() && candidate.name.startsWith("tsx@"));
  if (!entry) return null;
  const dist = path.join(pnpmRoot, entry.name, "node_modules", "tsx", "dist");
  const loader = path.join(dist, "loader.mjs");
  const preflight = path.join(dist, "preflight.cjs");
  if (!(await fileExists(loader, fsApi)) || !(await fileExists(preflight, fsApi))) return null;
  return { loader, preflight };
}

export async function materializeSpsOwnerHostRuntime({
  sourceRuntimeRoot,
  targetRuntimeRoot,
  fsApi = fs,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!sourceRuntimeRoot || !targetRuntimeRoot) return null;
  const sourceManifest = path.join(sourceRuntimeRoot, "sps-owner-host-runtime.json");
  const sourceEntry = path.join(sourceRuntimeRoot, "dist", "index.js");
  const sourceBootstrap = path.join(sourceRuntimeRoot, "sps-owner-host-bootstrap.mjs");
  const sourceModules = path.join(sourceRuntimeRoot, "node_modules");
  const sourceVendor = path.join(sourceRuntimeRoot, "sps-vendor");
  const sourcePackage = path.join(sourceRuntimeRoot, "package.json");
  if (
    !(await fileExists(sourceManifest, fsApi))
    || !(await fileExists(sourceEntry, fsApi))
    || !(await fileExists(sourceBootstrap, fsApi))
    || !(await fileExists(sourcePackage, fsApi))
  ) {
    return null;
  }

  // The packaged runtime is read-only and all mutable state lives in the
  // Owner Vault. Running it in place avoids copying a full dependency tree.
  if (await fileExists(path.join(sourceModules, "tsx", "dist", "loader.mjs"), fsApi)) {
    return sourceRuntimeRoot;
  }
  if (!(await fileExists(sourceVendor, fsApi))) return null;

  const targetEntry = path.join(targetRuntimeRoot, "dist", "index.js");
  const targetBootstrap = path.join(targetRuntimeRoot, "sps-owner-host-bootstrap.mjs");
  const targetTsx = path.join(targetRuntimeRoot, "node_modules", "tsx", "dist", "loader.mjs");
  const runtimeSupport = [
    { source: path.join(sourceRuntimeRoot, "sps-default-memory", "package.json"), target: path.join(targetRuntimeRoot, "sps-default-memory", "package.json") },
    { source: path.join(sourceRuntimeRoot, "sps-room-chat", "package.json"), target: path.join(targetRuntimeRoot, "sps-room-chat", "package.json") },
    { source: path.join(sourceRuntimeRoot, "memory-sidecar", "memory-sidecar.mjs"), target: path.join(targetRuntimeRoot, "memory-sidecar", "memory-sidecar.mjs") },
  ];
  const sourceSupport = [];
  for (const entry of runtimeSupport) {
    if (await fileExists(entry.source, fsApi)) sourceSupport.push(entry);
  }
  const targetHasSupport = await Promise.all(sourceSupport.map((entry) => fileExists(entry.target, fsApi)));
  if (
    (await fileExists(targetEntry, fsApi))
    && (await fileExists(targetBootstrap, fsApi))
    && (await fileExists(targetTsx, fsApi))
    && targetHasSupport.every(Boolean)
  ) return targetRuntimeRoot;

  const staleStagingRoot = `${targetRuntimeRoot}.staging`;
  const stagingRoot = `${targetRuntimeRoot}.staging-${process.pid}-${Date.now()}`;
  // A previous Desktop can leave a large partial runtime behind. It must not
  // delay the next launch, so clean it up independently while using a fresh stage.
  removeDirectoryInBackground(staleStagingRoot, { fsApi, delay });
  await removeDirectoryWithRetry(stagingRoot, { fsApi, delay });
  await fsApi.mkdir(stagingRoot, { recursive: true });
  await fsApi.cp(path.join(sourceRuntimeRoot, "dist"), path.join(stagingRoot, "dist"), { recursive: true, dereference: false });
  await fsApi.cp(sourceVendor, path.join(stagingRoot, "node_modules"), { recursive: true, dereference: false });
  await fsApi.copyFile(sourceManifest, path.join(stagingRoot, "sps-owner-host-runtime.json"));
  await fsApi.copyFile(sourceBootstrap, path.join(stagingRoot, "sps-owner-host-bootstrap.mjs"));
  await fsApi.copyFile(sourcePackage, path.join(stagingRoot, "package.json"));
  for (const entry of sourceSupport) {
    const relative = path.relative(sourceRuntimeRoot, entry.source);
    const sourceDirectory = path.dirname(entry.source);
    const targetDirectory = path.join(stagingRoot, path.dirname(relative));
    await fsApi.cp(sourceDirectory, targetDirectory, { recursive: true, dereference: false });
  }
  const staleTargetRoot = await moveDirectoryAside(targetRuntimeRoot, { fsApi, delay });
  await fsApi.rename(stagingRoot, targetRuntimeRoot);
  if (staleTargetRoot) removeDirectoryInBackground(staleTargetRoot, { fsApi, delay });
  return targetRuntimeRoot;
}

export async function resolveSpsOwnerHostRuntime({
  packagedRuntimeRoots,
  coreRoots,
  nodeCommand = "node",
  packagedNodeCommand = process.execPath,
  configPath = null,
  environment = {},
  fsApi = fs,
} = {}) {
  const packagedRoots = Array.isArray(packagedRuntimeRoots) ? packagedRuntimeRoots.filter(Boolean) : [];
  for (const runtimeRoot of packagedRoots) {
    const entry = path.join(runtimeRoot, "dist", "index.js");
    const bootstrap = path.join(runtimeRoot, "sps-owner-host-bootstrap.mjs");
    if (!(await fileExists(entry, fsApi)) || !(await fileExists(bootstrap, fsApi))) continue;
    return {
      command: packagedNodeCommand,
      args: [
        "sps-owner-host-bootstrap.mjs",
      ],
      cwd: runtimeRoot,
      environment: {
        ELECTRON_RUN_AS_NODE: "1",
        ...(configPath ? { PAPERCLIP_CONFIG: configPath } : {}),
        ...environment,
      },
      kind: "packaged-owner-runtime",
    };
  }

  const roots = Array.isArray(coreRoots) ? coreRoots.filter(Boolean) : [];
  for (const coreRoot of roots) {
    const entry = path.join(coreRoot, "cli", "src", "index.ts");
    if (!(await fileExists(entry, fsApi))) continue;
    const tsx = await findTsxLoader(coreRoot, fsApi);
    if (!tsx) continue;
    return {
      command: nodeCommand,
      args: [
        "--require", tsx.preflight,
        "--import", pathToFileURL(tsx.loader).href,
        entry,
        "run",
        "--instance", "sps-desktop-owner",
        ...(configPath ? ["--config", configPath] : []),
      ],
      cwd: coreRoot,
      environment: { ...environment },
      kind: "development-core",
    };
  }
  return null;
}

export function createSpsOwnerHostManager({
  url,
  resolveRuntime = async () => null,
  spawn = spawnChildProcess,
  fetchImpl = fetch,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  startupAttempts = 240,
  terminateTree = terminateWindowsProcessTree,
} = {}) {
  if (!url) throw new Error("SPS Owner Host URL is required.");
  let ownedChild = null;
  let lastError = null;
  let startedAt = null;
  let childOutput = "";

  async function inspect() {
    const health = await healthAt(url, fetchImpl);
    if (health) {
      // A slow first boot can outlive the bounded start loop. Once the Host
      // answers again, make the manager recover instead of preserving a stale
      // timeout that blocks Owner actions such as member invitations.
      lastError = null;
      return {
        state: ownedChild ? "running" : "running-existing",
        url,
        health,
        startedAt,
        lastError,
      };
    }
    if (ownedChild && ownedChild.exitCode == null) {
      return { state: "starting", url, health: null, startedAt, lastError };
    }
    return { state: "stopped", url, health: null, startedAt: null, lastError };
  }

  async function start() {
    const current = await inspect();
    if (current.state !== "stopped") return current;
    const runtime = await resolveRuntime();
    if (!runtime) {
      lastError = "SPS Owner Host runtime is not installed on this computer.";
      return inspect();
    }

    try {
      const child = spawn(runtime.command, runtime.args, {
        cwd: runtime.cwd,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        env: {
          ...process.env,
          ...runtime.environment,
          PAPERCLIP_TELEMETRY_DISABLED: "1",
        },
      });
      ownedChild = child;
      startedAt = new Date().toISOString();
      lastError = null;
      childOutput = "";
      const captureOutput = (chunk) => {
        childOutput = `${childOutput}${String(chunk)}`.slice(-8_000);
      };
      child.stdout?.on("data", captureOutput);
      child.stderr?.on("data", captureOutput);
      child.once("error", (error) => { lastError = asMessage(error); });
      child.once("exit", (code) => {
        if (code && code !== 0) {
          const details = hostDiagnostics(childOutput);
          lastError = `SPS Owner Host exited with code ${code}.${details ? ` ${details}` : ""}`;
        }
        ownedChild = null;
        startedAt = null;
      });
    } catch (error) {
      lastError = asMessage(error);
      return inspect();
    }

    for (let attempt = 0; attempt < startupAttempts; attempt += 1) {
      await delay(500);
      const state = await inspect();
      if (state.state === "running") return state;
      if (state.state === "stopped") return state;
    }
    lastError = "SPS Owner Host did not become ready in time.";
    return inspect();
  }

  async function stop({ force = false } = {}) {
    const child = ownedChild;
    if (child && child.exitCode == null) {
      if (force) {
        await terminateTree(child.pid);
      } else {
        child.kill("SIGINT");
        await waitForChildExit(child, 12_000);
        if (child.exitCode == null) await terminateTree(child.pid);
      }
    }
    ownedChild = null;
    startedAt = null;
    return inspect();
  }

  return { inspect, start, stop };
}

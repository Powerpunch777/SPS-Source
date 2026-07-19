import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawn as spawnChildProcess } from "node:child_process";

export const SPS_LOCAL_HOST_URL = "http://127.0.0.1:3100";

function asMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
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
  try {
    await fsApi.access(loader);
    await fsApi.access(preflight);
    return { loader, preflight };
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

export async function materializeSpsHostRuntime({ sourceRuntimeRoot, targetRuntimeRoot, fsApi = fs } = {}) {
  if (!sourceRuntimeRoot || !targetRuntimeRoot) return null;
  const sourceManifest = path.join(sourceRuntimeRoot, "sps-host-runtime.json");
  const sourceEntry = path.join(sourceRuntimeRoot, "dist", "index.js");
  const sourceVendor = path.join(sourceRuntimeRoot, "sps-vendor");
  const sourcePackage = path.join(sourceRuntimeRoot, "package.json");
  if (
    !(await fileExists(sourceManifest, fsApi))
    || !(await fileExists(sourceEntry, fsApi))
    || !(await fileExists(sourceVendor, fsApi))
    || !(await fileExists(sourcePackage, fsApi))
  ) {
    return null;
  }

  const targetEntry = path.join(targetRuntimeRoot, "dist", "index.js");
  const targetTsx = path.join(targetRuntimeRoot, "node_modules", "tsx", "dist", "loader.mjs");
  if ((await fileExists(targetEntry, fsApi)) && (await fileExists(targetTsx, fsApi))) return targetRuntimeRoot;

  const stagingRoot = `${targetRuntimeRoot}.staging`;
  await fsApi.rm(stagingRoot, { recursive: true, force: true });
  await fsApi.mkdir(stagingRoot, { recursive: true });
  await fsApi.cp(path.join(sourceRuntimeRoot, "dist"), path.join(stagingRoot, "dist"), { recursive: true, dereference: false });
  await fsApi.cp(sourceVendor, path.join(stagingRoot, "node_modules"), { recursive: true, dereference: false });
  await fsApi.copyFile(sourceManifest, path.join(stagingRoot, "sps-host-runtime.json"));
  await fsApi.copyFile(sourcePackage, path.join(stagingRoot, "package.json"));
  await fsApi.rm(targetRuntimeRoot, { recursive: true, force: true });
  await fsApi.rename(stagingRoot, targetRuntimeRoot);
  return targetRuntimeRoot;
}

export async function resolveSpsHostRuntime({
  packagedRuntimeRoots,
  coreRoots,
  nodeCommand = "node",
  packagedNodeCommand = process.execPath,
  configPath = null,
  fsApi = fs,
} = {}) {
  const packagedRoots = Array.isArray(packagedRuntimeRoots) ? packagedRuntimeRoots.filter(Boolean) : [];
  for (const runtimeRoot of packagedRoots) {
    const entry = path.join(runtimeRoot, "dist", "index.js");
    const tsxLoader = path.join(runtimeRoot, "node_modules", "tsx", "dist", "loader.mjs");
    try {
      await fsApi.access(entry);
      await fsApi.access(tsxLoader);
    } catch {
      continue;
    }
    return {
      command: packagedNodeCommand,
      args: [
        "--import", "tsx",
        "-e", "await import('./dist/index.js')",
        "run",
        "--instance", "default",
        ...(configPath ? ["--config", configPath] : []),
      ],
      cwd: runtimeRoot,
      environment: { ELECTRON_RUN_AS_NODE: "1" },
      kind: "packaged-runtime",
    };
  }

  const roots = Array.isArray(coreRoots) ? coreRoots.filter(Boolean) : [];
  for (const coreRoot of roots) {
    const entry = path.join(coreRoot, "cli", "src", "index.ts");
    try {
      await fsApi.access(entry);
    } catch {
      continue;
    }
    const tsx = await findTsxLoader(coreRoot, fsApi);
    if (!tsx) continue;
    return {
      command: nodeCommand,
      args: [
        "--require", tsx.preflight,
        "--import", pathToFileURL(tsx.loader).href,
        entry,
        "run",
        "--instance", "default",
        ...(configPath ? ["--config", configPath] : []),
      ],
      cwd: coreRoot,
      kind: "development-core",
    };
  }
  return null;
}

export function createSpsLocalHostManager({
  url = SPS_LOCAL_HOST_URL,
  resolveRuntime = async () => null,
  spawn = spawnChildProcess,
  fetchImpl = fetch,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  let ownedChild = null;
  let lastError = null;
  let startedAt = null;

  async function inspect() {
    const health = await healthAt(url, fetchImpl);
    if (health) {
      return {
        state: ownedChild ? "running" : "adopted-external",
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
      lastError = "SPS Host runtime is not installed on this computer.";
      return await inspect();
    }

    try {
      const child = spawn(runtime.command, runtime.args, {
        cwd: runtime.cwd,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, ...runtime.environment, PAPERCLIP_TELEMETRY_DISABLED: "1" },
      });
      ownedChild = child;
      startedAt = new Date().toISOString();
      lastError = null;
      child.once("error", (error) => { lastError = asMessage(error); });
      child.once("exit", (code) => {
        if (code && code !== 0) lastError = `SPS Host exited with code ${code}.`;
        ownedChild = null;
        startedAt = null;
      });
    } catch (error) {
      lastError = asMessage(error);
      return await inspect();
    }

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await delay(500);
      const state = await inspect();
      if (state.state === "running") return state;
      if (state.state === "stopped" && lastError) return state;
    }
    // A brand-new embedded PostgreSQL cluster may still be applying migrations.
    // Keep the owned process in its honest starting state instead of reporting a false failure.
    return await inspect();
  }

  async function stop() {
    if (!ownedChild || ownedChild.exitCode != null) return await inspect();
    ownedChild.kill();
    return await inspect();
  }

  return { inspect, start, stop };
}

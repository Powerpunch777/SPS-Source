import fs from "node:fs/promises";
import path from "node:path";
import { spawn as spawnChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { attachSpsNativeMemberSignerChannel } from "./native-member-signer-channel.mjs";
import { createSpsNativeParentIngressClient } from "./native-parent-ingress-client.mjs";

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

function resolveOwnerHostInstanceId(value) {
  const instanceId = value ?? "sps-desktop-owner";
  if (typeof instanceId !== "string" || !/^[A-Za-z0-9._-]{1,64}$/.test(instanceId)) {
    throw new Error("SPS Owner Host instanceId must be 1-64 ASCII letters, digits, dots, underscores, or hyphens.");
  }
  return instanceId;
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

export function spsOwnerHostBundledNodePath(runtimeRoot, platform = process.platform) {
  return path.join(runtimeRoot, "bin", platform === "win32" ? "node.exe" : "node");
}

async function fileSha256(filePath, fsApi) {
  const contents = await fsApi.readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

export async function materializeStableSpsOwnerHostNode({
  runtimeRoot,
  stableRoot,
  platform = process.platform,
  fsApi = fs,
} = {}) {
  if (!runtimeRoot || !stableRoot) return null;
  const source = spsOwnerHostBundledNodePath(runtimeRoot, platform);
  if (!(await fileExists(source, fsApi))) return null;

  const executableName = platform === "win32" ? "node.exe" : "node";
  const target = path.join(stableRoot, executableName);
  const metadataPath = path.join(stableRoot, "node-source.json");
  const sourceSha256 = await fileSha256(source, fsApi);
  try {
    const metadata = JSON.parse(await fsApi.readFile(metadataPath, "utf8"));
    if (
      metadata?.sha256 === sourceSha256
      && await fileExists(target, fsApi)
      && await fileSha256(target, fsApi) === sourceSha256
    ) return target;
  } catch {
    // Missing or stale metadata is repaired from the verified packaged runtime.
  }

  await fsApi.mkdir(stableRoot, { recursive: true });
  const temporaryTarget = path.join(stableRoot, `${executableName}.tmp-${process.pid}-${Date.now()}`);
  const temporaryMetadata = `${metadataPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fsApi.copyFile(source, temporaryTarget);
    await fsApi.rm(target, { force: true });
    await fsApi.rename(temporaryTarget, target);
    await fsApi.writeFile(temporaryMetadata, `${JSON.stringify({ format: 1, sha256: sourceSha256 })}\n`, "utf8");
    await fsApi.rm(metadataPath, { force: true });
    await fsApi.rename(temporaryMetadata, metadataPath);
    return target;
  } finally {
    await fsApi.rm(temporaryTarget, { force: true }).catch(() => undefined);
    await fsApi.rm(temporaryMetadata, { force: true }).catch(() => undefined);
  }
}

export async function materializeSpsOwnerHostRuntime({
  sourceRuntimeRoot,
  targetRuntimeRoot,
  runInPlace = true,
  fsApi = fs,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  if (!sourceRuntimeRoot || !targetRuntimeRoot) return null;
  const sourceManifest = path.join(sourceRuntimeRoot, "sps-owner-host-runtime.json");
  const sourceEntry = path.join(sourceRuntimeRoot, "dist", "index.js");
  const sourceBootstrap = path.join(sourceRuntimeRoot, "sps-owner-host-bootstrap.mjs");
  const sourceModules = path.join(sourceRuntimeRoot, "node_modules");
  const sourceVendor = path.join(sourceRuntimeRoot, "sps-vendor");
  const sourceBin = path.join(sourceRuntimeRoot, "bin");
  const sourcePackage = path.join(sourceRuntimeRoot, "package.json");
  if (
    !(await fileExists(sourceManifest, fsApi))
    || !(await fileExists(sourceEntry, fsApi))
    || !(await fileExists(sourceBootstrap, fsApi))
    || !(await fileExists(sourcePackage, fsApi))
  ) {
    return null;
  }

  const sourceModulesReady = await fileExists(path.join(sourceModules, "tsx", "dist", "loader.mjs"), fsApi);
  const sourceHasBundledNode = await fileExists(spsOwnerHostBundledNodePath(sourceRuntimeRoot), fsApi);
  // A packaged runtime is read-only and all mutable state lives in the Owner
  // Vault. Development uses a private materialized copy so a live sidecar
  // cannot lock the source tree while a new Desktop build is prepared.
  if (runInPlace && sourceModulesReady) {
    return sourceRuntimeRoot;
  }
  const sourceDependencyRoot = sourceModulesReady
    ? sourceModules
    : await fileExists(sourceVendor, fsApi)
      ? sourceVendor
      : null;
  if (!sourceDependencyRoot) return null;

  const targetEntry = path.join(targetRuntimeRoot, "dist", "index.js");
  const targetBootstrap = path.join(targetRuntimeRoot, "sps-owner-host-bootstrap.mjs");
  const targetTsx = path.join(targetRuntimeRoot, "node_modules", "tsx", "dist", "loader.mjs");
  const targetBundledNode = spsOwnerHostBundledNodePath(targetRuntimeRoot);
  const sourceManifestText = await fsApi.readFile(sourceManifest, "utf8");
  const targetManifestText = await fsApi.readFile(path.join(targetRuntimeRoot, "sps-owner-host-runtime.json"), "utf8")
    .catch(() => null);
  const runtimeSupport = [
    { source: path.join(sourceRuntimeRoot, "sps-default-memory", "package.json"), target: path.join(targetRuntimeRoot, "sps-default-memory", "package.json") },
    { source: path.join(sourceRuntimeRoot, "sps-plugin-discovery", "package.json"), target: path.join(targetRuntimeRoot, "sps-plugin-discovery", "package.json") },
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
    && (!sourceHasBundledNode || await fileExists(targetBundledNode, fsApi))
    && targetManifestText === sourceManifestText
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
  await fsApi.cp(sourceDependencyRoot, path.join(stagingRoot, "node_modules"), { recursive: true, dereference: false });
  if (sourceHasBundledNode) {
    await fsApi.cp(sourceBin, path.join(stagingRoot, "bin"), { recursive: true, dereference: false });
  }
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
  stableNodeCommand = null,
  configPath = null,
  instanceId,
  environment = {},
  fsApi = fs,
} = {}) {
  const resolvedInstanceId = resolveOwnerHostInstanceId(instanceId);
  const packagedRoots = Array.isArray(packagedRuntimeRoots) ? packagedRuntimeRoots.filter(Boolean) : [];
  for (const runtimeRoot of packagedRoots) {
    const entry = path.join(runtimeRoot, "dist", "index.js");
    const bootstrap = path.join(runtimeRoot, "sps-owner-host-bootstrap.mjs");
    if (!(await fileExists(entry, fsApi)) || !(await fileExists(bootstrap, fsApi))) continue;
    const bundledNodeCommand = spsOwnerHostBundledNodePath(runtimeRoot);
    const hasBundledNode = await fileExists(bundledNodeCommand, fsApi);
    const hasStableNode = stableNodeCommand ? await fileExists(stableNodeCommand, fsApi) : false;
    return {
      command: hasStableNode ? stableNodeCommand : hasBundledNode ? bundledNodeCommand : packagedNodeCommand,
      args: [
        "sps-owner-host-bootstrap.mjs",
      ],
      cwd: runtimeRoot,
      environment: {
        // Older Desktop packages used Electron as Node. Keep that fallback so
        // an existing runtime can still be opened during an in-place update.
        ...(hasStableNode || hasBundledNode ? {} : { ELECTRON_RUN_AS_NODE: "1" }),
        ...(configPath ? { PAPERCLIP_CONFIG: configPath } : {}),
        ...environment,
        PAPERCLIP_INSTANCE_ID: resolvedInstanceId,
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
        "--instance", resolvedInstanceId,
        ...(configPath ? ["--config", configPath] : []),
      ],
      cwd: coreRoot,
      environment: {
        ...environment,
        ...(configPath ? { PAPERCLIP_CONFIG: configPath } : {}),
        PAPERCLIP_INSTANCE_ID: resolvedInstanceId,
      },
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
  baseEnvironment = process.env,
  delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  // First launch has to initialize Embedded PostgreSQL and can take several
  // minutes while Windows inspects its native runtime files.
  startupAttempts = 720,
  terminateTree = terminateWindowsProcessTree,
  createNativeSigner = null,
  onNativeInvalidation = () => {},
} = {}) {
  if (!url) throw new Error("SPS Owner Host URL is required.");
  let ownedChild = null;
  let lastError = null;
  let startedAt = null;
  let nativeChannel = null;
  let nativeIngress = null;
  let lifecycleGeneration = 0;
  let startPromise = null;
  let startPromiseGeneration = null;
  const stopsInFlight = new Set();

  async function inspect() {
    const health = await healthAt(url, fetchImpl);
    if (health) {
      // A slow first boot can outlive the bounded start loop. Once the Host
      // answers again, make the manager recover instead of preserving a stale
      // timeout that blocks Owner actions such as member invitations.
      lastError = null;
      return {
        state: ownedChild ? "running" : "running-existing",
        owned: Boolean(ownedChild),
        url,
        health,
        startedAt,
        lastError,
      };
    }
    if (ownedChild && ownedChild.exitCode == null) {
      return { state: "starting", owned: true, url, health: null, startedAt, lastError };
    }
    return { state: "stopped", owned: false, url, health: null, startedAt: null, lastError };
  }

  async function startOwned(generation) {
    const current = await inspect();
    if (generation !== lifecycleGeneration) return inspect();
    if (current.state !== "stopped") return current;
    const runtime = await resolveRuntime();
    if (generation !== lifecycleGeneration) return inspect();
    if (!runtime) {
      lastError = "SPS Owner Host runtime is not installed on this computer.";
      return inspect();
    }

    try {
      if (generation !== lifecycleGeneration) return inspect();
      const child = spawn(runtime.command, runtime.args, {
        cwd: runtime.cwd,
        // The stop-only pipe survives Native signer IPC revocation. Neither
        // descriptor grants Native signing unless its own channel is attached.
        stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
        windowsHide: true,
        env: {
          ...baseEnvironment,
          ...runtime.environment,
          PAPERCLIP_TELEMETRY_DISABLED: "1",
          SPS_DESKTOP_OWNED_SHUTDOWN_PIPE: "1",
        },
      });
      child.stdio?.[4]?.on?.("error", () => {});
      ownedChild = child;
      let childChannel = null;
      if (createNativeSigner) {
        let signer;
        try {
          signer = createNativeSigner();
          childChannel = attachSpsNativeMemberSignerChannel(child, signer, { isCurrent: () => ownedChild === child });
          nativeChannel = childChannel;
          nativeIngress = createSpsNativeParentIngressClient(child, { isCurrent: () => ownedChild === child });
        } catch {
          // Native signing is unavailable, not an alternative route to Owner
          // authority. Preserve the ordinary Host when no channel can attach.
          childChannel?.dispose();
          try { signer?.dispose(); } catch { /* Native remains unavailable. */ }
          if (nativeChannel === childChannel) nativeChannel = null;
          nativeIngress?.dispose();
          nativeIngress = null;
        }
      }
      startedAt = new Date().toISOString();
      lastError = null;
      let childOutput = "";
      const captureOutput = (chunk) => {
        if (ownedChild !== child) return;
        childOutput = `${childOutput}${String(chunk)}`.slice(-8_000);
      };
      child.stdout?.on("data", captureOutput);
      child.stderr?.on("data", captureOutput);
      child.once("error", (error) => {
        if (ownedChild !== child) return;
        lastError = asMessage(error);
      });
      child.once("exit", (code) => {
        if (ownedChild !== child) return;
        childChannel?.dispose();
        nativeIngress?.dispose();
        nativeIngress = null;
        try { onNativeInvalidation(); } catch { /* Authority remains revoked. */ }
        if (nativeChannel === childChannel) nativeChannel = null;
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
      if (generation !== lifecycleGeneration) return inspect();
      const state = await inspect();
      if (generation !== lifecycleGeneration) return inspect();
      if (state.state === "running") return state;
      if (state.state === "stopped") return state;
    }
    if (generation !== lifecycleGeneration) return inspect();
    lastError = "SPS Owner Host did not become ready in time.";
    return inspect();
  }

  function start() {
    if (stopsInFlight.size) {
      return Promise.all([...stopsInFlight]).then(() => start());
    }
    if (startPromise && startPromiseGeneration === lifecycleGeneration) return startPromise;
    const generation = lifecycleGeneration;
    const operation = startOwned(generation);
    startPromise = operation;
    startPromiseGeneration = generation;
    const clearStart = () => {
      if (startPromise !== operation) return;
      startPromise = null;
      startPromiseGeneration = null;
    };
    void operation.then(clearStart, clearStart);
    return operation;
  }

  function invalidateNativeSigner() {
    try { onNativeInvalidation(); } catch { /* Authority remains revoked. */ }
    nativeIngress?.dispose();
    nativeIngress = null;
    const channel = nativeChannel;
    nativeChannel = null;
    channel?.dispose();
  }

  async function stopOwned({ force = false } = {}) {
    invalidateNativeSigner();
    const child = ownedChild;
    if (child && child.exitCode == null) {
      if (force) {
        await terminateTree(child.pid);
      } else {
        const shutdownPipe = child.stdio?.[4];
        if (process.platform === "win32" && shutdownPipe && !shutdownPipe.destroyed && !shutdownPipe.writableEnded) {
          try { shutdownPipe.end("sps.owner-host.shutdown/v1\n"); } catch {}
        } else if (process.platform === "win32" && child.connected === true && typeof child.send === "function") {
          try { child.send({ v: 1, kind: "sps.owner-host.shutdown" }, () => {}); } catch {}
        } else child.kill("SIGINT");
        await waitForChildExit(child, 12_000);
        if (child.exitCode == null) await terminateTree(child.pid);
      }
    }
    ownedChild = null;
    startedAt = null;
    return inspect();
  }

  function stop(options) {
    if (!options?.force && stopsInFlight.size) {
      return Promise.all([...stopsInFlight]).then(() => inspect());
    }
    lifecycleGeneration += 1;
    const operation = stopOwned(options);
    stopsInFlight.add(operation);
    const clearStop = () => stopsInFlight.delete(operation);
    void operation.then(clearStop, clearStop);
    return operation;
  }

  function dispatchNativeIngress(operation, request, options) {
    if (!ownedChild || ownedChild.exitCode != null || !nativeIngress) {
      return Promise.reject(Object.assign(new Error("The owned Native Host channel is unavailable."), { code: "native_ingress_unavailable" }));
    }
    return nativeIngress.dispatch(operation, request, options);
  }
  return { inspect, start, stop, invalidateNativeSigner, dispatchNativeIngress };
}

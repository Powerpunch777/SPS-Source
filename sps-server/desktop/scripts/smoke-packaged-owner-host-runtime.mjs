import { copyFile, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const runtimeRoot = path.resolve(process.env.SPS_OWNER_HOST_RUNTIME_ROOT || "");
const electronBinary = path.resolve(process.env.SPS_OWNER_HOST_ELECTRON_BINARY || "");

if (!runtimeRoot || runtimeRoot === path.resolve(".")) {
  throw new Error("Set SPS_OWNER_HOST_RUNTIME_ROOT to the packaged SPS Owner Host runtime.");
}
if (!electronBinary || electronBinary === path.resolve(".")) {
  throw new Error("Set SPS_OWNER_HOST_ELECTRON_BINARY to the SPS Desktop executable.");
}

const temporaryRoot = path.join(os.tmpdir(), `sps-owner-host-smoke-${process.pid}-${Date.now()}`);
const executionRuntimeRoot = path.join(temporaryRoot, "runtime");
const configPath = path.join(temporaryRoot, "config.json");
const memoryConfigPath = path.join(temporaryRoot, "memory", "config.json");
const port = 31_207;
const databasePort = 54_337;
const memoryPort = 31_208;
const memoryToken = "sps-owner-host-smoke-memory-token";
const config = {
  $meta: { version: 1, updatedAt: new Date().toISOString(), source: "onboard" },
  database: {
    mode: "embedded-postgres",
    embeddedPostgresDataDir: path.join(temporaryRoot, "db"),
    embeddedPostgresPort: databasePort,
  },
  logging: { mode: "file", logDir: path.join(temporaryRoot, "logs") },
  server: {
    deploymentMode: "local_trusted",
    exposure: "private",
    bind: "loopback",
    host: "127.0.0.1",
    port,
    allowedHostnames: [],
    serveUi: true,
  },
  auth: { baseUrlMode: "auto", disableSignUp: false },
  telemetry: { enabled: false },
  storage: { provider: "local_disk", localDisk: { baseDir: path.join(temporaryRoot, "storage") } },
  secrets: {
    provider: "local_encrypted",
    strictMode: false,
    localEncrypted: { keyFilePath: path.join(temporaryRoot, "secrets", "master.key") },
  },
};
const memoryConfig = {
  server: { host: "127.0.0.1", port: memoryPort },
  security: { allowedOrigins: [], token: memoryToken },
  dataDir: path.join(temporaryRoot, "memory", "data"),
  journalRoot: path.join(temporaryRoot, "memory", "journals"),
  journals: [],
};

async function waitForHealth() {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1_000) });
      const body = await response.json();
      if (response.ok && body?.status === "ok") return body;
    } catch {
      // Embedded PostgreSQL needs a short first-start window.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The packaged SPS Owner Host did not become healthy within 180 seconds.");
}

async function waitForMemoryHealth() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${memoryPort}/health`, {
        headers: { "x-sidecar-token": memoryToken },
        signal: AbortSignal.timeout(1_000),
      });
      const body = await response.json();
      if (response.ok && body?.ok === true) return body;
    } catch {
      // The sidecar starts before the Owner Host.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("The packaged SPS Default Memory sidecar did not become healthy within 20 seconds.");
}

async function assertDefaultMemoryPlugin() {
  const response = await fetch(`http://127.0.0.1:${port}/api/plugins`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Could not inspect bundled plugins (${response.status}).`);
  const plugins = await response.json();
  const memory = Array.isArray(plugins)
    ? plugins.find((plugin) => plugin?.manifestJson?.id === "sps.default-memory")
    : null;
  if (!memory || memory.status !== "ready") {
    throw new Error("SPS Default Memory was not installed and ready in the packaged Owner Host.");
  }
  return memory;
}

async function assertRoomsPlugin() {
  const response = await fetch(`http://127.0.0.1:${port}/api/plugins`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Could not inspect bundled plugins (${response.status}).`);
  const plugins = await response.json();
  const rooms = Array.isArray(plugins)
    ? plugins.find((plugin) => plugin?.manifestJson?.id === "local.room-chat")
    : null;
  if (!rooms || rooms.status !== "ready") {
    throw new Error("SPS Rooms was not installed and ready in the packaged Owner Host.");
  }
  return rooms;
}

async function removeWithRetry(target, attempts = 30) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (error?.code !== "EBUSY" && error?.code !== "ENOTEMPTY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode != null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopChildTree(child) {
  if (child.exitCode != null) return;
  child.kill("SIGINT");
  await waitForChildExit(child, 12_000);
  if (child.exitCode != null || !child.pid) return;
  await new Promise((resolve) => {
    const taskkill = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
    taskkill.once("error", resolve);
    taskkill.once("exit", resolve);
  });
  await waitForChildExit(child, 5_000);
}

await mkdir(temporaryRoot, { recursive: true });
// Packaged resources keep dependencies in sps-vendor so an updater never edits
// a running Node module tree. This mirrors the Desktop Owner Host materializer.
await cp(path.join(runtimeRoot, "dist"), path.join(executionRuntimeRoot, "dist"), { recursive: true, dereference: false });
await cp(path.join(runtimeRoot, "sps-vendor"), path.join(executionRuntimeRoot, "node_modules"), { recursive: true, dereference: false });
await copyFile(path.join(runtimeRoot, "package.json"), path.join(executionRuntimeRoot, "package.json"));
await cp(path.join(runtimeRoot, "sps-default-memory"), path.join(executionRuntimeRoot, "sps-default-memory"), { recursive: true, dereference: false });
await cp(path.join(runtimeRoot, "sps-room-chat"), path.join(executionRuntimeRoot, "sps-room-chat"), { recursive: true, dereference: false });
await cp(path.join(runtimeRoot, "memory-sidecar"), path.join(executionRuntimeRoot, "memory-sidecar"), { recursive: true, dereference: false });
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
await mkdir(path.dirname(memoryConfigPath), { recursive: true });
await writeFile(memoryConfigPath, `${JSON.stringify(memoryConfig, null, 2)}\n`, "utf8");
const memoryChild = spawn(
  electronBinary,
  [path.join(executionRuntimeRoot, "memory-sidecar", "memory-sidecar.mjs"), "--config", memoryConfigPath],
  {
    cwd: executionRuntimeRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      MEMORY_SIDECAR_CONFIG: memoryConfigPath,
      MEMORY_SIDECAR_TOKEN: memoryToken,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let memoryOutput = "";
memoryChild.stdout.on("data", (chunk) => { memoryOutput += chunk.toString(); });
memoryChild.stderr.on("data", (chunk) => { memoryOutput += chunk.toString(); });
const child = spawn(
  electronBinary,
  ["--import", "tsx", "-e", "await import('./dist/index.js')", "run", "--instance", "sps-desktop-owner-smoke", "--config", configPath],
  {
    cwd: executionRuntimeRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PAPERCLIP_TELEMETRY_DISABLED: "1",
      PAPERCLIP_HOME: temporaryRoot,
      PAPERCLIP_DB_BACKUP_DIR: path.join(temporaryRoot, "backups"),
      PAPERCLIP_STORAGE_LOCAL_DIR: path.join(temporaryRoot, "storage"),
      PAPERCLIP_SECRETS_MASTER_KEY_FILE: path.join(temporaryRoot, "secrets", "master.key"),
      PAPERCLIP_PROJECTS_ROOT: path.join(temporaryRoot, "projects"),
      SPS_BUNDLED_PLUGIN_PATHS: [
        path.join(executionRuntimeRoot, "sps-default-memory"),
        path.join(executionRuntimeRoot, "sps-room-chat"),
      ].join(path.delimiter),
      SPS_ROOM_API_URL: `http://127.0.0.1:${port}`,
      SPS_MEMORY_SIDECAR_URL: `http://127.0.0.1:${memoryPort}`,
      SPS_MEMORY_SIDECAR_TOKEN: memoryToken,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let output = "";
child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });
const childExited = new Promise((resolve) => child.once("exit", resolve));
let passed = false;
try {
  await waitForMemoryHealth();
  const health = await waitForHealth();
  await assertDefaultMemoryPlugin();
  await assertRoomsPlugin();
  passed = true;
  console.log(`Packaged SPS Owner Host, SPS Default Memory, and SPS Rooms smoke test passed on http://127.0.0.1:${port} (${health.status}).`);
} finally {
  await stopChildTree(child);
  await stopChildTree(memoryChild);
  await Promise.race([childExited, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  if (child.exitCode && child.exitCode !== 0) {
    console.warn(`Packaged SPS Owner Host exited with ${child.exitCode}: ${output.slice(-2_000)}`);
  } else if (!passed) {
    console.warn(`Packaged SPS Owner Host did not become healthy: ${output.slice(-2_000)}`);
    console.warn(`SPS Default Memory output: ${memoryOutput.slice(-2_000)}`);
  }
  if (passed || process.env.SPS_OWNER_HOST_SMOKE_KEEP !== "1") {
    await removeWithRetry(temporaryRoot);
  } else {
    console.warn(`Preserved failed smoke data at ${temporaryRoot}`);
  }
}

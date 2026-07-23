import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
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
const executionRuntimeRoot = runtimeRoot;
const configPath = path.join(temporaryRoot, "config.json");
const memoryConfigPath = path.join(temporaryRoot, "memory", "config.json");
async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const selectedPort = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!selectedPort) reject(new Error("Could not reserve a local smoke-test port."));
        else resolve(selectedPort);
      });
    });
  });
}

const port = await findAvailablePort();
const databasePort = await findAvailablePort();
const memoryPort = await findAvailablePort();
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

async function waitForHealth(ownerHost) {
  for (let attempt = 0; attempt < 360; attempt += 1) {
    if (ownerHost.exitCode !== null) {
      throw new Error(`The packaged SPS Owner Host exited before health became ready (exit ${ownerHost.exitCode}).`);
    }
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

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function writeRegistrySmokePackage(version) {
  const packageRoot = path.join(temporaryRoot, "registry-staging", `registry-smoke-${version}`);
  const manifestSource = [
    "export default {",
    '  id: "sps.registry-smoke",',
    "  apiVersion: 1,",
    `  version: ${JSON.stringify(version)},`,
    '  displayName: "Registry Smoke",',
    '  description: "Packaged Registry lifecycle smoke plugin.",',
    '  author: "SPS",',
    '  categories: ["automation"],',
    '  capabilities: ["plugin.state.read"],',
    '  entrypoints: { worker: "./dist/worker.js" },',
    "};",
    "",
  ].join("\n");
  const workerSource = [
    'import { createInterface } from "node:readline";',
    'const input = createInterface({ input: process.stdin });',
    'function reply(id, result) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n"); }',
    'function reject(id, message) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message } }) + "\\n"); }',
    'input.on("line", (line) => {',
    "  let request;",
    "  try { request = JSON.parse(line); } catch { return; }",
    '  if (!request || request.jsonrpc !== "2.0" || request.id === undefined) return;',
    '  if (request.method === "initialize") reply(request.id, { ok: true, supportedMethods: ["health"] });',
    '  else if (request.method === "health") reply(request.id, { status: "ok" });',
    '  else if (request.method === "shutdown") { reply(request.id, null); input.close(); setImmediate(() => process.exit(0)); }',
    '  else reject(request.id, "Unknown method: " + request.method);',
    "});",
    "",
  ].join("\n");
  const capabilities = ["plugin.state.read"];
  const staticManifest = {
    schemaVersion: 1,
    plugin: { id: "sps.registry-smoke", version, apiVersion: "1" },
    runtime: { manifestEntry: "dist/manifest.js", manifestSha256: sha256(manifestSource) },
    capabilities,
    permissionsDigest: sha256(JSON.stringify(capabilities)),
  };
  await mkdir(path.join(packageRoot, "dist"), { recursive: true });
  await Promise.all([
    writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify({
      name: "sps-registry-smoke",
      version,
      private: true,
      type: "module",
      paperclipPlugin: { manifest: "./dist/manifest.js", worker: "./dist/worker.js" },
    }, null, 2)}\n`, "utf8"),
    writeFile(path.join(packageRoot, "dist", "manifest.js"), manifestSource, "utf8"),
    writeFile(path.join(packageRoot, "dist", "worker.js"), workerSource, "utf8"),
    writeFile(path.join(packageRoot, "sps-plugin.json"), `${JSON.stringify(staticManifest, null, 2)}\n`, "utf8"),
  ]);
  return { packageRoot, artifactSha256: sha256(`registry-smoke-${version}`) };
}

async function ownerHostJson(pathname, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Owner Host Registry request ${pathname} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function assertRegistryLifecycle() {
  const v1 = await writeRegistrySmokePackage("1.0.0");
  const v2 = await writeRegistrySmokePackage("1.0.1");
  const source = { registryId: "sps.runtime-smoke", kind: "local", releaseLocator: "runtime-smoke" };

  const stageV1 = await ownerHostJson("/api/plugins/registry/stages", { ...v1, source: { ...source, releaseLocator: "runtime-smoke/1.0.0" } });
  if (stageV1.status !== "staged") throw new Error("Registry smoke v1 was not kept in the disabled stage.");
  const installed = await ownerHostJson(`/api/plugins/registry/stages/${encodeURIComponent(stageV1.stageId)}/enable`, {});
  if (installed.plugin?.version !== "1.0.0" || installed.plugin?.status !== "ready") {
    throw new Error("Registry smoke v1 did not install and activate.");
  }

  const stageV2 = await ownerHostJson("/api/plugins/registry/stages", { ...v2, source: { ...source, releaseLocator: "runtime-smoke/1.0.1" } });
  const upgraded = await ownerHostJson(`/api/plugins/registry/stages/${encodeURIComponent(stageV2.stageId)}/enable`, {});
  if (upgraded.plugin?.version !== "1.0.1" || upgraded.plugin?.status !== "ready") {
    throw new Error("Registry smoke v2 did not replace the active plugin.");
  }

  const rolledBack = await ownerHostJson(`/api/plugins/registry/stages/${encodeURIComponent(stageV1.stageId)}/enable`, {});
  if (rolledBack.plugin?.version !== "1.0.0" || rolledBack.plugin?.status !== "ready") {
    throw new Error("Registry smoke did not restore the earlier reviewed version.");
  }
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
  [path.join(executionRuntimeRoot, "sps-owner-host-bootstrap.mjs")],
  {
    cwd: executionRuntimeRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PAPERCLIP_TELEMETRY_DISABLED: "1",
      PAPERCLIP_CONFIG: configPath,
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
  const health = await waitForHealth(child);
  await assertDefaultMemoryPlugin();
  await assertRoomsPlugin();
  await assertRegistryLifecycle();
  passed = true;
  console.log(`Packaged SPS Owner Host, bundled SPS plugins, and Registry install/update/rollback smoke test passed on http://127.0.0.1:${port} (${health.status}).`);
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

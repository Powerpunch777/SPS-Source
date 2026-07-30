import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPluginTemplate,
  generatePluginSigningKeyPair,
  publishPluginToLocalRegistry,
} from "@sonparkserver/plugin-sdk/authoring/plugin-package-v1.mjs";
import {
  acquireRegistryRelease,
  inspectRegistrySource,
} from "../src/registry-source-catalog.mjs";
import { stageSpsPluginArchive } from "../src/registry-staging.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const runtimeRoot = path.resolve(process.env.SPS_OWNER_HOST_RUNTIME_ROOT || path.join(desktopRoot, ".owner-host-runtime"));
const [runtimeManifest, releaseBaseline] = await Promise.all([
  readFile(path.join(runtimeRoot, "sps-owner-host-runtime.json"), "utf8").then(JSON.parse),
  readFile(path.join(runtimeRoot, "sps-release-baseline.json"), "utf8").then(JSON.parse),
]);
if (
  runtimeManifest.format < 8
  || runtimeManifest.releaseBaseline?.desktopVersion !== releaseBaseline.desktopVersion
  || runtimeManifest.releaseBaseline?.core?.revision !== releaseBaseline.core?.revision
) {
  throw new Error("The packaged SPS Owner Host runtime is missing its matching release baseline.");
}

const temporaryRoot = path.join(os.tmpdir(), `sps-owner-host-smoke-${process.pid}-${Date.now()}`);
// PostgreSQL on Windows cannot initialise a UTF-8 cluster when its executable
// path includes non-ASCII characters. Run the bundle via an ASCII temp junction
// so the smoke test matches the installed app's path under LocalAppData.
const executionRuntimeRoot = process.platform === "win32"
  ? path.join(os.tmpdir(), `sps-owner-host-runtime-${process.pid}-${Date.now()}`)
  : runtimeRoot;
if (executionRuntimeRoot !== runtimeRoot) {
  await symlink(runtimeRoot, executionRuntimeRoot, "junction");
}
const nodeBinary = path.resolve(process.env.SPS_OWNER_HOST_NODE_BINARY || path.join(executionRuntimeRoot, "bin", process.platform === "win32" ? "node.exe" : "node"));

try {
  await access(nodeBinary);
} catch {
  throw new Error("Set SPS_OWNER_HOST_NODE_BINARY to the Node executable bundled with the SPS Owner Host runtime.");
}
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
const desktopAccessToken = "sps-owner-host-smoke-desktop-access-token";
const ownerHostOrigin = `http://127.0.0.1:${port}`;
const desktopAccessHeaders = { "x-sps-desktop-access": desktopAccessToken };
const config = {
  $meta: { version: 1, updatedAt: new Date().toISOString(), source: "onboard" },
  database: {
    mode: "embedded-postgres",
    embeddedPostgresDataDir: path.join(temporaryRoot, "db"),
    embeddedPostgresPort: databasePort,
  },
  logging: { mode: "file", logDir: path.join(temporaryRoot, "logs") },
  server: {
    // This harness verifies the packaged Core's legacy plugin-registry
    // compatibility surface without requiring a real SPS Identity account.
    // SPS Desktop never writes this mode for a user's Owner Host; production
    // Host Vaults are always created and migrated as authenticated.
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
  for (let attempt = 0; attempt < 720; attempt += 1) {
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
  throw new Error("The packaged SPS Owner Host did not become healthy within 360 seconds.");
}

function ownerHostRequest(pathname, options = {}) {
  return fetch(`${ownerHostOrigin}${pathname}`, {
    ...options,
    headers: {
      ...desktopAccessHeaders,
      ...(options.headers ?? {}),
    },
  });
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

async function assertStaticWorkspaceUi() {
  const response = await ownerHostRequest("/", { signal: AbortSignal.timeout(5_000) });
  const body = await response.text();
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !body.includes("<title>SPS</title>")) {
    throw new Error("The packaged SPS Owner Host did not serve its branded static Workspace UI.");
  }
}

async function assertDesktopOnlyBoundary() {
  const browserUi = await fetch(`${ownerHostOrigin}/`, { signal: AbortSignal.timeout(5_000) });
  if (browserUi.status !== 403) {
    throw new Error("The packaged SPS Owner Host served its Workspace to a direct loopback browser request.");
  }

  const browserApi = await fetch(`${ownerHostOrigin}/api/plugins`, { signal: AbortSignal.timeout(5_000) });
  const browserPayload = await browserApi.json().catch(() => null);
  if (browserApi.status !== 403 || browserPayload?.code !== "desktop_access_required") {
    throw new Error("The packaged SPS Owner Host did not reject a direct loopback API request.");
  }
}

async function assertBaselineTeamAccessUi() {
  const assetsDirectory = path.join(executionRuntimeRoot, "ui-dist", "assets");
  const assetNames = await readdir(assetsDirectory);
  const scripts = await Promise.all(
    assetNames
      .filter((name) => name.endsWith(".js"))
      .map((name) => readFile(path.join(assetsDirectory, name), "utf8")),
  );

  if (!scripts.some((script) => script.includes("Team access"))) {
    throw new Error("The packaged SPS Owner Host is missing the baseline Team access Workspace route.");
  }
}

async function assertDefaultMemoryPlugin() {
  const response = await ownerHostRequest("/api/plugins", { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Could not inspect bundled plugins (${response.status}).`);
  const plugins = await response.json();
  const memory = Array.isArray(plugins)
    ? plugins.find((plugin) => plugin?.manifestJson?.id === "sps.default-memory")
    : null;
  if (!memory || memory.status !== "ready") {
    throw new Error("SPS Default Memory was not installed and ready in the packaged Owner Host.");
  }
  if (memory.manifestJson?.companyActivation?.defaultEnabled !== false
    || memory.manifestJson?.memoryProvider?.defaultForNewCompanies !== false) {
    throw new Error("SPS Default Memory must remain opt-in for every new Company.");
  }
  return memory;
}

async function assertPluginDiscoveryPlugin() {
  const response = await ownerHostRequest("/api/plugins", { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Could not inspect bundled plugins (${response.status}).`);
  const plugins = await response.json();
  const discovery = Array.isArray(plugins)
    ? plugins.find((plugin) => plugin?.manifestJson?.id === "sps.plugin-discovery")
    : null;
  if (!discovery || discovery.status !== "ready") {
    throw new Error("SPS Plugin Discovery was not installed and ready in the packaged Owner Host.");
  }
  if (discovery.manifestJson?.companyActivation?.defaultEnabled !== true) {
    throw new Error("SPS Plugin Discovery must start enabled for a new Company.");
  }
  if (
    discovery.manifestJson?.sps?.contractVersion !== "2.0"
    || !Array.isArray(discovery.manifestJson?.sps?.primitives)
    || discovery.manifestJson.sps.primitives.length !== 0
  ) {
    throw new Error("SPS Plugin Discovery must declare the neutral Extension Profile 2.0 contract.");
  }
  const toolNames = Array.isArray(discovery.manifestJson?.tools)
    ? discovery.manifestJson.tools.map((tool) => tool?.name).sort()
    : [];
  if (toolNames.join(",") !== "draft-sps-extension,search-sps-extensions") {
    throw new Error("SPS Plugin Discovery did not expose its expected Agent tools in the packaged Owner Host.");
  }
  try {
    await Promise.all([
      access(path.join(executionRuntimeRoot, "sps-plugin-discovery", "dist", "ui-v0.3.1", "index.js")),
      access(path.join(executionRuntimeRoot, "sps-plugin-discovery", "dist", "conversation.js")),
    ]);
  } catch {
    throw new Error("SPS Plugin Discovery conversation assets were not bundled with the packaged Owner Host.");
  }
  return discovery;
}

async function assertPluginDiscoveryBridge() {
  const workspace = await ownerHostJson("/api/companies", {
    name: "Discovery Bridge Smoke",
    description: "Disposable packaged Owner Host Discovery bridge verification.",
  });
  const companyId = typeof workspace?.id === "string" ? workspace.id : "";
  if (!companyId) throw new Error("Could not create a disposable Workspace for the Discovery bridge smoke.");

  const activations = await ownerHostJson(`/api/plugins/companies/${companyId}`);
  const activationByKey = new Map(
    Array.isArray(activations?.plugins)
      ? activations.plugins.map((plugin) => [plugin?.pluginKey, plugin?.activation])
      : [],
  );
  const discoveryActivation = activationByKey.get("sps.plugin-discovery");
  const memoryActivation = activationByKey.get("sps.default-memory");
  const roomsActivation = activationByKey.get("local.room-chat");
  if (
    discoveryActivation?.enabled !== true
    || discoveryActivation?.defaultEnabled !== true
    || memoryActivation?.enabled !== false
    || memoryActivation?.defaultEnabled !== false
    || roomsActivation?.enabled !== false
    || roomsActivation?.defaultEnabled !== false
  ) {
    throw new Error("The packaged SPS Baseline did not keep only Plugin Discovery enabled for a new Workspace.");
  }

  const legacyBuiltIns = await ownerHostRequest(`/api/companies/${companyId}/built-in-agents`, {
    signal: AbortSignal.timeout(5_000),
  });
  const legacyBuiltInsPayload = await legacyBuiltIns.json().catch(() => null);
  if (
    legacyBuiltIns.status !== 404
    || !String(legacyBuiltInsPayload?.error ?? "").includes("Built-in agents are not enabled")
  ) {
    throw new Error("The packaged SPS Baseline left the legacy built-in-agent API available.");
  }

  const view = await ownerHostJson("/api/plugins/sps.plugin-discovery/bridge/data", {
    key: "discovery-workspace",
    companyId,
    params: {},
  });
  if (
    view?.data?.hasCatalog !== true
    || !Array.isArray(view?.data?.assistants)
    || view.data.assistants.length !== 0
    || view.data.selectedAssistantId !== null
    || !Array.isArray(view.data.transcript)
    || view.data.transcript.length !== 0
  ) {
    throw new Error(`The packaged Plugin Discovery worker did not return its empty-Workspace view through the UI bridge: ${JSON.stringify(view?.data ?? null)}`);
  }

  const send = await ownerHostRequest("/api/plugins/sps.plugin-discovery/bridge/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      key: "discovery-send",
      companyId,
      params: { prompt: "Find a suitable SPS extension." },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const sendPayload = await send.json().catch(() => null);
  if (
    send.status !== 502
    || sendPayload?.code !== "WORKER_ERROR"
    || !String(sendPayload?.message ?? "").includes("Select an available Assistant")
  ) {
    throw new Error("Plugin Discovery did not require an Initial Assistant before sending a conversation message.");
  }
}

async function assertRoomsPlugin() {
  const response = await ownerHostRequest("/api/plugins", { signal: AbortSignal.timeout(5_000) });
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

async function writeRegistrySmokePackage(
  version,
  capabilities = ["plugin.state.read"],
  minimumHostVersion = "0.4.0",
) {
  const packageRoot = path.join(temporaryRoot, "registry-staging", `registry-smoke-${version}`);
  const manifestSource = [
    "export default {",
    '  id: "sps.registry-smoke",',
    "  apiVersion: 1,",
    `  version: ${JSON.stringify(version)},`,
    `  minimumHostVersion: ${JSON.stringify(minimumHostVersion)},`,
    '  displayName: "Registry Smoke",',
    '  description: "Packaged Registry lifecycle smoke plugin.",',
    '  author: "SPS",',
    '  categories: ["automation"],',
    `  capabilities: ${JSON.stringify(capabilities)},`,
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
  const response = await ownerHostRequest(pathname, {
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
  const v2 = await writeRegistrySmokePackage("1.0.1", ["plugin.state.read", "plugin.state.write"]);
  const source = { registryId: "sps.runtime-smoke", kind: "local", releaseLocator: "runtime-smoke" };

  const stageV1 = await ownerHostJson("/api/plugins/registry/stages", { ...v1, source: { ...source, releaseLocator: "runtime-smoke/1.0.0" } });
  if (stageV1.status !== "staged") throw new Error("Registry smoke v1 was not kept in the disabled stage.");
  const installed = await ownerHostJson(`/api/plugins/registry/stages/${encodeURIComponent(stageV1.stageId)}/enable`, {});
  if (installed.plugin?.version !== "1.0.0" || installed.plugin?.status !== "ready") {
    throw new Error("Registry smoke v1 did not install and activate.");
  }

  const stageV2 = await ownerHostJson("/api/plugins/registry/stages", { ...v2, source: { ...source, releaseLocator: "runtime-smoke/1.0.1" } });
  const pending = await ownerHostJson(`/api/plugins/registry/stages/${encodeURIComponent(stageV2.stageId)}/enable`, {});
  if (pending.stage?.status !== "review_pending" || pending.plugin?.status !== "upgrade_pending") {
    throw new Error("Registry smoke v2 did not stop for explicit capability review.");
  }
  const review = await ownerHostJson(`/api/plugins/${encodeURIComponent(installed.plugin.id)}/pending-update`);
  if (review?.stageId !== stageV2.stageId || !review?.addedCapabilities?.includes("plugin.state.write")) {
    throw new Error("Registry smoke v2 did not preserve the exact staged candidate for review.");
  }
  const upgraded = await ownerHostJson(`/api/plugins/${encodeURIComponent(installed.plugin.id)}/upgrade`, {
    stageId: stageV2.stageId,
    approvedCapabilityEscalation: true,
  });
  if (
    upgraded?.version !== "1.0.1"
    || upgraded?.status !== "ready"
    || !upgraded?.manifestJson?.capabilities?.includes("plugin.state.write")
  ) {
    throw new Error("Registry smoke v2 did not replace the active plugin.");
  }

  const rolledBack = await ownerHostJson(`/api/plugins/registry/stages/${encodeURIComponent(stageV1.stageId)}/enable`, {});
  if (rolledBack.plugin?.version !== "1.0.0" || rolledBack.plugin?.status !== "ready") {
    throw new Error("Registry smoke did not restore the earlier reviewed version.");
  }

  const incompatible = await writeRegistrySmokePackage("1.0.2", ["plugin.state.read"], "0.5.0");
  const incompatibleStage = await ownerHostJson("/api/plugins/registry/stages", {
    ...incompatible,
    source: { ...source, releaseLocator: "runtime-smoke/1.0.2" },
  });
  const incompatibleEnable = await ownerHostRequest(`/api/plugins/registry/stages/${encodeURIComponent(incompatibleStage.stageId)}/enable`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15_000),
  });
  const incompatiblePayload = await incompatibleEnable.json().catch(() => null);
  if (incompatibleEnable.ok || !String(incompatiblePayload?.error ?? "").includes("requires host version 0.5.0 or newer")) {
    throw new Error("Registry smoke did not block a plugin that requires a newer SPS Desktop.");
  }
}

/**
 * Exercises the public Plugin Kit contract end to end: an author creates a
 * source tree, publishes a signed local Registry release, Desktop verifies
 * and stages it without executing code, then Core explicitly enables it.
 */
async function assertRegistryAuthoringDesktopFlow() {
  const sourceDirectory = path.join(temporaryRoot, "registry-authoring", "source");
  const registryDirectory = path.join(temporaryRoot, "registry-authoring", "registry");
  const publisher = generatePluginSigningKeyPair();
  const registryRoot = generatePluginSigningKeyPair();
  await createPluginTemplate({
    directory: sourceDirectory,
    pluginId: "sps.registry-pilot",
    packageName: "@sps/registry-pilot",
    displayName: "SPS Registry Pilot",
    version: "1.0.0",
  });
  await publishPluginToLocalRegistry({
    sourceDirectory,
    registryDirectory,
    registryId: "io.sps.registry-pilot",
    displayName: "SPS Registry Pilot",
    publisherId: "sps-smoke",
    publisherKeyId: "ed25519:sps-smoke-publisher",
    publisherPrivateKey: publisher.privateKey,
    registryRootKeyId: "ed25519:sps-smoke-registry",
    registryRootPrivateKey: registryRoot.privateKey,
    catalog: {
      displayName: "SPS Registry Pilot",
      summary: "End-to-end signed Registry smoke plugin.",
      documentationUrl: "https://docs.example.test/sps-registry-pilot",
    },
    publisherProfile: {
      displayName: "SPS Smoke Publisher",
      websiteUrl: "https://example.test",
    },
    publishedAt: "2026-07-23T00:00:00.000Z",
  });
  const source = {
    id: "io.sps.registry-pilot",
    kind: "local",
    displayName: "SPS Registry Pilot",
    localPath: registryDirectory,
  };
  const report = await inspectRegistrySource(source);
  const release = report.releases.find((entry) => entry.pluginId === "sps.registry-pilot" && entry.version === "1.0.0");
  if (
    !report.valid
    || !release
    || release.catalog?.displayName !== "SPS Registry Pilot"
    || release.publisherProfile?.displayName !== "SPS Smoke Publisher"
    || release.publisherProfile?.websiteUrl !== "https://example.test"
    || !release.capabilities?.includes("plugin.state.read")
  ) {
    throw new Error("The authored Registry release did not preserve its verified catalogue or publisher metadata.");
  }

  const acquired = await acquireRegistryRelease({
    vaultRoot: temporaryRoot,
    source,
    pluginId: "sps.registry-pilot",
    version: "1.0.0",
  });
  const staged = await stageSpsPluginArchive({
    vaultRoot: temporaryRoot,
    archivePath: acquired.archivePath,
    expectedArtifact: acquired.artifact,
    expectedRelease: acquired.release,
    source: acquired.source,
    registerStage: async (body) => await ownerHostJson("/api/plugins/registry/stages", body),
  });
  if (!staged.staged || staged.stage?.status !== "staged") {
    throw new Error("The authored Registry release was not kept in the disabled Desktop stage.");
  }
  const enabled = await ownerHostJson(`/api/plugins/registry/stages/${encodeURIComponent(staged.stage.stageId)}/enable`, {});
  if (enabled.plugin?.pluginKey !== "sps.registry-pilot" || enabled.plugin?.version !== "1.0.0" || enabled.plugin?.status !== "ready") {
    throw new Error("The authored Registry release did not explicitly activate through Core.");
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
const discoveryCatalogPath = path.join(temporaryRoot, "plugin-discovery", "official-catalog.json");
await mkdir(path.dirname(discoveryCatalogPath), { recursive: true });
await writeFile(discoveryCatalogPath, `${JSON.stringify({
  schemaVersion: 1,
  source: { id: "io.sps.official", displayName: "SPS Official Registry" },
  refreshedAt: new Date().toISOString(),
  releases: [],
}, null, 2)}\n`, "utf8");
const memoryChild = spawn(
  nodeBinary,
  ["--preserve-symlinks", "--preserve-symlinks-main", path.join(executionRuntimeRoot, "memory-sidecar", "memory-sidecar.mjs"), "--config", memoryConfigPath],
  {
    cwd: executionRuntimeRoot,
    env: {
      ...process.env,
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
  nodeBinary,
  ["--preserve-symlinks", "--preserve-symlinks-main", path.join(executionRuntimeRoot, "sps-owner-host-bootstrap.mjs")],
  {
    cwd: executionRuntimeRoot,
    env: {
      ...process.env,
      PAPERCLIP_TELEMETRY_DISABLED: "1",
      PAPERCLIP_CONFIG: configPath,
      PAPERCLIP_HOME: temporaryRoot,
      PAPERCLIP_DB_BACKUP_DIR: path.join(temporaryRoot, "backups"),
      PAPERCLIP_STORAGE_LOCAL_DIR: path.join(temporaryRoot, "storage"),
      PAPERCLIP_SECRETS_MASTER_KEY_FILE: path.join(temporaryRoot, "secrets", "master.key"),
      PAPERCLIP_PROJECTS_ROOT: path.join(temporaryRoot, "projects"),
      SPS_BUNDLED_PLUGIN_PATHS: [
        path.join(executionRuntimeRoot, "sps-default-memory"),
        path.join(executionRuntimeRoot, "sps-plugin-discovery"),
        path.join(executionRuntimeRoot, "sps-room-chat"),
      ].join(path.delimiter),
      SPS_PLUGIN_DISCOVERY_CATALOG_PATH: discoveryCatalogPath,
      // Exercise the same neutral, plugin-first Core profile that SPS
      // Desktop supplies for a newly created Owner Host.
      SPS_BASIC_MODE: "true",
      SPS_CORE_BASELINE_MODE: "true",
      SPS_WORKPLANE_MODE: "false",
      SPS_ROOM_API_URL: `http://127.0.0.1:${port}`,
      SPS_MEMORY_SIDECAR_URL: `http://127.0.0.1:${memoryPort}`,
      SPS_MEMORY_SIDECAR_TOKEN: memoryToken,
      SPS_DESKTOP_ACCESS_TOKEN: desktopAccessToken,
      PAPERCLIP_AGENT_RUNTIME_PACKS_DIR: path.join(executionRuntimeRoot, "..", "missing-agent-runtime-packs"),
      SPS_OWNER_HOST_NODE: nodeBinary,
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
  await assertDesktopOnlyBoundary();
  await assertStaticWorkspaceUi();
  await assertBaselineTeamAccessUi();
  await assertDefaultMemoryPlugin();
  await assertPluginDiscoveryPlugin();
  await assertPluginDiscoveryBridge();
  await assertRoomsPlugin();
  await assertRegistryLifecycle();
  await assertRegistryAuthoringDesktopFlow();
  passed = true;
  console.log(`Packaged SPS Owner Host, baseline Team access UI, bundled SPS plugins, and Registry author/publish/install/update/rollback smoke test passed on http://127.0.0.1:${port} (${health.status}).`);
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
  if (executionRuntimeRoot !== runtimeRoot) {
    await removeWithRetry(executionRuntimeRoot);
  }
}

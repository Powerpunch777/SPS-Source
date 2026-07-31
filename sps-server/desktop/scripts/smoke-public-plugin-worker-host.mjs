import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const runtimeRoot = path.resolve(process.env.SPS_OWNER_HOST_RUNTIME_ROOT || path.join(desktopRoot, ".owner-host-runtime"));
const sdkRoot = path.resolve(process.env.SPS_PUBLIC_PLUGIN_SDK_ROOT || path.join(desktopRoot, "node_modules", "@sonparkserver", "plugin-sdk"));
const buildHelperPath = path.join(sdkRoot, "authoring", "worker-bundle-v1.mjs");
try {
  await access(buildHelperPath);
} catch {
  throw new Error(`The installed public SDK at ${sdkRoot} does not provide authoring/worker-bundle-v1.mjs. Refresh the pinned Desktop dependency or set SPS_PUBLIC_PLUGIN_SDK_ROOT to a compatible development SDK.`);
}

const [{ buildPluginWorker }, { createPluginWorkerManager }] = await Promise.all([
  import(pathToFileURL(buildHelperPath).href),
  import(pathToFileURL(path.join(runtimeRoot, "node_modules", "@paperclipai", "server", "dist", "services", "plugin-worker-manager.js")).href),
]);

const companyId = "packaged-owner-host-conformance";
const nodeId = "packaged-owner-host-node";
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "sps-public-worker-host-"));
const pluginRoot = path.join(temporaryRoot, "public-worker");
const workerSourcePath = path.join(pluginRoot, "src", "worker.mjs");
const workerPath = path.join(pluginRoot, "dist", "worker.js");
let manager;

try {
  await mkdir(path.dirname(workerSourcePath), { recursive: true });
  // The public package is available only while esbuild resolves the authored
  // entrypoint. Delete this link before spawn so runtime proof is dist-only.
  const sdkLink = path.join(pluginRoot, "node_modules", "@sonparkserver", "plugin-sdk");
  await mkdir(path.dirname(sdkLink), { recursive: true });
  await symlink(sdkRoot, sdkLink, process.platform === "win32" ? "junction" : "dir");
  await writeFile(workerSourcePath, [
    'import { createSpsRuntimeClient } from "@sonparkserver/plugin-sdk/runtime";',
    'import { defineSpsPlugin, runSpsWorker } from "@sonparkserver/plugin-sdk/worker";',
    "",
    "let runtimes = null;",
    "runSpsWorker(defineSpsPlugin({",
    "  async initialize({ spsTransport }) {",
    "    const sps = createSpsRuntimeClient(spsTransport);",
    `    runtimes = await sps.runtimes.list(${JSON.stringify(companyId)}, { nodeId: ${JSON.stringify(nodeId)} });`,
    "  },",
    "  health() { return { status: \"ok\", runtimes }; },",
    "  shutdown() { return { status: \"stopped\" }; },",
    "}));",
    "",
  ].join("\n"), "utf8");

  await buildPluginWorker({ sourceDirectory: pluginRoot });
  const bundledWorker = await readFile(workerPath, "utf8");
  assert.doesNotMatch(bundledWorker, /(?:from\s+|import\s*\()\s*["']@sonparkserver\/plugin-sdk\/(?:runtime|worker)/);
  assert.doesNotMatch(bundledWorker, /(?:from\s+|import\s*\()\s*["']@paperclipai\//);
  await rm(path.join(pluginRoot, "node_modules"), { recursive: true, force: true });

  const hostRequests = [];
  manager = createPluginWorkerManager();
  const handle = await manager.startWorker("sps.public-worker-host-conformance", {
    entrypointPath: workerPath,
    manifest: { id: "sps.public-worker-host-conformance", apiVersion: 1 },
    config: {},
    instanceInfo: { instanceId: "packaged-owner-host-conformance", hostVersion: "0.4.96" },
    apiVersion: 1,
    autoRestart: false,
    hostHandlers: {
      "sps.runtimes.list": async (params) => {
        hostRequests.push(params);
        assert.deepEqual(params, { companyId, nodeId });
        return [{ id: "runtime-public-conformance", nodeId, status: "ready" }];
      },
    },
  });

  assert.equal(handle.status, "running");
  assert.deepEqual(hostRequests, [{ companyId, nodeId }]);
  const health = await manager.call("sps.public-worker-host-conformance", "health", {});
  assert.deepEqual(health, {
    status: "ok",
    runtimes: [{ id: "runtime-public-conformance", nodeId, status: "ready" }],
  });

  const exited = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Public SDK Worker did not exit after Host shutdown.")), 5_000);
    handle.on("exit", (event) => {
      clearTimeout(timeout);
      resolve(event);
    });
  });
  await manager.stopWorker("sps.public-worker-host-conformance");
  assert.deepEqual(await exited, { pluginId: "sps.public-worker-host-conformance", code: 0, signal: null });
  assert.equal(manager.isRunning("sps.public-worker-host-conformance"), false);
  console.log("Packaged public SDK Worker Host conformance passed.");
} finally {
  await manager?.stopAll();
  await rm(temporaryRoot, { recursive: true, force: true });
}

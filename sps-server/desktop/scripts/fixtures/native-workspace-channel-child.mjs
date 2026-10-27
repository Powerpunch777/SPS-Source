// Isolated actual Core factory composition. Never reads a Desktop profile.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.deepEqual(process.argv.slice(2), ["--isolated-native-workspace-channel-child"]);
assert.equal(typeof process.send, "function");
const STARTUP_STAGES = new Set(["configuration_received", "import_db", "import_identity_auth", "import_workspace_channel",
  "import_parent_enrollment", "import_parent_ingress", "import_node_runtime", "database_connect", "identity_create",
  "node_runtime_create", "import_plugin_worker_manager", "import_plugin_host_handlers", "import_plugin_state_store",
  "import_native_plugin_runtime", "plugin_state_create", "plugin_worker_start", "plugin_runtime_create",
  "workspace_channel_create", "enrollment_create", "parent_ingress_create", "wait_workspace_channel_ready"]);
let startupStage = "configuration_received";
function reportStartupStage(stage) {
  if (!STARTUP_STAGES.has(stage)) throw new Error("Invalid isolated Core startup phase.");
  startupStage = stage;
  if (process.connected) process.send({ kind: "sps.test.native-workspace.startup-progress", stage });
}
const configuration = await new Promise(resolve => {
  process.once("message", resolve);
  process.send({ kind: "sps.test.native-workspace.configure-ready" });
});
assert.equal(configuration?.kind, "sps.test.native-workspace.configure");
const core = path.resolve(import.meta.dirname, "../../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
let db, channel, enrollment, ingress, workerManager, pluginRuntime, nodeRuntime, stopping = false, stopPromise;
function stop() {
  if (!stopPromise) stopPromise = (async () => {
    stopping = true;
    const mark = stage => process.stdout.write(`native_child_stop:${stage}\n`);
    mark("started");
    process.removeListener("message", onMessage);
    process.removeListener("disconnect", onDisconnect);
    const errors = [];
    for (const [stage, dispose] of [
      ["ingress", () => ingress?.dispose()],
      ["enrollment", () => enrollment?.dispose()],
      ["workspace", () => channel?.dispose()],
      ["node-runtime", () => nodeRuntime?.dispose()],
      ["plugins", async () => { pluginRuntime?.dispose(); await workerManager?.shutdown(); }],
    ]) {
      try { await dispose(); } catch (error) { errors.push(error); }
      mark(stage);
    }
    try { await db?.$client.end({ timeout: 5 }); } catch (error) { errors.push(error); }
    mark("database");
    if (process.connected) process.disconnect();
    mark("disconnected");
    if (errors.length) throw new AggregateError(errors, "Native Workspace child shutdown failed.");
  })();
  return stopPromise;
}
function onMessage(message) {
  if (message?.kind === "sps.test.native-workspace.stop") void stop().catch(() => { process.exitCode = 1; });
}
function onDisconnect() { void stop().catch(() => { process.exitCode = 1; }); }
process.on("message", onMessage);
process.once("disconnect", onDisconnect);
try {
  reportStartupStage("import_db");
  const { createDb } = await load("packages/db/src/index.ts");
  reportStartupStage("import_identity_auth");
  const { createSpsIdentityAuth } = await load("server/src/auth/sps-identity.ts");
  reportStartupStage("import_workspace_channel");
  const { createSpsNativeWorkspaceChannel } = await load("server/src/services/sps-native-workspace-channel.ts");
  reportStartupStage("import_parent_enrollment");
  const { createSpsNativeParentEnrollmentService } = await load("server/src/services/sps-native-parent-enrollment.ts");
  reportStartupStage("import_parent_ingress");
  const { createSpsNativeParentIngress } = await load("server/src/services/sps-native-parent-ingress.ts");
  reportStartupStage("import_node_runtime");
  const { createSpsNativeNodeRuntime } = await load("server/src/services/sps-native-node-runtime.ts");
  reportStartupStage("database_connect");
  db = createDb(configuration.connectionString);
  reportStartupStage("identity_create");
  const identity = createSpsIdentityAuth(db, {
    authIdentityEnabled: true, authIdentityIssuer: "https://workspace.example.test",
    authIdentityAudience: "sps-core", authIdentityJwksUrl: "https://workspace.example.test/.well-known/jwks.json",
    authPublicBaseUrl: "https://workspace.example.test",
  });
  if (configuration.nativeNode) {
    reportStartupStage("node_runtime_create");
    nodeRuntime = createSpsNativeNodeRuntime(db);
  }
  if (configuration.nativePlugin) {
    reportStartupStage("import_plugin_worker_manager");
    const { createPluginWorkerManager } = await load("server/src/services/plugin-worker-manager.ts");
    reportStartupStage("import_plugin_host_handlers");
    const { createHostClientHandlers } = await load("packages/plugins/sdk/src/host-client-factory.ts");
    reportStartupStage("import_plugin_state_store");
    const { pluginStateStore } = await load("server/src/services/plugin-state-store.ts");
    reportStartupStage("import_native_plugin_runtime");
    const { createSpsNativePluginRuntime } = await load("server/src/services/sps-native-plugin-runtime.ts");
    reportStartupStage("plugin_state_create");
    const fixture = configuration.nativePlugin;
    const state = pluginStateStore(db);
    workerManager = createPluginWorkerManager();
    reportStartupStage("plugin_worker_start");
    await workerManager.startWorker(fixture.pluginId, {
      entrypointPath: path.resolve(import.meta.dirname, "native-plugin-state-worker.cjs"), manifest: fixture.manifest,
      config: {}, instanceInfo: { instanceId: "native-plugin-fixture", hostVersion: "0.4.137" }, apiVersion: 1,
      autoRestart: false, hostHandlers: createHostClientHandlers({ pluginId: fixture.pluginId,
        capabilities: fixture.manifest.capabilities, services: { state: {
          get: params => state.get(fixture.pluginId, params.scopeKind, params.stateKey, { scopeId: params.scopeId }),
          set: params => state.set(fixture.pluginId, params), delete: params => state.delete(fixture.pluginId, params),
        } } }),
    });
    reportStartupStage("plugin_runtime_create");
    pluginRuntime = createSpsNativePluginRuntime(db, workerManager, { localPluginDir: fixture.packageRoot });
  }
  reportStartupStage("workspace_channel_create");
  channel = createSpsNativeWorkspaceChannel({ db, identity, ...configuration.binding,
    getNodeRuntime: () => nodeRuntime,
    getPluginRuntime: () => pluginRuntime,
    assertCurrent() { assert.equal(stopping, false); assert.equal(process.connected, true); },
  });
  if (configuration.renewal) {
    reportStartupStage("enrollment_create");
    enrollment = await createSpsNativeParentEnrollmentService(db, {
      pairingPolicy: { maxTtlMs: 3_600_000, maxAttempts: 5, maxActiveInvites: 10 },
      certificateLifetimeMs: 90 * 86_400_000, signingTimeoutMs: 15_000, maxConcurrentSignings: 2,
    });
    reportStartupStage("parent_ingress_create");
    ingress = createSpsNativeParentIngress(identity, enrollment, {
      assertCurrent() { assert.equal(stopping, false); assert.equal(process.connected, true); },
    });
  }
  reportStartupStage("wait_workspace_channel_ready");
  await channel.ready;
  process.send({ kind: "sps.test.native-workspace.ready" });
} catch {
  process.exitCode = 1;
  if (process.connected) process.send({ kind: "sps.test.native-workspace.failure", stage: startupStage });
  await stop();
}

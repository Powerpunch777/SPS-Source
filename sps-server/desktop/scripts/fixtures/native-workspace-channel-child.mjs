// Isolated actual Core factory composition. Never reads a Desktop profile.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

assert.deepEqual(process.argv.slice(2), ["--isolated-native-workspace-channel-child"]);
assert.equal(typeof process.send, "function");
const configuration = await new Promise(resolve => {
  process.once("message", resolve);
  process.send({ kind: "sps.test.native-workspace.configure-ready" });
});
assert.equal(configuration?.kind, "sps.test.native-workspace.configure");
const core = path.resolve(import.meta.dirname, "../../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
let db, channel, enrollment, ingress, workerManager, pluginRuntime, stopping = false, stopPromise;
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
  const { createDb } = await load("packages/db/src/index.ts");
  const { createSpsIdentityAuth } = await load("server/src/auth/sps-identity.ts");
  const { createSpsNativeWorkspaceChannel } = await load("server/src/services/sps-native-workspace-channel.ts");
  const { createSpsNativeParentEnrollmentService } = await load("server/src/services/sps-native-parent-enrollment.ts");
  const { createSpsNativeParentIngress } = await load("server/src/services/sps-native-parent-ingress.ts");
  db = createDb(configuration.connectionString);
  const identity = createSpsIdentityAuth(db, {
    authIdentityEnabled: true, authIdentityIssuer: "https://workspace.example.test",
    authIdentityAudience: "sps-core", authIdentityJwksUrl: "https://workspace.example.test/.well-known/jwks.json",
    authPublicBaseUrl: "https://workspace.example.test",
  });
  if (configuration.nativePlugin) {
    const { createPluginWorkerManager } = await load("server/src/services/plugin-worker-manager.ts");
    const { createHostClientHandlers } = await load("packages/plugins/sdk/src/host-client-factory.ts");
    const { pluginStateStore } = await load("server/src/services/plugin-state-store.ts");
    const { createSpsNativePluginRuntime } = await load("server/src/services/sps-native-plugin-runtime.ts");
    const fixture = configuration.nativePlugin;
    const state = pluginStateStore(db);
    workerManager = createPluginWorkerManager();
    await workerManager.startWorker(fixture.pluginId, {
      entrypointPath: path.resolve(import.meta.dirname, "native-plugin-state-worker.cjs"), manifest: fixture.manifest,
      config: {}, instanceInfo: { instanceId: "native-plugin-fixture", hostVersion: "0.4.137" }, apiVersion: 1,
      autoRestart: false, hostHandlers: createHostClientHandlers({ pluginId: fixture.pluginId,
        capabilities: fixture.manifest.capabilities, services: { state: {
          get: params => state.get(fixture.pluginId, params.scopeKind, params.stateKey, { scopeId: params.scopeId }),
          set: params => state.set(fixture.pluginId, params), delete: params => state.delete(fixture.pluginId, params),
        } } }),
    });
    pluginRuntime = createSpsNativePluginRuntime(db, workerManager, { localPluginDir: fixture.packageRoot });
  }
  channel = createSpsNativeWorkspaceChannel({ db, identity, ...configuration.binding,
    getPluginRuntime: () => pluginRuntime,
    assertCurrent() { assert.equal(stopping, false); assert.equal(process.connected, true); },
  });
  if (configuration.renewal) {
    enrollment = await createSpsNativeParentEnrollmentService(db, {
      pairingPolicy: { maxTtlMs: 3_600_000, maxAttempts: 5, maxActiveInvites: 10 },
      certificateLifetimeMs: 90 * 86_400_000, signingTimeoutMs: 15_000, maxConcurrentSignings: 2,
    });
    ingress = createSpsNativeParentIngress(identity, enrollment, {
      assertCurrent() { assert.equal(stopping, false); assert.equal(process.connected, true); },
    });
  }
  await channel.ready;
  process.send({ kind: "sps.test.native-workspace.ready" });
} catch {
  process.exitCode = 1;
  if (process.connected) process.send({ kind: "sps.test.native-workspace.failure" });
  await stop();
}

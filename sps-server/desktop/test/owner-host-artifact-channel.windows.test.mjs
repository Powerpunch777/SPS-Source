import assert from "node:assert/strict";
import { createServer } from "node:net";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ensurePluginPreviewConfig } from "../src/plugin-preview-runtime.mjs";
import { createSpsOwnerHostManager, resolveSpsOwnerHostRuntime } from "../src/owner-host.mjs";
import { createSpsDesktopPluginArtifactActivityGate } from "../src/plugin-artifact-activity-gate.mjs";

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  assert.ok(address && typeof address === "object");
  return address.port;
}

test("actual Windows owned Core retains its private reference scope across Main-side work and clean shutdown", {
  skip: process.platform !== "win32", timeout: 120_000,
}, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owned-artifact-channel-"));
  const identity = await lstat(root, { bigint: true });
  const temporaryRoot = await realpath(os.tmpdir());
  const activity = createSpsDesktopPluginArtifactActivityGate();
  let manager;
  t.after(async () => {
    if (manager) {
      const status = await manager.stop();
      assert.equal(status.state, "stopped", "Unconfirmed Core ownership must retain its temporary data.");
      assert.equal(status.owned, false);
    }
    await activity.withMaintenance(async () => {});
    const current = await lstat(root, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], identity[key]);
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(path.dirname(await realpath(root)), temporaryRoot);
    assert.ok(path.basename(root).startsWith("sps-owned-artifact-channel-"));
    await rm(root, { recursive: true, force: true });
  });
  const preview = await ensurePluginPreviewConfig({ ownerVault: root,
    buildId: "build-11111111-1111-4111-8111-111111111111",
    findPorts: async () => ({ serverPort: await freePort(), databasePort: await freePort() }),
  });
  const coreRoot = path.resolve(import.meta.dirname, "../../../external/sps-core");
  const environment = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]
    .filter(key => typeof process.env[key] === "string").map(key => [key, process.env[key]]));
  manager = createSpsOwnerHostManager({ url: preview.url, baseEnvironment: environment,
    artifactReferences: true, onArtifactUncertainty: () => activity.retainUncertainty(), startupAttempts: 150,
    resolveRuntime: () => resolveSpsOwnerHostRuntime({ coreRoots: [coreRoot], configPath: preview.configPath,
      nodeCommand: process.execPath, instanceId: "sps-preview-artifact-test", environment: {
        PAPERCLIP_HOME: preview.previewVault, PAPERCLIP_TELEMETRY_DISABLED: "1", PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
        SPS_CORE_BASELINE_MODE: "true", SPS_BASIC_MODE: "true", SPS_BUNDLED_PLUGIN_PATHS: "", PAPERCLIP_BUNDLED_PLUGIN_PATHS: "",
      } }),
  });
  const status = await manager.start();
  assert.equal(status.state, "running", status.lastError);
  assert.equal(status.owned, true);
  assert.equal(status.processTree, "windows_job");
  let oldScope;
  const result = await activity.withMaintenance(() => manager.withPluginArtifactReferences(async scope => {
    oldScope = scope;
    assert.equal(scope.coverage, "core-only");
    assert.match(scope.fingerprint, /^[a-f0-9]{64}$/);
    await scope.assertCurrent();
    assert.throws(() => activity.withActivity(async () => {}), /maintenance/);
    return "main-work-complete";
  }));
  assert.equal(result, "main-work-complete");
  await assert.rejects(oldScope.assertCurrent());
  await manager.withPluginArtifactReferences(async scope => scope.assertCurrent());
  let entered;
  const callbackEntered = new Promise(resolve => { entered = resolve; });
  let release;
  const callbackMayFinish = new Promise(resolve => { release = resolve; });
  const interrupted = activity.withMaintenance(() => manager.withPluginArtifactReferences(async scope => {
    entered(); await callbackMayFinish;
    await scope.assertCurrent();
    throw new Error("The revoked scope must not reach further Main work.");
  }));
  void interrupted.catch(() => {});
  await callbackEntered;
  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
  release();
  await assert.rejects(interrupted, error => error.code === "SPS_PLUGIN_ARTIFACT_CHANNEL_UNAVAILABLE");
  await activity.withMaintenance(async () => {});
  await assert.rejects(manager.withPluginArtifactReferences(async () => {}));
});

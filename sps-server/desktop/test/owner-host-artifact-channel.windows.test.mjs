import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ensurePluginPreviewConfig } from "../src/plugin-preview-runtime.mjs";
import { createSpsOwnerHostManager, resolveSpsOwnerHostRuntime } from "../src/owner-host.mjs";
import { createSpsDesktopPluginArtifactActivityGate } from "../src/plugin-artifact-activity-gate.mjs";
import { createSpsPluginArtifactObservation } from "../src/plugin-artifact-observation.mjs";
import { readDeveloperProjectArtifactReferences } from "../src/developer-project-store.mjs";
import { readRegistrySourceArtifactReferences, saveRegistrySources } from "../src/registry-source-catalog.mjs";

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
  if (!process.argv.includes("--sps-artifact-observation-child")) {
    const wrapper = fileURLToPath(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url));
    let stdout;
    try {
      ({ stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
        "-File", wrapper, "-Mode", "probe-artifact-observation"], { windowsHide: true, timeout: 110_000, maxBuffer: 256 * 1024 }));
    } catch (error) {
      // execFile's default error omits stdout, which contains the nested TAP
      // assertion. Keep bounded fixture diagnostics without changing failure.
      t.diagnostic(String(error.stdout ?? "").slice(-24 * 1024));
      throw error;
    }
    const records = stdout.split(/\r?\n/).filter(line => line.startsWith("{")).map(line => JSON.parse(line));
    assert.equal(records.some(item => item.restrictedE2eChild === true && item.privilegesReduced === true
      && item.administratorEnabled === false && item.administratorDenied === true), true);
    assert.equal(records.some(item => item.ownedJobEmpty === true && item.ownedJobCleanup === "natural"), true);
    assert.match(stdout, /SPS_ARTIFACT_SCOPE_CLOSED/);
    assert.equal(records.at(-1).ownedDesktopClose, "closed");
    return;
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-owned-artifact-channel-"));
  const identity = await lstat(root, { bigint: true });
  const temporaryRoot = await realpath(os.tmpdir());
  const activity = createSpsDesktopPluginArtifactActivityGate();
  let manager, previewManager;
  t.after(async () => {
    for (const owner of [previewManager, manager].filter(Boolean)) {
      const status = await owner.stop();
      assert.equal(status.state, "stopped", "Unconfirmed Core ownership must retain its temporary data.");
      assert.equal(status.owned, false);
      assert.equal(status.lastError, null, "Normal Core shutdown must not conceal a failing exit.");
    }
    await activity.withMaintenance(async () => {});
    const current = await lstat(root, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], identity[key]);
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(path.dirname(await realpath(root)), temporaryRoot);
    assert.ok(path.basename(root).startsWith("sps-owned-artifact-channel-"));
    await rm(root, { recursive: true, force: true });
    console.log("SPS_ARTIFACT_SCOPE_CLOSED");
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
  const second = await ensurePluginPreviewConfig({ ownerVault: root,
    buildId: "build-22222222-2222-4222-8222-222222222222",
    findPorts: async () => ({ serverPort: await freePort(), databasePort: await freePort() }),
  });
  previewManager = createSpsOwnerHostManager({ url: second.url, baseEnvironment: environment,
    artifactReferences: true, onArtifactUncertainty: () => activity.retainUncertainty(), startupAttempts: 150,
    resolveRuntime: () => resolveSpsOwnerHostRuntime({ coreRoots: [coreRoot], configPath: second.configPath,
      nodeCommand: process.execPath, instanceId: "sps-preview-artifact-second", environment: {
        PAPERCLIP_HOME: second.previewVault, PAPERCLIP_TELEMETRY_DISABLED: "1", PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
        SPS_CORE_BASELINE_MODE: "true", SPS_BASIC_MODE: "true", SPS_BUNDLED_PLUGIN_PATHS: "", PAPERCLIP_BUNDLED_PLUGIN_PATHS: "",
      } }),
  });
  assert.equal((await previewManager.start()).state, "running");
  const registryPath = path.join(root, "local-registry");
  await mkdir(registryPath);
  await saveRegistrySources({ vaultRoot: root, sources: [{
    id: "io.sps.artifact-test", kind: "local", displayName: "Artifact test", localPath: registryPath,
  }] });
  const observation = createSpsPluginArtifactObservation({ activity, capture: () => ({
    assertCurrent() {}, async readInputs() {
      const developer = await readDeveloperProjectArtifactReferences({ vaultRoot: root });
      const registry = await readRegistrySourceArtifactReferences({ vaultRoot: root });
      const runtimes = [manager, previewManager].map(owner => owner.readRuntimeArtifactReferences());
      assert.ok(runtimes.every(value => value.available), "Actual owned launch references must be available.");
      const runtimeSignature = JSON.stringify(runtimes);
      return { references: [...developer.references, ...registry.references, ...runtimes.flatMap(value => value.references)], async assertCurrent() {
        await developer.assertCurrent();
        await registry.assertCurrent();
        if (JSON.stringify([manager, previewManager].map(owner => owner.readRuntimeArtifactReferences())) !== runtimeSignature) {
          throw new Error("Owned runtime reference generation changed.");
        }
      } };
    },
    participants: [{ id: "host", manager }, { id: "preview", manager: previewManager }],
  }) });
  let oldScope;
  const result = await observation.withSnapshot(async scope => {
    oldScope = scope;
    assert.equal(scope.coverage, "desktop-and-owned-cores");
    assert.match(scope.fingerprint, /^[a-f0-9]{64}$/);
    assert.ok(scope.references.some(reference => reference.source === "desktop-developer-index"
      && reference.processOwner === "desktop"));
    assert.ok(scope.references.some(reference => reference.source === "desktop-registry-source-index"
      && reference.processOwner === "desktop"));
    assert.ok(scope.references.some(reference => reference.source === "desktop-registry-source"
      && reference.path === registryPath && reference.processOwner === "desktop"));
    assert.ok(scope.references.some(reference => reference.source === "desktop-owned-runtime"
      && reference.path === coreRoot && reference.kind === "directory" && reference.processOwner === "desktop"));
    assert.ok(scope.references.some(reference => reference.source === "desktop-owned-runtime"
      && reference.path === process.execPath && reference.kind === "file"));
    await assert.rejects(manager.withPluginArtifactReferences(async () => assert.fail("Host scope must remain held.")));
    await assert.rejects(previewManager.withPluginArtifactReferences(async () => assert.fail("Preview scope must remain held.")));
    await scope.assertCurrent();
    assert.throws(() => activity.withActivity(async () => {}), /maintenance/);
    return "main-work-complete";
  });
  assert.equal(result, "main-work-complete");
  await assert.rejects(oldScope.assertCurrent());
  await manager.withPluginArtifactReferences(async scope => scope.assertCurrent());
  let entered;
  const callbackEntered = new Promise(resolve => { entered = resolve; });
  let release;
  const callbackMayFinish = new Promise(resolve => { release = resolve; });
  const interrupted = observation.withSnapshot(async scope => {
    entered(); await callbackMayFinish;
    await scope.assertCurrent();
    throw new Error("The revoked scope must not reach further Main work.");
  });
  void interrupted.catch(() => {});
  await callbackEntered;
  const stopped = await manager.stop();
  assert.equal(stopped.state, "stopped");
  assert.equal(stopped.lastError, null);
  release();
  await assert.rejects(interrupted, error => error.code === "SPS_PLUGIN_ARTIFACT_CHANNEL_UNAVAILABLE"
    || error.message === "Owned runtime reference generation changed.");
  await activity.withMaintenance(async () => {});
  await assert.rejects(manager.withPluginArtifactReferences(async () => {}));
});

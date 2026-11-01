import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { lstat, mkdir, mkdtemp, realpath, rm, writeFile, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ensurePluginPreviewConfig } from "../src/plugin-preview-runtime.mjs";
import { createSpsOwnerHostManager, resolveSpsOwnerHostRuntime } from "../src/owner-host.mjs";
import { createSpsDesktopPluginArtifactActivityGate } from "../src/plugin-artifact-activity-gate.mjs";
import { createSpsPluginArtifactObservation } from "../src/plugin-artifact-observation.mjs";
import { resolveDesktopDevelopmentNodeCommand } from "../src/development-mode.mjs";
import { saveRegistrySources } from "../src/registry-source-catalog.mjs";
import { readSpsDesktopPluginArtifactInputs } from "../src/desktop-artifact-inputs.mjs";
import { captureSpsDesktopSourceArtifactReferences } from "../src/desktop-source-artifact-references.mjs";
import { createSpsHostShareMutationCoordinator } from "../src/host-share-mutation.mjs";

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
  const nodeCommand = resolveDesktopDevelopmentNodeCommand({ packaged: false, command: process.execPath });
  const environment = Object.fromEntries(["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]
    .filter(key => typeof process.env[key] === "string").map(key => [key, process.env[key]]));
  const hostAccessToken = "sps-owned-artifact-channel-test-token";
  manager = createSpsOwnerHostManager({ url: preview.url, baseEnvironment: environment,
    artifactReferences: true, onArtifactUncertainty: () => activity.retainUncertainty(), startupAttempts: 150,
    resolveRuntime: () => resolveSpsOwnerHostRuntime({ coreRoots: [coreRoot], configPath: preview.configPath,
      nodeCommand, instanceId: "sps-preview-artifact-test", environment: {
        PAPERCLIP_HOME: preview.previewVault, PAPERCLIP_TELEMETRY_DISABLED: "1", PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
        SPS_CORE_BASELINE_MODE: "true", SPS_BASIC_MODE: "true", SPS_BUNDLED_PLUGIN_PATHS: "", PAPERCLIP_BUNDLED_PLUGIN_PATHS: "",
        SPS_DESKTOP_ACCESS_TOKEN: hostAccessToken,
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
      nodeCommand, instanceId: "sps-preview-artifact-second", environment: {
        PAPERCLIP_HOME: second.previewVault, PAPERCLIP_TELEMETRY_DISABLED: "1", PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
        SPS_CORE_BASELINE_MODE: "true", SPS_BASIC_MODE: "true", SPS_BUNDLED_PLUGIN_PATHS: "", PAPERCLIP_BUNDLED_PLUGIN_PATHS: "",
      } }),
  });
  assert.equal((await previewManager.start()).state, "running");
  const registryPath = path.join(root, "local-registry");
  await mkdir(registryPath);
  const sourcePath = path.join(root, "host-source");
  await mkdir(sourcePath);
  const sourceMarker = path.join(sourcePath, "project-sentinel.txt");
  await writeFile(sourceMarker, "preserve-project-data");
  const hostUrl = new URL(preview.url);
  assert.equal(hostUrl.protocol, "http:");
  assert.equal(hostUrl.hostname, "127.0.0.1");
  assert.equal(hostUrl.origin, preview.url);
  async function hostRequest(method, requestPath, body) {
    const url = new URL(requestPath, preview.url);
    assert.equal(url.origin, preview.url, "Host requests must stay on the exact owned loopback URL.");
    const response = await fetch(url, {
      method,
      headers: {
        "x-sps-desktop-access": hostAccessToken,
        "x-sps-desktop-owner-bootstrap": hostAccessToken,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    return { response, body: await response.json() };
  }
  const workspaceResponse = await hostRequest("POST", "/api/companies", { name: "Owned artifact Source test" });
  assert.equal(workspaceResponse.response.status, 201, JSON.stringify(workspaceResponse.body));
  const workspaceId = workspaceResponse.body.id;
  assert.match(workspaceId, /^[0-9a-f-]{36}$/i);
  const sourceResponse = await hostRequest("POST", `/api/companies/${workspaceId}/sps-workspace-sources`, {
    displayName: "Owned artifact Source",
  });
  assert.equal(sourceResponse.response.status, 201, JSON.stringify(sourceResponse.body));
  const source = sourceResponse.body;
  const sourceName = source.displayName;
  const sourceState = {
    profile: {
      connectionKind: "owner-host",
      hubUrl: preview.url,
      companyId: workspaceId,
      workspaceSources: [{ id: source.id, name: sourceName, sourcePath }],
    },
    accountConnections: { saved: { projectWorkspaces: { project: sourcePath } } },
    encryptedShareState: null,
  };
  const shares = createSpsHostShareMutationCoordinator({ withArtifactActivity: activity.withActivity });
  await saveRegistrySources({ vaultRoot: root, sources: [{
    id: "io.sps.artifact-test", kind: "local", displayName: "Artifact test", localPath: registryPath,
  }] });
  const observation = createSpsPluginArtifactObservation({ activity, capture: () => ({
    includeSourceInventory: true,
    requireSourceReconciliation: true,
    assertCurrent() {}, async readInputs() {
      return readSpsDesktopPluginArtifactInputs({ vaultRoot: root, preview: second, assertCurrent() {},
        readSourceReferences: () => captureSpsDesktopSourceArtifactReferences({ readState: () => sourceState,
          hostOrigin: preview.url,
          readShareState: () => assert.fail("The isolated source has no encrypted share credentials.") }),
        runtimeOwners: [{ kind: "core", manager }, { kind: "core", manager: previewManager }] });
    },
    participants: [{ id: "host", manager }, { id: "preview", manager: previewManager }],
  }) });
  let oldScope;
  const result = await observation.withSnapshot(async scope => {
    oldScope = scope;
    assert.equal(scope.coverage, "desktop-and-owned-cores");
    assert.deepEqual(scope.sourceReconciliation, { sourceCount: 1, grantCount: 0,
      fingerprint: scope.sourceInventories[0].inventory.fingerprint });
    assert.deepEqual(scope.sourceInventories.map(row => row.processOwner), ["host", "preview"]);
    const [hostInventory, previewInventory] = scope.sourceInventories.map(row => row.inventory);
    assert.equal(hostInventory.sources.length, 1);
    assert.equal(hostInventory.sources[0].id, source.id);
    assert.equal(hostInventory.sources[0].workspaceId, workspaceId);
    assert.equal(hostInventory.sources[0].status, "active");
    assert.equal(hostInventory.sources[0].routeFingerprint, null);
    assert.deepEqual(hostInventory.grants, []);
    assert.deepEqual(previewInventory.sources, []);
    assert.deepEqual(previewInventory.grants, []);
    for (const inventory of [hostInventory, previewInventory]) {
      assert.match(inventory.fingerprint, /^[a-f0-9]{64}$/);
      assert.equal(Object.isFrozen(inventory), true);
    }
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
      && reference.path === nodeCommand && reference.kind === "file"));
    assert.ok(scope.references.some(reference => reference.source === "desktop-runtime-config"
      && reference.path === second.config.database.embeddedPostgresDataDir && reference.kind === "directory"));
    assert.ok(scope.references.some(reference => reference.source === "desktop-preview-data"
      && reference.path === second.accessTokenPath && reference.kind === "file"));
    assert.ok(scope.references.some(reference => reference.source === "desktop-source"
      && reference.path === sourcePath && reference.kind === "directory" && reference.processOwner === "desktop"));
    await assert.rejects(shares.run(() => {}, async () => assert.fail("Source changes must not enter during observation.")), /maintenance/);
    await assert.rejects(manager.withPluginArtifactReferences(async () => assert.fail("Host scope must remain held.")));
    await assert.rejects(previewManager.withPluginArtifactReferences(async () => assert.fail("Preview scope must remain held.")));
    const blockedSource = await hostRequest("POST", `/api/companies/${workspaceId}/sps-workspace-sources`, {
      displayName: "Must be blocked during artifact observation",
    });
    assert.equal(blockedSource.response.status, 409, JSON.stringify(blockedSource.body));
    assert.equal(blockedSource.body.details?.code, "SPS_PLUGIN_ARTIFACT_MAINTENANCE_BUSY");
    const listedSources = await hostRequest("GET", `/api/companies/${workspaceId}/sps-workspace-sources`);
    assert.equal(listedSources.response.status, 200, JSON.stringify(listedSources.body));
    assert.deepEqual(listedSources.body.sources.map(row => row.id), [source.id]);
    await scope.assertCurrent();
    assert.throws(() => activity.withActivity(async () => {}), /maintenance/);
    return "main-work-complete";
  });
  assert.equal(result, "main-work-complete");
  const renamedSource = await hostRequest("PATCH", `/api/companies/${workspaceId}/sps-workspace-sources/${source.id}`, {
    displayName: "Owned artifact Source after observation",
  });
  assert.equal(renamedSource.response.status, 200, JSON.stringify(renamedSource.body));
  assert.equal(renamedSource.body.displayName, "Owned artifact Source after observation");
  assert.equal(await readFile(sourceMarker, "utf8"), "preserve-project-data");
  await assert.rejects(observation.withSnapshot(async scope => {
    sourceState.accountConnections.saved.projectWorkspaces.project = path.join(root, "replacement-source");
    await scope.assertCurrent();
    assert.fail("Changed Source metadata must invalidate the held result.");
  }), /Desktop Source references are unavailable or changed/);
  sourceState.accountConnections.saved.projectWorkspaces.project = sourcePath;
  assert.equal(await readFile(sourceMarker, "utf8"), "preserve-project-data");
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
    || error.message === "Desktop artifact inputs are incomplete or changed; preserve all package files.");
  await activity.withMaintenance(async () => {});
  await assert.rejects(manager.withPluginArtifactReferences(async () => {}));
});

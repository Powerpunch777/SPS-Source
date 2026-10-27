import assert from "node:assert/strict";
import { constants, createHash, createPublicKey, publicEncrypt, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { fork, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";

const withWindow = process.argv[3] === "--with-native-window";
const withHostRenewal = process.argv[3] === "--with-native-host-renewal";
const withNativePlugin = process.argv[3] === "--with-native-plugin";
const withNativeNode = process.argv[3] === "--with-native-node";
const withNativePluginNode = process.argv[3] === "--with-native-plugin-node";
const withNativePluginSource = process.argv[3] === "--with-native-plugin-source";
const withNativeNodeIntegration = withNativeNode || withNativePluginNode || withNativePluginSource;
const withRenewal = process.argv[3] === "--with-native-renewal" || withHostRenewal;
const withNativeWindow = withWindow || withRenewal || withNativePlugin;
if (![3, 4].includes(process.argv.length) || process.argv[2] !== "--isolated-native-workspace-channel"
  || process.argv.length === 4 && (!withNativeWindow && !withNativeNodeIntegration || withNativeWindow && process.platform !== "win32")) {
  throw new Error("Use the explicit isolated Native Workspace channel command.");
}
const { createSpsNativeHostIdentity } = await import("../src/native-identity-certificates.mjs");
const { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } = await import("../src/native-member-certificates.mjs");
const { createSpsNativeHostIngress } = await import("../src/native-host-ingress.mjs");
const { attachSpsNativeWorkspaceParentChannel } = await import("../src/native-workspace-parent-channel.mjs");
const { createSpsNativeMemberMainSigner } = await import("../src/native-member-main-signer.mjs");
const { createSpsNativeMemberController } = await import("../src/native-member-controller.mjs");
const { createSpsNativeNodeController } = await import("../src/native-node-controller.mjs");
const { createSpsNativeMemberWorkspaceClient } = await import("../src/native-enrollment-client.mjs");
const { normalizeSpsNativeMemberKeyIndex } = await import("../src/native-member-key-index.mjs");
const { normalizeSpsNativeNodeState } = await import("../src/native-node-state.mjs");
const { attachSpsNativeMemberSignerChannel } = await import("../src/native-member-signer-channel.mjs");
const { createSpsNativeParentIngressClient } = await import("../src/native-parent-ingress-client.mjs");
const { parseSpsNativeEnrollmentResponse } = await import("../src/native-enrollment-response.mjs");
const core = path.resolve(import.meta.dirname, "../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
const { createDb, getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase,
  authUsers, authSessions, companies, companyMemberships, agents, plugins, spsNodes, spsMemberDevices,
  spsNodeRunnerProfiles, spsNodeAgentGrants, spsNodeAgentRunnerGrants, spsAgentNodeBindings, spsNodeCommands, spsNodeCommandEvents,
  spsPluginExecutionGrants, spsPluginNodeRuns, spsPluginNodeRunEvents,
  spsWorkspaceSources, spsWorkspaceSourceNodeGrants,
  spsPluginInboxItems, spsPluginInboxUserStates, spsMemberDeviceRenewalCertificates, pluginState, pluginCompanySettings,
  spsNativePairings, spsNativePairingEvents, spsNativeEnrollments } = await load("packages/db/src/index.ts");
const { spsMemberDeviceService } = await load("server/src/services/sps-member-devices.ts");
assert.equal((await getEmbeddedPostgresTestSupport()).supported, true);
const database = await startEmbeddedPostgresTestDatabase("sps-native-workspace-channel-");
let db, child, parent, ingress, signerChannel, parentIngress, failure, childShutdownStage = "not-started";
let applyHostRenewal, nativePluginSourceExpected = null;
let pluginFixture, pluginConfiguration;

async function runWindow(configuration) {
  const fixture = await createWorkspaceE2eFixture();
  let electron, mainClosed = false;
  try {
    const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE;
    electron = spawn(path.resolve(import.meta.dirname, "../node_modules/electron/dist/electron.exe"),
      [path.resolve(import.meta.dirname, "fixtures/native-workspace-window-child.mjs"),
        "--isolated-native-workspace-transport-window", fixture.directory], {
        windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"], env: environment,
      });
    electron.stdout.setEncoding("utf8");
    let output = "";
    electron.stdout.on("data", chunk => {
      output = `${output}${chunk}`.slice(-2048);
      const lines = output.split("\n"); output = lines.pop();
      for (const line of lines) if (/^native_window_stage:[a-z_]+$/.test(line.trim())) process.stdout.write(`${line.trim()}\n`);
    });
    electron.stderr.resume();
    electron.on("message", message => {
      if (message?.kind === "sps.test.native-workspace-window.configure-ready" && electron.connected) {
        electron.send({ kind: "sps.test.native-workspace-window.configure", ...configuration });
      }
      if (withHostRenewal && message?.kind === "sps.test.native-host-renewal.publish" && electron.connected) {
        void applyHostRenewal(message).then(() => {
          if (electron.connected) electron.send({ kind: "sps.test.native-host-renewal.ready" });
        }, () => {
          if (electron.connected) electron.send({ kind: "sps.test.native-host-renewal.failed" });
        });
      }
      if (withNativePlugin && message?.kind === "sps.test.native-plugin.deactivate" && electron.connected) {
        void db.insert(pluginCompanySettings).values({ pluginId: pluginConfiguration.pluginId,
          companyId: configuration.workspaceId, enabled: false, settingsJson: {} }).then(() => {
          if (electron.connected) electron.send({ kind: "sps.test.native-plugin.deactivated" });
        }, () => { if (electron.connected) electron.send({ kind: "sps.test.native-plugin.deactivation-failed" }); });
      }
    });
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Joined Native Workspace window timed out.")), 180_000);
      electron.once("error", error => { clearTimeout(timer); reject(error); });
      electron.once("close", code => { clearTimeout(timer); mainClosed = true; resolve(code); });
    });
    const result = JSON.parse(await readFile(path.join(fixture.directory, "result.json"), "utf8"));
    assert.equal(code, 0, `Joined Native Workspace window failed at ${result.stage ?? "unknown"}.`);
    assert.deepEqual(result, { ok: true, views: ["workspace", "dashboard", "inbox"],
      actualElectron: true, fixtureBackend: false, actualDpapi: true, wrongPeerDenied: true,
      ...(withNativePlugin ? { pluginUi: true, pluginAction: true, pluginIsolated: true, pluginDeactivationDenied: true } : {}),
      ...(withRenewal ? { renewalReplay: true, renewalPublished: true, originalIssuedBytesPreserved: true,
        renewedEnrollmentReconciled: true } : {}),
      ...(withHostRenewal ? { hostRenewalPublished: true, originalHostBytesPreserved: true,
        targetCertificateRefreshed: true, originalTargetBytesPreserved: true } : {}),
      ownerBridge: false, serviceWorkers: 0 });
  } finally {
    if (electron && !mainClosed && electron.exitCode === null && electron.signalCode === null) {
      const closed = new Promise(resolve => electron.once("close", () => { mainClosed = true; resolve(); }));
      electron.kill(); let timer;
      try { await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 10_000); })]); }
      finally { clearTimeout(timer); }
    }
    if (!electron || mainClosed) await fixture.remove();
  }
}
try {
  db = createDb(database.connectionString);
  const now = Math.floor(Date.now() / 1000) * 1000;
  const hostId = randomUUID(), companyId = randomUUID(), userId = randomUUID();
  let host = await createSpsNativeHostIdentity({ hostId, hostnames: ["127.0.0.1"],
    notBefore: now - (withRenewal ? 80 : 0) * 86_400_000,
    notAfter: now + (withRenewal ? 10 : 1 / 24) * 86_400_000,
    issuerNotAfter: now + (withRenewal ? 285 : 2 / 24) * 86_400_000 });
  const key = await createSpsNativeMemberKeyRequest({ hostId, deviceKeyId: randomUUID() });
  const issued = await issueSpsNativeMemberCertificate({ hostIdentity: host,
    request: { v: 1, kind: "sps.native.member-enrollment-request", hostId, deviceKeyId: key.deviceKeyId, requestPem: key.requestPem },
    now, notBefore: now - (withRenewal ? 70 : 0) * 86_400_000,
    notAfter: now + (withRenewal ? 20 : 1 / 24) * 86_400_000 });
  const pin = pem => createHash("sha256").update(new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" })).digest("hex");
  const binding = { hostId, serverSpkiSha256: pin(host.server.certificatePem), issuerSpkiSha256: pin(host.memberIssuer.certificatePem) };
  const secret = randomBytes(48).toString("base64url"), cookie = `sps_identity_session=${secret}`;
  const at = new Date();
  await db.insert(authUsers).values({ id: userId, name: "Workspace Member", email: `${userId}@example.test`,
    emailVerified: true, createdAt: at, updatedAt: at });
  await db.insert(authSessions).values({ id: `sps_identity_${randomUUID()}`, userId,
    token: createHash("sha256").update(secret).digest("base64url"), expiresAt: new Date(now + 3_600_000),
    createdAt: at, updatedAt: at, ipAddress: null, userAgent: null });
  const issuePrefix = `N${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  await db.insert(companies).values({ id: companyId, name: "Native Channel Fixture", issuePrefix });
  await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: userId,
    status: "active", membershipRole: "member" });
  if (withNativePlugin) {
    pluginFixture = await createWorkspaceE2eFixture();
    const packageRoot = pluginFixture.directory, pluginId = randomUUID();
    await mkdir(path.join(packageRoot, "dist", "ui"), { recursive: true });
    await writeFile(path.join(packageRoot, "dist", "ui", "index.js"), "export { NativeCount } from './counter-view.js';\n");
    await writeFile(path.join(packageRoot, "dist", "ui", "counter-view.js"), `
import { createElement as h } from 'react';
import { usePluginAction } from '@sonparkserver/plugin-sdk/ui/bridge';
export function NativeCount({data, refresh}) {
  const increment = usePluginAction('fixture.increment');
  return h('section', null, h('p', null, 'Native plugin count: ' + (data?.count ?? 0)),
    h('button', {onClick: async () => { await increment({}); refresh(); }}, 'Increment Native count'));
}
`);
    await writeFile(path.join(packageRoot, "dist", "ui", "index.css"), "section { padding: 12px; } section::before { content: ''; display: block; width: 8px; height: 8px; background-image: url('./dot.svg'); }");
    await writeFile(path.join(packageRoot, "dist", "ui", "dot.svg"), '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="green"/></svg>');
    const manifest = { id: "sps.native-ui-fixture", apiVersion: 1, version: "1.0.0", displayName: "Native Plugin fixture",
      description: "Owned isolated Native UI acceptance", author: "SPS", categories: ["ui"],
      capabilities: ["ui.dashboard.contribute", "plugin.state.read", "plugin.state.write"],
      entrypoints: { worker: "worker.cjs", ui: "dist/ui" }, ui: { dashboardWidgets: [{
        id: "native-count", displayName: "Native count", exportName: "NativeCount", sizes: ["medium"],
        defaultSize: "medium", defaultOrder: 0, dataAction: "fixture.count",
      }] } };
    await db.insert(plugins).values({ id: pluginId, pluginKey: manifest.id, packageName: "@sps/native-ui-fixture",
      packagePath: packageRoot, version: manifest.version, apiVersion: 1, categories: manifest.categories,
      manifestJson: manifest, status: "ready" });
    pluginConfiguration = { pluginId, manifest, packageRoot };
  }
  const devices = spsMemberDeviceService(db, hostId);
  const device = await devices.request({ companyId, userId, displayName: "Native Member", certificate:
    new X509Certificate(issued.certificatePem).raw.toString("base64url") });
  await devices.approve(device.id, "fixture-host");
  const baseDevice = (await db.select().from(spsMemberDevices)).find(row => row.id === device.id);
  const enrollmentId = randomUUID();
  const historicalExpiry = new Date(now - 60_000);
  if (withRenewal) {
    const pairingId = randomUUID();
    const createdAt = new Date(now - 5 * 60_000), issuedAt = new Date(now - 3 * 60_000);
    const consumedAt = new Date(now - 2 * 60_000);
    const pairing = { id: pairingId, hostId, serverSpkiSha256: binding.serverSpkiSha256,
      issuedByUserId: "fixture-host", secretSha256: createHash("sha256").update(randomBytes(32)).digest("hex"),
      targetEmailSha256: null, status: "consumed", failedAttempts: 0, maxAttempts: 5,
      createdAt, expiresAt: historicalExpiry, consumedAt, consumedByUserId: userId,
      consumedDeviceId: device.id, consumedDeviceSnapshotId: device.id, revokedAt: null, revokedByUserId: null };
    await db.insert(spsNativePairings).values(pairing);
    await db.insert(spsNativePairingEvents).values([
      { hostId, pairingId, pairingSnapshotId: pairingId, actorUserId: "fixture-host", action: "created",
        deviceSnapshotId: null, createdAt },
      { hostId, pairingId, pairingSnapshotId: pairingId, actorUserId: userId, action: "consumed",
        deviceSnapshotId: device.id, createdAt: consumedAt },
    ]);
    await db.insert(spsNativeEnrollments).values({
      id: enrollmentId, pairingId, hostId, serverSpkiSha256: binding.serverSpkiSha256,
      issuerSpkiSha256: binding.issuerSpkiSha256, userId, deviceKeyId: key.deviceKeyId,
      requestSha256: createHash("sha256").update(key.requestPem).digest("hex"), status: "issued",
      certificate: new X509Certificate(issued.certificatePem).raw.toString("base64url"),
      certificateSha256: device.certificateSha256, createdAt: issuedAt, expiresAt: historicalExpiry, issuedAt,
      failedAt: null,
    });
  }

  child = fork(new URL("./fixtures/native-workspace-channel-child.mjs", import.meta.url),
    ["--isolated-native-workspace-channel-child"], { stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    for (const match of String(chunk).matchAll(/native_child_stop:(started|ingress|enrollment|workspace|database|disconnected)/g)) {
      childShutdownStage = match[1];
    }
  });
  child.stderr.resume();
  parent = attachSpsNativeWorkspaceParentChannel(child, { isCurrent: () => child.connected && child.exitCode === null,
    inspectBinding: async () => ({ ...binding, issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url") }) });
  if (withRenewal) {
    const current = () => child.connected && child.exitCode === null;
    const signer = createSpsNativeMemberMainSigner({
      getAuthority: () => ({ ownerSubject: "fixture-host", userDataDirectory: "isolated-memory-profile",
        vaultDirectory: "isolated-memory-vault", generation: 1n }),
      authenticateHost: async () => {}, getStore: () => ({ read: async () => host }),
    });
    signerChannel = attachSpsNativeMemberSignerChannel(child, signer, { isCurrent: current });
    parentIngress = createSpsNativeParentIngressClient(child, { isCurrent: current });
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Isolated Native Workspace child readiness timed out.")), withNativePlugin || withNativeNodeIntegration ? 90_000 : 45_000);
    const onFailure = () => finish(new Error("Isolated Native Workspace child failed."));
    const onMessage = message => {
      if (message?.kind === "sps.test.native-workspace.configure-ready") child.send({ kind: "sps.test.native-workspace.configure", binding,
        connectionString: database.connectionString, identityIssuer: "https://workspace.example.test", renewal: withRenewal,
        ...(withNativePlugin ? { nativePlugin: pluginConfiguration } : {}), ...(withNativeNodeIntegration ? { nativeNode: true } : {}) }, error => { if (error) onFailure(); });
      else if (message?.kind === "sps.test.native-workspace.ready") finish();
      else if (message?.kind === "sps.test.native-workspace.failure") onFailure();
    };
    function finish(error) {
      clearTimeout(timer); child.removeListener("message", onMessage); child.removeListener("error", onFailure); child.removeListener("exit", onFailure);
      if (error) reject(error); else resolve();
    }
    child.on("message", onMessage); child.once("error", onFailure); child.once("exit", onFailure);
  });
  assert.equal(parent.inspect().ready, true);
  assert.equal(Object.hasOwn(parent.inspect(), "port"), false);
  let serverCertificates = [host.server.certificatePem];
  const ingressDependencies = { getIdentity: () => host, getServerCertificates: () => serverCertificates,
    assertCurrent() { assert.equal(child.connected, true); },
    async dispatch(operation, input, options) {
      // Only the Identity-provider exchange is substituted. The returned token
      // is a real existing Core DB session and grants no device or membership.
      if (operation === "session.exchange") {
        assert.equal(withNativeWindow || withNativeNodeIntegration, true);
        assert.equal(input.credential.accessToken, "fixture.header.signature");
        return { token: secret, expiresInSeconds: 604800 };
      }
      assert.equal(withRenewal, true);
      return await parentIngress.dispatch(operation, input, options);
    },
    dispatchWorkspace: (input, options) => parent.read(input, options) };
  ingress = createSpsNativeHostIngress(ingressDependencies);
  const { port } = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  applyHostRenewal = async message => {
    assert.equal(message.identity.hostId, host.hostId);
    assert.equal(message.identity.server.privateKeyPem, host.server.privateKeyPem);
    assert.deepEqual(message.identity.memberIssuer, host.memberIssuer);
    assert.deepEqual(message.certificates, [host.server.certificatePem, message.identity.server.certificatePem]);
    await ingress.dispose();
    host = message.identity; serverCertificates = message.certificates;
    ingress = createSpsNativeHostIngress(ingressDependencies);
    await ingress.start({ bindAddress: "127.0.0.1", port });
  };
  const read = (target, options = {}) => new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: "127.0.0.1", port, path: target, method: "GET", agent: false,
      ca: host.server.certificatePem, cert: options.noCertificate ? undefined : issued.certificatePem,
      key: options.noCertificate ? undefined : key.privateKeyPem, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
      headers: { Connection: "close", "Content-Length": "0", Cookie: options.cookie ?? cookie } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        try {
          const bytes = Buffer.concat(chunks);
          const body = target.endsWith("/workspace-bootstrap") && response.statusCode === 200
            ? parseSpsNativeEnrollmentResponse("workspaceBootstrap", {
              statusCode: response.statusCode, rawHeaders: response.rawHeaders, body: bytes,
            }) : JSON.parse(bytes.toString());
          resolve({ status: response.statusCode, body });
        } catch (error) { reject(error); }
      });
    });
    request.once("error", reject); request.end();
  });
  const root = `/api/companies/${companyId}`;
  assert.deepEqual(await read(`${root}/workspace-bootstrap`), { status: 200, body: {
    v: 1, kind: "sps.native.workspace.bootstrap", workspace: { id: companyId, name: "Native Channel Fixture", issuePrefix },
    member: { userId }, capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read", "workspace.inbox.state.write"],
  } });
  const discovery = "/sps-native/v1/workspaces";
  assert.deepEqual(await read(discovery), { status: 200, body: [{ id: companyId, name: "Native Channel Fixture" }] });
  assert.notEqual((await read(discovery, { noCertificate: true })).status, 200);
  assert.equal((await read(discovery, { cookie: `sps_identity_session=${"x".repeat(64)}` })).status, 403);
  assert.equal((await read(`${discovery}?all=true`)).status, 404);
  assert.deepEqual(await read(`${root}/workspace-shell/providers`), { status: 200, body: [] });
  assert.equal((await read(`${root}/workspace-shell`)).body.mode, "neutral");
  if (withNativePlugin) assert.equal((await read(`${root}/workspace-dashboard`)).body.widgets.length, 1);
  else assert.deepEqual(await read(`${root}/workspace-dashboard`), { status: 200, body: { widgets: [] } });
  assert.deepEqual(await read(`${root}/workspace-inbox?archived=true`), { status: 200, body: { items: [] } });
  assert.notEqual((await read(`${root}/workspace-shell`, { noCertificate: true })).status, 200);
  assert.equal((await read(`${root}/workspace-shell`, { cookie: `sps_identity_session=${"x".repeat(64)}` })).status, 403);
  assert.equal((await read(`/api/companies/${randomUUID()}/workspace-shell`)).status, 403);
  assert.equal((await read("/api/companies")).status, 404);
  if (withNativeNodeIntegration) {
    let nativeNodeStage = "setup";
    const sourceExpectations = new Map(), sourceRouteEvidence = [];
    let sourceMappingCloseCount = 0;
    let sourceA, sourceB, sourceAPath, sourceBPath, changedSourceAPath, pluginExecutionService;
    const nativeNodeWorkspaceFixture = await createWorkspaceE2eFixture();
    const pluginKey = "sps.native-node-acceptance";
    const pluginManifest = { id: pluginKey, apiVersion: 1, version: "1.0.0", displayName: "Native Node acceptance",
      description: "Isolated workflow-neutral plugin execution fixture", author: "SPS acceptance fixture", categories: ["automation"],
      capabilities: ["sps.executionGrants.write", "sps.runs.dispatch", "sps.runs.read", "sps.runs.cancel"],
      entrypoints: { worker: "worker.cjs" },
      sps: { contractVersion: "2.0", primitives: ["runtimes.list", "runtimes.dispatch", "runs.observe", "runs.cancel"] } };
    if (withNativePluginNode || withNativePluginSource) {
      pluginFixture = await createWorkspaceE2eFixture();
      await writeFile(path.join(pluginFixture.directory, "worker.cjs"), "module.exports = {};\n");
      await writeFile(path.join(pluginFixture.directory, "manifest.json"), `${JSON.stringify(pluginManifest, null, 2)}\n`);
      await db.insert(plugins).values({ id: randomUUID(), pluginKey, packageName: "@sps/native-node-acceptance",
        packagePath: pluginFixture.directory, version: pluginManifest.version, apiVersion: 1,
        categories: pluginManifest.categories, manifestJson: pluginManifest, status: "ready" });
    }
    const context = { identityIssuer: "https://workspace.example.test", subject: "fixture-member", hostId,
      deviceKeyId: key.deviceKeyId, serverSpkiSha256: binding.serverSpkiSha256, issuerSpkiSha256: binding.issuerSpkiSha256 };
    const target = { v: 1, kind: "sps.native.member-host-target", context,
      origin: `https://127.0.0.1:${port}`, serverCertificatePem: host.server.certificatePem };
    const issuance = { enrollmentId, certificate: new X509Certificate(issued.certificatePem).raw.toString("base64url"),
      issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url"),
      expiresAt: new Date(now + 3_600_000).toISOString() };
    const getAuthority = () => ({ identityIssuer: context.identityIssuer, subject: context.subject,
      userDataDirectory: "isolated-native-node-profile", vaultDirectory: "isolated-native-node-vault", generation: 1n });
    const { executeSpsNodeCommand, cancelSpsNodeCommand } = await import("../../desktop-node/src/command-runner.mjs");
    const { decryptSpsWorkspaceSourceCredential } = await import("../../desktop-node/src/host-project-share.mjs");
    let nodeState = { v: 1, entries: [] };
    const memberNode = createSpsNativeNodeController({ getAuthority, getState: () => nodeState,
      saveState: async (value, { beforeCommit } = {}) => { beforeCommit?.(); nodeState = value; },
      encrypt: value => Buffer.from(value).toString("base64"),
      decrypt: value => Buffer.from(value, "base64").toString(), confirm: async () => true,
      pollMs: 250, appVersion: "0.4.137",
      scanCapabilities: async () => [{ kind: "agy_cli", label: "Isolated canary runtime" }],
      scanRunners: async () => [{ runnerKey: "native-canary", kind: "agy_cli", label: "Native canary",
        credentialStatus: "unknown", availability: { status: "available", source: "node_probe", observedAt: new Date().toISOString() } }],
      getMember: () => ({
        async recover() {
          nativeNodeStage = "recover-approved-device";
          const current = await db.select().from(spsMemberDevices);
          const storedDevice = current.find(row => row.id === device.id);
          const result = { deviceId: device.id, status: storedDevice?.status === "approved" ? "approved" : "revoked" };
          nativeNodeStage = `recover-${result.status}`;
          return result;
        },
        async invokeNode(input, options = {}) {
          const current = () => { if (options.signal?.aborted) throw new Error("Native Node scenario cancelled."); };
          const client = createSpsNativeMemberWorkspaceClient({ target, context, timeoutMs: 30_000, assertCurrent: current });
          try {
            nativeNodeStage = "tls-session-exchange";
            await client.exchange("fixture.header.signature", options.signal ? { signal: options.signal } : {});
            nativeNodeStage = "tls-node-runtime-request";
            let result;
            try {
              result = await client.invokeNode({ workspaceId: input.workspaceId, request: input.request,
                keyRequest: key, issuance }, options.signal ? { signal: options.signal } : {});
            } catch (error) {
              const code = typeof error?.code === "string" && /^native_enrollment_client_[a-z_]+$/.test(error.code)
                ? error.code : "unclassified";
              console.error(`native_node_transport_error:${code}`);
              throw error;
            }
            nativeNodeStage = "tls-node-runtime-response";
            return { data: result.data, origin: target.origin };
          } finally { client.dispose(); }
        },
      }),
      execute: options => executeSpsNodeCommand({ ...options,
        resolveInvocation: async (_command, args) => ({ executable: process.execPath,
          args: ["-e", args?.includes("--hold")
            ? `process.stderr.write('${withNativePluginSource ? "SPS_PLUGIN_SOURCE_HOLD_STARTED" : "SPS_PLUGIN_NODE_HOLD_STARTED"}\\n'); setInterval(() => {}, 1000)`
            : `process.stdout.write('${withNativePluginNode ? "SPS_PLUGIN_NODE_CANARY_OK" : withNativePluginSource ? "SPS_PLUGIN_SOURCE_CANARY_OK" : "SPS_NATIVE_NODE_CANARY_OK"}\\n'); process.stderr.write('canary-stderr\\n')`] }),
        resolveWorkspace: async () => {
          assert.equal(withNativePluginSource, false, "A Source-backed run must use the opened fixture mapping.");
          return nativeNodeWorkspaceFixture.directory;
        },
        openWorkspaceSourceRoute: async (descriptor, transportPrivateKeyPem, openOptions) => {
          if (!withNativePluginSource) { assert.equal(descriptor, null); return null; }
          nativeNodeStage = "source-route-validate-and-decrypt";
          assert.ok(descriptor, "A Source-backed run must claim its signed Core route.");
          const expected = sourceExpectations.get(descriptor.sourceId);
          assert.ok(expected, "Core returned an unregistered fixture Source route.");
          assert.equal(descriptor.kind, "sps_workspace_source");
          assert.equal(descriptor.sharePath, expected.sharePath);
          assert.equal(openOptions.expectedSharePath, expected.sharePath);
          const credential = decryptSpsWorkspaceSourceCredential(descriptor, transportPrivateKeyPem,
            openOptions.expectedSharePath);
          assert.ok(credential.sharePath === expected.credential.sharePath
            && credential.username === expected.credential.username
            && credential.password === expected.credential.password, "Decrypted Source credential mismatch.");
          sourceRouteEvidence.push({ sourceId: descriptor.sourceId, sharePath: descriptor.sharePath,
            expectedSharePath: openOptions.expectedSharePath });
          nativeNodeStage = "source-route-open-fixture-mapping";
          let closed = false, closing;
          return Object.freeze({ sharePath: credential.sharePath, workspacePath: nativeNodeWorkspaceFixture.directory,
            close() {
              if (!closing) closing = Promise.resolve().then(() => {
                if (!closed) { closed = true; sourceMappingCloseCount += 1; }
              });
              return closing;
            } });
        },
      }),
      cancelCommand: (commandId, ownership) => cancelSpsNodeCommand(commandId,
        "Isolated Native Node acceptance is cleaning up its owned command.", { ownership }),
    });
    try {
      nativeNodeStage = "controller-connect";
      const connected = await memberNode.connect({ hostId, workspaceId: companyId });
      nativeNodeStage = "registered-and-heartbeated";
      assert.equal(connected.state, "pending");
      const nativeNode = (await db.select().from(spsNodes)).find(row => row.id === connected.nodeId);
      assert.ok(nativeNode);
      const agentId = randomUUID(), runner = (await db.select().from(spsNodeRunnerProfiles))
        .find(row => row.nodeId === nativeNode.id && row.runnerKey === "native-canary");
      assert.ok(runner);
      let commandId;
      let primaryPluginRunId, primaryPluginGrantId;
      if (withNativePluginNode) {
        const subjectKey = "acceptance:successful-canary";
        primaryPluginGrantId = randomUUID(); primaryPluginRunId = randomUUID();
        await db.insert(spsPluginExecutionGrants).values({ id: primaryPluginGrantId, companyId, pluginKey, subjectKey,
          nodeId: nativeNode.id, runnerProfileId: runner.id, workspaceSourceId: null, status: "active", revokedAt: null });
        await db.insert(spsPluginNodeRuns).values({ id: primaryPluginRunId, companyId, pluginKey, subjectKey,
          executionGrantId: primaryPluginGrantId, nodeId: nativeNode.id, runnerProfileId: runner.id,
          workspaceSourceId: null, command: "agy", args: ["--success"], env: {}, timeoutMs: 30_000, status: "queued" });
      } else if (withNativePluginSource) {
        sourceAPath = "\\\\sps-fixture.invalid\\NativeSourceA";
        sourceBPath = "\\\\sps-fixture.invalid\\NativeSourceB";
        changedSourceAPath = "\\\\sps-fixture.invalid\\NativeSourceAChanged";
        sourceA = await db.insert(spsWorkspaceSources).values({ companyId, displayName: "Native Source A",
          sharePath: sourceAPath, status: "active", createdByUserId: userId }).returning().then(rows => rows[0]);
        sourceB = await db.insert(spsWorkspaceSources).values({ companyId, displayName: "Native Source B",
          sharePath: sourceBPath, status: "active", createdByUserId: userId }).returning().then(rows => rows[0]);
        nativePluginSourceExpected = { sourceAId: sourceA.id, sourceBId: sourceB.id,
          sourceAPath, sourceBPath, changedSourceAPath, heldRunId: null, siblingRunId: null };
        const { spsPluginExecutionService } = await load("server/src/services/sps-plugin-execution.ts");
        const { eq } = await import(pathToFileURL(path.join(core, "packages/db/node_modules/drizzle-orm/index.js")).href);
        pluginExecutionService = spsPluginExecutionService(db, pluginKey);
        await assert.rejects(pluginExecutionService.upsertExecutionGrant({ companyId, subjectKey: "acceptance:source-shared-subject",
          nodeId: nativeNode.id, runnerProfileId: runner.id, workspaceSourceId: sourceA.id }), /not approved/i);
        assert.deepEqual(await db.select().from(spsPluginExecutionGrants), []);
        assert.deepEqual(await db.select().from(spsPluginNodeRuns), []);
      } else {
        await db.insert(agents).values({ id: agentId, companyId, name: "Native canary Agent", adapterType: "sps_agy_local",
          adapterConfig: {}, runtimeConfig: {}, permissions: {}, status: "idle" });
        await db.insert(spsAgentNodeBindings).values({ companyId, agentId, nodeId: nativeNode.id, assignedByUserId: "fixture-host" });
        await db.insert(spsNodeAgentGrants).values({ companyId, nodeId: nativeNode.id, agentId, grantedByUserId: "fixture-host" });
        await db.insert(spsNodeAgentRunnerGrants).values({ companyId, nodeId: nativeNode.id, runnerProfileId: runner.id,
          agentId, grantedByUserId: "fixture-host" });
        commandId = randomUUID();
        await db.insert(spsNodeCommands).values({ id: commandId, companyId, nodeId: nativeNode.id, agentId,
          runnerProfileId: runner.id, command: "agy", args: [], env: {}, status: "queued",
          workspaceAccess: null, timeoutMs: 30_000, heartbeatRunId: null, projectId: null });
      }
      await new Promise(resolve => setTimeout(resolve, 750));
      if (withNativePluginNode) {
        const pendingRun = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === primaryPluginRunId);
        assert.equal(pendingRun?.status, "queued", "A pending Node must not claim a plugin run.");
      } else if (withNativePluginSource) {
        const pendingNode = (await db.select().from(spsNodes)).find(row => row.id === nativeNode.id);
        assert.equal(pendingNode?.status, "pending", "Source-backed Plugin grants require an Owner-approved Node.");
        assert.deepEqual(await db.select().from(spsPluginExecutionGrants), []);
        assert.deepEqual(await db.select().from(spsPluginNodeRuns), []);
      } else {
        const pendingCommand = (await db.select().from(spsNodeCommands)).find(row => row.id === commandId);
        assert.equal(pendingCommand?.status, "queued", "A pending Node must not claim its command.");
      }
      // These explicit fixture DB rows model the Owner-approved Node and its
      // Agent grants, or an installed Plugin's declared and persisted run grant.
      await db.update(spsNodes).set({ status: "active", approvedAt: new Date(), approvedByUserId: "fixture-owner" });
      if (withNativePluginNode) {
        nativeNodeStage = "plugin-run-claim-lease-events-complete";
        const deadline = Date.now() + 45_000;
        let completed;
        while (Date.now() < deadline) {
          completed = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === primaryPluginRunId);
          if (completed?.status === "succeeded" || completed?.status === "failed") break;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        assert.equal(completed?.status, "succeeded", `Native Plugin canary ended ${completed?.status ?? "without a result"}.`);
        assert.ok(completed.claimedAt instanceof Date && completed.startedAt instanceof Date && completed.finishedAt instanceof Date);
        assert.equal(completed.exitCode, 0);
        assert.equal(completed.pluginKey, pluginKey);
        assert.equal(completed.workspaceSourceId, null);
        const events = (await db.select().from(spsPluginNodeRunEvents)).filter(event => event.runId === primaryPluginRunId);
        assert.ok(events.some(event => event.stream === "stdout" && event.body?.includes("SPS_PLUGIN_NODE_CANARY_OK")));
        assert.ok(events.some(event => event.stream === "stderr" && event.body?.includes("canary-stderr")));

        const revokeSubject = "acceptance:revoked-canary";
        const revokeGrantId = randomUUID(), revokeRunId = randomUUID();
        await db.insert(spsPluginExecutionGrants).values({ id: revokeGrantId, companyId, pluginKey, subjectKey: revokeSubject,
          nodeId: nativeNode.id, runnerProfileId: runner.id, workspaceSourceId: null, status: "active", revokedAt: null });
        await db.insert(spsPluginNodeRuns).values({ id: revokeRunId, companyId, pluginKey, subjectKey: revokeSubject,
          executionGrantId: revokeGrantId, nodeId: nativeNode.id, runnerProfileId: runner.id,
          workspaceSourceId: null, command: "agy", args: ["--hold"], env: {}, timeoutMs: 30_000, status: "queued" });
        const heldDeadline = Date.now() + 30_000;
        let heldRun, heldEvents;
        while (Date.now() < heldDeadline) {
          heldRun = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === revokeRunId);
          heldEvents = (await db.select().from(spsPluginNodeRunEvents)).filter(event => event.runId === revokeRunId);
          if (heldRun?.status === "running" && heldEvents.some(event => event.body?.includes("SPS_PLUGIN_NODE_HOLD_STARTED"))) break;
          if (heldRun?.status === "failed") break;
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        assert.equal(heldRun?.status, "running", "The revocation scenario must start an owned canary process first.");
        assert.ok(heldEvents.some(event => event.body?.includes("SPS_PLUGIN_NODE_HOLD_STARTED")));
        nativeNodeStage = "plugin-run-revocation-cancels-owned-process";
        await db.update(spsPluginExecutionGrants).set({ status: "revoked", revokedAt: new Date() });
        const cancelledDeadline = Date.now() + 15_000;
        let revokedRun;
        while (Date.now() < cancelledDeadline) {
          revokedRun = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === revokeRunId);
          if (revokedRun?.status === "failed" || revokedRun?.status === "cancelled") break;
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        assert.equal(revokedRun?.status, "failed", `Revoked Plugin run ended ${revokedRun?.status ?? "without a result"}.`);
        assert.ok(revokedRun.finishedAt instanceof Date);
        assert.match(revokedRun.error ?? "", /revoked/i);
        const revokedEvents = (await db.select().from(spsPluginNodeRunEvents)).filter(event => event.runId === revokeRunId);
        assert.ok(revokedEvents.some(event => event.body?.includes("SPS_PLUGIN_NODE_HOLD_STARTED")));
        const storedGrants = await db.select().from(spsPluginExecutionGrants);
        assert.equal(storedGrants.length, 2);
        assert.ok(storedGrants.every(grant => grant.status === "revoked" && grant.revokedAt instanceof Date));
        console.log("native_plugin_node_acceptance:registered,zero-agents,pending-denied,approved,granted,claimed,leased,events,completed,revoked,cancelled");
      } else if (withNativePluginSource) {
        nativeNodeStage = "source-node-grants-and-signed-route";
        const { eq } = await import(pathToFileURL(path.join(core, "packages/db/node_modules/drizzle-orm/index.js")).href);
        const nodeIdentity = JSON.parse(Buffer.from(nodeState.entries[0].encryptedIdentity, "base64").toString("utf8")).identity;
        const publicKeyDigest = pem => createHash("sha256")
          .update(createPublicKey(pem).export({ type: "spki", format: "der" })).digest("hex");
        assert.equal(publicKeyDigest(nodeIdentity.transportPublicKeyPem), publicKeyDigest(nativeNode.transportPublicKey));
        const credentialFor = sharePath => ({ version: 1, sharePath, username: "fixture-node-user",
          password: randomBytes(24).toString("base64url") });
        const grantNodeSource = async source => {
          const credential = credentialFor(source.sharePath);
          const credentialEnvelope = publicEncrypt({ key: nodeIdentity.transportPublicKeyPem,
            padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
          Buffer.from(JSON.stringify(credential))).toString("base64");
          sourceExpectations.set(source.id, { sharePath: source.sharePath, credential });
          await db.insert(spsWorkspaceSourceNodeGrants).values({ companyId, sourceId: source.id, nodeId: nativeNode.id,
            credentialAlgorithm: "rsa-oaep-sha256", credentialEnvelope, grantedByUserId: userId, revokedAt: null });
        };
        await grantNodeSource(sourceA);
        await grantNodeSource(sourceB);
        const subjectKey = "acceptance:source-shared-subject";
        const grantA = await pluginExecutionService.upsertExecutionGrant({ companyId, subjectKey, nodeId: nativeNode.id,
          runnerProfileId: runner.id, workspaceSourceId: sourceA.id });
        const grantB = await pluginExecutionService.upsertExecutionGrant({ companyId, subjectKey, nodeId: nativeNode.id,
          runnerProfileId: runner.id, workspaceSourceId: sourceB.id });
        const held = await pluginExecutionService.dispatchRun({ companyId, executionGrantId: grantA.id,
          args: ["--hold"], timeoutMs: 30_000 });
        const heldRow = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === held.id);
        assert.equal(heldRow.workspaceSourceId, sourceA.id);
        assert.equal(heldRow.cwdHint, sourceAPath);
        nativePluginSourceExpected.heldRunId = held.id;
        const heldDeadline = Date.now() + 30_000;
        let heldRun, heldEvents;
        while (Date.now() < heldDeadline) {
          heldRun = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === held.id);
          heldEvents = (await db.select().from(spsPluginNodeRunEvents)).filter(event => event.runId === held.id);
          if (heldRun?.status === "running" && heldEvents.some(event => event.body?.includes("SPS_PLUGIN_SOURCE_HOLD_STARTED"))) break;
          if (heldRun?.status === "failed") break;
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        assert.equal(heldRun?.status, "running",
          `The Source lease scenario must start its owned canary process (status=${heldRun?.status ?? "missing"}; error=${heldRun?.error ?? "none"}).`);
        assert.ok(heldEvents.some(event => event.body?.includes("SPS_PLUGIN_SOURCE_HOLD_STARTED")));
        const sibling = await pluginExecutionService.dispatchRun({ companyId, executionGrantId: grantB.id,
          args: ["--success"], timeoutMs: 30_000 });
        const siblingRow = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === sibling.id);
        assert.equal(siblingRow.workspaceSourceId, sourceB.id);
        assert.equal(siblingRow.cwdHint, sourceBPath);
        nativePluginSourceExpected.siblingRunId = sibling.id;
        nativeNodeStage = "source-path-change-lease-cancels-canary";
        await db.update(spsWorkspaceSources).set({ sharePath: changedSourceAPath }).where(eq(spsWorkspaceSources.id, sourceA.id));
        const failureDeadline = Date.now() + 15_000;
        let failedRun;
        while (Date.now() < failureDeadline) {
          failedRun = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === held.id);
          if (failedRun?.status === "failed") break;
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        assert.equal(failedRun?.status, "failed", `Changed Source path left run ${failedRun?.status ?? "without a result"}.`);
        assert.ok(failedRun.finishedAt instanceof Date);
        assert.equal(typeof failedRun.error, "string");
        assert.match(failedRun.error, /source|access|route/i);
        const closeDeadline = Date.now() + 5_000;
        while (sourceMappingCloseCount < 1 && Date.now() < closeDeadline) await new Promise(resolve => setTimeout(resolve, 50));
        assert.ok(sourceMappingCloseCount >= 1, "Revoked Source lease must close the owned fixture mapping.");
        const siblingDeadline = Date.now() + 30_000;
        let siblingAfterFailure, siblingEvents;
        while (Date.now() < siblingDeadline) {
          siblingAfterFailure = (await db.select().from(spsPluginNodeRuns)).find(row => row.id === sibling.id);
          siblingEvents = (await db.select().from(spsPluginNodeRunEvents)).filter(event => event.runId === sibling.id);
          if (siblingAfterFailure?.status === "succeeded" || siblingAfterFailure?.status === "failed") break;
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        assert.ok(["queued", "succeeded"].includes(siblingAfterFailure?.status),
          `A same-subject run for another Source must remain independently authorized (status=${siblingAfterFailure?.status ?? "missing"}; errorPresent=${typeof siblingAfterFailure?.error === "string"}).`);
        nativePluginSourceExpected.siblingStatus = siblingAfterFailure.status;
        if (siblingAfterFailure.status === "succeeded") {
          assert.equal(siblingAfterFailure.exitCode, 0);
          assert.ok(siblingAfterFailure.finishedAt instanceof Date);
          assert.ok(siblingEvents.some(event => event.body?.includes("SPS_PLUGIN_SOURCE_CANARY_OK")));
          assert.deepEqual(sourceRouteEvidence, [
            { sourceId: sourceA.id, sharePath: sourceAPath, expectedSharePath: sourceAPath },
            { sourceId: sourceB.id, sharePath: sourceBPath, expectedSharePath: sourceBPath },
          ]);
          const siblingCloseDeadline = Date.now() + 5_000;
          while (sourceMappingCloseCount < 2 && Date.now() < siblingCloseDeadline) await new Promise(resolve => setTimeout(resolve, 50));
          assert.equal(sourceMappingCloseCount, 2, "Each started Source run must close its owned fixture mapping once.");
        } else {
          assert.deepEqual(sourceRouteEvidence, [{ sourceId: sourceA.id, sharePath: sourceAPath, expectedSharePath: sourceAPath }]);
          assert.equal(sourceMappingCloseCount, 1, "The started Source run must close its owned fixture mapping once.");
        }
        const sourceGrants = await db.select().from(spsPluginExecutionGrants);
        assert.equal(sourceGrants.length, 2);
        assert.ok(sourceGrants.every(grant => grant.status === "active"));
        console.log("native_plugin_source_acceptance:registered,pending-denied,approved,source-granted,execution-granted,cwd-bound,signed-route,rsa-decrypted,path-change-lease,canary-cancelled,sibling-preserved");
      } else {
        const deadline = Date.now() + 45_000;
        let completed;
        while (Date.now() < deadline) {
          completed = (await db.select().from(spsNodeCommands)).find(row => row.id === commandId);
          if (completed?.status === "succeeded" || completed?.status === "failed") break;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        assert.equal(completed?.status, "succeeded", `Native canary command ended ${completed?.status ?? "without a result"}.`);
        assert.ok(completed.claimedAt instanceof Date && completed.startedAt instanceof Date && completed.finishedAt instanceof Date);
        assert.equal(completed.exitCode, 0);
        const events = (await db.select().from(spsNodeCommandEvents)).filter(event => event.commandId === commandId);
        assert.ok(events.some(event => event.stream === "stdout" && event.body?.includes("SPS_NATIVE_NODE_CANARY_OK")));
        assert.ok(events.some(event => event.stream === "stderr" && event.body?.includes("canary-stderr")));
      }
      nativeNodeStage = "foreign-workspace-denial";
      await assert.rejects(memberNode.connect({ hostId, workspaceId: randomUUID() }));
      assert.equal((await db.select().from(spsNodes)).length, 1, "A foreign workspace must not register a Node.");
      nativeNodeStage = "revoked-node-denial";
      await db.update(spsNodes).set({ status: "revoked" });
      await assert.rejects(memberNode.connect({ hostId, workspaceId: companyId }),
        /Native Node is unavailable/i, "A revoked Node must not reconnect its saved identity.");
      if (withNativeNode) console.log("native_node_acceptance:registered,approved,granted,claimed,executed,completed");
    } catch (error) {
      console.error(`native_node_failure_stage:${nativeNodeStage}`);
      throw error;
    } finally {
      try { await memberNode.dispose(); } finally { await nativeNodeWorkspaceFixture.remove(); }
    }
  }
  if (withNativeWindow) {
    const itemId = randomUUID();
    await db.insert(spsPluginInboxItems).values({ id: itemId, companyId,
      sourcePluginKey: "native-window-fixture", externalId: itemId, targetUserId: userId,
      category: "notification", title: "Native persisted Inbox item", summary: "Actual Core DB state", severity: "info" });
    const context = { identityIssuer: "https://workspace.example.test", subject: "fixture-member", hostId,
      deviceKeyId: key.deviceKeyId, serverSpkiSha256: binding.serverSpkiSha256, issuerSpkiSha256: binding.issuerSpkiSha256 };
    const unrelated = await createSpsNativeHostIdentity({ hostId, hostnames: ["127.0.0.1"],
      notBefore: now - 1000, notAfter: now + 3_600_000, issuerNotAfter: now + 7_200_000 });
    const untrustedContext = { ...context, serverSpkiSha256: pin(unrelated.server.certificatePem),
      issuerSpkiSha256: pin(unrelated.memberIssuer.certificatePem) };
    await runWindow({ workspaceId: companyId, renewal: withRenewal, hostRenewal: withHostRenewal,
      ...(withNativePlugin ? { withNativePlugin: true, pluginId: pluginConfiguration.pluginId, pluginSurfaceId: "native-count" } : {}),
      ...(withHostRenewal ? { hostIdentity: host } : {}), deviceId: device.id, context, keyRequest: key,
      untrustedContext, untrustedTarget: { v: 1, kind: "sps.native.member-host-target", context: untrustedContext,
        origin: `https://127.0.0.1:${port}`, serverCertificatePem: unrelated.server.certificatePem },
      target: { v: 1, kind: "sps.native.member-host-target", context,
        origin: `https://127.0.0.1:${port}`, serverCertificatePem: host.server.certificatePem },
      issuance: { enrollmentId, certificate: new X509Certificate(issued.certificatePem).raw.toString("base64url"),
        issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url"),
        expiresAt: (withRenewal ? historicalExpiry : new Date(now + (1 / 24) * 86_400_000)).toISOString() } });
    const states = await db.select().from(spsPluginInboxUserStates);
    if (withNativePlugin) {
      const persisted = await db.select().from(pluginState);
      assert.equal(persisted.length, 1); assert.equal(persisted[0].pluginId, pluginConfiguration.pluginId);
      assert.equal(persisted[0].scopeId, companyId); assert.equal(persisted[0].valueJson, 1);
    }
    assert.equal(states.length, 1);
    assert.equal(states[0].companyId, companyId);
    assert.equal(states[0].userId, userId);
    assert.equal(states[0].itemId, itemId);
    assert.ok(states[0].readAt instanceof Date);
    assert.equal(states[0].archivedAt, null);
  }
  // This database contains only this fixture's membership. Discovery must never
  // recreate access when an approved device loses its Workspace membership.
  let renewalRows = [];
  if (withRenewal) {
    renewalRows = await db.select().from(spsMemberDeviceRenewalCertificates);
    assert.equal(renewalRows.length, 1);
    assert.equal(renewalRows[0].deviceId, device.id);
    assert.equal(renewalRows[0].predecessorCertificateSha256, device.certificateSha256);
    await devices.authorize({ companyId, userId, certificateSha256: device.certificateSha256 });
    const baseAfter = (await db.select().from(spsMemberDevices)).find(row => row.id === device.id);
    assert.equal(baseAfter.certificateSha256, device.certificateSha256);
    assert.equal(baseAfter.spkiSha256, device.spkiSha256);
    assert.equal(baseAfter.certificate, baseDevice.certificate);
    await devices.authorize({ companyId, userId, certificateSha256: renewalRows[0].certificateSha256 });
  }
  await db.update(companyMemberships).set({ status: "suspended" });
  assert.deepEqual(await read(discovery), { status: 200, body: [] });
  assert.equal((await read(`${root}/workspace-bootstrap`)).status, 403);
  assert.equal((await read(`${root}/workspace-shell`)).status, 403);
  // Isolate parent revocation from the membership denial already checked above.
  if (withRenewal) await db.update(companyMemberships).set({ status: "active" });
  await devices.revoke(device.id, "fixture-host");
  if (withRenewal) {
    for (const certificateSha256 of [device.certificateSha256, renewalRows[0].certificateSha256]) {
      await assert.rejects(devices.authorize({ companyId, userId, certificateSha256 }), { code: "not_authorized" });
    }
  }
  assert.equal((await read(discovery)).status, 403);
  assert.equal((await read(`${root}/workspace-shell`)).status, 403);
  if (withNativePluginSource) {
    const expected = nativePluginSourceExpected;
    assert.ok(expected?.heldRunId && expected?.siblingRunId);
    const remainingNodes = await db.select().from(spsNodes);
    const remainingAgents = await db.select().from(agents);
    const remainingPlugins = await db.select().from(plugins);
    const remainingSources = await db.select().from(spsWorkspaceSources);
    const remainingNodeGrants = await db.select().from(spsWorkspaceSourceNodeGrants);
    const remainingExecutionGrants = await db.select().from(spsPluginExecutionGrants);
    const remainingRuns = await db.select().from(spsPluginNodeRuns);
    assert.equal(remainingNodes.length, 1);
    assert.equal(remainingNodes[0].companyId, companyId);
    assert.equal(remainingNodes[0].ownerUserId, userId);
    assert.equal(remainingNodes[0].status, "revoked");
    assert.deepEqual(remainingAgents, []);
    assert.equal(remainingPlugins.length, 1);
    assert.equal(remainingPlugins[0].pluginKey, "sps.native-node-acceptance");
    assert.equal(remainingPlugins[0].status, "ready");
    assert.equal(remainingSources.length, 2);
    assert.equal(remainingSources.find(source => source.id === expected.sourceAId)?.sharePath, expected.changedSourceAPath);
    assert.equal(remainingSources.find(source => source.id === expected.sourceBId)?.sharePath, expected.sourceBPath);
    assert.equal(remainingNodeGrants.length, 2);
    assert.ok(remainingNodeGrants.every(grant => grant.revokedAt === null && grant.credentialAlgorithm === "rsa-oaep-sha256"));
    assert.equal(remainingExecutionGrants.length, 2);
    assert.ok(remainingExecutionGrants.every(grant => grant.status === "active"));
    assert.deepEqual(new Set(remainingExecutionGrants.map(grant => grant.workspaceSourceId)), new Set([expected.sourceAId, expected.sourceBId]));
    assert.equal(remainingRuns.length, 2);
    const failedSourceRun = remainingRuns.find(run => run.id === expected.heldRunId);
    const siblingSourceRun = remainingRuns.find(run => run.id === expected.siblingRunId);
    assert.equal(failedSourceRun?.status, "failed");
    assert.equal(failedSourceRun?.workspaceSourceId, expected.sourceAId);
    assert.equal(failedSourceRun?.cwdHint, expected.sourceAPath);
    assert.equal(siblingSourceRun?.status, expected.siblingStatus);
    assert.equal(siblingSourceRun?.workspaceSourceId, expected.sourceBId);
    assert.equal(siblingSourceRun?.cwdHint, expected.sourceBPath);
    assert.equal(failedSourceRun?.subjectKey, siblingSourceRun?.subjectKey);
    if (siblingSourceRun?.status === "succeeded") {
      assert.equal(siblingSourceRun.exitCode, 0);
      assert.ok(siblingSourceRun.finishedAt instanceof Date);
    }
  } else if (withNativePluginNode) {
    const remainingNodes = await db.select().from(spsNodes);
    const remainingAgents = await db.select().from(agents);
    const remainingPlugins = await db.select().from(plugins);
    const remainingGrants = await db.select().from(spsPluginExecutionGrants);
    const remainingRuns = await db.select().from(spsPluginNodeRuns);
    assert.equal(remainingNodes.length, 1);
    assert.equal(remainingNodes[0].companyId, companyId);
    assert.equal(remainingNodes[0].ownerUserId, userId);
    assert.equal(remainingNodes[0].status, "revoked");
    assert.deepEqual(remainingAgents, []);
    assert.equal(remainingPlugins.length, 1);
    assert.equal(remainingPlugins[0].pluginKey, "sps.native-node-acceptance");
    assert.equal(remainingPlugins[0].status, "ready");
    assert.equal(remainingGrants.length, 2);
    assert.ok(remainingGrants.every(grant => grant.status === "revoked" && grant.workspaceSourceId === null));
    assert.equal(remainingRuns.length, 2);
    assert.ok(remainingRuns.some(run => run.status === "succeeded" && run.workspaceSourceId === null));
    assert.ok(remainingRuns.some(run => run.status === "failed" && run.workspaceSourceId === null));
  } else if (withNativeNode) {
    const remainingNodes = await db.select().from(spsNodes);
    const remainingAgents = await db.select().from(agents);
    assert.equal(remainingNodes.length, 1);
    assert.equal(remainingNodes[0].companyId, companyId);
    assert.equal(remainingNodes[0].ownerUserId, userId);
    assert.equal(remainingNodes[0].status, "revoked");
    assert.equal(remainingAgents.length, 1);
    assert.equal(remainingAgents[0].companyId, companyId);
    assert.equal(remainingAgents[0].name, "Native canary Agent");
    assert.deepEqual(await db.select().from(plugins), []);
  } else {
    for (const table of [agents, spsNodes, ...(withNativePlugin ? [] : [plugins])]) assert.deepEqual(await db.select().from(table), []);
  }
} catch (error) { failure = error; throw error; }
finally {
  const errors = [];
  try { await ingress?.dispose(); } catch (error) { errors.push(error); }
  try { parentIngress?.dispose(); } catch (error) { errors.push(error); }
  parent?.dispose();
  if (child) {
    try {
      await new Promise((resolve, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          child.exitCode === 0 ? resolve() : reject(new Error("Isolated Workspace child exited unsuccessfully.")); return;
        }
        const timer = setTimeout(() => reject(new Error(`Isolated Workspace child did not exit naturally (shutdown reached ${childShutdownStage}).`)), 20_000);
        child.once("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Isolated Workspace child exited unsuccessfully (shutdown reached ${childShutdownStage}).`)); });
        if (child.connected) child.send({ kind: "sps.test.native-workspace.stop" });
      });
    } catch (error) {
      errors.push(error);
      if (child.exitCode === null && child.signalCode === null) {
        try {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("Isolated Workspace failure cleanup could not confirm child closure.")), 10_000);
            child.once("close", () => { clearTimeout(timer); resolve(); });
            child.kill();
          });
        } catch (cleanupError) { errors.push(cleanupError); }
      }
    }
  }
  try { signerChannel?.dispose(); } catch (error) { errors.push(error); }
  try { await db?.$client.end({ timeout: 5 }); } catch (error) { errors.push(error); }
  try { await database.cleanup(); } catch (error) { errors.push(error); }
  try { await pluginFixture?.remove(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError([...(failure ? [failure] : []), ...errors], "Native Workspace integration cleanup failed.");
}
console.log(withNativePlugin
  ? "Native Plugin UI integration passed: actual Electron isolated Plugin renderer, declared React export and CSS through exact fresh mTLS/Main/private Core channel, owned worker data/action and real DB Plugin state persistence, wrong-peer denial, account/parent cleanup and natural Main/Core/DB exit. Identity exchange is substituted; not signed installation or physical two-PC LAN qualification."
  : withNativePluginSource
  ? "Native Plugin Source integration passed: a real Core Source row, per-Node RSA-sealed credential grant, and same-subject Source-scoped Plugin execution grants/runs. Signed Node source-route returned the sealed route, the desktop-node RSA decryptor validated the credential and exact cwdHint, and an owned temp fixture mapping replaced OS/SMB mounting. Changing the active Source path ended the lease and canceled the canary process while preserving its same-subject sibling run. Fixture Owner approval, credential, and mapping are synthetic; no provider exchange, Windows drive map, SMB or physical-LAN qualification."
  : withNativePluginNode
  ? "Native Plugin Node integration passed: actual fresh mTLS, owned child IPC, private Core HTTP/DB Node registration and heartbeat; a DB-registered plugin manifest declares SPS execution capabilities, and a persisted execution grant queues a neutral run with no Agent and no Workspace Source. Pending claim denied; explicit fixture Owner approval permits claim, lease, stdout/stderr events, and successful completion from an owned canary process in an owned temp workspace. Revoking the active execution grant cancels a second owned canary process and records failure; foreign workspace and revoked Node are denied. No plugin UI, provider auth, real identity exchange, OS key protection, SMB, or physical-LAN qualification."
  : withNativeNode
  ? "Native Node integration passed: actual fresh mTLS, owned child IPC, private Core HTTP/DB registration and heartbeat, pending-command denial, explicit fixture Owner approval/Agent/Runner grants, claimed command lease/output events/success completion from an owned canary process in an owned temp workspace, foreign-workspace and revoked-Node denial, and natural process/database cleanup. Identity exchange and canary resolver are fixture-only; approval is a fixture DB row, not UI automation. No Electron, DPAPI, provider auth, SMB or physical-LAN qualification."
  : withHostRenewal
  ? "Native Host and Member renewal integration passed: actual Windows DPAPI Host publication, explicit listener restart retaining exact old leaf selection, protected Member target refresh, same keys/issuer/original files, real Core renewal/reconciliation and Workspace Inbox operations, independent revocation denial and natural process/database cleanup. Identity exchange is substituted; no issuer rotation or expired-trust recovery qualification."
  : withRenewal
  ? "Native Member renewal integration passed: actual Main signer and Core parent ingress, TLS old-certificate replay, one immutable Core renewal row, Windows DPAPI append-only publication, renewed-certificate Workspace reads and revoked-parent denial. Identity-provider exchange is substituted; no issuer/server-leaf rotation or expired recovery qualification."
  : withWindow
  ? "Joined Native Workspace integration passed: actual Electron/bundled SPA/preload, Windows DPAPI retained credentials, fresh mTLS, owned Core child/private HTTP, real DB session/device/membership, persisted Inbox read/archive/restore and natural Main/Core/database cleanup. Identity-provider token exchange is substituted; not installed startup, WebSockets, Plugin UI or physical LAN qualification."
  : "Native Workspace channel integration passed: actual fresh mTLS, owned child IPC bootstrap, private HTTP, real Core Identity/device/membership and surface services; unauthorized and revoked devices denied, no Agents/Plugins/Nodes, natural process/database cleanup. Source/loopback only; not DPAPI, full SPA, WebSockets, physical LAN or installed startup qualification.");

import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { fork, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";

const withWindow = process.argv[3] === "--with-native-window";
const withHostRenewal = process.argv[3] === "--with-native-host-renewal";
const withNativePlugin = process.argv[3] === "--with-native-plugin";
const withRenewal = process.argv[3] === "--with-native-renewal" || withHostRenewal;
const withNativeWindow = withWindow || withRenewal || withNativePlugin;
if (![3, 4].includes(process.argv.length) || process.argv[2] !== "--isolated-native-workspace-channel"
  || process.argv.length === 4 && (!withNativeWindow || process.platform !== "win32")) {
  throw new Error("Use the explicit isolated Native Workspace channel command.");
}
const { createSpsNativeHostIdentity } = await import("../src/native-identity-certificates.mjs");
const { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } = await import("../src/native-member-certificates.mjs");
const { createSpsNativeHostIngress } = await import("../src/native-host-ingress.mjs");
const { attachSpsNativeWorkspaceParentChannel } = await import("../src/native-workspace-parent-channel.mjs");
const { createSpsNativeMemberMainSigner } = await import("../src/native-member-main-signer.mjs");
const { attachSpsNativeMemberSignerChannel } = await import("../src/native-member-signer-channel.mjs");
const { createSpsNativeParentIngressClient } = await import("../src/native-parent-ingress-client.mjs");
const { parseSpsNativeEnrollmentResponse } = await import("../src/native-enrollment-response.mjs");
const core = path.resolve(import.meta.dirname, "../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
const { createDb, getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase,
  authUsers, authSessions, companies, companyMemberships, agents, plugins, spsNodes, spsMemberDevices,
  spsPluginInboxItems, spsPluginInboxUserStates, spsMemberDeviceRenewalCertificates, pluginState, pluginCompanySettings,
  spsNativePairings, spsNativePairingEvents, spsNativeEnrollments } = await load("packages/db/src/index.ts");
const { spsMemberDeviceService } = await load("server/src/services/sps-member-devices.ts");
assert.equal((await getEmbeddedPostgresTestSupport()).supported, true);
const database = await startEmbeddedPostgresTestDatabase("sps-native-workspace-channel-");
let db, child, parent, ingress, signerChannel, parentIngress, failure, childShutdownStage = "not-started";
let applyHostRenewal;
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
    const timer = setTimeout(() => finish(new Error("Isolated Native Workspace child readiness timed out.")), withNativePlugin ? 90_000 : 45_000);
    const onFailure = () => finish(new Error("Isolated Native Workspace child failed."));
    const onMessage = message => {
      if (message?.kind === "sps.test.native-workspace.configure-ready") child.send({ kind: "sps.test.native-workspace.configure", binding,
        connectionString: database.connectionString, identityIssuer: "https://workspace.example.test", renewal: withRenewal,
        ...(withNativePlugin ? { nativePlugin: pluginConfiguration } : {}) }, error => { if (error) onFailure(); });
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
        assert.equal(withNativeWindow, true);
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
  for (const table of [agents, spsNodes, ...(withNativePlugin ? [] : [plugins])]) assert.deepEqual(await db.select().from(table), []);
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
  : withHostRenewal
  ? "Native Host and Member renewal integration passed: actual Windows DPAPI Host publication, explicit listener restart retaining exact old leaf selection, protected Member target refresh, same keys/issuer/original files, real Core renewal/reconciliation and Workspace Inbox operations, independent revocation denial and natural process/database cleanup. Identity exchange is substituted; no issuer rotation or expired-trust recovery qualification."
  : withRenewal
  ? "Native Member renewal integration passed: actual Main signer and Core parent ingress, TLS old-certificate replay, one immutable Core renewal row, Windows DPAPI append-only publication, renewed-certificate Workspace reads and revoked-parent denial. Identity-provider exchange is substituted; no issuer/server-leaf rotation or expired recovery qualification."
  : withWindow
  ? "Joined Native Workspace integration passed: actual Electron/bundled SPA/preload, Windows DPAPI retained credentials, fresh mTLS, owned Core child/private HTTP, real DB session/device/membership, persisted Inbox read/archive/restore and natural Main/Core/database cleanup. Identity-provider token exchange is substituted; not installed startup, WebSockets, Plugin UI or physical LAN qualification."
  : "Native Workspace channel integration passed: actual fresh mTLS, owned child IPC bootstrap, private HTTP, real Core Identity/device/membership and surface services; unauthorized and revoked devices denied, no Agents/Plugins/Nodes, natural process/database cleanup. Source/loopback only; not DPAPI, full SPA, WebSockets, physical LAN or installed startup qualification.");

import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID, X509Certificate } from "node:crypto";
import { fork } from "node:child_process";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";

if (process.argv.length !== 3 || process.argv[2] !== "--isolated-native-workspace-channel") {
  throw new Error("Use the explicit isolated Native Workspace channel command.");
}
const { createSpsNativeHostIdentity } = await import("../src/native-identity-certificates.mjs");
const { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } = await import("../src/native-member-certificates.mjs");
const { createSpsNativeHostIngress } = await import("../src/native-host-ingress.mjs");
const { attachSpsNativeWorkspaceParentChannel } = await import("../src/native-workspace-parent-channel.mjs");
const core = path.resolve(import.meta.dirname, "../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
const { createDb, getEmbeddedPostgresTestSupport, startEmbeddedPostgresTestDatabase,
  authUsers, authSessions, companies, companyMemberships, agents, plugins, spsNodes } = await load("packages/db/src/index.ts");
const { spsMemberDeviceService } = await load("server/src/services/sps-member-devices.ts");
assert.equal((await getEmbeddedPostgresTestSupport()).supported, true);
const database = await startEmbeddedPostgresTestDatabase("sps-native-workspace-channel-");
let db, child, parent, ingress, failure;
try {
  db = createDb(database.connectionString);
  const now = Math.floor(Date.now() / 1000) * 1000;
  const hostId = randomUUID(), companyId = randomUUID(), userId = randomUUID();
  const host = await createSpsNativeHostIdentity({ hostId, hostnames: ["127.0.0.1"],
    notBefore: now - 1000, notAfter: now + 3_600_000, issuerNotAfter: now + 7_200_000 });
  const key = await createSpsNativeMemberKeyRequest({ hostId, deviceKeyId: randomUUID() });
  const issued = await issueSpsNativeMemberCertificate({ hostIdentity: host,
    request: { v: 1, kind: "sps.native.member-enrollment-request", hostId, deviceKeyId: key.deviceKeyId, requestPem: key.requestPem },
    now, notBefore: now - 1000, notAfter: now + 3_600_000 });
  const pin = pem => createHash("sha256").update(new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" })).digest("hex");
  const binding = { hostId, serverSpkiSha256: pin(host.server.certificatePem), issuerSpkiSha256: pin(host.memberIssuer.certificatePem) };
  const secret = randomBytes(48).toString("base64url"), cookie = `sps_identity_session=${secret}`;
  const at = new Date();
  await db.insert(authUsers).values({ id: userId, name: "Workspace Member", email: `${userId}@example.test`,
    emailVerified: true, createdAt: at, updatedAt: at });
  await db.insert(authSessions).values({ id: `sps_identity_${randomUUID()}`, userId,
    token: createHash("sha256").update(secret).digest("base64url"), expiresAt: new Date(now + 3_600_000),
    createdAt: at, updatedAt: at, ipAddress: null, userAgent: null });
  await db.insert(companies).values({ id: companyId, name: "Native Channel Fixture",
    issuePrefix: `N${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}` });
  await db.insert(companyMemberships).values({ companyId, principalType: "user", principalId: userId,
    status: "active", membershipRole: "member" });
  const devices = spsMemberDeviceService(db, hostId);
  const device = await devices.request({ companyId, userId, displayName: "Native Member", certificate:
    new X509Certificate(issued.certificatePem).raw.toString("base64url") });
  await devices.approve(device.id, "fixture-host");

  child = fork(new URL("./fixtures/native-workspace-channel-child.mjs", import.meta.url),
    ["--isolated-native-workspace-channel-child"], { stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true });
  child.stdout.resume(); child.stderr.resume();
  parent = attachSpsNativeWorkspaceParentChannel(child, { isCurrent: () => child.connected && child.exitCode === null,
    inspectBinding: async () => ({ ...binding, issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url") }) });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error("Isolated Native Workspace child readiness timed out.")), 45_000);
    const onFailure = () => finish(new Error("Isolated Native Workspace child failed."));
    const onMessage = message => {
      if (message?.kind === "sps.test.native-workspace.configure-ready") child.send({ kind: "sps.test.native-workspace.configure", binding,
        connectionString: database.connectionString }, error => { if (error) onFailure(); });
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
  ingress = createSpsNativeHostIngress({ getIdentity: () => host, assertCurrent() { assert.equal(child.connected, true); },
    dispatch() { assert.fail("This fixture does not exercise enrollment"); },
    dispatchWorkspace: (input, options) => parent.read(input, options) });
  const { port } = await ingress.start({ bindAddress: "127.0.0.1", port: 0 });
  const read = (target, options = {}) => new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: "127.0.0.1", port, path: target, method: "GET", agent: false,
      ca: host.server.certificatePem, cert: options.noCertificate ? undefined : issued.certificatePem,
      key: options.noCertificate ? undefined : key.privateKeyPem, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
      headers: { Connection: "close", "Content-Length": "0", Cookie: options.cookie ?? cookie } }, response => {
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    request.once("error", reject); request.end();
  });
  const root = `/api/companies/${companyId}`;
  const discovery = "/sps-native/v1/workspaces";
  assert.deepEqual(await read(discovery), { status: 200, body: [{ id: companyId, name: "Native Channel Fixture" }] });
  assert.notEqual((await read(discovery, { noCertificate: true })).status, 200);
  assert.equal((await read(discovery, { cookie: `sps_identity_session=${"x".repeat(64)}` })).status, 403);
  assert.equal((await read(`${discovery}?all=true`)).status, 404);
  assert.deepEqual(await read(`${root}/workspace-shell/providers`), { status: 200, body: [] });
  assert.equal((await read(`${root}/workspace-shell`)).body.mode, "neutral");
  assert.deepEqual(await read(`${root}/workspace-dashboard`), { status: 200, body: { widgets: [] } });
  assert.deepEqual(await read(`${root}/workspace-inbox?archived=true`), { status: 200, body: { items: [] } });
  assert.notEqual((await read(`${root}/workspace-shell`, { noCertificate: true })).status, 200);
  assert.equal((await read(`${root}/workspace-shell`, { cookie: `sps_identity_session=${"x".repeat(64)}` })).status, 403);
  assert.equal((await read(`/api/companies/${randomUUID()}/workspace-shell`)).status, 403);
  assert.equal((await read("/api/companies")).status, 404);
  // This database contains only this fixture's membership. Discovery must never
  // recreate access when an approved device loses its Workspace membership.
  await db.update(companyMemberships).set({ status: "suspended" });
  assert.deepEqual(await read(discovery), { status: 200, body: [] });
  assert.equal((await read(`${root}/workspace-shell`)).status, 403);
  await devices.revoke(device.id, "fixture-host");
  assert.equal((await read(discovery)).status, 403);
  assert.equal((await read(`${root}/workspace-shell`)).status, 403);
  for (const table of [agents, plugins, spsNodes]) assert.deepEqual(await db.select().from(table), []);
} catch (error) { failure = error; throw error; }
finally {
  const errors = [];
  try { await ingress?.dispose(); } catch (error) { errors.push(error); }
  parent?.dispose();
  if (child) {
    try {
      await new Promise((resolve, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) {
          child.exitCode === 0 ? resolve() : reject(new Error("Isolated Workspace child exited unsuccessfully.")); return;
        }
        const timer = setTimeout(() => reject(new Error("Isolated Workspace child did not exit naturally.")), 20_000);
        child.once("close", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Isolated Workspace child exited unsuccessfully.")); });
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
  try { await db?.$client.end(); } catch (error) { errors.push(error); }
  try { await database.cleanup(); } catch (error) { errors.push(error); }
  if (errors.length) throw new AggregateError([...(failure ? [failure] : []), ...errors], "Native Workspace integration cleanup failed.");
}
console.log("Native Workspace channel integration passed: actual fresh mTLS, owned child IPC bootstrap, private HTTP, real Core Identity/device/membership and surface services; unauthorized and revoked devices denied, no Agents/Plugins/Nodes, natural process/database cleanup. Source/loopback only; not DPAPI, full SPA, WebSockets, physical LAN or installed startup qualification.");

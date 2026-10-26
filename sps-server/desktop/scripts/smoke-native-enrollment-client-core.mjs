import assert from "node:assert/strict";
import { constants, createCipheriv, createDecipheriv, createHash, generateKeyPairSync, randomBytes, randomUUID, sign, X509Certificate } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:https";
import { fork } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } from "../src/native-member-certificates.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { createSpsNativeEnrollmentBootstrap, createSpsNativeEnrollmentClient,
  createSpsNativeEnrollmentRecoveryClient } from "../src/native-enrollment-client.mjs";
import { createSpsNativeMemberController } from "../src/native-member-controller.mjs";
import { createSpsNativeMemberPendingKeyStore, createSpsNativeMemberHostTargetReader } from "../src/native-member-pending-store.mjs";
import { defaultSpsNativePairingIssue, SPS_NATIVE_PAIRING_DEFAULT_POLICY } from "../src/native-connection-policy.mjs";
import { createSpsNativeHostIngress } from "../src/native-host-ingress.mjs";
import { createSpsNativeParentIngressClient } from "../src/native-parent-ingress-client.mjs";
import { createSpsNativeMemberMainSigner } from "../src/native-member-main-signer.mjs";
import { attachSpsNativeMemberSignerChannel } from "../src/native-member-signer-channel.mjs";

// Cross-repository verification only: never imported by product Main. Run with
// the pinned Core's tsx loader so its real services and DB migrations are used.
const mode = process.argv[2];
if (process.argv.length !== 3 || !["--isolated-native-enrollment-client", "--isolated-native-member-controller", "--isolated-native-parent-ingress"].includes(mode)) {
  throw new Error("Use an isolated Native enrollment integration command.");
}
const core = path.resolve(import.meta.dirname, "../../../external/sps-core");
const load = relative => import(pathToFileURL(path.join(core, relative)).href);
const databaseModule = await load("packages/db/src/index.ts");
const { createDb, startEmbeddedPostgresTestDatabase, getEmbeddedPostgresTestSupport, authUsers,
  authSessions, spsNativePairings, spsNativeEnrollments, spsMemberDevices, spsMemberDeviceEvents,
  spsNativePairingEvents, agents, plugins, companyMemberships, spsNodes } = databaseModule;
const { createSpsIdentityAuth } = await load("server/src/auth/sps-identity.ts");
const { spsNativePairingService } = await load("server/src/services/sps-native-pairings.ts");
const { spsNativeEnrollmentService } = await load("server/src/services/sps-native-enrollments.ts");
const { createSpsNativeSessionEnrollment } = await load("server/src/services/sps-native-session-enrollment.ts");
const { createSpsNativeEnrollmentRequestHandler } = await load("server/src/services/sps-native-enrollment-http.ts");
const { createSpsNativeSessionExchangeRequestHandler } = await load("server/src/services/sps-native-session-exchange-http.ts");
const { createSpsNativeIdentityRequestHandler } = await load("server/src/services/sps-native-identity-http.ts");
const support = await getEmbeddedPostgresTestSupport();
assert.equal(support.supported, true, "The real isolated Core database must be supported; do not skip integration.");
const database = await startEmbeddedPostgresTestDatabase("sps-native-client-core-");
const db = createDb(database.connectionString);
const previousFetch = globalThis.fetch;
const clients = [], sockets = new Set();
let server, exchange, enrollment, metadataHandler;
let ownedChild, signerChannel, parentIngress, productIngress;
const throughParent = mode === "--isolated-native-parent-ingress";
let localFixtureRoot = null;
let localFixtureIdentity = null;
let localFixtureCanonical = null;
let localFixtureParent = null;
let succeeded = false;
let integrationFailure = null;
const signingEvidence = { inspectRequests: 0, inspectSuccess: 0, inspectFailure: 0, signRequests: 0, signSuccess: 0, signFailure: 0 };
try {
  const hostId = randomUUID(), deviceKeyId = randomUUID();
  const now = Math.floor(Date.now() / 1000) * 1000;
  const host = await createSpsNativeHostIdentity({ hostId, hostnames: ["127.0.0.1"], notBefore: now - 1000,
    notAfter: now + 86_400_000, issuerNotAfter: now + 2 * 86_400_000 });
  const fingerprint = pem => createHash("sha256").update(new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" })).digest("hex");
  const serverPin = fingerprint(host.server.certificatePem);
  const issuerPin = fingerprint(host.memberIssuer.certificatePem);
  const fixtureIssuer = "https://identity.example.test", kid = "native-client-core-fixture";
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = keys.publicKey.export({ format: "jwk" });
  globalThis.fetch = async input => {
    assert.equal(String(input), `${fixtureIssuer}/.well-known/jwks.json`, "Only the isolated JWKS fixture may be fetched.");
    return new Response(JSON.stringify({ keys: [{ ...jwk, kid, alg: "RS256", use: "sig" }] }));
  };
  const identity = createSpsIdentityAuth(db, { authIdentityEnabled: true, authIdentityIssuer: fixtureIssuer,
    authIdentityAudience: "sps-core", authIdentityJwksUrl: `${fixtureIssuer}/.well-known/jwks.json`,
    authPublicBaseUrl: "https://native.example.test" });
  const at = new Date();
  await db.insert(authUsers).values({ id: "fixture-host", name: "Fixture Host", email: "host@example.test",
    emailVerified: true, createdAt: at, updatedAt: at });
  // User-approved 1-hour / 5 wrong secrets / 10 active invitations product policy.
  const policy = SPS_NATIVE_PAIRING_DEFAULT_POLICY;
  const pairings = spsNativePairingService(db, hostId, policy, { serverSpkiSha256: serverPin });
  const invitation = await pairings.issue(defaultSpsNativePairingIssue("fixture-host"));
  let signings = 0;
  const service = spsNativeEnrollmentService(db, { hostId, serverSpkiSha256: serverPin,
    issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url"),
    pairingPolicy: policy, certificateLifetimeMs: mode === "--isolated-native-member-controller" ? 30 * 60_000 : 60_000,
    signingTimeoutMs: 2000, maxConcurrentSignings: 2 }, async input => {
    signings++;
    const issued = await issueSpsNativeMemberCertificate({ hostIdentity: host,
      request: { v: 1, kind: "sps.native.member-enrollment-request", hostId, deviceKeyId: input.deviceKeyId,
        requestPem: input.requestPem }, notBefore: input.notBefore, notAfter: input.notAfter, now: Date.now() });
    return { certificate: new X509Certificate(issued.certificatePem).raw.toString("base64url"),
      requestSha256: createHash("sha256").update(input.requestPem).digest("hex") };
  });
  const requests = [];
  let discardCompletionResponse = false;
  let origin;
  if (throughParent) {
    ownedChild = fork(new URL("./fixtures/native-parent-ingress-child.mjs", import.meta.url),
      ["--isolated-native-parent-ingress-child"], { stdio: ["ignore", "pipe", "pipe", "ipc"], windowsHide: true });
    // Never relay fixture output, DB credentials, tokens, certificates or paths.
    ownedChild.stdout.resume(); ownedChild.stderr.resume();
    const current = () => ownedChild.connected && ownedChild.exitCode === null;
    const send = ownedChild.send.bind(ownedChild);
    ownedChild.send = (message, ...options) => {
      const serialized = JSON.stringify(message);
      assert.equal(serialized.includes(host.server.privateKeyPem), false);
      assert.equal(serialized.includes(host.memberIssuer.privateKeyPem), false);
      assert.doesNotMatch(serialized, /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/);
      return send(message, ...options);
    };
    const signer = createSpsNativeMemberMainSigner({
      getAuthority: () => ({ ownerSubject: "fixture-host", userDataDirectory: "isolated-memory-profile",
        vaultDirectory: "isolated-memory-vault", generation: 1n }),
      authenticateHost: async () => {}, getStore: () => ({ read: async () => host }),
    });
    // Fixed counters identify a broken process boundary without exposing raw
    // child output, identity material or per-request credentials.
    signerChannel = attachSpsNativeMemberSignerChannel(ownedChild, {
      async inspect(options) {
        signingEvidence.inspectRequests++;
        try { const value = await signer.inspect(options); signingEvidence.inspectSuccess++; return value; }
        catch (error) { signingEvidence.inspectFailure++; throw error; }
      },
      async sign(input, options) {
        signingEvidence.signRequests++;
        try { const value = await signer.sign(input, options); signingEvidence.signSuccess++; return value; }
        catch (error) { signingEvidence.signFailure++; throw error; }
      },
      dispose: () => signer.dispose(),
    }, { isCurrent: current });
    parentIngress = createSpsNativeParentIngressClient(ownedChild, { isCurrent: current });
    const ready = await new Promise((resolve, reject) => {
      const stages = ["imports-db", "imports-identity", "imports-enrollment", "imports-ingress",
        "identity-init", "enrollment-init", "ingress-init"];
      let lastStage = "waiting-for-configuration";
      let configurationSent = false;
      const timer = setTimeout(() => finish(new Error(
        `Isolated Core child did not become ready (last stage: ${lastStage}).`)), 30_000);
      const onError = () => finish(new Error("Isolated Core child failed."));
      const onMessage = message => {
        if (message?.kind === "sps.test.native-parent.ready") finish(null, message.identity);
        else if (message?.kind === "sps.test.native-parent.configure-ready") {
          if (configurationSent) {
            finish(new Error("Isolated Core child repeated its configuration handshake."));
            return;
          }
          configurationSent = true;
          lastStage = "waiting-for-configuration";
          ownedChild.send({ kind: "sps.test.native-parent.configure", connectionString: database.connectionString,
            issuer: fixtureIssuer, publicJwk: { ...jwk, kid, alg: "RS256", use: "sig" } }, error => { if (error) onError(); });
        }
        else if (message?.kind === "sps.test.native-parent.progress" && stages.includes(message.stage)) {
          lastStage = message.stage;
        }
        else if (message?.kind === "sps.test.native-parent.failure"
          && stages.includes(message.stage)) {
          finish(new Error(`Isolated Core child failed at ${message.stage}.`));
        }
      };
      function finish(error, value) {
        clearTimeout(timer); ownedChild.removeListener("message", onMessage);
        ownedChild.removeListener("error", onError); ownedChild.removeListener("exit", onError);
        if (error) reject(error); else resolve(value);
      }
      ownedChild.on("message", onMessage); ownedChild.once("error", onError); ownedChild.once("exit", onError);
    });
    assert.deepEqual(ready, { hostId, serverSpkiSha256: serverPin, issuerSpkiSha256: issuerPin,
      issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url") });
    productIngress = createSpsNativeHostIngress({ getIdentity: () => host,
      assertCurrent() { assert.equal(current(), true); },
      dispatch: async (operation, request, options) => {
        const suffix = operation === "identity" ? "identity" : operation.replaceAll(".", "/");
        requests.push({ path: `/sps-native/v1/${suffix}`, hasBearer: Boolean(request.credential?.accessToken),
          hasCookie: Boolean(request.credential?.sessionCookie), tls: request.transport.tlsVersion,
          resumed: request.transport.sessionReused, clientAuthorized: Boolean(request.transport.peerCertificateDer) });
        const result = await parentIngress.dispatch(operation, request, options);
        if (discardCompletionResponse && operation === "enrollment.complete") {
          discardCompletionResponse = false;
          // Core has committed; withhold the response until the real client
          // deadline closes its TLS socket. The listener suppresses late output.
          await new Promise(resolve => {
            if (options.signal.aborted) resolve(); else options.signal.addEventListener("abort", resolve, { once: true });
          });
        }
        return result;
      },
    });
    const listening = await productIngress.start({ bindAddress: "127.0.0.1", port: 0 });
    origin = `https://127.0.0.1:${listening.port}`;
  } else {
  exchange = createSpsNativeSessionExchangeRequestHandler(identity,
    { readTimeoutMs: 1000, operationTimeoutMs: 5000, maxConcurrentRequests: 2 });
  enrollment = createSpsNativeEnrollmentRequestHandler(createSpsNativeSessionEnrollment(identity, service),
    { maxBodyBytes: 8192, readTimeoutMs: 1000, operationTimeoutMs: 5000, maxConcurrentRequests: 2 });
  metadataHandler = createSpsNativeIdentityRequestHandler(async () => ({ hostId, serverSpkiSha256: serverPin,
    issuerSpkiSha256: issuerPin, issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url") }),
  { readTimeoutMs: 1000, operationTimeoutMs: 5000, maxConcurrentRequests: 2 });
  server = createServer({ cert: host.server.certificatePem, key: host.server.privateKeyPem,
    ca: host.memberIssuer.certificatePem, requestCert: true, rejectUnauthorized: false,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3", secureOptions: constants.SSL_OP_NO_TICKET }, (req, res) => {
    requests.push({ path: req.url, hasBearer: typeof req.headers.authorization === "string",
      hasCookie: typeof req.headers.cookie === "string", tls: req.socket.getProtocol(), resumed: req.socket.isSessionReused(),
      clientAuthorized: req.socket.authorized });
    if (discardCompletionResponse && req.url === "/sps-native/v1/enrollment/complete") {
      discardCompletionResponse = false;
      // Commit through the real Core handler, then lose only the response.
      res.end = () => { res.destroy(); return res; };
    }
    if (req.url === "/sps-native/v1/identity") metadataHandler.handle(req, res);
    else if (req.url === "/sps-native/v1/session/exchange") exchange.handle(req, res);
    else enrollment.handle(req, res);
  });
  server.on("tlsClientError", () => {});
  server.on("connection", socket => {
    sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  origin = `https://127.0.0.1:${server.address().port}`;
  }
  function invite(identity = host) {
    return createSpsNativeInviteCode({ v: 2, kind: "sps.native-lan.pairing", hostId, origin,
      spkiSha256: fingerprint(identity.server.certificatePem),
      serverCertificate: new X509Certificate(identity.server.certificatePem).raw.toString("base64url"), ...invitation });
  }
  let context = { identityIssuer: fixtureIssuer, subject: "fixture-member", hostId, deviceKeyId,
    serverSpkiSha256: serverPin, issuerSpkiSha256: issuerPin };
  const client = (invitationCode = invite(), expected = context) => {
    const instance = createSpsNativeEnrollmentClient({ invitationCode, context: expected, timeoutMs: 8000, assertCurrent() {} });
    clients.push(instance); return instance;
  };
  const token = () => {
    const header = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ iss: fixtureIssuer, aud: "sps-core", sub: context.subject,
      email: "member@example.test", name: "Fixture Member", scope: "sps.core.session",
      exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
    return `${header}.${payload}.${sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), keys.privateKey).toString("base64url")}`;
  };
  if (mode === "--isolated-native-member-controller" || throughParent) {
    const tempRoot = localFixtureRoot = await mkdtemp(path.join(os.tmpdir(), "sps-native-member-main-core-"));
    localFixtureIdentity = await lstat(tempRoot, { bigint: true });
    localFixtureCanonical = await realpath(tempRoot);
    localFixtureParent = await realpath(os.tmpdir());
    assert.equal(localFixtureIdentity.isDirectory() && !localFixtureIdentity.isSymbolicLink(), true);
    assert.equal(path.dirname(localFixtureCanonical), localFixtureParent);
    assert.ok(path.basename(localFixtureCanonical).startsWith("sps-native-member-main-core-"));
    const userDataDirectory = path.join(tempRoot, "user-data");
    const vaultDirectory = path.join(tempRoot, "owner-vault");
    await Promise.all([mkdir(userDataDirectory), mkdir(vaultDirectory)]);
    const statePath = path.join(userDataDirectory, "native-member-index.json");
    const protectionKey = randomBytes(32);
    // AES-GCM stands in for Electron safeStorage in this Node-only fixture.
    // This exercises the production capsule/store/controller composition, not DPAPI.
    const safeStorage = {
      isEncryptionAvailable: () => true,
      encryptString(value) {
        const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", protectionKey, iv);
        const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
      },
      decryptString(value) {
        const bytes = Buffer.from(value), decipher = createDecipheriv("aes-256-gcm", protectionKey, bytes.subarray(0, 12));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
      },
    };
    let index = { v: 1, entries: [] };
    async function persistIndex(next, { beforeCommit }) {
      beforeCommit();
      const temporary = `${statePath}.tmp`;
      await writeFile(temporary, JSON.stringify(next), { flag: "wx" });
      beforeCommit();
      await rename(temporary, statePath);
      index = next;
    }
    async function reloadIndex() { index = JSON.parse(await readFile(statePath, "utf8")); }
    function authority(subject = context.subject) {
      return { identityIssuer: fixtureIssuer, subject, userDataDirectory, vaultDirectory, generation: 1n };
    }
    function createController(subject = context.subject) {
      return createSpsNativeMemberController({
        getAuthority: () => authority(subject), getIndex: () => index, saveIndex: persistIndex,
        getStore: ({ userDataDirectory: data, vaultDirectory: vault, context: scopedContext }) =>
          createSpsNativeMemberPendingKeyStore({ userDataDirectory: data, vaultDirectory: vault,
            context: scopedContext, safeStorage, platform: "win32" }),
        getTargetReader: ({ userDataDirectory: data, vaultDirectory: vault, scope }) =>
          createSpsNativeMemberHostTargetReader({ userDataDirectory: data, vaultDirectory: vault,
            scope, safeStorage, platform: "win32" }),
        authenticate: async () => token(), timeoutMs: 8000,
      });
    }
    const memberController = createController();
    clients.push(memberController);
    discardCompletionResponse = true;
    await assert.rejects(memberController.enroll({ invitationCode: invite(), displayName: "Fixture Member PC" }, {
      confirm: async target => target.hostId === hostId && target.origin === origin,
    }));
    const registrations = memberController.list();
    assert.deepEqual(registrations, [{ hostId }]);
    const indexOnDisk = JSON.parse(await readFile(statePath, "utf8"));
    assert.deepEqual(indexOnDisk, index);
    assert.equal(index.entries.length, 1);
    const firstDeviceKeyId = index.entries[0].deviceKeyId;
    const beforeRecovery = {
      devices: await db.select().from(spsMemberDevices),
      deviceEvents: await db.select().from(spsMemberDeviceEvents),
      pairingEvents: await db.select().from(spsNativePairingEvents),
    };
    assert.equal(beforeRecovery.devices.length, 1, "Main enrollment committed despite losing only the completion response.");
    memberController.dispose();
    await reloadIndex();
    const restartedController = createController();
    clients.push(restartedController);
    const repaired = await restartedController.recover({ hostId });
    assert.equal(repaired.status, "pending");
    assert.equal(repaired.deviceId, beforeRecovery.devices[0].id);
    assert.deepEqual(await restartedController.recover({ hostId }), repaired);
    assert.deepEqual(await db.select().from(spsMemberDevices), beforeRecovery.devices);
    assert.deepEqual(await db.select().from(spsMemberDeviceEvents), beforeRecovery.deviceEvents);
    assert.deepEqual(await db.select().from(spsNativePairingEvents), beforeRecovery.pairingEvents);
    assert.deepEqual(restartedController.list(), [{ hostId }]);
    assert.equal(index.entries[0].deviceKeyId, firstDeviceKeyId, "The persisted account/Host key ID remains stable across controller reconstruction.");
    const requestsBeforeWrongAccount = requests.length;
    const wrongAccountController = createController("different-account");
    clients.push(wrongAccountController);
    await assert.rejects(wrongAccountController.recover({ hostId }));
    assert.equal(requests.length, requestsBeforeWrongAccount, "A different current account cannot reach the Host or use the retained key.");
    const devices = await db.select().from(spsMemberDevices);
    assert.equal(devices.length, 1);
    assert.equal(devices[0].status, "pending");
    assert.equal((await db.select().from(spsNativePairings))[0].status, "consumed");
    assert.equal((await db.select().from(spsNativeEnrollments))[0].status, "issued");
    for (const table of [agents, plugins, companyMemberships, spsNodes]) assert.deepEqual(await db.select().from(table), []);
    assert.ok(requests.every(row => row.tls === "TLSv1.3" && row.resumed === false));
    assert.ok(requests.filter(row => row.path.endsWith("/complete")).every(row => row.clientAuthorized));
    assert.ok(requests.filter(row => row.path.endsWith("/reconcile")).every(row => row.clientAuthorized));
    assert.equal(requests.filter(row => row.path.endsWith("/complete")).length, 1);
    assert.equal(requests.filter(row => row.path.endsWith("/reconcile")).length, 2);
    assert.equal(requests.length, 8, "Only explicit bootstrap/enrollment/recovery calls reach the isolated listener.");
  } else {
  const other = await createSpsNativeHostIdentity({ hostId, hostnames: ["127.0.0.1"], notBefore: now - 1000,
    notAfter: now + 86_400_000, issuerNotAfter: now + 2 * 86_400_000 });
  await assert.rejects(client(invite(other), { ...context, serverSpkiSha256: fingerprint(other.server.certificatePem) }).exchange(token()));
  assert.equal(requests.length, 0, "Wrong actual peer must fail before HTTP credentials.");
  assert.deepEqual(await db.select().from(authSessions), []);
  const bootstrap = createSpsNativeEnrollmentBootstrap({ invitationCode: invite(), timeoutMs: 8000, assertCurrent() {} });
  clients.push(bootstrap);
  const metadata = await bootstrap.inspect();
  assert.equal(metadata.hostId, hostId);
  assert.equal(metadata.serverSpkiSha256, serverPin);
  assert.equal(metadata.issuerSpkiSha256, issuerPin);
  assert.equal(metadata.issuerCertificatePem, host.memberIssuer.certificatePem);
  assert.deepEqual(await db.select().from(authSessions), []);
  assert.deepEqual(await db.select().from(spsMemberDevices), []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].hasBearer, false);
  assert.equal(requests[0].hasCookie, false);
  context = { ...context, issuerSpkiSha256: metadata.issuerSpkiSha256 };
  const member = client();
  assert.equal((await member.exchange(token())).state, "session_prepared");
  const key = await createSpsNativeMemberKeyRequest({ hostId, deviceKeyId });
  const issued = await member.issue(key);
  const repeated = await member.issue(key);
  assert.deepEqual(repeated, issued, "An explicit repeated issue keeps the same issuance, not a second signing.");
  assert.equal(signings, 1);
  discardCompletionResponse = true;
  await assert.rejects(member.complete({ keyRequest: key, issuance: issued, displayName: "Fixture Member PC" }));
  member.dispose();
  const beforeRecovery = {
    devices: await db.select().from(spsMemberDevices),
    deviceEvents: await db.select().from(spsMemberDeviceEvents),
    pairingEvents: await db.select().from(spsNativePairingEvents),
  };
  assert.equal(beforeRecovery.devices.length, 1, "The registration committed despite losing its HTTP response.");
  const recovery = createSpsNativeEnrollmentRecoveryClient({ target: { v: 1, kind: "sps.native.member-host-target",
    context, origin, serverCertificatePem: host.server.certificatePem }, context, timeoutMs: 8000, assertCurrent() {} });
  clients.push(recovery);
  await recovery.exchange(token());
  const completed = await recovery.reconcile({ keyRequest: key, issuance: issued });
  assert.equal(completed.status, "pending");
  assert.deepEqual(await recovery.reconcile({ keyRequest: key, issuance: issued }), completed);
  assert.deepEqual(await db.select().from(spsMemberDevices), beforeRecovery.devices);
  assert.deepEqual(await db.select().from(spsMemberDeviceEvents), beforeRecovery.deviceEvents);
  assert.deepEqual(await db.select().from(spsNativePairingEvents), beforeRecovery.pairingEvents);
  const devices = await db.select().from(spsMemberDevices);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].id, completed.deviceId);
  assert.equal(devices[0].status, "pending");
  assert.equal(devices[0].approvedAt, null);
  const users = await db.select().from(authUsers);
  assert.equal(devices[0].ownerUserId, users.find(user => user.email === "member@example.test").id);
  assert.equal((await db.select().from(spsNativePairings))[0].status, "consumed");
  assert.equal((await db.select().from(spsNativeEnrollments))[0].status, "issued");
  assert.ok((await db.select().from(spsMemberDeviceEvents)).length > 0);
  assert.ok((await db.select().from(spsNativePairingEvents)).length > 0);
  const replay = client();
  await replay.exchange(token());
  await assert.rejects(replay.complete({ keyRequest: key, issuance: issued, displayName: "Replay PC" }));
  assert.equal((await db.select().from(spsMemberDevices)).length, 1);
  assert.equal(signings, 1);
  for (const table of [agents, plugins, companyMemberships, spsNodes]) assert.deepEqual(await db.select().from(table), []);
  assert.ok(requests.every(row => row.tls === "TLSv1.3" && row.resumed === false));
  assert.ok(requests.filter(row => row.path.endsWith("/complete")).every(row => row.clientAuthorized));
  assert.ok(requests.filter(row => row.path.endsWith("/reconcile")).every(row => row.clientAuthorized));
  assert.ok(requests.filter(row => !row.path.endsWith("/identity")).every(row => row.hasBearer !== row.hasCookie));
  assert.equal(requests.length, 10, "Only explicit bootstrap/enrollment/recovery calls reach this fixture.");
  const pendingInvites = [];
  for (let index = 0; index < 10; index++) pendingInvites.push(await pairings.issue(defaultSpsNativePairingIssue("fixture-host")));
  await assert.rejects(pairings.issue(defaultSpsNativePairingIssue("fixture-host")), { code: "limit_reached" });
  const accountId = devices[0].ownerUserId;
  for (let attempt = 0; attempt < 5; attempt++) {
    await assert.rejects(pairings.withEnrollmentInvitation({ pairingId: pendingInvites[0].pairingId,
      pairingSecret: Buffer.alloc(32, 9).toString("base64url"), userId: accountId }, async () => {
      assert.fail("Wrong secret must not invoke the enrollment operation.");
    }));
  }
  const exhausted = (await pairings.listHost()).find(item => item.id === pendingInvites[0].pairingId);
  assert.equal(exhausted.status, "exhausted");
  assert.equal(exhausted.failedAttempts, 5);
  assert.equal(exhausted.maxAttempts, 5);
  await assert.rejects(pairings.withEnrollmentInvitation({ pairingId: pendingInvites[0].pairingId,
    pairingSecret: pendingInvites[0].pairingSecret, userId: accountId }, async () => {
    assert.fail("Even the correct secret must not revive an exhausted invitation.");
  }));
  const replacement = await pairings.issue(defaultSpsNativePairingIssue("fixture-host"));
  assert.equal(replacement.expiresAt - replacement.issuedAt, 3_600_000);
  assert.equal((await pairings.listHost()).filter(item => item.status === "pending").length, 10);
  for (const table of [agents, plugins, companyMemberships, spsNodes]) assert.deepEqual(await db.select().from(table), []);
  }
  if (throughParent) {
    assert.ok(signingEvidence.inspectSuccess >= 1);
    assert.equal(signingEvidence.signSuccess, 1);
    assert.equal(signingEvidence.inspectFailure + signingEvidence.signFailure, 0);
  }
  succeeded = true;
} catch (error) {
  integrationFailure = error;
  if (throughParent) console.error("Isolated signer boundary counts:", JSON.stringify(signingEvidence));
  throw error;
} finally {
  let childCleanupFailure = null;
  for (const client of clients) client.dispose();
  await productIngress?.dispose();
  parentIngress?.dispose();
  if (ownedChild) {
    try {
      await new Promise((resolve, reject) => {
        if (ownedChild.exitCode !== null || ownedChild.signalCode !== null) {
          if (ownedChild.exitCode === 0) resolve(); else reject(new Error("Isolated Core child failed."));
          return;
        }
        const timer = setTimeout(() => { reject(new Error("Isolated Core child did not exit naturally.")); }, 20_000);
        ownedChild.once("exit", code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error("Isolated Core child failed.")); });
        if (ownedChild.connected) ownedChild.send({ kind: "sps.test.native-parent.stop" });
      });
    } catch (error) {
      if (ownedChild.exitCode === null && ownedChild.signalCode === null) {
        // Test-failure cleanup only, never counted as natural-exit success.
        const exited = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("Isolated Core failure cleanup could not confirm exit.")), 10_000);
          ownedChild.once("exit", () => { clearTimeout(timer); resolve(); });
        });
        ownedChild.kill();
        await exited;
      }
      if (!integrationFailure) childCleanupFailure = error;
    } finally { signerChannel?.dispose(); }
  }
  metadataHandler?.dispose(); exchange?.dispose(); enrollment?.dispose();
  for (const socket of sockets) socket.destroy();
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  globalThis.fetch = previousFetch;
  await db.$client.end();
  try { await database.cleanup(); }
  catch (cleanupError) {
    if (integrationFailure) throw new AggregateError([integrationFailure, cleanupError], "Native integration and owned database cleanup both failed.");
    throw cleanupError;
  }
  if (localFixtureRoot) {
    const current = await lstat(localFixtureRoot, { bigint: true });
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(current.dev, localFixtureIdentity?.dev);
    assert.equal(current.ino, localFixtureIdentity?.ino);
    assert.equal(current.birthtimeNs, localFixtureIdentity?.birthtimeNs);
    assert.equal(await realpath(localFixtureRoot), localFixtureCanonical);
    assert.equal(path.dirname(localFixtureCanonical), localFixtureParent);
    assert.ok(path.basename(localFixtureCanonical).startsWith("sps-native-member-main-core-"));
    await rm(localFixtureRoot, { recursive: true, force: true });
    assert.equal(existsSync(localFixtureRoot), false, "The exact isolated Member fixture directory must be removed.");
  }
  if (childCleanupFailure) throw childCleanupFailure;
}
assert.equal(succeeded, true);
if (throughParent) {
  const resources = Object.create(null);
  for (const name of process.getActiveResourcesInfo()) resources[name] = (resources[name] ?? 0) + 1;
  console.error("Isolated final resource counts:", JSON.stringify(resources));
}
console.log(throughParent
  ? "Native parent ingress integration passed: real Main TLS listener and direct-child IPC, real Core Identity/DB/enrollment and child-to-Main signing, pending registration committed before a lost response, persisted Member controller reconstructed for read-only recovery with no new rows/events, wrong current account denied before network, and isolated Core child exited naturally. Host private keys remained in parent memory; AES safeStorage substitute, not DPAPI, Desktop UI, physical LAN or product startup qualification."
  : mode === "--isolated-native-member-controller"
  ? "Native Main controller/Core integration passed: real temporary Core DB + fresh loopback TLS, production enrollment/controller/client/store factories, stable persisted account/Host index, dropped post-commit completion response recovered after controller reconstruction without invitation/re-enrollment/new rows/events, and wrong current account denied before network; AES safeStorage substitute only, not DPAPI, product listener, Desktop UI, or two-PC/LAN qualification."
  : "Native enrollment client/Core integration passed: pinned public issuer bootstrap before account session, actual temporary DB/session/issuance/fresh mTLS pending registration, lost completion response recovered read-only using the existing certificate without an invitation or new device/events, wrong peer sends no HTTP credentials, one-use replay denied, approved 1-hour/5-attempt/10-active policy enforced, no Workspace/Plugin/Agent/Node grant; loopback/source only, not Desktop UI/DPAPI/two-PC/LAN qualification.");

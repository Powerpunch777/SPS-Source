import assert from "node:assert/strict";
import { constants, createHash, generateKeyPairSync, randomUUID, sign, X509Certificate } from "node:crypto";
import { createServer } from "node:https";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate } from "../src/native-member-certificates.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { createSpsNativeEnrollmentClient } from "../src/native-enrollment-client.mjs";
import { defaultSpsNativePairingIssue, SPS_NATIVE_PAIRING_DEFAULT_POLICY } from "../src/native-connection-policy.mjs";

// Cross-repository verification only: never imported by product Main. Run with
// the pinned Core's tsx loader so its real services and DB migrations are used.
if (process.argv.length !== 3 || process.argv[2] !== "--isolated-native-enrollment-client") {
  throw new Error("Use the isolated Native enrollment client integration command.");
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
const support = await getEmbeddedPostgresTestSupport();
assert.equal(support.supported, true, "The real isolated Core database must be supported; do not skip integration.");
const database = await startEmbeddedPostgresTestDatabase("sps-native-client-core-");
const db = createDb(database.connectionString);
const previousFetch = globalThis.fetch;
const clients = [], sockets = new Set();
let server, exchange, enrollment;
let succeeded = false;
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
    pairingPolicy: policy, certificateLifetimeMs: 60_000, signingTimeoutMs: 2000, maxConcurrentSignings: 2 }, async input => {
    signings++;
    const issued = await issueSpsNativeMemberCertificate({ hostIdentity: host,
      request: { v: 1, kind: "sps.native.member-enrollment-request", hostId, deviceKeyId: input.deviceKeyId,
        requestPem: input.requestPem }, notBefore: input.notBefore, notAfter: input.notAfter, now: Date.now() });
    return { certificate: new X509Certificate(issued.certificatePem).raw.toString("base64url"),
      requestSha256: createHash("sha256").update(input.requestPem).digest("hex") };
  });
  exchange = createSpsNativeSessionExchangeRequestHandler(identity,
    { readTimeoutMs: 1000, operationTimeoutMs: 5000, maxConcurrentRequests: 2 });
  enrollment = createSpsNativeEnrollmentRequestHandler(createSpsNativeSessionEnrollment(identity, service),
    { maxBodyBytes: 8192, readTimeoutMs: 1000, operationTimeoutMs: 5000, maxConcurrentRequests: 2 });
  const requests = [];
  server = createServer({ cert: host.server.certificatePem, key: host.server.privateKeyPem,
    ca: host.memberIssuer.certificatePem, requestCert: true, rejectUnauthorized: false,
    minVersion: "TLSv1.3", maxVersion: "TLSv1.3", secureOptions: constants.SSL_OP_NO_TICKET }, (req, res) => {
    requests.push({ path: req.url, hasBearer: typeof req.headers.authorization === "string",
      hasCookie: typeof req.headers.cookie === "string", tls: req.socket.getProtocol(), resumed: req.socket.isSessionReused(),
      clientAuthorized: req.socket.authorized });
    if (req.url === "/sps-native/v1/session/exchange") exchange.handle(req, res);
    else enrollment.handle(req, res);
  });
  server.on("tlsClientError", () => {});
  server.on("connection", socket => {
    sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const origin = `https://127.0.0.1:${server.address().port}`;
  function invite(identity = host) {
    return createSpsNativeInviteCode({ v: 2, kind: "sps.native-lan.pairing", hostId, origin,
      spkiSha256: fingerprint(identity.server.certificatePem),
      serverCertificate: new X509Certificate(identity.server.certificatePem).raw.toString("base64url"), ...invitation });
  }
  const context = { identityIssuer: fixtureIssuer, subject: "fixture-member", hostId, deviceKeyId,
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
  const other = await createSpsNativeHostIdentity({ hostId, hostnames: ["127.0.0.1"], notBefore: now - 1000,
    notAfter: now + 86_400_000, issuerNotAfter: now + 2 * 86_400_000 });
  await assert.rejects(client(invite(other), { ...context, serverSpkiSha256: fingerprint(other.server.certificatePem) }).exchange(token()));
  assert.equal(requests.length, 0, "Wrong actual peer must fail before HTTP credentials.");
  assert.deepEqual(await db.select().from(authSessions), []);
  const member = client();
  assert.equal((await member.exchange(token())).state, "session_prepared");
  const key = await createSpsNativeMemberKeyRequest({ hostId, deviceKeyId });
  const issued = await member.issue(key);
  const repeated = await member.issue(key);
  assert.deepEqual(repeated, issued, "An explicit repeated issue keeps the same issuance, not a second signing.");
  assert.equal(signings, 1);
  const completed = await member.complete({ keyRequest: key, issuance: issued, displayName: "Fixture Member PC" });
  assert.equal(completed.status, "pending");
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
  assert.ok(requests.every(row => row.hasBearer !== row.hasCookie));
  assert.equal(requests.length, 6, "Only explicit exchange/issue/complete calls reach this fixture.");
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
  succeeded = true;
} finally {
  for (const client of clients) client.dispose();
  exchange?.dispose(); enrollment?.dispose();
  for (const socket of sockets) socket.destroy();
  if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  globalThis.fetch = previousFetch;
  await db.$client.end();
  await database.cleanup();
}
assert.equal(succeeded, true);
console.log("Native enrollment Main-private client/Core integration passed: actual temporary DB/session/issuance/fresh mTLS pending registration, wrong peer sends no HTTP credentials, one-use replay denied, approved 1-hour/5-attempt/10-active policy enforced, no Workspace/Plugin/Agent/Node grant; loopback/source only, not Desktop UI/DPAPI/two-PC/LAN qualification.");

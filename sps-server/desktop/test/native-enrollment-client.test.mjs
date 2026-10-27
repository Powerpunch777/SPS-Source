import assert from "node:assert/strict";
import { constants, createHash, X509Certificate } from "node:crypto";
import { createServer } from "node:https";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate,
  publicSpsNativeMemberEnrollmentRequest } from "../src/native-member-certificates.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { createSpsNativeEnrollmentBootstrap, createSpsNativeEnrollmentClient,
  createSpsNativeEnrollmentRecoveryClient, createSpsNativeMemberWorkspaceClient,
  createSpsNativeMemberRenewalClient, createSpsNativeServerCertificateClient } from "../src/native-enrollment-client.mjs";
import { nativeServerCertificateServername } from "../src/native-server-certificate-selection.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const DEVICE = "22222222-2222-4222-8222-222222222222";
const PAIRING = "33333333-3333-4333-8333-333333333333";
const ENROLLMENT = "44444444-4444-4444-8444-444444444444";
const TOKEN = "fixture.header.signature", COOKIE = `sps_identity_session=${"x".repeat(64)}`;

test("Native Plugin client sends only fixed scoped POST over fresh mTLS and validates large asset responses", async t => {
  const source = Buffer.alloc(300_000, 65);
  const asset = { path: "index.js", contentType: "text/javascript; charset=utf-8", bytes: source.toString("base64url"),
    sha256: createHash("sha256").update(source).digest("hex") };
  const f = await fixture(t, { respond({ item, send, value }) {
    send(item.path === "/sps-native/v1/plugin-runtime" ? { data: asset } : value);
  } });
  const client = f.workspaceClient();
  await client.exchange(TOKEN);
  const request = { pluginId: PAIRING, surface: "widget", surfaceId: "count", revision: "a".repeat(64),
    operation: "asset", key: "index.js", params: {} };
  assert.deepEqual(await client.invokePlugin({ workspaceId: DEVICE, request, keyRequest, issuance: f.issuance }), { data: asset });
  const observed = f.requests.at(-1);
  assert.equal(observed.path, "/sps-native/v1/plugin-runtime");
  assert.equal(observed.nativeWorkspace, DEVICE);
  assert.equal(observed.contentType, "application/json");
  assert.equal(observed.body, JSON.stringify(request));
  assert.equal(observed.cookie, COOKIE); assert.equal(observed.authorization, undefined);
  assert.equal(observed.authorized, true); assert.equal(observed.resumed, false);
  const before = f.requests.length;
  await assert.rejects(client.invokePlugin({ workspaceId: DEVICE,
    request: { ...request, key: "../key.js" }, keyRequest, issuance: f.issuance }));
  assert.equal(f.requests.length, before);
});

test("Native Node client uses its fixed target, current Member mTLS, and 1 MiB response envelope", async t => {
  const result = { accepted: true, detail: "x".repeat(200 * 1024) };
  const f = await fixture(t, { respond({ item, send, value }) {
    send(item.path === "/sps-native/v1/node-runtime" ? { data: result } : value);
  } });
  const client = f.workspaceClient();
  await client.exchange(TOKEN);
  const request = { operation: "command-event", nodeId: "55555555-5555-4555-8555-555555555555",
    resourceId: "66666666-6666-4666-8666-666666666666", payload: {
      timestamp: "2026-10-27T04:00:00.000Z", nonce: "A".repeat(43), signature: "B".repeat(86),
      sequence: 1, stream: "stdout", body: "x".repeat(96 * 1024),
    } };
  assert.deepEqual(await client.invokeNode({ workspaceId: DEVICE, request, keyRequest, issuance: f.issuance }), { data: result });
  const observed = f.requests.at(-1);
  assert.equal(observed.path, "/sps-native/v1/node-runtime");
  assert.equal(observed.nativeWorkspace, DEVICE);
  assert.equal(observed.contentType, "application/json");
  assert.equal(observed.body, JSON.stringify(request));
  assert.equal(String(Buffer.byteLength(observed.body)), observed.contentLength);
  assert.equal(observed.cookie, COOKIE);
  assert.equal(observed.authorization, undefined);
  assert.equal(observed.authorized, true);
  assert.equal(observed.resumed, false);
  const before = f.requests.length;
  await assert.rejects(client.invokeNode({ workspaceId: DEVICE,
    request: { ...request, target: "https://outside.invalid" }, keyRequest, issuance: f.issuance }));
  await assert.rejects(client.invokeNode({ workspaceId: DEVICE, request: { ...request,
    payload: { ...request.payload, body: "x".repeat(512 * 1024) } }, keyRequest, issuance: f.issuance }));
  assert.equal(f.requests.length, before);
});

test("Inbox state uses the exact PATCH body with saved mTLS credentials", async t => {
  const value = { readAt: "2026-10-27T00:00:00.000Z", archivedAt: null };
  const f = await fixture(t, { respond({ item, send, value: fallback }) {
    send(item.method === "PATCH" ? value : fallback);
  } });
  const client = f.workspaceClient();
  await client.exchange(TOKEN);
  assert.deepEqual(await client.updateInboxState({ workspaceId: DEVICE,
    state: { itemId: PAIRING, read: true }, keyRequest, issuance: f.issuance }), value);
  const request = f.requests.at(-1);
  assert.equal(request.path, `/api/companies/${DEVICE}/workspace-inbox/${PAIRING}`);
  assert.equal(request.method, "PATCH");
  assert.equal(request.contentType, "application/json");
  assert.equal(request.body, '{"read":true}');
  assert.equal(request.cookie, COOKIE);
  assert.equal(request.authorization, undefined);
  assert.equal(request.authorized, true);
  assert.equal(request.resumed, false);
  const before = f.requests.length;
  await assert.rejects(client.updateInboxState({ workspaceId: DEVICE,
    state: { itemId: PAIRING, read: true, url: "/other" }, keyRequest, issuance: f.issuance }));
  assert.equal(f.requests.length, before);
});
const spki = pem => createHash("sha256").update(new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" })).digest("hex");
let host, other, keyRequest, certificate;
before(async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const options = { hostId: HOST, hostnames: ["127.0.0.1"], notBefore: now - 60_000,
    notAfter: now + 86_400_000, issuerNotAfter: now + 2 * 86_400_000 };
  host = await createSpsNativeHostIdentity(options);
  other = await createSpsNativeHostIdentity(options);
  keyRequest = await createSpsNativeMemberKeyRequest({ hostId: HOST, deviceKeyId: DEVICE });
  certificate = await issueSpsNativeMemberCertificate({ hostIdentity: host,
    request: await publicSpsNativeMemberEnrollmentRequest(keyRequest), notBefore: now - 1000,
    notAfter: now + 3_600_000, now });
});

async function fixture(t, { identity = host, respond, version = "TLSv1.3" } = {}) {
  const requests = [], sockets = new Set();
  let notify;
  const received = new Promise(resolve => { notify = resolve; });
  const expiresAt = Date.now() + 60_000;
  const issuance = { enrollmentId: ENROLLMENT,
    certificate: new X509Certificate(certificate.certificatePem).raw.toString("base64url"),
    issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url"),
    expiresAt: new Date(expiresAt).toISOString() };
  const server = createServer({ key: identity.server.privateKeyPem, cert: identity.server.certificatePem,
    ca: host.memberIssuer.certificatePem, requestCert: true, rejectUnauthorized: false,
    minVersion: version, maxVersion: version, secureOptions: constants.SSL_OP_NO_TICKET }, (req, res) => {
    const chunks = [];
    req.on("error", () => {});
    res.on("error", () => {});
    req.on("data", chunk => chunks.push(chunk));
    req.once("end", () => {
      const item = { path: req.url, method: req.method, authorization: req.headers.authorization,
        nativeWorkspace: req.headers["x-sps-native-workspace"],
        cookie: req.headers.cookie, contentType: req.headers["content-type"], contentLength: req.headers["content-length"],
        body: Buffer.concat(chunks).toString("utf8"),
        protocol: req.socket.getProtocol(), resumed: req.socket.isSessionReused(), authorized: req.socket.authorized,
        servername: req.socket.servername,
        peer: req.socket.getPeerCertificate().raw };
      requests.push(item); notify();
      const exchange = req.url === "/sps-native/v1/session/exchange";
      const serverCertificate = req.url === "/sps-native/v1/server-certificate";
      const workspaces = req.url === "/sps-native/v1/workspaces";
      const workspaceBootstrap = req.url === `/api/companies/${DEVICE}/workspace-bootstrap`;
      const workspaceSurfaces = new Map([
        [`/api/companies/${DEVICE}/workspace-shell`, { mode: "neutral", providerPluginId: null,
          providerPluginKey: null, shell: null, fallbackReason: null }],
        [`/api/companies/${DEVICE}/workspace-shell/providers`, []],
        [`/api/companies/${DEVICE}/workspace-dashboard`, { widgets: [] }],
        [`/api/companies/${DEVICE}/execution-control`, { state: "paused", epoch: "2", revision: 4, updatedAt: null,
          pending: { agents: 0, jobs: 1, models: 0, commands: 0, plugins: 0 }, canControl: false }],
        [`/api/companies/${DEVICE}/workspace-inbox`, { items: [{ id: "55555555-5555-4555-8555-555555555555", companyId: DEVICE, title: "Inbox" }] }],
        [`/api/companies/${DEVICE}/workspace-inbox?archived=true`, { items: [{ id: "55555555-5555-4555-8555-555555555555", companyId: DEVICE, title: "Archived" }] }],
      ]);
      const workspaceSurface = workspaceSurfaces.has(req.url);
      const value = req.url === "/sps-native/v1/identity" ? { hostId: HOST,
        serverSpkiSha256: spki(host.server.certificatePem), issuerSpkiSha256: spki(host.memberIssuer.certificatePem),
        issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url") }
        : serverCertificate ? { hostId: HOST,
          predecessorCertificateSha256: createHash("sha256").update(new X509Certificate(host.server.certificatePem).raw).digest("hex"),
          serverCertificate: new X509Certificate(host.server.certificatePem).raw.toString("base64url"),
          issuerSpkiSha256: spki(host.memberIssuer.certificatePem) }
        : exchange ? { expiresInSeconds: 604800 }
          : workspaces ? [{ id: DEVICE, name: "Member Workspace" }]
        : workspaceBootstrap ? { v: 1, kind: "sps.native.workspace.bootstrap",
          workspace: { id: DEVICE, name: "Member Workspace", issuePrefix: "member" }, member: { userId: "fixture-user" },
          capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] }
        : workspaceSurface ? workspaceSurfaces.get(req.url)
        : req.url.endsWith("/issue") ? issuance : { deviceId: DEVICE, status: "pending" };
      const send = (data = value, status = exchange ? 201 : 200, extraHeaders = {}) => {
        if (res.destroyed) return;
        const bytes = Buffer.from(typeof data === "string" ? data : JSON.stringify(data));
        res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": bytes.length,
          "Cache-Control": "no-store", Connection: "close",
          ...(exchange ? { "Set-Cookie": `${COOKIE}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax` } : {}), ...extraHeaders });
        res.end(bytes);
      };
      if (respond) respond({ req, res, item, send, value }); else send();
    });
  });
  server.on("tlsClientError", () => {});
  server.on("connection", socket => {
    sockets.add(socket); socket.on("error", () => {}); socket.once("close", () => sockets.delete(socket));
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const code = createSpsNativeInviteCode({ v: 2, kind: "sps.native-lan.pairing", hostId: HOST,
    origin: `https://127.0.0.1:${server.address().port}`, spkiSha256: spki(host.server.certificatePem),
    serverCertificate: new X509Certificate(host.server.certificatePem).raw.toString("base64url"),
    pairingId: PAIRING, pairingSecret: Buffer.alloc(32, 7).toString("base64url"), issuedAt: Date.now() - 1000, expiresAt });
  const context = { identityIssuer: "https://identity.example.test", subject: "fixture-member", hostId: HOST,
    deviceKeyId: DEVICE, serverSpkiSha256: spki(host.server.certificatePem), issuerSpkiSha256: spki(host.memberIssuer.certificatePem) };
  function client(overrides = {}) {
    const result = createSpsNativeEnrollmentClient({ invitationCode: code, context, timeoutMs: 3000,
      assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  function bootstrap(overrides = {}) {
    const result = createSpsNativeEnrollmentBootstrap({ invitationCode: code, timeoutMs: 3000, assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  const target = { v: 1, kind: "sps.native.member-host-target", context,
    origin: `https://127.0.0.1:${server.address().port}`, serverCertificatePem: host.server.certificatePem };
  function recovery(overrides = {}) {
    const result = createSpsNativeEnrollmentRecoveryClient({ target, context, timeoutMs: 3000,
      assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  function workspaceClient(overrides = {}) {
    const result = createSpsNativeMemberWorkspaceClient({ target, context, timeoutMs: 3000,
      assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  function renewalClient(overrides = {}) {
    const result = createSpsNativeMemberRenewalClient({ target, context, timeoutMs: 3000,
      assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  function serverCertificateClient(overrides = {}) {
    const result = createSpsNativeServerCertificateClient({ target, context, timeoutMs: 3000,
      assertCurrent() {}, ...overrides });
    t.after(() => result.dispose());
    return result;
  }
  return { requests, received, issuance, context, code, client, bootstrap, recovery, target,
    workspaceClient, renewalClient, serverCertificateClient,
    replaceIdentity(identity) { server.setSecureContext({ key: identity.server.privateKeyPem,
      cert: identity.server.certificatePem, ca: host.memberIssuer.certificatePem }); } };
}

test("public server certificate client uses retained-leaf alias without credentials or body", async t => {
  const f = await fixture(t);
  const value = await f.serverCertificateClient().getServerCertificate();
  assert.deepEqual(value, { hostId: HOST,
    predecessorCertificateSha256: createHash("sha256").update(new X509Certificate(host.server.certificatePem).raw).digest("hex"),
    serverCertificate: new X509Certificate(host.server.certificatePem).raw.toString("base64url"),
    issuerSpkiSha256: spki(host.memberIssuer.certificatePem) });
  const request = f.requests.at(-1);
  assert.equal(request.path, "/sps-native/v1/server-certificate");
  assert.equal(request.method, "POST");
  assert.equal(request.contentLength, "0");
  assert.equal(request.body, "");
  assert.equal(request.authorization, undefined);
  assert.equal(request.cookie, undefined);
  assert.equal(request.authorized, false);
  assert.equal(request.servername, nativeServerCertificateServername(host.server.certificatePem));
  assert.equal(Object.keys(value).some(key => /token|cookie|private/i.test(key)), false);
});

test("public certificate client recognizes only the exact safe legacy 404 as unsupported", async t => {
  const legacy = await fixture(t, { respond({ send }) { send({ error: "native_enrollment_unavailable" }, 404); } });
  assert.equal(await legacy.serverCertificateClient().getServerCertificate(), null);
  const request = legacy.requests.at(-1);
  assert.equal(request.path, "/sps-native/v1/server-certificate");
  assert.equal(request.authorization, undefined);
  assert.equal(request.cookie, undefined);
  assert.equal(request.contentLength, "0");
  assert.equal(request.body, "");
  assert.equal(request.authorized, false);

  for (const [status, value] of [[404, { error: "unexpected" }],
    [404, { error: "native_enrollment_unavailable", token: "unexpected" }],
    [503, { error: "native_enrollment_unavailable" }]]) {
    const incompatible = await fixture(t, { respond({ send }) { send(value, status); } });
    await assert.rejects(incompatible.serverCertificateClient().getServerCertificate(),
      { code: "native_enrollment_client_invalid_response" });
    const sent = incompatible.requests.at(-1);
    assert.equal(sent.authorization, undefined);
    assert.equal(sent.cookie, undefined);
    assert.equal(sent.contentLength, "0");
  }
});

test("manual renewal uses only saved same-key CSR, current mTLS and the strict certificate validity DTO", async t => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  const next = await issueSpsNativeMemberCertificate({ hostIdentity: host,
    request: await publicSpsNativeMemberEnrollmentRequest(keyRequest), notBefore: now - 1000,
    notAfter: now + 7_200_000, now });
  const oldLeaf = new X509Certificate(certificate.certificatePem);
  const newLeaf = new X509Certificate(next.certificatePem);
  const renewal = { renewalId: "66666666-6666-4666-8666-666666666666", deviceId: "77777777-7777-4777-8777-777777777777",
    predecessorCertificateSha256: createHash("sha256").update(oldLeaf.raw).digest("hex"),
    certificate: newLeaf.raw.toString("base64url"),
    issuerCertificate: new X509Certificate(host.memberIssuer.certificatePem).raw.toString("base64url"),
    certificateNotBefore: new Date(Date.parse(newLeaf.validFrom)).toISOString(),
    certificateNotAfter: new Date(Date.parse(newLeaf.validTo)).toISOString() };
  const f = await fixture(t, { respond({ item, send, value }) {
    send(item.path.endsWith("/renew") ? renewal : value);
  } });
  const client = f.renewalClient();
  await client.exchange(TOKEN);
  assert.deepEqual(await client.renew({ keyRequest, issuance: f.issuance }), renewal);
  const request = f.requests.at(-1);
  assert.equal(request.path, "/sps-native/v1/enrollment/renew");
  assert.equal(request.cookie, COOKIE);
  assert.equal(request.authorization, undefined);
  assert.deepEqual(Object.keys(JSON.parse(request.body)), ["deviceKeyId", "requestPem"]);
  assert.equal(JSON.parse(request.body).deviceKeyId, DEVICE);
  assert.equal(JSON.parse(request.body).requestPem, keyRequest.requestPem);
  assert.equal(request.peer.toString("base64url"), oldLeaf.raw.toString("base64url"));
  assert.equal(request.authorized, true);
  assert.equal(Object.keys(renewal).length, 7);
});

function safe(error) {
  assert.match(error.code, /^native_enrollment_client_/);
  assert.doesNotMatch(error.message, /PRIVATE KEY|fixture\.header|sps_identity_session|C:\\|127\.0\.0\.1|fixture-member/);
  assert.equal(Object.hasOwn(error, "cause"), false);
  return true;
}

test("uses three fresh pinned TLS connections and keeps tokens/cookies out of returned DTOs", async t => {
  const f = await fixture(t), client = f.client();
  assert.equal(Object.isFrozen(client), true);
  const acknowledgement = await client.exchange(TOKEN);
  assert.deepEqual(Object.keys(acknowledgement), ["state", "expiresAt"]);
  assert.equal(acknowledgement.state, "session_prepared");
  const issued = await client.issue(keyRequest);
  assert.deepEqual(issued, f.issuance);
  const completed = await client.complete({ keyRequest, issuance: issued, displayName: "Fixture PC" });
  assert.deepEqual(completed, { deviceId: DEVICE, status: "pending" });
  assert.equal(f.requests.length, 3);
  assert.ok(f.requests.every(row => row.method === "POST" && row.protocol === "TLSv1.3" && !row.resumed));
  assert.equal(f.requests[0].authorization, `Bearer ${TOKEN}`);
  assert.equal(f.requests[0].cookie, undefined);
  assert.equal(f.requests[0].body, "");
  for (const row of f.requests.slice(1)) {
    assert.equal(row.cookie, COOKIE); assert.equal(row.authorization, undefined);
    assert.doesNotMatch(row.body, /PRIVATE KEY|fixture\.header|sps_identity_session|userId|subject/);
  }
  assert.deepEqual(Object.keys(JSON.parse(f.requests[1].body)), ["pairingId", "pairingSecret", "deviceKeyId", "requestPem"]);
  assert.equal(f.requests[2].authorized, true);
  assert.ok(f.requests[2].peer.equals(new X509Certificate(certificate.certificatePem).raw));
  assert.doesNotMatch(JSON.stringify({ acknowledgement, issued, completed, client }), /sps_identity_session|PRIVATE KEY|fixture\.header/);
  await assert.rejects(client.issue(keyRequest), safe);
});

test("Member Workspace discovery uses a fresh pinned TLS GET and returns only ID/name choices", async t => {
  const f = await fixture(t), client = f.workspaceClient();
  await client.exchange(TOKEN);
  const choices = await client.listAvailableWorkspaces({ keyRequest, issuance: f.issuance });
  assert.deepEqual(choices, [{ id: DEVICE, name: "Member Workspace" }]);
  assert.equal(Object.isFrozen(choices), true);
  assert.equal(Object.isFrozen(choices[0]), true);
  assert.equal(f.requests.length, 2);
  const [exchange, discovery] = f.requests;
  assert.equal(exchange.path, "/sps-native/v1/session/exchange");
  assert.equal(exchange.method, "POST");
  assert.equal(discovery.path, "/sps-native/v1/workspaces");
  assert.equal(discovery.method, "GET");
  assert.equal(discovery.body, "");
  assert.equal(discovery.contentType, undefined);
  assert.equal(discovery.protocol, "TLSv1.3");
  assert.equal(discovery.resumed, false);
  assert.equal(discovery.authorized, true);
  assert.ok(discovery.peer.equals(new X509Certificate(certificate.certificatePem).raw));
  assert.equal(discovery.authorization, undefined);
  assert.equal(discovery.cookie, COOKIE);
  assert.doesNotMatch(JSON.stringify({ choices, client }), /PRIVATE KEY|fixture\.header|sps_identity_session/);
});

test("Member Workspace bootstrap uses the saved certificate and cookie on one fixed fresh TLS GET", async t => {
  const f = await fixture(t), client = f.workspaceClient();
  await client.exchange(TOKEN);
  const result = await client.getWorkspaceBootstrap({ workspaceId: DEVICE, keyRequest, issuance: f.issuance });
  assert.deepEqual(result, {
    v: 1, kind: "sps.native.workspace.bootstrap",
    workspace: { id: DEVICE, name: "Member Workspace", issuePrefix: "member" },
    member: { userId: "fixture-user" },
    capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"],
  });
  const [exchange, bootstrap] = f.requests;
  assert.equal(f.requests.length, 2);
  assert.equal(exchange.method, "POST");
  assert.equal(bootstrap.path, `/api/companies/${DEVICE}/workspace-bootstrap`);
  assert.equal(bootstrap.method, "GET");
  assert.equal(bootstrap.protocol, "TLSv1.3");
  assert.equal(bootstrap.resumed, false);
  assert.equal(bootstrap.authorized, true);
  assert.equal(bootstrap.cookie, COOKIE);
  assert.equal(bootstrap.authorization, undefined);
  assert.equal(bootstrap.contentType, undefined);
  assert.equal(bootstrap.contentLength, "0");
  assert.equal(bootstrap.body, "");
  assert.ok(bootstrap.peer.equals(new X509Certificate(certificate.certificatePem).raw));
});

test("Member Workspace bootstrap rejects invalid selectors and mismatched response identity", async t => {
  const f = await fixture(t), client = f.workspaceClient();
  await client.exchange(TOKEN);
  await assert.rejects(client.getWorkspaceBootstrap({ workspaceId: "../private", keyRequest, issuance: f.issuance }), safe);
  await assert.rejects(client.getWorkspaceBootstrap({ workspaceId: DEVICE, keyRequest, issuance: f.issuance, url: "https://attacker.invalid" }), safe);
  assert.equal(f.requests.length, 1);

  const mismatched = await fixture(t, { respond({ req, send, value }) {
    if (req.url.endsWith("/workspace-bootstrap")) send({ ...value,
      workspace: { ...value.workspace, id: HOST } });
    else send();
  } });
  const mismatchedClient = mismatched.workspaceClient();
  await mismatchedClient.exchange(TOKEN);
  await assert.rejects(mismatchedClient.getWorkspaceBootstrap({ workspaceId: DEVICE,
    keyRequest, issuance: mismatched.issuance }), safe);
});

test("Member Workspace reads use only fixed pinned GET paths and saved credentials", async t => {
  const f = await fixture(t), client = f.workspaceClient();
  await client.exchange(TOKEN);
  const shell = await client.readWorkspaceSurface({ workspaceId: DEVICE, surface: "shell", keyRequest, issuance: f.issuance });
  const providers = await client.readWorkspaceSurface({ workspaceId: DEVICE, surface: "providers", keyRequest, issuance: f.issuance });
  const dashboard = await client.readWorkspaceSurface({ workspaceId: DEVICE, surface: "dashboard", keyRequest, issuance: f.issuance });
  const executionControl = await client.readWorkspaceSurface({ workspaceId: DEVICE, surface: "executionControl", keyRequest, issuance: f.issuance });
  const inbox = await client.readWorkspaceSurface({ workspaceId: DEVICE, surface: "inbox", archived: true, keyRequest, issuance: f.issuance });
  assert.deepEqual(JSON.parse(JSON.stringify(shell)), { mode: "neutral", providerPluginId: null,
    providerPluginKey: null, shell: null, fallbackReason: null });
  assert.deepEqual(JSON.parse(JSON.stringify(providers)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(dashboard)), { widgets: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(executionControl)), { state: "paused", epoch: "2", revision: 4, updatedAt: null,
    pending: { agents: 0, jobs: 1, models: 0, commands: 0, plugins: 0 }, canControl: false });
  assert.deepEqual(JSON.parse(JSON.stringify(inbox)), { items: [{ id: "55555555-5555-4555-8555-555555555555",
    companyId: DEVICE, title: "Archived" }] });
  const reads = f.requests.slice(1);
  assert.deepEqual(reads.map(request => request.path), [
    `/api/companies/${DEVICE}/workspace-shell`,
    `/api/companies/${DEVICE}/workspace-shell/providers`,
    `/api/companies/${DEVICE}/workspace-dashboard`,
    `/api/companies/${DEVICE}/execution-control`,
    `/api/companies/${DEVICE}/workspace-inbox?archived=true`,
  ]);
  for (const request of reads) {
    assert.equal(request.method, "GET");
    assert.equal(request.body, "");
    assert.equal(request.contentLength, "0");
    assert.equal(request.contentType, undefined);
    assert.equal(request.cookie, COOKIE);
    assert.equal(request.authorization, undefined);
    assert.equal(request.protocol, "TLSv1.3");
    assert.equal(request.resumed, false);
    assert.equal(request.authorized, true);
    assert.ok(request.peer.equals(new X509Certificate(certificate.certificatePem).raw));
  }
});

test("Member Workspace surface selectors cannot choose URLs or invalid archive variants", async t => {
  const f = await fixture(t), client = f.workspaceClient();
  await client.exchange(TOKEN);
  for (const input of [
    { workspaceId: "../private", surface: "shell", keyRequest, issuance: f.issuance },
    { workspaceId: DEVICE, surface: "https://attacker.invalid", keyRequest, issuance: f.issuance },
    { workspaceId: DEVICE, surface: "shell", url: "https://attacker.invalid", keyRequest, issuance: f.issuance },
    { workspaceId: DEVICE, surface: "inbox", archived: "true", keyRequest, issuance: f.issuance },
    { workspaceId: DEVICE, surface: "providers", archived: false, keyRequest, issuance: f.issuance },
  ]) assert.throws(() => client.readWorkspaceSurface(input), safe);
  assert.equal(f.requests.length, 1);
});

test("aborting a delayed Workspace surface TLS read withholds the body and releases the client operation slot", async t => {
  let finishSurface;
  const f = await fixture(t, { respond({ req, send }) {
    if (req.url === `/api/companies/${DEVICE}/workspace-shell`) finishSurface = send;
    else send();
  } });
  const client = f.workspaceClient();
  await client.exchange(TOKEN);
  const controller = new AbortController();
  const pending = client.readWorkspaceSurface({ workspaceId: DEVICE, surface: "shell", keyRequest, issuance: f.issuance },
    { signal: controller.signal });
  await f.received;
  for (let attempt = 0; attempt < 50 && !finishSurface; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(typeof finishSurface, "function");
  controller.abort();
  await assert.rejects(pending, safe);
  finishSurface();
  assert.equal(f.requests.length, 2);
  await client.exchange(TOKEN);
  const choices = await client.listAvailableWorkspaces({ keyRequest, issuance: f.issuance });
  assert.deepEqual(choices, [{ id: DEVICE, name: "Member Workspace" }]);
  assert.equal(f.requests.length, 4);
});

test("Workspace choices are withheld when the account guard changes before the TLS response arrives", async t => {
  let current = true, finishWorkspace;
  const f = await fixture(t, { respond({ req, send }) {
    if (req.url === "/sps-native/v1/workspaces") finishWorkspace = send;
    else send();
  } });
  const client = f.workspaceClient({ assertCurrent() { if (!current) throw new Error("private account detail"); } });
  await client.exchange(TOKEN);
  const pending = client.listAvailableWorkspaces({ keyRequest, issuance: f.issuance });
  for (let attempt = 0; attempt < 50 && !finishWorkspace; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(typeof finishWorkspace, "function");
  current = false;
  finishWorkspace();
  await assert.rejects(pending, safe);
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].method, "GET");
  assert.equal(f.requests[1].cookie, COOKIE);
  assert.equal(f.requests[1].authorized, true);
});

test("a different actual TLS peer receives no HTTP Authorization or pairing secret", async t => {
  const f = await fixture(t, { identity: other });
  await assert.rejects(f.client().exchange(TOKEN), safe);
  assert.equal(f.requests.length, 0);
});

test("strict factory scope and hostile getters fail before any request", async t => {
  const f = await fixture(t);
  for (const change of [{ timeoutMs: Infinity }, { timeoutMs: 0 }, { timeoutMs: 60001 }, { timeoutMs: 1.5 },
    { assertCurrent: undefined }, { context: { ...f.context, hostId: DEVICE } },
    { context: { ...f.context, serverSpkiSha256: "0".repeat(64) } }]) {
    assert.throws(() => f.client(change), safe);
  }
  let getterRead = false;
  const input = Object.defineProperty({}, "timeoutMs", { enumerable: true, get() { getterRead = true; return 100; } });
  assert.throws(() => createSpsNativeEnrollmentClient(input), safe);
  assert.equal(getterRead, false);
  const client = f.client();
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  await assert.rejects(client.exchange(TOKEN, { extra: 1 }), safe);
  assert.equal(f.requests.length, 0);
});

test("current account/Host guard is checked before connecting and before accepting a late session", async t => {
  let sendResponse, current = true;
  const f = await fixture(t, { respond({ send }) { sendResponse = send; } });
  const client = f.client({ assertCurrent() { if (!current) throw new Error("private account/path detail"); } });
  const exchanging = client.exchange(TOKEN);
  const rejected = assert.rejects(exchanging, safe);
  await f.received;
  current = false;
  sendResponse();
  await rejected;
  await assert.rejects(client.issue(keyRequest), safe);
  current = true;
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 1);
});

test("overlap is rejected, cancellation closes the owned socket and never retries", async t => {
  const f = await fixture(t, { respond() {} }), client = f.client();
  const controller = new AbortController();
  const exchanging = client.exchange(TOKEN, { signal: controller.signal });
  const rejected = assert.rejects(exchanging, { code: "native_enrollment_client_cancelled" });
  await f.received;
  await assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_busy" });
  controller.abort();
  await rejected;
  assert.equal(f.requests.length, 1);
});

test("dispose cancels an active request and rejects every later operation", async t => {
  const f = await fixture(t, { respond() {} }), client = f.client();
  const rejected = assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_disposed" });
  await f.received;
  client.dispose(); client.dispose();
  await rejected;
  await assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_disposed" });
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_disposed" });
  assert.equal(f.requests.length, 1);
});

test("bounded timeout fails a response stall with one request, not an automatic retry", async t => {
  const f = await fixture(t, { respond() {} });
  await assert.rejects(f.client({ timeoutMs: 150 }).exchange(TOKEN), { code: "native_enrollment_client_timeout" });
  assert.equal(f.requests.length, 1);
});

test("redirect and truncated or oversized responses never create a usable session", async t => {
  for (const respond of [
    ({ send, value }) => send(value, 302, { Location: "https://not-followed.example.test" }),
    ({ send }) => send('{"expiresInSeconds":'),
    ({ send }) => send("x".repeat(16_385)),
    ({ send, value }) => send(value, 201, { "Set-Cookie": [`${COOKIE}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`, "other=unsafe"] }),
  ]) {
    const f = await fixture(t, { respond }), client = f.client();
    await assert.rejects(client.exchange(TOKEN), safe);
    await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
    assert.equal(f.requests.length, 1);
  }
});

test("issuer mismatch and wrong local key cannot progress to the certificate-bearing request", async t => {
  const f = await fixture(t), client = f.client({ context: { ...f.context, issuerSpkiSha256: "0".repeat(64) } });
  await client.exchange(TOKEN);
  await assert.rejects(client.issue(keyRequest), safe);
  await assert.rejects(client.complete({ keyRequest, issuance: f.issuance, displayName: "Fixture PC" }), safe);
  assert.equal(f.requests.length, 2);
  const good = f.client();
  await good.exchange(TOKEN);
  await assert.rejects(good.issue({ ...keyRequest, deviceKeyId: HOST }), safe);
  assert.equal(f.requests.length, 3);
});

test("caller aborting inside its synchronous guard prevents HTTP credential delivery", async t => {
  const f = await fixture(t), controller = new AbortController();
  const client = f.client({ assertCurrent() { controller.abort(); } });
  await assert.rejects(client.exchange(TOKEN, { signal: controller.signal }), { code: "native_enrollment_client_cancelled" });
  assert.equal(f.requests.length, 0);
});

test("guard failure after a prepared session clears it rather than resurrecting credentials", async t => {
  let current = true;
  const f = await fixture(t), client = f.client({ assertCurrent() {
    if (!current) throw new Error("private former account details");
  } });
  await client.exchange(TOKEN);
  current = false;
  await assert.rejects(client.issue(keyRequest), safe);
  current = true;
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 1);
});

test("certificate validation does not pin a later connection by hostname or origin alone", async t => {
  const f = await fixture(t), client = f.client();
  await client.exchange(TOKEN);
  f.replaceIdentity(other);
  await assert.rejects(client.issue(keyRequest), safe);
  await assert.rejects(client.issue(keyRequest), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 1);
});

test("TLS 1.2 cannot receive Identity or pairing credentials", async t => {
  const f = await fixture(t, { version: "TLSv1.2" });
  await assert.rejects(f.client().exchange(TOKEN), safe);
  assert.equal(f.requests.length, 0);
});

test("losing account scope after certificate verification still prevents HTTP headers from flushing", async t => {
  let checks = 0;
  const f = await fixture(t), client = f.client({ assertCurrent() {
    // Initial operation, pre-request and certificate callbacks have passed.
    if (++checks === 4) throw new Error("fixture account generation lost after handshake");
  } });
  await assert.rejects(client.exchange(TOKEN), safe);
  assert.equal(checks, 4);
  assert.equal(f.requests.length, 0);
});

test("bootstrap learns only public issuer context on the pinned connection without credentials or session methods", async t => {
  const f = await fixture(t), bootstrap = f.bootstrap();
  assert.deepEqual(Object.keys(bootstrap), ["inspect", "dispose"]);
  const metadata = await bootstrap.inspect();
  assert.deepEqual(metadata, { hostId: HOST, serverSpkiSha256: f.context.serverSpkiSha256,
    issuerSpkiSha256: f.context.issuerSpkiSha256, issuerCertificatePem: host.memberIssuer.certificatePem });
  assert.equal(Object.isFrozen(metadata), true);
  assert.deepEqual(f.requests.map(({ path, authorization, cookie, body }) => ({ path, authorization, cookie, body })),
    [{ path: "/sps-native/v1/identity", authorization: undefined, cookie: undefined, body: "" }]);
  const client = f.client({ context: { ...f.context, issuerSpkiSha256: metadata.issuerSpkiSha256 } });
  await client.exchange(TOKEN);
  const issuance = await client.issue(keyRequest);
  assert.equal((await client.complete({ keyRequest, issuance, displayName: "Fixture PC" })).status, "pending");
});

test("bootstrap rejects mismatched Host/server/issuer metadata and non-issuer certificates", async t => {
  for (const update of [value => ({ ...value, hostId: DEVICE }), value => ({ ...value, serverSpkiSha256: "0".repeat(64) }),
    value => ({ ...value, issuerSpkiSha256: "0".repeat(64) }),
    value => ({ ...value, issuerCertificate: new X509Certificate(host.server.certificatePem).raw.toString("base64url"),
      issuerSpkiSha256: spki(host.server.certificatePem) }),
    value => ({ ...value, issuerCertificate: new X509Certificate(other.memberIssuer.certificatePem).raw.toString("base64url") }),
  ]) {
    const f = await fixture(t, { respond({ send, value }) { send(update(value)); } });
    await assert.rejects(f.bootstrap().inspect(), safe);
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].authorization, undefined);
    assert.equal(f.requests[0].cookie, undefined);
  }
});

test("bootstrap never contacts a different actual peer and disposal rejects a later public read", async t => {
  const bad = await fixture(t, { identity: other });
  await assert.rejects(bad.bootstrap().inspect(), safe);
  assert.equal(bad.requests.length, 0);
  const good = await fixture(t), bootstrap = good.bootstrap();
  bootstrap.dispose();
  await assert.rejects(bootstrap.inspect(), { code: "native_enrollment_client_disposed" });
  assert.equal(good.requests.length, 0);
  assert.throws(() => good.bootstrap({ context: good.context }), safe);
});

test("recovery uses the retained peer and existing issued key without an invitation or enrollment methods", async t => {
  const f = await fixture(t), first = f.client();
  await first.exchange(TOKEN);
  const issuance = await first.issue(keyRequest);
  await first.complete({ keyRequest, issuance, displayName: "Fixture PC" });
  first.dispose();
  const recovered = f.recovery();
  assert.deepEqual(Object.keys(recovered), ["exchange", "reconcile", "dispose"]);
  assert.equal(Object.isFrozen(recovered), true);
  const expiredPairing = { ...issuance, expiresAt: new Date(Date.now() - 1000).toISOString() };
  await recovered.exchange(TOKEN);
  assert.deepEqual(await recovered.reconcile({ keyRequest, issuance: expiredPairing }), { deviceId: DEVICE, status: "pending" });
  const request = f.requests.at(-1);
  assert.equal(request.path, "/sps-native/v1/enrollment/reconcile");
  assert.equal(request.authorized, true);
  assert.equal(request.resumed, false);
  assert.equal(request.protocol, "TLSv1.3");
  assert.ok(request.peer.equals(new X509Certificate(certificate.certificatePem).raw));
  assert.equal(request.cookie, COOKIE);
  assert.equal(request.authorization, undefined);
  assert.deepEqual(JSON.parse(request.body), { enrollmentId: ENROLLMENT });
  assert.doesNotMatch(request.body, /pairing|PRIVATE KEY|subject|userId|displayName/);
  await recovered.reconcile({ keyRequest, issuance: expiredPairing });
  assert.equal(f.requests.filter(row => row.path.endsWith("/issue") || row.path.endsWith("/complete")).length, 2);
});

test("recovery observes pending, approved and revoked without interpreting them as enrollment permission", async t => {
  for (const status of ["pending", "approved", "revoked"]) {
    const f = await fixture(t, { respond({ item, send, value }) {
      send(item.path.endsWith("/reconcile") ? { deviceId: DEVICE, status } : value);
    } });
    const client = f.recovery();
    await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_session_required" });
    await client.exchange(TOKEN);
    assert.deepEqual(await client.reconcile({ keyRequest, issuance: f.issuance }), { deviceId: DEVICE, status });
    assert.deepEqual(f.requests.map(row => row.path), ["/sps-native/v1/session/exchange", "/sps-native/v1/enrollment/reconcile"]);
  }
});

test("recovery rejects changed scope, pins, issuer and local key without replaying pairing", async t => {
  const f = await fixture(t);
  for (const changes of [{ context: { ...f.context, subject: "another-account" } },
    { target: { ...f.target, serverCertificatePem: other.server.certificatePem } },
    { target: { ...f.target, origin: "https://wrong.example.test" } }, { invitationCode: f.code }]) {
    assert.throws(() => f.recovery(changes), safe);
  }
  const client = f.recovery();
  await client.exchange(TOKEN);
  await assert.rejects(client.reconcile({ keyRequest: { ...keyRequest, deviceKeyId: HOST }, issuance: f.issuance }), safe);
  assert.equal(f.requests.length, 1);
  await client.exchange(TOKEN);
  await assert.rejects(client.reconcile({ keyRequest, issuance: { ...f.issuance,
    issuerCertificate: new X509Certificate(other.memberIssuer.certificatePem).raw.toString("base64url") } }), safe);
  assert.equal(f.requests.length, 2);
  const badPeer = await fixture(t, { identity: other });
  await assert.rejects(badPeer.recovery().exchange(TOKEN), safe);
  assert.equal(badPeer.requests.length, 0);
});

test("recovery cancellation or lost current account cannot accept late results or silently retry", async t => {
  let deliver, current = true;
  async function waitForResponse() {
    const deadline = Date.now() + 2000;
    while (!deliver && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(typeof deliver, "function", "The owned fixture must receive the request before its deadline.");
  }
  const f = await fixture(t, { respond({ item, send }) {
    if (item.path.endsWith("/reconcile")) deliver = send;
    else send();
  } });
  const client = f.recovery({ assertCurrent() { if (!current) throw new Error("private former account"); } });
  await client.exchange(TOKEN);
  const controller = new AbortController();
  const running = client.reconcile({ keyRequest, issuance: f.issuance }, { signal: controller.signal });
  const rejected = assert.rejects(running, { code: "native_enrollment_client_cancelled" });
  await waitForResponse();
  await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_busy" });
  controller.abort();
  await rejected;
  deliver();
  assert.equal(f.requests.length, 2);
  await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_session_required" });
  deliver = null;
  await client.exchange(TOKEN);
  const late = assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), safe);
  await waitForResponse();
  current = false;
  deliver();
  await late;
  current = true;
  await assert.rejects(client.reconcile({ keyRequest, issuance: f.issuance }), { code: "native_enrollment_client_session_required" });
  assert.equal(f.requests.length, 4);
  client.dispose();
  await assert.rejects(client.exchange(TOKEN), { code: "native_enrollment_client_disposed" });
});

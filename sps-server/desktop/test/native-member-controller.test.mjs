import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
import { createSpsNativeMemberKeyRequest, issueSpsNativeMemberCertificate,
  publicSpsNativeMemberEnrollmentRequest } from "../src/native-member-certificates.mjs";
import { createSpsNativeMemberController } from "../src/native-member-controller.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const DEVICE = "22222222-2222-4222-8222-222222222222";
const ISSUER = "https://identity.example.test";
let host, invitationCode, issuerPin;
const pin = pem => createHash("sha256").update(new X509Certificate(pem).publicKey.export({ type: "spki", format: "der" })).digest("hex");
before(async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  host = await createSpsNativeHostIdentity({ hostId: HOST, hostnames: ["127.0.0.1"], notBefore: now - 60000,
    notAfter: now + 3600000, issuerNotAfter: now + 86400000 });
  issuerPin = pin(host.memberIssuer.certificatePem);
  invitationCode = createSpsNativeInviteCode({ v: 2, kind: "sps.native-lan.pairing", hostId: HOST,
    origin: "https://127.0.0.1:43123", spkiSha256: pin(host.server.certificatePem),
    serverCertificate: new X509Certificate(host.server.certificatePem).raw.toString("base64url"),
    pairingId: "33333333-3333-4333-8333-333333333333", pairingSecret: Buffer.alloc(32, 8).toString("base64url"),
    issuedAt: Date.now() - 1000, expiresAt: Date.now() + 600000 });
});

function fixture(overrides = {}) {
  let current = { identityIssuer: ISSUER, subject: "alice", generation: 0n,
    userDataDirectory: "C:\\fixture\\user-data", vaultDirectory: "C:\\fixture\\vault" };
  let index = { v: 1, entries: [] }, key = null, issued = null, target = null, outcome = "pending";
  let credential = null, nextCredential = null, inspection = null;
  const calls = [];
  const hooks = {};
  async function step(name) { calls.push(name); if (hooks[name]) await hooks[name](); }
  const store = {
    async create(value, options) { await step("create-key"); options.beforeCommit(); assert.equal(key, null); key = value; },
    async createTarget(value, options) { await step("create-target"); options.beforeCommit(); assert.equal(target, null); target = value; },
    async read() { await step("read-key"); return key; },
    async readTarget() { await step("read-target"); return target; },
    async readIssued() { await step("read-issued"); return issued ? { issuance: issued, credential: credential ?? { privateKeyPem: key.privateKeyPem } } : null; },
    async inspectIssued() { await step("inspect-issued"); return inspection ?? (issued ? {
      state: "current", certificateNotBefore: new Date(Date.now() - 60_000).toISOString(),
      certificateNotAfter: new Date(Date.now() + 60_000).toISOString(),
    } : null); },
    async createIssued(value, options) { await step("create-issued"); options.beforeCommit(); assert.equal(issued, null); issued = value; },
    async publishRenewal(value, options) { await step("publish-renewal"); options.beforeCommit(); credential = nextCredential;
      issued = { ...issued, certificate: value.certificate, issuerCertificate: value.issuerCertificate }; },
  };
  const configuration = {
    getAuthority: () => current,
    getIndex: () => index,
    saveIndex: async (value, options) => { await step("save-index"); options.beforeCommit(); index = value; },
    getStore: () => store,
    getTargetReader: () => ({ async read() { await step("read-protected-target"); return target; } }),
    getPublicationRecovery: () => ({ async recoverInterruptedPublications(options) {
      await step("repair-local-publications"); options.beforeCommit(); return { recovered: ["issued"] };
    } }),
    authenticate: async () => { await step("authenticate"); return "fixture-account-token"; },
    createKey: async ({ hostId, deviceKeyId }) => { await step("generate-key"); return { hostId, deviceKeyId, privateKeyPem: "fixture-private-key" }; },
    createBootstrap: () => ({ async inspect() { await step("bootstrap"); return { issuerSpkiSha256: issuerPin }; }, dispose() { calls.push("dispose-bootstrap"); } }),
    createEnrollment: () => ({
      async exchange(token) { assert.equal(token, "fixture-account-token"); await step("exchange"); },
      async issue(value) { assert.equal(value, key); await step("issue"); return { enrollmentId: "fixture-issuance" }; },
      async complete(value) { assert.equal(value.keyRequest, key); assert.equal(value.issuance, issued); await step("complete"); return { deviceId: DEVICE, status: outcome }; },
      dispose() { calls.push("dispose-enrollment"); },
    }),
    createWorkspace: ({ context, target: retained }) => {
      assert.equal(context, target.context); assert.equal(retained, target);
      return {
        async exchange(token) { assert.equal(token, "fixture-account-token"); await step("workspace-exchange"); },
        async listAvailableWorkspaces(value) {
          assert.equal(value.keyRequest, key); assert.equal(value.issuance, issued); await step("workspaces");
          return [{ id: DEVICE, name: "Allowed Workspace" }];
        },
        dispose() { calls.push("dispose-workspace"); },
      };
    },
    createRecovery: ({ context, target: retained }) => {
      assert.equal(context, target.context); assert.equal(retained, target);
      return {
        async exchange(token) { assert.equal(token, "fixture-account-token"); await step("recovery-exchange"); },
        async reconcile(value) { assert.equal(value.keyRequest, key); assert.equal(value.issuance, issued); await step("reconcile"); return { deviceId: DEVICE, status: outcome }; },
        dispose() { calls.push("dispose-recovery"); },
      };
    }, ...overrides,
  };
  const make = () => createSpsNativeMemberController(configuration);
  return { controller: make(), make, calls, hooks, store,
    setCurrent: value => { current = value; }, change: () => { current = { ...current, generation: current.generation + 1n }; },
    setOutcome: value => { outcome = value; }, removeKey: () => { key = null; }, setIndex: value => { index = value; },
    setCredentials: (current, next = null) => { credential = current; nextCredential = next; },
    setInspection: value => { inspection = value; },
    snapshot: () => ({ index, key, issued, target }),
  };
}
const enroll = (f, options = {}) => f.controller.enroll({ invitationCode, displayName: "Alice computer" }, { confirm: async () => true, ...options });

test("Inbox state keeps saved credentials, scopes IDs and rejects stale account results", async () => {
  let observed;
  const state = { readAt: null, archivedAt: "2026-10-27T00:00:00.000Z" };
  const f = fixture({ createWorkspace: () => ({ async exchange() {},
    async updateInboxState(input) { observed = input; await f.hooks.update?.(); return state; }, dispose() {} }) });
  await enroll(f);
  const before = f.snapshot();
  const input = { hostId: HOST, workspaceId: DEVICE, state: { itemId: HOST, archived: true } };
  assert.deepEqual(await f.controller.updateInboxState(input), state);
  assert.deepEqual(observed, { workspaceId: DEVICE, state: input.state, keyRequest: before.key, issuance: before.issued });
  assert.deepEqual(f.snapshot(), before);
  f.hooks.update = () => f.change();
  await assert.rejects(f.controller.updateInboxState(input), { code: "native_member_changed" });
});

test("Workspace discovery uses only saved account-bound credentials and returns public choices", async () => {
  const f = fixture();
  await enroll(f);
  const before = f.snapshot();
  f.calls.length = 0;
  assert.deepEqual(await f.controller.listWorkspaces({ hostId: HOST }), [{ id: DEVICE, name: "Allowed Workspace" }]);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.calls, ["read-protected-target", "read-key", "read-issued", "authenticate", "workspace-exchange", "workspaces", "dispose-workspace"]);
  f.hooks.workspaces = f.change;
  await assert.rejects(f.controller.listWorkspaces({ hostId: HOST }), { code: "native_member_changed" });
  assert.equal(f.calls.at(-1), "dispose-workspace");
  f.removeKey();
  const missingKeyCallStart = f.calls.length;
  await assert.rejects(f.controller.listWorkspaces({ hostId: HOST }), { code: "native_member_recovery_required" });
  assert.deepEqual(f.calls.slice(missingKeyCallStart), ["read-protected-target", "read-key"]);
});

test("Workspace discovery preserves nonempty Core names without normalization", async () => {
  const names = ["   ", "x".repeat(301), "line\nbreak\t\u0000\u007f"];
  const f = fixture({ createWorkspace: () => ({
    async exchange() {},
    async listAvailableWorkspaces() {
      return names.map((name, index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name }));
    },
    dispose() {},
  }) });
  await enroll(f);
  const result = await f.controller.listWorkspaces({ hostId: HOST });
  assert.deepEqual(result.map(row => row.name), names);
});

test("Workspace bootstrap uses saved Member credentials, exact selectors, and current-request guards", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  const bootstrap = { v: 1, kind: "sps.native.workspace.bootstrap",
    workspace: { id: workspaceId, name: "Member workspace", issuePrefix: "member" },
    member: { userId: "member-user" },
    capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] };
  let received;
  const f = fixture({ createWorkspace: ({ target, context }) => ({
    async exchange() { assert.equal(target.context, context); },
    async getWorkspaceBootstrap(input) { received = input; return bootstrap; },
    dispose() { f.calls.push("dispose-workspace-bootstrap"); },
  }) });
  await enroll(f);
  const before = f.snapshot();
  f.calls.length = 0;
  let requesterChecks = 0;
  const result = await f.controller.getWorkspaceBootstrap({ hostId: HOST, workspaceId }, {
    assertRequester() { requesterChecks += 1; },
  });
  assert.deepEqual(result, bootstrap);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.workspace), true);
  assert.equal(Object.isFrozen(result.member), true);
  assert.equal(Object.isFrozen(result.capabilities), true);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(received, { workspaceId, keyRequest: f.snapshot().key, issuance: f.snapshot().issued });
  assert.deepEqual(f.calls, ["read-protected-target", "read-key", "read-issued", "authenticate", "dispose-workspace-bootstrap"]);
  assert.ok(requesterChecks >= 2);
  bootstrap.workspace.name = "Mutated after return";
  bootstrap.member.userId = "mutated-user";
  bootstrap.capabilities[0] = "workspace.admin";
  assert.equal(result.workspace.name, "Member workspace");
  assert.equal(result.member.userId, "member-user");
  assert.equal(result.capabilities[0], "workspace.shell.read");
  for (const input of [
    { hostId: HOST }, { hostId: HOST, workspaceId: "../private" },
    { hostId: HOST, workspaceId, url: "https://attacker.invalid" },
  ]) assert.throws(() => f.controller.getWorkspaceBootstrap(input), { code: "native_member_invalid" });

  const valid = { v: 1, kind: "sps.native.workspace.bootstrap",
    workspace: { id: workspaceId, name: "Member workspace", issuePrefix: "member" },
    member: { userId: "member-user" },
    capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] };
  const malformed = [
    { ...valid, workspace: { ...valid.workspace, id: DEVICE } },
    { ...valid, workspace: { ...valid.workspace, name: "" } },
    { ...valid, member: { ...valid.member, privateKey: "secret" } },
    { ...valid, capabilities: [...valid.capabilities, "workspace.admin"] },
  ];
  for (const dto of malformed) {
    const invalid = fixture({ createWorkspace: () => ({ async exchange() {},
      async getWorkspaceBootstrap() { return dto; }, dispose() {},
    }) });
    await enroll(invalid);
    await assert.rejects(invalid.controller.getWorkspaceBootstrap({ hostId: HOST, workspaceId }),
      { code: "native_member_unavailable" });
  }
});

test("Workspace surface reads use saved credentials, exact selectors, safe DTO cloning, and abortable per-call guards", async () => {
  const workspaceId = "55555555-5555-4555-8555-555555555555";
  const rawInbox = JSON.parse(`{"items":[{"companyId":"${workspaceId}","opaqueReference":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}}]}`);
  const bootstrap = { v: 1, kind: "sps.native.workspace.bootstrap",
    workspace: { id: workspaceId, name: "Workspace", issuePrefix: "workspace" }, member: { userId: "member" },
    capabilities: ["workspace.shell.read", "workspace.dashboard.read", "workspace.inbox.read"] };
  let surfaceInput;
  let signalAtExchange;
  let signalAtSurface;
  let delaySurface = false;
  const f = fixture({ createWorkspace: () => ({
    async exchange(_token, options) { signalAtExchange = options?.signal; },
    async getWorkspaceBootstrap(_input, options) { signalAtBootstrap = options?.signal; return bootstrap; },
    async readWorkspaceSurface(input, options) {
      surfaceInput = input;
      signalAtSurface = options?.signal;
      if (delaySurface) {
        if (options.signal.aborted) throw Object.assign(new Error("aborted"), { code: "native_enrollment_client_cancelled" });
        await new Promise((_, reject) => options.signal.addEventListener("abort",
          () => reject(Object.assign(new Error("aborted"), { code: "native_enrollment_client_cancelled" })), { once: true }));
      }
      return rawInbox;
    },
    dispose() {},
  }) });
  let signalAtBootstrap;
  await enroll(f);
  const before = f.snapshot();
  const bootstrapSignal = new AbortController();
  const receivedBootstrap = await f.controller.getWorkspaceBootstrap({ hostId: HOST, workspaceId }, { signal: bootstrapSignal.signal });
  assert.equal(Object.isFrozen(receivedBootstrap), true);
  assert.equal(signalAtExchange, bootstrapSignal.signal);
  assert.equal(signalAtBootstrap, bootstrapSignal.signal);

  const signal = new AbortController();
  const result = await f.controller.readWorkspaceSurface({ hostId: HOST, workspaceId, surface: "inbox", archived: true }, {
    assertRequester() {}, signal: signal.signal,
  });
  assert.deepEqual(surfaceInput, { workspaceId, surface: "inbox", archived: true,
    keyRequest: before.key, issuance: before.issued });
  assert.equal(signalAtExchange, signal.signal);
  assert.equal(signalAtSurface, signal.signal);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), rawInbox);
  assert.equal(Object.getPrototypeOf(result.items[0].opaqueReference), null);
  assert.equal(Object.prototype.polluted, undefined);
  assert.deepEqual(f.snapshot(), before);

  delaySurface = true;
  const cancelled = new AbortController();
  const pending = f.controller.readWorkspaceSurface({ hostId: HOST, workspaceId, surface: "shell" }, { signal: cancelled.signal });
  await new Promise(resolve => setImmediate(resolve));
  cancelled.abort();
  await assert.rejects(pending, { code: "native_member_changed" });
  delaySurface = false;
  await f.controller.getWorkspaceBootstrap({ hostId: HOST, workspaceId });
  for (const input of [
    { hostId: HOST, workspaceId, surface: "other" },
    { hostId: HOST, workspaceId, surface: "shell", archived: false },
    { hostId: HOST, workspaceId, surface: "inbox", archived: "true" },
    { hostId: HOST, workspaceId, surface: "inbox", url: "https://attacker.invalid" },
  ]) assert.throws(() => f.controller.readWorkspaceSurface(input), { code: "native_member_invalid" });
});

test("Main composition orders stable index, protected key/target, issuance persistence before completion", async () => {
  const f = fixture();
  assert.deepEqual(await enroll(f), { hostId: HOST, deviceId: DEVICE, status: "pending" });
  assert.deepEqual(f.calls.filter(name => !name.startsWith("dispose")), ["bootstrap", "save-index", "generate-key", "create-key", "create-target", "read-issued", "authenticate", "exchange", "issue", "create-issued", "complete"]);
  const result = f.controller.list();
  assert.deepEqual(result, [{ hostId: HOST }]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("lost completion is recovered after controller reconstruction without invite, new key or issuance", async () => {
  const f = fixture();
  f.hooks.complete = () => { throw new Error("fixture-token-private-secret"); };
  await assert.rejects(enroll(f), error => error.code === "native_member_unavailable" && !error.message.includes("secret"));
  const before = f.snapshot();
  f.controller.dispose();
  const restarted = f.make();
  f.calls.length = 0;
  assert.deepEqual(await restarted.recover({ hostId: HOST }), { hostId: HOST, deviceId: DEVICE, status: "pending" });
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(f.calls, ["read-protected-target", "read-key", "read-issued", "authenticate", "recovery-exchange", "reconcile", "dispose-recovery"]);
});

test("cancelled Host confirmation creates no index, key, network client or token exchange", async () => {
  const f = fixture();
  assert.deepEqual(await enroll(f, { confirm: async () => false }), { cancelled: true });
  assert.deepEqual(f.calls, []);
  assert.equal(f.snapshot().index.entries.length, 0);
});

test("account or generation change during confirmation rejects before bootstrap", async () => {
  const f = fixture();
  await assert.rejects(enroll(f, { confirm: async () => { f.change(); return true; } }), { code: "native_member_changed" });
  assert.deepEqual(f.calls, []);
});

for (const phase of ["bootstrap", "save-index", "generate-key", "create-key", "create-target", "authenticate", "issue", "create-issued", "complete"]) {
  test(`lifecycle change at ${phase} fences subsequent actions and final delivery`, async () => {
    const f = fixture(); f.hooks[phase] = () => f.change();
    await assert.rejects(enroll(f), error => ["native_member_changed", "native_member_unavailable"].includes(error.code));
    if (phase !== "complete") assert.equal(f.calls.includes("complete"), false);
    assert.equal(f.calls.filter(name => name === "generate-key").length <= 1, true);
  });
}

test("an issued slot cannot be silently enrolled with another invitation or overwritten", async () => {
  const f = fixture(); await enroll(f); const before = f.snapshot(); f.calls.length = 0;
  await assert.rejects(enroll(f), { code: "native_member_recovery_required" });
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.calls.includes("issue"), false); assert.equal(f.calls.includes("generate-key"), false);
});

test("missing indexed key is preserved as recovery required, without generating a replacement", async () => {
  const f = fixture(); f.hooks["generate-key"] = () => { throw new Error("crash after index reservation"); };
  await assert.rejects(enroll(f)); delete f.hooks["generate-key"]; f.calls.length = 0;
  await assert.rejects(enroll(f), { code: "native_member_recovery_required" });
  assert.equal(f.calls.includes("generate-key"), false);
});

test("another account cannot enumerate or query the previous account's protected target", async () => {
  const f = fixture(); await enroll(f); f.calls.length = 0;
  f.setCurrent({ identityIssuer: ISSUER, subject: "bob", generation: 1n,
    userDataDirectory: "C:\\fixture\\user-data", vaultDirectory: "C:\\fixture\\vault" });
  assert.deepEqual(f.controller.list(), []);
  await assert.rejects(f.controller.recover({ hostId: HOST }), { code: "native_member_recovery_required" });
  assert.deepEqual(f.calls, []);
});

test("revoked observation returns status only; no automatic re-enrollment or grant", async () => {
  const f = fixture(); await enroll(f); f.calls.length = 0; f.setOutcome("revoked");
  assert.deepEqual(await f.controller.recover({ hostId: HOST }), { hostId: HOST, deviceId: DEVICE, status: "revoked" });
  assert.equal(f.calls.includes("issue"), false);
});

test("concurrent operation is rejected and dispose fences a blocked operation", async () => {
  const f = fixture(); let release; const paused = new Promise(resolve => { release = resolve; });
  f.hooks.bootstrap = () => paused;
  const first = enroll(f);
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(enroll(f), { code: "native_member_busy" });
  f.controller.dispose(); release();
  await assert.rejects(first, { code: "native_member_disposed" });
  assert.equal(f.calls.includes("save-index"), false);
});

test("strict recovery selectors and corrupted index cannot become a new key or target", async () => {
  const f = fixture();
  assert.throws(() => f.controller.recover({ hostId: HOST, origin: "https://evil.test" }), { code: "native_member_invalid" });
  f.setIndex({ v: 1, entries: [{ hostId: HOST }] });
  await assert.rejects(f.controller.recover({ hostId: HOST }), { code: "native_member_unavailable" });
  assert.deepEqual(f.calls, []);
});

test("local interrupted-write repair requires explicit confirmation and never contacts the Host", async () => {
  const f = fixture(); await enroll(f); const before = f.snapshot(); f.calls.length = 0;
  assert.deepEqual(await f.controller.repair({ hostId: HOST }, { confirm: async () => false }), { cancelled: true });
  assert.deepEqual(f.calls, []);
  assert.deepEqual(await f.controller.repair({ hostId: HOST }, { confirm: async () => true }), { hostId: HOST, recovered: ["issued"] });
  assert.deepEqual(f.calls, ["repair-local-publications"]);
  assert.deepEqual(f.snapshot(), before);
});

test("local repair cannot continue after account change in its confirmation or commit guard", async () => {
  const f = fixture(); await enroll(f); f.calls.length = 0;
  await assert.rejects(f.controller.repair({ hostId: HOST }, { confirm: async () => { f.change(); return true; } }), { code: "native_member_changed" });
  assert.deepEqual(f.calls, []);
  f.hooks["repair-local-publications"] = () => f.change();
  await assert.rejects(f.controller.repair({ hostId: HOST }, { confirm: async () => true }), { code: "native_member_changed" });
  assert.deepEqual(f.calls, ["repair-local-publications"]);
});

test("renewal is manual, pre-expiry only and cancellation sends no request", async () => {
  const f = fixture({ inspectCredential: async () => ({ notBefore: Date.now() - 30 * 86_400_000,
    notAfter: Date.now() + 12 * 60 * 60_000 }),
  createRenewal: () => ({ async exchange() { f.calls.push("renew-exchange"); },
    async renew() { f.calls.push("renew"); }, dispose() { f.calls.push("dispose-renewal"); } }) });
  await enroll(f);
  f.calls.length = 0;
  f.setCredentials({ certificatePem: "saved-leaf", issuerCertificatePem: host.memberIssuer.certificatePem });
  f.setInspection({ state: "current", certificateNotBefore: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    certificateNotAfter: new Date(Date.now() + 12 * 60 * 60_000).toISOString() });
  let confirmation;
  assert.deepEqual(await f.controller.renew({ hostId: HOST }, { confirm: async value => { confirmation = value; return false; } }),
    { cancelled: true });
  assert.deepEqual(Object.keys(confirmation), ["hostId", "certificateNotAfter"]);
  assert.equal(confirmation.hostId, HOST);
  assert.deepEqual(f.calls, ["read-protected-target", "inspect-issued", "read-key", "read-issued"]);
});

test("certificate inspection exposes metadata only and renewal detects expiry before strict read", async () => {
  const f = fixture(); await enroll(f); f.calls.length = 0;
  const before = Date.now();
  f.setInspection({ state: "current", certificateNotBefore: new Date(before - 60 * 86_400_000).toISOString(),
    certificateNotAfter: new Date(before + 12 * 60 * 60_000).toISOString() });
  const current = await f.controller.inspectCertificate({ hostId: HOST });
  assert.deepEqual(Object.keys(current), ["hostId", "state", "certificateNotBefore", "certificateNotAfter", "renewalAvailableAt"]);
  assert.equal(current.state, "current");
  assert.ok(Date.parse(current.renewalAvailableAt) < Date.parse(current.certificateNotAfter));
  assert.equal(Object.hasOwn(current, "certificate"), false);
  f.calls.length = 0;
  f.setInspection({ state: "expired", certificateNotBefore: new Date(before - 31 * 86_400_000).toISOString(),
    certificateNotAfter: new Date(before - 1000).toISOString() });
  await assert.rejects(f.controller.renew({ hostId: HOST }, { confirm: async () => true }),
    { code: "native_member_recovery_required" });
  assert.equal(f.calls.includes("read-issued"), false);
  assert.deepEqual(f.calls.slice(0, 2), ["read-protected-target", "inspect-issued"]);
});

test("renewal publishes one validated same-key certificate and returns only the observation DTO", async () => {
  const renewalId = "66666666-6666-4666-8666-666666666666";
  let keyRequest, renewedLeaf, response;
  const now = Date.now();
  const f = fixture({ createKey: async value => { keyRequest = await createSpsNativeMemberKeyRequest(value); return keyRequest; },
    inspectCredential: async ({ certificate }) => certificate.certificatePem === "saved-leaf"
      ? { notBefore: now - 30 * 86_400_000, notAfter: now + 12 * 60 * 60_000 }
      : { notBefore: Date.parse(renewedLeaf.validFrom), notAfter: Date.parse(renewedLeaf.validTo) },
    createRenewal: () => ({ async exchange() { f.calls.push("renew-exchange"); },
      async renew(input) { assert.equal(input.keyRequest, keyRequest); f.calls.push("renew"); return response; },
      dispose() { f.calls.push("dispose-renewal"); } }) });
  await enroll(f);
  const next = await issueSpsNativeMemberCertificate({ hostIdentity: host,
    request: await publicSpsNativeMemberEnrollmentRequest(keyRequest), notBefore: Math.floor(now / 1000) * 1000 - 1000,
    notAfter: Math.floor(now / 1000) * 1000 + 20 * 60 * 60_000, now: Math.floor(now / 1000) * 1000 });
  renewedLeaf = new X509Certificate(next.certificatePem);
  const issuerLeaf = new X509Certificate(host.memberIssuer.certificatePem);
  response = { renewalId, deviceId: DEVICE, predecessorCertificateSha256: "a".repeat(64),
    certificate: renewedLeaf.raw.toString("base64url"), issuerCertificate: issuerLeaf.raw.toString("base64url"),
    certificateNotBefore: new Date(Date.parse(renewedLeaf.validFrom)).toISOString(),
    certificateNotAfter: new Date(Date.parse(renewedLeaf.validTo)).toISOString() };
  const nextCredential = { certificatePem: next.certificatePem, issuerCertificatePem: host.memberIssuer.certificatePem };
  f.calls.length = 0;
  f.setCredentials({ certificatePem: "saved-leaf", issuerCertificatePem: host.memberIssuer.certificatePem }, nextCredential);
  f.setInspection({ state: "current", certificateNotBefore: new Date(now - 30 * 86_400_000).toISOString(),
    certificateNotAfter: new Date(now + 12 * 60 * 60_000).toISOString() });
  const result = await f.controller.renew({ hostId: HOST }, { confirm: async () => true });
  assert.deepEqual(result, { hostId: HOST, deviceId: DEVICE, status: "approved",
    certificateNotAfter: response.certificateNotAfter });
  assert.deepEqual(Object.keys(result), ["hostId", "deviceId", "status", "certificateNotAfter"]);
  assert.ok(f.calls.includes("publish-renewal"));
  assert.ok(f.calls.includes("dispose-renewal"));
});

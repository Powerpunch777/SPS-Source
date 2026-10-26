import assert from "node:assert/strict";
import { createHash, X509Certificate } from "node:crypto";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
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
  const calls = [];
  const hooks = {};
  async function step(name) { calls.push(name); if (hooks[name]) await hooks[name](); }
  const store = {
    async create(value, options) { await step("create-key"); options.beforeCommit(); assert.equal(key, null); key = value; },
    async createTarget(value, options) { await step("create-target"); options.beforeCommit(); assert.equal(target, null); target = value; },
    async read() { await step("read-key"); return key; },
    async readTarget() { await step("read-target"); return target; },
    async readIssued() { await step("read-issued"); return issued ? { issuance: issued, credential: { privateKeyPem: key.privateKeyPem } } : null; },
    async createIssued(value, options) { await step("create-issued"); options.beforeCommit(); assert.equal(issued, null); issued = value; },
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
    snapshot: () => ({ index, key, issued, target }),
  };
}
const enroll = (f, options = {}) => f.controller.enroll({ invitationCode, displayName: "Alice computer" }, { confirm: async () => true, ...options });

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

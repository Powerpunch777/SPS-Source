import assert from "node:assert/strict";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity, inspectSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import { createSpsNativeHostController, requireSpsNativeHostListenInput } from "../src/native-host-controller.mjs";
import { parseSpsNativeInviteCode } from "../src/native-connection-invite.mjs";
const HOST = "11111111-1111-4111-8111-111111111111";
let identity;
before(async () => {
  const now = Math.floor(Date.now() / 1000) * 1000;
  identity = await createSpsNativeHostIdentity({ hostId: HOST, hostnames: ["192.168.1.10"],
    notBefore: now - 1000, notAfter: now + 3600000, issuerNotAfter: now + 86400000 });
});
function fixture({ startGate, stopGate, serverCertificates } = {}) {
  const calls = [];
  const copied = [];
  let generation = 0n, allowed = true, listenerState = "off", storedIdentity = null;
  let ingressOptions = null;
  const controller = createSpsNativeHostController({
    getAuthority: () => allowed ? { ownerSubject: "fixture-owner", userDataDirectory: "C:/fixture", vaultDirectory: "C:/fixture/vault", generation } : null,
    authenticate: async () => { calls.push("authenticate"); },
    getIdentity: async () => storedIdentity ?? identity,
    getCoreIdentity: async () => ({ hostId: HOST, serverSpkiSha256: inspectSpsNativeHostIdentity(identity).serverSpkiSha256 }),
    localAddresses: () => ["192.168.1.10"],
    ...(serverCertificates ? { getServerCertificates: async () => { calls.push("read-server-certificates"); return serverCertificates; } } : {}),
    createIngress: options => { ingressOptions = options; return ({
      inspect() { return { state: listenerState, ...selection }; },
      async start(input) { calls.push("listen"); options.assertCurrent(); if (startGate) await startGate; listenerState = "listening"; return { state: "listening", ...input, hostId: HOST }; },
      async stop() { if (stopGate) await stopGate; listenerState = "off"; calls.push("stop"); },
    }); },
    dispatch: async () => {},
    issuePairing: async () => {
      calls.push("issue-invitation");
      const now = Date.now();
      return { pairingId: "22222222-2222-4222-8222-222222222222", pairingSecret: Buffer.alloc(32, 6).toString("base64url"),
        issuedAt: now, expiresAt: now + 3600000 };
    },
    copyInvitation: code => { copied.push(code); },
  });
  return { controller, calls, copied, get ingressOptions() { return ingressOptions; }, change: () => { generation++; }, signOut: () => { allowed = false; },
    failListener: () => { listenerState = "failed"; }, replaceIdentity: value => { storedIdentity = value; } };
}

test("isActive fences identity maintenance throughout pending start and stop", async () => {
  let releaseStart, releaseStop;
  const startGate = new Promise(resolve => { releaseStart = resolve; });
  const stopGate = new Promise(resolve => { releaseStop = resolve; });
  const f = fixture({ startGate, stopGate });
  assert.equal(f.controller.isActive(), false);
  const starting = f.controller.start(selection, { confirm: async () => true });
  assert.equal(f.controller.isActive(), true);
  releaseStart();
  await starting;
  const stopping = f.controller.stop();
  assert.equal(f.controller.inspect().state, "off");
  assert.equal(f.controller.isActive(), true);
  releaseStop();
  await stopping;
  assert.equal(f.controller.isActive(), false);
  await f.controller.start(selection, { confirm: async () => true });
  let releaseCopy;
  const copyGate = new Promise(resolve => { releaseCopy = resolve; });
  const copying = f.controller.copyInvite({ confirm: () => copyGate });
  assert.equal(f.controller.isActive(), true);
  releaseCopy(true);
  await copying;
  assert.equal(f.controller.isActive(), true);
  await f.controller.stop();
  assert.equal(f.controller.isActive(), false);
});

test("Host start passes its frozen validated certificate history to ingress", async () => {
  const history = Object.freeze([identity.server.certificatePem]);
  const f = fixture({ serverCertificates: history });
  await f.controller.start(selection, { confirm: async () => true });
  assert.deepEqual(f.calls, ["authenticate", "read-server-certificates", "listen"]);
  assert.deepEqual(f.ingressOptions.getServerCertificates(), history);
  assert.equal(Object.isFrozen(f.ingressOptions.getServerCertificates()), true);
  await f.controller.stop();
});
const selection = { bindAddress: "192.168.1.10", port: 43123 };
test("Native Host starts off and only a confirmed current Owner opens its selected private interface", async () => {
  const f = fixture(); assert.deepEqual(f.controller.inspect(), { state: "off" });
  assert.deepEqual(f.calls, []);
  const started = await f.controller.start(selection, { confirm: async () => true });
  assert.deepEqual(started, { state: "listening", ...selection, hostId: HOST });
  assert.deepEqual(f.calls, ["authenticate", "listen"]);
  await f.controller.stop(); assert.deepEqual(f.controller.inspect(), { state: "off" });
  assert.deepEqual(f.calls, ["authenticate", "listen", "stop"]);
});
test("cancelled opt-in never creates a listener", async () => {
  const f = fixture();
  assert.deepEqual(await f.controller.start(selection, { confirm: async () => false }), { cancelled: true });
  assert.deepEqual(f.calls, ["authenticate"]);
});

test("Host status stops advertising a listener after its captured certificate expires", async t => {
  const f = fixture(); await f.controller.start(selection, { confirm: async () => true });
  const future = Date.now() + 2 * 86_400_000;
  t.mock.method(Date, "now", () => future);
  assert.deepEqual(f.controller.inspect(), { state: "off" });
  await f.controller.stop(); assert.equal(f.calls.at(-1), "stop");
});
test("account changes while the confirmation is open deny start", async () => {
  const f = fixture();
  await assert.rejects(f.controller.start(selection, { confirm: async () => { f.change(); return true; } }));
  assert.deepEqual(f.calls, ["authenticate"]);
});
test("Owner loss stops an existing listener and clears its public state", async () => {
  const f = fixture(); await f.controller.start(selection, { confirm: async () => true });
  f.signOut(); assert.deepEqual(f.controller.inspect(), { state: "off" });
  assert.equal(f.calls.at(-1), "stop");
});

test("an unexpected listener failure clears Host state and prevents invitation issuance", async () => {
  const f = fixture(); await f.controller.start(selection, { confirm: async () => true });
  f.failListener();
  await assert.rejects(f.controller.copyInvite({ confirm: async () => true }));
  assert.equal(f.calls.includes("issue-invitation"), false);
  assert.deepEqual(f.controller.inspect(), { state: "off" });
});

test("a changed issuer with the same Host server identity cannot issue an unusable invitation", async () => {
  const f = fixture(); await f.controller.start(selection, { confirm: async () => true });
  const original = inspectSpsNativeHostIdentity(identity);
  const replacement = await createSpsNativeHostIdentity({ hostId: HOST, hostnames: [selection.bindAddress],
    notBefore: original.serverNotBefore, notAfter: original.serverNotAfter, issuerNotAfter: original.memberIssuerNotAfter });
  f.replaceIdentity({ ...identity, memberIssuer: replacement.memberIssuer });
  await assert.rejects(f.controller.copyInvite({ confirm: async () => true }));
  assert.equal(f.calls.includes("issue-invitation"), false);
  assert.deepEqual(f.copied, []);
  await f.controller.stop();
});
test("wildcard, public, loopback, missing interface and privileged ports cannot enable product Native LAN", async () => {
  for (const bindAddress of ["0.0.0.0", "::", "127.0.0.1", "8.8.8.8", "host.example.test"]) {
    assert.throws(() => requireSpsNativeHostListenInput({ ...selection, bindAddress }));
  }
  assert.throws(() => requireSpsNativeHostListenInput({ ...selection, port: 443 }));
  const f = fixture();
  await assert.rejects(f.controller.start({ ...selection, bindAddress: "192.168.1.99" }, { confirm: async () => true }));
  assert.equal(f.calls.includes("listen"), false);
});

test("only an explicit confirmed copy on an active Host issues an invitation; no secret is returned", async () => {
  const f = fixture();
  await assert.rejects(f.controller.copyInvite({ confirm: async () => true }));
  await f.controller.start(selection, { confirm: async () => true });
  assert.deepEqual(await f.controller.copyInvite({ confirm: async () => false }), { cancelled: true });
  assert.equal(f.calls.includes("issue-invitation"), false);
  const result = await f.controller.copyInvite({ confirm: async () => true });
  assert.equal(result.copied, true); assert.deepEqual(Object.keys(result), ["copied", "expiresAt"]);
  assert.equal(f.copied.length, 1);
  const invitation = parseSpsNativeInviteCode(f.copied[0]);
  assert.equal(invitation.hostId, HOST);
  assert.equal(invitation.origin, "https://192.168.1.10:43123");
  assert.equal(invitation.expiresAt - invitation.issuedAt, 3600000);
  await f.controller.stop();
});

test("account change during copy confirmation creates no invitation or clipboard write", async () => {
  const f = fixture(); await f.controller.start(selection, { confirm: async () => true });
  await assert.rejects(f.controller.copyInvite({ confirm: async () => { f.change(); return true; } }));
  assert.equal(f.calls.includes("issue-invitation"), false);
  assert.deepEqual(f.copied, []);
  await f.controller.stop();
});

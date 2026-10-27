import assert from "node:assert/strict";
import test, { before } from "node:test";
import { createSpsNativeHostIdentity } from "../src/native-identity-certificates.mjs";
import {
  assertSpsNativeHostCredentialsAbsentForRestore, createSpsNativeIdentityController,
  requireSpsNativeIdentityPreparationInput,
} from "../src/native-identity-controller.mjs";

const NOW = Math.floor(Date.now() / 1000) * 1000;
const AUTHORITY = Object.freeze({ ownerSubject: "fixture-owner", userDataDirectory: "C:/fixture/user-data", vaultDirectory: "C:/fixture/vault" });
let identity;
before(async () => {
  identity = await createSpsNativeHostIdentity({
    hostId: "11111111-1111-4111-8111-111111111111", hostnames: ["192.168.1.10"],
    notBefore: NOW, notAfter: NOW + 90 * 86_400_000, issuerNotAfter: NOW + 365 * 86_400_000,
  });
});

function setup(overrides = {}) {
  let currentAuthority = AUTHORITY;
  let stored = null;
  const calls = [];
  const store = {
    inspectPresence: async () => ({ state: stored ? "present" : "absent" }),
    read: async () => stored,
    create: async (value, options) => { options.beforeCommit(); calls.push("commit"); stored = value; },
    ...overrides.store,
  };
  const controller = createSpsNativeIdentityController({
    getAuthority: () => currentAuthority,
    authenticateHost: async () => { calls.push("authenticate"); },
    getStore: () => { calls.push("store"); return store; },
    now: () => NOW,
    createIdentity: async options => { calls.push(["generate", options]); return identity; },
    createHostId: () => identity.hostId,
    ...overrides.options,
  });
  return { controller, store, calls, setAuthority: value => { currentAuthority = value; }, setStored: value => { stored = value; } };
}

test("accepts only exact private IPv4 or ULA certificate addresses without evaluating accessors", () => {
  for (const address of ["10.1.2.3", "172.16.0.1", "172.31.255.254", "192.168.1.10", "fd00::1"]) {
    assert.equal(requireSpsNativeIdentityPreparationInput({ serverAddress: address }).serverAddress, address);
  }
  assert.equal(requireSpsNativeIdentityPreparationInput({ serverAddress: "FD00:0:0:0:0:0:0:1" }).serverAddress, "fd00::1");
  for (const address of ["127.0.0.1", "::1", "169.254.1.1", "fe80::1", "100.64.1.1", "8.8.8.8", "172.32.1.1", "0.0.0.0", "sps.test", "https://192.168.1.10", "192.168.1.10\n", "192.168.01.1"]) {
    assert.throws(() => requireSpsNativeIdentityPreparationInput({ serverAddress: address }), TypeError);
  }
  for (const input of [null, [], {}, { serverAddress: "192.168.1.10", path: "C:/outside" }]) {
    assert.throws(() => requireSpsNativeIdentityPreparationInput(input), TypeError);
  }
  let invoked = false;
  const input = Object.defineProperty({}, "serverAddress", { enumerable: true, get() { invoked = true; return "192.168.1.10"; } });
  assert.throws(() => requireSpsNativeIdentityPreparationInput(input), TypeError);
  assert.equal(invoked, false);
});

test("unauthorized status never touches the credential store or authenticates automatically", async () => {
  const ctx = setup();
  ctx.setAuthority(null);
  assert.deepEqual(await ctx.controller.inspect(), { state: "host_required", lanEnabled: false, canPrepare: false });
  assert.deepEqual(ctx.calls, []);
  await assert.rejects(ctx.controller.prepare({ serverAddress: "192.168.1.10" }), { code: "native_identity_host_required" });
  assert.deepEqual(ctx.calls, []);
});

test("inspection does not create keys, and present status contains only public fingerprint and expiry", async () => {
  const ctx = setup();
  assert.deepEqual(await ctx.controller.inspect(), { state: "not_prepared", lanEnabled: false, canPrepare: true });
  assert.equal(ctx.calls.includes("authenticate"), false);
  ctx.setStored(identity);
  const result = await ctx.controller.inspect();
  assert.equal(result.state, "identity_prepared");
  assert.equal(result.canPrepare, false);
  assert.equal(result.lanEnabled, false);
  assert.deepEqual(Object.keys(result), ["state", "lanEnabled", "canPrepare", "serverSpkiSha256", "serverNotAfter", "memberIssuerNotAfter", "serverRenewalAvailableAt"]);
  assert.equal(result.serverRenewalAvailableAt, NOW + 60 * 86_400_000);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|certificatePem|ownerSubject|vaultDirectory|hostId/);
  assert.equal(Object.isFrozen(result), true);
});

test("preparation authenticates and uses approved lifetime defaults without granting LAN access", async () => {
  const ctx = setup();
  let requesterChecks = 0;
  const result = await ctx.controller.prepare({ serverAddress: "192.168.1.10" }, { assertRequester: () => { requesterChecks++; } });
  assert.equal(result.state, "identity_prepared");
  assert.equal(result.lanEnabled, false);
  assert.equal(ctx.calls.includes("commit"), true);
  assert.equal(ctx.calls.filter(value => value === "authenticate").length, 1);
  const [, options] = ctx.calls.find(value => Array.isArray(value));
  assert.deepEqual(options.hostnames, ["192.168.1.10"]);
  assert.equal(options.notBefore, NOW);
  assert.equal(options.notAfter - options.notBefore, 90 * 86_400_000);
  assert.equal(options.issuerNotAfter - options.notBefore, 365 * 86_400_000);
  assert.ok(requesterChecks >= 4);
});

test("existing, expired or corrupt identities are never silently replaced or renewed", async () => {
  for (const expired of [false, true]) {
    const ctx = setup({ options: expired ? { now: () => NOW + 400 * 86_400_000 } : {} });
    ctx.setStored(identity);
    assert.equal((await ctx.controller.inspect()).state, expired ? "identity_not_current" : "identity_prepared");
    await assert.rejects(ctx.controller.prepare({ serverAddress: "192.168.1.20" }), { code: "native_identity_recovery_required" });
    assert.equal(ctx.calls.some(Array.isArray), false);
    assert.equal(ctx.calls.includes("commit"), false);
  }
  const corrupt = setup({ store: { inspectPresence: async () => ({ state: "present" }), read: async () => { throw new Error("private diagnostic"); } } });
  assert.equal((await corrupt.controller.inspect()).state, "recovery_required");
  await assert.rejects(corrupt.controller.prepare({ serverAddress: "192.168.1.10" }), { code: "native_identity_recovery_required" });
  assert.equal(corrupt.calls.includes("commit"), false);
});

test("missing or inaccessible Vault data is not presented as a fresh identity slot", async () => {
  const ctx = setup({ store: { read: async () => { throw new Error("missing Vault"); } } });
  assert.deepEqual(await ctx.controller.inspect(), { state: "unavailable", lanEnabled: false, canPrepare: false });
  await assert.rejects(ctx.controller.prepare({ serverAddress: "192.168.1.10" }), { code: "native_identity_recovery_required" });
  assert.equal(ctx.calls.some(Array.isArray), false);
});

test("authentication failure cannot generate or persist keys and does not expose its diagnostics", async () => {
  const ctx = setup({ options: { authenticateHost: async () => { throw new Error("access_token=private-path"); } } });
  await assert.rejects(ctx.controller.prepare({ serverAddress: "192.168.1.10" }), failure => {
    assert.equal(failure.code, "native_identity_unavailable");
    assert.doesNotMatch(failure.message, /access_token|private-path/);
    return true;
  });
  assert.equal(ctx.calls.some(Array.isArray), false);
  assert.equal(ctx.calls.includes("commit"), false);
});

test("a generated bundle must match the requested Host ID and private certificate address", async () => {
  const wrongAddress = setup();
  await assert.rejects(wrongAddress.controller.prepare({ serverAddress: "192.168.1.20" }), { code: "native_identity_unavailable" });
  assert.equal(wrongAddress.calls.includes("commit"), false);
  const wrongId = setup({ options: { createHostId: () => "22222222-2222-4222-8222-222222222222" } });
  await assert.rejects(wrongId.controller.prepare({ serverAddress: "192.168.1.10" }), { code: "native_identity_unavailable" });
  assert.equal(wrongId.calls.includes("commit"), false);
});

test("account or Vault changes during authentication or generation deny commit", async () => {
  for (const phase of ["authentication", "generation"]) {
    let ctx;
    ctx = setup({ options: {
      authenticateHost: async () => { if (phase === "authentication") ctx.setAuthority(null); },
      createIdentity: async () => { ctx.setAuthority({ ...AUTHORITY, vaultDirectory: "C:/another-vault" }); return identity; },
    } });
    await assert.rejects(ctx.controller.prepare({ serverAddress: "192.168.1.10" }), { code: "native_identity_authority_changed" });
    assert.equal(ctx.calls.includes("commit"), false);
  }
});

test("a lost requester or authority immediately before persistence denies commit", async () => {
  const gone = setup();
  let calls = 0;
  await assert.rejects(gone.controller.prepare({ serverAddress: "192.168.1.10" }, { assertRequester: () => {
    if (++calls > 3) throw new Error("Native window closed");
  } }), { code: "native_identity_unavailable" });
  assert.equal(gone.calls.includes("commit"), false);
  let changed;
  changed = setup({ store: { create: async (_value, options) => {
    changed.setAuthority(null);
    options.beforeCommit();
    changed.calls.push("commit");
  } } });
  await assert.rejects(changed.controller.prepare({ serverAddress: "192.168.1.10" }), { code: "native_identity_authority_changed" });
  assert.equal(changed.calls.includes("commit"), false);
});

test("concurrent preparation is refused instead of creating or replacing two Host identities", async () => {
  let release;
  const ctx = setup({ options: { authenticateHost: () => new Promise(resolve => { release = resolve; }) } });
  const pending = ctx.controller.prepare({ serverAddress: "192.168.1.10" });
  await assert.rejects(ctx.controller.prepare({ serverAddress: "192.168.1.10" }), { code: "native_identity_busy" });
  release();
  assert.equal((await pending).state, "identity_prepared");
  assert.equal(ctx.calls.filter(value => value === "commit").length, 1);
});

test("fresh restore requires proven absence, not a missing Vault, failed read or unknown result", async () => {
  await assertSpsNativeHostCredentialsAbsentForRestore({ inspectPresence: async () => ({ state: "absent" }) });
  for (const state of ["present", "unknown", undefined]) {
    await assert.rejects(assertSpsNativeHostCredentialsAbsentForRestore({ inspectPresence: async () => ({ state }) }), {
      code: "native_identity_restore_blocked",
    });
  }
  await assert.rejects(assertSpsNativeHostCredentialsAbsentForRestore({ inspectPresence: async () => { throw new Error("private-path"); } }), failure => {
    assert.equal(failure.code, "native_identity_unavailable");
    assert.doesNotMatch(failure.message, /private-path/);
    return true;
  });
});

test("Host renewal keeps keys, requires listener inactivity and fences confirmation generation", async () => {
  const previous = await createSpsNativeHostIdentity({ hostId: identity.hostId, hostnames: ["192.168.1.10"],
    notBefore: NOW - 70 * 86_400_000, notAfter: NOW + 20 * 86_400_000, issuerNotAfter: NOW + 295 * 86_400_000 });
  let current = previous, listening = false, authority = { ...AUTHORITY, generation: 1n }, publications = 0;
  const controller = createSpsNativeIdentityController({ getAuthority: () => authority,
    authenticateHost: async () => {}, isListening: () => listening, now: () => NOW,
    getStore: () => ({ inspectPresence: async () => ({ state: "present" }), read: async () => current,
      publishServerRenewal: async (next, options) => { options.beforeCommit(); publications++; current = next; } }) });
  listening = true;
  await assert.rejects(controller.renew({ confirm: async () => true }), { code: "native_identity_listener_active" });
  listening = false;
  assert.deepEqual(await controller.renew({ confirm: async () => false }), { cancelled: true });
  assert.equal(publications, 0);
  await assert.rejects(controller.renew({ confirm: async () => {
    authority = { ...authority, generation: 2n }; return true;
  } }), { code: "native_identity_authority_changed" });
  assert.equal(publications, 0);
  const result = await controller.renew({ confirm: async preview => {
    assert.deepEqual(Object.keys(preview), ["hostId", "serverNotAfter"]);
    assert.equal(controller.isMaintaining(), true); return true;
  } });
  assert.equal(result.state, "identity_prepared");
  assert.equal(publications, 1);
  assert.equal(current.server.privateKeyPem, previous.server.privateKeyPem);
  assert.deepEqual(current.memberIssuer, previous.memberIssuer);
  assert.notEqual(current.server.certificatePem, previous.server.certificatePem);
  assert.ok(result.serverNotAfter > NOW + 20 * 86_400_000);
  assert.equal(controller.isMaintaining(), false);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE KEY|CERTIFICATE|fixture-owner|vault/);
});

test("Host publication repair is explicit and guarded without renewing or starting a listener", async () => {
  let repaired = 0, listening = false;
  const controller = createSpsNativeIdentityController({ getAuthority: () => AUTHORITY,
    authenticateHost: async () => {}, isListening: () => listening,
    getStore: () => ({ recoverInterruptedServerRenewal: async options => {
      options.beforeCommit(); repaired++; return { recovered: true };
    } }) });
  assert.deepEqual(await controller.repairServerRenewal({ confirm: async () => false }), { cancelled: true });
  assert.equal(repaired, 0);
  assert.deepEqual(await controller.repairServerRenewal({ confirm: async () => true }), { recovered: true });
  listening = true;
  await assert.rejects(controller.repairServerRenewal({ confirm: async () => true }), { code: "native_identity_listener_active" });
  assert.equal(repaired, 1);
});

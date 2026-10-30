import assert from "node:assert/strict";
import test from "node:test";
import { createNativeInvitationManagementController, requireNativeInvitationRevokeInput } from "../src/native-invitation-management-controller.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const INVITE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DEVICE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PIN = "a".repeat(64);
const AUTHORITY = Object.freeze({ ownerSubject: "private-owner", userDataDirectory: "C:/private/user",
  vaultDirectory: "C:/private/vault", generation: 1n });
const BINDING = Object.freeze({ hostId: HOST, serverSpkiSha256: PIN });

function invitation(overrides = {}) {
  return {
    id: INVITE, status: "pending", createdAt: "2026-10-26T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z", failedAttempts: 1, maxAttempts: 5,
    issuedByUserId: "private-owner-user-id", consumedByUserId: null,
    consumedDeviceSnapshotId: null, target: "any_verified_user", ...overrides,
  };
}

function fixture(overrides = {}) {
  let currentAuthority = overrides.authority === undefined ? AUTHORITY : overrides.authority;
  let rows = overrides.rows ?? [invitation()];
  const calls = { authenticateHost: 0, getIdentity: 0, getHostBinding: 0, listInvitations: 0, revokeInvitation: 0 };
  const callbacks = {
    getAuthority: () => currentAuthority,
    authenticateHost: async () => { calls.authenticateHost++; },
    getIdentity: async () => { calls.getIdentity++; return BINDING; },
    getHostBinding: async () => { calls.getHostBinding++; return BINDING; },
    listInvitations: async () => { calls.listInvitations++; return rows; },
    revokeInvitation: async id => {
      calls.revokeInvitation++;
      const current = rows.find(row => row.id === id);
      rows = rows.map(row => row.id === id ? invitation({ ...current, status: "revoked" }) : row);
      return rows.find(row => row.id === id);
    },
    ...overrides.callbacks,
  };
  return {
    calls,
    controller: createNativeInvitationManagementController(callbacks),
    setAuthority(value) { currentAuthority = value; },
    setRows(value) { rows = value; },
    get rows() { return rows; },
  };
}

function options(overrides = {}) { return { assertRequester() {}, ...overrides }; }
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("requires all private Host and Owner-session dependencies", () => {
  const valid = { getAuthority() {}, authenticateHost() {}, getIdentity() {}, getHostBinding() {}, listInvitations() {}, revokeInvitation() {} };
  for (const key of Object.keys(valid)) assert.throws(() => createNativeInvitationManagementController({ ...valid, [key]: null }), TypeError, key);
});

test("projects bounded invitation metadata without pairing secrets, private user IDs, or consumed device IDs", async () => {
  const ctx = fixture({ rows: [invitation({
    issuedByUserId: "owner-user-secret",
    consumedByUserId: "joiner-user-secret", consumedDeviceSnapshotId: DEVICE,
    target: "verified_email",
  })] });
  const result = await ctx.controller.list(options());
  assert.deepEqual(result, { state: "available", invitations: [{ id: INVITE, status: "pending",
    createdAt: "2026-10-26T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
    failedAttempts: 1, maxAttempts: 5, target: "verified_email" }] });
  assert.deepEqual(Object.keys(result.invitations[0]), ["id", "status", "createdAt", "expiresAt", "failedAttempts", "maxAttempts", "target"]);
  assert.doesNotMatch(JSON.stringify(result), /secret|private-owner-user-id|joiner-user-secret|bbbbbbbb|example\.test/);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.invitations), true);
  assert.equal(Object.isFrozen(result.invitations[0]), true);
  assert.equal(ctx.calls.authenticateHost, 1);
});

test("no Host or identity reports a local state without making requests", async t => {
  await t.test("Host not configured", async () => {
    const ctx = fixture({ authority: null });
    assert.deepEqual(await ctx.controller.list(options()), { state: "host_required", invitations: [] });
    assert.deepEqual(ctx.calls, { authenticateHost: 0, getIdentity: 0, getHostBinding: 0, listInvitations: 0, revokeInvitation: 0 });
  });
  await t.test("identity not prepared", async () => {
    const ctx = fixture({ callbacks: { getIdentity: async () => {
      const error = new Error("sensitive local diagnostics"); error.code = "native_identity_unavailable"; throw error;
    } } });
    assert.deepEqual(await ctx.controller.list(options()), { state: "identity_required", invitations: [] });
    assert.equal(ctx.calls.getHostBinding, 0);
    assert.equal(ctx.calls.listInvitations, 0);
  });
  await t.test("Core needs Host restart", async () => {
    const ctx = fixture({ callbacks: { getHostBinding: async () => { const error = new Error(); error.status = 404; throw error; } } });
    assert.deepEqual(await ctx.controller.list(options()), { state: "host_restart_required", invitations: [] });
    assert.equal(ctx.calls.listInvitations, 0);
  });
});

test("does not return a stale invitation projection when the signed-in Host account disappears during the read", async () => {
  const entered = deferred(), gate = deferred();
  const ctx = fixture({ callbacks: { listInvitations: async () => {
    ctx.calls.listInvitations++;
    entered.resolve();
    await gate.promise;
    return [invitation()];
  } } });
  const pending = ctx.controller.list(options());
  await entered.promise;
  ctx.setAuthority(null);
  gate.resolve();
  assert.deepEqual(await pending, { state: "host_required", invitations: [] });
});

test("rejects wrong Host binding and malformed or overlong Core list DTOs", async t => {
  for (const [label, overrides] of [
    ["different Host", { getHostBinding: async () => ({ hostId: "22222222-2222-4222-8222-222222222222", serverSpkiSha256: PIN }) }],
    ["different server pin", { getHostBinding: async () => ({ hostId: HOST, serverSpkiSha256: "c".repeat(64) }) }],
    ["extra secret field", { listInvitations: async () => [invitation({ pairingSecret: "must reject" })] }],
    ["too many rows", { listInvitations: async () => Array.from({ length: 201 }, (_, i) => invitation({ id: `${String(i).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa` })) }],
  ]) await t.test(label, async () => {
    const ctx = fixture({ callbacks: overrides });
    assert.deepEqual(await ctx.controller.list(options()), { state: "unavailable", invitations: [] });
  });
});

test("rejects malformed revoke arguments without authenticating or requesting Core", async () => {
  const ctx = fixture();
  let getterCalled = false;
  const accessor = Object.defineProperty({}, "invitationId", { enumerable: true, get() { getterCalled = true; return INVITE; } });
  for (const input of [null, {}, { invitationId: INVITE, extra: true }, { invitationId: "not-a-uuid" }, accessor]) {
    assert.throws(() => requireNativeInvitationRevokeInput(input), TypeError);
  }
  await assert.rejects(ctx.controller.revoke({ invitationId: INVITE }));
  assert.equal(getterCalled, false);
  assert.deepEqual(ctx.calls, { authenticateHost: 0, getIdentity: 0, getHostBinding: 0, listInvitations: 0, revokeInvitation: 0 });
});

test("only a live pending invite can be explicitly confirmed for revocation", async t => {
  for (const [label, row] of [
    ["expired", invitation({ status: "expired" })],
    ["already revoked", invitation({ status: "revoked" })],
    ["consumed", invitation({ status: "consumed", consumedByUserId: "member-user", consumedDeviceSnapshotId: DEVICE })],
    ["time-expired pending", invitation({ expiresAt: "2000-01-01T00:00:00.000Z" })],
  ]) await t.test(label, async () => {
    const ctx = fixture({ rows: [row] });
    await assert.rejects(ctx.controller.revoke({ invitationId: INVITE }, options({ confirm: async () => true })));
    assert.equal(ctx.calls.revokeInvitation, 0);
  });
});

test("confirmation cancellation does not mutate and returns only the current redacted snapshot", async () => {
  const ctx = fixture();
  const value = await ctx.controller.revoke({ invitationId: INVITE }, options({ confirm: async row => {
    assert.equal(row.id, INVITE); assert.equal(Object.hasOwn(row, "pairingSecret"), false); return false;
  } }));
  assert.equal(value.invitations[0].status, "pending");
  assert.equal(ctx.calls.revokeInvitation, 0);
});

test("account/session loss or changed invitation during confirmation prevents a stale revoke", async t => {
  await t.test("Host generation changes while confirm is open", async () => {
    const ctx = fixture();
    await assert.rejects(ctx.controller.revoke({ invitationId: INVITE }, options({ confirm: async () => {
      ctx.setAuthority({ ...AUTHORITY, generation: 2n }); return true;
    } })));
    assert.equal(ctx.calls.revokeInvitation, 0);
  });
  await t.test("confirmation target changed", async () => {
    const ctx = fixture();
    await assert.rejects(ctx.controller.revoke({ invitationId: INVITE }, options({ confirm: async () => {
      ctx.setRows([invitation({ failedAttempts: 2 })]); return true;
    } })));
    assert.equal(ctx.calls.revokeInvitation, 0);
  });
  await t.test("Settings requester closes during confirmation", async () => {
    let alive = true;
    const ctx = fixture();
    await assert.rejects(ctx.controller.revoke({ invitationId: INVITE }, options({
      assertRequester() { if (!alive) throw new Error("closed"); },
      confirm: async () => { alive = false; return true; },
    })));
    assert.equal(ctx.calls.revokeInvitation, 0);
  });
});

test("successful explicit revoke returns re-read status and no invitation secret", async () => {
  const ctx = fixture();
  const result = await ctx.controller.revoke({ invitationId: INVITE }, options({ confirm: async () => true }));
  assert.equal(result.state, "available");
  assert.equal(result.invitations[0].status, "revoked");
  assert.equal(ctx.calls.revokeInvitation, 1);
  assert.doesNotMatch(JSON.stringify(result), /pairingSecret|private-owner-user-id/);
});

test("serializes writes and withholds success if authority changes after Core commits", async t => {
  await t.test("one concurrent mutation", async () => {
    const entered = deferred(), gate = deferred();
    const ctx = fixture({ callbacks: { revokeInvitation: async id => {
      ctx.calls.revokeInvitation++; entered.resolve(); await gate.promise;
      const updated = invitation({ status: "revoked" }); ctx.setRows([updated]); return updated;
    } } });
    const confirmation = options({ confirm: async () => true });
    const first = ctx.controller.revoke({ invitationId: INVITE }, confirmation);
    await entered.promise;
    await assert.rejects(ctx.controller.revoke({ invitationId: INVITE }, confirmation));
    gate.resolve();
    assert.equal((await first).invitations[0].status, "revoked");
    assert.equal(ctx.calls.revokeInvitation, 1);
  });
  await t.test("account changes after remote commit", async () => {
    const ctx = fixture({ callbacks: { revokeInvitation: async id => {
      ctx.calls.revokeInvitation++;
      ctx.setRows([invitation({ status: "revoked" })]);
      ctx.setAuthority({ ...AUTHORITY, generation: 2n });
      return invitation({ status: "revoked" });
    } } });
    await assert.rejects(ctx.controller.revoke({ invitationId: INVITE }, options({ confirm: async () => true })));
    assert.equal(ctx.calls.revokeInvitation, 1);
  });
});

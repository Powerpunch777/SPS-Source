import assert from "node:assert/strict";
import test from "node:test";
import { HISTORICAL_DESKTOP_STATE_VERSION, projectLegacyDesktopStateV11 } from "../scripts/legacy-desktop-state-fixture.mjs";

function currentState(overrides = {}) {
  return {
    version: 13,
    encryptedDesktopAccount: "dpapi-account-ciphertext",
    desktopAccountLastAttempt: null,
    desktopJoinLastAttempt: null,
    desktopDeviceId: "sps-desktop-fixture-device",
    nativeMemberKeyIndex: { v: 1, entries: [] },
    nativeNodes: { v: 1, entries: [] },
    accountConnections: { "sps-desktop-e2e-owner": { connectionKind: "owner-host" } },
    ownerHostOwnerSubject: "sps-desktop-e2e-owner",
    ownerRestoreAttempts: [],
    legacyOwnerHostAdoptionPending: false,
    profile: { connectionKind: "owner-host", hubUrl: "http://127.0.0.1:31310" },
    identity: { publicKeyPem: "fixture-public-key", encryptedPrivateKey: "dpapi-node-key" },
    encryptedBoardApiToken: "dpapi-board-ciphertext",
    encryptedNodeCompletionOutbox: null,
    encryptedNodeClaimJournal: null,
    companies: [],
    projects: [],
    nodeId: null,
    nodeStatus: null,
    transportKeyPublishedAt: null,
    teamAccess: null,
    encryptedTeamCredentials: null,
    encryptedHostProjectShareSecrets: "dpapi-host-share-ciphertext",
    ...overrides,
  };
}

test("projects exactly the authentic historical v11 state keys and preserves legacy data", () => {
  const current = currentState();
  const legacy = projectLegacyDesktopStateV11(current);

  assert.equal(legacy.version, HISTORICAL_DESKTOP_STATE_VERSION);
  assert.deepEqual(Object.keys(legacy), [
    "version", "encryptedDesktopAccount", "desktopAccountLastAttempt", "desktopJoinLastAttempt",
    "desktopDeviceId", "accountConnections", "ownerHostOwnerSubject", "legacyOwnerHostAdoptionPending",
    "profile", "identity", "encryptedBoardApiToken", "companies", "projects", "nodeId", "nodeStatus",
    "transportKeyPublishedAt", "teamAccess", "encryptedTeamCredentials", "encryptedHostProjectShareSecrets",
  ]);
  for (const key of ["encryptedDesktopAccount", "desktopDeviceId", "accountConnections", "ownerHostOwnerSubject",
    "profile", "identity", "encryptedBoardApiToken", "encryptedHostProjectShareSecrets"]) {
    assert.deepEqual(legacy[key], current[key], `${key} must survive the historical projection`);
  }
  assert.equal(Object.hasOwn(legacy, "nativeMemberKeyIndex"), false);
  assert.equal(Object.hasOwn(legacy, "encryptedNodeCompletionOutbox"), false);
});

test("refuses to silently discard non-empty v13-only state", () => {
  for (const [key, value] of [
    ["nativeMemberKeyIndex", { v: 1, entries: [{ id: "member-key" }] }],
    ["nativeNodes", { v: 1, entries: [{ id: "node" }] }],
    ["ownerRestoreAttempts", [{ id: "restore" }]],
    ["encryptedNodeCompletionOutbox", "ciphertext"],
    ["encryptedNodeClaimJournal", "ciphertext"],
  ]) {
    assert.throws(() => projectLegacyDesktopStateV11(currentState({ [key]: value })), new RegExp(key));
  }
});

test("rejects unknown fields instead of copying or discarding them", () => {
  assert.throws(() => projectLegacyDesktopStateV11(currentState({ injectedField: { copy: "me" } })), /unknown current/);
  const polluted = JSON.parse('{"__proto__":{"injected":true}}');
  assert.throws(() => projectLegacyDesktopStateV11({ ...currentState(), ...polluted }), /unknown current/);
});

test("requires a complete current state and the expected source version", () => {
  const missing = currentState();
  delete missing.profile;
  assert.throws(() => projectLegacyDesktopStateV11(missing), /missing historical field: profile/);
  assert.throws(() => projectLegacyDesktopStateV11(currentState({ version: 12 })), /current v13/);
});

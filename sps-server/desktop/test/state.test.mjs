import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { consumeLegacyDesktopConnectionMigration, emptyState, hasPendingLegacyDesktopOwnerAdoption, loadState, saveState } from "../src/state.mjs";
import { allocateSpsNativeMemberKeyIndex } from "../src/native-member-key-index.mjs";

test("migrates v11 public Member key metadata without changing accounts, Node keys or routing", async () => {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-member-index-"));
  const root = await fs.realpath(created);
  const identity = await fs.lstat(root, { bigint: true });
  const file = path.join(root, "sps-desktop-state.json");
  try {
    const legacy = { version: 11, desktopDeviceId: "existing-desktop-id", nodeId: "existing-node",
      identity: { encryptedPrivateKey: "existing-encrypted-node-key" }, encryptedDesktopAccount: "existing-encrypted-account",
      profile: { hubUrl: "https://host.example.test", connectionKind: "remote", authMode: "sps-identity" } };
    await fs.writeFile(file, JSON.stringify(legacy));
    const state = await loadState(root, { strictVersion: true });
    assert.equal(state.version, 12);
    assert.deepEqual(state.nativeMemberKeyIndex, { v: 1, entries: [] });
    for (const field of ["desktopDeviceId", "nodeId", "identity", "encryptedDesktopAccount", "profile"]) {
      assert.deepEqual(state[field], legacy[field]);
    }
    const scope = { identityIssuer: "https://identity.example.test", subject: "member-one",
      hostId: "11111111-1111-4111-8111-111111111111" };
    const allocated = allocateSpsNativeMemberKeyIndex(state.nativeMemberKeyIndex, scope, { maxEntries: 4,
      createDeviceKeyId: () => "22222222-2222-4222-8222-222222222222" });
    state.nativeMemberKeyIndex = allocated.index;
    await saveState(root, state);
    const loaded = await loadState(root, { strictVersion: true });
    const existing = allocateSpsNativeMemberKeyIndex(loaded.nativeMemberKeyIndex, scope, { maxEntries: 4,
      createDeviceKeyId: () => { throw new Error("Must not allocate on restart"); } });
    assert.equal(existing.created, false);
    assert.equal(existing.deviceKeyId, allocated.deviceKeyId);
    assert.equal(Object.isFrozen(loaded.nativeMemberKeyIndex.entries[0]), true);
    assert.equal(loaded.identity.encryptedPrivateKey, legacy.identity.encryptedPrivateKey);

    for (const invalid of [null, {}, { v: 1, entries: [] , secret: "must-not-accept" },
      { v: 1, entries: [allocated.index.entries[0], allocated.index.entries[0]] }]) {
      const raw = JSON.stringify({ ...state, nativeMemberKeyIndex: invalid });
      await fs.writeFile(file, raw);
      await assert.rejects(loadState(root, { strictVersion: true }));
      await assert.rejects(loadState(root));
      assert.equal(await fs.readFile(file, "utf8"), raw);
    }
  } finally {
    assert.equal(await fs.realpath(root), root);
    assert.equal(path.basename(root).startsWith("sps-state-member-index-"), true);
    const current = await fs.lstat(root, { bigint: true });
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(current.dev, identity.dev);
    assert.equal(current.ino, identity.ino);
    assert.equal(current.birthtimeNs, identity.birthtimeNs);
    await fs.rm(root, { recursive: true });
  }
});

test("strict startup rejects parseable damage to ownership and account routing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  const file = path.join(root, "sps-desktop-state.json");
  const profile = { hubUrl: "http://127.0.0.1:31310", connectionKind: "owner-host" };
  try {
    for (const patch of [
      { ownerHostOwnerSubject: 42 }, { accountConnections: [] },
      { accountConnections: { member: null } },
      { ownerHostOwnerSubject: "owner", accountConnections: { member: profile } },
      { ownerHostOwnerSubject: null, profile },
      { legacyOwnerHostAdoptionPending: "true" },
      { encryptedDesktopAccount: [] }, { encryptedBoardApiToken: {} },
      { encryptedTeamCredentials: [] }, { encryptedHostProjectShareSecrets: {} },
      { identity: [] }, { identity: { encryptedPrivateKey: 42 } },
      { identity: { encryptedTransportPrivateKey: {} } },
      { legacyOwnerHostAdoptionPending: true, encryptedBoardApiToken: "fake-old-proof", companies: [{}] },
    ]) {
      const raw = JSON.stringify({ ...emptyState(), ...patch });
      await fs.writeFile(file, raw);
      await assert.rejects(loadState(root, { strictVersion: true }));
      assert.equal(await fs.readFile(file, "utf8"), raw);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("only genuine legacy loads receive a nonpersisted, one-use connection migration", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  const file = path.join(root, "sps-desktop-state.json");
  try {
    await fs.writeFile(file, JSON.stringify({ version: 4, profile: { hubUrl: "https://host.example.test" } }));
    const legacy = await loadState(root, { strictVersion: true });
    assert.equal(consumeLegacyDesktopConnectionMigration({ ...legacy }), false);
    assert.equal(consumeLegacyDesktopConnectionMigration(legacy), true);
    assert.equal(consumeLegacyDesktopConnectionMigration(legacy), false);
    await saveState(root, legacy);
    assert.equal(consumeLegacyDesktopConnectionMigration(await loadState(root, { strictVersion: true })), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("strict startup retains established current Owner and Member routing", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  const owner = { hubUrl: "http://127.0.0.1:31310", connectionKind: "owner-host", authMode: "sps-identity" };
  const member = { hubUrl: "https://host.example.test", connectionKind: "remote", authMode: "sps-identity" };
  try {
    for (const profile of [owner, member]) {
      const saved = { ...emptyState(), ownerHostOwnerSubject: "owner", profile,
        accountConnections: { owner, member } };
      await saveState(root, saved);
      const loaded = await loadState(root, { strictVersion: true });
      assert.equal(loaded.ownerHostOwnerSubject, "owner");
      assert.deepEqual(loaded.profile, profile);
      assert.equal(loaded.accountConnections.owner.connectionKind, "owner-host");
      assert.equal(loaded.accountConnections.member.connectionKind, "remote");
      assert.equal(consumeLegacyDesktopConnectionMigration(loaded), false);
    }
    await saveState(root, { ...emptyState(), profile: member, accountConnections: { member } });
    const memberOnly = await loadState(root, { strictVersion: true });
    assert.equal(memberOnly.ownerHostOwnerSubject, null);
    assert.equal(memberOnly.accountConnections.member.connectionKind, "remote");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("strict startup rejects unsupported or corrupt state without rewriting existing bytes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  const file = path.join(root, "sps-desktop-state.json");
  try {
    for (const raw of ['{"version":999,"profile":{"future":"keep"}}', "not-json"]) {
      await fs.writeFile(file, raw);
      await assert.rejects(loadState(root, { strictVersion: true }));
      assert.equal(await fs.readFile(file, "utf8"), raw);
    }
    await fs.rm(file);
    assert.deepEqual(await loadState(root, { strictVersion: true }), emptyState());
    await fs.writeFile(file, JSON.stringify({ version: 1, nodeId: "retained-node" }));
    assert.equal((await loadState(root, { strictVersion: true })).nodeId, "retained-node");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("adds private team access fields without discarding a v1 Desktop profile", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    await fs.writeFile(path.join(root, "sps-desktop-state.json"), JSON.stringify({
      version: 1,
      profile: { hubUrl: "https://app.example.test", displayName: "Friend PC" },
      nodeId: "node-1",
    }), "utf8");
    const state = await loadState(root);
    assert.equal(state.version, 12);
    assert.equal(state.profile.hubUrl, "https://app.example.test");
    assert.equal(state.nodeId, "node-1");
    assert.equal(state.teamAccess, null);
    assert.equal(state.encryptedTeamCredentials, null);
    assert.equal(state.encryptedDesktopAccount, null);
    assert.equal(state.encryptedHostProjectShareSecrets, null);
    assert.equal(state.desktopAccountLastAttempt, null);
    assert.equal(state.desktopDeviceId, null);
    assert.equal(state.encryptedDesktopGoogleClientSecret, undefined);
    assert.deepEqual(state.accountConnections, {});
    assert.equal(state.ownerHostOwnerSubject, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("loads a valid state file written with a Windows UTF-8 BOM", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    await fs.writeFile(path.join(root, "sps-desktop-state.json"), `\uFEFF${JSON.stringify({
      version: 11,
      profile: { hubUrl: "https://app.example.test", displayName: "Member PC" },
      nodeId: "node-bom",
    })}`, "utf8");

    const state = await loadState(root);
    assert.equal(state.profile.hubUrl, "https://app.example.test");
    assert.equal(state.nodeId, "node-bom");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("marks only an authenticated legacy Owner Vault for one-time SPS Identity adoption", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    await fs.mkdir(path.join(root, "owner-vault"), { recursive: true });
    await fs.writeFile(path.join(root, "owner-vault", "config.json"), JSON.stringify({ server: { port: 31310 } }), "utf8");
    await fs.writeFile(path.join(root, "sps-desktop-state.json"), JSON.stringify({
      version: 1,
      encryptedBoardApiToken: "legacy-local-session",
      companies: [{ id: "company-1", name: "Existing Studio" }],
    }), "utf8");

    const state = await loadState(root, { strictVersion: true });
    assert.equal(state.legacyOwnerHostAdoptionPending, true);
    assert.equal(hasPendingLegacyDesktopOwnerAdoption(state), true);
    assert.equal(hasPendingLegacyDesktopOwnerAdoption(JSON.parse(JSON.stringify(state))), false);
    state.ownerHostOwnerSubject = "established-owner";
    assert.equal(hasPendingLegacyDesktopOwnerAdoption(state), false);
    state.ownerHostOwnerSubject = null;
    assert.equal(state.ownerHostOwnerSubject, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("does not treat an orphaned legacy state file as an Owner Host", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    await fs.writeFile(path.join(root, "sps-desktop-state.json"), JSON.stringify({
      version: 1,
      encryptedBoardApiToken: "legacy-local-session",
      companies: [{ id: "company-1", name: "Existing Studio" }],
    }), "utf8");

    assert.equal((await loadState(root)).legacyOwnerHostAdoptionPending, false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("removes retired Google OAuth material while preserving opt-in team access", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    const state = {
      ...emptyState(),
      teamAccess: { enabled: true, hostname: "main.tailnet.ts.net" },
      encryptedTeamCredentials: "secure-storage-value",
    };
    await saveState(root, state);
    const raw = await fs.readFile(path.join(root, "sps-desktop-state.json"), "utf8");
    assert.match(raw, /secure-storage-value/);
    assert.doesNotMatch(raw, /GoogleClientSecret/);
    assert.deepEqual(await loadState(root), state);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("retires legacy per-machine Google OAuth credentials during migration", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    await fs.writeFile(path.join(root, "sps-desktop-state.json"), JSON.stringify({
      version: 7,
      desktopGoogleClientId: "legacy-client",
      encryptedDesktopGoogleClientSecret: "legacy-secret",
    }), "utf8");
    const state = await loadState(root);
    assert.equal(state.version, 12);
    assert.equal(state.desktopGoogleClientId, undefined);
    assert.equal(state.encryptedDesktopGoogleClientSecret, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("keeps only a bounded, valid Desktop account attempt diagnostic", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    await fs.writeFile(path.join(root, "sps-desktop-state.json"), JSON.stringify({
      version: 6,
      desktopAccountLastAttempt: {
        status: "failed",
        at: "2026-07-24T12:00:00.000Z",
        error: "x".repeat(500),
      },
    }), "utf8");
    const state = await loadState(root);
    assert.equal(state.desktopAccountLastAttempt.status, "failed");
    assert.equal(state.desktopAccountLastAttempt.error.length, 360);

    await fs.writeFile(path.join(root, "sps-desktop-state.json"), JSON.stringify({
      version: 6,
      desktopAccountLastAttempt: { status: "other", at: "not-a-date" },
    }), "utf8");
    assert.equal((await loadState(root)).desktopAccountLastAttempt, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

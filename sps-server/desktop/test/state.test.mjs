import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { consumeLegacyDesktopConnectionMigration, emptyState, hasPendingLegacyDesktopOwnerAdoption, loadState, saveState } from "../src/state.mjs";
import { allocateSpsNativeMemberKeyIndex } from "../src/native-member-key-index.mjs";

test("invalid new restore attempt metadata cannot replace a valid saved state", async t => {
  const root = await isolatedSaveDirectory(t);
  await saveState(root, emptyState());
  const before = await fs.readFile(path.join(root, "sps-desktop-state.json"));
  await assert.rejects(saveState(root, { ...emptyState(), ownerRestoreAttempts: [{ id: "../arbitrary" }] }), /restore records/);
  assert.deepEqual(await fs.readFile(path.join(root, "sps-desktop-state.json")), before);
});

async function isolatedSaveDirectory(t) {
  const created = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-save-"));
  const root = await fs.realpath(created);
  const identity = await fs.lstat(root, { bigint: true });
  const parent = await fs.realpath(os.tmpdir());
  t.after(async () => {
    assert.equal(path.dirname(await fs.realpath(root)), parent);
    assert.ok(path.basename(root).startsWith("sps-state-save-"));
    const current = await fs.lstat(root, { bigint: true });
    assert.equal(current.isDirectory() && !current.isSymbolicLink(), true);
    assert.equal(current.dev, identity.dev); assert.equal(current.ino, identity.ino);
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

test("concurrent local saves preserve complete snapshots and the latest account/Node state", async t => {
  const root = await isolatedSaveDirectory(t);
  const saves = [];
  for (let index = 0; index < 24; index++) {
    saves.push(saveState(root, { ...emptyState(), encryptedDesktopAccount: `encrypted-account-${index}`, nodeId: `node-${index}` }));
  }
  await Promise.all(saves);
  const saved = await loadState(root, { strictVersion: true });
  assert.equal(saved.encryptedDesktopAccount, "encrypted-account-23");
  assert.equal(saved.nodeId, "node-23");
  assert.deepEqual(saved.nativeMemberKeyIndex, { v: 1, entries: [] });
});

test("encrypted task results survive state saves and v13 reload without changing credentials", async t => {
  const root = await isolatedSaveDirectory(t);
  const original = {
    ...emptyState(),
    encryptedDesktopAccount: "existing-protected-account",
    identity: { publicKeyPem: "existing-public-key", encryptedPrivateKey: "existing-protected-key" },
    nodeId: "existing-node",
    encryptedNodeCompletionOutbox: "protected-task-results",
  };
  assert.equal(original.version, 13, "the additive encrypted slot must not break v13 rollback loads");
  await saveState(root, original);
  const loaded = await loadState(root, { strictVersion: true });
  assert.equal(loaded.encryptedNodeCompletionOutbox, "protected-task-results");
  assert.equal(loaded.encryptedDesktopAccount, original.encryptedDesktopAccount);
  assert.deepEqual(loaded.identity, original.identity);
  loaded.nodeStatus = "active";
  await saveState(root, loaded);
  assert.equal((await loadState(root, { strictVersion: true })).encryptedNodeCompletionOutbox, "protected-task-results");
});

test("encrypted claim journal survives state saves and reload without replacing account, Node, or task results", async t => {
  const root = await isolatedSaveDirectory(t);
  const original = {
    ...emptyState(),
    encryptedDesktopAccount: "existing-protected-account",
    identity: { publicKeyPem: "existing-public-key", encryptedPrivateKey: "existing-protected-key" },
    nodeId: "existing-node",
    encryptedNodeCompletionOutbox: "protected-task-results",
    encryptedNodeClaimJournal: "protected-claim-journal",
  };
  await saveState(root, original);
  const loaded = await loadState(root, { strictVersion: true });
  assert.equal(loaded.encryptedNodeClaimJournal, "protected-claim-journal");
  assert.equal(loaded.encryptedNodeCompletionOutbox, "protected-task-results");
  assert.equal(loaded.encryptedDesktopAccount, original.encryptedDesktopAccount);
  assert.equal(loaded.nodeId, original.nodeId);
  assert.deepEqual(loaded.identity, original.identity);
  await saveState(root, loaded);
  const reloaded = await loadState(root, { strictVersion: true });
  assert.equal(reloaded.encryptedNodeClaimJournal, "protected-claim-journal");
  assert.equal(reloaded.encryptedNodeCompletionOutbox, "protected-task-results");
  assert.equal(reloaded.encryptedDesktopAccount, original.encryptedDesktopAccount);
  assert.equal(reloaded.nodeId, original.nodeId);
});

test("malformed saved task result metadata cannot be silently replaced", async t => {
  const root = await isolatedSaveDirectory(t);
  const file = path.join(root, "sps-desktop-state.json");
  for (const value of [{ privateKeyPem: "invalid-object" }, ""]) {
    const bytes = JSON.stringify({ ...emptyState(), encryptedNodeCompletionOutbox: value });
    await fs.writeFile(file, bytes);
    await assert.rejects(loadState(root, { strictVersion: true }), /saved task result metadata is malformed/);
    await assert.rejects(saveState(root, emptyState()), /saved task result metadata is malformed/);
    assert.equal(await fs.readFile(file, "utf8"), bytes);
  }
});

test("malformed claim journal metadata cannot be silently replaced", async t => {
  const root = await isolatedSaveDirectory(t);
  const file = path.join(root, "sps-desktop-state.json");
  for (const value of [{ privateKeyPem: "invalid-object" }, "", "x".repeat(4 * 1024 * 1024 + 1)]) {
    const bytes = JSON.stringify({ ...emptyState(), encryptedNodeClaimJournal: value });
    await fs.writeFile(file, bytes);
    await assert.rejects(loadState(root, { strictVersion: true }), /saved task result metadata is malformed/);
    await assert.rejects(saveState(root, emptyState()), /saved task result metadata is malformed/);
    assert.equal(await fs.readFile(file, "utf8"), bytes);
  }
});

test("owner restore attempts persist through v13 save/load without changing account credentials or routing", async t => {
  const root = await isolatedSaveDirectory(t);
  const original = {
    ...emptyState(),
    ownerHostOwnerSubject: "owner-A",
    ownerRestoreAttempts: [
      { id: "11111111-1111-4111-8111-111111111111", ownerSubject: "owner-A", createdAt: "2026-10-30T12:00:00.000Z" },
      { id: "22222222-2222-4222-8222-222222222222", ownerSubject: "owner-B", createdAt: "2026-10-29T12:00:00.000Z" },
    ],
    encryptedDesktopAccount: "protected-account-bytes",
    identity: { publicKeyPem: "node-public-key", encryptedPrivateKey: "protected-node-key" },
    accountConnections: {
      "owner-A": { hubUrl: "https://host-a.example.test", connectionKind: "remote", authMode: "sps-identity",
        companyId: "", displayName: "Host A", defaultWorkspacePath: "", projectWorkspaces: {}, workspaceSources: [] },
      "owner-B": { hubUrl: "https://host-b.example.test", connectionKind: "remote", authMode: "sps-identity",
        companyId: "", displayName: "Host B", defaultWorkspacePath: "", projectWorkspaces: {}, workspaceSources: [] },
    },
    profile: { hubUrl: "https://host-a.example.test", connectionKind: "remote", authMode: "sps-identity" },
  };
  assert.equal(original.version, 13);
  await saveState(root, original);

  const loaded = await loadState(root, { strictVersion: true });
  assert.equal(loaded.version, 13);
  assert.deepEqual(loaded.ownerRestoreAttempts, original.ownerRestoreAttempts);
  assert.equal(loaded.encryptedDesktopAccount, original.encryptedDesktopAccount);
  assert.deepEqual(loaded.identity, original.identity);
  assert.deepEqual(loaded.accountConnections, original.accountConnections);
  assert.deepEqual(loaded.profile, original.profile);

  await saveState(root, loaded);
  const reloaded = await loadState(root, { strictVersion: true });
  assert.deepEqual(reloaded.ownerRestoreAttempts, original.ownerRestoreAttempts);
  assert.equal(reloaded.encryptedDesktopAccount, original.encryptedDesktopAccount);
  assert.deepEqual(reloaded.identity, original.identity);
  assert.deepEqual(reloaded.accountConnections, original.accountConnections);
  assert.deepEqual(reloaded.profile, original.profile);
});

test("malformed owner restore attempts fail strict and inspection loads and cannot be replaced", async t => {
  const root = await isolatedSaveDirectory(t);
  const file = path.join(root, "sps-desktop-state.json");
  const valid = { id: "33333333-3333-4333-8333-333333333333", ownerSubject: "owner-A", createdAt: "2026-10-30T12:00:00.000Z" };
  const malformed = [
    [{ ...valid, id: "../outside" }],
    [{ ...valid, stagingPath: "C:\\outside" }],
    [valid, { ...valid }],
    Array.from({ length: 129 }, (_, index) => ({
      ...valid,
      id: `${String(index + 1).padStart(8, "0")}-4444-4444-8444-444444444444`,
    })),
  ];

  for (const attempts of malformed) {
    const bytes = JSON.stringify({
      ...emptyState(),
      encryptedDesktopAccount: "must-remain-byte-identical",
      ownerRestoreAttempts: attempts,
    });
    await fs.writeFile(file, bytes, "utf8");
    await assert.rejects(loadState(root, { strictVersion: true }), /SPS preserved restore records/);
    await assert.rejects(loadState(root), /SPS preserved restore records/);
    await assert.rejects(saveState(root, emptyState()), /SPS preserved restore records/);
    assert.equal(await fs.readFile(file, "utf8"), bytes);
  }
});

test("a stale Native commit guard preserves existing state and does not poison later saves", async t => {
  const root = await isolatedSaveDirectory(t);
  const original = { ...emptyState(), encryptedDesktopAccount: "existing-encrypted-account" };
  await saveState(root, original);
  const file = path.join(root, "sps-desktop-state.json");
  const bytes = await fs.readFile(file, "utf8");
  let checks = 0;
  await assert.rejects(saveState(root, { ...original, encryptedDesktopAccount: "stale-account" }, {
    beforeCommit() { checks++; if (checks === 3) throw new Error("account changed before rename"); },
  }), /account changed/);
  assert.equal(await fs.readFile(file, "utf8"), bytes);
  await assert.rejects(saveState(root, original, { beforeCommit: async () => {} }), /synchronous/);
  assert.equal(await fs.readFile(file, "utf8"), bytes);
  await saveState(root, { ...original, nodeId: "new-node" });
  assert.equal((await loadState(root, { strictVersion: true })).nodeId, "new-node");
});

test("rechecks Native authority immediately before replacing validated state", async t => {
  const root = await isolatedSaveDirectory(t);
  const original = { ...emptyState(), encryptedDesktopAccount: "current-account" };
  const file = path.join(root, "sps-desktop-state.json");
  await saveState(root, original);
  const bytes = await fs.readFile(file, "utf8");
  let checks = 0;
  await assert.rejects(saveState(root, { ...original, encryptedDesktopAccount: "stale-account" }, {
    beforeCommit() {
      checks++;
      if (checks === 4) throw new Error("account changed after state validation");
    },
  }), /account changed after state validation/);
  assert.equal(checks, 4);
  assert.equal(await fs.readFile(file, "utf8"), bytes);
  await assert.rejects(fs.access(`${file}.tmp`), { code: "ENOENT" });
});

test("state writes reject hard-linked destinations without changing shared bytes", async t => {
  const root = await isolatedSaveDirectory(t);
  const file = path.join(root, "sps-desktop-state.json");
  const anchor = path.join(root, "preserved-state-bytes");
  const original = "corrupt-critical-state-must-remain-verbatim";
  await fs.writeFile(anchor, original);
  await fs.link(anchor, file);

  await assert.rejects(saveState(root, emptyState()), /linked or non-file state file/);
  assert.equal(await fs.readFile(anchor, "utf8"), original);
  assert.equal(await fs.readFile(file, "utf8"), original);
  assert.equal((await fs.lstat(file)).nlink, 2);
});

test("state writes preserve corrupt or unsupported existing critical state", async t => {
  const root = await isolatedSaveDirectory(t);
  const file = path.join(root, "sps-desktop-state.json");
  for (const original of ["not-json-critical-state", JSON.stringify({ version: 999, ownerHostOwnerSubject: "future-owner" })]) {
    await fs.writeFile(file, original);
    await assert.rejects(saveState(root, emptyState()));
    assert.equal(await fs.readFile(file, "utf8"), original);
  }
});

test("state writes reject hard-linked temporary slots without changing their target", async t => {
  const root = await isolatedSaveDirectory(t);
  const temporary = path.join(root, "sps-desktop-state.json.tmp");
  const anchor = path.join(root, "preserved-temporary-bytes");
  const original = "non-owned-temporary-target";
  await fs.writeFile(anchor, original);
  await fs.link(anchor, temporary);

  await assert.rejects(saveState(root, emptyState()), /linked or non-file temporary slot/);
  assert.equal(await fs.readFile(anchor, "utf8"), original);
  assert.equal(await fs.readFile(temporary, "utf8"), original);
  assert.equal((await fs.lstat(temporary)).nlink, 2);
  await assert.rejects(fs.access(path.join(root, "sps-desktop-state.json")), { code: "ENOENT" });
});

test("state writes reject a file-symlink temporary slot when the host supports it", async t => {
  const root = await isolatedSaveDirectory(t);
  const temporary = path.join(root, "sps-desktop-state.json.tmp");
  const target = path.join(root, "preserved-symlink-target");
  const original = "non-owned-symlink-target";
  await fs.writeFile(target, original);
  try {
    await fs.symlink(target, temporary, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`File symlink creation is unavailable on this host (${error.code}).`);
      return;
    }
    throw error;
  }

  await assert.rejects(saveState(root, emptyState()), /linked or non-file temporary slot/);
  assert.equal(await fs.readFile(target, "utf8"), original);
  assert.equal(await fs.readlink(temporary), target);
  await assert.rejects(fs.access(path.join(root, "sps-desktop-state.json")), { code: "ENOENT" });
});

test("state writes reject a file-symlink destination when the host supports it", async t => {
  const root = await isolatedSaveDirectory(t);
  const destination = path.join(root, "sps-desktop-state.json");
  const target = path.join(root, "preserved-destination-target");
  const original = "non-owned-destination-target";
  await fs.writeFile(target, original);
  try {
    await fs.symlink(target, destination, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`File symlink creation is unavailable on this host (${error.code}).`);
      return;
    }
    throw error;
  }

  await assert.rejects(saveState(root, emptyState()), /linked or non-file state file/);
  assert.equal(await fs.readFile(target, "utf8"), original);
  assert.equal(await fs.readlink(destination), target);
});

test("state writes reject a linked user data directory", async t => {
  const root = await isolatedSaveDirectory(t);
  const target = path.join(root, "real-user-data");
  const linked = path.join(root, "linked-user-data");
  await fs.mkdir(target);
  try {
    await fs.symlink(target, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip(`Directory link creation is unavailable on this host (${error.code}).`);
      return;
    }
    throw error;
  }
  await assert.rejects(saveState(linked, emptyState()), /linked or non-directory user data folder/);
  await assert.rejects(fs.access(path.join(target, "sps-desktop-state.json")), { code: "ENOENT" });
});

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
    assert.equal(state.version, 13);
    assert.deepEqual(state.nativeMemberKeyIndex, { v: 1, entries: [] });
    assert.deepEqual(state.nativeNodes, { v: 1, entries: [] });
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

test("rejects corrupt Native Node metadata without rewriting the persisted state", async t => {
  const root = await isolatedSaveDirectory(t);
  const file = path.join(root, "sps-desktop-state.json");
  const raw = JSON.stringify({ ...emptyState(), nativeNodes: { v: 1, entries: [], secret: "unexpected" } });
  await fs.writeFile(file, raw);
  await assert.rejects(loadState(root, { strictVersion: true }));
  await assert.rejects(loadState(root));
  assert.equal(await fs.readFile(file, "utf8"), raw);
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
    assert.equal(state.version, 13);
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
    assert.equal(state.version, 13);
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

import assert from "node:assert/strict";
import { link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { rewriteAsLegacyV11State } from "../scripts/legacy-desktop-state-acceptance.mjs";

const HISTORICAL_KEYS = [
  "version", "encryptedDesktopAccount", "desktopAccountLastAttempt", "desktopJoinLastAttempt",
  "desktopDeviceId", "accountConnections", "ownerHostOwnerSubject", "legacyOwnerHostAdoptionPending",
  "profile", "identity", "encryptedBoardApiToken", "companies", "projects", "nodeId", "nodeStatus",
  "transportKeyPublishedAt", "teamAccess", "encryptedTeamCredentials", "encryptedHostProjectShareSecrets",
];

function currentState() {
  return Object.fromEntries(HISTORICAL_KEYS.map(key => [key, key === "version" ? 13 : null]));
}

async function fixtureFor(t, withState = true) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "legacy-desktop-state-"));
  const profile = path.join(directory, "profile");
  await mkdir(profile);
  if (withState) await writeFile(path.join(profile, "sps-desktop-state.json"), JSON.stringify(currentState()));
  let assertions = 0;
  const fixture = { directory, async assertCurrent() { assertions += 1; } };
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, profile, fixture, assertionCount: () => assertions };
}

test("rewrites an owned direct-child profile using the strict v13 to v11 projection", async t => {
  const f = await fixtureFor(t);
  const current = currentState();
  current.encryptedDesktopAccount = "account-ciphertext";
  current.desktopDeviceId = "device-1";
  await writeFile(path.join(f.profile, "sps-desktop-state.json"), JSON.stringify(current));

  const legacy = await rewriteAsLegacyV11State(f.profile, f.fixture, { generatedIdentity: null });
  assert.equal(legacy.version, 11);
  assert.equal(legacy.encryptedDesktopAccount, "account-ciphertext");
  assert.equal(legacy.desktopDeviceId, "device-1");
  assert.deepEqual(JSON.parse(await readFile(path.join(f.profile, "sps-desktop-state.json"), "utf8")), legacy);
  assert.equal(f.assertionCount(), 2);
});

test("requires an absolute direct-child profile and checks fixture ownership", async t => {
  const f = await fixtureFor(t, false);
  const sibling = await mkdtemp(path.join(os.tmpdir(), "legacy-outside-profile-"));
  t.after(() => rm(sibling, { recursive: true, force: true }));
  await assert.rejects(rewriteAsLegacyV11State("relative", f.fixture, {}), /absolute paths/);
  await assert.rejects(rewriteAsLegacyV11State(sibling, f.fixture, {}), /direct child/);
  await assert.rejects(rewriteAsLegacyV11State(path.join(f.profile, "nested"), f.fixture, {}), /direct child/);

  const stale = { ...f.fixture, async assertCurrent() { throw new Error("stale fixture"); } };
  await assert.rejects(rewriteAsLegacyV11State(f.profile, stale, {}), /stale fixture/);
});

test("rejects a linked profile and refuses to overwrite a present Node identity", async t => {
  const f = await fixtureFor(t);
  const linked = path.join(f.directory, "linked-profile");
  try {
    await symlink(f.profile, linked, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip("This filesystem or process does not support creating directory links.");
      return;
    }
    throw error;
  }
  await assert.rejects(rewriteAsLegacyV11State(linked, f.fixture, {}), /plain, non-link directory/);

  const current = currentState();
  current.identity = { publicKeyPem: "persisted", encryptedPrivateKey: "persisted-ciphertext" };
  await writeFile(path.join(f.profile, "sps-desktop-state.json"), JSON.stringify(current));
  await assert.rejects(rewriteAsLegacyV11State(f.profile, f.fixture, {
    generatedIdentity: { publicKeyPem: "replacement", encryptedPrivateKey: "replacement-ciphertext" },
  }), /only fill a truly missing identity/);
});

test("preserves strict projection rejection for non-empty current-only fields", async t => {
  const f = await fixtureFor(t);
  const current = currentState();
  current.nativeNodes = { v: 1, entries: [{ nodeId: "must-not-discard" }] };
  await writeFile(path.join(f.profile, "sps-desktop-state.json"), JSON.stringify(current));
  await assert.rejects(rewriteAsLegacyV11State(f.profile, f.fixture, {}), /Cannot discard non-empty current Desktop state field: nativeNodes/);
});

test("refuses a hard-linked state file without changing its other name", async t => {
  const f = await fixtureFor(t, false);
  const target = path.join(f.directory, "outside-state.json");
  const before = JSON.stringify(currentState());
  await writeFile(target, before);
  await link(target, path.join(f.profile, "sps-desktop-state.json"));
  await assert.rejects(rewriteAsLegacyV11State(f.profile, f.fixture, {}), /unlinked regular fixture file/);
  assert.equal(await readFile(target, "utf8"), before);
});

test("refuses a changed state file at the final fixture check", async t => {
  const f = await fixtureFor(t);
  let checks = 0;
  f.fixture.assertCurrent = async () => {
    if (++checks !== 2) return;
    const statePath = path.join(f.profile, "sps-desktop-state.json");
    await rm(statePath);
    await writeFile(statePath, "changed fixture sentinel");
  };
  await assert.rejects(rewriteAsLegacyV11State(f.profile, f.fixture, {}), /changed before projection/);
  assert.equal(await readFile(path.join(f.profile, "sps-desktop-state.json"), "utf8"), "changed fixture sentinel");
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { emptyState, loadState, saveState } from "../src/state.mjs";

test("adds private team access fields without discarding a v1 Desktop profile", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    await fs.writeFile(path.join(root, "sps-desktop-state.json"), JSON.stringify({
      version: 1,
      profile: { hubUrl: "https://app.example.test", displayName: "Friend PC" },
      nodeId: "node-1",
    }), "utf8");
    const state = await loadState(root);
    assert.equal(state.version, 5);
    assert.equal(state.profile.hubUrl, "https://app.example.test");
    assert.equal(state.nodeId, "node-1");
    assert.equal(state.teamAccess, null);
    assert.equal(state.encryptedTeamCredentials, null);
    assert.equal(state.encryptedDesktopAccount, null);
    assert.equal(state.encryptedDesktopGoogleClientSecret, null);
    assert.deepEqual(state.accountConnections, {});
    assert.equal(state.ownerHostOwnerSubject, null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("persists an opt-in team access record without plaintext credentials", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sps-state-"));
  try {
    const state = {
      ...emptyState(),
      teamAccess: { enabled: true, hostname: "main.tailnet.ts.net" },
      encryptedTeamCredentials: "secure-storage-value",
      encryptedDesktopGoogleClientSecret: "encrypted-desktop-oauth-secret",
    };
    await saveState(root, state);
    const raw = await fs.readFile(path.join(root, "sps-desktop-state.json"), "utf8");
    assert.match(raw, /secure-storage-value/);
    assert.doesNotMatch(raw, /googleClientSecret/);
    assert.deepEqual(await loadState(root), state);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

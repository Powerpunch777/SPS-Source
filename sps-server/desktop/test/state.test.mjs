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
    assert.equal(state.version, 9);
    assert.equal(state.profile.hubUrl, "https://app.example.test");
    assert.equal(state.nodeId, "node-1");
    assert.equal(state.teamAccess, null);
    assert.equal(state.encryptedTeamCredentials, null);
    assert.equal(state.encryptedDesktopAccount, null);
    assert.equal(state.desktopAccountLastAttempt, null);
    assert.equal(state.desktopDeviceId, null);
    assert.equal(state.encryptedDesktopGoogleClientSecret, undefined);
    assert.deepEqual(state.accountConnections, {});
    assert.equal(state.ownerHostOwnerSubject, null);
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

    const state = await loadState(root);
    assert.equal(state.legacyOwnerHostAdoptionPending, true);
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
    assert.equal(state.version, 9);
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

import test from "node:test";
import assert from "node:assert/strict";
import { createSpsDesktopSetupReadiness } from "../renderer/setup-readiness.mjs";

const profile = {
  hubUrl: "https://hub.example.test",
  displayName: "Friend PC",
  companyId: "company-1",
};

test("shows the secure Desktop onboarding order before a profile exists", () => {
  const readiness = createSpsDesktopSetupReadiness({ profile: null, signedIn: false });

  assert.equal(readiness.steps[0].state, "current");
  assert.equal(readiness.steps[1].state, "blocked");
  assert.equal(readiness.canOpenInvite, false);
  assert.equal(readiness.canStartAuth, false);
  assert.equal(readiness.canConnectNode, false);
});

test("allows Node registration only after SPS sign-in and company selection", () => {
  const readiness = createSpsDesktopSetupReadiness({ profile, signedIn: true, pendingAuth: null, nodeId: null, nodeStatus: null });

  assert.equal(readiness.canConnectNode, true);
  assert.equal(readiness.steps[3].state, "current");
  assert.equal(readiness.ready, false);
});

test("keeps command readiness distinct from a registered but unapproved computer", () => {
  const pending = createSpsDesktopSetupReadiness({ profile, signedIn: true, nodeId: "node-1", nodeStatus: "pending" });
  const active = createSpsDesktopSetupReadiness({ profile, signedIn: true, nodeId: "node-1", nodeStatus: "active" });

  assert.equal(pending.steps[3].state, "current");
  assert.equal(pending.ready, false);
  assert.equal(active.steps[3].state, "complete");
  assert.equal(active.ready, true);
});

test("requires protected Desktop sign-in before the shared workspace opens", () => {
  const unsigned = createSpsDesktopSetupReadiness({
    profile: { hubUrl: "https://app.redongames.com", displayName: "Member PC", companyId: "" },
    signedIn: false,
  });

  assert.equal(unsigned.ready, false);
  assert.equal(unsigned.canOpenWorkspace, false);
  assert.equal(unsigned.canStartAuth, true);
  assert.equal(unsigned.canConnectNode, false);
});

test("opens the local workspace as soon as the internal Owner Host is healthy", () => {
  const readiness = createSpsDesktopSetupReadiness({
    profile: { hubUrl: "http://127.0.0.1:31310", displayName: "Owner Host", connectionKind: "owner-host" },
    ownerHost: { state: "running", url: "http://127.0.0.1:31310" },
    signedIn: false,
  });

  assert.equal(readiness.ready, true);
  assert.equal(readiness.canOpenWorkspace, true);
  assert.equal(readiness.canStartAuth, false);
  assert.equal(readiness.canConnectNode, false);
});

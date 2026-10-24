import test from "node:test";
import assert from "node:assert/strict";
import { shouldEnsureJoinedDesktopNode } from "../src/member-node-registration.mjs";

test("registers a newly joined member computer as a pending Node", () => {
  assert.equal(shouldEnsureJoinedDesktopNode({
    profile: { connectionKind: "remote", companyId: "company-1" },
    signedIn: true,
    nodeId: null,
    nodeStatus: null,
  }), true);
});

test("does not re-register an active or pending member Node", () => {
  const profile = { connectionKind: "remote", companyId: "company-1" };
  assert.equal(shouldEnsureJoinedDesktopNode({ profile, signedIn: true, nodeId: "node-1", nodeStatus: "pending" }), false);
  assert.equal(shouldEnsureJoinedDesktopNode({ profile, signedIn: true, nodeId: "node-1", nodeStatus: "active" }), false);
});

test("refreshes a legacy Member identity once so it can receive a Host project source", () => {
  const profile = { connectionKind: "remote", companyId: "company-1" };
  assert.equal(shouldEnsureJoinedDesktopNode({
    profile,
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "active",
    hasTransportIdentity: false,
  }), true);
});

test("retries transport-key publication after a local key was created before Core registration", () => {
  const profile = { connectionKind: "remote", companyId: "company-1" };
  assert.equal(shouldEnsureJoinedDesktopNode({
    profile,
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "active",
    hasTransportIdentity: true,
    hasPublishedTransportKey: false,
  }), true);
});

test("re-registers after an Owner revokes a member Node", () => {
  assert.equal(shouldEnsureJoinedDesktopNode({
    profile: { connectionKind: "remote", companyId: "company-1" },
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "revoked",
  }), true);
});

test("never auto-registers an unsigned or Owner Host computer", () => {
  assert.equal(shouldEnsureJoinedDesktopNode({
    profile: { connectionKind: "remote", companyId: "company-1" },
    signedIn: false,
    nodeId: null,
    nodeStatus: null,
  }), false);
  assert.equal(shouldEnsureJoinedDesktopNode({
    profile: { connectionKind: "owner-host", companyId: "company-1" },
    signedIn: true,
    nodeId: null,
    nodeStatus: null,
  }), false);
});

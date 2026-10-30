import test from "node:test";
import assert from "node:assert/strict";
import {
  canRunSpsNodeCommands,
  normalizeSpsNodeStatus,
  shouldRefreshJoinedDesktopNode,
  spsNodeStatusLabel,
} from "../src/node-activation.mjs";

test("runs commands only after an SPS Node is active", () => {
  assert.equal(canRunSpsNodeCommands("pending"), false);
  assert.equal(canRunSpsNodeCommands("revoked"), false);
  assert.equal(canRunSpsNodeCommands("active"), true);
  assert.equal(canRunSpsNodeCommands("unknown"), false);
});

test("normalizes Hub status and presents a useful approval state", () => {
  assert.equal(normalizeSpsNodeStatus("pending"), "pending");
  assert.equal(normalizeSpsNodeStatus("anything else"), null);
  assert.equal(spsNodeStatusLabel("pending"), "waiting for Owner approval");
  assert.equal(spsNodeStatusLabel("active"), "approved");
  assert.equal(spsNodeStatusLabel(null), "checking approval");
});

test("refreshes an existing Member Node without changing its identity", () => {
  const profile = { connectionKind: "remote", companyId: "company-1" };
  assert.equal(shouldRefreshJoinedDesktopNode({
    profile,
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "active",
  }), true);
  assert.equal(shouldRefreshJoinedDesktopNode({
    profile,
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "pending",
  }), true);
});

test("does not revive an Owner Host or a removed/revoked Member Node", () => {
  assert.equal(shouldRefreshJoinedDesktopNode({
    profile: { connectionKind: "owner-host", companyId: "company-1" },
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "active",
  }), false);
  assert.equal(shouldRefreshJoinedDesktopNode({
    profile: { connectionKind: "remote", companyId: "company-1" },
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "revoked",
  }), false);
  assert.equal(shouldRefreshJoinedDesktopNode({
    profile: { connectionKind: "remote", companyId: "company-1" },
    signedIn: true,
    nodeId: "node-1",
    nodeStatus: "removed",
  }), false);
});

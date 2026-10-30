import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyHostProjectSourceMembers,
  unavailableHostProjectSourceMemberDialog,
} from "../src/host-project-source-members.mjs";

test("only offers an active Member with a verified project-source transport key", () => {
  const members = classifyHostProjectSourceMembers([
    { id: "owner", status: "active", keyVerifiedAt: "2026-07-27", transportPublicKey: "owner-key" },
    { id: "ready", status: "active", keyVerifiedAt: "2026-07-27", transportPublicKey: "member-key" },
    { id: "paused", status: "paused", keyVerifiedAt: "2026-07-27", transportPublicKey: "paused-key" },
  ], { ownerNodeId: "owner" });

  assert.deepEqual(members.ready.map((node) => node.id), ["ready"]);
  assert.deepEqual(members.legacy, []);
});

test("identifies an approved legacy Member whose Desktop must refresh its secure key", () => {
  const members = classifyHostProjectSourceMembers([
    { id: "legacy", displayName: "PowerpunchLaptop", status: "active", keyVerifiedAt: "2026-07-27", transportPublicKey: null },
  ]);
  const dialog = unavailableHostProjectSourceMemberDialog(members);

  assert.deepEqual(members.ready, []);
  assert.deepEqual(members.legacy.map((node) => node.id), ["legacy"]);
  assert.equal(dialog.message, "No Member Node has a current project-source key yet.");
  assert.match(dialog.detail, /PowerpunchLaptop/);
  assert.match(dialog.detail, /latest SPS Desktop/);
});

test("does not present a stale Owner Host record as a Member choice", () => {
  const members = classifyHostProjectSourceMembers([
    { id: "old-owner", displayName: "Main Computer Owner Host", status: "active", keyVerifiedAt: "2026-07-27", transportPublicKey: null },
    { id: "member", displayName: "Laptop", status: "active", keyVerifiedAt: "2026-07-27", transportPublicKey: null },
  ], { ownerDisplayName: "main computer owner host" });

  assert.deepEqual(members.ready, []);
  assert.deepEqual(members.legacy.map((node) => node.id), ["member"]);
});

test("keeps the join and approval guidance when no legacy Member exists", () => {
  const dialog = unavailableHostProjectSourceMemberDialog({ ready: [], legacy: [] });
  assert.equal(dialog.message, "No active Member SPS Node can receive this project's source folder yet.");
  assert.match(dialog.detail, /join the server/);
});

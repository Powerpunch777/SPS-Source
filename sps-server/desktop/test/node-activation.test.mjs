import test from "node:test";
import assert from "node:assert/strict";
import {
  canRunSpsNodeCommands,
  normalizeSpsNodeStatus,
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

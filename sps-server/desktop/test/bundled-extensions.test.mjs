import test from "node:test";
import assert from "node:assert/strict";
import {
  disabledSpsExtensionStatus,
  isSpsDefaultMemoryEnabled,
  isSpsRoomWorkplaneBundled,
} from "../src/bundled-extensions.mjs";

test("starts Default Memory but does not choose a Team Workplane by default", () => {
  assert.equal(isSpsDefaultMemoryEnabled({}), true);
  assert.equal(isSpsRoomWorkplaneBundled({}), false);
});

test("accepts explicit provider, Workplane, and legacy bundle modes", () => {
  assert.equal(isSpsDefaultMemoryEnabled({ SPS_ENABLE_DEFAULT_MEMORY: "false" }), false);
  assert.equal(isSpsRoomWorkplaneBundled({ SPS_ENABLE_ROOM_WORKPLANE: "true" }), true);
  assert.equal(isSpsDefaultMemoryEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "false" }), false);
  assert.equal(isSpsRoomWorkplaneBundled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "false" }), false);
  assert.equal(isSpsRoomWorkplaneBundled({ SPS_ENABLE_BUNDLED_EXTENSIONS: " TRUE " }), true);
});

test("reports disabled extensions without a fake runtime endpoint", () => {
  assert.deepEqual(disabledSpsExtensionStatus(), {
    state: "disabled",
    url: null,
    startedAt: null,
    lastError: null,
    vaultPath: null,
  });
});

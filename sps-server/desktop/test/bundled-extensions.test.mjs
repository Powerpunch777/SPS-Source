import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  disabledSpsExtensionStatus,
  isSpsDefaultMemoryEnabled,
  isSpsPluginDiscoveryEnabled,
  isSpsRoomWorkplaneBundled,
} from "../src/bundled-extensions.mjs";

test("starts Core without requiring Builder, Memory or a Team Workplane", () => {
  assert.equal(isSpsPluginDiscoveryEnabled({}), false);
  assert.equal(isSpsDefaultMemoryEnabled({}), false);
  assert.equal(isSpsRoomWorkplaneBundled({}), false);
});

test("accepts explicit provider, Workplane, and legacy bundle modes", () => {
  assert.equal(isSpsDefaultMemoryEnabled({ SPS_ENABLE_DEFAULT_MEMORY: "true" }), true);
  assert.equal(isSpsDefaultMemoryEnabled({ SPS_ENABLE_DEFAULT_MEMORY: "false" }), false);
  assert.equal(isSpsRoomWorkplaneBundled({ SPS_ENABLE_ROOM_WORKPLANE: "true" }), true);
  assert.equal(isSpsDefaultMemoryEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "false" }), false);
  assert.equal(isSpsPluginDiscoveryEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "false" }), false);
  assert.equal(isSpsPluginDiscoveryEnabled({ SPS_ENABLE_PLUGIN_DISCOVERY: "false" }), false);
  assert.equal(isSpsPluginDiscoveryEnabled({ SPS_ENABLE_PLUGIN_DISCOVERY: "true" }), true);
  assert.equal(isSpsPluginDiscoveryEnabled({ SPS_ENABLE_BUNDLED_EXTENSIONS: "false", SPS_ENABLE_PLUGIN_DISCOVERY: "true" }), false);
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

test("official bundles declare non-executable identities for restore-time review checks", async () => {
  for (const [directory, id] of [["sps-default-memory", "sps.default-memory"],
    ["sps-plugin-discovery", "sps.plugin-discovery"], ["sps-room-chat", "local.room-chat"]]) {
    const metadata = JSON.parse(await readFile(new URL(`../../${directory}/package.json`, import.meta.url), "utf8"));
    assert.equal(metadata.spsPlugin.id, id);
    assert.equal(metadata.spsPlugin.manifest, "./dist/manifest.js");
  }
});

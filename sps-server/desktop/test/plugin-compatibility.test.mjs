import assert from "node:assert/strict";
import test from "node:test";
import { assessSpsPluginCompatibility, satisfiesSpsVersion } from "../src/plugin-compatibility.mjs";

test("accepts an explicit SPS release range for the current Desktop", () => {
  assert.equal(satisfiesSpsVersion("0.4.79", ">=0.4.0 <0.5.0"), true);
  assert.deepEqual(assessSpsPluginCompatibility({
    sps: ">=0.4.0 <0.5.0",
    pluginApi: 1,
    extensionProfile: "1.0",
  }, { desktopVersion: "0.4.79" }), { compatible: true, reason: null });
});

test("blocks incompatible API, profile, Desktop, and unsupported ranges before staging", () => {
  assert.equal(assessSpsPluginCompatibility({
    sps: ">=0.4.0 <0.5.0",
    pluginApi: 2,
    extensionProfile: "1.0",
  }, { desktopVersion: "0.4.79" }).compatible, false);
  assert.equal(assessSpsPluginCompatibility({
    sps: ">=0.4.0 <0.5.0",
    pluginApi: 1,
    extensionProfile: "2.0",
  }, { desktopVersion: "0.4.79" }).compatible, false);
  assert.equal(assessSpsPluginCompatibility({
    sps: ">=0.5.0 <0.6.0",
    pluginApi: 1,
    extensionProfile: "1.0",
  }, { desktopVersion: "0.4.79" }).compatible, false);
  assert.equal(assessSpsPluginCompatibility({
    sps: "^0.4.0",
    pluginApi: 1,
    extensionProfile: "1.0",
  }, { desktopVersion: "0.4.79" }).compatible, false);
});

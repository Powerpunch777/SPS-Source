import assert from "node:assert/strict";
import manifest from "../src/manifest.js";
import { SPS_TEAM_WORKPLANE_PROFILE } from "../src/team-workplane-profile.js";

assert.equal(SPS_TEAM_WORKPLANE_PROFILE.productId, "sps.team-workplane");
assert.equal(SPS_TEAM_WORKPLANE_PROFILE.legacyPluginId, "local.room-chat");
assert.equal(SPS_TEAM_WORKPLANE_PROFILE.contractVersion, "1.0");
assert.equal(SPS_TEAM_WORKPLANE_PROFILE.kind, "workplane");
assert.equal(SPS_TEAM_WORKPLANE_PROFILE.profileKey, "sps-lead-worker");
assert.equal(manifest.id, "local.room-chat");
assert.equal(manifest.displayName, "SPS Team Workplane");
assert.equal(manifest.agentPlatform?.profileKey, "sps-lead-worker");
assert.equal(manifest.agentPlatform?.contractVersion, "1.0");
assert.equal(SPS_TEAM_WORKPLANE_PROFILE.compatibility.preservesExistingRooms, true);
assert.equal(SPS_TEAM_WORKPLANE_PROFILE.compatibility.preservesExistingTasks, true);
assert.equal(SPS_TEAM_WORKPLANE_PROFILE.compatibility.preservesExistingOriginKinds, true);

console.log("PASS SPS Team Workplane product identity and legacy compatibility");

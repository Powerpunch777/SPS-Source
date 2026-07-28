import assert from "node:assert/strict";
import test from "node:test";
import { draftSpsExtension, searchSpsDiscoveryCatalog } from "../dist/catalog-tools.js";

const catalog = {
  schemaVersion: 1,
  source: { id: "io.sps.official", displayName: "SPS Official Registry" },
  refreshedAt: "2026-07-28T00:00:00.000Z",
  releases: [
    {
      pluginId: "io.sps.web-publisher",
      version: "1.2.0",
      isLatest: true,
      visibility: "public",
      catalog: { displayName: "Web Publisher", summary: "Publish a static website." },
      capabilities: ["agent.tools.register", "http.outbound"],
      publisherId: "sps",
    },
    {
      pluginId: "io.sps.game-workplane",
      version: "1.0.0",
      isLatest: true,
      visibility: "public",
      catalog: { displayName: "Game Workplane", summary: "Coordinate game production." },
      capabilities: ["issues.create"],
      publisherId: "sps",
    },
  ],
};

test("searches verified catalog metadata without returning lifecycle authority", () => {
  const result = searchSpsDiscoveryCatalog(catalog, { query: "static publish" });
  assert.deepEqual(result.recommendations.map((entry) => entry.pluginId), ["io.sps.web-publisher"]);
  assert.equal("artifact" in result.recommendations[0], false);
  assert.equal(result.source.id, "io.sps.official");
});

test("drafts only the requested extension surfaces", () => {
  const draft = draftSpsExtension({
    goal: "Let an agent check local build output.",
    displayName: "Build Inspector",
    features: ["tools", "local_folder"],
  });
  assert.equal(draft.draftOnly, true);
  assert.equal(draft.plugin.agentPlatform.kind, "tool_provider");
  assert.deepEqual(draft.plugin.capabilities, ["agent.tools.register", "local.folders"]);
  assert.ok(draft.validationPlan.every((step) => !/install|enable|activate/i.test(step)));
});

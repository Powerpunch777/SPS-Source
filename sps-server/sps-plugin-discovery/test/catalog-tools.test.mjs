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
  assert.deepEqual(draft.plugin.features, ["tools", "workspace_source"]);
  assert.deepEqual(draft.plugin.capabilities, ["agent.tools.register", "sps.workspaceSources.read"]);
  assert.deepEqual(draft.plugin.sps, {
    contractVersion: "2.0",
    primitives: ["workspace.sources.metadata", "workspace.sources.route"],
  });
  assert.ok(draft.validationPlan.every((step) => !/install|enable|activate/i.test(step)));
});

test("maps neutral execution features to matching Profile 2.0 capabilities", () => {
  const draft = draftSpsExtension({
    goal: "Run an approved CLI and publish its result.",
    features: ["runtime_execution", "artifacts", "secrets"],
  });

  assert.deepEqual(draft.plugin.capabilities, [
    "sps.runtimes.read",
    "sps.runs.dispatch",
    "sps.runs.read",
    "sps.artifacts.write",
    "secrets.read-ref",
  ]);
  assert.deepEqual(draft.plugin.sps.primitives, [
    "runtimes.list",
    "runtimes.dispatch",
    "runs.observe",
    "artifacts.write",
    "secrets.use",
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { loadSpsOfficialMarketplaceCatalog } from "../src/marketplace-catalog.mjs";

test("Marketplace exposes only public, verified catalog information without artifact locations", async () => {
  const catalog = await loadSpsOfficialMarketplaceCatalog({
    inspect: async () => ({
      valid: true,
      warning: "Pinned Registry root verified.",
      releases: [
        {
          pluginId: "io.example.private",
          version: "1.0.0",
          visibility: "link",
          publisherId: "example",
          artifact: { sha256: "a".repeat(64), sizeBytes: 123 },
          artifactUrl: "https://example.invalid/private.spsplugin",
        },
        {
          pluginId: "io.example.public",
          version: "1.0.0",
          isLatest: false,
          visibility: "public",
          publisherId: "example",
          artifact: { sha256: "c".repeat(64), sizeBytes: 123 },
        },
        {
          pluginId: "io.example.public",
          version: "2.0.0",
          isLatest: true,
          visibility: "public",
          catalog: { displayName: "Public Plugin", summary: "Verified.", documentationUrl: "https://docs.example.test/plugin" },
          capabilities: ["ui.page.register"],
          publisherId: "example",
          publisherProfile: { id: "example", displayName: "Example", websiteUrl: "https://example.test" },
          artifact: { sha256: "b".repeat(64), sizeBytes: 456 },
          artifactUrl: "https://example.invalid/public.spsplugin",
        },
      ],
    }),
  });

  assert.equal(catalog.valid, true);
  assert.equal(catalog.releases.length, 1);
  assert.equal(catalog.releases[0].pluginId, "io.example.public");
  assert.equal(catalog.releases[0].isLatest, true);
  assert.deepEqual(catalog.releases[0].artifact, { sha256: "b".repeat(64), sizeBytes: 456 });
  assert.equal("artifactUrl" in catalog.releases[0], false);
  assert.deepEqual(catalog.releases[0].capabilities, ["ui.page.register"]);
});

test("Marketplace returns a safe unavailable catalog when verification fails", async () => {
  const catalog = await loadSpsOfficialMarketplaceCatalog({
    inspect: async () => { throw new Error("Registry root signature failed."); },
  });

  assert.equal(catalog.valid, false);
  assert.deepEqual(catalog.releases, []);
  assert.deepEqual(catalog.errors, ["Registry root signature failed."]);
});

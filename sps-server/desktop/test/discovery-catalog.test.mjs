import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  pluginDiscoveryVaultLayout,
  readSpsDiscoveryCatalog,
  refreshSpsDiscoveryCatalog,
} from "../src/discovery-catalog.mjs";

test("writes only verified public Official Registry metadata into the Owner Vault", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-discovery-catalog-"));
  try {
    const refreshed = await refreshSpsDiscoveryCatalog({
      ownerVaultRoot: vaultRoot,
      now: () => "2026-07-28T00:00:00.000Z",
      loadCatalog: async () => ({
        valid: true,
        source: { id: "io.sps.official", displayName: "SPS Official Registry" },
        releases: [{
          pluginId: "com.example.weather",
          version: "1.0.0",
          isLatest: true,
          visibility: "public",
          catalog: { displayName: "Weather", summary: "Forecasts." },
          capabilities: ["agent.tools.register"],
          publisherId: "example",
          publisherProfile: { displayName: "Example" },
          artifact: { sha256: "a".repeat(64), sizeBytes: 10 },
        }],
      }),
    });
    assert.equal(refreshed.refreshed, true);
    assert.equal(refreshed.path, pluginDiscoveryVaultLayout(vaultRoot).catalogPath);
    const cached = await readSpsDiscoveryCatalog({ ownerVaultRoot: vaultRoot });
    assert.equal(cached.available, true);
    assert.deepEqual(cached.catalog, {
      schemaVersion: 1,
      source: { id: "io.sps.official", displayName: "SPS Official Registry" },
      refreshedAt: "2026-07-28T00:00:00.000Z",
      releases: [{
        pluginId: "com.example.weather",
        version: "1.0.0",
        isLatest: true,
        visibility: "public",
        catalog: { displayName: "Weather", summary: "Forecasts." },
        capabilities: ["agent.tools.register"],
        publisherId: "example",
        publisherProfile: { displayName: "Example" },
      }],
    });
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

test("retains the last trusted catalog when the Official Registry is unavailable", async () => {
  const vaultRoot = await mkdtemp(path.join(os.tmpdir(), "sps-discovery-catalog-"));
  try {
    const layout = pluginDiscoveryVaultLayout(vaultRoot);
    const missing = await refreshSpsDiscoveryCatalog({
      ownerVaultRoot: vaultRoot,
      loadCatalog: async () => ({ valid: false, errors: ["offline"] }),
    });
    assert.equal(missing.refreshed, false);
    assert.equal(missing.path, layout.catalogPath);
    assert.equal((await readSpsDiscoveryCatalog({ ownerVaultRoot: vaultRoot })).available, false);
  } finally {
    await rm(vaultRoot, { recursive: true, force: true });
  }
});

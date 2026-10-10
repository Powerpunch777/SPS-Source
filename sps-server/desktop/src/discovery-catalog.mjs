import { promises as fs } from "node:fs";
import path from "node:path";
import { loadSpsOfficialExtensionsCatalog } from "./official-extensions-catalog.mjs";

const DISCOVERY_CATALOG_SCHEMA_VERSION = 1;

export function pluginDiscoveryVaultLayout(ownerVaultRoot) {
  const root = path.join(path.resolve(ownerVaultRoot), "plugin-discovery");
  return {
    root,
    catalogPath: path.join(root, "official-catalog.json"),
  };
}

function publicCatalogSnapshot(catalog, refreshedAt) {
  return {
    schemaVersion: DISCOVERY_CATALOG_SCHEMA_VERSION,
    source: {
      id: catalog.source?.id ?? "io.sps.official",
      displayName: catalog.source?.displayName ?? "SPS Official Registry",
    },
    refreshedAt,
    releases: Array.isArray(catalog.releases)
      ? catalog.releases.map((release) => ({
        pluginId: release.pluginId,
        version: release.version,
        isLatest: release.isLatest === true,
        visibility: release.visibility,
        ...(release.catalog ? { catalog: { ...release.catalog } } : {}),
        ...(release.capabilities ? { capabilities: [...release.capabilities] } : {}),
        ...(release.compatibility ? { compatibility: { ...release.compatibility } } : {}),
        publisherId: release.publisherId,
        ...(release.publisherProfile ? { publisherProfile: { ...release.publisherProfile } } : {}),
      }))
      : [],
  };
}

export async function readSpsDiscoveryCatalog({ ownerVaultRoot, fsApi = fs } = {}) {
  const layout = pluginDiscoveryVaultLayout(ownerVaultRoot);
  try {
    const raw = await fsApi.readFile(layout.catalogPath, "utf8");
    const value = JSON.parse(raw);
    if (value?.schemaVersion !== DISCOVERY_CATALOG_SCHEMA_VERSION || !Array.isArray(value.releases)) {
      throw new Error("SPS Marketplace catalog cache is invalid.");
    }
    return { available: true, path: layout.catalogPath, catalog: value };
  } catch (error) {
    if (error?.code === "ENOENT") return { available: false, path: layout.catalogPath, catalog: null };
    throw error;
  }
}

/**
 * Desktop verifies the official Registry once. Core Marketplace and the
 * optional Discovery plugin receive only this read-only public snapshot.
 */
export async function refreshSpsDiscoveryCatalog({
  ownerVaultRoot,
  loadCatalog = loadSpsOfficialExtensionsCatalog,
  fsApi = fs,
  now = () => new Date().toISOString(),
} = {}) {
  const layout = pluginDiscoveryVaultLayout(ownerVaultRoot);
  const catalog = await loadCatalog();
  if (!catalog.valid) {
    return {
      refreshed: false,
      path: layout.catalogPath,
      errors: Array.isArray(catalog.errors) ? [...catalog.errors] : ["SPS Official Registry is unavailable."],
    };
  }

  const snapshot = publicCatalogSnapshot(catalog, now());
  await fsApi.mkdir(layout.root, { recursive: true, mode: 0o700 });
  const temporaryPath = `${layout.catalogPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsApi.writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fsApi.rename(temporaryPath, layout.catalogPath);
  } finally {
    await fsApi.rm(temporaryPath, { force: true }).catch(() => {});
  }
  return { refreshed: true, path: layout.catalogPath, catalog: snapshot, errors: [] };
}

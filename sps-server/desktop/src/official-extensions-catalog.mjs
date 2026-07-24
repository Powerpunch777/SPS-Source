import {
  SPS_OFFICIAL_REGISTRY_SOURCE,
  inspectRegistrySource,
} from "./registry-source-catalog.mjs";

function publicCatalogRelease(release) {
  return {
    pluginId: release.pluginId,
    version: release.version,
    isLatest: release.isLatest === true,
    visibility: release.visibility,
    ...(release.catalog ? { catalog: { ...release.catalog } } : {}),
    ...(release.capabilities ? { capabilities: [...release.capabilities] } : {}),
    publisherId: release.publisherId,
    ...(release.publisherProfile ? { publisherProfile: { ...release.publisherProfile } } : {}),
    artifact: {
      sha256: release.artifact.sha256,
      sizeBytes: release.artifact.sizeBytes,
    },
  };
}

/**
 * Official Extensions discovery has no installation authority. It exposes
 * only the signed SPS catalog; Registry review remains the only route that
 * can stage or enable plugin code.
 */
export async function loadSpsOfficialExtensionsCatalog({ inspect = inspectRegistrySource } = {}) {
  try {
    const report = await inspect(SPS_OFFICIAL_REGISTRY_SOURCE);
    const publicReleases = report.valid
      ? report.releases.filter((release) => release.visibility === "public")
      : [];
    const latestPublicReleases = publicReleases.filter((release) => release.isLatest === true);
    return {
      source: {
        id: SPS_OFFICIAL_REGISTRY_SOURCE.id,
        kind: SPS_OFFICIAL_REGISTRY_SOURCE.kind,
        displayName: SPS_OFFICIAL_REGISTRY_SOURCE.displayName,
      },
      valid: Boolean(report.valid),
      errors: Array.isArray(report.errors) ? [...report.errors] : [],
      ...(report.warning ? { warning: report.warning } : {}),
      releases: report.valid
        ? (latestPublicReleases.length > 0 ? latestPublicReleases : publicReleases)
          .map(publicCatalogRelease)
          .sort((left, right) => {
            const byName = (left.catalog?.displayName ?? left.pluginId).localeCompare(right.catalog?.displayName ?? right.pluginId);
            return byName === 0 ? right.version.localeCompare(left.version) : byName;
          })
        : [],
    };
  } catch (error) {
    return {
      source: {
        id: SPS_OFFICIAL_REGISTRY_SOURCE.id,
        kind: SPS_OFFICIAL_REGISTRY_SOURCE.kind,
        displayName: SPS_OFFICIAL_REGISTRY_SOURCE.displayName,
      },
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      releases: [],
    };
  }
}

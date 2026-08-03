export function selectVersionByTag(versions, tag) {
  const matches = (Array.isArray(versions) ? versions : []).filter((version) => version?.annotations?.["workers/tag"] === tag);
  if (matches.length !== 1) throw new Error(`Expected exactly one Cloudflare Worker version for tag ${tag}.`);
  if (!matches[0].id) throw new Error(`Cloudflare Worker version for tag ${tag} has no version ID.`);
  return matches[0];
}

export function wranglerCollection(payload, property) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.[property])) return parsed[property];
  throw new Error(`Wrangler did not return a ${property} collection.`);
}

export function deploymentHasVersion(deployment, versionId) {
  return Array.isArray(deployment?.versions)
    && deployment.versions.some((version) => (
      version?.version_id === versionId && Number(version?.percentage ?? 0) > 0
    ));
}

export function selectDeployment(deployments, { deploymentId, versionId } = {}) {
  const matches = (Array.isArray(deployments) ? deployments : []).filter((deployment) => (
    (!deploymentId || deployment?.id === deploymentId)
    && (!versionId || deploymentHasVersion(deployment, versionId))
  ));
  if (matches.length !== 1) {
    throw new Error("Expected exactly one Cloudflare deployment for the requested ID and Worker version.");
  }
  return matches[0];
}

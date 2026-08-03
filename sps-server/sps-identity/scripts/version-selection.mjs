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

function deploymentCreatedAt(deployment) {
  const value = Date.parse(deployment?.created_on ?? "");
  if (!Number.isFinite(value)) {
    throw new Error("Cloudflare deployment is missing a valid created_on timestamp.");
  }
  return value;
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

export function selectCurrentDeployment(deployments, { deploymentId, versionId } = {}) {
  const collection = Array.isArray(deployments) ? deployments : [];
  const declared = selectDeployment(collection, { deploymentId, versionId });
  const ordered = collection
    .map((deployment) => ({ deployment, createdAt: deploymentCreatedAt(deployment) }))
    .sort((left, right) => right.createdAt - left.createdAt);
  if (ordered.length === 0) throw new Error("Cloudflare returned no deployments.");
  if (ordered.length > 1 && ordered[0].createdAt === ordered[1].createdAt) {
    throw new Error("Cloudflare returned multiple deployments with the same latest timestamp.");
  }
  if (ordered[0].deployment.id !== declared.id) {
    throw new Error("The declared Cloudflare deployment is not the latest active deployment.");
  }
  return declared;
}

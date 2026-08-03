import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateFullOAuthEvidence } from "./smoke-oauth-interactive.mjs";
import { validateStagingEvidence } from "./validate-staging-evidence.mjs";
import { selectCurrentDeployment, wranglerCollection } from "./version-selection.mjs";

const pinned = {
  production: { url: "https://auth.redongames.com", databaseId: "9d1caea5-6043-40a7-93dc-273157b2e445", databaseName: "sps-identity", worker: "sps-identity", config: "wrangler.toml" },
  staging: { url: "https://auth-staging.redongames.com", databaseId: "b0f62d9e-0f87-4ed2-ac99-ffc164c0892c", databaseName: "sps-identity-staging", worker: "sps-identity-staging", config: "wrangler.staging.toml" },
};

export function validateReleaseAttestation(attestation, {
  sourceRevision,
  productionDeploymentId,
  productionVersionId,
  stagingDeploymentId,
  stagingVersionId,
  now = Date.now(),
} = {}) {
  if (attestation?.schemaVersion !== 2 || attestation?.status !== "passed" || attestation?.environment !== "production") throw new Error("Identity release attestation is not a successful production schema-v2 result.");
  if (attestation.identityUrl !== pinned.production.url) throw new Error("Identity attestation is not pinned to production.");
  if (!sourceRevision || attestation.sourceRevision !== sourceRevision) throw new Error("Identity attestation Source SHA does not match the release.");
  if (attestation.databaseId !== pinned.production.databaseId || attestation.databaseName !== pinned.production.databaseName) throw new Error("Identity production D1 target is not pinned.");
  if (attestation.deploymentId !== undefined) throw new Error("Identity attestation must use cloudflareDeploymentId, not the ambiguous deploymentId field.");
  if (attestation.cloudflareDeploymentId !== productionDeploymentId || attestation.versionId !== productionVersionId || !attestation.releaseId) throw new Error("Production Identity IDs do not match the protected release inputs.");
  if (attestation.health?.status !== "ok" || attestation.health?.service !== "sps-identity" || attestation.health?.source_revision !== sourceRevision || attestation.health?.release_id !== attestation.releaseId || !/^v[1-9][0-9]*$/.test(attestation.health?.replay_key_version ?? "") || attestation.health?.protocol_version !== "2" || attestation.health?.rollback_floor !== "bridge-v2" || attestation.health?.rollout_phase !== "final") throw new Error("Identity production health is missing the final rollout contract.");
  validateStagingEvidence(attestation.stagingEvidence, {
    sourceRevision,
    expectedDeploymentId: stagingDeploymentId,
    expectedVersionId: stagingVersionId,
    expectedReleaseId: attestation.stagingEvidence?.releaseId,
    now,
  });
  validateFullOAuthEvidence(attestation.fullOAuthEvidence, {
    sourceRevision,
    cloudflareDeploymentId: stagingDeploymentId,
    versionId: stagingVersionId,
    releaseId: attestation.stagingEvidence.releaseId,
    now,
  });
  return attestation;
}

function wrangler(args) {
  return execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...args], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
}

async function health(url) {
  const response = await fetch(`${url}/health`, { redirect: "error" });
  if (!response.ok) throw new Error(`Identity health failed at ${url}: ${response.status}`);
  return response.json();
}

function remoteDeployments(target) {
  return wranglerCollection(wrangler(["deployments", "list", "--name", target.worker, "--config", target.config, "--json"]), "deployments");
}

function productionFinalizationState() {
  const query = "SELECT (SELECT COUNT(*) FROM refresh_tokens WHERE family_id IS NULL AND consumed_at IS NULL) AS active_familyless, (SELECT COUNT(*) FROM refresh_tokens WHERE family_id IS NULL AND consumed_at IS NOT NULL) AS consumed_familyless, (SELECT COUNT(*) FROM identity_replay_results) AS plaintext_replay;";
  const result = wrangler(["d1", "execute", pinned.production.databaseName, "--remote", "--config", pinned.production.config, "--json", "--command", query]);
  const payload = JSON.parse(result);
  const row = payload?.[0]?.results?.[0];
  return {
    activeFamilyless: Number(row?.active_familyless ?? NaN),
    consumedFamilyless: Number(row?.consumed_familyless ?? NaN),
    plaintextReplay: Number(row?.plaintext_replay ?? NaN),
  };
}

export async function verifyRemoteReleaseAttestation(attestation, options) {
  validateReleaseAttestation(attestation, options);
  const productionHealth = await health(pinned.production.url);
  const stagingHealth = await health(pinned.staging.url);
  for (const field of ["status", "service", "source_revision", "replay_key_version", "protocol_version", "rollback_floor", "rollout_phase", "release_id"]) {
    if (productionHealth[field] !== attestation.health?.[field]) throw new Error(`Remote production health ${field} does not match the attestation.`);
    if (stagingHealth[field] !== attestation.stagingEvidence?.health?.[field]) throw new Error(`Remote staging health ${field} does not match the attestation.`);
  }
  selectCurrentDeployment(remoteDeployments(pinned.production), {
    deploymentId: attestation.cloudflareDeploymentId,
    versionId: attestation.versionId,
  });
  selectCurrentDeployment(remoteDeployments(pinned.staging), {
    deploymentId: attestation.stagingEvidence.cloudflareDeploymentId,
    versionId: attestation.stagingEvidence.versionId,
  });
  const finalization = productionFinalizationState();
  if (!Object.values(finalization).every((count) => Number.isSafeInteger(count) && count === 0)) {
    throw new Error("Production D1 finalization is incomplete.");
  }
  return { productionHealth, stagingHealth, finalization };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const attestationPath = process.argv[2] ?? process.env.SPS_IDENTITY_ATTESTATION_PATH;
  if (!attestationPath) throw new Error("An SPS Identity release attestation path is required.");
  const sourceRevision = String(process.env.SPS_IDENTITY_EXPECTED_SOURCE_SHA ?? process.env.GITHUB_SHA ?? "").trim();
  const requiredEnv = [
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "SPS_IDENTITY_EXPECTED_PRODUCTION_DEPLOYMENT_ID",
    "SPS_IDENTITY_EXPECTED_PRODUCTION_VERSION_ID",
    "SPS_IDENTITY_EXPECTED_STAGING_DEPLOYMENT_ID",
    "SPS_IDENTITY_EXPECTED_STAGING_VERSION_ID",
  ];
  if (!sourceRevision) throw new Error("SPS_IDENTITY_EXPECTED_SOURCE_SHA or GITHUB_SHA is required for remote Identity attestation.");
  for (const name of requiredEnv) if (!String(process.env[name] ?? "").trim()) throw new Error(`${name} is required for remote Identity attestation.`);
  const attestation = JSON.parse(await readFile(path.resolve(attestationPath), "utf8"));
  await verifyRemoteReleaseAttestation(attestation, {
    sourceRevision,
    productionDeploymentId: process.env.SPS_IDENTITY_EXPECTED_PRODUCTION_DEPLOYMENT_ID,
    productionVersionId: process.env.SPS_IDENTITY_EXPECTED_PRODUCTION_VERSION_ID,
    stagingDeploymentId: process.env.SPS_IDENTITY_EXPECTED_STAGING_DEPLOYMENT_ID,
    stagingVersionId: process.env.SPS_IDENTITY_EXPECTED_STAGING_VERSION_ID,
  });
  console.log(`Verified remote Identity production attestation for ${sourceRevision}.`);
}

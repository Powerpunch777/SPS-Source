import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function validateStagingEvidence(evidence, {
  sourceRevision,
  expectedIdentityUrl = "https://auth-staging.redongames.com",
  expectedDatabaseId = "b0f62d9e-0f87-4ed2-ac99-ffc164c0892c",
  expectedDatabaseName = "sps-identity-staging",
  expectedDeploymentId,
  expectedVersionId,
  expectedReleaseId,
  expectedReplayKeyVersion = "v1",
  now = Date.now(),
  maxAgeMs = 24 * 60 * 60 * 1000,
} = {}) {
  if (evidence?.schemaVersion !== 1 || evidence?.environment !== "staging" || evidence?.status !== "passed") {
    throw new Error("SPS Identity staging evidence is not a successful schema-v1 result.");
  }
  if (!sourceRevision || evidence.sourceRevision !== sourceRevision) {
    throw new Error("SPS Identity staging evidence does not match the current Source revision.");
  }
  if (evidence.identityUrl !== expectedIdentityUrl) throw new Error("SPS Identity evidence identity URL is not the pinned staging URL.");
  if (evidence.databaseId !== expectedDatabaseId || evidence.databaseName !== expectedDatabaseName) {
    throw new Error("SPS Identity evidence is not bound to the pinned staging D1 database.");
  }
  if (!evidence.cloudflareDeploymentId || (expectedDeploymentId && evidence.cloudflareDeploymentId !== expectedDeploymentId)) {
    throw new Error("SPS Identity evidence is not bound to the verified Worker deployment ID.");
  }
  if (evidence.deploymentId !== undefined) throw new Error("SPS Identity evidence must use cloudflareDeploymentId, not the ambiguous deploymentId field.");
  if (!evidence.releaseId) throw new Error("SPS Identity evidence is missing the SPS release ID.");
  if (!evidence.versionId) throw new Error("SPS Identity evidence is missing the immutable Worker version ID.");
  if (expectedVersionId && evidence.versionId !== expectedVersionId) throw new Error("SPS Identity evidence Worker version ID does not match the protected rollout input.");
  if (expectedReleaseId && evidence.releaseId !== expectedReleaseId) throw new Error("SPS Identity evidence SPS release ID does not match the protected rollout input.");
  if (evidence.replayKeyVersion !== expectedReplayKeyVersion) throw new Error("SPS Identity evidence replay-key version is not pinned.");
  if (evidence.protocolVersion !== "2" || evidence.rollbackFloor !== "bridge-v2" || evidence.rolloutPhase !== "bridge") throw new Error("SPS Identity evidence is missing the compatibility bridge floor.");
  if (evidence.health?.status !== "ok"
      || evidence.health?.service !== "sps-identity"
      || evidence.health?.source_revision !== evidence.sourceRevision
      || evidence.health?.version_id !== evidence.versionId
      || evidence.health?.release_id !== evidence.releaseId
      || evidence.health?.replay_key_version !== evidence.replayKeyVersion
      || evidence.health?.protocol_version !== evidence.protocolVersion
      || evidence.health?.rollback_floor !== evidence.rollbackFloor
      || evidence.health?.rollout_phase !== evidence.rolloutPhase) {
    throw new Error("SPS Identity evidence health does not match its rollout tuple.");
  }
  if (evidence.directD1ProtocolSmoke !== true || evidence.oauthConfigurationSmoke !== true || evidence.fullOAuthSmoke !== false) throw new Error("SPS Identity evidence must distinguish configuration smoke from full OAuth smoke.");
  const generatedAt = Date.parse(evidence.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now + 5 * 60 * 1000 || now - generatedAt > maxAgeMs) {
    throw new Error("SPS Identity staging evidence is expired or has an invalid timestamp.");
  }
  const requiredChecks = ["health", "oauthConfigurationSmoke", "token", "tokenRetry", "refresh", "refreshRetry", "reuse", "familyRevoke", "revoke"];
  if (requiredChecks.some((check) => evidence.checks?.[check] !== true)) {
    throw new Error("SPS Identity staging evidence is missing a required smoke check.");
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const evidencePath = String(process.env.SPS_IDENTITY_STAGING_EVIDENCE ?? "").trim();
  if (!evidencePath) throw new Error("SPS_IDENTITY_STAGING_EVIDENCE is required.");
  const sourceRoot = path.resolve(process.cwd(), "..", "..");
  const sourceRevision = String(process.env.SPS_IDENTITY_SOURCE_REVISION
    ?? execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })).trim();
  const evidence = JSON.parse(await readFile(path.resolve(evidencePath), "utf8"));
  validateStagingEvidence(evidence, {
    sourceRevision,
    expectedDeploymentId: process.env.SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID?.trim(),
    expectedVersionId: process.env.SPS_IDENTITY_EXPECTED_VERSION_ID?.trim(),
    expectedReleaseId: process.env.SPS_IDENTITY_EXPECTED_RELEASE_ID?.trim(),
    expectedDatabaseId: process.env.SPS_IDENTITY_EXPECTED_DATABASE_ID?.trim() || undefined,
  });
  console.log(`SPS Identity staging evidence verified for ${sourceRevision}.`);
}

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { validateReleaseAttestation } from "./verify-release-attestation.mjs";

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

export async function createReleaseAttestation({ productionRolloutPath, stagingEvidencePath, oauthEvidencePath, outputPath }) {
  const production = await readJson(productionRolloutPath);
  const stagingEvidence = await readJson(stagingEvidencePath);
  const fullOAuthEvidence = await readJson(oauthEvidencePath);
  if (production.environment !== "production" || production.rolloutPhase !== "final") throw new Error("Production Final rollout evidence is required.");
  const response = await fetch("https://auth.redongames.com/health", { redirect: "error" });
  if (!response.ok) throw new Error(`Production Identity health failed with ${response.status}.`);
  const health = await response.json();
  const stagingJwksResponse = await fetch("https://auth-staging.redongames.com/.well-known/jwks.json", { redirect: "error" });
  if (!stagingJwksResponse.ok) throw new Error(`Staging Identity JWKS failed with ${stagingJwksResponse.status}.`);
  const stagingJwks = await stagingJwksResponse.json();
  const attestation = {
    schemaVersion: 2,
    status: "passed",
    environment: "production",
    identityUrl: "https://auth.redongames.com",
    sourceRevision: production.sourceRevision,
    databaseId: "9d1caea5-6043-40a7-93dc-273157b2e445",
    databaseName: "sps-identity",
    cloudflareDeploymentId: production.cloudflareDeploymentId,
    versionId: production.versionId,
    releaseId: production.releaseId,
    health,
    stagingEvidence,
    fullOAuthEvidence,
    generatedAt: new Date().toISOString(),
  };
  validateReleaseAttestation(attestation, {
    sourceRevision: production.sourceRevision,
    productionDeploymentId: production.cloudflareDeploymentId,
    productionVersionId: production.versionId,
    stagingDeploymentId: stagingEvidence.cloudflareDeploymentId,
    stagingVersionId: stagingEvidence.versionId,
    stagingJwks,
  });
  await writeFile(path.resolve(outputPath), `${JSON.stringify(attestation, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return attestation;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [productionRolloutPath, stagingEvidencePath, oauthEvidencePath, outputPath] = process.argv.slice(2);
  if (!productionRolloutPath || !stagingEvidencePath || !oauthEvidencePath || !outputPath) throw new Error("Usage: create-release-attestation.mjs <production-rollout.json> <staging-evidence.json> <oauth-evidence.json> <output.json>");
  await createReleaseAttestation({ productionRolloutPath, stagingEvidencePath, oauthEvidencePath, outputPath });
  console.log(`Created SPS Identity release attestation: ${path.resolve(outputPath)}`);
}

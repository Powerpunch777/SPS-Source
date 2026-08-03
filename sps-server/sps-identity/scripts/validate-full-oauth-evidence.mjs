import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateFullOAuthEvidence } from "./smoke-oauth-interactive.mjs";

const evidencePath = String(process.env.SPS_IDENTITY_FULL_OAUTH_EVIDENCE ?? "").trim();
const sourceRevision = String(process.env.SPS_IDENTITY_SOURCE_REVISION ?? "").trim();
const cloudflareDeploymentId = String(process.env.SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID ?? "").trim();
const versionId = String(process.env.SPS_IDENTITY_EXPECTED_VERSION_ID ?? "").trim();
const releaseId = String(process.env.SPS_IDENTITY_EXPECTED_RELEASE_ID ?? "").trim();

if (!evidencePath || !sourceRevision || !cloudflareDeploymentId || !versionId || !releaseId) {
  throw new Error("Full OAuth validation requires its evidence path and exact staging rollout tuple.");
}

const evidence = JSON.parse(await readFile(path.resolve(evidencePath), "utf8"));
validateFullOAuthEvidence(evidence, {
  sourceRevision,
  cloudflareDeploymentId,
  versionId,
  releaseId,
});
console.log(`Verified full SPS staging OAuth evidence for ${sourceRevision}.`);

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateFullOAuthEvidence } from "./smoke-oauth-interactive.mjs";
import { selectCurrentDeployment, wranglerCollection } from "./version-selection.mjs";

const STAGING_URL = "https://auth-staging.redongames.com";

function wrangler(args) {
  return execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
}

const evidencePath = String(process.env.SPS_IDENTITY_FULL_OAUTH_EVIDENCE ?? "").trim();
const sourceRevision = String(process.env.SPS_IDENTITY_SOURCE_REVISION ?? "").trim();
const cloudflareDeploymentId = String(process.env.SPS_IDENTITY_EXPECTED_DEPLOYMENT_ID ?? "").trim();
const versionId = String(process.env.SPS_IDENTITY_EXPECTED_VERSION_ID ?? "").trim();
const releaseId = String(process.env.SPS_IDENTITY_EXPECTED_RELEASE_ID ?? "").trim();

if (!evidencePath || !sourceRevision || !cloudflareDeploymentId || !versionId || !releaseId) {
  throw new Error("Full OAuth validation requires its evidence path and exact staging rollout tuple.");
}

const evidence = JSON.parse(await readFile(path.resolve(evidencePath), "utf8"));
const healthResponse = await fetch(`${STAGING_URL}/health`, { redirect: "error" });
if (!healthResponse.ok) throw new Error(`Staging Identity health failed with ${healthResponse.status}.`);
const health = await healthResponse.json();
if (health?.status !== "ok"
    || health.source_revision !== sourceRevision
    || health.version_id !== versionId
    || health.release_id !== releaseId
    || health.rollout_phase !== "bridge") {
  throw new Error("Current staging Identity health does not match the OAuth evidence tuple.");
}
const deployments = wranglerCollection(wrangler([
  "deployments", "list", "--name", "sps-identity-staging", "--config", "wrangler.staging.toml", "--json",
]), "deployments");
selectCurrentDeployment(deployments, { deploymentId: cloudflareDeploymentId, versionId });
const jwksResponse = await fetch(`${STAGING_URL}/.well-known/jwks.json`, { redirect: "error" });
if (!jwksResponse.ok) throw new Error(`Staging Identity JWKS failed with ${jwksResponse.status}.`);
validateFullOAuthEvidence(evidence, {
  sourceRevision,
  cloudflareDeploymentId,
  versionId,
  releaseId,
  jwks: await jwksResponse.json(),
});
console.log(`Verified full SPS staging OAuth evidence for ${sourceRevision}.`);

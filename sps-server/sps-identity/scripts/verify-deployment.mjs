import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { selectCurrentDeployment, wranglerCollection } from "./version-selection.mjs";

const identityUrl = String(process.env.SPS_IDENTITY_URL ?? "https://auth.redongames.com").replace(/\/$/, "");
const wranglerConfigPath = String(process.env.SPS_IDENTITY_WRANGLER_CONFIG ?? "wrangler.toml");
const wranglerConfig = await readFile(join(process.cwd(), wranglerConfigPath), "utf8");
const environment = wranglerConfigPath.includes("staging") ? "staging" : "production";
const expected = JSON.parse(await readFile(join(process.cwd(), ".secrets", environment, "sps-identity-public.jwk.json"), "utf8"));
const keyId = String(process.env.SPS_IDENTITY_KEY_ID
  ?? wranglerConfig.match(/SPS_IDENTITY_KEY_ID\s*=\s*"([^"]+)"/)?.[1]
  ?? "");
const replayKeyVersion = wranglerConfig.match(/SPS_IDENTITY_REPLAY_KEY_VERSION\s*=\s*"(v[1-9][0-9]*)"/)?.[1];
const databaseId = wranglerConfig.match(/database_id\s*=\s*"([^"]+)"/)?.[1];
const databaseName = wranglerConfig.match(/database_name\s*=\s*"([^"]+)"/)?.[1];
const pinned = environment === "staging"
  ? { url: "https://auth-staging.redongames.com", databaseId: "b0f62d9e-0f87-4ed2-ac99-ffc164c0892c", databaseName: "sps-identity-staging" }
  : { url: "https://auth.redongames.com", databaseId: "9d1caea5-6043-40a7-93dc-273157b2e445", databaseName: "sps-identity" };
if (identityUrl !== pinned.url || databaseId !== pinned.databaseId || databaseName !== pinned.databaseName) {
  throw new Error("SPS Identity deployment target does not match the pinned environment.");
}
if (!String(process.env.SPS_IDENTITY_EXPECTED_CLOUDFLARE_DEPLOYMENT_ID ?? "").trim()) {
  throw new Error("SPS Identity deployment verification requires the exact Cloudflare deployment ID.");
}
if (!replayKeyVersion) throw new Error("wrangler.toml does not define a valid SPS Identity replay key version.");
if (!keyId) throw new Error(`${wranglerConfigPath} does not define SPS_IDENTITY_KEY_ID.`);
const sourceRoot = join(process.cwd(), "..", "..");
const sourceRevision = String(process.env.SPS_IDENTITY_SOURCE_REVISION
  ?? execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })).trim();

const health = await fetch(`${identityUrl}/health`);
if (!health.ok) throw new Error(`SPS Identity health check failed with ${health.status}.`);
const healthBody = await health.json();
if (
  healthBody?.status !== "ok"
  || healthBody?.service !== "sps-identity"
  || healthBody?.replay_key_version !== replayKeyVersion
  || healthBody?.source_revision !== sourceRevision
  || healthBody?.release_id !== String(process.env.SPS_IDENTITY_EXPECTED_RELEASE_ID)
  || healthBody?.protocol_version !== "2"
  || healthBody?.rollback_floor !== "bridge-v2"
  || healthBody?.rollout_phase !== String(process.env.SPS_IDENTITY_EXPECTED_ROLLOUT_PHASE ?? "").trim()
) {
  throw new Error("SPS Identity health response is invalid.");
}
if (String(process.env.SPS_IDENTITY_EXPECTED_DATABASE_ID ?? "") !== databaseId) {
  throw new Error("SPS Identity deployment database ID does not match the pinned environment.");
}
if (String(process.env.SPS_IDENTITY_EXPECTED_DATABASE_NAME ?? "") !== databaseName) {
  throw new Error("SPS Identity deployment database name does not match the pinned environment.");
}
const deploymentJson = execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["wrangler", "deployments", "list", "--name", wranglerConfig.match(/^name\s*=\s*"([^"]+)"/m)?.[1] ?? "", "--config", wranglerConfigPath, "--json"],
  { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
);
const deployments = wranglerCollection(deploymentJson, "deployments");
try {
  selectCurrentDeployment(deployments, {
    deploymentId: process.env.SPS_IDENTITY_EXPECTED_CLOUDFLARE_DEPLOYMENT_ID,
    versionId: process.env.SPS_IDENTITY_VERSION_ID,
  });
} catch {
  throw new Error("Cloudflare deployment ID does not point to the latest active exact Worker version.");
}

const jwksResponse = await fetch(`${identityUrl}/.well-known/jwks.json`);
if (!jwksResponse.ok) throw new Error(`SPS Identity JWKS check failed with ${jwksResponse.status}.`);
const jwks = await jwksResponse.json();
const active = Array.isArray(jwks?.keys) ? jwks.keys.find((key) => key?.kid === keyId) : null;
if (!active || active.kty !== "RSA" || active.n !== expected.n || active.e !== expected.e) {
  throw new Error("SPS Identity is not serving the expected public signing key.");
}

console.log(`SPS Identity deployment verified at ${identityUrl}.`);

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const identityUrl = String(process.env.SPS_IDENTITY_URL ?? "https://auth.redongames.com").replace(/\/$/, "");
const keyId = String(process.env.SPS_IDENTITY_KEY_ID ?? "sps-identity-2026-01");
const expected = JSON.parse(await readFile(join(process.cwd(), ".secrets", "sps-identity-public.jwk.json"), "utf8"));
const wranglerConfig = await readFile(join(process.cwd(), "wrangler.toml"), "utf8");
const replayKeyVersion = wranglerConfig.match(/SPS_IDENTITY_REPLAY_KEY_VERSION\s*=\s*"(v[1-9][0-9]*)"/)?.[1];
if (!replayKeyVersion) throw new Error("wrangler.toml does not define a valid SPS Identity replay key version.");

const health = await fetch(`${identityUrl}/health`);
if (!health.ok) throw new Error(`SPS Identity health check failed with ${health.status}.`);
const healthBody = await health.json();
if (
  healthBody?.status !== "ok"
  || healthBody?.service !== "sps-identity"
  || healthBody?.replay_key_version !== replayKeyVersion
) {
  throw new Error("SPS Identity health response is invalid.");
}

const jwksResponse = await fetch(`${identityUrl}/.well-known/jwks.json`);
if (!jwksResponse.ok) throw new Error(`SPS Identity JWKS check failed with ${jwksResponse.status}.`);
const jwks = await jwksResponse.json();
const active = Array.isArray(jwks?.keys) ? jwks.keys.find((key) => key?.kid === keyId) : null;
if (!active || active.kty !== "RSA" || active.n !== expected.n || active.e !== expected.e) {
  throw new Error("SPS Identity is not serving the expected public signing key.");
}

console.log(`SPS Identity deployment verified at ${identityUrl}.`);

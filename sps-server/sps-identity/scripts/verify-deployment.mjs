import { readFile } from "node:fs/promises";
import { join } from "node:path";

const identityUrl = String(process.env.SPS_IDENTITY_URL ?? "https://auth.redongames.com").replace(/\/$/, "");
const keyId = String(process.env.SPS_IDENTITY_KEY_ID ?? "sps-identity-2026-01");
const expected = JSON.parse(await readFile(join(process.cwd(), ".secrets", "sps-identity-public.jwk.json"), "utf8"));

const health = await fetch(`${identityUrl}/health`);
if (!health.ok) throw new Error(`SPS Identity health check failed with ${health.status}.`);
const healthBody = await health.json();
if (healthBody?.status !== "ok" || healthBody?.service !== "sps-identity") {
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

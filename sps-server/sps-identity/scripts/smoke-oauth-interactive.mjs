import { spawn } from "node:child_process";
import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/;
const STAGING_URL = "https://auth-staging.redongames.com";

function randomValue(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function sha256(value, encoding = "hex") {
  return createHash("sha256").update(value).digest(encoding);
}

function decodeJsonSegment(segment, label) {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new Error(`SPS access token has an invalid ${label}.`);
  }
}

export function verifyAccessTokenJwt(token, {
  jwks,
  issuer,
  audience = "sps-core",
  now = Date.now(),
} = {}) {
  const segments = typeof token === "string" ? token.split(".") : [];
  if (segments.length !== 3) throw new Error("SPS access token is not a JWT.");
  const header = decodeJsonSegment(segments[0], "header");
  const payload = decodeJsonSegment(segments[1], "payload");
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new Error("SPS access token uses an unsupported signing header.");
  }
  const key = (Array.isArray(jwks?.keys) ? jwks.keys : []).find((candidate) => (
    candidate?.kid === header.kid && candidate?.kty === "RSA" && candidate?.alg === "RS256"
  ));
  if (!key) throw new Error("SPS access token signing key is absent from JWKS.");
  const valid = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${segments[0]}.${segments[1]}`, "utf8"),
    createPublicKey({ key, format: "jwk" }),
    Buffer.from(segments[2], "base64url"),
  );
  if (!valid) throw new Error("SPS access token RSA signature is invalid.");
  const nowSeconds = Math.floor(now / 1000);
  if (payload.iss !== issuer.replace(/\/$/, "") || payload.aud !== audience) {
    throw new Error("SPS access token issuer or audience is invalid.");
  }
  if (!Number.isSafeInteger(payload.exp) || payload.exp <= nowSeconds) {
    throw new Error("SPS access token is expired or has no valid expiry.");
  }
  return { header, payload };
}

function openBrowser(url) {
  const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

async function receiveAuthorizationCode({ state, timeoutMs = 5 * 60 * 1000 }) {
  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/oauth2/callback") {
        response.writeHead(404).end("Not found");
        return;
      }
      if (url.searchParams.get("state") !== state) throw new Error("OAuth state mismatch.");
      const code = url.searchParams.get("code");
      if (!code) throw new Error(url.searchParams.get("error") || "Google sign-in returned no authorization code.");
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><meta charset=utf-8><title>SPS sign-in complete</title><p>SPS staging sign-in completed. You can close this window.</p>");
      resolveCode(code);
    } catch (error) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("SPS staging sign-in failed.");
      rejectCode(error);
    }
  });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const address = server.address();
  const callbackUrl = `http://127.0.0.1:${address.port}/oauth2/callback`;
  const timer = setTimeout(() => rejectCode(new Error("Interactive SPS staging sign-in timed out.")), timeoutMs);
  timer.unref?.();
  return {
    callbackUrl,
    codePromise: codePromise.finally(() => {
      clearTimeout(timer);
      server.close();
    }),
  };
}

async function jsonPost(identityUrl, pathname, body, expectedStatus) {
  const response = await fetch(new URL(pathname, `${identityUrl}/`), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (response.status !== expectedStatus) throw new Error(`${pathname} returned ${response.status}: ${text}`);
  return payload;
}

export function validateFullOAuthEvidence(evidence, {
  sourceRevision,
  identityUrl = STAGING_URL,
  cloudflareDeploymentId,
  versionId,
  releaseId,
  now = Date.now(),
  maxAgeMs = 24 * 60 * 60 * 1000,
} = {}) {
  if (evidence?.schemaVersion !== 1 || evidence?.status !== "passed" || evidence?.environment !== "staging") {
    throw new Error("Full OAuth evidence is not a successful staging schema-v1 result.");
  }
  if (evidence.identityUrl !== identityUrl) throw new Error("Full OAuth evidence URL is not the pinned staging URL.");
  if (!sourceRevision || evidence.sourceRevision !== sourceRevision) throw new Error("Full OAuth evidence Source SHA does not match.");
  if (!evidence.cloudflareDeploymentId || (cloudflareDeploymentId && evidence.cloudflareDeploymentId !== cloudflareDeploymentId)) throw new Error("Full OAuth evidence Cloudflare deployment ID does not match.");
  if (!evidence.versionId || (versionId && evidence.versionId !== versionId)) throw new Error("Full OAuth evidence Worker version ID does not match.");
  if (!evidence.releaseId || (releaseId && evidence.releaseId !== releaseId)) throw new Error("Full OAuth evidence SPS release ID does not match.");
  if (!SHA256.test(evidence.accountSubjectHash ?? "")) throw new Error("Full OAuth evidence must contain only a hashed account subject.");
  if (typeof evidence.accessToken === "string" || typeof evidence.refreshToken === "string") throw new Error("Full OAuth evidence must not contain tokens.");
  if (evidence.checks?.googleSignIn !== true
      || evidence.checks?.tokenExchange !== true
      || evidence.checks?.accessTokenSignature !== true
      || evidence.checks?.revoke !== true) {
    throw new Error("Full OAuth evidence is missing a required end-to-end check.");
  }
  const completedAt = Date.parse(evidence.completedAt ?? "");
  if (!Number.isFinite(completedAt) || completedAt > now + 5 * 60 * 1000 || now - completedAt > maxAgeMs) throw new Error("Full OAuth evidence is expired or invalid.");
  return evidence;
}

export async function runInteractiveOAuthSmoke({
  identityUrl = STAGING_URL,
  sourceRevision,
  cloudflareDeploymentId,
  versionId,
  releaseId,
  evidencePath,
} = {}) {
  if (identityUrl !== STAGING_URL) throw new Error("Interactive OAuth smoke runs only against the pinned staging URL.");
  if (!sourceRevision || !cloudflareDeploymentId || !versionId || !releaseId) throw new Error("Interactive OAuth smoke requires exact Source, Cloudflare deployment, Worker version, and SPS release IDs.");
  const healthResponse = await fetch(`${identityUrl}/health`, { redirect: "error" });
  if (!healthResponse.ok) throw new Error(`Staging Identity health failed with ${healthResponse.status}.`);
  const health = await healthResponse.json();
  if (health.source_revision !== sourceRevision || health.release_id !== releaseId || health.rollout_phase !== "bridge") throw new Error("Staging Identity health does not match the requested OAuth evidence tuple.");

  const state = randomValue();
  const verifier = randomValue(48);
  const deviceId = `sps-oauth-smoke-${randomValue(18)}`;
  const { callbackUrl, codePromise } = await receiveAuthorizationCode({ state });
  const authorizeUrl = new URL("/v1/desktop/authorize", `${identityUrl}/`);
  authorizeUrl.search = new URLSearchParams({
    redirect_uri: callbackUrl,
    state,
    code_challenge: sha256(verifier, "base64url"),
    code_challenge_method: "S256",
    device_id: deviceId,
  }).toString();
  openBrowser(authorizeUrl.toString());
  const code = await codePromise;
  const pair = await jsonPost(identityUrl, "/v1/desktop/token", {
    code,
    code_verifier: verifier,
    device_id: deviceId,
    idempotency_key: randomValue(),
  }, 200);
  if (!pair?.access_token || !pair?.refresh_token || !pair?.account?.subject) throw new Error("Full OAuth token exchange returned an incomplete account session.");
  const jwksResponse = await fetch(`${identityUrl}/.well-known/jwks.json`, { redirect: "error" });
  if (!jwksResponse.ok) throw new Error(`SPS staging JWKS returned ${jwksResponse.status}.`);
  verifyAccessTokenJwt(pair.access_token, {
    jwks: await jwksResponse.json(),
    issuer: identityUrl,
  });
  await jsonPost(identityUrl, "/v1/desktop/revoke", { refresh_token: pair.refresh_token }, 204);
  const evidence = {
    schemaVersion: 1,
    environment: "staging",
    status: "passed",
    identityUrl,
    sourceRevision,
    cloudflareDeploymentId,
    versionId,
    releaseId,
    accountSubjectHash: sha256(pair.account.subject),
    completedAt: new Date().toISOString(),
    checks: { googleSignIn: true, tokenExchange: true, accessTokenSignature: true, revoke: true },
  };
  validateFullOAuthEvidence(evidence, { sourceRevision, cloudflareDeploymentId, versionId, releaseId });
  await mkdir(path.dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const sourceRevision = process.env.SPS_IDENTITY_SOURCE_REVISION?.trim();
  const cloudflareDeploymentId = process.env.SPS_IDENTITY_CLOUDFLARE_DEPLOYMENT_ID?.trim();
  const versionId = process.env.SPS_IDENTITY_VERSION_ID?.trim();
  const releaseId = process.env.SPS_IDENTITY_RELEASE_ID?.trim();
  const evidencePath = path.resolve(process.env.SPS_IDENTITY_OAUTH_EVIDENCE ?? path.join("artifacts", `identity-staging-oauth-${sourceRevision}.json`));
  await runInteractiveOAuthSmoke({ sourceRevision, cloudflareDeploymentId, versionId, releaseId, evidencePath });
  console.log(`Full SPS staging OAuth smoke passed. Evidence: ${evidencePath}`);
}

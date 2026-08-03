import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function randomValue(size = 32) {
  return randomBytes(size).toString("base64url");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("base64url");
}

async function jsonRequest(fetchImpl, identityUrl, pathname, body, expectedStatus) {
  const response = await fetchImpl(new URL(pathname, `${identityUrl}/`), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expectedStatus, `${pathname} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

export async function runIdentityStagingSmoke({
  identityUrl,
  database = "sps-identity-staging",
  databaseId,
  deploymentId,
  releaseId,
  versionId,
  runOAuthConfigurationSmoke = false,
  sourceRevision,
  fetchImpl = fetch,
  seedAuthorizationCode,
  cleanup,
  writeEvidence,
  now = () => Date.now(),
  randomValueImpl = randomValue,
}) {
  const normalizedIdentityUrl = String(identityUrl ?? "").replace(/\/$/, "");
  if (!new URL(normalizedIdentityUrl).hostname.includes("staging")) {
    throw new Error("SPS Identity smoke refuses to run against a non-staging hostname.");
  }
  if (typeof seedAuthorizationCode !== "function") throw new Error("A staging authorization-code seeder is required.");
  if (typeof cleanup !== "function") throw new Error("A staging cleanup function is required.");

  const subject = `sps-smoke-${randomValueImpl(12)}`;
  const deviceId = `sps-smoke-device-${randomValueImpl(12)}`;
  const flows = [0, 1].map(() => ({
    code: randomValueImpl(32),
    verifier: randomValueImpl(48),
  }));
  const codeHashes = flows.map((flow) => sha256(flow.code));
  const checks = {};

  try {
    const healthResponse = await fetchImpl(`${normalizedIdentityUrl}/health`);
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.status, "ok");
    assert.equal(health.service, "sps-identity");
    assert.equal(health.source_revision, sourceRevision);
    if (releaseId) assert.equal(health.release_id, releaseId);
    if (health.protocol_version !== null && health.protocol_version !== undefined) assert.equal(health.protocol_version, "2");
    if (health.rollback_floor !== null && health.rollback_floor !== undefined) assert.equal(health.rollback_floor, "bridge-v2");
    assert.equal(health.rollout_phase, "bridge");
    checks.health = true;

    if (runOAuthConfigurationSmoke) {
      const oauthResponse = await fetchImpl(new URL("/v1/desktop/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%2Foauth2%2Fcallback&state=smoke&code_challenge=smoke&code_challenge_method=S256&device_id=smoke", `${normalizedIdentityUrl}/`), { redirect: "manual" });
      assert.equal(oauthResponse.status, 302);
      assert.match(oauthResponse.headers.get("location") ?? "", /^https:\/\/(accounts\.google\.com|oauth2\.google\.com)\//);
      checks.oauthConfigurationSmoke = true;
    }

    for (const flow of flows) {
      await seedAuthorizationCode({
        subject,
        email: `${subject}@example.invalid`,
        name: "SPS Identity staging smoke",
        deviceId,
        codeHash: sha256(flow.code),
        codeChallenge: sha256(flow.verifier),
        expiresAt: now() + 5 * 60 * 1000,
      });
    }

    const tokenKey = randomValueImpl(32);
    const tokenBody = {
      code: flows[0].code,
      code_verifier: flows[0].verifier,
      device_id: deviceId,
      idempotency_key: tokenKey,
    };
    const tokenPair = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/token", tokenBody, 200);
    assert.ok(tokenPair.access_token && tokenPair.refresh_token);
    checks.token = true;
    const tokenRetry = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/token", tokenBody, 200);
    assert.deepEqual(tokenRetry, tokenPair);
    checks.tokenRetry = true;

    const refreshKey = randomValueImpl(32);
    const refreshBody = {
      refresh_token: tokenPair.refresh_token,
      device_id: deviceId,
      idempotency_key: refreshKey,
    };
    const rotatedPair = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/refresh", refreshBody, 200);
    assert.notEqual(rotatedPair.refresh_token, tokenPair.refresh_token);
    checks.refresh = true;
    const refreshRetry = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/refresh", refreshBody, 200);
    assert.deepEqual(refreshRetry, rotatedPair);
    checks.refreshRetry = true;

    const reuse = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/refresh", {
      ...refreshBody,
      idempotency_key: randomValueImpl(32),
    }, 401);
    assert.equal(reuse.error_code, "refresh_token_reused");
    checks.reuse = true;
    const revokedChild = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/refresh", {
      refresh_token: rotatedPair.refresh_token,
      device_id: deviceId,
      idempotency_key: randomValueImpl(32),
    }, 401);
    assert.equal(revokedChild.error_code, "refresh_token_invalid");
    checks.familyRevoke = true;

    const secondPair = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/token", {
      code: flows[1].code,
      code_verifier: flows[1].verifier,
      device_id: deviceId,
      idempotency_key: randomValueImpl(32),
    }, 200);
    await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/revoke", {
      refresh_token: secondPair.refresh_token,
    }, 204);
    const revoked = await jsonRequest(fetchImpl, normalizedIdentityUrl, "/v1/desktop/refresh", {
      refresh_token: secondPair.refresh_token,
      device_id: deviceId,
      idempotency_key: randomValueImpl(32),
    }, 401);
    assert.equal(revoked.error_code, "refresh_token_invalid");
    checks.revoke = true;

    const generatedAt = new Date(now()).toISOString();
    const evidence = {
      schemaVersion: 1,
      environment: "staging",
      status: "passed",
      identityUrl: normalizedIdentityUrl,
      database,
      databaseId,
      databaseName: database,
      cloudflareDeploymentId: deploymentId,
      releaseId,
      versionId,
      sourceRevision,
      replayKeyVersion: health.replay_key_version,
      protocolVersion: health.protocol_version,
      rollbackFloor: health.rollback_floor,
      rolloutPhase: health.rollout_phase,
      health: {
        status: health.status,
        service: health.service,
        source_revision: health.source_revision,
        replay_key_version: health.replay_key_version,
        protocol_version: health.protocol_version,
        rollback_floor: health.rollback_floor,
        rollout_phase: health.rollout_phase,
        release_id: health.release_id,
        version_id: health.version_id,
      },
      directD1ProtocolSmoke: true,
      oauthConfigurationSmoke: runOAuthConfigurationSmoke,
      fullOAuthSmoke: false,
      generatedAt,
      checks,
    };
    if (typeof writeEvidence === "function") await writeEvidence(evidence);
    return evidence;
  } finally {
    await cleanup({ subject, codeHashes });
  }
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runWrangler(args) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["wrangler", ...args], { cwd: process.cwd(), stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Wrangler failed: ${args.join(" ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const identityUrl = String(process.env.SPS_IDENTITY_URL ?? "https://auth-staging.redongames.com").replace(/\/$/, "");
  const configPath = String(process.env.SPS_IDENTITY_WRANGLER_CONFIG ?? "wrangler.staging.toml");
  const database = String(process.env.SPS_IDENTITY_D1_DATABASE ?? "sps-identity-staging");
  const databaseId = String(process.env.SPS_IDENTITY_D1_DATABASE_ID ?? "");
  const deploymentId = String(process.env.SPS_IDENTITY_DEPLOYMENT_ID ?? "");
  const releaseId = String(process.env.SPS_IDENTITY_RELEASE_ID ?? "");
  const versionId = String(process.env.SPS_IDENTITY_VERSION_ID ?? "");
  if (!databaseId || !deploymentId || !versionId || !releaseId) throw new Error("Staging smoke requires the pinned D1 database ID, Cloudflare deployment ID, SPS release ID, and immutable Worker version ID.");
  const sourceRoot = path.resolve(process.cwd(), "..", "..");
  const sourceRevision = String(process.env.SPS_IDENTITY_SOURCE_REVISION
    ?? execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })).trim();
  const evidencePath = path.resolve(process.env.SPS_IDENTITY_SMOKE_EVIDENCE
    ?? path.join("artifacts", `identity-staging-smoke-${Date.now()}.json`));

  const executeSql = (sql) => runWrangler([
    "d1", "execute", database, "--remote", "--yes", "--config", configPath, "--command", sql,
  ]);
  const seedAuthorizationCode = async ({ subject, email, name, deviceId, codeHash, codeChallenge, expiresAt }) => {
    const timestamp = Date.now();
    executeSql(
      `INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (`
      + `${sqlLiteral(subject)}, ${sqlLiteral(email)}, ${sqlLiteral(name)}, NULL, ${timestamp}, ${timestamp}) `
      + `ON CONFLICT(subject) DO UPDATE SET email = excluded.email, name = excluded.name, updated_at = excluded.updated_at; `
      + `INSERT INTO authorization_codes (code_hash, subject, email, name, picture, device_id, code_challenge, expires_at) VALUES (`
      + `${sqlLiteral(codeHash)}, ${sqlLiteral(subject)}, ${sqlLiteral(email)}, ${sqlLiteral(name)}, NULL, `
      + `${sqlLiteral(deviceId)}, ${sqlLiteral(codeChallenge)}, ${Number(expiresAt)});`,
    );
  };
  const cleanup = async ({ subject, codeHashes }) => {
    const replayKeys = codeHashes.map((codeHash) => sqlLiteral(`authorization-code:${codeHash}`)).join(", ");
    executeSql(
      `DELETE FROM identity_replay_results_v2 WHERE replay_key IN (${replayKeys}); `
      + `DELETE FROM authorization_codes WHERE subject = ${sqlLiteral(subject)}; `
      + `DELETE FROM refresh_tokens WHERE subject = ${sqlLiteral(subject)}; `
      + `DELETE FROM identity_users WHERE subject = ${sqlLiteral(subject)};`,
    );
  };
  const writeEvidence = async (evidence) => {
    await mkdir(path.dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  };

  await runIdentityStagingSmoke({
    identityUrl,
    database,
    databaseId,
    deploymentId,
    releaseId,
    versionId,
    runOAuthConfigurationSmoke: true,
    sourceRevision,
    seedAuthorizationCode,
    cleanup,
    writeEvidence,
  });
  console.log(`SPS Identity staging smoke passed. Evidence: ${evidencePath}`);
}

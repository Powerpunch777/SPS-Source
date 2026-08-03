import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deploymentHasVersion, selectCurrentDeployment, selectDeployment, selectVersionByTag, wranglerCollection } from "../scripts/version-selection.mjs";
import { validateFullOAuthEvidence, verifyAccessTokenJwt, verifyOAuthEvidenceReceipt } from "../scripts/smoke-oauth-interactive.mjs";
import { validateReleaseAttestation } from "../scripts/verify-release-attestation.mjs";
import { validateSigningMaterial } from "../scripts/validate-signing-material.mjs";

function oauthEvidenceFixture({ sourceRevision = "a".repeat(40), completedAt = "2026-08-03T10:00:00.000Z" } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "identity-test", alg: "RS256" };
  const evidence = {
    schemaVersion: 2,
    status: "passed",
    environment: "staging",
    identityUrl: "https://auth-staging.redongames.com",
    sourceRevision,
    cloudflareDeploymentId: "staging-deployment",
    versionId: "staging-version",
    releaseId: "staging-release",
    evidenceNonce: "n".repeat(43),
    accountSubjectHash: "b".repeat(43),
    completedAt,
    checks: { googleSignIn: true, tokenExchange: true, accessTokenSignature: true, revoke: true },
  };
  const nowSeconds = Math.floor(Date.parse(completedAt) / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "sps-oauth-evidence+jwt", kid: jwk.kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: evidence.identityUrl,
    aud: "sps-release-oauth-evidence",
    iat: nowSeconds,
    nbf: nowSeconds - 5,
    exp: nowSeconds + 24 * 60 * 60,
    jti: "receipt-id",
    scope: "sps.release.oauth-evidence",
    source_revision: evidence.sourceRevision,
    cloudflare_deployment_id: evidence.cloudflareDeploymentId,
    version_id: evidence.versionId,
    release_id: evidence.releaseId,
    evidence_nonce: evidence.evidenceNonce,
    account_subject_hash: evidence.accountSubjectHash,
    device_id_hash: "d".repeat(43),
    google_verified_at: Date.parse(completedAt),
    revoked_at: Date.parse(completedAt) + 1_000,
    event: "google-oauth-session-revoked",
  })).toString("base64url");
  const signed = `${header}.${payload}`;
  evidence.receiptJwt = `${signed}.${sign("RSA-SHA256", Buffer.from(signed), privateKey).toString("base64url")}`;
  return { evidence, jwks: { keys: [jwk] } };
}

test("selects the exact Cloudflare version annotation instead of list order", () => {
  const selected = selectVersionByTag([
    { id: "oldest", annotations: { "workers/tag": "other" } },
    { id: "target", annotations: { "workers/tag": "sps-staging-bridge" } },
  ], "sps-staging-bridge");
  assert.equal(selected.id, "target");
  assert.throws(() => selectVersionByTag([{ id: "target", annotations: {} }], "sps-staging-bridge"), /exactly one/);
});

test("parses Wrangler arrays and binds a deployment to a traffic-bearing version", () => {
  const payload = [{ id: "deployment-1", created_on: "2026-08-03T10:00:00.000Z", versions: [{ version_id: "version-1", percentage: 100 }] }];
  assert.deepEqual(wranglerCollection(JSON.stringify(payload), "deployments"), payload);
  assert.equal(deploymentHasVersion(payload[0], "version-1"), true);
  assert.equal(selectDeployment(payload, { deploymentId: "deployment-1", versionId: "version-1" }), payload[0]);
  assert.throws(() => selectDeployment(payload, { deploymentId: "deployment-1", versionId: "wrong" }), /exactly one/);
});

test("requires the declared deployment to be the newest active deployment regardless of list order", () => {
  const deployments = [
    { id: "old", created_on: "2026-08-03T09:00:00.000Z", versions: [{ version_id: "old-version", percentage: 100 }] },
    { id: "current", created_on: "2026-08-03T11:00:00.000Z", versions: [{ version_id: "current-version", percentage: 100 }] },
  ];
  assert.equal(selectCurrentDeployment(deployments, { deploymentId: "current", versionId: "current-version" }).id, "current");
  assert.throws(() => selectCurrentDeployment(deployments, { deploymentId: "old", versionId: "old-version" }), /latest active/);
  assert.equal(selectCurrentDeployment(deployments.toReversed(), { deploymentId: "current", versionId: "current-version" }).id, "current");
});

test("verifies the access token against the published RSA JWKS", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "identity-test", alg: "RS256" };
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT", kid: jwk.kid })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iss: "https://auth-staging.redongames.com", aud: "sps-core", exp: 1_786_000_000 })).toString("base64url");
  const signed = `${header}.${payload}`;
  const token = `${signed}.${sign("RSA-SHA256", Buffer.from(signed), privateKey).toString("base64url")}`;
  assert.equal(verifyAccessTokenJwt(token, {
    jwks: { keys: [jwk] },
    issuer: "https://auth-staging.redongames.com",
    now: 1_785_000_000_000,
  }).header.kid, jwk.kid);
  assert.throws(() => verifyAccessTokenJwt(`${signed}.AA`, {
    jwks: { keys: [jwk] },
    issuer: "https://auth-staging.redongames.com",
    now: 1_785_000_000_000,
  }), /signature/);
});

test("rejects a public JWK that does not match the deployment private PEM", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-identity-keypair-"));
  try {
    const first = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const second = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const privatePath = path.join(root, "private.pem");
    const publicPath = path.join(root, "public.json");
    await writeFile(privatePath, first.privateKey.export({ type: "pkcs8", format: "pem" }));
    await writeFile(publicPath, JSON.stringify(first.publicKey.export({ format: "jwk" })));
    await validateSigningMaterial(privatePath, publicPath);
    await writeFile(publicPath, JSON.stringify(second.publicKey.export({ format: "jwk" })));
    await assert.rejects(() => validateSigningMaterial(privatePath, publicPath), /same RSA key pair/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("full OAuth evidence is token-free and independently validated", () => {
  const { evidence, jwks } = oauthEvidenceFixture();
  const options = { sourceRevision: "a".repeat(40), jwks, now: Date.parse("2026-08-03T11:00:00.000Z") };
  assert.equal(validateFullOAuthEvidence(evidence, options), evidence);
  assert.equal(verifyOAuthEvidenceReceipt(evidence.receiptJwt, {
    ...options,
    issuer: evidence.identityUrl,
    cloudflareDeploymentId: evidence.cloudflareDeploymentId,
    versionId: evidence.versionId,
    releaseId: evidence.releaseId,
    evidenceNonce: evidence.evidenceNonce,
    accountSubjectHash: evidence.accountSubjectHash,
  }).payload.source_revision, evidence.sourceRevision);
  assert.throws(() => validateFullOAuthEvidence({ ...evidence, refreshToken: "secret" }, options), /tokens/);
  assert.throws(() => validateFullOAuthEvidence({ ...evidence, sourceRevision: "c".repeat(40) }, options), /Source SHA/);
  assert.throws(() => validateFullOAuthEvidence({ ...evidence, receiptJwt: `${evidence.receiptJwt.slice(0, -2)}AA` }, options), /signature/);
});

test("release attestation binds final production and bridge staging to exact Cloudflare IDs", () => {
  const sourceRevision = "a".repeat(40);
  const generatedAt = "2026-08-03T10:00:00.000Z";
  const stagingEvidence = {
    schemaVersion: 1,
    environment: "staging",
    status: "passed",
    identityUrl: "https://auth-staging.redongames.com",
    databaseId: "b0f62d9e-0f87-4ed2-ac99-ffc164c0892c",
    databaseName: "sps-identity-staging",
    cloudflareDeploymentId: "staging-deployment",
    versionId: "staging-version",
    releaseId: "staging-release",
    replayKeyVersion: "v1",
    protocolVersion: "2",
    rollbackFloor: "bridge-v2",
    rolloutPhase: "bridge",
    health: { status: "ok", service: "sps-identity", source_revision: sourceRevision, release_id: "staging-release", replay_key_version: "v1", protocol_version: "2", rollback_floor: "bridge-v2", rollout_phase: "bridge" },
    directD1ProtocolSmoke: true,
    oauthConfigurationSmoke: true,
    fullOAuthSmoke: false,
    sourceRevision,
    generatedAt,
    checks: { health: true, oauthConfigurationSmoke: true, token: true, tokenRetry: true, refresh: true, refreshRetry: true, reuse: true, familyRevoke: true, revoke: true },
  };
  const { evidence: fullOAuthEvidence, jwks: stagingJwks } = oauthEvidenceFixture({ sourceRevision, completedAt: generatedAt });
  const attestation = {
    schemaVersion: 2,
    status: "passed",
    environment: "production",
    identityUrl: "https://auth.redongames.com",
    sourceRevision,
    databaseId: "9d1caea5-6043-40a7-93dc-273157b2e445",
    databaseName: "sps-identity",
    cloudflareDeploymentId: "production-deployment",
    versionId: "production-version",
    releaseId: "production-release",
    health: { status: "ok", service: "sps-identity", source_revision: sourceRevision, release_id: "production-release", replay_key_version: "v1", protocol_version: "2", rollback_floor: "bridge-v2", rollout_phase: "final" },
    stagingEvidence,
    fullOAuthEvidence,
  };
  assert.equal(validateReleaseAttestation(attestation, {
    sourceRevision,
    productionDeploymentId: "production-deployment",
    productionVersionId: "production-version",
    stagingDeploymentId: "staging-deployment",
    stagingVersionId: "staging-version",
    stagingJwks,
    now: Date.parse("2026-08-03T11:00:00.000Z"),
  }), attestation);
  assert.throws(() => validateReleaseAttestation({ ...attestation, deploymentId: "ambiguous" }, {
    sourceRevision,
    productionDeploymentId: "production-deployment",
    productionVersionId: "production-version",
    stagingDeploymentId: "staging-deployment",
    stagingVersionId: "staging-version",
    stagingJwks,
    now: Date.parse("2026-08-03T11:00:00.000Z"),
  }), /ambiguous/);
});

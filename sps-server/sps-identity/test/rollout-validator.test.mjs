import assert from "node:assert/strict";
import test from "node:test";
import { deploymentHasVersion, selectDeployment, selectVersionByTag, wranglerCollection } from "../scripts/version-selection.mjs";
import { validateFullOAuthEvidence } from "../scripts/smoke-oauth-interactive.mjs";
import { validateReleaseAttestation } from "../scripts/verify-release-attestation.mjs";

test("selects the exact Cloudflare version annotation instead of list order", () => {
  const selected = selectVersionByTag([
    { id: "oldest", annotations: { "workers/tag": "other" } },
    { id: "target", annotations: { "workers/tag": "sps-staging-bridge" } },
  ], "sps-staging-bridge");
  assert.equal(selected.id, "target");
  assert.throws(() => selectVersionByTag([{ id: "target", annotations: {} }], "sps-staging-bridge"), /exactly one/);
});

test("parses Wrangler arrays and binds a deployment to a traffic-bearing version", () => {
  const payload = [{ id: "deployment-1", versions: [{ version_id: "version-1", percentage: 100 }] }];
  assert.deepEqual(wranglerCollection(JSON.stringify(payload), "deployments"), payload);
  assert.equal(deploymentHasVersion(payload[0], "version-1"), true);
  assert.equal(selectDeployment(payload, { deploymentId: "deployment-1", versionId: "version-1" }), payload[0]);
  assert.throws(() => selectDeployment(payload, { deploymentId: "deployment-1", versionId: "wrong" }), /exactly one/);
});

test("full OAuth evidence is token-free and independently validated", () => {
  const evidence = {
    schemaVersion: 1,
    status: "passed",
    environment: "staging",
    identityUrl: "https://auth-staging.redongames.com",
    sourceRevision: "a".repeat(40),
    cloudflareDeploymentId: "staging-deployment-1",
    versionId: "staging-version-1",
    releaseId: "staging-release-1",
    accountSubjectHash: "b".repeat(64),
    completedAt: "2026-08-03T10:00:00.000Z",
    checks: { googleSignIn: true, tokenExchange: true, revoke: true },
  };
  assert.equal(validateFullOAuthEvidence(evidence, { sourceRevision: "a".repeat(40), now: Date.parse("2026-08-03T11:00:00.000Z") }), evidence);
  assert.throws(() => validateFullOAuthEvidence({ ...evidence, refreshToken: "secret" }, { sourceRevision: "a".repeat(40), now: Date.parse("2026-08-03T11:00:00.000Z") }), /tokens/);
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
  const fullOAuthEvidence = {
    schemaVersion: 1,
    status: "passed",
    environment: "staging",
    identityUrl: "https://auth-staging.redongames.com",
    sourceRevision,
    cloudflareDeploymentId: "staging-deployment",
    versionId: "staging-version",
    releaseId: "staging-release",
    accountSubjectHash: "b".repeat(64),
    completedAt: generatedAt,
    checks: { googleSignIn: true, tokenExchange: true, revoke: true },
  };
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
    now: Date.parse("2026-08-03T11:00:00.000Z"),
  }), attestation);
  assert.throws(() => validateReleaseAttestation({ ...attestation, deploymentId: "ambiguous" }, {
    sourceRevision,
    productionDeploymentId: "production-deployment",
    productionVersionId: "production-version",
    stagingDeploymentId: "staging-deployment",
    stagingVersionId: "staging-version",
    now: Date.parse("2026-08-03T11:00:00.000Z"),
  }), /ambiguous/);
});

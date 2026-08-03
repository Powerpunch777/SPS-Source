import assert from "node:assert/strict";
import test from "node:test";
import { validateStagingEvidence } from "../scripts/validate-staging-evidence.mjs";

function evidence(overrides = {}) {
  return {
    schemaVersion: 1,
    environment: "staging",
    status: "passed",
    identityUrl: "https://auth-staging.redongames.com",
    databaseId: "b0f62d9e-0f87-4ed2-ac99-ffc164c0892c",
    databaseName: "sps-identity-staging",
    cloudflareDeploymentId: "staging-deployment-1",
    releaseId: "sps-staging-bridge-1",
    versionId: "staging-version-1",
    replayKeyVersion: "v1",
    protocolVersion: "2",
    rollbackFloor: "bridge-v2",
    rolloutPhase: "bridge",
    health: {
      status: "ok",
      service: "sps-identity",
      source_revision: "source-revision",
      release_id: "sps-staging-bridge-1",
      replay_key_version: "v1",
      protocol_version: "2",
      rollback_floor: "bridge-v2",
      rollout_phase: "bridge",
    },
    directD1ProtocolSmoke: true,
    oauthConfigurationSmoke: true,
    fullOAuthSmoke: false,
    sourceRevision: "source-revision",
    generatedAt: "2026-08-03T10:00:00.000Z",
    checks: {
      health: true,
      oauthConfigurationSmoke: true,
      token: true,
      tokenRetry: true,
      refresh: true,
      refreshRetry: true,
      reuse: true,
      familyRevoke: true,
      revoke: true,
    },
    ...overrides,
  };
}

test("accepts recent staging evidence for the exact Source revision", () => {
  const value = evidence();
  assert.equal(validateStagingEvidence(value, {
    sourceRevision: "source-revision",
    now: Date.parse("2026-08-03T11:00:00.000Z"),
  }), value);
});

test("rejects production, stale, incomplete, and wrong-revision evidence", () => {
  const now = Date.parse("2026-08-03T11:00:00.000Z");
  assert.throws(() => validateStagingEvidence(evidence({ identityUrl: "https://auth.redongames.com" }), {
    sourceRevision: "source-revision", now,
  }), /pinned staging URL/);
  assert.throws(() => validateStagingEvidence(evidence({ databaseId: "production-db" }), {
    sourceRevision: "source-revision", now,
  }), /pinned staging D1/);
  assert.throws(() => validateStagingEvidence(evidence({ sourceRevision: "other" }), {
    sourceRevision: "source-revision", now,
  }), /Source revision/);
  assert.throws(() => validateStagingEvidence(evidence({ generatedAt: "2026-08-01T00:00:00.000Z" }), {
    sourceRevision: "source-revision", now,
  }), /expired/);
  assert.throws(() => validateStagingEvidence(evidence({ checks: { health: true } }), {
    sourceRevision: "source-revision", now,
  }), /missing a required smoke check/);
});

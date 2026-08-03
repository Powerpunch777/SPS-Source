import assert from "node:assert/strict";
import test from "node:test";
import { validateStagingEvidence } from "../scripts/validate-staging-evidence.mjs";

function evidence(overrides = {}) {
  return {
    schemaVersion: 1,
    environment: "staging",
    status: "passed",
    identityUrl: "https://auth-staging.redongames.com",
    sourceRevision: "source-revision",
    generatedAt: "2026-08-03T10:00:00.000Z",
    checks: {
      health: true,
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
  }), /staging hostname/);
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

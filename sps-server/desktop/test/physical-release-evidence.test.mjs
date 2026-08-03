import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  REQUIRED_PHYSICAL_SCENARIOS,
  validatePhysicalReleaseEvidence,
} from "../scripts/verify-physical-release-evidence.mjs";

const sourceRevision = "1".repeat(40);
const candidate = {
  desktopVersion: "0.4.112",
  core: { revision: "2".repeat(40) },
  pluginSdk: { revision: "3".repeat(40) },
};

function validEvidence() {
  const artifactName = "two-device-session-log";
  const artifactContent = Buffer.from('{"result":"pass","devices":2}', "utf8");
  return {
    schemaVersion: 1,
    candidate: {
      desktopVersion: candidate.desktopVersion,
      sourceRevision,
      coreRevision: candidate.core.revision,
      pluginSdkRevision: candidate.pluginSdk.revision,
    },
    completedAt: "2026-08-02T00:00:00.000Z",
    devices: {
      hostFingerprint: "4".repeat(64),
      memberFingerprint: "5".repeat(64),
    },
    artifacts: [{
      name: artifactName,
      mediaType: "application/json",
      contentBase64: artifactContent.toString("base64"),
      sha256: createHash("sha256").update(artifactContent).digest("hex"),
    }],
    scenarios: Object.fromEntries(REQUIRED_PHYSICAL_SCENARIOS.map((name) => [
      name,
      { status: "pass", artifactNames: [artifactName] },
    ])),
  };
}

test("accepts candidate-specific evidence from two physical devices", () => {
  assert.deepEqual(validatePhysicalReleaseEvidence(validEvidence(), { candidate, sourceRevision }), []);
});

test("rejects checkbox-only, stale, or single-device release evidence", () => {
  const evidence = validEvidence();
  evidence.candidate.coreRevision = "7".repeat(40);
  evidence.devices.memberFingerprint = evidence.devices.hostFingerprint;
  evidence.artifacts[0].sha256 = "0".repeat(64);
  evidence.scenarios.networkRecovery.artifactNames = [];
  const errors = validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision });
  assert.ok(errors.some((error) => error.includes("Core revision")));
  assert.ok(errors.some((error) => error.includes("two distinct devices")));
  assert.ok(errors.some((error) => error.includes("does not match its SHA-256")));
  assert.ok(errors.some((error) => error.includes("networkRecovery")));
});

test("keeps embedded evidence below the Windows secret environment limit", () => {
  const evidence = validEvidence();
  const oversizedContent = Buffer.alloc((12 * 1024) + 1, "A");
  evidence.artifacts[0].contentBase64 = oversizedContent.toString("base64");
  evidence.artifacts[0].sha256 = createHash("sha256").update(oversizedContent).digest("hex");
  const errors = validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision });
  assert.ok(errors.some((error) => error.includes("12288 bytes")));
});

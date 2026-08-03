import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  REQUIRED_PHYSICAL_SCENARIOS,
  createPhysicalDeviceAttestation,
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
  const evidence = {
    schemaVersion: 2,
    releaseNonce: "8".repeat(64),
    candidate: {
      desktopVersion: candidate.desktopVersion,
      sourceRevision,
      coreRevision: candidate.core.revision,
      pluginSdkRevision: candidate.pluginSdk.revision,
    },
    completedAt: "2026-08-02T00:00:00.000Z",
    installer: {
      version: candidate.desktopVersion,
      sizeBytes: 12345,
      sha256: "6".repeat(64),
      signatureStatus: "Valid",
    },
    devices: {},
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
  for (const role of ["host", "member"]) {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    evidence.devices[role] = createPhysicalDeviceAttestation(evidence, {
      role,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      signedAt: evidence.completedAt,
    });
  }
  return evidence;
}

function releaseChallenge(evidence) {
  return {
    schemaVersion: 1,
    desktopVersion: candidate.desktopVersion,
    sourceRevision,
    installerSha256: evidence.installer.sha256,
    releaseNonce: evidence.releaseNonce,
    generatedAt: evidence.completedAt,
  };
}

const verificationNow = Date.parse("2026-08-03T00:00:00.000Z");

test("accepts candidate-specific evidence from two physical devices", () => {
  const evidence = validEvidence();
  assert.deepEqual(validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision, releaseChallenge: releaseChallenge(evidence), now: verificationNow }), []);
});

test("rejects checkbox-only, stale, or single-device release evidence", () => {
  const evidence = validEvidence();
  evidence.candidate.coreRevision = "7".repeat(40);
  evidence.devices.member = evidence.devices.host;
  evidence.artifacts[0].sha256 = "0".repeat(64);
  evidence.scenarios.networkRecovery.artifactNames = [];
  const errors = validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision, releaseChallenge: releaseChallenge(evidence), now: verificationNow });
  assert.ok(errors.some((error) => error.includes("Core revision")));
  assert.ok(errors.some((error) => error.includes("two distinct signed device identities")));
  assert.ok(errors.some((error) => error.includes("does not match its SHA-256")));
  assert.ok(errors.some((error) => error.includes("networkRecovery")));
});

test("keeps embedded evidence below the Windows secret environment limit", () => {
  const evidence = validEvidence();
  const oversizedContent = Buffer.alloc((12 * 1024) + 1, "A");
  evidence.artifacts[0].contentBase64 = oversizedContent.toString("base64");
  evidence.artifacts[0].sha256 = createHash("sha256").update(oversizedContent).digest("hex");
  const errors = validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision, releaseChallenge: releaseChallenge(evidence), now: verificationNow });
  assert.ok(errors.some((error) => error.includes("12288 bytes")));
});

test("rejects unsigned, nonce-swapped, or post-signature evidence edits", () => {
  const evidence = validEvidence();
  evidence.scenarios.hostMemberJoin.status = "fail";
  const errors = validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision, releaseChallenge: releaseChallenge(evidence), now: verificationNow });
  assert.ok(errors.some((error) => error.includes("hostMemberJoin")));
  assert.ok(errors.some((error) => error.includes("device signature is invalid")));

  const nonceSwap = validEvidence();
  const challenge = releaseChallenge(nonceSwap);
  challenge.releaseNonce = "9".repeat(64);
  assert.ok(validatePhysicalReleaseEvidence(nonceSwap, { candidate, sourceRevision, releaseChallenge: challenge, now: verificationNow })
    .some((error) => error.includes("challenge nonce")));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  createTailscaleServeReleaseEvidence,
  tailscaleServeChallengeForReleaseNonce,
  tailscaleServePathForReleaseNonce,
  validateTailscaleServeReleaseEvidence,
} from "../scripts/tailscale-serve-release-evidence.mjs";

const sourceRevision = "1".repeat(40);
const completedAt = "2026-08-05T00:00:00.000Z";
const releaseManifest = {
  baseline: {
    desktopVersion: "0.4.131",
    sourceRevision,
    core: { revision: "2".repeat(40) },
    pluginSdk: { revision: "3".repeat(40) },
    platform: { minimumRemoteTransportVersion: "1.52.0" },
  },
  ownerHostRuntime: {
    archive: { file: "sps-owner-host-runtime.tgz", sizeBytes: 123456, sha256: "4".repeat(64) },
    runtimeManifestSha256: "5".repeat(64),
    requestHostnameModule: {
      relativePath: "node_modules/@paperclipai/server/dist/middleware/request-hostname.js",
      sha256: "6".repeat(64),
    },
  },
  artifacts: {
    installer: { file: "SPS-Desktop-Setup-0.4.131.exe", sizeBytes: 987654, sha256: "7".repeat(64) },
  },
};
const releaseChallenge = {
  schemaVersion: 1,
  desktopVersion: "0.4.131",
  sourceRevision,
  installerSha256: "7".repeat(64),
  releaseNonce: "8".repeat(64),
};
const challenge = tailscaleServeChallengeForReleaseNonce(releaseChallenge.releaseNonce);
const servePath = tailscaleServePathForReleaseNonce(releaseChallenge.releaseNonce);

function encodedResponse({ accepted, source, identity }) {
  return Buffer.from(JSON.stringify({
    accepted,
    challenge,
    parsedIdentity: { source, peer: "loopback", identity },
  }), "utf8").toString("base64");
}

function capture() {
  return {
    schemaVersion: 1,
    releaseNonce: "8".repeat(64),
    completedAt,
    servePath,
    backendPort: 31311,
    hostTailscaleVersion: { short: "1.98.8" },
    memberTailscaleVersion: { short: "1.98.4" },
    runtimeArchiveSha256: "4".repeat(64),
    requestHostnameModuleSha256: "6".repeat(64),
    memberResponse: {
      httpStatus: 200,
      responseBodyBase64: encodedResponse({ accepted: true, source: "tailscale-serve", identity: { present: true } }),
    },
    directSpoofResponse: {
      httpStatus: 403,
      responseBodyBase64: encodedResponse({ accepted: false, source: "direct", identity: null }),
    },
  };
}

function validationOptions(evidence) {
  return {
    candidate: releaseManifest.baseline,
    sourceRevision,
    installer: releaseManifest.artifacts.installer,
    ownerHostRuntime: releaseManifest.ownerHostRuntime,
    releaseChallenge,
    now: Date.parse(evidence.completedAt),
  };
}

test("creates anonymized Serve evidence with actual status and runtime hashes", () => {
  const evidence = createTailscaleServeReleaseEvidence({
    capture: capture(),
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "Valid",
  });
  assert.equal(evidence.status, "stable");
  assert.equal(evidence.observations.member.httpStatus, 200);
  assert.equal(evidence.observations.directSpoof.httpStatus, 403);
  assert.equal(evidence.runtime.archiveSha256, "4".repeat(64));
  assert.equal(evidence.runtime.requestHostnameModuleSha256, "6".repeat(64));
  assert.match(evidence.observations.member.responseSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(evidence), /private@example\.com|C:\\\\private|100\./);
  assert.deepEqual(validateTailscaleServeReleaseEvidence(evidence, { ...validationOptions(evidence), requireStable: true }), []);
});

test("keeps unsigned captures explicitly outside Stable evidence", () => {
  const evidence = createTailscaleServeReleaseEvidence({
    capture: capture(),
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "NotSigned",
  });
  assert.equal(evidence.status, "development-smoke");
  assert.ok(validateTailscaleServeReleaseEvidence(evidence, { ...validationOptions(evidence), requireStable: true })
    .some((error) => error.includes("requires stable Serve evidence")));
});

test("rejects status claims, runtime changes, prereleases, and public PII fields", () => {
  const evidence = createTailscaleServeReleaseEvidence({
    capture: capture(),
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "Valid",
  });
  evidence.observations.directSpoof.httpStatus = 200;
  evidence.runtime.archiveSha256 = "9".repeat(64);
  evidence.transport.memberVersion = "1.52.0-rc1";
  evidence.accountEmail = "private@example.com";
  const errors = validateTailscaleServeReleaseEvidence(evidence, { ...validationOptions(evidence), requireStable: true });
  assert.ok(errors.some((error) => error.includes("unsupported fields")));
  assert.ok(errors.some((error) => error.includes("runtime identity")));
  assert.ok(errors.some((error) => error.includes("member Tailscale version")));
  assert.ok(errors.some((error) => error.includes("direct-spoof observation")));
});

test("rejects captures that report expected booleans without the actual HTTP status", () => {
  const invalid = capture();
  delete invalid.memberResponse.httpStatus;
  assert.throws(() => createTailscaleServeReleaseEvidence({
    capture: invalid,
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "Valid",
  }), /does not match the SPS Serve transport contract/);
});

test("rejects a capture produced by different runtime or transport module bytes", () => {
  const invalid = capture();
  invalid.requestHostnameModuleSha256 = "9".repeat(64);
  assert.throws(() => createTailscaleServeReleaseEvidence({
    capture: invalid,
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "Valid",
  }), /not produced by the packaged Owner Host runtime/);
});

test("rejects a capture copied from another release challenge", () => {
  const invalid = capture();
  invalid.releaseNonce = "a".repeat(64);
  assert.throws(() => createTailscaleServeReleaseEvidence({
    capture: invalid,
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "Valid",
  }), /not bound to this release challenge nonce/);
});

test("rejects a capture whose route or response was not challenged by the release nonce", () => {
  const wrongPath = capture();
  wrongPath.servePath = "/__sps-release-transport";
  assert.throws(() => createTailscaleServeReleaseEvidence({
    capture: wrongPath,
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "Valid",
  }), /path is not derived/);

  const wrongResponse = capture();
  const body = JSON.parse(Buffer.from(wrongResponse.memberResponse.responseBodyBase64, "base64").toString("utf8"));
  body.challenge = "9".repeat(64);
  wrongResponse.memberResponse.responseBodyBase64 = Buffer.from(JSON.stringify(body), "utf8").toString("base64");
  assert.throws(() => createTailscaleServeReleaseEvidence({
    capture: wrongResponse,
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: "Valid",
  }), /transport contract/);
});

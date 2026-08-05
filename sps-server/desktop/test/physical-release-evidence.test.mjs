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
  platform: { minimumRemoteTransportVersion: "1.52.0" },
};
const ownerHostRuntime = {
  archive: { file: "sps-owner-host-runtime.tgz", sizeBytes: 54321, sha256: "4".repeat(64) },
  runtimeManifestSha256: "5".repeat(64),
  requestHostnameModule: {
    relativePath: "node_modules/@paperclipai/server/dist/middleware/request-hostname.js",
    sha256: "7".repeat(64),
  },
};

function serveEvidence() {
  return {
    schemaVersion: 1,
    evidenceType: "sps-tailscale-serve",
    status: "stable",
    releaseNonce: "8".repeat(64),
    completedAt: "2026-08-02T00:00:00.000Z",
    candidate: {
      desktopVersion: candidate.desktopVersion,
      sourceRevision,
      coreRevision: candidate.core.revision,
      pluginSdkRevision: candidate.pluginSdk.revision,
    },
    installer: {
      version: candidate.desktopVersion,
      sizeBytes: 12345,
      sha256: "6".repeat(64),
      signatureStatus: "Valid",
    },
    runtime: {
      archiveSizeBytes: ownerHostRuntime.archive.sizeBytes,
      archiveSha256: ownerHostRuntime.archive.sha256,
      runtimeManifestSha256: ownerHostRuntime.runtimeManifestSha256,
      requestHostnameModuleSha256: ownerHostRuntime.requestHostnameModule.sha256,
    },
    transport: {
      minimumVersion: "1.52.0",
      hostVersion: "1.98.8",
      memberVersion: "1.98.4",
      servePath: "/__sps-release-transport",
      backendPort: 31311,
    },
    observations: {
      member: { httpStatus: 200, responseSha256: "a".repeat(64), accepted: true, source: "tailscale-serve", peer: "loopback", identityPresent: true },
      directSpoof: { httpStatus: 403, responseSha256: "b".repeat(64), accepted: false, source: "direct", peer: "loopback", identityPresent: false },
    },
    commands: [
      "member: GET https://<tailnet-host>/__sps-release-transport",
      "host: GET http://127.0.0.1:31311/__sps-release-transport with Host=<tailnet-host> and no Serve headers",
    ],
  };
}

function validEvidence() {
  const artifactName = "two-device-session-log";
  const artifactContent = Buffer.from('{"result":"pass","devices":2}', "utf8");
  const evidence = {
    schemaVersion: 3,
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
    }, {
      name: "tailscale-serve-evidence.json",
      mediaType: "application/json",
      contentBase64: Buffer.from(JSON.stringify(serveEvidence()), "utf8").toString("base64"),
      sha256: createHash("sha256").update(Buffer.from(JSON.stringify(serveEvidence()), "utf8")).digest("hex"),
    }],
    scenarios: Object.fromEntries(REQUIRED_PHYSICAL_SCENARIOS.map((name) => [
      name,
      { status: "pass", artifactNames: [artifactName] },
    ])),
  };
  evidence.scenarios.hostMemberJoin.artifactNames.push("tailscale-serve-evidence.json");
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
    trustedDeviceFingerprints: {
      host: evidence.devices.host.fingerprint,
      member: evidence.devices.member.fingerprint,
    },
  };
}

function validationOptions(evidence) {
  return {
    candidate,
    sourceRevision,
    releaseChallenge: releaseChallenge(evidence),
    trustedDeviceFingerprints: releaseChallenge(evidence).trustedDeviceFingerprints,
    ownerHostRuntime,
    now: verificationNow,
  };
}

const verificationNow = Date.parse("2026-08-03T00:00:00.000Z");

test("accepts candidate-specific evidence from two physical devices", () => {
  const evidence = validEvidence();
  assert.deepEqual(validatePhysicalReleaseEvidence(evidence, validationOptions(evidence)), []);
});

test("rejects checkbox-only, stale, or single-device release evidence", () => {
  const evidence = validEvidence();
  evidence.candidate.coreRevision = "7".repeat(40);
  evidence.devices.member = evidence.devices.host;
  evidence.artifacts[0].sha256 = "0".repeat(64);
  evidence.scenarios.networkRecovery.artifactNames = [];
  const options = validationOptions(evidence);
  options.trustedDeviceFingerprints = { ...options.trustedDeviceFingerprints, member: "9".repeat(64) };
  const errors = validatePhysicalReleaseEvidence(evidence, options);
  assert.ok(errors.some((error) => error.includes("Core revision")));
  assert.ok(errors.some((error) => error.includes("two distinct signed device identities")));
  assert.ok(errors.some((error) => error.includes("does not match its SHA-256")));
  assert.ok(errors.some((error) => error.includes("networkRecovery")));
  assert.ok(errors.some((error) => error.includes("protected member device enrollment")));
});

test("keeps embedded evidence below the Windows secret environment limit", () => {
  const evidence = validEvidence();
  const oversizedContent = Buffer.alloc((12 * 1024) + 1, "A");
  evidence.artifacts[0].contentBase64 = oversizedContent.toString("base64");
  evidence.artifacts[0].sha256 = createHash("sha256").update(oversizedContent).digest("hex");
  const errors = validatePhysicalReleaseEvidence(evidence, validationOptions(evidence));
  assert.ok(errors.some((error) => error.includes("12288 bytes")));
});

test("rejects unsigned, nonce-swapped, or post-signature evidence edits", () => {
  const evidence = validEvidence();
  evidence.scenarios.hostMemberJoin.status = "fail";
  const errors = validatePhysicalReleaseEvidence(evidence, validationOptions(evidence));
  assert.ok(errors.some((error) => error.includes("hostMemberJoin")));
  assert.ok(errors.some((error) => error.includes("device signature is invalid")));

  const nonceSwap = validEvidence();
  const challenge = releaseChallenge(nonceSwap);
  challenge.releaseNonce = "9".repeat(64);
  assert.ok(validatePhysicalReleaseEvidence(nonceSwap, { ...validationOptions(nonceSwap), releaseChallenge: challenge })
    .some((error) => error.includes("challenge nonce")));
});

import { execFile } from "node:child_process";
import { createHash, createPublicKey, sign as signData, verify as verifySignature } from "node:crypto";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "..", "..", "..");
const spsServerRoot = path.join(workspaceRoot, "sps-server");
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_REVISION = /^[0-9a-f]{40}$/;
const MAX_EMBEDDED_ARTIFACT_BYTES = 12 * 1024;
const EVIDENCE_MEDIA_TYPES = new Set(["application/json", "text/plain"]);
const DEVICE_ROLES = new Set(["host", "member"]);

export const REQUIRED_PHYSICAL_SCENARIOS = [
  "hostMemberJoin",
  "remoteAgentRuntime",
  "hostSourceEdit",
  "networkRecovery",
  "nodeAndRuntimeRevocation",
  "emptyHostRestore",
  "freshInstall",
  "previousStableUpgrade",
];

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function publicKeyFingerprint(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Physical evidence device keys must use Ed25519.");
  return createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex");
}

export function physicalEvidenceSigningPayload(evidence, device) {
  return {
    schemaVersion: 2,
    releaseNonce: evidence.releaseNonce,
    role: device.role,
    fingerprint: device.fingerprint,
    signedAt: device.signedAt,
    candidate: evidence.candidate,
    installer: evidence.installer,
    completedAt: evidence.completedAt,
    artifacts: (Array.isArray(evidence.artifacts) ? evidence.artifacts : []).map((artifact) => ({
      name: artifact.name,
      mediaType: artifact.mediaType,
      sha256: artifact.sha256,
    })).sort((left, right) => String(left.name).localeCompare(String(right.name))),
    scenarios: evidence.scenarios,
  };
}

export function createPhysicalDeviceAttestation(evidence, {
  role,
  publicKeyPem,
  privateKeyPem,
  signedAt = new Date().toISOString(),
} = {}) {
  if (!DEVICE_ROLES.has(role)) throw new Error("Physical device attestation role must be host or member.");
  const device = {
    role,
    publicKeyPem,
    fingerprint: publicKeyFingerprint(publicKeyPem),
    signedAt,
    signatureAlgorithm: "ed25519",
  };
  device.signatureBase64 = signData(
    null,
    Buffer.from(canonicalJson(physicalEvidenceSigningPayload(evidence, device)), "utf8"),
    privateKeyPem,
  ).toString("base64");
  return device;
}

function validateDeviceAttestation(evidence, device, role, completedAt) {
  const errors = [];
  if (device?.role !== role || device?.signatureAlgorithm !== "ed25519") {
    errors.push(`Physical evidence ${role} device attestation has an invalid role or algorithm.`);
    return errors;
  }
  let fingerprint;
  try {
    fingerprint = publicKeyFingerprint(device.publicKeyPem);
  } catch {
    errors.push(`Physical evidence ${role} device public key is invalid.`);
    return errors;
  }
  if (device.fingerprint !== fingerprint) errors.push(`Physical evidence ${role} fingerprint does not match its public key.`);
  const signedAt = Date.parse(device.signedAt ?? "");
  if (!Number.isFinite(signedAt) || Math.abs(signedAt - completedAt) > 6 * 60 * 60 * 1000) {
    errors.push(`Physical evidence ${role} signature timestamp is outside the test session.`);
  }
  let signature;
  try {
    signature = Buffer.from(device.signatureBase64 ?? "", "base64");
    if (!device.signatureBase64 || signature.length === 0 || signature.toString("base64") !== device.signatureBase64) throw new Error();
  } catch {
    errors.push(`Physical evidence ${role} signature is not canonical Base64.`);
    return errors;
  }
  const verified = verifySignature(
    null,
    Buffer.from(canonicalJson(physicalEvidenceSigningPayload(evidence, device)), "utf8"),
    device.publicKeyPem,
    signature,
  );
  if (!verified) errors.push(`Physical evidence ${role} device signature is invalid.`);
  return errors;
}

export function validatePhysicalReleaseEvidence(evidence, {
  candidate,
  sourceRevision,
  releaseChallenge,
  now = Date.now(),
  maxAgeMs = 7 * 24 * 60 * 60 * 1000,
}) {
  const errors = [];
  if (evidence?.schemaVersion !== 2) errors.push("Physical release evidence schemaVersion must be 2.");
  if (evidence?.candidate?.desktopVersion !== candidate.desktopVersion) {
    errors.push("Physical release evidence Desktop version does not match the support matrix.");
  }
  if (evidence?.candidate?.coreRevision !== candidate.core.revision) {
    errors.push("Physical release evidence Core revision does not match the support matrix.");
  }
  if (evidence?.candidate?.pluginSdkRevision !== candidate.pluginSdk.revision) {
    errors.push("Physical release evidence Plugin SDK revision does not match the support matrix.");
  }
  if (!GIT_REVISION.test(sourceRevision) || evidence?.candidate?.sourceRevision !== sourceRevision) {
    errors.push("Physical release evidence source revision does not match the release commit.");
  }
  const completedAt = Date.parse(evidence?.completedAt ?? "");
  if (!Number.isFinite(completedAt) || completedAt > now + 5 * 60 * 1000 || now - completedAt > maxAgeMs) {
    errors.push("Physical release evidence requires a valid completedAt timestamp.");
  }
  const installer = evidence?.installer;
  if (installer?.version !== candidate.desktopVersion) errors.push("Physical evidence installer version does not match the candidate.");
  if (!Number.isSafeInteger(installer?.sizeBytes) || installer.sizeBytes <= 0) errors.push("Physical evidence requires the final installer size.");
  if (!SHA256.test(installer?.sha256 ?? "")) errors.push("Physical evidence requires the final installer SHA-256.");
  if (installer?.signatureStatus !== "Valid") errors.push("Physical evidence requires a valid Windows Authenticode signature.");
  if (releaseChallenge?.schemaVersion !== 1
      || releaseChallenge.desktopVersion !== candidate.desktopVersion
      || releaseChallenge.sourceRevision !== sourceRevision
      || releaseChallenge.installerSha256 !== installer?.sha256
      || !SHA256.test(releaseChallenge.releaseNonce ?? "")) {
    errors.push("Physical release evidence requires the exact immutable release challenge.");
  }
  if (!SHA256.test(evidence?.releaseNonce ?? "") || evidence.releaseNonce !== releaseChallenge?.releaseNonce) {
    errors.push("Physical release evidence is not bound to the release challenge nonce.");
  }

  const artifacts = Array.isArray(evidence?.artifacts) ? evidence.artifacts : [];
  const artifactNames = new Set();
  let artifactBytes = 0;
  for (const artifact of artifacts) {
    if (!artifact?.name || artifactNames.has(artifact.name) || !SHA256.test(artifact?.sha256 ?? "")) {
      errors.push("Every physical evidence artifact needs a unique name and SHA-256 digest.");
      continue;
    }
    artifactNames.add(artifact.name);
    if (!EVIDENCE_MEDIA_TYPES.has(artifact.mediaType)) {
      errors.push(`Physical evidence artifact ${artifact.name} must be a compact JSON or text log.`);
      continue;
    }
    const encoded = artifact.contentBase64;
    if (
      typeof encoded !== "string"
      || encoded.length === 0
      || encoded.length % 4 !== 0
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)
    ) {
      errors.push(`Physical evidence artifact ${artifact.name} has invalid Base64 content.`);
      continue;
    }
    const content = Buffer.from(encoded, "base64");
    if (content.length === 0 || content.toString("base64") !== encoded) {
      errors.push(`Physical evidence artifact ${artifact.name} has non-canonical Base64 content.`);
      continue;
    }
    artifactBytes += content.length;
    const actualSha256 = createHash("sha256").update(content).digest("hex");
    if (actualSha256 !== artifact.sha256) {
      errors.push(`Physical evidence artifact ${artifact.name} does not match its SHA-256 digest.`);
    }
  }
  if (artifactNames.size === 0) errors.push("Physical release evidence requires at least one hashed artifact.");
  if (artifactBytes > MAX_EMBEDDED_ARTIFACT_BYTES) {
    errors.push(`Physical release evidence embeds more than ${MAX_EMBEDDED_ARTIFACT_BYTES} bytes of artifacts.`);
  }

  for (const scenarioName of REQUIRED_PHYSICAL_SCENARIOS) {
    const scenario = evidence?.scenarios?.[scenarioName];
    if (scenario?.status !== "pass") {
      errors.push(`Physical release scenario ${scenarioName} must pass.`);
      continue;
    }
    const references = Array.isArray(scenario.artifactNames) ? scenario.artifactNames : [];
    if (references.length === 0 || references.some((name) => !artifactNames.has(name))) {
      errors.push(`Physical release scenario ${scenarioName} must reference hashed evidence artifacts.`);
    }
  }
  const host = evidence?.devices?.host;
  const member = evidence?.devices?.member;
  errors.push(...validateDeviceAttestation(evidence, host, "host", completedAt));
  errors.push(...validateDeviceAttestation(evidence, member, "member", completedAt));
  if (host?.fingerprint && member?.fingerprint && host.fingerprint === member.fingerprint) {
    errors.push("Physical release evidence must use two distinct signed device identities.");
  }
  return errors;
}

async function gitRevision() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot, windowsHide: true });
  return stdout.trim();
}

export async function verifyPhysicalReleaseEvidence({ evidencePath, sourceRevision, installerPath, challengePath } = {}) {
  const matrix = JSON.parse(await readFile(path.join(spsServerRoot, "release", "support-matrix.json"), "utf8"));
  const candidate = matrix.candidate;
  const resolvedSourceRevision = sourceRevision
    ?? process.env.SPS_SOURCE_REVISION?.trim()
    ?? process.env.GITHUB_SHA?.trim()
    ?? await gitRevision();
  const resolvedEvidencePath = evidencePath
    ?? process.env.SPS_PHYSICAL_EVIDENCE_PATH?.trim()
    ?? path.join(spsServerRoot, "release", "evidence", `v${candidate.desktopVersion}.json`);
  let evidence;
  try {
    evidence = JSON.parse(await readFile(resolvedEvidencePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`Physical two-device release evidence is missing: ${resolvedEvidencePath}`);
    }
    throw error;
  }
  const resolvedChallengePath = challengePath ?? process.env.SPS_RELEASE_CHALLENGE_PATH?.trim();
  if (!resolvedChallengePath) throw new Error("The immutable SPS release challenge path is required.");
  let releaseChallenge;
  try { releaseChallenge = JSON.parse(await readFile(resolvedChallengePath, "utf8")); } catch { throw new Error(`Release challenge is missing or invalid: ${resolvedChallengePath}`); }
  const errors = validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision: resolvedSourceRevision, releaseChallenge });
  const resolvedInstallerPath = installerPath ?? process.env.SPS_FINAL_INSTALLER_PATH?.trim();
  if (resolvedInstallerPath) {
    let installer;
    try { installer = await readFile(resolvedInstallerPath); } catch { throw new Error(`Final installer is missing: ${resolvedInstallerPath}`); }
    const actualSha256 = createHash("sha256").update(installer).digest("hex");
    if (evidence.installer?.sizeBytes !== installer.length || evidence.installer?.sha256 !== actualSha256) {
      errors.push("Physical evidence does not describe the exact installer bytes being released.");
    }
    const escapedPath = resolvedInstallerPath.replaceAll("'", "''");
    const { stdout: signatureStatus } = await execFileAsync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-Command",
      `(Get-AuthenticodeSignature -LiteralPath '${escapedPath}').Status`,
    ], { windowsHide: true });
    if (signatureStatus.trim() !== "Valid") errors.push("The final installer Authenticode signature is not Valid.");
  }
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return resolvedEvidencePath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const evidencePath = await verifyPhysicalReleaseEvidence();
  process.stdout.write(`Verified physical SPS release evidence: ${evidencePath}\n`);
}

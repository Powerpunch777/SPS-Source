import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

export function validatePhysicalReleaseEvidence(evidence, {
  candidate,
  sourceRevision,
  now = Date.now(),
  maxAgeMs = 7 * 24 * 60 * 60 * 1000,
}) {
  const errors = [];
  if (evidence?.schemaVersion !== 1) errors.push("Physical release evidence schemaVersion must be 1.");
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
  const hostFingerprint = evidence?.devices?.hostFingerprint;
  const memberFingerprint = evidence?.devices?.memberFingerprint;
  if (!SHA256.test(hostFingerprint ?? "") || !SHA256.test(memberFingerprint ?? "")) {
    errors.push("Physical release evidence requires hashed Host and Member device fingerprints.");
  } else if (hostFingerprint === memberFingerprint) {
    errors.push("Physical release evidence must use two distinct devices.");
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
  return errors;
}

async function gitRevision() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workspaceRoot, windowsHide: true });
  return stdout.trim();
}

export async function verifyPhysicalReleaseEvidence({ evidencePath, sourceRevision, installerPath } = {}) {
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
  const errors = validatePhysicalReleaseEvidence(evidence, { candidate, sourceRevision: resolvedSourceRevision });
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

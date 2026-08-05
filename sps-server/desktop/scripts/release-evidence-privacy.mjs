import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const PUBLIC_SERVE_EVIDENCE = /^sps-candidate-serve-evidence-(\d+\.\d+\.\d+)\.json$/;
const PRIVATE_SERVE_ARTIFACTS = [
  /^sps-candidate-serve-\d{14}\.(?:out|err)\.log$/,
  /^sps-candidate-serve-smoke\.mjs$/,
  /^sps-candidate-serve-(?:capture|config|request|response|version)(?:[-.].*)?$/,
];

function isPrivateServeArtifact(name) {
  return PRIVATE_SERVE_ARTIFACTS.some((pattern) => pattern.test(name));
}

function nonLoopbackIpv4(text) {
  const matches = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
  return matches.some((value) => {
    const octets = value.split(".").map(Number);
    return octets.length === 4
      && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
      && value !== "127.0.0.1";
  });
}

export function releaseEvidencePrivacyFindings(text) {
  const source = String(text ?? "");
  const findings = [];
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(source)) findings.push("email address");
  if (/\b[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.ts\.net\b/i.test(source)) findings.push("Tailscale hostname");
  if (nonLoopbackIpv4(source)) findings.push("non-loopback IPv4 address");
  if (/(?:^|[\s"'])(?:[A-Za-z]:(?:\\\\|\\|\/)|\\\\[^\\\s]+\\)/m.test(source)) findings.push("absolute Windows path");
  return findings;
}

export function assertReleaseEvidencePrivacy(text, label = "Release evidence") {
  const findings = releaseEvidencePrivacyFindings(text);
  if (findings.length > 0) {
    throw new Error(`${label} contains private data (${findings.join(", ")}).`);
  }
}

export async function cleanObsoleteServeEvidence({ distDirectory, currentVersion, removeCurrentPublic = false }) {
  const directory = path.resolve(distDirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const removed = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const publicMatch = PUBLIC_SERVE_EVIDENCE.exec(entry.name);
    const obsoletePublicEvidence = publicMatch && (removeCurrentPublic || publicMatch[1] !== currentVersion);
    if (!obsoletePublicEvidence && !isPrivateServeArtifact(entry.name)) continue;
    await rm(path.join(directory, entry.name), { force: true });
    removed.push(entry.name);
  }
  return removed.sort();
}

export async function verifyServeEvidenceDirectoryPrivacy({ distDirectory, currentVersion }) {
  const directory = path.resolve(distDirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const errors = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith("sps-candidate-serve")) continue;
    if (isPrivateServeArtifact(entry.name)) {
      errors.push(`${entry.name}: private Serve artifact is forbidden in dist`);
      continue;
    }
    const publicMatch = PUBLIC_SERVE_EVIDENCE.exec(entry.name);
    if (!publicMatch || publicMatch[1] !== currentVersion) {
      errors.push(`${entry.name}: only the current candidate public evidence is allowed`);
      continue;
    }
    const contents = await readFile(path.join(directory, entry.name), "utf8");
    const findings = releaseEvidencePrivacyFindings(contents);
    if (findings.length > 0) errors.push(`${entry.name}: contains ${findings.join(", ")}`);
  }
  return errors;
}

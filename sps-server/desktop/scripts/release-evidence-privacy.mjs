import { readdir, readFile, rm } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";

const PUBLIC_SERVE_EVIDENCE = /^sps-candidate-serve-evidence-(\d+\.\d+\.\d+)\.json$/;
const CANDIDATE_ARTIFACT_PREFIX = "sps-candidate-";

function candidateIpAddresses(text) {
  const source = String(text ?? "");
  const ipv4 = source.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [];
  const ipv6 = source.match(/(?<![0-9A-Fa-f:])(?:[0-9A-Fa-f]{0,4}:){2,}[0-9A-Fa-f:.]*(?![0-9A-Fa-f:])/g) ?? [];
  return [...new Set([...ipv4, ...ipv6].filter((value) => isIP(value) !== 0))];
}

function isLoopbackIp(value) {
  if (isIP(value) === 4) return value.startsWith("127.");
  const normalized = value.toLowerCase();
  return normalized === "::1"
    || normalized === "0:0:0:0:0:0:0:1"
    || normalized.startsWith("::ffff:127.")
    || normalized.startsWith("0:0:0:0:0:ffff:127.");
}

export function releaseEvidencePrivacyFindings(text) {
  const source = String(text ?? "");
  const findings = [];
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(source)) findings.push("email address");
  if (/\b[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.ts\.net\b/i.test(source)) findings.push("Tailscale hostname");
  const privateAddresses = candidateIpAddresses(source).filter((value) => !isLoopbackIp(value));
  if (privateAddresses.some((value) => isIP(value) === 4)) findings.push("non-loopback IPv4 address");
  if (privateAddresses.some((value) => isIP(value) === 6)) findings.push("non-loopback IPv6 address");
  if (/(?:^|[\s"'])(?:[A-Za-z]:(?:\\\\|\\|\/)|\\\\[^\\\s]+\\)/m.test(source)) findings.push("absolute Windows path");
  return findings;
}

export function assertReleaseEvidencePrivacy(text, label = "Release evidence") {
  const findings = releaseEvidencePrivacyFindings(text);
  if (findings.length > 0) {
    throw new Error(`${label} contains private data (${findings.join(", ")}).`);
  }
}

export async function cleanObsoleteCandidateEvidence({ distDirectory, currentVersion, removeCurrentPublic = false }) {
  const directory = path.resolve(distDirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const removed = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(CANDIDATE_ARTIFACT_PREFIX)) continue;
    const publicMatch = PUBLIC_SERVE_EVIDENCE.exec(entry.name);
    const retainCurrentPublicEvidence = entry.isFile()
      && publicMatch?.[1] === currentVersion
      && !removeCurrentPublic;
    if (retainCurrentPublicEvidence) continue;
    await rm(path.join(directory, entry.name), { force: true, recursive: true });
    removed.push(entry.name);
  }
  return removed.sort();
}

export async function verifyCandidateEvidenceDirectoryPrivacy({ distDirectory, currentVersion }) {
  const directory = path.resolve(distDirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error?.code === "ENOENT") return [];
    throw error;
  });
  const errors = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(CANDIDATE_ARTIFACT_PREFIX)) continue;
    if (!entry.isFile()) {
      errors.push(`${entry.name}: candidate evidence must be a regular file`);
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

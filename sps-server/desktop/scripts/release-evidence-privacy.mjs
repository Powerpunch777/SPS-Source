import { readdir, readFile, rm } from "node:fs/promises";
import { isIP } from "node:net";
import path from "node:path";
import { TextDecoder } from "node:util";

const CANDIDATE_ARTIFACT_PREFIX = "sps-candidate-";
const UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

function isCandidateArtifactName(name) {
  return name.toLowerCase().startsWith(CANDIDATE_ARTIFACT_PREFIX);
}

function currentPublicEvidenceName(currentVersion) {
  return `sps-candidate-serve-evidence-${currentVersion}.json`;
}

function startsWithUtf8Bom(bytes) {
  return bytes.length >= UTF8_BOM.length
    && UTF8_BOM.every((value, index) => bytes[index] === value);
}

function collectJsonStrings(value, strings) {
  if (typeof value === "string") {
    strings.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, strings);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      strings.push(key);
      collectJsonStrings(item, strings);
    }
  }
}

function decodePublicEvidenceJson(bytes) {
  const offset = startsWithUtf8Bom(bytes) ? UTF8_BOM.length : 0;
  let contents;
  try {
    contents = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(offset));
  } catch {
    throw new Error("must use valid UTF-8 encoding");
  }
  if (contents.includes("\0")) throw new Error("must not contain NUL characters");
  if (contents.includes("\ufffd")) throw new Error("must not contain replacement characters");

  let document;
  try {
    document = JSON.parse(contents);
  } catch {
    throw new Error("must contain valid JSON");
  }

  const strings = [];
  collectJsonStrings(document, strings);
  if (strings.some((value) => value.includes("\0"))) {
    throw new Error("must not contain NUL characters");
  }
  if (strings.some((value) => value.includes("\ufffd"))) {
    throw new Error("must not contain replacement characters");
  }
  return strings.join("\n");
}

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
  const allowedPublicEvidence = currentPublicEvidenceName(currentVersion);
  for (const entry of entries) {
    if (!isCandidateArtifactName(entry.name)) continue;
    const retainCurrentPublicEvidence = entry.isFile()
      && entry.name === allowedPublicEvidence
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
  const allowedPublicEvidence = currentPublicEvidenceName(currentVersion);
  for (const entry of entries) {
    if (!isCandidateArtifactName(entry.name)) continue;
    if (!entry.isFile()) {
      errors.push(`${entry.name}: candidate evidence must be a regular file`);
      continue;
    }
    if (entry.name !== allowedPublicEvidence) {
      errors.push(`${entry.name}: only the current candidate public evidence is allowed`);
      continue;
    }
    try {
      const privacyText = decodePublicEvidenceJson(await readFile(path.join(directory, entry.name)));
      const findings = releaseEvidencePrivacyFindings(privacyText);
      if (findings.length > 0) errors.push(`${entry.name}: contains ${findings.join(", ")}`);
    } catch (error) {
      errors.push(`${entry.name}: ${error.message}`);
    }
  }
  return errors;
}

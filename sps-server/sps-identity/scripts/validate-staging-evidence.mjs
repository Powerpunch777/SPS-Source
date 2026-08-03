import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function validateStagingEvidence(evidence, {
  sourceRevision,
  now = Date.now(),
  maxAgeMs = 24 * 60 * 60 * 1000,
} = {}) {
  if (evidence?.schemaVersion !== 1 || evidence?.environment !== "staging" || evidence?.status !== "passed") {
    throw new Error("SPS Identity staging evidence is not a successful schema-v1 result.");
  }
  const hostname = new URL(evidence.identityUrl).hostname;
  if (!hostname.includes("staging")) throw new Error("SPS Identity evidence did not come from a staging hostname.");
  if (!sourceRevision || evidence.sourceRevision !== sourceRevision) {
    throw new Error("SPS Identity staging evidence does not match the current Source revision.");
  }
  const generatedAt = Date.parse(evidence.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > now + 5 * 60 * 1000 || now - generatedAt > maxAgeMs) {
    throw new Error("SPS Identity staging evidence is expired or has an invalid timestamp.");
  }
  const requiredChecks = ["health", "token", "tokenRetry", "refresh", "refreshRetry", "reuse", "familyRevoke", "revoke"];
  if (requiredChecks.some((check) => evidence.checks?.[check] !== true)) {
    throw new Error("SPS Identity staging evidence is missing a required smoke check.");
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const evidencePath = String(process.env.SPS_IDENTITY_STAGING_EVIDENCE ?? "").trim();
  if (!evidencePath) throw new Error("SPS_IDENTITY_STAGING_EVIDENCE is required.");
  const sourceRoot = path.resolve(process.cwd(), "..", "..");
  const sourceRevision = String(process.env.SPS_IDENTITY_SOURCE_REVISION
    ?? execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })).trim();
  const evidence = JSON.parse(await readFile(path.resolve(evidencePath), "utf8"));
  validateStagingEvidence(evidence, { sourceRevision });
  console.log(`SPS Identity staging evidence verified for ${sourceRevision}.`);
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateTailscaleServeReleaseEvidence } from "./tailscale-serve-release-evidence.mjs";
import { assertReleaseEvidencePrivacy } from "./release-evidence-privacy.mjs";

async function readJson(filePath, label) {
  try {
    return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${label} is missing or invalid: ${filePath}`);
  }
}

export async function verifyTailscaleServeEvidenceFile({
  evidencePath,
  releaseManifestPath,
  releaseChallengePath,
  requireStable = process.env.SPS_REQUIRE_STABLE_SERVE_EVIDENCE === "1",
} = {}) {
  if (requireStable) {
    throw new Error("Standalone Serve verification checks structure only. Stable status requires the signed physical release evidence verifier.");
  }
  if (!evidencePath || !releaseManifestPath || !releaseChallengePath) {
    throw new Error("Serve evidence, release manifest, and release challenge paths are required.");
  }
  const resolvedEvidencePath = path.resolve(evidencePath);
  const rawEvidence = await readFile(resolvedEvidencePath, "utf8");
  assertReleaseEvidencePrivacy(rawEvidence, "Serve evidence");
  const evidence = await readJson(resolvedEvidencePath, "Serve evidence");
  const releaseManifest = await readJson(path.resolve(releaseManifestPath), "Release manifest");
  const releaseChallenge = await readJson(path.resolve(releaseChallengePath), "Release challenge");
  const errors = validateTailscaleServeReleaseEvidence(evidence, {
    candidate: releaseManifest.baseline,
    sourceRevision: releaseManifest.baseline?.sourceRevision,
    installer: releaseManifest.artifacts?.installer,
    ownerHostRuntime: releaseManifest.ownerHostRuntime,
    releaseChallenge,
    requireStable: false,
  });
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , evidencePath, releaseManifestPath, releaseChallengePath] = process.argv;
  const evidence = await verifyTailscaleServeEvidenceFile({ evidencePath, releaseManifestPath, releaseChallengePath });
  process.stdout.write(`Verified Serve evidence structure and candidate binding only (${evidence.status}); Stable requires signed physical evidence: ${path.resolve(evidencePath)}\n`);
}

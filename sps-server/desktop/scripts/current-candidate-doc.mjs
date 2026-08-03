import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSpsSupportMatrix } from "./release-baseline.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSpsServerRoot = path.resolve(scriptDirectory, "..", "..");

function renderList(values) {
  return values.map((value) => `\`${value}\``).join(", ");
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}

export function renderCurrentCandidateDocument(matrix) {
  const errors = validateSpsSupportMatrix(matrix);
  if (errors.length > 0) throw new Error(errors.join("\n"));

  const candidate = matrix.candidate;
  const extensions = candidate.bundledExtensions
    .map((extension) => `| \`${extension.id}\` | \`${extension.version}\` | \`${extension.profile}\` | \`${extension.pluginApi}\` |`)
    .join("\n");

  return `# SPS Current Candidate

> This file is generated from [\`release/support-matrix.json\`](../../release/support-matrix.json). Do not edit it manually.

## Candidate

| Item | Value |
| --- | --- |
| Status | \`${candidate.status}\` |
| SPS Desktop | \`${candidate.desktopVersion}\` |
| SPS Core | [\`${candidate.core.revision}\`](https://github.com/${candidate.core.repository}/commit/${candidate.core.revision}) |
| Plugin SDK | \`${candidate.pluginSdk.package}@${candidate.pluginSdk.version}\` ([\`${candidate.pluginSdk.revision}\`](https://github.com/${candidate.pluginSdk.repository}/commit/${candidate.pluginSdk.revision})) |
| Extension profiles | ${renderList(candidate.extensionProfiles)} |
| Plugin API | \`${candidate.extensionProfile.pluginApi}\` |
| Operating systems | ${renderList(candidate.platform.operatingSystems)} |
| Remote transport | \`${candidate.platform.remoteTransport}\` |
| Update channel | \`${candidate.update.channel}\` from \`${candidate.update.repository}\` |

## Bundled Extensions

| ID | Version | Profile | Plugin API |
| --- | --- | --- | --- |
${extensions}

## Evidence Boundary

This document identifies the supported Desktop, Core, SDK, and extension tuple. The final SPS Source revision is fixed only by the immutable release tag and its generated \`sps-release-manifest.json\`. Physical multi-computer evidence must name that same Source revision and tuple; evidence from an older candidate cannot be reused.
`;
}

export async function syncCurrentCandidateDocument({
  spsServerRoot = defaultSpsServerRoot,
  check = false,
} = {}) {
  const matrixPath = path.join(spsServerRoot, "release", "support-matrix.json");
  const outputPath = path.join(spsServerRoot, "docs", "current", "CURRENT-CANDIDATE.md");
  const matrix = JSON.parse(await readFile(matrixPath, "utf8"));
  const expected = renderCurrentCandidateDocument(matrix);

  if (check) {
    let actual = "";
    try {
      actual = await readFile(outputPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
      throw new Error("CURRENT-CANDIDATE.md is out of date. Run current-candidate-doc.mjs.");
    }
    return outputPath;
  }

  await writeFile(outputPath, expected, "utf8");
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  await syncCurrentCandidateDocument({ check });
  process.stdout.write(`${check ? "Verified" : "Updated"} SPS current candidate document.\n`);
}

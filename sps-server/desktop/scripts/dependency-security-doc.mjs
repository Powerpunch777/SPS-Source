import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSecurityAuditPolicy } from "./security-audit.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultSpsServerRoot = path.resolve(scriptDirectory, "..", "..");

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, "\n");
}

function renderPolicyEntries(entries, emptyMessage) {
  if (entries.length === 0) return emptyMessage;
  return entries.map((entry) => (
    `- \`${entry.source}:${entry.module}\` advisory \`${entry.advisoryId}\` (${entry.severity})\n`
    + `  - Reviewed: \`${entry.reviewedOn}\`; expires: \`${entry.expiresOn}\`\n`
    + `  - Audit scopes: ${(entry.auditScopes ?? ["production", "full"]).map((scope) => `\`${scope}\``).join(", ")}\n`
    + `  - Reason: ${entry.reason}`
  )).join("\n");
}

export function renderDependencySecurityDocument(policy) {
  validateSecurityAuditPolicy(policy);
  const exceptions = renderPolicyEntries(policy.exceptions, "None.");
  const reviews = renderPolicyEntries(policy.reviews, "None.");

  return `# SPS Dependency Security Gates

> This file is generated from [\`release/security-audit-policy.json\`](../../release/security-audit-policy.json). Do not edit it manually.

## Audit Scope

SPS runs two fail-closed dependency checks:

- \`npm run audit:release\` uses \`npm audit --omit=dev\` for Desktop and \`pnpm audit --prod\` for Core, auditing dependencies classified as production dependencies.
- \`npm run audit:development\` audits the complete Desktop and Core dependency graphs, including development and build tooling and the shipped Electron runtime.

Desktop declares Electron as a \`devDependency\` for packaging, so the production audit omits it and the full-graph audit covers it. Electron is shipped to users; findings in its runtime must not be dismissed solely because of its \`devDependency\` classification.

Both checks reject command failures, malformed audit output, every unapproved \`critical\` or \`high\` advisory, every unreviewed or expired \`moderate\` advisory, and every policy entry that no longer matches an active advisory. Low findings remain visible in the audit output but do not block the build.

Policy entries may be restricted to an audit scope. A \`full\`-only build-tool review never authorizes a finding in the \`production\` audit. Expired or stale entries in the selected scope fail the gate.

Any critical/high result is scoped to the named audit. A clean result for one scope must not be shortened to "no vulnerabilities found."

## Current Critical/High Exceptions

${exceptions}

## Current Moderate Reviews

${reviews}

## CI Contract

Verification, pilot, beta, and Stable workflows run both audit scopes and check this generated document; release workflows run these gates before packaging. A dependency update that changes the policy or active finding set must update the policy, regenerate this document, and pass both gates.

\`SPS-Source\` Actions need \`SPS_SOURCE_READ_TOKEN\` to check out the private \`SPS-Core\` submodule. Before a wider beta, use a fine-grained token limited to read-only Contents access for the required private repositories.
`;
}

export async function syncDependencySecurityDocument({
  spsServerRoot = defaultSpsServerRoot,
  check = false,
} = {}) {
  const policyPath = path.join(spsServerRoot, "release", "security-audit-policy.json");
  const outputPath = path.join(spsServerRoot, "docs", "current", "DEPENDENCY-SECURITY.md");
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const expected = renderDependencySecurityDocument(policy);

  if (check) {
    let actual = "";
    try {
      actual = await readFile(outputPath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
      throw new Error("DEPENDENCY-SECURITY.md is out of date. Run dependency-security-doc.mjs.");
    }
    return outputPath;
  }

  await writeFile(outputPath, expected, "utf8");
  return outputPath;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  await syncDependencySecurityDocument({ check });
  process.stdout.write(`${check ? "Verified" : "Updated"} SPS dependency security document.\n`);
}

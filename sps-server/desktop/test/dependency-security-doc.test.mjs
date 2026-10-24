import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  renderDependencySecurityDocument,
  syncDependencySecurityDocument,
} from "../scripts/dependency-security-doc.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const repositoryRoot = path.resolve(spsServerRoot, "..");

function workflowRunCommands(workflow) {
  const document = yaml.load(workflow);
  return Object.values(document.jobs).flatMap((job) => (job.steps ?? [])
    .flatMap((step) => typeof step.run === "string" ? step.run.split(/\r?\n/).map((line) => line.trim()) : []));
}

function assertPolicyEntriesIncluded(document, entries) {
  for (const entry of entries) {
    for (const value of [
      `${entry.source}:${entry.module}`,
      entry.advisoryId,
      entry.severity,
      entry.reviewedOn,
      entry.expiresOn,
      entry.reason,
      ...(entry.auditScopes ?? []),
    ]) {
      assert.ok(document.includes(value), `generated document omits policy value: ${value}`);
    }
  }
}

test("keeps dependency security documentation synchronized with policy", async () => {
  await syncDependencySecurityDocument({ spsServerRoot, check: true });
});

test("documents production and full-graph scopes without dismissing shipped Electron findings", async () => {
  const policy = JSON.parse(await readFile(path.join(spsServerRoot, "release", "security-audit-policy.json"), "utf8"));
  const document = renderDependencySecurityDocument(policy);
  assert.match(document, /npm run audit:release/);
  assert.match(document, /npm audit --omit=dev/);
  assert.match(document, /pnpm audit --prod/);
  assert.match(document, /npm run audit:development/);
  assert.match(document, /development and build tooling and the shipped Electron runtime/);
  assert.match(document, /Electron is shipped to users; findings in its runtime must not be dismissed solely/);
  assert.match(document, /production audit omits it and the full-graph audit covers it/);
  assert.match(document, /scoped to the named audit/);
  assertPolicyEntriesIncluded(document, policy.exceptions);
  assertPolicyEntriesIncluded(document, policy.reviews);
  if (policy.exceptions.length === 0) {
    assert.match(document, /## Current Critical\/High Exceptions\n\nNone\./);
  }
});

test("renders critical/high exceptions from policy JSON", async () => {
  const policy = JSON.parse(await readFile(path.join(spsServerRoot, "release", "security-audit-policy.json"), "utf8"));
  policy.exceptions.push({
    source: "desktop",
    advisoryId: "regression-example",
    module: "electron",
    severity: "high",
    reviewedOn: "2026-10-01",
    expiresOn: "2026-12-31",
    reason: "Regression fixture proving exceptions are rendered from policy data.",
  });

  const document = renderDependencySecurityDocument(policy);
  assertPolicyEntriesIncluded(document, policy.exceptions);
});

test("keeps the four SPS CI workflows wired to both audits and the document check", async () => {
  const workflows = [
    "sps-verify.yml",
    "sps-desktop-release.yml",
    "sps-desktop-beta-release.yml",
    "sps-desktop-pilot.yml",
  ];

  for (const workflowName of workflows) {
    const workflowPath = path.join(repositoryRoot, ".github", "workflows", workflowName);
    const commands = workflowRunCommands(await readFile(workflowPath, "utf8"));
    const releaseAudit = commands.indexOf("npm run audit:release");
    const developmentAudit = commands.indexOf("npm run audit:development");
    const documentCheck = commands.indexOf("npm run docs:security:check");

    assert.notEqual(releaseAudit, -1, `${workflowName} must run the production audit`);
    assert.notEqual(developmentAudit, -1, `${workflowName} must run the full-graph audit`);
    assert.notEqual(documentCheck, -1, `${workflowName} must check the generated security document`);
    assert.ok(
      releaseAudit < developmentAudit && developmentAudit < documentCheck,
      `${workflowName} must run production audit, full-graph audit, then the document check`,
    );
  }
});

test("check mode rejects stale documentation and accepts equivalent CRLF", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-security-doc-"));
  try {
    await mkdir(path.join(root, "release"), { recursive: true });
    await mkdir(path.join(root, "docs", "current"), { recursive: true });
    const policyText = await readFile(path.join(spsServerRoot, "release", "security-audit-policy.json"), "utf8");
    await writeFile(path.join(root, "release", "security-audit-policy.json"), policyText, "utf8");
    const outputPath = path.join(root, "docs", "current", "DEPENDENCY-SECURITY.md");
    await writeFile(outputPath, "stale\n", "utf8");
    await assert.rejects(
      () => syncDependencySecurityDocument({ spsServerRoot: root, check: true }),
      /out of date/,
    );

    const expected = renderDependencySecurityDocument(JSON.parse(policyText));
    await writeFile(outputPath, expected.replace(/\n/g, "\r\n"), "utf8");
    await syncDependencySecurityDocument({ spsServerRoot: root, check: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

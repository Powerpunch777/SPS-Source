import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const workspaceRoot = path.resolve(spsServerRoot, "..");
const coreRoot = path.join(workspaceRoot, "external", "sps-core");
const policyPath = path.join(spsServerRoot, "release", "security-audit-policy.json");

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateAuditReport(report, command) {
  if (!isRecord(report) || report.error) {
    throw new Error(`${command} audit returned an error or malformed JSON report.`);
  }
  const reportKey = command === "npm" ? "vulnerabilities" : "advisories";
  if (!Object.prototype.hasOwnProperty.call(report, reportKey) || !isRecord(report[reportKey])) {
    throw new Error(`${command} audit returned an invalid JSON report.`);
  }
  return report;
}

function auditFindingCount(report, command) {
  const reportKey = command === "npm" ? "vulnerabilities" : "advisories";
  return Object.keys(report[reportKey]).length;
}

export async function runAudit(command, args, cwd, { exec = execFileAsync } = {}) {
  const auditCommand = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : command;
  const auditArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", `${command} ${args.join(" ")}`]
    : args;
  let result;
  try {
    result = await exec(auditCommand, auditArgs, {
      cwd,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    const stdout = error?.stdout ?? "";
    if (stdout) {
      try {
        const report = validateAuditReport(JSON.parse(stdout), command);
        // Audit CLIs intentionally exit nonzero when a valid report contains findings.
        if (auditFindingCount(report, command) > 0) return report;
      } catch {
        // Fall through to the command failure below.
      }
    }
    const status = error?.code != null ? ` (exit ${error.code})` : "";
    throw new Error(`${command} audit command failed${status}: ${error?.message ?? "unknown execution error"}`, {
      cause: error,
    });
  }
  const stdout = result?.stdout ?? "";
  try {
    return validateAuditReport(JSON.parse(stdout), command);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${command} audit did not return valid JSON.`, { cause: error });
    }
    throw error;
  }
}

export function findingsFromNpmAudit(report, source = "desktop") {
  const findings = [];
  for (const [module, vulnerability] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of vulnerability?.via ?? []) {
      if (!via || typeof via === "string" || via.source == null) continue;
      findings.push({
        source,
        advisoryId: String(via.source),
        module,
        severity: via.severity ?? vulnerability.severity,
        title: via.title ?? module,
      });
    }
  }
  return findings;
}

export function findingsFromPnpmAudit(report, source = "core") {
  return Object.entries(report?.advisories ?? {}).map(([advisoryId, advisory]) => ({
    source,
    advisoryId: String(advisoryId),
    module: advisory.module_name,
    severity: advisory.severity,
    title: advisory.title,
  }));
}

function validatePolicy(policy) {
  if (policy?.schemaVersion !== 2) throw new Error("Security audit policy schemaVersion must be 2.");
  if (!Array.isArray(policy.blockSeverities) || policy.blockSeverities.length === 0) {
    throw new Error("Security audit policy must define blocked severities.");
  }
  if (!Array.isArray(policy.reviewSeverities) || policy.reviewSeverities.length === 0) {
    throw new Error("Security audit policy must define reviewed severities.");
  }
  if (!Array.isArray(policy.exceptions)) throw new Error("Security audit policy exceptions must be an array.");
  if (!Array.isArray(policy.reviews)) throw new Error("Security audit policy reviews must be an array.");
}

function matchingPolicyEntry(entries, finding) {
  return entries.find((candidate) => (
    candidate.source === finding.source
    && candidate.advisoryId === finding.advisoryId
    && candidate.module === finding.module
    && candidate.severity === finding.severity
  ));
}

function expiryRejection(entry, now, label) {
  const expiresAt = Date.parse(`${entry.expiresOn}T23:59:59.999Z`);
  if (!Number.isFinite(expiresAt)) return `${label} has an invalid expiry date`;
  if (expiresAt < now.getTime()) return `${label} expired on ${entry.expiresOn}`;
  return null;
}

export function evaluateSecurityAudit({ findings, policy, now = new Date() }) {
  validatePolicy(policy);
  const blockedSeverities = new Set(policy.blockSeverities);
  const blocked = findings.filter((finding) => blockedSeverities.has(finding.severity));
  const approved = [];
  const rejected = [];

  for (const finding of blocked) {
    const exception = matchingPolicyEntry(policy.exceptions, finding);
    if (!exception) {
      rejected.push({ finding, reason: "no approved exception" });
      continue;
    }
    const expiryReason = expiryRejection(exception, now, "exception");
    if (expiryReason) {
      rejected.push({ finding, reason: expiryReason });
      continue;
    }
    approved.push({ finding, exception });
  }

  const reviewSeverities = new Set(policy.reviewSeverities);
  const reviewRequired = findings.filter((finding) => reviewSeverities.has(finding.severity));
  const reviewed = [];
  const reviewRejected = [];
  for (const finding of reviewRequired) {
    const review = matchingPolicyEntry(policy.reviews, finding);
    if (!review) {
      reviewRejected.push({ finding, reason: "no current path review" });
      continue;
    }
    const expiryReason = expiryRejection(review, now, "review");
    if (expiryReason) {
      reviewRejected.push({ finding, reason: expiryReason });
      continue;
    }
    reviewed.push({ finding, review });
  }

  const activeKeys = new Set(blocked.map((finding) => `${finding.source}:${finding.advisoryId}:${finding.module}`));
  const staleExceptions = policy.exceptions.filter((exception) => (
    !activeKeys.has(`${exception.source}:${exception.advisoryId}:${exception.module}`)
  ));
  const activeReviewKeys = new Set(reviewRequired.map((finding) => `${finding.source}:${finding.advisoryId}:${finding.module}`));
  const staleReviews = policy.reviews.filter((review) => (
    !activeReviewKeys.has(`${review.source}:${review.advisoryId}:${review.module}`)
  ));
  return { blocked, approved, rejected, reviewRequired, reviewed, reviewRejected, staleExceptions, staleReviews };
}

export async function runSpsSecurityAudit({ now = new Date() } = {}) {
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const [desktopReport, coreReport] = await Promise.all([
    runAudit("npm", ["audit", "--omit=dev", "--json"], desktopRoot),
    runAudit("pnpm", ["audit", "--prod", "--json"], coreRoot),
  ]);
  const findings = [
    ...findingsFromNpmAudit(desktopReport),
    ...findingsFromPnpmAudit(coreReport),
  ];
  const result = evaluateSecurityAudit({ findings, policy, now });

  process.stdout.write(`SPS dependency audit: ${findings.length} advisories, ${result.blocked.length} critical/high.\n`);
  for (const { finding, exception } of result.approved) {
    process.stdout.write(`EXCEPTED ${finding.severity} ${finding.source}:${finding.module} ${finding.advisoryId} until ${exception.expiresOn}.\n`);
  }
  for (const { finding, review } of result.reviewed) {
    process.stdout.write(`REVIEWED ${finding.severity} ${finding.source}:${finding.module} ${finding.advisoryId} until ${review.expiresOn}.\n`);
  }
  for (const exception of result.staleExceptions) {
    process.stdout.write(`STALE EXCEPTION ${exception.source}:${exception.module} ${exception.advisoryId}.\n`);
  }
  for (const review of result.staleReviews) {
    process.stdout.write(`STALE REVIEW ${review.source}:${review.module} ${review.advisoryId}.\n`);
  }
  const rejected = [...result.rejected, ...result.reviewRejected];
  if (rejected.length > 0) {
    const details = rejected.map(({ finding, reason }) => (
      `${finding.severity} ${finding.source}:${finding.module} ${finding.advisoryId}: ${finding.title} (${reason})`
    ));
    throw new Error(`SPS dependency security gate failed:\n${details.join("\n")}`);
  }
  return { findings, ...result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runSpsSecurityAudit();
}

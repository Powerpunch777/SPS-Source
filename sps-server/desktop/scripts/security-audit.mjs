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

const allowedSeverities = new Set(["critical", "high", "moderate", "low", "info"]);
const allowedAuditScopes = new Set(["production", "full"]);

function policyIdentity(entry) {
  return `${entry.source}\u0000${entry.advisoryId}\u0000${entry.module}`;
}

function requireNonEmptyString(value, field, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label}.${field} must be a non-empty string.`);
  }
}

function requireStrictDate(value, field, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label}.${field} must use YYYY-MM-DD.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new Error(`${label}.${field} is not a valid calendar date.`);
  }
}

function validateSeverityList(value, field) {
  if (!Array.isArray(value) || value.length === 0 || value.some((severity) => (
    typeof severity !== "string" || !allowedSeverities.has(severity)
  ))) {
    throw new Error(`Security audit policy ${field} must contain only known severities.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`Security audit policy ${field} must not contain duplicate severities.`);
  }
  return new Set(value);
}

function validatePolicyEntries(entries, label, allowedSeveritySet) {
  const identities = new Set();
  for (const [index, entry] of entries.entries()) {
    const entryLabel = `${label}[${index}]`;
    if (!isRecord(entry)) throw new Error(`${entryLabel} must be an object.`);
    if (entry.auditScopes !== undefined && (
      !Array.isArray(entry.auditScopes) || entry.auditScopes.length === 0
      || entry.auditScopes.some((scope) => !allowedAuditScopes.has(scope))
      || new Set(entry.auditScopes).size !== entry.auditScopes.length
    )) {
      throw new Error(`${entryLabel}.auditScopes must contain unique production or full scopes.`);
    }
    for (const field of ["source", "advisoryId", "module", "severity", "reason"]) {
      requireNonEmptyString(entry[field], field, entryLabel);
    }
    if (!allowedSeverities.has(entry.severity)) {
      throw new Error(`${entryLabel}.severity is not a known severity.`);
    }
    if (!allowedSeveritySet.has(entry.severity)) {
      throw new Error(`${entryLabel}.severity conflicts with its policy severity list.`);
    }
    requireStrictDate(entry.reviewedOn, "reviewedOn", entryLabel);
    requireStrictDate(entry.expiresOn, "expiresOn", entryLabel);
    if (entry.reviewedOn > entry.expiresOn) {
      throw new Error(`${entryLabel}.reviewedOn must not be after expiresOn.`);
    }
    const identity = policyIdentity(entry);
    if (identities.has(identity)) {
      throw new Error(`${entryLabel} duplicates policy identity ${identity.replaceAll("\u0000", ":")}.`);
    }
    identities.add(identity);
  }
  return identities;
}

export function validateSecurityAuditPolicy(policy) {
  if (!isRecord(policy) || policy.schemaVersion !== 2) {
    throw new Error("Security audit policy schemaVersion must be 2.");
  }
  if (!Array.isArray(policy.exceptions)) throw new Error("Security audit policy exceptions must be an array.");
  if (!Array.isArray(policy.reviews)) throw new Error("Security audit policy reviews must be an array.");
  const blockedSeverities = validateSeverityList(policy.blockSeverities, "blockSeverities");
  const reviewSeverities = validateSeverityList(policy.reviewSeverities, "reviewSeverities");
  for (const severity of blockedSeverities) {
    if (reviewSeverities.has(severity)) {
      throw new Error(`Security audit policy severity ${severity} cannot be both blocked and reviewed.`);
    }
  }
  const exceptionIdentities = validatePolicyEntries(policy.exceptions, "exceptions", blockedSeverities);
  const reviewIdentities = validatePolicyEntries(policy.reviews, "reviews", reviewSeverities);
  for (const identity of exceptionIdentities) {
    if (reviewIdentities.has(identity)) {
      throw new Error(`Security audit policy identity ${identity.replaceAll("\u0000", ":")} cannot be both an exception and a review.`);
    }
  }
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
  const today = now.toISOString().slice(0, 10);
  if (entry.reviewedOn > today) return `${label} is not active until ${entry.reviewedOn}`;
  if (entry.expiresOn < today) return `${label} expired on ${entry.expiresOn}`;
  return null;
}

export function evaluateSecurityAudit({ findings, policy, now = new Date(), auditScope = "production" }) {
  validateSecurityAuditPolicy(policy);
  if (!allowedAuditScopes.has(auditScope)) throw new Error("Unknown security audit scope.");
  const applies = (entry) => entry.auditScopes === undefined || entry.auditScopes.includes(auditScope);
  const exceptions = policy.exceptions.filter(applies);
  const reviews = policy.reviews.filter(applies);
  const blockedSeverities = new Set(policy.blockSeverities);
  const blocked = findings.filter((finding) => blockedSeverities.has(finding.severity));
  const approved = [];
  const rejected = [];

  for (const finding of blocked) {
    const exception = matchingPolicyEntry(exceptions, finding);
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
    const review = matchingPolicyEntry(reviews, finding);
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
  const staleExceptions = exceptions.filter((exception) => (
    !activeKeys.has(`${exception.source}:${exception.advisoryId}:${exception.module}`)
  ));
  const activeReviewKeys = new Set(reviewRequired.map((finding) => `${finding.source}:${finding.advisoryId}:${finding.module}`));
  const staleReviews = reviews.filter((review) => (
    !activeReviewKeys.has(`${review.source}:${review.advisoryId}:${review.module}`)
  ));
  return { blocked, approved, rejected, reviewRequired, reviewed, reviewRejected, staleExceptions, staleReviews };
}

export function securityAuditRejections(result) {
  return [
    ...result.rejected,
    ...result.reviewRejected,
    ...result.staleExceptions.map((finding) => ({
      finding,
      reason: "stale exception no longer matches an active advisory",
    })),
    ...result.staleReviews.map((finding) => ({
      finding,
      reason: "stale review no longer matches an active advisory",
    })),
  ];
}

export async function runSpsSecurityAudit({ now = new Date(), includeDevelopment = false } = {}) {
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  const npmArgs = includeDevelopment
    ? ["audit", "--json"]
    : ["audit", "--omit=dev", "--json"];
  const pnpmArgs = includeDevelopment
    ? ["audit", "--json"]
    : ["audit", "--prod", "--json"];
  const [desktopReport, coreReport] = await Promise.all([
    runAudit("npm", npmArgs, desktopRoot),
    runAudit("pnpm", pnpmArgs, coreRoot),
  ]);
  const findings = [
    ...findingsFromNpmAudit(desktopReport),
    ...findingsFromPnpmAudit(coreReport),
  ];
  const result = evaluateSecurityAudit({ findings, policy, now, auditScope: includeDevelopment ? "full" : "production" });

  const auditScope = includeDevelopment ? "full graph (production, development/build, shipped Electron)" : "production";
  process.stdout.write(`SPS ${auditScope} dependency audit: ${findings.length} advisories, ${result.blocked.length} critical/high.\n`);
  for (const finding of findings.filter((item) => !policy.blockSeverities.includes(item.severity) && !policy.reviewSeverities.includes(item.severity))) {
    process.stdout.write(`REPORTED ${finding.severity} ${finding.source}:${finding.module} ${finding.advisoryId}: ${finding.title}.\n`);
  }
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
  const rejected = securityAuditRejections(result);
  if (rejected.length > 0) {
    const details = rejected.map(({ finding, reason }) => (
      `${finding.severity} ${finding.source}:${finding.module} ${finding.advisoryId}: ${finding.title} (${reason})`
    ));
    throw new Error(`SPS dependency security gate failed:\n${details.join("\n")}`);
  }
  return { findings, ...result };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runSpsSecurityAudit({ includeDevelopment: process.argv.includes("--include-development") });
}

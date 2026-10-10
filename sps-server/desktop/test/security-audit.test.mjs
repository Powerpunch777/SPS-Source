import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSecurityAudit,
  findingsFromNpmAudit,
  findingsFromPnpmAudit,
  runAudit,
  securityAuditRejections,
} from "../scripts/security-audit.mjs";

const basePolicy = {
  schemaVersion: 2,
  blockSeverities: ["critical", "high"],
  reviewSeverities: ["moderate"],
  exceptions: [{
    source: "core",
    advisoryId: "123",
    module: "router",
    severity: "high",
    reviewedOn: "2026-08-01",
    expiresOn: "2026-09-30",
    reason: "Test-only exception.",
  }],
  reviews: [{
    source: "core",
    advisoryId: "456",
    module: "http-server",
    severity: "moderate",
    reviewedOn: "2026-08-01",
    expiresOn: "2026-09-30",
    reason: "Affected server path is not used.",
  }],
};

test("normalizes npm and pnpm audit reports", () => {
  assert.deepEqual(findingsFromNpmAudit({ vulnerabilities: {
    tar: { severity: "critical", via: [{ source: 99, severity: "critical", title: "unsafe archive" }] },
  } }), [{ source: "desktop", advisoryId: "99", module: "tar", severity: "critical", title: "unsafe archive" }]);
  assert.deepEqual(findingsFromPnpmAudit({ advisories: {
    123: { module_name: "router", severity: "high", title: "RSC issue" },
  } }), [{ source: "core", advisoryId: "123", module: "router", severity: "high", title: "RSC issue" }]);
});

test("accepts only an exact, non-expired critical or high exception", () => {
  const finding = { source: "core", advisoryId: "123", module: "router", severity: "high", title: "RSC issue" };
  const accepted = evaluateSecurityAudit({ findings: [finding], policy: basePolicy, now: new Date("2026-08-02T00:00:00Z") });
  assert.equal(accepted.approved.length, 1);
  assert.equal(accepted.rejected.length, 0);

  const expired = evaluateSecurityAudit({ findings: [finding], policy: basePolicy, now: new Date("2026-10-01T00:00:00Z") });
  assert.equal(expired.approved.length, 0);
  assert.match(expired.rejected[0].reason, /expired/);

  const wrongModule = evaluateSecurityAudit({ findings: [{ ...finding, module: "other" }], policy: basePolicy });
  assert.equal(wrongModule.rejected.length, 1);
});

test("rejects a new critical or high advisory and reports stale exceptions", () => {
  const result = evaluateSecurityAudit({
    findings: [{ source: "desktop", advisoryId: "999", module: "archive", severity: "critical", title: "new issue" }],
    policy: basePolicy,
  });
  assert.equal(result.rejected.length, 1);
  assert.equal(result.staleExceptions.length, 1);
  const rejected = securityAuditRejections(result);
  assert.equal(rejected.length, 3);
  assert.match(rejected[1].reason, /stale exception/);
  assert.match(rejected[2].reason, /stale review/);
});

test("fails the gate when obsolete exceptions or reviews remain in policy", () => {
  const result = evaluateSecurityAudit({ findings: [], policy: basePolicy });
  const rejected = securityAuditRejections(result);
  assert.equal(rejected.length, 2);
  assert.match(rejected[0].reason, /stale exception/);
  assert.match(rejected[1].reason, /stale review/);
});

test("requires an exact, current review for moderate advisories", () => {
  const finding = { source: "core", advisoryId: "456", module: "http-server", severity: "moderate", title: "path issue" };
  const accepted = evaluateSecurityAudit({ findings: [finding], policy: basePolicy, now: new Date("2026-08-03T00:00:00Z") });
  assert.equal(accepted.reviewed.length, 1);
  assert.equal(accepted.reviewRejected.length, 0);

  const missing = evaluateSecurityAudit({ findings: [{ ...finding, advisoryId: "new" }], policy: basePolicy });
  assert.match(missing.reviewRejected[0].reason, /no current path review/);

  const expired = evaluateSecurityAudit({ findings: [finding], policy: basePolicy, now: new Date("2026-10-01T00:00:00Z") });
  assert.match(expired.reviewRejected[0].reason, /expired/);
});

test("rejects missing, blank, malformed, or impossible policy dates and reasons", () => {
  const finding = { source: "core", advisoryId: "123", module: "router", severity: "high", title: "RSC issue" };
  for (const mutate of [
    (policy) => { delete policy.exceptions[0].reason; },
    (policy) => { policy.exceptions[0].reason = "   "; },
    (policy) => { policy.exceptions[0].reviewedOn = "2026-8-01"; },
    (policy) => { policy.exceptions[0].reviewedOn = "2026-02-30"; },
    (policy) => { policy.exceptions[0].expiresOn = "2026-09-31"; },
    (policy) => { policy.exceptions[0].reviewedOn = "2026-10-01"; },
  ]) {
    const policy = structuredClone(basePolicy);
    mutate(policy);
    assert.throws(() => evaluateSecurityAudit({ findings: [finding], policy }), /policy|exceptions/);
  }
});

test("rejects duplicate identities, cross-list conflicts, and severity conflicts", () => {
  const duplicate = structuredClone(basePolicy);
  duplicate.exceptions.push({ ...duplicate.exceptions[0], severity: "critical" });
  assert.throws(() => evaluateSecurityAudit({ findings: [], policy: duplicate }), /duplicates policy identity/);

  const crossList = structuredClone(basePolicy);
  crossList.reviews.push({ ...crossList.exceptions[0], severity: "moderate" });
  assert.throws(() => evaluateSecurityAudit({ findings: [], policy: crossList }), /both an exception and a review/);

  const exceptionSeverity = structuredClone(basePolicy);
  exceptionSeverity.exceptions[0].severity = "moderate";
  assert.throws(() => evaluateSecurityAudit({ findings: [], policy: exceptionSeverity }), /conflicts with its policy severity list/);

  const overlap = structuredClone(basePolicy);
  overlap.reviewSeverities.push("high");
  assert.throws(() => evaluateSecurityAudit({ findings: [], policy: overlap }), /both blocked and reviewed/);
});

test("rejects a review that is not active yet", () => {
  const policy = structuredClone(basePolicy);
  policy.reviews[0].reviewedOn = "2026-08-04";
  const result = evaluateSecurityAudit({
    findings: [{ source: "core", advisoryId: "456", module: "http-server", severity: "moderate", title: "path issue" }],
    policy,
    now: new Date("2026-08-03T00:00:00Z"),
  });
  assert.match(result.reviewRejected[0].reason, /not active/);
});

test("full-only reviews never authorize production findings and remain expiry-bound", () => {
  const finding = { source: "core", advisoryId: "456", module: "http-server", severity: "moderate", title: "path issue" };
  const policy = { ...structuredClone(basePolicy), exceptions: [] };
  policy.reviews[0].auditScopes = ["full"];
  const now = new Date("2026-08-03T00:00:00Z");
  const evaluate = (findings, auditScope, date = now) => evaluateSecurityAudit({ findings, policy, now: date, auditScope });
  assert.equal(securityAuditRejections(evaluate([], "production")).length, 0);
  assert.match(evaluate([finding], "production").reviewRejected[0].reason, /no current path review/);
  assert.equal(securityAuditRejections(evaluate([finding], "full")).length, 0);
  assert.equal(evaluate([], "full").staleReviews.length, 1);
  assert.match(evaluate([finding], "full", new Date("2026-10-01")).reviewRejected[0].reason, /expired/);
  assert.throws(() => evaluate([], "unknown"), /Unknown security audit scope/);
  for (const auditScopes of [[], ["full", "full"], ["unknown"], "full"]) {
    policy.reviews[0].auditScopes = auditScopes;
    assert.throws(() => evaluate([], "full"), /auditScopes/);
  }
});

test("rejects a nonzero audit command even when it writes valid-looking JSON", async () => {
  await assert.rejects(
    runAudit("npm", ["audit", "--json"], ".", {
      exec: async () => {
        const error = new Error("audit failed after producing output");
        error.code = 1;
        error.stdout = JSON.stringify({ vulnerabilities: {} });
        throw error;
      },
    }),
    /npm audit command failed \(exit 1\)/,
  );
});

test("accepts a nonzero audit command only when it carries real findings", async () => {
  const report = { advisories: {
    123: { module_name: "router", severity: "high", title: "RSC issue" },
  } };
  assert.deepEqual(
    await runAudit("pnpm", ["audit", "--json"], ".", {
      exec: async () => {
        const error = new Error("audit found vulnerabilities");
        error.code = 1;
        error.stdout = JSON.stringify(report);
        throw error;
      },
    }),
    report,
  );
});

test("rejects malformed and error-only audit JSON", async () => {
  await assert.rejects(
    runAudit("npm", ["audit", "--json"], ".", {
      exec: async () => ({ stdout: "not-json" }),
    }),
    /npm audit did not return valid JSON/,
  );
  await assert.rejects(
    runAudit("pnpm", ["audit", "--json"], ".", {
      exec: async () => ({ stdout: JSON.stringify({ error: "registry unavailable" }) }),
    }),
    /pnpm audit returned an error or malformed JSON report/,
  );
});

test("rejects a spawn failure instead of treating missing output as a passing audit", async () => {
  await assert.rejects(
    runAudit("pnpm", ["audit", "--json"], ".", {
      exec: async () => {
        const error = new Error("spawn pnpm ENOENT");
        error.code = "ENOENT";
        throw error;
      },
    }),
    /pnpm audit command failed \(exit ENOENT\)/,
  );
});

test("preserves valid npm and pnpm audit reports", async () => {
  assert.deepEqual(
    await runAudit("npm", ["audit", "--json"], ".", {
      exec: async () => ({ stdout: JSON.stringify({ vulnerabilities: {} }) }),
    }),
    { vulnerabilities: {} },
  );
  assert.deepEqual(
    await runAudit("pnpm", ["audit", "--json"], ".", {
      exec: async () => ({ stdout: JSON.stringify({ advisories: {} }) }),
    }),
    { advisories: {} },
  );
});

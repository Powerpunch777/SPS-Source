import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateSecurityAudit,
  findingsFromNpmAudit,
  findingsFromPnpmAudit,
  runAudit,
} from "../scripts/security-audit.mjs";

const basePolicy = {
  schemaVersion: 1,
  blockSeverities: ["critical", "high"],
  exceptions: [{
    source: "core",
    advisoryId: "123",
    module: "router",
    severity: "high",
    expiresOn: "2026-09-30",
    reason: "Test-only exception.",
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

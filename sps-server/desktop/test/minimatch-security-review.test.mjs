import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { evaluateSecurityAudit, securityAuditRejections } from "../scripts/security-audit.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const inputs = [
  ["sps-server/desktop/package-lock.json", "9e93c854ef5511ff80ceff7abc268f790329ca8b2c536772a2ffc9d00dd442c1"],
  ["external/sps-core/pnpm-lock.yaml", "aa35d51a0a861e44f43e7671a9edcfcea84aa981844bf05c699342ac2c585aec"],
];

test("the temporary minimatch path review is bound to the inspected dependency graphs", async () => {
  for (const [relative, expected] of inputs) {
    const text = (await readFile(path.join(root, relative), "utf8")).replace(/\r\n?/g, "\n");
    assert.equal(createHash("sha256").update(text).digest("hex"), expected,
      `Re-review minimatch call paths after changing ${relative}; do not merely renew the expiry.`);
  }
});

test("minimatch review expires after one week and never authorizes a Desktop production finding", async () => {
  const policy = JSON.parse(await readFile(path.join(root, "sps-server/release/security-audit-policy.json"), "utf8"));
  const finding = source => ({ source, advisoryId: "1244012", module: "minimatch", severity: "moderate", title: "globparts amplification" });
  const reviewedPolicy = { ...policy, reviews: policy.reviews.filter(review => review.advisoryId === "1244012") };
  assert.equal(reviewedPolicy.reviews.length, 2);
  assert.equal(policy.exceptions.length, 0);
  for (const entry of reviewedPolicy.reviews) assert.equal(entry.expiresOn, "2026-11-07");
  const run = (source, auditScope, date) => evaluateSecurityAudit({ findings: [finding(source)],
    policy: { ...reviewedPolicy, reviews: reviewedPolicy.reviews.filter(review => review.source === source) },
    auditScope, now: new Date(date) });
  assert.equal(securityAuditRejections(run("core", "production", "2026-10-31")).length, 0);
  assert.equal(securityAuditRejections(run("desktop", "full", "2026-10-31")).length, 0);
  assert.ok(securityAuditRejections(run("desktop", "production", "2026-10-31")).length > 0);
  assert.ok(securityAuditRejections(run("core", "full", "2026-11-08")).length > 0);
});

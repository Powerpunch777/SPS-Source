import { createHash } from "node:crypto";
import path from "node:path";

const HISTORICAL_TIMESTAMP = "2026-07-01T12:34:56.789Z";
const OWNER_PRINCIPAL_ID = `sps_identity_${createHash("sha256").update("sps-desktop-e2e-owner").digest("base64url")}`;

export const HISTORICAL_CORE_FIXTURE_IDS = Object.freeze({
  company: "10000000-0000-4000-8000-000000000001",
  secondCompany: "10000000-0000-4000-8000-000000000002",
  project: "20000000-0000-4000-8000-000000000001",
  secondProject: "20000000-0000-4000-8000-000000000002",
  membership: "30000000-0000-4000-8000-000000000001",
  secondMembership: "30000000-0000-4000-8000-000000000002",
});

export const HISTORICAL_CORE_FIXTURE_ATTACHMENT = Object.freeze({
  relativePath: path.join("storage", "historical-main-attachment.txt"),
  content: Buffer.from("historical main transfer fixture attachment\n", "utf8"),
});

export async function seedHistoricalCoreFixtureRecords(sql) {
  await sql.begin(async tx => {
    for (const [companyId, suffix, issuePrefix] of [
      [HISTORICAL_CORE_FIXTURE_IDS.company, "A", "HTA"],
      [HISTORICAL_CORE_FIXTURE_IDS.secondCompany, "B", "HTB"],
    ]) {
      await tx`INSERT INTO companies (id, name, issue_prefix, created_at, updated_at)
        VALUES (${companyId}, ${`Historical transfer Workspace ${suffix}`}, ${issuePrefix}, ${HISTORICAL_TIMESTAMP}, ${HISTORICAL_TIMESTAMP})`;
    }
    for (const [projectId, companyId, suffix] of [
      [HISTORICAL_CORE_FIXTURE_IDS.project, HISTORICAL_CORE_FIXTURE_IDS.company, "A"],
      [HISTORICAL_CORE_FIXTURE_IDS.secondProject, HISTORICAL_CORE_FIXTURE_IDS.secondCompany, "B"],
    ]) {
      await tx`INSERT INTO projects (id, company_id, name, description, env, created_at, updated_at)
        VALUES (${projectId}, ${companyId}, ${`Historical Project ${suffix}`}, ${"Retained Unicode description: \uD55C\uAE00, caf\u00E9, \u6771\u4EAC"},
          ${tx.json({ FIXTURE_VALUE: `historical-${suffix}`, REGION: "\uC11C\uC6B8" })}, ${HISTORICAL_TIMESTAMP}, ${HISTORICAL_TIMESTAMP})`;
    }
    for (const [membershipId, companyId] of [
      [HISTORICAL_CORE_FIXTURE_IDS.membership, HISTORICAL_CORE_FIXTURE_IDS.company],
      [HISTORICAL_CORE_FIXTURE_IDS.secondMembership, HISTORICAL_CORE_FIXTURE_IDS.secondCompany],
    ]) {
      await tx`INSERT INTO company_memberships
        (id, company_id, principal_type, principal_id, status, membership_role, created_at, updated_at)
        VALUES (${membershipId}, ${companyId}, 'user', ${OWNER_PRINCIPAL_ID}, 'active', 'operator',
          ${HISTORICAL_TIMESTAMP}, ${HISTORICAL_TIMESTAMP})`;
    }
  });
}

export function historicalCoreFixtureRecords() {
  return {
    company: { id: HISTORICAL_CORE_FIXTURE_IDS.company, issuePrefix: "HTA", name: "Historical transfer Workspace A" },
    project: {
      id: HISTORICAL_CORE_FIXTURE_IDS.project,
      name: "Historical Project A",
      description: "Retained Unicode description: \uD55C\uAE00, caf\u00E9, \u6771\u4EAC",
    },
    secondCompany: { id: HISTORICAL_CORE_FIXTURE_IDS.secondCompany, issuePrefix: "HTB" },
    secondProject: { id: HISTORICAL_CORE_FIXTURE_IDS.secondProject, name: "Historical Project B" },
  };
}

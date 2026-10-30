import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exportSpsOwnerVaultTransfer } from "../src/owner-vault-transfer.mjs";
import { HISTORICAL_CORE_SCHEMA_BASELINE, stageHistoricalCoreSchema } from "./historical-core-schema-fixture.mjs";

const CORE_ROOT = path.resolve(import.meta.dirname, "../../../external/sps-core");
const ATTACHMENT_RELATIVE_PATH = path.join("storage", "historical-main-attachment.txt");
const ATTACHMENT_CONTENT = Buffer.from("historical main transfer fixture attachment\n", "utf8");
const FIXTURE_IDS = Object.freeze({
  company: "10000000-0000-4000-8000-000000000001",
  secondCompany: "10000000-0000-4000-8000-000000000002",
  project: "20000000-0000-4000-8000-000000000001",
  secondProject: "20000000-0000-4000-8000-000000000002",
  membership: "30000000-0000-4000-8000-000000000001",
  secondMembership: "30000000-0000-4000-8000-000000000002",
});
const HISTORICAL_TIMESTAMP = "2026-07-01T12:34:56.789Z";
const OWNER_PRINCIPAL_ID = `sps_identity_${createHash("sha256").update("sps-desktop-e2e-owner").digest("base64url")}`;

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateInputs(fixture, destinationRoot) {
  if (!fixture || typeof fixture.directory !== "string" || !path.isAbsolute(fixture.directory)
    || typeof fixture.assertCurrent !== "function" || typeof fixture.remove !== "function") {
    throw new TypeError("A current owned workspace E2E fixture is required.");
  }
  if (typeof destinationRoot !== "string" || !path.isAbsolute(destinationRoot)) {
    throw new TypeError("The historical transfer destination must be an absolute fixture path.");
  }
  const fixtureRoot = path.resolve(fixture.directory);
  const destination = path.resolve(destinationRoot);
  if (!isInside(fixtureRoot, destination) || destination === fixtureRoot) {
    throw new Error("The historical transfer destination must be inside the owned fixture.");
  }
  return { fixtureRoot, destination };
}

async function assertNoDestinationLinks(fixtureRoot, destination) {
  let current = fixtureRoot;
  const relative = path.relative(fixtureRoot, destination);
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error("The historical transfer destination must contain only plain fixture directories.");
      }
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function prepareHistoricalOwnerTransfer({ fixture, destinationRoot } = {}) {
  const { fixtureRoot, destination } = validateInputs(fixture, destinationRoot);
  await fixture.assertCurrent();
  await assertNoDestinationLinks(fixtureRoot, destination);
  const coreRoot = CORE_ROOT;
  const require = createRequire(path.join(coreRoot, "packages", "db", "package.json"));
  const { tsImport } = require("tsx/esm/api");
  const db = await tsImport(pathToFileURL(path.join(coreRoot, "packages", "db", "src", "index.ts")).href, import.meta.url);
  const postgres = require("postgres");
  const { drizzle } = require("drizzle-orm/postgres-js");
  const { migrate } = require("drizzle-orm/postgres-js/migrator");

  const clients = [];
  const cleanupErrors = [];
  let cluster;
  let result;
  let failure;
  let phase = "historical-schema-stage";
  const client = connectionString => {
    const sql = postgres(connectionString, { max: 1, connect_timeout: 5, onnotice() {} });
    clients.push(sql);
    return sql;
  };
  const siblingDatabase = async name => {
    const admin = new URL(cluster.connectionString);
    assert.equal(admin.hostname, "127.0.0.1");
    admin.pathname = "/postgres";
    await db.ensurePostgresDatabase(admin.toString(), name);
    admin.pathname = `/${name}`;
    return admin.toString();
  };

  try {
    const staged = await stageHistoricalCoreSchema({ coreRoot, fixture });
    await fixture.assertCurrent();
    phase = "owned-postgres-start";
    cluster = await db.startEmbeddedPostgresTestDatabase("sps-historical-owner-transfer-");
    const databaseUrl = await siblingDatabase("sps_historical_main_restore");

    phase = "apply-pinned-historical-migrations";
    await migrate(drizzle(client(databaseUrl)), { migrationsFolder: staged.migrationsFolder });
    const sql = client(databaseUrl);
    const history = await sql`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at, hash`;
    assert.equal(history.length, 157, "The historical database must contain exactly 157 pinned migrations.");
    assert.equal((await sql`SELECT to_regclass('public.sps_plugin_package_operations') AS value`)[0].value, null,
      "The database unexpectedly contains a post-historical table.");

    phase = "seed-historical-main-records";
    await sql.begin(async tx => {
      for (const [companyId, suffix, issuePrefix] of [
        [FIXTURE_IDS.company, "A", "HTA"],
        [FIXTURE_IDS.secondCompany, "B", "HTB"],
      ]) {
        await tx`INSERT INTO companies (id, name, issue_prefix, created_at, updated_at)
          VALUES (${companyId}, ${`Historical transfer Workspace ${suffix}`}, ${issuePrefix}, ${HISTORICAL_TIMESTAMP}, ${HISTORICAL_TIMESTAMP})`;
      }
      for (const [projectId, companyId, suffix] of [
        [FIXTURE_IDS.project, FIXTURE_IDS.company, "A"],
        [FIXTURE_IDS.secondProject, FIXTURE_IDS.secondCompany, "B"],
      ]) {
        await tx`INSERT INTO projects (id, company_id, name, description, env, created_at, updated_at)
          VALUES (${projectId}, ${companyId}, ${`Historical Project ${suffix}`}, ${"Retained Unicode description: \uD55C\uAE00, caf\u00E9, \u6771\u4EAC"},
            ${tx.json({ FIXTURE_VALUE: `historical-${suffix}`, REGION: "\uC11C\uC6B8" })}, ${HISTORICAL_TIMESTAMP}, ${HISTORICAL_TIMESTAMP})`;
      }
      for (const [membershipId, companyId] of [
        [FIXTURE_IDS.membership, FIXTURE_IDS.company],
        [FIXTURE_IDS.secondMembership, FIXTURE_IDS.secondCompany],
      ]) {
        await tx`INSERT INTO company_memberships
          (id, company_id, principal_type, principal_id, status, membership_role, created_at, updated_at)
          VALUES (${membershipId}, ${companyId}, 'user', ${OWNER_PRINCIPAL_ID}, 'active', 'operator',
            ${HISTORICAL_TIMESTAMP}, ${HISTORICAL_TIMESTAMP})`;
      }
    });

    phase = "create-owner-vault-backup";
    const vaultRoot = path.join(fixtureRoot, "historical-owner-vault");
    const backupDir = path.join(vaultRoot, "backups");
    const storageDirectory = path.join(vaultRoot, "storage");
    await fixture.assertCurrent();
    await mkdir(backupDir, { recursive: true });
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(path.join(vaultRoot, ATTACHMENT_RELATIVE_PATH), ATTACHMENT_CONTENT, { flag: "wx" });
    const backup = await db.runDatabaseBackup({
      connectionString: databaseUrl,
      backupDir,
      backupEngine: "javascript",
      filenamePrefix: "historical-main",
      retention: { dailyDays: 7, weeklyWeeks: 4, monthlyMonths: 1 },
    });

    phase = "export-owner-transfer-bundle";
    await mkdir(destination, { recursive: true });
    await fixture.assertCurrent();
    const exported = await exportSpsOwnerVaultTransfer({
      vaultRoot,
      backupFile: backup.backupFile,
      destinationRoot: destination,
    });
    result = {
      bundleRoot: exported.bundleRoot,
      company: { id: FIXTURE_IDS.company, issuePrefix: "HTA", name: "Historical transfer Workspace A" },
      project: { id: FIXTURE_IDS.project, name: "Historical Project A", description: "Retained Unicode description: \uD55C\uAE00, caf\u00E9, \u6771\u4EAC" },
      secondCompany: { id: FIXTURE_IDS.secondCompany, issuePrefix: "HTB" },
      secondProject: { id: FIXTURE_IDS.secondProject, name: "Historical Project B" },
      attachment: ATTACHMENT_RELATIVE_PATH,
      content: Buffer.from(ATTACHMENT_CONTENT),
      baseline: {
        coreCommit: HISTORICAL_CORE_SCHEMA_BASELINE.coreCommit,
        journalSha256: staged.journalSha256,
        sqlSha256: staged.sqlSha256,
      },
      oldMigrations: 157,
    };
  } catch (error) {
    failure = new Error(`Historical owner transfer fixture failed during ${phase}.`, { cause: error });
  } finally {
    for (const sql of clients) await sql.end({ timeout: 5 }).catch(error => cleanupErrors.push(error));
    if (cluster) await cluster.cleanup().catch(error => cleanupErrors.push(error));
  }

  if (failure || cleanupErrors.length) {
    throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors],
      "Historical owner transfer fixture did not complete cleanly.");
  }
  try {
    await fixture.assertCurrent();
  } catch (error) {
    throw new AggregateError([error], "Historical owner transfer fixture did not complete cleanly.");
  }
  return result;
}

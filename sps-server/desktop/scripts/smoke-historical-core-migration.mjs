import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";
import { HISTORICAL_CORE_SCHEMA_BASELINE, stageHistoricalCoreSchema } from "./historical-core-schema-fixture.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";

const pendingJobCleanup = process.argv.length === 3 && process.argv[2] === OWNED_JOB_CLEANUP_ARGUMENT;
if (process.argv.length !== 2 && !pendingJobCleanup) throw new Error("Historical schema acceptance accepts no external database or path arguments.");
if (pendingJobCleanup && (process.platform !== "win32" || process.env.GITHUB_ACTIONS !== "true"
  || process.env.RUNNER_OS !== "Windows" || process.env.RUNNER_ENVIRONMENT !== "github-hosted")) {
  throw new Error("Delegated historical schema acceptance requires the owned hosted-Windows launcher.");
}
assert.match(HISTORICAL_CORE_SCHEMA_BASELINE.coreCommit, /^[a-f0-9]{40}$/);
const core = path.resolve(import.meta.dirname, "../../../external/sps-core");
const require = createRequire(path.join(core, "packages/db/package.json"));
const { tsImport } = require("tsx/esm/api");
const db = await tsImport(pathToFileURL(path.join(core, "packages/db/src/index.ts")).href, import.meta.url);
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { migrate } = require("drizzle-orm/postgres-js/migrator");
const fixture = await createWorkspaceE2eFixture();
const clients = [];
const phases = [];
let cluster;
let failure;
let phase = "historical-input";
const previousPsqlPath = process.env.PAPERCLIP_PSQL_PATH;
const ids = {
  companyA: "10000000-0000-4000-8000-000000000001", companyB: "10000000-0000-4000-8000-000000000002",
  projectA: "20000000-0000-4000-8000-000000000001", projectB: "20000000-0000-4000-8000-000000000002",
  memberA: "30000000-0000-4000-8000-000000000001", memberB: "30000000-0000-4000-8000-000000000002",
  plugin: "40000000-0000-4000-8000-000000000001",
  stateA: "50000000-0000-4000-8000-000000000001", stateB: "50000000-0000-4000-8000-000000000002",
};
const records = [
  ["companies", ids.companyA], ["companies", ids.companyB],
  ["projects", ids.projectA], ["projects", ids.projectB],
  ["company_memberships", ids.memberA], ["company_memberships", ids.memberB],
  ["plugins", ids.plugin], ["plugin_state", ids.stateA], ["plugin_state", ids.stateB],
  ["user", "fixture-user"], ["session", "fixture-session"], ["account", "fixture-account"],
];
function trace(name) {
  phase = name;
  console.log(JSON.stringify({ historicalSchemaStage: name }));
}
function client(connectionString) {
  const sql = postgres(connectionString, { max: 1, connect_timeout: 5, onnotice() {} });
  clients.push(sql);
  return sql;
}
async function sibling(name) {
  const admin = new URL(cluster.connectionString);
  assert.equal(admin.hostname, "127.0.0.1");
  admin.pathname = "/postgres";
  await db.ensurePostgresDatabase(admin.toString(), name);
  admin.pathname = `/${name}`;
  return admin.toString();
}
async function history(sql) {
  return Array.from(await sql`SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, hash`);
}
async function snapshot(sql, columns) {
  const result = [];
  for (const [table, id] of records) {
    const rows = await sql`SELECT to_jsonb(record)::text AS value FROM
      (SELECT ${sql(columns[table])} FROM ${sql(table)} WHERE id = ${id}) AS record`;
    assert.equal(rows.length, 1, "Historical fixture row disappeared.");
    result.push(rows[0].value);
  }
  return result;
}
async function seed(sql) {
  const timestamp = "2026-07-01T12:34:56.789Z";
  await sql.begin(async tx => {
    for (const [suffix, companyId, projectId, memberId] of [
      ["a", ids.companyA, ids.projectA, ids.memberA],
      ["b", ids.companyB, ids.projectB, ids.memberB],
    ]) {
      await tx`INSERT INTO companies (id, name, issue_prefix, created_at, updated_at)
        VALUES (${companyId}, ${`Historical fixture ${suffix}`}, ${`HS${suffix.toUpperCase()}`}, ${timestamp}, ${timestamp})`;
      await tx`INSERT INTO projects (id, company_id, name, description, env, created_at, updated_at)
        VALUES (${projectId}, ${companyId}, ${`Project ${suffix}`}, ${"retained\nUnicode: \uD55C\uAE00"},
          ${tx.json({ FIXTURE_VALUE: `retained-${suffix}` })}, ${timestamp}, ${timestamp})`;
      await tx`INSERT INTO company_memberships (id, company_id, principal_type, principal_id, status, membership_role, created_at, updated_at)
        VALUES (${memberId}, ${companyId}, 'user', ${`fixture-human-${suffix}`}, 'active', 'operator', ${timestamp}, ${timestamp})`;
    }
    await tx`INSERT INTO plugins (id, plugin_key, package_name, version, manifest_json, status, installed_at, updated_at)
      VALUES (${ids.plugin}, 'sps.fixture.historical', '@sps/fixture-historical', '0.0.0',
        ${tx.json({ id: "sps.fixture.historical", fixtureOnly: true })}, 'disabled', ${timestamp}, ${timestamp})`;
    for (const [companyId, stateId, value] of [[ids.companyA, ids.stateA, "private-a"], [ids.companyB, ids.stateB, "private-b"]]) {
      await tx`INSERT INTO plugin_state (id, plugin_id, scope_kind, scope_id, namespace, state_key, value_json, updated_at)
        VALUES (${stateId}, ${ids.plugin}, 'company', ${companyId}, 'fixture', 'retained',
          ${tx.json({ value, nested: ["fixture", null, true], path: "C:\\fixture-only\\project" })}, ${timestamp})`;
    }
    // Inert, nonfunctional credentials stay inside the temporary database.
    await tx`INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
      VALUES ('fixture-user', 'Fixture User', 'fixture@example.invalid', true, ${timestamp}, ${timestamp})`;
    await tx`INSERT INTO "session" (id, expires_at, token, created_at, updated_at, user_id)
      VALUES ('fixture-session', '2030-01-01T00:00:00Z', 'inert-fixture-session-token', ${timestamp}, ${timestamp}, 'fixture-user')`;
    await tx`INSERT INTO "account" (id, account_id, provider_id, user_id, access_token, refresh_token, created_at, updated_at)
      VALUES ('fixture-account', 'fixture-provider-account', 'fixture-provider', 'fixture-user',
        'inert-fixture-access', 'inert-fixture-refresh', ${timestamp}, ${timestamp})`;
  });
}
try {
  const staged = await stageHistoricalCoreSchema({ coreRoot: core, fixture });
  trace("owned-cluster-start");
  cluster = await db.startEmbeddedPostgresTestDatabase("sps-historical-schema-");
  const oldUrl = await sibling("sps_historical_upgrade");
  trace("apply-pinned-historical-schema");
  await migrate(drizzle(client(oldUrl)), { migrationsFolder: staged.migrationsFolder });
  // Drizzle configures its client's JSON serializers for ORM-generated SQL.
  // Raw Postgres.js fixture inserts need an independent, unmodified client.
  const old = client(oldUrl);
  const oldHistory = await history(old);
  assert.equal(oldHistory.length, staged.entries);
  assert.equal((await old`SELECT to_regclass('public.sps_plugin_package_operations') AS value`)[0].value, null);
  trace("seed-pinned-historical-schema");
  await seed(old);
  const columns = {};
  for (const [table] of records) {
    if (columns[table]) continue;
    columns[table] = Array.from(await old`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table} ORDER BY ordinal_position`, row => row.column_name);
    assert.ok(columns[table].length > 0);
  }
  const before = await snapshot(old, columns);
  phases.push("pinned-old-schema-and-populated-rows");

  trace("pre-upgrade-backup");
  await fixture.assertCurrent();
  const backupDir = path.join(fixture.directory, "backup");
  await mkdir(backupDir);
  const backup = await db.runDatabaseBackup({ connectionString: oldUrl, backupDir, backupEngine: "javascript",
    filenamePrefix: "historical-schema", retention: { dailyDays: 7, weeklyWeeks: 4, monthlyMonths: 1 } });
  const pending = await db.inspectMigrations(oldUrl);
  assert.equal(pending.status, "needsMigrations");
  assert.equal(pending.pendingMigrations.length, 19);

  trace("upgrade-and-reapply-current-migrations");
  await db.applyPendingMigrations(oldUrl);
  assert.equal((await db.inspectMigrations(oldUrl)).status, "upToDate");
  assert.equal((await old`SELECT to_regclass('public.sps_plugin_package_operations') IS NOT NULL AS value`)[0].value, true);
  assert.deepEqual(await snapshot(old, columns), before);
  const upgradedHistory = await history(old);
  assert.equal(upgradedHistory.length, staged.entries + 19);
  await db.applyPendingMigrations(oldUrl);
  assert.deepEqual(await history(old), upgradedHistory);
  assert.deepEqual(await snapshot(old, columns), before);
  phases.push("nineteen-new-migrations-preserve-old-columns", "reapply-idempotent");

  trace("restore-pre-upgrade-backup-into-empty-database");
  const restoredUrl = await sibling("sps_historical_backup_restore");
  const restored = client(restoredUrl);
  process.env.PAPERCLIP_PSQL_PATH = path.join(fixture.directory, "intentionally-unavailable-psql");
  await db.runDatabaseRestore({ connectionString: restoredUrl, backupFile: backup.backupFile });
  assert.deepEqual(await history(restored), oldHistory);
  assert.deepEqual(await snapshot(restored, columns), before);
  assert.equal((await restored`SELECT to_regclass('public.sps_plugin_package_operations') AS value`)[0].value, null);
  await db.applyPendingMigrations(restoredUrl);
  assert.equal((await db.inspectMigrations(restoredUrl)).status, "upToDate");
  assert.deepEqual(await snapshot(restored, columns), before);
  assert.deepEqual(await history(restored), upgradedHistory);
  phases.push("pre-upgrade-backup-restored-to-empty-db", "restored-old-schema-upgrades-with-same-data");
  trace("cleanup");
} catch (error) {
  failure = new Error(`Historical schema acceptance failed at ${phase}.`, { cause: error });
} finally {
  if (previousPsqlPath === undefined) delete process.env.PAPERCLIP_PSQL_PATH;
  else process.env.PAPERCLIP_PSQL_PATH = previousPsqlPath;
  const cleanupErrors = [];
  for (const sql of clients) await sql.end({ timeout: 5 }).catch(error => cleanupErrors.push(error));
  if (cluster) await cluster.cleanup().catch(error => cleanupErrors.push(error));
  if (!cleanupErrors.length) await fixture.remove().catch(error => cleanupErrors.push(error));
  if (failure || cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors],
    "Historical Core schema migration acceptance did not qualify.");
}
console.log(JSON.stringify({ kind: "historical-core-schema-acceptance", historicalCore: HISTORICAL_CORE_SCHEMA_BASELINE.coreCommit,
  journalSha256: HISTORICAL_CORE_SCHEMA_BASELINE.journalSha256, sqlSha256: HISTORICAL_CORE_SCHEMA_BASELINE.sqlSha256,
  historicalMigrations: 157, addedMigrations: 19, recordsVerified: records.length, phases,
  javascriptBackupRestore: true, ownedDatabaseCleanup: true, historicalApplicationExecuted: false,
  installedDatabaseMigrationQualified: false, signedInstallerQualified: false, physicalTwoDeviceQualified: false,
  ...(pendingJobCleanup ? { ownedJobCleanup: "pending-external-observation" } : {}) }));
if (pendingJobCleanup) process.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;

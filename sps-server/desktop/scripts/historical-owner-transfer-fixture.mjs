import assert from "node:assert/strict";
import { lstat, mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exportSpsOwnerVaultTransfer } from "../src/owner-vault-transfer.mjs";
import {
  HISTORICAL_CORE_FIXTURE_ATTACHMENT,
  historicalCoreFixtureRecords,
  seedHistoricalCoreFixtureRecords,
} from "./historical-core-records-fixture.mjs";
import { HISTORICAL_CORE_SCHEMA_BASELINE, stageHistoricalCoreSchema } from "./historical-core-schema-fixture.mjs";

const CORE_ROOT = path.resolve(import.meta.dirname, "../../../external/sps-core");

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
    await seedHistoricalCoreFixtureRecords(sql);

    phase = "create-owner-vault-backup";
    const vaultRoot = path.join(fixtureRoot, "historical-owner-vault");
    const backupDir = path.join(vaultRoot, "backups");
    const storageDirectory = path.join(vaultRoot, "storage");
    await fixture.assertCurrent();
    await mkdir(backupDir, { recursive: true });
    await mkdir(storageDirectory, { recursive: true });
    await writeFile(path.join(vaultRoot, HISTORICAL_CORE_FIXTURE_ATTACHMENT.relativePath), HISTORICAL_CORE_FIXTURE_ATTACHMENT.content, { flag: "wx" });
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
      ...historicalCoreFixtureRecords(),
      attachment: HISTORICAL_CORE_FIXTURE_ATTACHMENT.relativePath,
      content: Buffer.from(HISTORICAL_CORE_FIXTURE_ATTACHMENT.content),
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

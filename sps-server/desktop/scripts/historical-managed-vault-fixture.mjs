import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertPlainDirectory } from "./installer-ci-safety.mjs";
import { createSpsOwnerHostConfig, findSpsOwnerHostPorts } from "../src/owner-host-config.mjs";
import { HISTORICAL_CORE_SCHEMA_BASELINE, stageHistoricalCoreSchema } from "./historical-core-schema-fixture.mjs";
import { HISTORICAL_CORE_FIXTURE_ATTACHMENT, historicalCoreFixtureRecords, seedHistoricalCoreFixtureRecords } from "./historical-core-records-fixture.mjs";

const coreRoot = path.resolve(import.meta.dirname, "../../../external/sps-core");
const digest = value => createHash("sha256").update(value).digest("hex");
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const postgresAdminRefusal = /Execution of PostgreSQL by a user with administrative permissions is not\s+permitted\.\s+The server must be started under an unprivileged user ID to prevent\s+possible system security compromises\.\s+See the documentation for\s+more information on how to properly start the server\./;

export function createHistoricalPostgresStartupObserver() {
  const tail = Buffer.alloc(4096);
  let length = 0;
  let collecting = false;
  let recognized = false;
  return {
    begin() { tail.fill(0); length = 0; recognized = false; collecting = true; },
    observe(chunk) {
      if (!collecting || recognized) return;
      if (typeof chunk !== "string" && !Buffer.isBuffer(chunk)) return;
      const bytes = Buffer.isBuffer(chunk) ? chunk.subarray(-4096) : Buffer.from(chunk.slice(-4096)).subarray(-4096);
      if (bytes.length >= tail.length) {
        bytes.copy(tail, 0, bytes.length - tail.length);
        length = tail.length;
      } else {
        const overflow = Math.max(0, length + bytes.length - tail.length);
        if (overflow) tail.copy(tail, 0, overflow, length);
        const kept = length - overflow;
        bytes.copy(tail, kept);
        length = kept + bytes.length;
      }
      recognized = postgresAdminRefusal.test(tail.subarray(0, length).toString("utf8"));
    },
    end() { collecting = false; },
    failureCategory() { return recognized ? "administrator_unsupported" : "unclassified"; },
    dispose() { collecting = false; recognized = false; length = 0; tail.fill(0); },
  };
}

async function identity(directory) {
  assert.equal(await assertPlainDirectory(directory), directory);
  const info = await lstat(directory, { bigint: true });
  return { canonicalPath: directory, dev: info.dev, ino: info.ino, birthtimeNs: info.birthtimeNs };
}

async function assertIdentity(directory, expected) {
  const current = await identity(directory);
  for (const key of ["dev", "ino", "birthtimeNs"]) assert.equal(current[key], expected[key]);
}

async function absent(file) {
  try { await lstat(file); return false; }
  catch (error) { if (error.code === "ENOENT") return true; throw error; }
}

// Preparation only. No current migrations, backup import, Desktop state writes,
// install, registry access, credentials, or adoption of an existing cluster.
export async function prepareHistoricalManagedVault({ fixture, profile } = {}) {
  if (process.platform !== "win32") throw new Error("Historical managed Vault preparation requires Windows.");
  if (!fixture || typeof fixture.directory !== "string" || !path.isAbsolute(fixture.directory)
    || typeof fixture.assertCurrent !== "function" || typeof fixture.remove !== "function"
    || typeof profile !== "string" || !path.isAbsolute(profile)
    || !samePath(path.dirname(profile), fixture.directory) || path.basename(profile) !== "migration-profile") {
    throw new TypeError("Historical managed Vault preparation requires its exact owned migration profile.");
  }
  const temporary = await realpath(os.tmpdir());
  if (!samePath(path.dirname(fixture.directory), temporary)
    || !path.basename(fixture.directory).startsWith("sps-workspace-surfaces-e2e-")) {
    throw new Error("Historical managed Vault must stay within its owned temporary fixture.");
  }
  await fixture.assertCurrent();
  const profileIdentity = await identity(profile);
  const vaultRoot = path.join(profile, "owner-vault");
  assert.equal(await absent(vaultRoot), true, "Historical preparation must never replace an existing Vault.");
  const check = async () => { await fixture.assertCurrent(); await assertIdentity(profile, profileIdentity); };
  const staged = await stageHistoricalCoreSchema({ coreRoot, fixture });
  await check();
  await mkdir(vaultRoot);
  const vaultIdentity = await identity(vaultRoot);
  const checkVault = async () => { await check(); await assertIdentity(vaultRoot, vaultIdentity); };
  const ports = await findSpsOwnerHostPorts({ attempts: 0 });
  const config = createSpsOwnerHostConfig({ vaultRoot, ...ports });
  const configPath = path.join(vaultRoot, "config.json");
  await checkVault();
  const configBytes = Buffer.from(`${JSON.stringify(config, null, 2)}\n`);
  await writeFile(configPath, configBytes, { flag: "wx" });
  const databaseDir = path.join(vaultRoot, "database");
  await checkVault();
  await mkdir(databaseDir);
  const databaseIdentity = await identity(databaseDir);
  const require = createRequire(path.join(coreRoot, "packages/db/package.json"));
  const { tsImport } = require("tsx/esm/api");
  const db = await tsImport(pathToFileURL(path.join(coreRoot, "packages/db/src/index.ts")).href, import.meta.url);
  const lifecycle = await tsImport(pathToFileURL(path.join(coreRoot, "packages/db/src/test-embedded-postgres.ts")).href, import.meta.url);
  await db.prepareEmbeddedPostgresNativeRuntime();
  const startupObserver = createHistoricalPostgresStartupObserver();
  const EmbeddedPostgres = require("embedded-postgres").default;
  const postgres = require("postgres");
  const { drizzle } = require("drizzle-orm/postgres-js");
  const { migrate } = require("drizzle-orm/postgres-js/migrator");
  const instance = new EmbeddedPostgres({ databaseDir, user: "paperclip", password: "paperclip",
    port: ports.databasePort, persistent: true, initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
    onLog(message) { startupObserver.observe(message); }, onError() {} });
  const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${ports.databasePort}/paperclip`;
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = "/postgres";
  let sql;
  let failure;
  const cleanupErrors = [];
  let oldHistory;
  let rows;
  let stage = "initdb";
  try {
    await instance.initialise();
    await checkVault();
    await assertIdentity(databaseDir, databaseIdentity);
    stage = "postgres-start";
    startupObserver.begin();
    await instance.start();
    startupObserver.end();
    stage = "postmaster-pidfile";
    const pidFile = path.join(databaseDir, "postmaster.pid");
    const pidInfo = await lstat(pidFile);
    assert.ok(pidInfo.isFile() && !pidInfo.isSymbolicLink() && pidInfo.size <= 4096);
    stage = "postmaster-identity";
    databaseIdentity.postmaster = await lifecycle.validateOwnedPostmasterPidFile(await readFile(pidFile, "utf8"),
      ports.databasePort, databaseDir, undefined, instance.process?.pid);
    stage = "postgres-data-directory";
    assert.ok(samePath(await realpath(await db.getPostgresDataDirectory(adminUrl.toString())), databaseDir));
    stage = "create-fixture-database";
    await db.ensurePostgresDatabase(adminUrl.toString(), "paperclip");
    sql = postgres(connectionString, { max: 1, connect_timeout: 5, onnotice() {} });
    stage = "pinned-historical-migrations";
    await migrate(drizzle(sql), { migrationsFolder: staged.migrationsFolder });
    // Drizzle changes JSON codecs; fixture records use an independent raw client.
    await sql.end({ timeout: 5 });
    sql = postgres(connectionString, { max: 1, connect_timeout: 5, onnotice() {} });
    oldHistory = (await sql`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at, hash`).map(row => row.hash);
    assert.equal(oldHistory.length, 157);
    assert.equal((await sql`SELECT to_regclass('public.sps_plugin_package_operations') AS value`)[0].value, null);
    stage = "historical-records";
    await seedHistoricalCoreFixtureRecords(sql);
    stage = "snapshot-historical-records";
    rows = await sql`SELECT id, company_id, name, description, env, created_at, updated_at FROM projects ORDER BY id`;
    assert.equal(rows.length, 2);
    stage = "write-historical-file";
    await checkVault();
    const attachmentPath = path.join(vaultRoot, HISTORICAL_CORE_FIXTURE_ATTACHMENT.relativePath);
    await mkdir(path.dirname(attachmentPath));
    await writeFile(attachmentPath, HISTORICAL_CORE_FIXTURE_ATTACHMENT.content, { flag: "wx" });
  } catch (error) {
    startupObserver.end();
    failure = new Error(`Historical managed Vault failed during ${stage}.`, { cause: error });
  } finally {
    if (sql) await sql.end({ timeout: 5 }).catch(error => cleanupErrors.push(error));
    await lifecycle.stopEmbeddedPostgresTestInstance(databaseDir, ports.databasePort, instance, databaseIdentity)
      .catch(error => cleanupErrors.push(error));
  }
  if (failure || cleanupErrors.length) {
    const failureCategory = startupObserver.failureCategory();
    startupObserver.dispose();
    throw Object.assign(new AggregateError([...(failure ? [failure] : []), ...cleanupErrors],
      "Historical managed Vault is not qualified; preserve its owned fixture."),
    { stage: failure ? stage : "owned-postgres-stop", failureCategory });
  }
  startupObserver.dispose();
  await checkVault();
  await assertIdentity(databaseDir, databaseIdentity);
  assert.equal(await absent(path.join(databaseDir, "postmaster.pid")), true);
  assert.equal(await readFile(path.join(databaseDir, "PG_VERSION"), "utf8").then(value => /^\d+\s*$/.test(value)), true);
  assert.equal(digest(await readFile(configPath)), digest(configBytes));
  return { ...historicalCoreFixtureRecords(), vaultRoot, configPath, databaseDir, config,
    oldHistory, projectsSha256: digest(JSON.stringify(rows)),
    attachment: HISTORICAL_CORE_FIXTURE_ATTACHMENT.relativePath,
    attachmentSha256: digest(HISTORICAL_CORE_FIXTURE_ATTACHMENT.content),
    baseline: HISTORICAL_CORE_SCHEMA_BASELINE, oldMigrations: 157,
    ownedPostgresStopped: true, databasePreserved: true, currentMigrationsApplied: false };
}

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createWorkspaceE2eFixture } from "../../scripts/workspace-e2e-fixture.mjs";
import { prepareHistoricalManagedVault } from "../../scripts/historical-managed-vault-fixture.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../../scripts/preview-e2e-cleanup-contract.mjs";

let fixture;
let qualified = false;
let failed = false;
let failureStage = null;
let failureCategory = null;
try {
  assert.equal(process.platform, "win32");
  assert.equal(process.argv.length, 3);
  assert.equal(process.argv[2], OWNED_JOB_CLEANUP_ARGUMENT);
  fixture = await createWorkspaceE2eFixture();
  const profile = path.join(fixture.directory, "migration-profile");
  await mkdir(profile);
  const prepared = await prepareHistoricalManagedVault({ fixture, profile });
  assert.equal(prepared.ownedPostgresStopped, true);
  assert.equal(prepared.databasePreserved, true);
  assert.equal(prepared.currentMigrationsApplied, false);
  assert.equal(prepared.oldMigrations, 157);
  assert.equal(prepared.oldHistory.length, 157);
  assert.equal(prepared.config.database.mode, "embedded-postgres");
  assert.equal(prepared.config.database.embeddedPostgresDataDir, prepared.databaseDir);
  assert.notEqual(prepared.config.server.port, prepared.config.database.embeddedPostgresPort);
  assert.equal((await lstat(path.join(prepared.databaseDir, "PG_VERSION"))).isFile(), true);
  await assert.rejects(lstat(path.join(prepared.databaseDir, "postmaster.pid")), { code: "ENOENT" });
  const attachment = await readFile(path.join(prepared.vaultRoot, prepared.attachment));
  assert.equal(createHash("sha256").update(attachment).digest("hex"), prepared.attachmentSha256);
  const config = JSON.parse(await readFile(prepared.configPath, "utf8"));
  assert.deepEqual(config, prepared.config);
  assert.match(prepared.projectsSha256, /^[a-f0-9]{64}$/);
  await fixture.assertCurrent();
  qualified = true;
} catch (error) {
  failed = true;
  failureStage = ["initdb", "postgres-start", "postmaster-pidfile", "postmaster-identity", "postgres-data-directory", "create-fixture-database", "pinned-historical-migrations", "historical-records",
    "snapshot-historical-records", "write-historical-file", "owned-postgres-stop"].includes(error.stage)
    ? error.stage : "preparation-or-postconditions";
  failureCategory = error?.failureCategory === "administrator_unsupported" ? "administrator_unsupported" : "unclassified";
} finally {
  // Unknown shutdown is a failure and preserves the fixture rather than
  // recursively deleting files that could still belong to a live process.
  if (qualified && fixture) {
    try { await fixture.remove(); } catch { failed = true; }
  }
}
const record = { preparedHistoricalManagedVault: qualified && !failed, oldMigrations: qualified ? 157 : null,
  currentMigrationsApplied: false, ownedPostgresStopped: qualified,
  databasePreservedBeforeCleanup: qualified, fixtureRemoved: qualified && !failed,
  installedMainExecuted: false,
  ...(failed ? { failureStage, failureCategory, fixtureName: fixture ? path.basename(fixture.directory) : null }
    : { ownedJobCleanup: "pending-external-observation" }) };
await new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify(record)}\n`, error => error ? reject(error) : resolve()));
// The upstream library's beforeExit hook must not overwrite a failing result.
process.exit(failed ? 1 : OWNED_JOB_CLEANUP_PENDING_EXIT_CODE);

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, symlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import { prepareHistoricalManagedVault } from "../scripts/historical-managed-vault-fixture.mjs";

const exec = promisify(execFile);

test("managed historical Vault rejects invalid fixture and external profile before writes", { skip: process.platform !== "win32" }, async () => {
  let checked = false;
  const fixture = { directory: path.resolve("fixture"), async assertCurrent() { checked = true; }, async remove() {} };
  for (const input of [{}, { fixture }, { fixture, profile: "relative" },
    { fixture, profile: path.join(fixture.directory, "other-profile") },
    { fixture, profile: path.resolve("other", "migration-profile") }]) {
    await assert.rejects(prepareHistoricalManagedVault(input), /exact owned migration profile/);
  }
  assert.equal(checked, false);
});

test("managed historical Vault refuses an existing Vault or linked profile without staging SQL", { skip: process.platform !== "win32" }, async t => {
  const fixture = await createWorkspaceE2eFixture();
  t.after(() => fixture.remove());
  const profile = path.join(fixture.directory, "migration-profile");
  await mkdir(profile);
  await mkdir(path.join(profile, "owner-vault"));
  await assert.rejects(prepareHistoricalManagedVault({ fixture, profile }), /never replace an existing Vault/);
  await assert.rejects(lstat(path.join(fixture.directory, "historical-migrations")), { code: "ENOENT" });
  const outside = await createWorkspaceE2eFixture();
  t.after(() => outside.remove());
  const second = await createWorkspaceE2eFixture();
  t.after(() => second.remove());
  const linked = path.join(second.directory, "migration-profile");
  await symlink(outside.directory, linked, "junction");
  await assert.rejects(prepareHistoricalManagedVault({ fixture: second, profile: linked }));
  await assert.rejects(lstat(path.join(outside.directory, "owner-vault")), { code: "ENOENT" });
});

test("managed historical preparation uses only its own cluster and the pinned old migrations", async () => {
  const source = await readFile(new URL("../scripts/historical-managed-vault-fixture.mjs", import.meta.url), "utf8");
  assert.match(source, /stageHistoricalCoreSchema\(\{ coreRoot, fixture \}\)/);
  assert.match(source, /new EmbeddedPostgres\(\{ databaseDir/);
  assert.match(source, /persistent: true/);
  assert.match(source, /validateOwnedPostmasterPidFile\(/);
  assert.match(source, /stopEmbeddedPostgresTestInstance\(/);
  assert.match(source, /currentMigrationsApplied: false/);
  assert.doesNotMatch(source, /process\.env|resolveMigrationConnection\(|runDatabaseRestore\(|applyPendingMigrations\(|(?:rm|unlink|rename)\(/);
});

test("actual owned historical cluster stops normally and retains its 157-migration data files", {
  skip: process.platform !== "win32", timeout: 100_000,
}, async () => {
  let result;
  try {
    result = await exec(process.execPath, [fileURLToPath(new URL("./fixtures/historical-managed-vault-native.mjs", import.meta.url))],
      { cwd: path.resolve(import.meta.dirname, ".."), windowsHide: true, timeout: 90_000, maxBuffer: 16_384 });
  } catch (error) {
    let value;
    try { value = JSON.parse(error.stdout.trim()); } catch { value = null; }
    const phase = ["initdb", "postgres-start", "pinned-historical-migrations", "historical-records", "snapshot-historical-records",
      "write-historical-file", "owned-postgres-stop", "preparation-or-postconditions"]
      .includes(value?.failureStage) ? value.failureStage : "unavailable";
    const fixtureName = /^sps-workspace-surfaces-e2e-[A-Za-z0-9]+$/.test(value?.fixtureName ?? "") ? value.fixtureName : "unavailable";
    assert.fail(`Historical managed Vault native preparation failed: ${phase}; retained fixture ${fixtureName}.`);
  }
  const lines = result.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { preparedHistoricalManagedVault: true, oldMigrations: 157,
    currentMigrationsApplied: false, ownedPostgresStopped: true, databasePreservedBeforeCleanup: true,
    fixtureRemoved: true, installedMainExecuted: false });
});

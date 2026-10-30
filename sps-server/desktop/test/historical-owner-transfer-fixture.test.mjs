import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { prepareHistoricalOwnerTransfer } from "../scripts/historical-owner-transfer-fixture.mjs";

const helperPath = new URL("../scripts/historical-owner-transfer-fixture.mjs", import.meta.url);

test("rejects invalid and external fixture destinations before database setup", async () => {
  let asserted = false;
  const fixture = {
    directory: path.resolve("fixture"),
    async assertCurrent() { asserted = true; },
    async remove() {},
  };
  const invalid = [
    [{}, path.join(fixture.directory, "exports"), /owned workspace E2E fixture/],
    [{ ...fixture, directory: "relative-fixture" }, path.join(fixture.directory, "exports"), /owned workspace E2E fixture/],
    [{ directory: fixture.directory, assertCurrent: fixture.assertCurrent }, path.join(fixture.directory, "exports"), /owned workspace E2E fixture/],
    [fixture, "relative-destination", /destination must be an absolute/],
    [fixture, path.parse(fixture.directory).root, /must be inside the owned fixture/],
    [fixture, fixture.directory, /must be inside the owned fixture/],
  ];

  for (const [candidate, destinationRoot, message] of invalid) {
    await assert.rejects(prepareHistoricalOwnerTransfer({ fixture: candidate, destinationRoot }), message);
  }
  assert.equal(asserted, false, "Invalid paths must be rejected before fixture or database setup.");
});

test("keeps the helper bounded to the pinned historical backup and production export flow", async () => {
  const source = await readFile(helperPath, "utf8");
  const validation = source.indexOf("const { fixtureRoot, destination } = validateInputs(fixture, destinationRoot);");
  const fixtureCheck = source.indexOf("await fixture.assertCurrent();", validation);
  const databaseRuntime = source.indexOf('createRequire(path.join(coreRoot, "packages", "db", "package.json"))');
  assert.ok(validation >= 0 && fixtureCheck > validation && databaseRuntime > fixtureCheck);
  assert.match(source, /migrationsFolder: staged\.migrationsFolder/);
  assert.match(source, /history\.length, 157/);
  assert.match(source, /to_regclass\('public\.sps_plugin_package_operations'\)/);
  assert.match(source, /backupEngine: "javascript"/);
  assert.match(source, /filenamePrefix: "historical-main"/);
  assert.match(source, /exportSpsOwnerVaultTransfer\(/);
  assert.match(source, /principal_type, principal_id, status, membership_role/);
  assert.match(source, /membershipId, companyId/);
  assert.match(source, /storage.*historical-main-attachment\.txt/);
  assert.doesNotMatch(source, /runDatabaseRestore\(/);
});

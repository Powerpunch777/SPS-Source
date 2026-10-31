import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import {
  HISTORICAL_CORE_SCHEMA_BASELINE,
  stageHistoricalCoreSchema,
} from "../scripts/historical-core-schema-fixture.mjs";

const coreRoot = path.resolve(import.meta.dirname, "../../../external/sps-core");

async function withFixture(t) {
  const fixture = await createWorkspaceE2eFixture();
  t.after(async () => {
    await fixture.assertCurrent();
    await fixture.remove();
  });
  return fixture;
}

test("historical core schema pin stages the verified 157-entry prefix in the owned fixture", async t => {
  const fixture = await withFixture(t);
  assert.equal(Object.isFrozen(HISTORICAL_CORE_SCHEMA_BASELINE), true);
  assert.match(HISTORICAL_CORE_SCHEMA_BASELINE.coreCommit, /^[a-f0-9]{40}$/);
  assert.equal(HISTORICAL_CORE_SCHEMA_BASELINE.coreCommit, "95665eb49996cd0e9c13e2da817326dfffe0f2a3");

  const result = await stageHistoricalCoreSchema({ coreRoot, fixture });
  await fixture.assertCurrent();
  assert.deepEqual(result, {
    migrationsFolder: path.join(fixture.directory, "historical-migrations"),
    entries: 157,
    journalSha256: "b4f499190694a372442c8ff3c86e78adabafa733e67b7799ebe0db8d9ad4ab0b",
    sqlSha256: "b89987692343bdea3ab476ea2298782836916b0675c33bf583270abd61f9838f",
  });
  const sqlFiles = await readdir(result.migrationsFolder);
  assert.equal(sqlFiles.filter(name => name.endsWith(".sql")).length, 157);
  assert.equal(JSON.parse(await readFile(path.join(result.migrationsFolder, "meta", "_journal.json"), "utf8")).entries.length, 157);
});

test("modified historical journal and SQL are rejected before any staging", async t => {
  const fixture = await withFixture(t);
  const journalPath = path.join(coreRoot, "packages", "db", "src", "migrations", "meta", "_journal.json");
  const firstSqlPath = path.join(coreRoot, "packages", "db", "src", "migrations", "0000_mature_masked_marvel.sql");
  const originalRead = readFile;

  for (const [target, mutate, message] of [
    [journalPath, bytes => {
      const journal = JSON.parse(bytes.toString("utf8"));
      journal.entries[0].tag = "modified_historical_entry";
      return Buffer.from(JSON.stringify(journal));
    }, /journal SHA-256/],
    [firstSqlPath, bytes => Buffer.concat([bytes, Buffer.from("\n-- changed\n")]), /SQL SHA-256/],
  ]) {
    await assert.rejects(stageHistoricalCoreSchema({ coreRoot, fixture, readSource: async file => {
      const bytes = await originalRead(file);
      return path.resolve(file) === path.resolve(target) ? mutate(bytes) : bytes;
    } }), message);
    await fixture.assertCurrent();
    await assert.rejects(readdir(path.join(fixture.directory, "historical-migrations")), { code: "ENOENT" });
  }
});

test("CRLF historical SQL is staged with canonical LF bytes and the pinned manifest", async t => {
  const fixture = await withFixture(t);
  const originalRead = readFile;
  const result = await stageHistoricalCoreSchema({ coreRoot, fixture, readSource: async file => {
    const bytes = await originalRead(file);
    if (!file.endsWith(".sql")) return bytes;
    return Buffer.from(bytes.toString("utf8").replace(/\r?\n/g, "\r\n"), "utf8");
  } });

  assert.equal(result.sqlSha256, HISTORICAL_CORE_SCHEMA_BASELINE.sqlSha256);
  const filename = "0000_mature_masked_marvel.sql";
  const staged = await readFile(path.join(result.migrationsFolder, filename));
  const source = await originalRead(path.join(coreRoot, "packages", "db", "src", "migrations", filename));
  assert.deepEqual(staged, Buffer.from(source.toString("utf8").replace(/\r\n/g, "\n"), "utf8"));
  assert.equal(staged.includes(Buffer.from("\r\n")), false);
  await fixture.assertCurrent();
});

test("invalid UTF-8 and oversized callback reads fail before staging", async t => {
  const fixture = await withFixture(t);
  const sqlPath = path.join(coreRoot, "packages", "db", "src", "migrations", "0000_mature_masked_marvel.sql");
  const originalRead = readFile;
  const cases = [
    [bytes => Buffer.concat([Buffer.from([0xff]), bytes]), /encoded data/],
    [() => Buffer.alloc(2 * 1024 * 1024 + 1), /exceeds its size limit/],
  ];

  for (const [mutate, message] of cases) {
    await assert.rejects(stageHistoricalCoreSchema({ coreRoot, fixture, readSource: async file => {
      const bytes = await originalRead(file);
      return path.resolve(file) === path.resolve(sqlPath) ? mutate(bytes) : bytes;
    } }), message);
    await fixture.assertCurrent();
    await assert.rejects(readdir(path.join(fixture.directory, "historical-migrations")), { code: "ENOENT" });
  }
});

test("a second staging attempt does not overwrite the first staged files", async t => {
  const fixture = await withFixture(t);
  const staged = await stageHistoricalCoreSchema({ coreRoot, fixture });
  const before = new Map();
  for (const name of await readdir(staged.migrationsFolder)) {
    if (name.endsWith(".sql")) before.set(name, await readFile(path.join(staged.migrationsFolder, name)));
  }
  const journalPath = path.join(staged.migrationsFolder, "meta", "_journal.json");
  before.set("meta/_journal.json", await readFile(journalPath));

  await assert.rejects(stageHistoricalCoreSchema({ coreRoot, fixture }), { code: "EEXIST" });
  for (const [name, contents] of before) {
    const target = path.join(staged.migrationsFolder, name);
    assert.deepEqual(await readFile(target), contents, `${name} changed on the rejected second staging attempt`);
  }
  await fixture.assertCurrent();
});

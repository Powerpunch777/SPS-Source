import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const exec = promisify(execFile);
const helper = fileURLToPath(new URL("../src/owner-host-restore.mjs", import.meta.url));
async function runRestore(t, { restoreFails = false, stopFails = false } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-restore-cli-"));
  const temporaryRoot = await realpath(os.tmpdir());
  assert.equal(path.dirname(await realpath(root)), temporaryRoot);
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = path.join(root, "config.json"), db = path.join(root, "db.mjs"), embedded = path.join(root, "postgres.mjs");
  const observed = path.join(root, "observed.log");
  await writeFile(config, JSON.stringify({ database: { embeddedPostgresDataDir: path.join(root, "database"), embeddedPostgresPort: 34567 } }));
  const prelude = `import { appendFile } from 'node:fs/promises'; const record = value => appendFile(${JSON.stringify(observed)}, value + String.fromCharCode(10));\n`;
  await writeFile(db, prelude + `
    export async function ensurePostgresDatabase(){await record('database');}
    export async function runDatabaseRestore(){await record('restore');${restoreFails ? "throw new Error('FIXTURE_RESTORE_FAILED');" : ""}}
    export async function sanitizePostRestoreDatabase(){await record('sanitize');}
  `);
  await writeFile(embedded, prelude + `
    export default class {
      async initialise(){await record('initialise');}
      async start(){await record('start');}
      async stop(){await record('stop');${stopFails ? "throw new Error('FIXTURE_STOP_FAILED');" : ""}}
    }
  `);
  let result;
  try {
    const output = await exec(process.execPath, [helper, config, path.join(root, "unused-backup.sql.gz"), db, embedded], { windowsHide: true, timeout: 15000 });
    result = { code: 0, stderr: output.stderr };
  } catch (error) {
    assert.equal(error.killed, false, "The real restore CLI timed out.");
    result = { code: error.code, stderr: error.stderr };
  }
  return { ...result, observed: (await readFile(observed, "utf8")).trim().split(/\r?\n/) };
}
test("restore CLI succeeds only after sanitization and database shutdown complete", async t => {
  const result = await runRestore(t);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(result.observed, ["initialise", "start", "database", "restore", "sanitize", "stop"]);
});
test("restore CLI does not turn a database shutdown failure into success", async t => {
  const result = await runRestore(t, { stopFails: true });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /FIXTURE_STOP_FAILED/);
  assert.deepEqual(result.observed.slice(-2), ["sanitize", "stop"]);
});
test("restore CLI preserves restoration failure while still attempting shutdown", async t => {
  const result = await runRestore(t, { restoreFails: true });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /FIXTURE_RESTORE_FAILED/);
  assert.equal(result.observed.includes("sanitize"), false);
  assert.deepEqual(result.observed.slice(-2), ["restore", "stop"]);
});
test("restore CLI preserves both restoration and shutdown failures", async t => {
  const result = await runRestore(t, { restoreFails: true, stopFails: true });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /AggregateError/);
  assert.match(result.stderr, /FIXTURE_RESTORE_FAILED/);
  assert.match(result.stderr, /FIXTURE_STOP_FAILED/);
});

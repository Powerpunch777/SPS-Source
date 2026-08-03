import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const identityRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(identityRoot, "..", "..");

test("Identity CI installs the locked Miniflare dependencies before tests", async () => {
  const workflow = await readFile(path.join(sourceRoot, ".github", "workflows", "sps-verify.yml"), "utf8");
  const job = workflow.slice(workflow.indexOf("  identity:"), workflow.indexOf("  plugin-kit:"));
  assert.match(job, /cache:\s*npm/);
  assert.match(job, /cache-dependency-path:\s*sps-server\/sps-identity\/package-lock\.json/);
  assert.ok(job.indexOf("run: npm ci") < job.indexOf("run: npm test"));
});

test("Identity migration expands the schema without breaking the previous Worker", async () => {
  const migration = await readFile(
    path.join(identityRoot, "migrations", "0003_refresh_reuse_protection.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE identity_replay_results_v2/);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.doesNotMatch(migration, /DROP INDEX/i);
});

test("Identity deployment preserves rollback until explicit post-smoke finalization", async () => {
  const [publish, finalize, finalizeSql, verify, worker] = await Promise.all([
    readFile(path.join(identityRoot, "scripts", "publish-identity.ps1"), "utf8"),
    readFile(path.join(identityRoot, "scripts", "finalize-identity-v2.ps1"), "utf8"),
    readFile(path.join(identityRoot, "scripts", "finalize-identity-v2.sql"), "utf8"),
    readFile(path.join(identityRoot, "scripts", "verify-deployment.mjs"), "utf8"),
    readFile(path.join(identityRoot, "src", "worker.mjs"), "utf8"),
  ]);
  assert.ok(publish.indexOf("d1 migrations apply") < publish.indexOf("wrangler deploy"));
  assert.ok(publish.indexOf("wrangler deploy") < publish.indexOf("npm run verify:deployment"));
  assert.doesNotMatch(publish, /DELETE FROM refresh_tokens/);
  assert.match(finalize, /ConfirmStagingSmokePassed/);
  assert.match(finalize, /ConfirmLegacyReplayWindowElapsed/);
  assert.match(finalize, /--file "scripts\/finalize-identity-v2\.sql"/);
  assert.match(finalizeSql, /DELETE FROM refresh_tokens WHERE family_id IS NULL/);
  assert.match(finalizeSql, /DELETE FROM identity_replay_results/);
  assert.match(verify, /healthBody\?\.replay_key_version !== replayKeyVersion/);
  assert.match(worker, /SPS_IDENTITY_REPLAY_KEY_\$\{version\.toUpperCase\(\)\}/);
  assert.doesNotMatch(
    worker.slice(worker.indexOf("async function replayEncryptionKey"), worker.indexOf("async function encryptReplayResponse")),
    /SPS_IDENTITY_PRIVATE_KEY_PEM/,
  );
});

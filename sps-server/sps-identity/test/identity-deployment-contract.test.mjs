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

test("Identity migrations preserve the previous Worker and backfill active legacy sessions", async () => {
  const migration3 = await readFile(path.join(identityRoot, "migrations", "0003_refresh_reuse_protection.sql"), "utf8");
  const migration4 = await readFile(path.join(identityRoot, "migrations", "0004_legacy_refresh_family_roots.sql"), "utf8");
  assert.match(migration3, /CREATE TABLE identity_replay_results_v2/);
  assert.doesNotMatch(migration3, /DROP TABLE|DROP INDEX/i);
  assert.match(migration4, /SET family_id = 'legacy-root:' \|\| token_hash/);
  assert.match(migration4, /family_id IS NULL AND consumed_at IS NULL/);
  assert.doesNotMatch(migration4, /DELETE FROM/i);
});

test("Identity deployment requires real staging evidence and never overwrites replay keys", async () => {
  const [publish, initialize, finalize, finalizeSql, verify, worker, stagingConfig] = await Promise.all([
    readFile(path.join(identityRoot, "scripts", "publish-identity.ps1"), "utf8"),
    readFile(path.join(identityRoot, "scripts", "initialize-replay-key.ps1"), "utf8"),
    readFile(path.join(identityRoot, "scripts", "finalize-identity-v2.ps1"), "utf8"),
    readFile(path.join(identityRoot, "scripts", "finalize-identity-v2.sql"), "utf8"),
    readFile(path.join(identityRoot, "scripts", "verify-deployment.mjs"), "utf8"),
    readFile(path.join(identityRoot, "src", "worker.mjs"), "utf8"),
    readFile(path.join(identityRoot, "wrangler.staging.toml"), "utf8"),
  ]);
  assert.match(stagingConfig, /name = "sps-identity-staging"/);
  assert.match(stagingConfig, /database_name = "sps-identity-staging"/);
  assert.match(stagingConfig, /auth-staging\.redongames\.com/);
  assert.match(publish, /ValidateSet\("Staging", "Production"\)/);
  assert.match(publish, /npm run smoke:staging/);
  assert.match(publish, /npm run verify:staging-evidence/);
  assert.match(publish, /normal deployment never creates or overwrites replay keys/i);
  assert.doesNotMatch(publish, /secret put \$replaySecretName/);
  assert.match(initialize, /Never overwrite a replay key version/);
  assert.match(initialize, /GenerateNewKey/);
  assert.match(finalize, /StagingEvidencePath/);
  assert.doesNotMatch(finalize, /ConfirmStagingSmokePassed/);
  assert.match(finalizeSql, /family_id IS NULL AND consumed_at IS NOT NULL/);
  assert.doesNotMatch(finalizeSql, /DELETE FROM refresh_tokens WHERE family_id IS NULL;/);
  assert.match(verify, /healthBody\?\.source_revision !== sourceRevision/);
  assert.match(worker, /SPS_IDENTITY_REPLAY_KEY_\$\{version\.toUpperCase\(\)\}/);
  assert.doesNotMatch(
    worker.slice(worker.indexOf("async function replayEncryptionKey"), worker.indexOf("async function encryptReplayResponse")),
    /SPS_IDENTITY_PRIVATE_KEY_PEM/,
  );
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { OWNED_JOB_CLEANUP_ARGUMENT } from "../scripts/preview-e2e-cleanup-contract.mjs";

const scriptPath = fileURLToPath(new URL("../scripts/smoke-historical-managed-vault-desktop.mjs", import.meta.url));
const runFile = promisify(execFile);
const read = relative => readFile(new URL(relative, import.meta.url), "utf8");

function localEnvironment(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith("SPS_") || key.startsWith("PAPERCLIP_") || key === "DATABASE_URL"
      || key === "ELECTRON_RUN_AS_NODE") delete env[key];
  }
  return { ...env, GITHUB_ACTIONS: "false", ...overrides };
}

async function assertRefused(overrides, args, message) {
  await assert.rejects(runFile(process.execPath, [scriptPath, ...args], {
    env: localEnvironment(overrides), windowsHide: true, timeout: 10_000,
  }), error => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, message);
    assert.doesNotMatch(error.stderr, /prepareHistoricalManagedVault|createWorkspaceE2eFixture|createMockIdentityServer/);
    assert.doesNotMatch(error.stdout, /historicalMigrations|installedHistoricalFixtureInPlaceMigrationQualified/);
    return true;
  });
}

test("the real Node entry refuses missing, conflicting, and malformed modes before setup", async () => {
  await assertRefused({}, [], /exactly one isolated Windows source or hosted installed mode/);
  await assertRefused({ SPS_DESKTOP_E2E_SOURCE: "1" }, ["--unexpected"], /exactly one isolated Windows source or hosted installed mode/);
  await assertRefused({ SPS_DESKTOP_E2E_SOURCE: "1" }, [OWNED_JOB_CLEANUP_ARGUMENT], /exactly one isolated Windows source or hosted installed mode/);
  await assertRefused({ SPS_DESKTOP_E2E_SOURCE: "1", SPS_DESKTOP_E2E_BINARY: "C:\\untrusted\\SPS Desktop.exe" }, [],
    /exactly one isolated Windows source or hosted installed mode/);
});

test("a local installed-binary invocation is rejected before fixture or account setup", { skip: process.platform !== "win32" }, async () => {
  await assertRefused({ SPS_DESKTOP_E2E_BINARY: "C:\\untrusted\\SPS Desktop.exe" }, [],
    /owned GitHub-hosted Windows CI launcher/);
});

test("the source smoke preserves the pinned historical migration and restart proof without migration shortcuts", async () => {
  const source = await read("../scripts/smoke-historical-managed-vault-desktop.mjs");
  const prepare = source.indexOf("await prepareHistoricalManagedVault({ fixture, profile })");
  const rewrite = source.indexOf("await rewriteAsLegacyV11State(profile, fixture, credentials)");
  const firstMain = source.indexOf("const migrated = await launch(origin)");
  const firstVerify = source.indexOf("const firstHistory = await verifyMain(migrated, expected, prepared)");
  const verifyData = source.indexOf("const historySha256 = await verifyData(prepared)");
  const verifyWorkspace = source.indexOf("const workspace = await waitFor(() => running.app.windows()");
  const restart = source.indexOf("const restarted = await launch(origin)");
  const restartVerify = source.indexOf("assert.equal(await verifyMain(restarted, expected, prepared), firstHistory)");
  assert.ok(prepare >= 0 && prepare < rewrite && rewrite < firstMain && firstMain < firstVerify
    && firstVerify < restart && restart < restartVerify && verifyData < verifyWorkspace,
  "must prepare the pinned fixture, project v11, run real Main, verify data, then restart and verify again");
  assert.match(source, /assert\.equal\(prepared\.currentMigrationsApplied, false\)/);
  assert.match(source, /assert\.equal\(persisted\.version, 13\)/);
  assert.match(source, /history\.length, 176/);
  assert.match(source, /historicalMigrations: 157, currentMigrations: 176/);
  assert.match(source, /restoreUsed: false/);
  assert.match(source, /installedHistoricalFixtureInPlaceMigrationQualified: Boolean\(binary\)/);
  assert.match(source, /sourceHistoricalFixtureInPlaceMigrationQualified: !binary/);
  assert.match(source, /signedInstallerQualified: false/);
  assert.match(source, /previousStableUpgradeQualified: false/);
  assert.match(source, /normalUserProfileStartupQualified: false/);
  assert.match(source, /physicalTwoDeviceQualified: false/);
  assert.match(source, /status\.desktopAccount\.signedIn, true/);
  assert.match(source, /realDpapiCredentialsAndKeyPreserved: true/);
  assert.ok(source.indexOf("if (binary) assertHostedInstallerCi()") < source.indexOf("const fixture = await createWorkspaceE2eFixture()"),
    "installed mode must pass its hosted guard before fixture creation");
  assert.match(source, /const app = await electron\.launch\(/);
  assert.match(source, /captureLegacyStateEvidence\(initial\.app, "sps-desktop-e2e-owner"\)/);
  assert.match(source, /captureLegacyStateEvidence\(running\.app, expected\.accountSubject\)/);
  const cleared = ["DATABASE_URL", "PAPERCLIP_CONFIG", "PAPERCLIP_HOME", "PAPERCLIP_INSTANCE_ID",
    "PAPERCLIP_MIGRATION_AUTO_APPLY", "PAPERCLIP_MIGRATION_PROMPT"];
  for (const key of cleared) assert.ok(source.includes(JSON.stringify(key)), `${key} is cleared from the real Main environment`);
  assert.match(source, /for \(const key of \["DATABASE_URL",\s*"PAPERCLIP_CONFIG",\s*"PAPERCLIP_HOME",\s*"PAPERCLIP_INSTANCE_ID",\s*"PAPERCLIP_MIGRATION_AUTO_APPLY",\s*"PAPERCLIP_MIGRATION_PROMPT"\]\) delete env\[key\]/);
  assert.doesNotMatch(source, /(?:PAPERCLIP_MIGRATION_AUTO_APPLY|PAPERCLIP_MIGRATION_PROMPT)\s*[:=]\s*["']?true/i);
  assert.doesNotMatch(source, /restore(?:Database|Profile|Vault)|force(?:d)?Migration|skipMigration/i);
});

test("historical account evidence reuses Main safeStorage helpers without substituting authentication", async () => {
  const acceptance = await read("../scripts/legacy-desktop-state-acceptance.mjs");
  const projection = await read("../scripts/legacy-desktop-state-fixture.mjs");
  const smoke = await read("../scripts/smoke-historical-managed-vault-desktop.mjs");
  assert.match(smoke, /import \{ captureLegacyStateEvidence, rewriteAsLegacyV11State \} from "\.\/legacy-desktop-state-acceptance\.mjs"/);
  assert.match(acceptance, /app\.evaluate\(\(\{ app, safeStorage \}/);
  assert.match(acceptance, /safeStorage\.isEncryptionAvailable\(\)/);
  assert.match(acceptance, /safeStorage\.decryptString\(Buffer\.from\(value, "base64"\)\)/);
  assert.match(acceptance, /safeStorage\.encryptString\(privateKeyPem\)/);
  assert.match(projection, /projectLegacyDesktopStateV11/);
  assert.match(projection, /HISTORICAL_DESKTOP_STATE_VERSION = 11/);
  assert.match(acceptance, /assert\.equal\(legacy\.encryptedDesktopAccount, current\.encryptedDesktopAccount\)/);
  assert.match(smoke, /await initial\.setup\.locator\("#start-sps-account"\)\.click\(\)/);
  assert.match(smoke, /await fetch\(authorization,/);
  assert.match(smoke, /status\.desktopAccount\.signedIn && !status\.desktopAccount\.pending/);
  assert.match(smoke, /assert\.equal\(status\.desktopAccount\.signedIn, true\)/);
  assert.doesNotMatch(smoke, /encryptedDesktopAccount\s*[:=]\s*["'`]|encryptedDesktopAccount\s*=\s*Buffer|\b(?:fake|mock|stub)Account(?:Token|Credential|Session)/);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { setSpsAccountConnection } from "../src/account-connections.mjs";
import { createMockIdentityServer } from "./desktop-e2e-identity.mjs";
import { parseE2eHostReadyTimeout } from "./e2e-host-ready-timeout.mjs";
import { prepareHistoricalManagedVault } from "./historical-managed-vault-fixture.mjs";
import { assertHostedInstallerCi, assertPlainDirectory } from "./installer-ci-safety.mjs";
import { captureLegacyStateEvidence, rewriteAsLegacyV11State } from "./legacy-desktop-state-acceptance.mjs";
import { validateOwnerVaultE2eCleanup } from "./owner-vault-e2e-cleanup-contract.mjs";
import { shutdownPreviewE2eDesktop } from "./preview-e2e-shutdown.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";
import { createWorkspaceE2eChildTracker } from "./workspace-e2e-child-tracker.mjs";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";

// Refuse local installed profiles and arbitrary binary paths before any I/O.
const binary = process.env.SPS_DESKTOP_E2E_BINARY;
const source = process.env.SPS_DESKTOP_E2E_SOURCE === "1";
const delegated = process.argv.includes(OWNED_JOB_CLEANUP_ARGUMENT);
if (process.platform !== "win32" || Boolean(binary) === source
  || source && delegated
  || process.argv.slice(2).some(arg => arg !== OWNED_JOB_CLEANUP_ARGUMENT)
  || process.argv.slice(2).length > 1) {
  throw new Error("Historical in-place Main acceptance requires exactly one isolated Windows source or hosted installed mode.");
}
if (binary) assertHostedInstallerCi();
const root = path.resolve(import.meta.dirname, "..");
const core = path.resolve(root, "../../external/sps-core");
const exec = promisify(execFile);
const hash = value => createHash("sha256").update(value).digest("hex");
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const timeout = parseE2eHostReadyTimeout(process.env.SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS);
let installedArtifacts = null;
if (binary) {
  assert.ok(path.isAbsolute(binary));
  assert.equal(path.basename(binary), "SPS Desktop.exe");
  const installation = await assertPlainDirectory(path.dirname(binary));
  const installationFixture = path.dirname(installation);
  assert.equal(path.basename(installation), "SPS Desktop");
  assert.match(path.basename(installationFixture), /^sps-installer-data-[A-Za-z0-9]+$/);
  assert.ok(samePath(path.dirname(installationFixture), await realpath(os.tmpdir())));
  const files = { executable: binary, appAsar: path.join(installation, "resources/app.asar"),
    runtimeArchive: path.join(installation, "resources/sps-owner-host-runtime-package/sps-owner-host-runtime.tgz") };
  installedArtifacts = {};
  for (const [key, file] of Object.entries(files)) {
    const stat = await lstat(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && stat.size > 0);
    installedArtifacts[key] = hash(await readFile(file));
  }
}
const { _electron: electron } = createRequire(path.join(core, "package.json"))("@playwright/test");
const identity = createMockIdentityServer();
const tracker = createWorkspaceE2eChildTracker();
const fixture = await createWorkspaceE2eFixture();
const profile = path.join(fixture.directory, "migration-profile");
await mkdir(profile);
const owned = new Set();
const phases = [];
let applicationOutput = "";
let failure;
let evidence;

async function waitFor(check, description, limit = timeout) {
  const deadline = Date.now() + limit;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out during historical in-place ${description}.`);
}

async function launch(origin) {
  await fixture.assertCurrent();
  const env = { ...process.env, SPS_IDENTITY_URL: origin, SPS_DESKTOP_E2E: "1",
    SPS_DESKTOP_E2E_USER_DATA_DIR: profile, SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1",
    SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SPS_DESKTOP_DEV;
  for (const key of ["DATABASE_URL", "PAPERCLIP_CONFIG", "PAPERCLIP_HOME", "PAPERCLIP_INSTANCE_ID",
    "PAPERCLIP_MIGRATION_AUTO_APPLY", "PAPERCLIP_MIGRATION_PROMPT"]) delete env[key];
  const app = await electron.launch({ executablePath: binary || path.join(root, "node_modules/electron/dist/electron.exe"),
    args: [...(binary ? [] : ["."]), `--user-data-dir=${profile}`], cwd: root, env, timeout: 60_000 });
  owned.add(app);
  tracker.track(app.process());
  for (const stream of [app.process().stdout, app.process().stderr]) stream?.on("data", chunk => {
    applicationOutput = `${applicationOutput}${chunk}`.slice(-24_000);
  });
  const setup = await waitFor(() => app.windows().find(page => page.url().startsWith("file:")), "setup");
  await setup.waitForFunction(() => Boolean(window.spsDesktop), { timeout: 30_000 });
  const actual = await app.evaluate(({ app }, profile) => ({ packaged: app.isPackaged,
    sameProfile: app.getPath("userData").toLowerCase() === profile.toLowerCase(), version: app.getVersion() }), profile);
  assert.equal(actual.packaged, Boolean(binary));
  assert.equal(actual.sameProfile, true);
  assert.equal(actual.version, JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version);
  return { app, setup };
}

async function stop(app) {
  const child = app.process();
  const outcome = await shutdownPreviewE2eDesktop({ child,
    requestBrowserClose: () => app.evaluate(({ app }) => app.quit()),
    forceStop: async () => {
      if (child.exitCode !== null) return;
      const exited = once(child, "exit");
      await exec("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15_000 });
      await exited;
    } });
  assert.equal(outcome.graceful, true, "Forced termination cannot qualify in-place migration.");
  const result = await tracker.waitForOutputEnd(5_000);
  assert.equal(result.orderly, result.children);
  assert.equal(result.outputEnded, result.children * 2);
  assert.equal(result.outputFailed, 0);
  owned.delete(app);
}

async function verifyData(prepared) {
  await fixture.assertCurrent();
  const config = JSON.parse(await readFile(prepared.configPath, "utf8"));
  assert.ok(samePath(await realpath(config.database.embeddedPostgresDataDir), prepared.databaseDir));
  const port = config.database.embeddedPostgresPort;
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  const postgres = createRequire(path.join(core, "packages/db/package.json"))("postgres");
  const sql = postgres(`postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`, { max: 1, connect_timeout: 5, onnotice() {} });
  try {
    assert.ok(samePath(await realpath((await sql`SHOW data_directory`)[0].data_directory), prepared.databaseDir));
    const history = (await sql`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at, hash`).map(row => row.hash);
    assert.equal(history.length, 176);
    assert.deepEqual(history.slice(0, prepared.oldHistory.length), prepared.oldHistory);
    const rows = await sql`SELECT id, company_id, name, description, env, created_at, updated_at FROM projects ORDER BY id`;
    assert.equal(hash(JSON.stringify(rows)), prepared.projectsSha256);
    assert.equal((await sql`SELECT to_regclass('public.sps_plugin_package_operations') IS NOT NULL AS value`)[0].value, true);
    assert.equal(hash(await readFile(path.join(prepared.vaultRoot, prepared.attachment))), prepared.attachmentSha256);
    return hash(JSON.stringify(history));
  } finally { await sql.end({ timeout: 5 }); }
}

async function verifyMain(running, expected, prepared) {
  const status = await waitFor(async () => {
    const result = await running.setup.evaluate(() => window.spsDesktop.getStatus());
    if (result.ownerHost.state === "stopped" && result.ownerHost.lastError) throw new Error(result.ownerHost.lastError);
    return result.ownerHost.state === "running" ? result : null;
  }, "Host readiness");
  assert.equal(status.desktopAccount.signedIn, true);
  assert.equal(status.profile.connectionKind, "owner-host");
  assert.ok(samePath(status.ownerHost.vaultPath, prepared.vaultRoot));
  const current = (await captureLegacyStateEvidence(running.app, expected.accountSubject)).snapshot;
  // Runtime-selected company/Node routing may initialize normally. Existing
  // account plaintext, DPAPI signing key and Host ownership must not change.
  for (const key of ["accountSubject", "accountDigest", "desktopDeviceId", "ownerHostOwnerSubject",
    "nodePublicKeyPem", "nodePrivateKeyDigest", "transportPublicKeyPem", "transportPrivateKeyDigest",
    "boardCredentialDigest", "teamCredentialDigest", "hostProjectShareSecretDigest"]) {
    assert.deepEqual(current[key], expected[key], `Persisted migration evidence changed: ${key}`);
  }
  const persisted = JSON.parse(await readFile(path.join(profile, "sps-desktop-state.json"), "utf8"));
  assert.equal(persisted.version, 13);
  const historySha256 = await verifyData(prepared);
  const workspace = await waitFor(() => running.app.windows().find(page => /^http:\/\/127\.0\.0\.1:\d+\//.test(page.url())), "Workspace");
  await workspace.waitForFunction(async email => {
    if (document.readyState !== "complete" || document.visibilityState !== "visible" || !document.body?.childElementCount
      || typeof window.spsDesktopWorkspace?.getDesktopAccount !== "function") return false;
    const account = await window.spsDesktopWorkspace.getDesktopAccount();
    return account?.signedIn === true && account.email === email;
  }, status.desktopAccount.email, { timeout: 30_000 });
  for (const [company, project] of [[prepared.company, prepared.project], [prepared.secondCompany, prepared.secondProject]]) {
    const rows = await workspace.evaluate(async id => {
      const response = await fetch(`/api/companies/${id}/projects`, { credentials: "include" });
      if (!response.ok) throw new Error(`Historical in-place Workspace API returned ${response.status}.`);
      return response.json();
    }, company.id);
    assert.ok(rows.some(row => row.id === project.id && row.name === project.name
      && row.description === prepared.project.description), "The authenticated Workspace lost its historical project metadata.");
  }
  return historySha256;
}

try {
  const { origin } = await identity.start();
  const initial = await launch(origin);
  await initial.setup.locator("#start-sps-account").click();
  const authorization = await waitFor(() => identity.capturedAuthorizationUrls.shift(), "sign-in capture", 30_000);
  assert.equal(new URL(authorization).origin, origin);
  assert.equal((await fetch(authorization, { signal: AbortSignal.timeout(30_000) })).status, 200);
  await waitFor(async () => {
    const status = await initial.setup.evaluate(() => window.spsDesktop.getStatus());
    assert.equal(status.profile, null);
    return status.desktopAccount.signedIn && !status.desktopAccount.pending;
  }, "sign-in", 30_000);
  const credentials = await captureLegacyStateEvidence(initial.app, "sps-desktop-e2e-owner");
  const initialStatus = await initial.setup.evaluate(() => window.spsDesktop.getStatus());
  await stop(initial.app);
  phases.push("actual-main-account-encrypted-and-closed-before-historical-preparation");
  const prepared = await prepareHistoricalManagedVault({ fixture, profile });
  assert.equal(prepared.currentMigrationsApplied, false);
  assert.equal(prepared.ownedPostgresStopped, true);
  const statePath = path.join(profile, "sps-desktop-state.json");
  const stateStat = await lstat(statePath);
  assert.ok(stateStat.isFile() && !stateStat.isSymbolicLink() && stateStat.nlink === 1);
  const state = JSON.parse((await readFile(statePath, "utf8")).replace(/^\uFEFF/, ""));
  assert.equal(state.version, 13);
  assert.equal(state.profile, null);
  state.profile = { hubUrl: `http://127.0.0.1:${prepared.config.server.port}`, connectionKind: "owner-host",
    companyId: "", displayName: initialStatus.desktopAccount.name, defaultWorkspacePath: "",
    projectWorkspaces: {}, workspaceSources: [] };
  state.ownerHostOwnerSubject = credentials.snapshot.accountSubject;
  state.accountConnections = setSpsAccountConnection(state.accountConnections, state.ownerHostOwnerSubject, state.profile);
  await fixture.assertCurrent();
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { flag: "w" });
  await rewriteAsLegacyV11State(profile, fixture, credentials);
  const expected = { ...credentials.snapshot, ownerHostOwnerSubject: state.ownerHostOwnerSubject };
  phases.push("same-profile-pinned-157-schema-and-v11-state-prepared-without-current-migrations-or-restore");
  const migrated = await launch(origin);
  const firstHistory = await verifyMain(migrated, expected, prepared);
  await stop(migrated.app);
  phases.push("actual-main-in-place-migrates-to-176-and-v13-without-sign-in-or-restore");
  const restarted = await launch(origin);
  assert.equal(await verifyMain(restarted, expected, prepared), firstHistory);
  await stop(restarted.app);
  phases.push("same-data-account-and-signing-key-preserved-after-restart");
  let candidate = null;
  if (binary) {
    const materialized = path.join(profile, "owner-host-runtime", JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).version);
    const baseline = JSON.parse(await readFile(path.join(materialized, "sps-release-baseline.json"), "utf8"));
    const expectedBaseline = JSON.parse(await readFile(path.join(root, ".owner-host-runtime/sps-release-baseline.json"), "utf8"));
    assert.deepEqual(baseline, expectedBaseline);
    assert.equal(baseline.sourceDirty || baseline.core.dirty || baseline.pluginSdk.dirty, false);
    candidate = { baseline, installedArtifacts };
  }
  evidence = { kind: binary ? "installed-historical-profile-in-place-acceptance" : "source-historical-profile-in-place-acceptance",
    candidate, phases, mockIdentity: true, historicalMigrations: 157, currentMigrations: 176,
    installedHistoricalFixtureInPlaceMigrationQualified: Boolean(binary),
    sourceHistoricalFixtureInPlaceMigrationQualified: !binary, realDpapiCredentialsAndKeyPreserved: true,
    restoreUsed: false, signedInstallerQualified: false, previousStableUpgradeQualified: false,
    normalUserProfileStartupQualified: false, physicalTwoDeviceQualified: false };
} catch (error) {
  failure = error;
  console.error(applicationOutput.slice(-10_000));
} finally {
  const errors = [];
  for (const app of owned) await stop(app).catch(error => errors.push(error));
  let identityClosed = false;
  await identity.close().then(() => { identityClosed = true; }).catch(error => errors.push(error));
  const processes = await tracker.waitForOutputEnd(5_000);
  tracker.dispose();
  let fixtureProcessesAbsent = delegated ? null : false;
  if (!delegated) {
    const script = `$root = ${JSON.stringify(fixture.directory.replaceAll("\\", "/"))}\n`
      + "$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and "
      + "(($_.CommandLine -replace '\\\\', '/').IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) })\n"
      + "if ($matches.Count -ne 0) { throw 'Owned historical migration processes remain.' }";
    await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 20_000, windowsHide: true })
      .then(() => { fixtureProcessesAbsent = true; }).catch(error => errors.push(error));
  }
  try { validateOwnerVaultE2eCleanup({ ...processes, expectedCrashCount: 0, confirmedCrashCount: 0,
    fixtureProcessesAbsent, identityClosed, delegatedJobCleanup: delegated }); } catch (error) { errors.push(error); }
  if (!failure && !errors.length) await fixture.remove().catch(error => errors.push(error));
  if (failure || errors.length) throw new AggregateError([...(failure ? [failure] : []), ...errors], "Historical in-place Main acceptance did not qualify; preserve its owned fixture.");
}
await new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify({ ...evidence,
  ownedMainOutputAndTemporaryDataCleanup: true, wholeDescendantJobQualification: false,
  ...(delegated ? { ownedJobCleanup: "pending-external-observation" } : {}) })}\n`, error => error ? reject(error) : resolve()));
if (delegated) process.exit(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE);

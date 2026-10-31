import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { createMockIdentityServer } from "./desktop-e2e-identity.mjs";
import { parseE2eHostReadyTimeout } from "./e2e-host-ready-timeout.mjs";
import { shutdownPreviewE2eDesktop } from "./preview-e2e-shutdown.mjs";
import { createWorkspaceE2eChildTracker } from "./workspace-e2e-child-tracker.mjs";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";
import { captureLegacyStateEvidence, rewriteAsLegacyV11State } from "./legacy-desktop-state-acceptance.mjs";
import { validateOwnerVaultE2eCleanup } from "./owner-vault-e2e-cleanup-contract.mjs";
import { observeTransferWindows } from "./owner-vault-window-observation.mjs";
import { readSpsOwnerVaultRestoreReceipt } from "../src/owner-vault-restore-receipt.mjs";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";
import { assertWorkspaceOpenAccountFence } from "./workspace-open-account-fence-acceptance.mjs";
import { assertWorkspaceNavigationRetry } from "./workspace-navigation-retry-acceptance.mjs";
import { seedReviewedTransferPlugin, resetTransferPluginImportProbe, reviewRestoredTransferPlugin, assertRestoredTransferPluginData, seedBundledTransferReviewCanary, assertBundledTransferReviewPending, approveRestoredCurrentAppBundle } from "./owner-vault-plugin-acceptance.mjs";

const root = path.resolve(import.meta.dirname, "..");
const core = path.resolve(root, "../../external/sps-core");
const require = createRequire(path.join(core, "package.json"));
const { _electron: electron } = require("@playwright/test");
const timeout = parseE2eHostReadyTimeout(process.env.SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS);
const execFileAsync = promisify(execFile);
const crashAfterPromotion = process.argv.includes("--crash-after-promotion");
const legacyDesktopState = process.argv.includes("--legacy-desktop-state");
const historicalCoreBackup = process.argv.includes("--historical-core-backup");
const ownedJobCleanupPending = process.argv.includes(OWNED_JOB_CLEANUP_ARGUMENT);
if ([crashAfterPromotion, legacyDesktopState, historicalCoreBackup].filter(Boolean).length > 1) throw new Error("Legacy Desktop state, historical Core backup and crash recovery are separate acceptance modes.");
if (process.argv.slice(2).some(arg => !["--crash-after-promotion", "--legacy-desktop-state", "--historical-core-backup", OWNED_JOB_CLEANUP_ARGUMENT].includes(arg))) {
  throw new Error("Unknown transfer acceptance mode.");
}
if (process.platform !== "win32") throw new Error("Owner Vault Main acceptance requires Windows.");
if (process.env.SPS_DESKTOP_E2E_BINARY) throw new Error("This acceptance is source-only, not signed release evidence.");

const identity = createMockIdentityServer();
const tracker = createWorkspaceE2eChildTracker();
const fixture = await createWorkspaceE2eFixture();
const sourceProfile = path.join(fixture.directory, "source");
const targetProfile = path.join(fixture.directory, "target");
const exportDirectory = path.join(fixture.directory, "export");
const ownedApps = new Set();
const phases = [];
const crashedApps = new Set();
let confirmedCrashCount = 0;
let failure;
let applicationOutput = "";
let historicalEvidence;
let registryPluginEvidence;
let bundledReviewEvidence;

async function bounded(operation, description) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out during ${description}.`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

async function waitFor(check, description, limit = timeout) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    const value = await check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

async function launch(profile, origin) {
  await fixture.assertCurrent();
  await mkdir(profile, { recursive: true });
  const env = { ...process.env, SPS_IDENTITY_URL: origin,
    SPS_DESKTOP_E2E: "1", SPS_DESKTOP_E2E_USER_DATA_DIR: profile,
    SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1", SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SPS_DESKTOP_DEV;
  const app = await electron.launch({ executablePath: path.join(root, "node_modules/electron/dist/electron.exe"),
    args: [`.`, `--user-data-dir=${profile}`], cwd: root, env, timeout: 60_000 });
  ownedApps.add(app);
  const child = app.process();
  tracker.track(child);
  for (const stream of [child.stdout, child.stderr]) stream?.on("data", chunk => {
    applicationOutput = `${applicationOutput}${chunk}`.slice(-32_000);
  });
  const page = await waitFor(() => app.windows().find(page => page.url().startsWith("file:")), "Desktop setup");
  await page.waitForFunction(() => Boolean(window.spsDesktop), { timeout: 30_000 });
  return { app, page };
}

async function signIn(page, origin) {
  const status = await page.evaluate(() => window.spsDesktop.getStatus());
  if (status.desktopAccount.signedIn && !status.desktopAccount.pending) return;
  await page.locator("#start-sps-account").click();
  const url = await waitFor(() => identity.capturedAuthorizationUrls.shift(), "isolated sign-in capture", 30_000);
  assert.equal(new URL(url).origin, origin);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  await waitFor(async () => {
    const account = (await page.evaluate(() => window.spsDesktop.getStatus())).desktopAccount;
    return account.signedIn && !account.pending;
  },
    "Desktop account", 30_000);
}

async function workspace(app, setup) {
  try {
    return await waitFor(async () => {
      const status = await setup.evaluate(() => window.spsDesktop.getStatus());
      if (status.ownerHost.lastError && status.ownerHost.state === "stopped") {
        throw new Error(`Owner Host startup failed: ${status.ownerHost.lastError}`);
      }
      return app.windows().find(page => /^http:\/\/127\.0\.0\.1:\d+\//.test(page.url()));
    }, "authenticated Workspace");
  } catch (error) {
    console.error(`[vault-transfer-window-observation] ${JSON.stringify({ stage: "wait-failed",
      ...await observeTransferWindows(app) })}`);
    throw error;
  }
}

async function readyHost(setup) {
  await waitFor(async () => {
    const { ownerHost } = await setup.evaluate(() => window.spsDesktop.getStatus());
    if (ownerHost.state === "stopped" && ownerHost.lastError) throw new Error(ownerHost.lastError);
    return ownerHost.state === "running";
  }, "Host readiness before using the Workspace action");
}

async function api(page, route, options = {}) {
  return await page.evaluate(async ({ route, options }) => {
    const response = await fetch(route, { credentials: "include", ...options,
      headers: { "content-type": "application/json" },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
    const text = await response.text();
    if (!response.ok) throw new Error(`Fixture API failed (${response.status}): ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  }, { route, options });
}

async function stop(app) {
  const child = app.process();
  const stopped = await shutdownPreviewE2eDesktop({ child,
    requestBrowserClose: () => app.evaluate(({ app }) => app.quit()),
    forceStop: async () => {
      if (child.exitCode !== null) return;
      const exited = once(child, "exit");
      await execFileAsync("taskkill.exe", ["/pid", String(child.pid), "/T", "/F"],
        { timeout: 15_000, windowsHide: true });
      await exited;
    } });
  assert.equal(stopped.graceful, true, "Forced shutdown cannot qualify a transfer or permit fixture deletion.");
  const output = await tracker.waitForOutputEnd(5000);
  assert.equal(output.orderly + confirmedCrashCount, output.children);
  assert.equal(output.outputEnded, output.children * 2);
  assert.equal(output.outputFailed, 0);
  ownedApps.delete(app);
}

async function assertMigratedMain(app, expectedEvidence) {
  const status = await app.windows().find(page => page.url().startsWith("file:")).evaluate(() => window.spsDesktop.getStatus());
  assert.equal(status.desktopAccount.signedIn, true, "Migration must restore the existing account without signing in again.");
  assert.equal(status.profile?.connectionKind, "owner-host");
  await readyHost(app.windows().find(page => page.url().startsWith("file:")));
  const evidence = await captureLegacyStateEvidence(app, expectedEvidence.accountSubject);
  assert.deepEqual(evidence.snapshot, expectedEvidence, "DPAPI-backed account, route, Node identity, and secrets changed across restart.");
  const persistedVersion = await app.evaluate(({ app }) => {
    const fs = process.getBuiltinModule("fs");
    const path = process.getBuiltinModule("path");
    return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "sps-desktop-state.json"), "utf8")).version;
  });
  assert.equal(persistedVersion, 13, "Current Main must persist the migrated state in the current format.");
}

async function exitAfterPromotion(app, profile) {
  await app.evaluate(({ app }, profile) => {
    const fs = process.getBuiltinModule("fs/promises");
    const path = process.getBuiltinModule("path");
    const originalRename = fs.rename;
    const target = path.join(profile, "owner-vault");
    let armed = true;
    fs.rename = async (...args) => {
      const [source, destination] = args;
      const selected = armed && destination === target && path.dirname(source) === profile
        && /^owner-vault\.restore-[0-9a-f-]{36}$/.test(path.basename(source));
      const result = await originalRename(...args);
      if (selected) {
        armed = false;
        // This is a source-only fault injection, after the actual rename.
        // app.exit intentionally skips Main's normal quit/drain handlers.
        app.exit(71);
      }
      return result;
    };
  }, profile);
}

async function observePromotionExit(app, setup) {
  const child = app.process();
  let timer;
  const exited = once(child, "exit");
  const operation = setup.evaluate(() => window.spsDesktop.restoreOwnerServer());
  // A disappearing renderer rejects its pending IPC; only the exact observed
  // process exit and on-disk receipt can qualify the intended fault boundary.
  const outcome = operation.then(() => "returned", () => "disconnected");
  try {
    const [code, signal] = await Promise.race([exited, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Promotion fault did not terminate its owned Main.")), timeout);
    })]);
    assert.equal(code, 71);
    assert.equal(signal, null);
    assert.equal(await bounded(outcome, "interrupted renderer IPC closure"), "disconnected");
    crashedApps.add(app);
    confirmedCrashCount += 1;
    ownedApps.delete(app);
    const output = await tracker.waitForOutputEnd(10_000);
    assert.equal(output.exited, output.children);
    assert.equal(output.outputEnded, output.children * 2);
    assert.equal(output.outputFailed, 0);
    if (!ownedJobCleanupPending) await assertNoFixtureProcesses();
  } finally { clearTimeout(timer); }
}

async function assertNoFixtureProcesses() {
  const script = `$root = ${JSON.stringify(fixture.directory.replaceAll("\\", "/"))}\n`
    + "$matches = @(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and "
    + "(($_.CommandLine -replace '\\\\', '/').IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0) })\n"
    + "if ($matches.Count -ne 0) { throw 'Owned transfer fixture processes remain.' }";
  await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script],
    { timeout: 20_000, windowsHide: true });
}

async function chooseOnly(app, title, directory) {
  // Playwright's documented native-dialog fixture changes only the selector,
  // never Main's export/restore handler or the Core/database implementation.
  await app.evaluate(({ dialog }, { title, directory }) => {
    if (globalThis.__spsTransferNativeDialogs) throw new Error("Native transfer picker fixture is already active.");
    globalThis.__spsTransferNativeDialogs = { showOpenDialog: dialog.showOpenDialog, showMessageBox: dialog.showMessageBox };
    dialog.showOpenDialog = async (...args) => {
      const options = args.at(-1);
      if (options.title !== title) throw new Error("Unexpected native folder dialog in transfer acceptance.");
      return { canceled: false, filePaths: [directory] };
    };
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      if (options.type !== "info") throw new Error("Unexpected confirmation in transfer acceptance.");
      return { response: 0, checkboxChecked: false };
    };
  }, { title, directory });
}

async function restoreNativeDialogs(app) {
  await app.evaluate(({ dialog }) => {
    const originals = globalThis.__spsTransferNativeDialogs;
    if (!originals) throw new Error("Native transfer picker fixture is not active.");
    dialog.showOpenDialog = originals.showOpenDialog;
    dialog.showMessageBox = originals.showMessageBox;
    delete globalThis.__spsTransferNativeDialogs;
  });
}

async function verifyHistoricalMainSchema() {
  await fixture.assertCurrent();
  const vault = path.join(targetProfile, "owner-vault");
  const config = JSON.parse(await readFile(path.join(vault, "config.json"), "utf8"));
  const expectedData = await realpath(path.join(vault, "database"));
  assert.equal(await realpath(config.database.embeddedPostgresDataDir), expectedData);
  const port = config.database.embeddedPostgresPort;
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
  const postgres = createRequire(path.join(core, "packages", "db", "package.json"))("postgres");
  const sql = postgres(`postgres://paperclip:paperclip@127.0.0.1:${port}/paperclip`, { max: 1, connect_timeout: 5, onnotice() {} });
  try {
    const rows = await sql`SHOW data_directory`;
    assert.equal(await realpath(rows[0].data_directory), expectedData, "Historical Main assertion reached a different database cluster");
    const history = await sql`SELECT hash, created_at::text AS created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, hash`;
    assert.equal(history.length, 176);
    assert.equal((await sql`SELECT to_regclass('public.sps_plugin_package_operations') IS NOT NULL AS present`)[0].present, true);
    await fixture.assertCurrent();
    return Array.from(history);
  } finally { await sql.end({ timeout: 5 }); }
}

try {
  await mkdir(exportDirectory);
  const { origin } = await identity.start();
  let exported, company, project, attachment, content;
  if (historicalCoreBackup) {
    const { prepareHistoricalOwnerTransfer } = await import("./historical-owner-transfer-fixture.mjs");
    historicalEvidence = await prepareHistoricalOwnerTransfer({ fixture, destinationRoot: exportDirectory });
    ({ company, project, attachment, content } = historicalEvidence);
    exported = historicalEvidence;
    phases.push("pinned-historical-schema-backup-prepared-and-owned-postgres-closed");
    console.log("[vault-transfer] exact historical schema backup prepared without running an old application");
  } else {
    const source = await launch(sourceProfile, origin);
    await signIn(source.page, origin);
    console.log("[vault-transfer] source sign-in settled");
    await source.page.locator("#create-owner-server").click();
    const sourceWorkspace = await workspace(source.app, source.page);
    const companies = await api(sourceWorkspace, "/api/companies");
    assert.ok(companies[0]?.id);
    company = companies[0];
    project = await api(sourceWorkspace, `/api/companies/${company.id}/projects`, {
      method: "POST", body: { name: "Transfer acceptance fixture", description: "Preserve this typed row across Main restore" } });
    assert.ok(project.id);
    const sourceStatus = await source.page.evaluate(() => window.spsDesktop.getStatus());
    content = Buffer.from("SPS transfer acceptance attachment\n");
    attachment = path.join("storage", "transfer-acceptance.txt");
    await mkdir(path.join(sourceStatus.ownerHost.vaultPath, "storage"), { recursive: true });
    await writeFile(path.join(sourceStatus.ownerHost.vaultPath, attachment), content, { flag: "wx" });
    if (!crashAfterPromotion && !legacyDesktopState) {
      registryPluginEvidence = await seedReviewedTransferPlugin({ app: source.app, workspace: sourceWorkspace, company, fixture, api, waitFor });
      bundledReviewEvidence = await seedBundledTransferReviewCanary({ workspace: sourceWorkspace, fixture, api });
      phases.push("reviewed-registry-plugin-and-distinct-workspace-data-seeded");
    }
    await chooseOnly(source.app, "Choose a folder for SPS Server export", exportDirectory);
    exported = await bounded(source.page.evaluate(() => window.spsDesktop.exportOwnerVaultTransfer()), "Main export");
    await restoreNativeDialogs(source.app);
    assert.ok(exported?.bundleRoot);
    phases.push("main-export");
    console.log("[vault-transfer] Main export complete");
    await stop(source.app);
    if (registryPluginEvidence) await resetTransferPluginImportProbe({ fixture, evidence: registryPluginEvidence });
    if (bundledReviewEvidence) await resetTransferPluginImportProbe({ fixture, evidence: bundledReviewEvidence });
  }

  const target = await launch(targetProfile, origin);
  await signIn(target.page, origin);
  console.log("[vault-transfer] fresh target sign-in settled");
  const before = await target.page.evaluate(() => window.spsDesktop.getStatus());
  assert.equal(before.profile, null);
  await chooseOnly(target.app, "Choose an SPS Server transfer folder to restore", exported.bundleRoot);
  let restoredApp = target;
  if (crashAfterPromotion) {
    await exitAfterPromotion(target.app, targetProfile);
    await observePromotionExit(target.app, target.page);
    const receipt = await readSpsOwnerVaultRestoreReceipt({ vaultRoot: path.join(targetProfile, "owner-vault") });
    assert.equal(receipt?.ownerSubject, "sps-desktop-e2e-owner");
    assert.deepEqual(await readFile(path.join(targetProfile, "owner-vault", attachment)), content);
    phases.push("abrupt-exit-after-real-promotion", "owner-receipt-and-file-retained");
    console.log("[vault-transfer] promotion fault observed; original account receipt and file retained");
    restoredApp = await launch(targetProfile, origin);
    await signIn(restoredApp.page, origin);
    await readyHost(restoredApp.page);
    const recovered = await restoredApp.page.evaluate(() => window.spsDesktop.getStatus());
    assert.equal(recovered.profile, null, "Interrupted activation must not invent a replacement connection.");
    await bounded(restoredApp.page.evaluate(() => window.spsDesktop.useOwnerHost()), "reopen recovered local Host");
    phases.push("explicit-original-account-host-reopen");
  }
  const restored = crashAfterPromotion
    ? await restoredApp.page.evaluate(() => window.spsDesktop.getStatus())
    : await bounded(target.page.evaluate(() => window.spsDesktop.restoreOwnerServer()), "Main restore");
  if (!crashAfterPromotion) await restoreNativeDialogs(target.app);
  assert.equal(restored.ownerHost.state, "running");
  assert.equal(restored.ownerHost.restoreAttempts.length, crashAfterPromotion ? 1 : 0);
  assert.equal(restored.profile.connectionKind, "owner-host");
  await bounded(restoredApp.page.evaluate(() => window.spsDesktop.openWorkspace()), "open restored Workspace");
  const restoredWorkspace = await workspace(restoredApp.app, restoredApp.page);
  const projects = await api(restoredWorkspace, `/api/companies/${company.id}/projects`);
  assert.ok(projects.some(row => row.id === project.id && row.name === project.name));
  if (historicalEvidence) {
    const oldProject = projects.find(row => row.id === project.id);
    assert.equal(oldProject.description, project.description);
    const second = await api(restoredWorkspace, `/api/companies/${historicalEvidence.secondCompany.id}/projects`);
    assert.ok(second.some(row => row.id === historicalEvidence.secondProject.id && row.name === historicalEvidence.secondProject.name));
    historicalEvidence.currentHistory = await verifyHistoricalMainSchema();
    phases.push("historical-backup-restored-sanitized-and-upgraded-by-real-main", "both-historical-workspace-projects-retained");
  }
  assert.deepEqual(await readFile(path.join(restored.ownerHost.vaultPath, attachment)), content);
  if (bundledReviewEvidence) await assertBundledTransferReviewPending({ workspace: restoredWorkspace, fixture,
    vaultRoot: restored.ownerHost.vaultPath, evidence: bundledReviewEvidence, api, waitFor });
  if (registryPluginEvidence) {
    await reviewRestoredTransferPlugin({ app: restoredApp.app, workspace: restoredWorkspace, fixture,
      vaultRoot: restored.ownerHost.vaultPath, evidence: registryPluginEvidence, api, waitFor });
    phases.push("registry-package-bytes-restored-without-code-import", "new-host-reviewed-package-and-preserved-both-workspace-states");
  }
  if (bundledReviewEvidence) {
    await assertBundledTransferReviewPending({ workspace: restoredWorkspace, fixture,
      vaultRoot: restored.ownerHost.vaultPath, evidence: bundledReviewEvidence, api, waitFor });
    phases.push("current-official-bundle-remains-review-pending-after-unrelated-package-approval");
  }
  phases.push("main-restore-returned-running", "typed-row-and-attachment-preserved");
  console.log("[vault-transfer] restored Host running; typed row and attachment preserved");
  const legacyEvidence = legacyDesktopState
    ? await captureLegacyStateEvidence(restoredApp.app, "sps-desktop-e2e-owner")
    : null;
  await stop(restoredApp.app);

  if (legacyDesktopState) {
    await rewriteAsLegacyV11State(targetProfile, fixture, legacyEvidence);
    phases.push("closed-profile-projected-to-authentic-v11-state");
    const migrated = await launch(targetProfile, origin);
    await assertMigratedMain(migrated.app, legacyEvidence.snapshot);
    await bounded(migrated.page.evaluate(() => window.spsDesktop.openWorkspace()), "open migrated Workspace");
    const migratedWorkspace = await workspace(migrated.app, migrated.page);
    const migratedProjects = await api(migratedWorkspace, `/api/companies/${company.id}/projects`);
    assert.ok(migratedProjects.some(row => row.id === project.id && row.name === project.name));
    assert.deepEqual(await readFile(path.join(targetProfile, "owner-vault", attachment)), content);
    phases.push("v11-state-decrypted-and-upgraded-by-current-main", "core-db-row-and-vault-file-retained");
    await stop(migrated.app);

    const stable = await launch(targetProfile, origin);
    await assertMigratedMain(stable.app, legacyEvidence.snapshot);
    await bounded(stable.page.evaluate(() => window.spsDesktop.openWorkspace()), "reopen migrated Workspace");
    const stableWorkspace = await workspace(stable.app, stable.page);
    const stableProjects = await api(stableWorkspace, `/api/companies/${company.id}/projects`);
    assert.ok(stableProjects.some(row => row.id === project.id && row.name === project.name));
    assert.deepEqual(await readFile(path.join(targetProfile, "owner-vault", attachment)), content);
    phases.push("migrated-current-state-survives-second-restart");
    await stop(stable.app);
  } else {
    const restarted = await launch(targetProfile, origin);
    await signIn(restarted.page, origin);
    await readyHost(restarted.page);
    await bounded(restarted.page.evaluate(() => window.spsDesktop.openWorkspace()), "reopen restored Workspace");
    console.log(`[vault-transfer-window-observation] ${JSON.stringify({ stage: "restart-before-wait",
      ...await observeTransferWindows(restarted.app) })}`);
    const reopened = await workspace(restarted.app, restarted.page);
    const afterRestart = await api(reopened, `/api/companies/${company.id}/projects`);
    assert.ok(afterRestart.some(row => row.id === project.id));
    if (registryPluginEvidence) {
      await assertRestoredTransferPluginData({ workspace: reopened, evidence: registryPluginEvidence, api, waitFor });
      phases.push("reviewed-restored-package-and-workspace-data-retained-after-restart");
    }
    if (bundledReviewEvidence) {
      await assertBundledTransferReviewPending({ workspace: reopened, fixture,
        vaultRoot: path.join(targetProfile, "owner-vault"), evidence: bundledReviewEvidence, api, waitFor, requireNewStartup: true });
      phases.push("official-bundle-review-required-after-real-main-restart");
      await approveRestoredCurrentAppBundle({ app: restarted.app, workspace: reopened,
        evidence: bundledReviewEvidence, api, waitFor });
      phases.push("current-app-bundle-staged-without-import-declined-then-explicitly-approved");
    }
    if (historicalEvidence) {
      const second = await api(reopened, `/api/companies/${historicalEvidence.secondCompany.id}/projects`);
      assert.ok(second.some(row => row.id === historicalEvidence.secondProject.id));
      assert.deepEqual(await readFile(path.join(targetProfile, "owner-vault", attachment)), content);
      assert.deepEqual(await verifyHistoricalMainSchema(), historicalEvidence.currentHistory, "Host restart changed the completed migration history");
      phases.push("historical-core-data-and-file-retained-after-current-main-restart");
    }
    phases.push("restored-host-restart");
    console.log("[vault-transfer] restored Host restart complete");
    await stop(restarted.app);
    if (bundledReviewEvidence?.approved) {
      const approvedRestart = await launch(targetProfile, origin);
      await signIn(approvedRestart.page, origin);
      await readyHost(approvedRestart.page);
      await bounded(approvedRestart.page.evaluate(() => window.spsDesktop.openWorkspace()), "reopen explicitly approved bundle Host");
      const approvedWorkspace = await workspace(approvedRestart.app, approvedRestart.page);
      const record = await api(approvedWorkspace, `/api/plugins/${bundledReviewEvidence.pluginId}`);
      assert.equal(record.status, "ready");
      assert.equal(record.pluginKey, bundledReviewEvidence.pluginKey);
      assert.ok(record.manifestJson.capabilities.includes("memory.providers.register"));
      await assert.rejects(lstat(bundledReviewEvidence.manifestImportProbe), { code: "ENOENT" });
      await assertRestoredTransferPluginData({ workspace: approvedWorkspace, evidence: registryPluginEvidence, api, waitFor });
      phases.push("explicit-bundle-approval-and-other-workspace-data-survive-restart");
      const fence = await bounded(assertWorkspaceOpenAccountFence({ app: approvedRestart.app, setup: approvedRestart.page,
        identityOrigin: origin, signIn, waitFor, api, company, project, expectedUserData: targetProfile,
        expectedWorkspaceOrigin: new URL(approvedWorkspace.url()).origin }), "real Workspace account lifecycle fence");
      assert.ok(Object.values(fence).every(value => value === true));
      phases.push("real-sign-out-sign-in-discards-only-stale-unload-vetoing-workspace");
      const retryStatus = await approvedRestart.page.evaluate(() => window.spsDesktop.getStatus());
      const retry = await bounded(assertWorkspaceNavigationRetry({ app: approvedRestart.app, setup: approvedRestart.page,
        waitFor, api, company, project, expectedUserData: targetProfile,
        expectedWorkspaceOrigin: new URL(retryStatus.profile.hubUrl).origin }), "explicit Workspace navigation retry");
      assert.ok(Object.values(retry).every(value => value === true));
      phases.push("real-native-navigation-failure-explicit-retry-retains-authenticated-data");
      await stop(approvedRestart.app);
    }
  }
  assert.match(applicationOutput, /\[workspace-open\] operation=\d+,phase=workspace-load-complete/,
    "Real Main did not emit the fixed isolated Workspace navigation diagnostic.");
  phases.push("fixed-workspace-open-phase-diagnostics-observed");
} catch (error) {
  failure = error;
  // Keep diagnostics in the failed command output, never in public release assets.
  console.error(applicationOutput.slice(-12_000));
} finally {
  const cleanupErrors = [];
  for (const app of ownedApps) {
    try { await stop(app); } catch (error) { cleanupErrors.push(error); }
  }
  let identityClosed = false;
  await identity.close().then(() => { identityClosed = true; }).catch(error => cleanupErrors.push(error));
  const processes = await tracker.waitForOutputEnd(5000);
  tracker.dispose();
  let fixtureProcessesAbsent = ownedJobCleanupPending ? null : false;
  // The restricted CI parent owns the OS Job and must observe natural
  // emptiness after this child exits 76. Do not run WMI inside that token.
  if (!ownedJobCleanupPending) {
    await assertNoFixtureProcesses().then(() => { fixtureProcessesAbsent = true; }).catch(error => cleanupErrors.push(error));
  }
  try {
    validateOwnerVaultE2eCleanup({ ...processes, expectedCrashCount: crashAfterPromotion ? 1 : 0,
      confirmedCrashCount, fixtureProcessesAbsent, identityClosed, delegatedJobCleanup: ownedJobCleanupPending });
  } catch (error) { cleanupErrors.push(error); }
  if (!cleanupErrors.length) await fixture.remove().catch(error => cleanupErrors.push(error));
  if (failure || cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors],
    "Source Owner Vault Main acceptance did not qualify.");
}
const evidence = { kind: "source-main-transfer-acceptance", phases, mockIdentity: true,
  crashAfterPromotion, expectedCrashCount: crashedApps.size,
  legacyDesktopStateMigrationQualified: legacyDesktopState,
  historicalCoreBackupRestoreQualified: historicalCoreBackup,
  managedRegistryPluginTransferQualified: Boolean(registryPluginEvidence),
  restoredOfficialBundleApprovalRequiredQualified: Boolean(bundledReviewEvidence),
  currentAppBundleReapprovalQualified: bundledReviewEvidence?.approved === true,
  ...(historicalEvidence ? { historicalCoreSchema: historicalEvidence.baseline, historicalMigrations: historicalEvidence.oldMigrations } : {}),
  ...(historicalEvidence ? { currentMigrations: historicalEvidence.currentHistory.length } : {}),
  historicalInstalledDatabaseMigrationQualified: false,
  signedInstallerQualified: false, previousStableUpgradeQualified: false, physicalTwoDeviceQualified: false,
  ownedMainOutputAndTemporaryDataCleanup: true, wholeDescendantJobQualification: false,
  fixtureProcessScan: ownedJobCleanupPending ? "not-performed-external-job-pending" : "command-line-scan-passed",
  ...(ownedJobCleanupPending ? { ownedJobCleanup: "pending-external-observation" } : {}) };
await new Promise((resolve, reject) => process.stdout.write(`${JSON.stringify(evidence)}\n`, error => error ? reject(error) : resolve()));
if (ownedJobCleanupPending) process.exit(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE);

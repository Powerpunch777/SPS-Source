import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { createMockIdentityServer } from "./desktop-e2e-identity.mjs";
import { parseE2eHostReadyTimeout } from "./e2e-host-ready-timeout.mjs";
import { shutdownPreviewE2eDesktop } from "./preview-e2e-shutdown.mjs";
import { createWorkspaceE2eChildTracker } from "./workspace-e2e-child-tracker.mjs";
import { createWorkspaceE2eFixture } from "./workspace-e2e-fixture.mjs";

const root = path.resolve(import.meta.dirname, "..");
const core = path.resolve(root, "../../external/sps-core");
const require = createRequire(path.join(core, "package.json"));
const { _electron: electron } = require("@playwright/test");
const timeout = parseE2eHostReadyTimeout(process.env.SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS);
const execFileAsync = promisify(execFile);
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
let failure;
let applicationOutput = "";

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
  return await waitFor(async () => {
    const status = await setup.evaluate(() => window.spsDesktop.getStatus());
    if (status.ownerHost.lastError && status.ownerHost.state === "stopped") {
      throw new Error(`Owner Host startup failed: ${status.ownerHost.lastError}`);
    }
    return app.windows().find(page => /^http:\/\/127\.0\.0\.1:\d+\//.test(page.url()));
  }, "authenticated Workspace");
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
  assert.equal(output.orderly, output.children);
  assert.equal(output.outputEnded, output.children * 2);
  assert.equal(output.outputFailed, 0);
  ownedApps.delete(app);
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

try {
  await mkdir(exportDirectory);
  const { origin } = await identity.start();
  const source = await launch(sourceProfile, origin);
  await signIn(source.page, origin);
  console.log("[vault-transfer] source sign-in settled");
  await source.page.locator("#create-owner-server").click();
  const sourceWorkspace = await workspace(source.app, source.page);
  const companies = await api(sourceWorkspace, "/api/companies");
  assert.ok(companies[0]?.id);
  const company = companies[0];
  const project = await api(sourceWorkspace, `/api/companies/${company.id}/projects`, {
    method: "POST", body: { name: "Transfer acceptance fixture", description: "Preserve this typed row across Main restore" } });
  assert.ok(project.id);
  const sourceStatus = await source.page.evaluate(() => window.spsDesktop.getStatus());
  const content = Buffer.from("SPS transfer acceptance attachment\n");
  const attachment = path.join("storage", "transfer-acceptance.txt");
  await mkdir(path.join(sourceStatus.ownerHost.vaultPath, "storage"), { recursive: true });
  await writeFile(path.join(sourceStatus.ownerHost.vaultPath, attachment), content, { flag: "wx" });
  await chooseOnly(source.app, "Choose a folder for SPS Server export", exportDirectory);
  const exported = await bounded(source.page.evaluate(() => window.spsDesktop.exportOwnerVaultTransfer()), "Main export");
  assert.ok(exported?.bundleRoot);
  phases.push("main-export");
  console.log("[vault-transfer] Main export complete");
  await stop(source.app);

  const target = await launch(targetProfile, origin);
  await signIn(target.page, origin);
  console.log("[vault-transfer] fresh target sign-in settled");
  const before = await target.page.evaluate(() => window.spsDesktop.getStatus());
  assert.equal(before.profile, null);
  await chooseOnly(target.app, "Choose an SPS Server transfer folder to restore", exported.bundleRoot);
  const restored = await bounded(target.page.evaluate(() => window.spsDesktop.restoreOwnerServer()), "Main restore");
  assert.equal(restored.ownerHost.state, "running");
  assert.equal(restored.ownerHost.restoreAttempts.length, 0);
  assert.equal(restored.profile.connectionKind, "owner-host");
  await bounded(target.page.evaluate(() => window.spsDesktop.openWorkspace()), "open restored Workspace");
  const restoredWorkspace = await workspace(target.app, target.page);
  const projects = await api(restoredWorkspace, `/api/companies/${company.id}/projects`);
  assert.ok(projects.some(row => row.id === project.id && row.name === project.name));
  assert.deepEqual(await readFile(path.join(restored.ownerHost.vaultPath, attachment)), content);
  phases.push("main-restore-returned-running", "typed-row-and-attachment-preserved");
  console.log("[vault-transfer] restored Host running; typed row and attachment preserved");
  await stop(target.app);

  const restarted = await launch(targetProfile, origin);
  await signIn(restarted.page, origin);
  await readyHost(restarted.page);
  await bounded(restarted.page.evaluate(() => window.spsDesktop.openWorkspace()), "reopen restored Workspace");
  const reopened = await workspace(restarted.app, restarted.page);
  const afterRestart = await api(reopened, `/api/companies/${company.id}/projects`);
  assert.ok(afterRestart.some(row => row.id === project.id));
  phases.push("restored-host-restart");
  console.log("[vault-transfer] restored Host restart complete");
  await stop(restarted.app);
} catch (error) {
  failure = error;
  // Keep diagnostics in the failed command output, never in public release assets.
  console.error(applicationOutput.slice(-12_000));
} finally {
  const cleanupErrors = [];
  for (const app of ownedApps) {
    try { await stop(app); } catch (error) { cleanupErrors.push(error); }
  }
  await identity.close().catch(error => cleanupErrors.push(error));
  const processes = await tracker.waitForOutputEnd(5000);
  tracker.dispose();
  if (processes.orderly !== processes.children || processes.outputFailed
    || processes.outputEnded !== processes.children * 2) cleanupErrors.push(new Error("Owned Main/output cleanup incomplete."));
  await assertNoFixtureProcesses().catch(error => cleanupErrors.push(error));
  if (!cleanupErrors.length) await fixture.remove().catch(error => cleanupErrors.push(error));
  if (failure || cleanupErrors.length) throw new AggregateError([...(failure ? [failure] : []), ...cleanupErrors],
    "Source Owner Vault Main acceptance did not qualify.");
}
console.log(JSON.stringify({ kind: "source-main-transfer-acceptance", phases, mockIdentity: true,
  signedInstallerQualified: false, previousStableUpgradeQualified: false, physicalTwoDeviceQualified: false,
  ownedMainOutputAndTemporaryDataCleanup: true, wholeDescendantJobQualification: false }));

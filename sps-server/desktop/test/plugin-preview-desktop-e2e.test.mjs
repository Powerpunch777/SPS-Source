import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const harnessPath = path.join(desktopRoot, "scripts", "smoke-plugin-preview-desktop.mjs");
const packagePath = path.join(desktopRoot, "package.json");

test("Plugin Preview Desktop E2E harness preserves the real Phase 4 evidence contract", async () => {
  const [harness, packageJson] = await Promise.all([readFile(harnessPath, "utf8"), readFile(packagePath, "utf8")]);
  const manifest = JSON.parse(packageJson);
  assert.equal(manifest.scripts["test:e2e:plugin-preview"], "npm run sync:desktop-node && npm run sync:plugin-sdk && node scripts/smoke-plugin-preview-desktop.mjs");
  assert.equal(manifest.scripts["test:e2e:plugin-preview:live"], "npm run sync:desktop-node && npm run sync:plugin-sdk && node scripts/smoke-plugin-preview-desktop.mjs --live-authoring");
  assert.match(harness, /process\.argv\.includes\("--live-authoring"\)/);
  assert.match(harness, /dangerouslyBypassApprovalsAndSandbox: false/);
  assert.match(harness, /"--sandbox", "workspace-write"/);
  assert.ok(harness.includes('windows.sandbox="mxc"'));
  assert.match(harness, /verifyLiveBuilderChanges/);
  assert.match(harness, /liveRun.status, "succeeded"/);
  assert.match(harness, /installedInProduction: false/);
  assert.match(harness, /failed Preview feedback reached the existing draft/);
  assert.match(harness, /Adding feedback automatically sent an AI message/);
  assert.match(harness, /PREVIEW_CANDIDATE_FAILED/);
  assert.match(harness, /SPS_DESKTOP_E2E_BINARY/);
  assert.match(harness, /SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS/);
  assert.match(harness, /parseE2eHostReadyTimeout/);
  assert.match(harness, /sourceElectron/);
  assert.match(harness, /mockIdentity/);
  assert.match(harness, /openPluginRegistries/);
  assert.match(harness, /getDeveloperProjectContext/);
  assert.match(harness, /openDeveloperProjectContext/);
  assert.match(harness, /checkDeveloperAgentFolder/);
  assert.match(harness, /Folder check automatically sent a message/);
  assert.match(harness, /Lead folder configured-match\/mismatch\/unset checks preserved settings/);
  assert.match(harness, /canonicalPluginDirectory = await realpath\(pluginDirectory\)/);
  assert.match(harness, /\[canonicalPluginDirectory, "configured-match"\]/);
  assert.match(harness, /link-developer-context/);
  assert.match(harness, /oldContextToken/);
  assert.match(harness, /Unsent plugin draft/);
  assert.match(harness, /disconnected.missingProject, true/);
  assert.match(harness, /sps\.plugin-discovery:create-sps-plugin-project/);
  assert.match(harness, /run-sps-authoring-step/);
  assert.match(harness, /inspect-sps-plugin-build/);
  assert.match(harness, /open-sps-plugin-preview/);
  assert.match(harness, /create-sps-plugin-package/);
  assert.match(harness, /sps-plugin\.mjs/);
  assert.match(harness, /"pack"/);
  assert.match(harness, /inspectPluginArchive/);
  assert.match(harness, /lifecycleSnapshot/);
  assert.match(harness, /window\.spsRegistry\.connectDeveloperProject/);
  assert.match(harness, /window\.spsRegistry\.runDeveloperGates/);
  assert.match(harness, /window\.spsRegistry\.applyDeveloperCandidate/);
  assert.match(harness, /isolated Preview CDP target/);
  assert.match(harness, /__SPS_PLUGIN_PREVIEW_FIXTURE_V1__/);
  assert.match(harness, /updatePreviewEnvironment/);
  assert.match(harness, /Page\.crash/);
  assert.match(harness, /PREVIEW_RENDERER_GONE/);
  assert.match(harness, /listPreviewDiagnostics/);
  assert.match(harness, /waitFixture/);
  assert.match(harness, /workspaceTarget/);
  assert.match(harness, /page\.text\.includes\("Internal server error"\)/);
  assert.match(harness, /assert\.ok\(registration\.url\.includes\("\/dashboard"\) && registration\.text\.includes\(name\)/);
  assert.match(harness, /collectPreviewE2eHostDiagnostics\(\{ fixtureRoot: temporaryRoot \}\)/);
  assert.match(harness, /snapshotPreviewE2eFailure\(error, failurePhase\)/);
  assert.match(harness, /throw annotatePreviewE2eApiFailure\(/);
  for (const phase of ["owner_workspace", "builder_tools", "builder_project", "builder_surface", "developer_registry"]) {
    assert.ok(harness.includes(`"${phase}"`), `Missing finite Preview failure phase ${phase}`);
  }
  assert.ok(harness.indexOf('step("creating Builder authoring project", "builder_project")')
    < harness.indexOf('const projectRecord = await executeBuilderTool'), "Capture phase before the operation, not after it");
  const normalized = harness.replace(/\r\n/g, "\n");
  for (const input of [normalized, normalized.replace(/\n/g, "\r\n")]) {
    const canonical = input.replace(/\r\n/g, "\n");
    const start = canonical.indexOf("} catch (error) {\n  const notes = [];"), end = canonical.indexOf('} finally {\n  step("cleaning isolated');
    assert.ok(start >= 0 && end > start, "The failure block must be found for both LF and CRLF checkouts.");
    const failureCatch = canonical.slice(start, end);
    assert.match(failureCatch, /failureSha256/);
    assert.match(failureCatch, /serverErrorVisible/);
    assert.doesNotMatch(failureCatch, /output\.trim|title: document\.title|url: location\.href|text: document\.body/);
  }
  assert.match(harness, /stopTree/);
  assert.match(harness, /shutdownPreviewE2eDesktop/);
  assert.ok(harness.indexOf('const desktopStopped = await shutdownPreviewE2eDesktop') < harness.indexOf('Promise.all([setup, workspace, registry, preview]'));
  assert.match(harness, /desktopExitConfirmed: desktopStopped\.exitConfirmed, desktopGraceful: desktopStopped\.graceful/);
  assert.match(harness, /postgresCleanupConfirmed: postgresStopped, temporaryDataRemoved: dataRemoved/);
  assert.match(harness, /const postgresStopped = ownedJobCleanupPending \? null/);
  assert.match(harness, /process\.exit\(cleanupDisposition\.exitCode\)/);
  assert.match(harness, /standalone script is not qualified/);
  assert.ok(harness.lastIndexOf("SPS Plugin Preview Desktop E2E passed") > harness.indexOf('step("cleaning isolated E2E processes and data")'));
  assert.doesNotMatch(harness, /ipcMain|E2E-only IPC|test-only IPC/i);
});

test("Builder navigation text alone cannot qualify a control before the actual UI mounts", async () => {
  const harness = await readFile(harnessPath, "utf8");
  const encoded = harness.match(/page = await cdp\.evaluate\(("(?:[^"\\]|\\.)*")\); if \(predicate/);
  assert.ok(encoded, "Use the actual bounded page snapshot expression");
  const expression = JSON.parse(encoded[1]);
  const snapshot = button => runInNewContext(expression, { location: { href: "/builder" }, document: {
    title: "Plugin Builder", body: { innerText: "Plugin Builder" },
    querySelectorAll() { return button ? [button] : []; }, querySelector() { return null; },
  } });
  const button = { textContent: "작업 패널", disabled: false, getAttribute() { return null; }, getClientRects() { return [1]; } };
  assert.equal(snapshot(null).builderPanelToggleReady, false);
  assert.equal(snapshot(button).builderPanelToggleReady, true);
  assert.equal(snapshot({ ...button, disabled: true }).builderPanelToggleReady, false);
  assert.equal(snapshot({ ...button, getAttribute() { return "true"; } }).builderPanelToggleReady, false);
  assert.equal(snapshot({ ...button, getClientRects() { return []; } }).builderPanelToggleReady, false);
  assert.match(harness, /page\.text\.includes\("Plugin Builder"\) && page\.builderPanelToggleReady === true/);
  assert.match(harness, /page\.text\.includes\("Authoring projects"\) && page\.builderEvidenceReady === true/);
  assert.match(harness, /async function waitPage\(cdp, predicate, label, timeout = 60_000\)/);
});

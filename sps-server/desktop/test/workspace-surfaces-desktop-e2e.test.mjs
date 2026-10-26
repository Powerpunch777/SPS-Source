import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";

const normalizeSourceLineEndings = (source) => source.replace(/\r\n?/g, "\n");

const extractFinalCleanup = (source) => {
  const normalizedSource = normalizeSourceLineEndings(source);
  const cleanupStart = normalizedSource.lastIndexOf("} finally {\n  const failedStages");
  assert.notEqual(cleanupStart, -1, "Missing final cleanup boundary");
  return normalizedSource.slice(cleanupStart);
};

test("ships a packaged Desktop Workspace Surfaces E2E harness", async () => {
  const [packageJson, script] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(scripts["test:e2e:workspace-surfaces"], /smoke-workspace-surfaces-desktop/);
  for (const required of [
    "SPS_DESKTOP_E2E_BINARY",
    "SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE",
    "SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY",
    "parseE2eHostReadyTimeout",
    "generateKeyPairSync",
    "/.well-known/jwks.json",
    "/v1/desktop/authorize",
    "/v1/desktop/token",
    "/v1/desktop/refresh",
    "/v1/desktop/revoke",
    "#start-sps-account",
    "#create-owner-server",
    "workspace-shell",
    "workspace-dashboard",
    "workspace-inbox",
    "data-sps-workspace-entry",
    "No default plugin selected.",
    "The selected plugin is unavailable.",
    "Manage plugins",
    "agentsBeforeEntry.length, 0",
    "agentsAfterEntry.length, 0",
    "[[620, 760], [1000, 760]]",
    "neutral-entry-${width}x${height}.png",
    "legacyRequests",
    "legacyWorkspaceDataRequests",
    "#main-content, aside, nav[aria-label=\"breadcrumb\"]",
    "input instanceof Request",
    "input instanceof URL",
    "endsWith(\"/agents\")",
    "endsWith(\"/workspace-dashboard\")",
    "selectedRootPath",
    "unavailableEntry",
    "Plugin lifecycle and installation",
    "Neutral Workspace",
    "Plugin Builder",
    "무엇을 만들까요?",
    "Team Workplane",
    "taskkill",
    "removeTemporaryDirectory",
  ]) {
    assert.ok(script.includes(required), `Workspace Surfaces E2E is missing ${required}`);
  }
});

test("keeps D2 request monitor snippets valid JavaScript", async () => {
  const script = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");

  for (const name of ["d2RequestMonitorStartExpression", "d2RequestMonitorStopExpression"]) {
    const declaration = `const ${name} = String.raw\``;
    const declarationStart = script.indexOf(declaration);
    assert.notEqual(declarationStart, -1, `Missing raw CDP snippet ${name}`);
    const snippetStart = declarationStart + declaration.length;
    const snippetEnd = script.indexOf("`;", snippetStart);
    assert.ok(snippetEnd > snippetStart, `Could not find the end of raw CDP snippet ${name}`);
    const snippet = script.slice(snippetStart, snippetEnd);
    assert.doesNotThrow(() => new Script(snippet), `${name} must parse before CDP evaluates it`);
  }
});

test("prepared Native management exercises the real Main/Core route without a confirmation bypass", async () => {
  const script = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(manifest.scripts["test:e2e:native-management"], /--native-management$/);
  for (const required of ["prepare-native-host-e2e-fixture.mjs", "await closeDesktopForRestart()",
    'disabled: true', '"separate-process-reload"', 'before.nativeConnectivity.serverSpkiSha256, prepared.serverSpkiSha256',
    'devices, { state: "available", lanEnabled: false, devices: [] }', 'status: 423, code: "plugin_recovery_active"',
    'rendererManagement, 403', 'no actual security confirmation, enrollment, device approval or two-PC claim']) {
    assert.ok(script.includes(required), `Missing Native prepared source assertion: ${required}`);
  }
  assert.doesNotMatch(script, /ipcMain|setNativeIdentity|skipNativeConfirmation|confirmNativeDeviceAction\s*=/);
  assert.match(script, /let debugPort = await findAvailablePort\(\)/);
  assert.match(script, /const previousDebugPort = debugPort/);
  assert.match(script, /assert\.notEqual\(debugPort, previousDebugPort/);
  const canonical = script.replace(/\r\n/g, "\n");
  for (const checkout of [canonical, canonical.replace(/\n/g, "\r\n")]) {
    const normalized = checkout.replace(/\r\n/g, "\n");
    const start = normalized.indexOf('if (nativeManagement) {\n    const safeSnapshot');
    const end = normalized.indexOf('  const diagnostics = [];', start);
    assert.ok(start >= 0 && end > start);
    const sanitizedFailure = normalized.slice(start, end);
    assert.match(sanitizedFailure, /stage=\$\{nativeManagementStage\}, failureSha256=\$\{failureSha256\}/);
    assert.match(sanitizedFailure, /knownStates\.includes\(native\?\.state\) \? native\.state : 'other'/);
    assert.match(sanitizedFailure, /canManageHost: status\?\.canManageHost === true/);
    assert.doesNotMatch(sanitizedFailure, /JSON\.stringify\((?:status|native|error|document|appOutput)\)/);
    assert.doesNotMatch(sanitizedFailure, /appOutput|describePage|console\.log|errorText\(error\)\}\n/);
  }
  assert.match(script, /temporaryDataRemoved = await attempt/);
  assert.match(script, /Workspace E2E cleanup is incomplete; the test cannot be accepted/);
});

test("Workspace acceptance retains every Main and does not turn forced cleanup into success", async () => {
  const source = await readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8");
  const script = normalizeSourceLineEndings(source);
  const exactSourceLF = script;
  const exactSourceCRLF = exactSourceLF.replace(/\n/g, "\r\n");
  const cleanup = extractFinalCleanup(exactSourceLF);
  assert.equal(extractFinalCleanup(exactSourceCRLF), cleanup,
    "Final cleanup extraction must work for exact LF and CRLF source");
  assert.ok(script.indexOf("launched.track(child)") > script.indexOf("child = spawn(binary"));
  const restart = script.slice(script.indexOf("async function closeDesktopForRestart()"), script.indexOf("const setupTarget"));
  for (const assertion of ["assert.equal(child.exitCode, 0", "await launched.waitForOutputEnd(5000)",
    "assert.equal(prior.orderly, prior.children", "assert.equal(prior.outputFailed, 0", "assert.equal(prior.outputEnded, prior.children * 2"])
    assert.ok(restart.includes(assertion), `Missing restart fence ${assertion}`);
  assert.ok(restart.indexOf("assert.equal(prior.outputEnded") < restart.indexOf("workspaceCdp = null"));
  for (const assertion of ["shutdownPreviewE2eDesktop", 'if (!ownedJobCleanupPending) await attempt("packaged_orphans", () => assertNoPackagedRuntimeOrphans',
    "boundedCleanup(mockIdentity.close()", "workspaceE2eCleanupDisposition", "identityClosed: identityClosed === true", "launched.dispose()",
    "new AggregateError", "...(acceptanceFailure ? [acceptanceFailure] : [])", "process.exit(cleanupDisposition.exitCode)"])
    assert.ok(cleanup.includes(assertion), `Missing final cleanup gate ${assertion}`);
  assert.match(script, /timeout: 15_000, windowsHide: true/);
  assert.doesNotMatch(script, /Stop-Process/);
  assert.doesNotMatch(cleanup, /\.catch\([^)]*console\.warn/);
  assert.ok(cleanup.indexOf('await attempt("identity_close", () => boundedCleanup(mockIdentity.close()')
    < cleanup.indexOf("workspaceE2eCleanupDisposition"), "Always attempt mock fixture closure before qualification");
  assert.ok(cleanup.indexOf("process.exit(cleanupDisposition.exitCode)") > cleanup.indexOf("evidence flushed"));
  const browserShutdown = script.slice(script.indexOf("async function requestBrowserShutdown()"), script.indexOf("async function describePage"));
  assert.match(browserShutdown, /setupCdp\.evaluate\("Boolean\(document\.querySelector\('#quit-desktop'\)\)"\)/);
  assert.match(browserShutdown, /await click\(setupCdp, "#quit-desktop", "Quit SPS Desktop through Core Settings"\)/);
  assert.ok(browserShutdown.indexOf('await click(setupCdp, "#quit-desktop"') < browserShutdown.indexOf("/json/version"));
  assert.doesNotMatch(browserShutdown, /spsCoreSettings\.quitDesktop|ipcRenderer|desktop:core-settings-quit/);
  assert.match(browserShutdown, /\/json\/version/);
  assert.match(browserShutdown, /endpoint\.hostname, "127\.0\.0\.1"/);
  assert.match(browserShutdown, /endpoint\.port, String\(debugPort\)/);
  assert.match(browserShutdown, /await browser\.command\("Browser.close"\)/);
  assert.doesNotMatch(script, /(?:quitCdp|workspaceCdp|setupCdp)\.command\("Browser.close"\)/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const smoke = await readFile(new URL("../scripts/smoke-core-settings-desktop.mjs", import.meta.url), "utf8");
const shutdown = await readFile(new URL("../scripts/preview-e2e-shutdown.mjs", import.meta.url), "utf8");

test("Core Settings screenshots frame the enabled Quit button at desktop and narrow widths", () => {
  const viewportStart = smoke.indexOf("for (const [width, height] of [[1000, 760], [620, 760]])");
  const viewportEnd = smoke.indexOf('await call("Emulation.clearDeviceMetricsOverride")', viewportStart);
  assert.notEqual(viewportStart, -1);
  assert.notEqual(viewportEnd, -1);
  const viewportFlow = smoke.slice(viewportStart, viewportEnd);

  const scroll = viewportFlow.indexOf("button.scrollIntoView({ block: 'center' })");
  const visibleCheck = viewportFlow.indexOf("assert.equal(quitPresentation.visible, true");
  const screenshot = viewportFlow.indexOf('call("Page.captureScreenshot"');
  assert.ok(scroll >= 0 && visibleCheck > scroll && screenshot > visibleCheck,
    "Each optional screenshot must be captured only after Quit is visible in its viewport.");
  assert.match(viewportFlow, /assert\.equal\(quitPresentation\.enabled, true/);
  assert.match(viewportFlow, /if \(screenshotRoot\)/);
  assert.match(viewportFlow, /core-settings-\$\{scenario\}-\$\{width\}x\$\{height\}\.png/);
});

test("successful smoke clicks the real Quit button and requires an orderly child exit", () => {
  assert.match(smoke, /import \{ shutdownPreviewE2eDesktop \} from "\.\/preview-e2e-shutdown\.mjs";/);
  assert.match(shutdown, /const MAX_GRACEFUL_WAIT_MS = 20_000;/);
  assert.match(shutdown, /timeoutMs = MAX_GRACEFUL_WAIT_MS/);
  const retry = smoke.indexOf('await evaluate("document.querySelector(\'#retry-status\').click()")');
  const quitStart = smoke.indexOf("const quitResult = await shutdownPreviewE2eDesktop({");
  const finallyStart = smoke.indexOf("} finally {", quitStart);
  assert.ok(retry >= 0 && quitStart > retry, "Quit must follow the existing functional retry assertion.");
  assert.notEqual(finallyStart, -1);
  const quitFlow = smoke.slice(quitStart, finallyStart);

  assert.match(quitFlow, /requestBrowserClose: async \(\) => \{/);
  assert.match(quitFlow, /document\.querySelector\('#quit-desktop'\)/);
  assert.match(quitFlow, /button\.click\(\)/);
  assert.match(quitFlow, /quitButtonClicked = true/);
  assert.match(quitFlow, /assert\.equal\(quitResult\.graceful, true/);
  assert.doesNotMatch(quitFlow, /timeoutMs\s*:|forceStop\s*:|Browser\.close|Page\.close/);
  assert.ok(smoke.indexOf("console.log(`Independent Core Settings source Electron smoke passed") > finallyStart,
    "Success must be logged only after fixture cleanup and the natural Quit check.");
});

test("emergency cleanup is bounded to the owned process and cannot pass or race recursive removal", () => {
  const finallyStart = smoke.indexOf("} finally {");
  const successLog = smoke.indexOf("console.log(`Independent Core Settings source Electron smoke passed");
  assert.notEqual(finallyStart, -1);
  const cleanup = smoke.slice(finallyStart, successLog);

  assert.match(cleanup, /if \(child\.exitCode === null && child\.signalCode === null && child\.pid\)/);
  assert.match(cleanup, /execFile\)\("taskkill\.exe", \["\/pid", String\(child\.pid\), "\/t", "\/f"\]/);
  assert.match(cleanup, /timeout: 5000,[\s\S]*windowsHide: true/);
  assert.match(cleanup, /assert\.equal\(childExitConfirmed, true,[\s\S]*?refusing recursive fixture cleanup/);
  assert.ok(cleanup.indexOf("assert.equal(childExitConfirmed, true") < cleanup.indexOf("const current = await lstat(userData)"),
    "The spawned Main must be confirmed exited before recursive fixture removal.");
  assert.match(cleanup, /assert\.equal\(cleaned, true/);
  assert.match(cleanup, /assert\.equal\(emergencyStopUsed, false/);
  assert.doesNotMatch(cleanup, /taskkill\.exe", \["\/im|process\.kill\(/i);
});

test("invalid fixture state preservation checks remain in the smoke", () => {
  for (const preserved of [
    '"not-json-preserve-this"',
    "retainedState",
    "malformedState",
    "unverifiedLegacyState",
    '"not-json-preserve-host-config"',
  ]) {
    assert.ok(smoke.includes(preserved), `missing preserved invalid-state assertion for ${preserved}`);
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const sourceUrl = new URL("../scripts/smoke-historical-uninstaller-diagnostic.mjs", import.meta.url);

test("historical uninstaller diagnostic is hosted-only before profile, registry, or fixture access", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const guard = source.indexOf("assertHostedInstallerCi();");
  const firstTry = source.indexOf("try {");
  const registry = source.indexOf("await registrations()");
  const appData = source.indexOf("process.env.APPDATA");
  const fixture = source.indexOf('mkdtemp(path.join(temporaryRoot, "sps-installer-data-uninstaller-diagnostic-"))');
  assert.ok(guard >= 0 && firstTry > guard && registry > firstTry && appData > registry && fixture > appData);
  assert.match(source, /assertHostedInstallerCi\(\);\s*\n\s*\nconst desktop/);
  assert.match(source, /path\.join\(appData, manifest\.name\.replaceAll\("\/", ""\)\)/);
  assert.match(source, /path\.join\(appData, manifest\.build\.productName\)/);
  assert.match(source, /path\.join\(appData, manifest\.name\)/);
  assert.match(source, /assert\.equal\(await missing\(alias\), true\)/);
  assert.doesNotMatch(source, /(?:rm\(|rmSync\(|unlink\(|rmdir\(|kill\(|taskkill|execSync|spawnSync)/i);
});

test("diagnostic installs only pinned historical input and uses the fixed updated-uninstaller handoff", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const stage = source.indexOf("await stageHistoricalInstaller(fixture)");
  const install = source.indexOf("nsisInvocation(historicalInstaller, installation)");
  const installedCheck = source.indexOf("const installed = await registrations()");
  const copy = source.indexOf("await copyFile(path.join(installation, \"Uninstall SPS Desktop.exe\"), copiedUninstaller, fsConstants.COPYFILE_EXCL)");
  const handoff = source.indexOf('args: ["/S", "/KEEP_APP_DATA", "/currentuser", "--updated", baseInvocation.args.at(-1)]');
  const uninstall = source.indexOf("spawn(invocation.executable, invocation.args");
  const postCheck = source.indexOf("phase = \"post-uninstall-check\"");
  assert.ok(stage >= 0 && install > stage && installedCheck > install && copy > installedCheck && handoff > copy && uninstall > handoff && postCheck > uninstall);
  assert.match(source, /HISTORICAL_INSTALLER_BASELINE\.version/);
  assert.match(source, /details\.nlink === 1n && details\.size > 0n/);
  assert.match(source, /baseInvocation\.args\.at\(-1\)/);
  assert.match(source, /\.\.\.invocation\.options, cwd: fixture, stdio: "ignore"/);
  assert.match(source, /assert\.deepEqual\(await registrations\(\), \[\]\)/);
  assert.match(source, /await missing\(path\.join\(installation, "resources\/app\.asar"\)\)/);
  assert.match(source, /diagnosticOnly: true, applicationLaunched: false/);
  assert.match(source, /candidateUpgradeQualified: false, previousStableUpgradeQualified: false/);
  assert.match(source, /process\.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
  assert.doesNotMatch(source, /electron\.launch|SPS_DESKTOP_E2E_BINARY|checkInstalledFirstFrame/);
});

test("diagnostic output is path-free and failures do not expose raw errors", async () => {
  const source = await readFile(sourceUrl, "utf8");
  const traceStart = source.indexOf("function trace(stage, detail = {})");
  const traceEnd = source.indexOf("async function missing", traceStart);
  const trace = source.slice(traceStart, traceEnd);
  assert.match(trace, /diagnosticStage: stage/);
  assert.doesNotMatch(trace, /fixture|installation|appData|process\.env|executable|\.path/);
  assert.match(source, /trace\("historical-uninstall-close", uninstallResult\)/);
  assert.match(source, /const errorType = error\?\.name === "AssertionError" \? "assertion" : "operation"/);
  assert.doesNotMatch(source, /console\.(?:error|log)\([^\n]*(?:error\.message|error\.stack|stdout|stderr)/);
});

test("diagnostic imports resolve and real non-hosted invocation fails at its first guard", async () => {
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(sourceUrl)], {
    env: { ...process.env, GITHUB_ACTIONS: "false", RUNNER_OS: "", RUNNER_ENVIRONMENT: "" },
    timeout: 10000, maxBuffer: 32768,
  }), failure => {
    assert.equal(failure.code, 1);
    assert.match(failure.stderr, /Installer data preservation requires the owned GitHub-hosted Windows CI launcher/);
    assert.doesNotMatch(failure.stderr, /does not provide an export|ERR_MODULE_NOT_FOUND/);
    assert.equal(failure.stdout, "");
    return true;
  });
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const desktop = fileURLToPath(new URL("..", import.meta.url));
const wrapper = fileURLToPath(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url));
const runnerPath = new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url);
const probePath = new URL("../scripts/windows-e2e/probe-installer-processes.mjs", import.meta.url);
const powershellInvocation = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", wrapper, "-Mode", "probe-installer-processes"];
const records = stdout => stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));

test("installer process probe is fixed, read-only, and locally allow-listed", async () => {
  const [wrapperSource, runner, probe] = await Promise.all([
    readFile(wrapper, "utf8"),
    readFile(runnerPath, "utf8"),
    readFile(probePath, "utf8"),
  ]);

  assert.match(wrapperSource, /ValidateSet\([^\n]*'probe-installer-processes'/);
  assert.match(wrapperSource, /\$Mode\.StartsWith\('probe'/);
  assert.match(runner, /if \(mode == "probe-installer-processes"\)\s+return RunNode\(node, directory, "windows-e2e\/probe-installer-processes\.mjs", OwnedJobCleanupArgument\);/);
  assert.match(runner, /mode == "probe-installer-processes" \? 45u \* 1000u/);
  assert.match(runner, /mode == "probe-timeout" \? 1500u/);
  assert.match(runner, /18u \* 60u \* 1000u/);

  const probeDispatch = runner.indexOf('if (mode == "probe-installer-processes")');
  const desktopCiGuard = runner.indexOf('Environment.GetEnvironmentVariable("GITHUB_ACTIONS") != "true"');
  assert.ok(probeDispatch >= 0 && probeDispatch < desktopCiGuard);
  assert.match(probe, /Get-CimInstance Win32_Process -Filter "Name = 'SPS Desktop\.exe'" -ErrorAction Stop/);
  assert.match(probe, /execFileAsync\("powershell\.exe"/);
  assert.match(probe, /shell: false/);
  assert.match(probe, /timeout: 30_000/);
  assert.match(probe, /process\.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
  assert.doesNotMatch(probe, /taskkill|Stop-Process|Remove-Item|Set-ItemProperty|Start-Process|SPS_DESKTOP_E2E_BINARY|GITHUB_ACTIONS/i);
  assert.doesNotMatch(probe, /ProcessId|ExecutablePath|CommandLine|\.Name\b/);
  assert.match(probe, /Object\.keys\(result\)\.length !== 2/);
  assert.match(probe, /JSON\.stringify\(result\)/);
  assert.doesNotMatch(probe, /count\s*!==\s*0|count\s*===\s*0/);
});

test("restricted installer process WMI probe reports its count and naturally empties its owned Job", { skip: process.platform !== "win32" }, async () => {
  // An unavailable query is a failed diagnostic, even if its processes were
  // naturally cleaned up. Never swallow a genuine nonzero wrapper result.
  const result = await exec("powershell.exe", powershellInvocation, {
    cwd: desktop,
    windowsHide: true,
    timeout: 75_000,
    maxBuffer: 32_768,
  });

  const output = records(result.stdout);
  assert.equal(output[0].restrictedE2eDesktop, true);
  assert.equal(typeof output[0].privateWindowStation, "boolean");
  assert.equal(output[1].restrictedE2eChild, true);
  assert.equal(output[1].privilegesReduced, true);
  assert.equal(output[1].sameUserToken, true);
  if (process.env.GITHUB_ACTIONS === "true" && process.env.RUNNER_ENVIRONMENT === "github-hosted") {
    assert.equal(output[0].privateWindowStation, true, "Hosted acceptance requires the actual private CI window station.");
  }
  const probe = output.find(record => "count" in record && "elapsedMs" in record);
  assert.equal(Number.isSafeInteger(probe?.count), true);
  assert.ok(probe.count >= 0);
  assert.equal(Number.isSafeInteger(probe.elapsedMs), true);
  assert.ok(probe.elapsedMs >= 0);
  assert.deepEqual(Object.keys(probe).sort(), ["count", "elapsedMs"]);
  assert.deepEqual(output.find(record => record.ownedJobCleanup === "natural"), {
    ownedJobEmpty: true,
    ownedJobCleanup: "natural",
  });
  assert.equal(output.some(record => record.ownedJobCleanup === "forced"), false);
  assert.equal(result.stderr, "");
});

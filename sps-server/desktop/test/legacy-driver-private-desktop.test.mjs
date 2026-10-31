import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { OWNED_JOB_CLEANUP_ARGUMENT } from "../scripts/preview-e2e-cleanup-contract.mjs";

const exec = promisify(execFile);
const scriptUrl = new URL("../scripts/windows-e2e/probe-legacy-driver-component.mjs", import.meta.url);
const wrapperUrl = new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url);

test("private-desktop component probe is fixed to the owned Windows launcher and bounded TAP contract", async () => {
  const source = await readFile(scriptUrl, "utf8");
  const wrapper = await readFile(wrapperUrl, "utf8");
  const guard = source.indexOf("process.platform !== \"win32\" || process.argv.length !== 3 || process.argv[2] !== OWNED_JOB_CLEANUP_ARGUMENT");
  const launch = source.indexOf("child = spawn(process.execPath,");
  assert.ok(guard >= 0 && guard < launch, "platform and ownership guard must precede child launch");
  assert.match(source, /\["--test", "--test-reporter=tap", "--test-concurrency=1", testFile\]/);
  assert.match(source, /const testFile = "test\/legacy-recovery-driver-component\.test\.mjs";/);
  assert.match(source, /maximumOutputBytes = 256 \* 1024/);
  assert.match(source, /}, 75_000\)/);
  assert.match(source, /totals\.tests === 2 && totals\.pass === 2 && totals\.fail === 0/);
  assert.match(source, /totals\.skipped === 0/);
  assert.match(source, /OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
  assert.match(source, /legacyDriverPrivateDesktopComponent":true/);
  assert.doesNotMatch(source, /process\.env|execFile\(|shell:\s*true/);
  assert.ok(wrapper.includes("'probe-legacy-driver-component'"));
  assert.equal(OWNED_JOB_CLEANUP_ARGUMENT, "--owned-job-cleanup-pending");
  const driver = await readFile(new URL("../scripts/windows-e2e/LegacyRecoveryUiDriver.cs", import.meta.url), "utf8");
  const wait = driver.slice(driver.indexOf("static IntPtr WaitForRecoveryWindow"), driver.indexOf("static IntPtr WaitForRecoveryChild"));
  assert.match(wait, /int budget = UiWaitBudget\(\);\s*long deadline = clock\.ElapsedMilliseconds \+ budget;[\s\S]*?helper\.WaitForInputIdle\(budget\)[\s\S]*?while \(clock\.ElapsedMilliseconds < deadline\)/);
  assert.match(driver, /const int UiWaitTimeoutMs = 15000;/);
  assert.match(driver, /const int OverallTimeoutMs = 450000;/);
  assert.match(driver, /Native\.GetThreadDesktop\(Native\.GetCurrentThreadId\(\)\)/);
  assert.match(driver, /Require\(enumerated\);/);
  assert.doesNotMatch(driver, /CloseDesktop|OpenInputDesktop|SetThreadDesktop/);
  const runner = await readFile(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url), "utf8");
  assert.match(runner, /mode == "probe-legacy-driver-component" \? 90u \* 1000u/);
});

test("private-desktop component probe closes its restricted owned Job naturally", {
  skip: process.platform !== "win32",
  timeout: 100_000,
}, async () => {
  let result;
  try {
    result = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File",
      fileURLToPath(wrapperUrl), "-Mode", "probe-legacy-driver-component"], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      windowsHide: true,
      timeout: 100_000,
      maxBuffer: 32_768,
    });
  } catch (error) {
    let failure = null;
    for (const line of String(error.stderr ?? "").split(/\r?\n/)) {
      try {
        const record = JSON.parse(line);
        if (record.legacyDriverPrivateDesktopComponent === false) failure = record;
      } catch {}
    }
    const phases = new Set(["initial-window", "initial-target", "initial-controls", "initial-backup", "initial-inside",
      "initial-uncheck", "initial-recheck", "initial-cancel", "initial-exit", "check-observation", "fixture-compilation",
      "child-timeout", "child-output", "child-launch", "child-result"]);
    const types = new Set(["DriverFailure", "CheckObservationDeadlineFailure", "AggregateException", "COMException",
      "ElementNotAvailableException", "InvalidOperationException", "TargetInvocationException", "compilation-failure",
      "contract-failure", "timeout", "output-limit", "launch-failure", "test-failure", "unclassified"]);
    const operations = new Set(["FindTopWindows", "WindowClass", "ReadWindowText", "WaitForRecoveryWindow",
      "RemainingMilliseconds", "unclassified"]);
    const phase = phases.has(failure?.phase) ? failure.phase : "wrapper-child";
    const type = types.has(failure?.type) ? failure.type : `exit-${String(error.code ?? "unknown")}`;
    const operation = operations.has(failure?.operation) ? `; ${failure.operation}` : "";
    const nativeCode = Number.isInteger(failure?.nativeCode) && failure.nativeCode >= -1 && failure.nativeCode <= 65535
      ? `; native-${failure.nativeCode}` : "";
    assert.fail(`Private-desktop component probe failed at ${phase} (${type}${operation}${nativeCode}).`);
  }

  const records = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert.equal(result.stderr, "");
  assert.deepEqual(records[0], { restrictedE2eDesktop: true, privateWindowStation: records[0].privateWindowStation });
  assert.equal(typeof records[0].privateWindowStation, "boolean");
  assert.deepEqual(records[1], { restrictedE2eChild: true, administratorEnabled: false, powerUsersEnabled: false,
    privilegesReduced: true, sameUserToken: true, administratorDenied: true, userDefaultDacl: true });
  assert.deepEqual(records.find(record => Object.hasOwn(record, "legacyDriverPrivateDesktopComponent")), {
    legacyDriverPrivateDesktopComponent: true, tests: 2, passed: 2, skipped: 0,
  });
  assert.deepEqual(records.find(record => record.ownedJobCleanup), { ownedJobEmpty: true, ownedJobCleanup: "natural" });
  assert.deepEqual(records.at(-1), { ownedDesktopClose: "closed",
    ownedWindowStationClose: records[0].privateWindowStation ? "closed" : "not_owned" });
});

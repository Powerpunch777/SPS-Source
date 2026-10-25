import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url));
const run = mode => exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", mode], {
  windowsHide: true, timeout: 30_000, maxBuffer: 32_768,
});
const records = stdout => stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const cleanup = output => ({
  ownedDesktopClose: "closed",
  ownedWindowStationClose: output[0].privateWindowStation ? "closed" : "not_owned",
});
const assertCleanup = stdout => {
  const output = records(stdout);
  assert.deepEqual(output.at(-1), cleanup(output));
  assert.equal(output.some(record => record.ownedJobEmpty === true), true);
  return output;
};

test("Windows CI E2E uses a checked reduced same-user token and reports owned-object cleanup", { skip: process.platform !== "win32" }, async () => {
  const result = await run("probe");
  const output = assertCleanup(result.stdout);
  assert.equal(output[0].restrictedE2eDesktop, true);
  assert.equal(typeof output[0].privateWindowStation, "boolean");
  assert.deepEqual(output.slice(1, 3), [
    { restrictedE2eChild: true, administratorEnabled: false, powerUsersEnabled: false, privilegesReduced: true, sameUserToken: true, administratorDenied: true, userDefaultDacl: true },
    { ownedJobEmpty: true },
  ]);
  assert.equal(result.stderr, "");
});

test("Windows CI E2E preserves a failing child's exit instead of reporting a skipped pass", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-exit"), failure => {
    assert.equal(failure.code, 7);
    assertCleanup(failure.stdout);
    assert.match(failure.stderr, /restricted_e2e_child_exit:phase=child_exit,mode=probe-exit,code=7,hex=0x00000007/);
    assert.match(failure.stderr, /restricted_e2e_helper_exit:phase=helper_exit,code=7,hex=0x00000007/);
    return true;
  });
});

test("Windows CI E2E preserves and diagnoses an NTSTATUS-shaped child exit", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-native-exit"), failure => {
    assert.equal(Number(failure.code) >>> 0, 0xC0000142);
    assert.match(failure.stderr, /restricted_e2e_child_exit:phase=child_exit,mode=probe-native-exit,code=3221225794,hex=0xC0000142/);
    assert.match(failure.stderr, /restricted_e2e_helper_exit:phase=helper_exit,code=-?1073741502,hex=0xC0000142/);
    assertCleanup(failure.stdout);
    return true;
  });
});

test("Windows CI E2E timeout terminates and confirms the job before failing", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-timeout"), failure => {
    assert.equal(failure.code, 124);
    assert.match(failure.stderr, /restricted_e2e_timeout/);
    assertCleanup(failure.stdout);
    return true;
  });
});

test("Windows CI E2E cleans a still-live owned descendant after its parent exits", { skip: process.platform !== "win32" }, async () => {
  const result = await run("probe-descendant");
  const output = assertCleanup(result.stdout);
  assert.deepEqual(output.slice(-3, -1), [{ ownedDescendantCreated: true }, { ownedJobEmpty: true }]);
  assert.equal(result.stderr, "");
});

test("Windows CI E2E forwards Node output and exact quoted, trailing-slash and Unicode arguments", { skip: process.platform !== "win32" }, async () => {
  const result = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", "probe-node"], {
    env: { ...process.env, NODE_OPTIONS: "--no-warnings", ELECTRON_RUN_AS_NODE: "1", GITHUB_TOKEN: "fixture-ci-token", SPS_CI_E2E_SECRET_SENTINEL: "fixture-secret" },
    windowsHide: true, timeout: 30_000, maxBuffer: 32_768,
  });
  const output = assertCleanup(result.stdout);
  assert.deepEqual(output.slice(-3, -1), [
    { nodeProbe: true, argumentsPreserved: true, executionHooksCleared: true, unrelatedEnvironmentRemoved: true, label: "unicode-\uD55C\uAE00" }, { ownedJobEmpty: true },
  ]);
  assert.equal(result.stderr.trim(), "restricted_e2e_probe_stderr");
});

test("Desktop execution modes are unavailable outside Windows CI", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", "runtime-discovery"], {
    env: { ...process.env, GITHUB_ACTIONS: "false", RUNNER_OS: "Windows" }, windowsHide: true, timeout: 10_000,
  }), failure => {
    assert.match(failure.stderr, /restricted to Windows CI/);
    assert.doesNotMatch(failure.stdout, /restrictedE2eChild/);
    return true;
  });
});

test("all Owner-Host-dependent Windows CI E2Es use the reduced-token wrapper", async () => {
  const workflow = await readFile(new URL("../../../.github/workflows/sps-verify.yml", import.meta.url), "utf8");
  for (const mode of ["runtime-discovery", "native-management", "workspace-surfaces", "plugin-preview", "host-plugin-lifecycle"]) {
    assert.match(workflow, new RegExp(`run: \\.\\\\scripts\\\\run-windows-ci-e2e\\.ps1 -Mode ${mode}`));
  }
  const source = await readFile(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url), "utf8");
  assert.match(source, /CreateRestrictedToken\(token, 0x1/);
  assert.match(source, /CreateWindowStationW\(requestedStationName, 1,/);
  assert.match(source, /nativeError != 5/);
  assert.match(source, /D:P\(A;;0x000F037F;;;/);
  assert.match(source, /desktopSddl = "D:P\(A;;0x000F01FF;;;/);
  assert.match(source, /CreateDesktopW\(desktopName/);
  assert.match(source, /startup\.Startup\.Desktop = desktopPath/);
  assert.match(source, /SetProcessWindowStation\(originalStation\)/);
  assert.match(source, /SetThreadDesktop\(originalDesktop\)/);
  assert.match(source, /AssignProcessToJobObject\(job, child.Process\)/);
  assert.match(source, /info.ActiveProcesses == 0/);
  assert.match(source, /if \(code != 0\) return code/);
  assert.match(source, /if \(!CloseOwnedWindowObjects\(desktop, windowStation\)\) resultCode = 125;/);
  assert.match(source, /if \(CloseDesktop\(desktop\)\) desktopState = "closed";/);
  assert.match(source, /if \(CloseWindowStation\(station\)\) stationState = "closed";/);
  const jobClose = source.indexOf("if (Valid(job)) CloseHandle(job);");
  const desktopClose = source.indexOf("CloseOwnedWindowObjects(desktop, windowStation)", jobClose);
  const tokenClose = source.indexOf("foreach (IntPtr handle in new[] { input, output, error, restricted, token })", desktopClose);
  assert.ok(jobClose >= 0 && desktopClose > jobClose && tokenClose > desktopClose);
  assert.doesNotMatch(source, /SANDBOX_INERT|CREATE_BREAKAWAY_FROM_JOB|LogonUser|SetUserObjectSecurity|SetSecurityInfo|net user|New-LocalUser/);
  const wrapper = await readFile(script, "utf8");
  assert.match(wrapper, /ValidateSet\([^)]*'native-management'/);
  assert.match(source, /value == "native-management"/);
  assert.match(source, /if \(mode == "native-management"\) return RunNode\(node, directory, "smoke-workspace-surfaces-desktop\.mjs", "--native-management"\);/);
  assert.match(source, /start\.UseShellExecute = false;/);
  assert.doesNotMatch(source, /(?:powershell|cmd\.exe)/i);
  assert.match(wrapper, /Write-ExitDiagnostic 'restricted_e2e_helper_exit'/);
  assert.match(wrapper, /\$phase = 'helper_exit'/);
});

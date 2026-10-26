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
  assert.equal(output.some(record => record.ownedDescendantCreated === true), true);
  const diagnostics = output.find(record => Object.hasOwn(record, "readOK") && Object.hasOwn(record, "truncated"));
  assert.ok(diagnostics);
  assert.deepEqual(Object.keys(diagnostics).sort(), [
    "node", "postgres", "electron", "crashpad", "other", "unavailable", "powershell", "shell", "console", "windowsError",
    "total", "bounded", "truncated", "readOK", "unknownImages", "exitedParent",
  ].sort());
  for (const category of ["node", "postgres", "electron", "crashpad", "other", "unavailable", "powershell", "shell", "console", "windowsError", "total", "bounded", "exitedParent"]) {
    assert.equal(Number.isSafeInteger(diagnostics[category]) && diagnostics[category] >= 0, true);
  }
  assert.equal(diagnostics.exitedParent <= 1, true);
  assert.equal(diagnostics.readOK, true);
  assert.equal(diagnostics.truncated, false);
  assert.equal(diagnostics.total, diagnostics.bounded);
  assert.equal(diagnostics.bounded <= 256, true);
  assert.equal(diagnostics.other >= 1, true);
  assert.equal(Array.isArray(diagnostics.unknownImages), true);
  assert.equal(diagnostics.unknownImages.length <= diagnostics.other, true);
  for (const entry of diagnostics.unknownImages) {
    assert.deepEqual(Object.keys(entry).sort(), ["image", "parentImage"]);
    assert.match(entry.image, /^[A-Za-z0-9_.-]{1,64}$/);
    assert.match(entry.parentImage, /^(?:[A-Za-z0-9_.-]{1,64}|unavailable)$/);
  }
  assert.equal(
    diagnostics.node + diagnostics.postgres + diagnostics.electron + diagnostics.crashpad + diagnostics.other + diagnostics.unavailable
      + diagnostics.powershell + diagnostics.shell + diagnostics.console + diagnostics.windowsError + diagnostics.exitedParent,
    diagnostics.bounded,
  );
  assert.doesNotMatch(JSON.stringify(diagnostics), /[A-Za-z]:[\\/]|\\\\|\b\d{4,}\b/);
  assert.equal(result.stderr, "");
});

test("Windows CI E2E accepts pending Preview cleanup only after natural owned-Job emptiness", { skip: process.platform !== "win32" }, async () => {
  const result = await run("probe-preview-pending");
  const output = assertCleanup(result.stdout);
  assert.deepEqual(output.find(record => record.ownedJobCleanup), { ownedJobEmpty: true, ownedJobCleanup: "natural" });
  assert.equal(result.stderr, "");
});

test("Windows CI E2E rejects pending Preview after force-cleaning a live owned descendant", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-preview-pending-descendant"), failure => {
    assert.equal(failure.code, 125);
    const output = assertCleanup(failure.stdout);
    assert.deepEqual(output.find(record => record.ownedJobCleanup), {
      ownedJobEmpty: true, ownedJobCleanup: "forced", accepted: false,
    });
    assert.equal(output.some(record => record.ownedDescendantCreated === true), true);
    return true;
  });
});

test("Windows CI E2E preserves a failed Preview child exit after force-cleaning its descendant", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-preview-failure-descendant"), failure => {
    assert.equal(failure.code, 7);
    const output = assertCleanup(failure.stdout);
    assert.deepEqual(output.find(record => record.ownedJobCleanup), {
      ownedJobEmpty: true, ownedJobCleanup: "forced", accepted: false,
    });
    assert.match(failure.stderr, /restricted_e2e_child_exit:phase=child_exit,mode=probe-preview-failure-descendant,code=7,hex=0x00000007/);
    return true;
  });
});

test("Windows CI E2E rejects a zero-exit Preview child without the pending protocol", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-preview-zeroexit"), failure => {
    assert.equal(failure.code, 125);
    const output = assertCleanup(failure.stdout);
    assert.deepEqual(output.find(record => record.ownedJobCleanup), { ownedJobEmpty: true, ownedJobCleanup: "natural" });
    assert.match(failure.stderr, /restricted_e2e_pending_exit_required:mode=probe-preview-zeroexit/);
    return true;
  });
});

test("Windows CI E2E does not normalize a spoofed pending exit from an unrelated probe", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-exit-76"), failure => {
    assert.equal(failure.code, 76);
    assertCleanup(failure.stdout);
    assert.match(failure.stderr, /restricted_e2e_child_exit:phase=child_exit,mode=probe-exit-76,code=76,hex=0x0000004C/);
    return true;
  });
});

test("Windows CI E2E accepts workspace pending cleanup only after natural owned-Job emptiness", { skip: process.platform !== "win32" }, async () => {
  const result = await run("workspace-pending");
  const output = assertCleanup(result.stdout);
  assert.deepEqual(output.find(record => record.ownedJobCleanup), { ownedJobEmpty: true, ownedJobCleanup: "natural" });
  assert.equal(result.stderr, "");
});

test("Windows CI E2E rejects workspace pending cleanup after force-cleaning a live descendant", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("workspace-pending-descendant"), failure => {
    assert.equal(failure.code, 125);
    const output = assertCleanup(failure.stdout);
    assert.deepEqual(output.find(record => record.ownedJobCleanup), {
      ownedJobEmpty: true, ownedJobCleanup: "forced", accepted: false,
    });
    assert.equal(output.some(record => record.ownedDescendantCreated === true), true);
    return true;
  });
});

test("Windows CI E2E preserves a workspace child failure after force-cleaning its descendant", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("workspace-failure-descendant"), failure => {
    assert.equal(failure.code, 7);
    const output = assertCleanup(failure.stdout);
    assert.deepEqual(output.find(record => record.ownedJobCleanup), {
      ownedJobEmpty: true, ownedJobCleanup: "forced", accepted: false,
    });
    assert.match(failure.stderr, /restricted_e2e_child_exit:phase=child_exit,mode=workspace-failure-descendant,code=7,hex=0x00000007/);
    return true;
  });
});

test("Windows CI E2E rejects workspace zero exit without the pending protocol", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("workspace-zeroexit"), failure => {
    assert.equal(failure.code, 125);
    const output = assertCleanup(failure.stdout);
    assert.deepEqual(output.find(record => record.ownedJobCleanup), { ownedJobEmpty: true, ownedJobCleanup: "natural" });
    assert.match(failure.stderr, /restricted_e2e_pending_exit_required:mode=workspace-zeroexit/);
    return true;
  });
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
  const wrapper = await readFile(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url), "utf8");
  const cleanupContract = await readFile(new URL("../scripts/preview-e2e-cleanup-contract.mjs", import.meta.url), "utf8");
  const cleanupArgument = cleanupContract.match(/OWNED_JOB_CLEANUP_ARGUMENT = "([^"]+)";/)?.[1];
  const pendingExitCode = Number(cleanupContract.match(/OWNED_JOB_CLEANUP_PENDING_EXIT_CODE = (\d+);/)?.[1]);
  assert.ok(cleanupArgument);
  assert.ok(Number.isInteger(pendingExitCode));
  assert.ok(source.includes(`const string OwnedJobCleanupArgument = "${cleanupArgument}";`));
  assert.ok(source.includes(`const uint OwnedJobCleanupPendingExitCode = ${pendingExitCode};`));
  for (const mode of ["probe-preview-pending", "probe-preview-pending-descendant", "probe-preview-failure-descendant", "probe-preview-zeroexit", "workspace-pending", "workspace-pending-descendant", "workspace-failure-descendant", "workspace-zeroexit", "probe-exit-76"]) {
    assert.match(wrapper, new RegExp(`'${mode}'`));
    assert.match(source, new RegExp(`value == "${mode}"`));
  }
  assert.match(source, /if \(mode == "plugin-preview"\) return RunNode\(node, directory, "smoke-plugin-preview-desktop\.mjs", OwnedJobCleanupArgument\);/);
  assert.match(source, /WaitForNaturalJobEmpty\(job, OwnedJobWaitMilliseconds\(mode\)\)/);
  assert.match(source, /const int OwnedProcessDiagnosticLimit = 256;/);
  assert.match(source, /QueryInformationJobObject\(job, 3, buffer/);
  assert.match(source, /OpenProcess\(0x1000, false, processId\)/);
  const processMembershipCheck = source.indexOf("IsProcessInJob(process, job, out inJob)");
  const processImageRead = source.indexOf("QueryFullProcessImageName(process, 0, image, ref imageLength)");
  assert.ok(processMembershipCheck >= 0 && processImageRead > processMembershipCheck);
  const processClassifierStart = source.indexOf("    static int OwnedProcessCategory(");
  const processDiagnosticsWriter = source.indexOf("    static void WriteOwnedJobProcessDiagnostics(", processClassifierStart);
  const processDiagnosticsEnd = source.indexOf("    static bool WaitForNaturalJobEmpty(", processDiagnosticsWriter);
  assert.ok(processClassifierStart >= 0 && processDiagnosticsWriter > processClassifierStart && processDiagnosticsEnd > processDiagnosticsWriter);
  const processClassifier = source.slice(processClassifierStart, processDiagnosticsWriter);
  assert.match(processClassifier, /Path\.GetFullPath\(Environment\.SystemDirectory\)/);
  assert.match(processClassifier, /Path\.Combine\(systemDirectory, "conhost\.exe"\)/);
  assert.match(processClassifier, /Path\.Combine\(systemDirectory, "OpenConsole\.exe"\)/);
  assert.match(processClassifier, /Path\.Combine\(systemDirectory, "cmd\.exe"\)/);
  assert.match(processClassifier, /Path\.Combine\(systemDirectory, "WindowsPowerShell", "v1\.0", "powershell\.exe"\)/);
  assert.doesNotMatch(processClassifier, /String\.Equals\(name, "(?:conhost|OpenConsole|powershell|pwsh|cmd|WerFault)[^\"]*"/);
  for (const image of [
    "chrome_crashpad_handler.exe", "crashpad_handler.exe",
  ]) {
    assert.ok(processClassifier.includes(`String.Equals(name, "${image}", StringComparison.OrdinalIgnoreCase)`));
  }
  assert.doesNotMatch(processClassifier, /StartsWith|EndsWith|\bConsole\./);
  assert.doesNotMatch(source.slice(processClassifierStart, processDiagnosticsEnd), /ProcessStartInfo|Process\.Start|CreateProcess|RunNode/);
  const naturalWait = source.indexOf("bool naturallyEmpty = WaitForNaturalJobEmpty(job, OwnedJobWaitMilliseconds(mode))");
  const forcedDiagnostics = source.indexOf("WriteOwnedJobProcessDiagnostics(job, childExitObserved ? child.ProcessId : 0);", naturalWait);
  const forcedTermination = source.indexOf("TerminateAndConfirmJob(job);", forcedDiagnostics);
  assert.ok(naturalWait >= 0 && forcedDiagnostics > naturalWait && forcedTermination > forcedDiagnostics);
  assert.doesNotMatch(source, /System\.Management|ManagementObject|Win32_Process|Process\.GetProcesses|Get-Process|tasklist/i);
  assert.doesNotMatch(source, /PreviewJobGateMode|PreviewJobWaitMilliseconds/);
  assert.ok(source.includes('Console.WriteLine("{\\"ownedJobEmpty\\":true,\\"ownedJobCleanup\\":\\"natural\\"}");'));
  assert.ok(source.includes('Console.WriteLine("{\\"ownedJobEmpty\\":true,\\"ownedJobCleanup\\":\\"forced\\",\\"accepted\\":false}");'));
  assert.match(source, /childExitCode == OwnedJobCleanupPendingExitCode\) resultCode = 0/);
  assert.match(source, /restricted_e2e_pending_exit_required/);
  assert.doesNotMatch(wrapper + source, /SPS_DESKTOP_E2E_OWNED_JOB/i);
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
  assert.match(wrapper, /ValidateSet\([^)]*'native-management'/);
  assert.match(wrapper, /\$workspaceProbeModes = @\('workspace-pending', 'workspace-pending-descendant', 'workspace-failure-descendant', 'workspace-zeroexit'\)/);
  assert.match(wrapper, /\$workspaceProbeModes -ccontains \$Mode/);
  assert.match(source, /value == "native-management"/);
  assert.match(source, /if \(mode == "runtime-discovery"\) return RunNode\(node, directory, "smoke-workspace-surfaces-desktop\.mjs", "--runtime-discovery", OwnedJobCleanupArgument\);/);
  assert.match(source, /if \(mode == "native-management"\) return RunNode\(node, directory, "smoke-workspace-surfaces-desktop\.mjs", "--native-management", OwnedJobCleanupArgument\);/);
  assert.match(source, /if \(mode == "workspace-surfaces"\) return RunNode\(node, directory, "smoke-workspace-surfaces-desktop\.mjs", OwnedJobCleanupArgument\);/);
  assert.match(source, /start\.UseShellExecute = false;/);
  assert.doesNotMatch(source.slice(0, processClassifierStart) + source.slice(processDiagnosticsEnd), /(?:powershell|cmd\.exe)/i);
  assert.match(wrapper, /Write-ExitDiagnostic 'restricted_e2e_helper_exit'/);
  assert.match(wrapper, /\$phase = 'helper_exit'/);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { OWNED_JOB_CLEANUP_ARGUMENT, OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "../scripts/preview-e2e-cleanup-contract.mjs";

const exec = promisify(execFile);
const desktop = fileURLToPath(new URL("..", import.meta.url));
const wrapper = fileURLToPath(new URL("../scripts/run-windows-ci-e2e.ps1", import.meta.url));
const fixture = fileURLToPath(new URL("../scripts/windows-e2e/probe-installer-command-exit.mjs", import.meta.url));
const records = stdout => stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
const wrapperArguments = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", wrapper,
  "-Mode", "probe-installer-command-exit"];
const privateOutput = /private-command@example\.invalid|private-command-fixture|(?:[A-Z]:\\|\\\\)|processId|processID|commandLine|rawCommand|\bpid\b/i;

test("installer command-exit probe is a fixed, passive fixture with fail-closed ownership guards", async () => {
  const source = await readFile(fixture, "utf8");
  assert.match(source, /process\.platform !== "win32" \|\| process\.argv\.length !== 3 \|\| process\.argv\[2\] !== OWNED_JOB_CLEANUP_ARGUMENT/);
  assert.match(source, /path\.join\(process\.env\.WINDIR, "System32", "WindowsPowerShell", "v1\.0", "powershell\.exe"\)/);
  assert.match(source, /\["-NoProfile", "-NonInteractive", "-Command", command\]/);
  assert.match(source, /Get-Command Get-CimInstance \| Out-Null/);
  assert.match(source, /Start-Sleep -Milliseconds 1200; exit 7/);
  assert.match(source, /powershell-command-entered/);
  assert.match(source, /powershell-command-available/);
  assert.match(source, /phases !== 2 \|\| stderrBytes !== 0/);
  assert.match(source, /assert\.equal\(result\.code, 7/);
  assert.match(source, /JSON\.stringify\(\{ ownedInstallerCommandExitFixture: true \}\)/);
  assert.match(source, /OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
  assert.equal([...source.matchAll(/Get-CimInstance/g)].length, 1, "the fixture only checks command availability");
  assert.doesNotMatch(source, /(?:^|[;\n]\s*)Get-CimInstance\s*(?:\(|\s+-)|taskkill|Stop-Process|TerminateJobObject|TerminateProcess|installer\.exe|SPS_DESKTOP_E2E_BINARY/i);

  for (const args of [[], ["--not-owned"], [OWNED_JOB_CLEANUP_ARGUMENT, "extra"]]) {
    await assert.rejects(exec(process.execPath, [fixture, ...args], { cwd: desktop, windowsHide: true, timeout: 5000 }), error => {
      assert.notEqual(error.code, 0);
      assert.doesNotMatch(`${error.stdout}\n${error.stderr}`, /private-command@example\.invalid|C:\\private-command-fixture/);
      return true;
    });
  }
  assert.equal(OWNED_JOB_CLEANUP_ARGUMENT, "--owned-job-cleanup-pending");
  assert.equal(OWNED_JOB_CLEANUP_PENDING_EXIT_CODE, 76);
});

test("station control is a fixed comparison and does not replace the original isolation or deadlines", async () => {
  const runner = await readFile(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url), "utf8");
  const wrapperSource = await readFile(wrapper, "utf8");
  assert.match(wrapperSource, /\[ValidateSet\('probe-installer-command-exit-same-station'/);
  assert.match(runner, /if \(mode == "probe-installer-command-exit" \|\| mode == "probe-installer-command-exit-same-station"\)\s*return RunNode\(node, directory, "windows-e2e\/probe-installer-command-exit.mjs", OwnedJobCleanupArgument\);/);
  assert.match(runner, /CreatePrivateDesktop\(out windowStation, out desktop, out desktopPath, out privateWindowStation,\s*mode == "probe-installer-command-exit-same-station"\)/);
  assert.match(runner, /station = keepOriginalStation \? IntPtr.Zero : CreateWindowStationW/);
  assert.match(runner, /if \(!keepOriginalStation && nativeError != 5\)/);
  assert.match(runner, /mode == "probe-installer-command-exit-same-station" \? 45u \* 1000u/);
  assert.match(runner, /mode == "probe-installer-command-exit" \? 45u \* 1000u/);
  const start = runner.indexOf("static void CreatePrivateDesktop(");
  const end = runner.indexOf("static bool CloseOwnedWindowObjects", start);
  const desktopCreation = runner.slice(start, end);
  assert.match(desktopCreation, /desktop = CreateDesktopW\(desktopName/);
  assert.doesNotMatch(desktopCreation, /\breturn\b/, "The control must still create its own Desktop.");
});

async function assertOwnedCommandExit(mode) {
  const result = await exec("powershell.exe", [...wrapperArguments.slice(0, -1), mode], {
    cwd: desktop,
    windowsHide: true,
    timeout: 75_000,
    maxBuffer: 32_768,
  }).catch(error => {
    // Keep passive phase/owned-Job diagnostics when the native deadline fails;
    // the command's raw arguments and machine paths must still never be logged.
    assert.doesNotMatch(error.stdout ?? "", privateOutput);
    for (const record of records(error.stdout ?? "")) console.error(JSON.stringify(record));
    throw error;
  });
  const output = records(result.stdout);
  assert.deepEqual(output.filter(record => record.ownedInstallerCommandExitProbePhase).map(record => record.ownedInstallerCommandExitProbePhase), [
    "node-ready", "powershell-created", "powershell-command-entered", "powershell-command-available",
  ]);
  assert.deepEqual(output.filter(record => record.ownedInstallerCommandExitFixture === true), [
    { ownedInstallerCommandExitFixture: true },
  ]);
  const observations = output.filter(record => record.ownedInstallerCommandObservation === true);
  const summary = output.find(record => record.ownedInstallerCommandObservationSummary === true);
  const availableExit = observations.find(record => record.status === "exited" && record.command?.readOK === true
    && record.command.kind === "availability");

  for (const observation of observations) {
    assert.deepEqual(Object.keys(observation).sort(), ["command", "elapsedMs", "exitCode", "observedDurationMs",
      "ownedInstallerCommandObservation", "sequence", "status"]);
    assert.ok(Number.isInteger(observation.sequence) && observation.sequence >= 1 && observation.sequence <= 64);
    assert.ok(["exited", "pending", "unavailable"].includes(observation.status));
    assert.ok(Number.isSafeInteger(observation.elapsedMs) && observation.elapsedMs >= 0);
    assert.ok(Number.isSafeInteger(observation.observedDurationMs) && observation.observedDurationMs >= 0);
    assert.ok(observation.exitCode === null || Number.isSafeInteger(observation.exitCode));
    assert.deepEqual(Object.keys(observation.command).sort(), ["architecture", "kind", "noProfile", "nonInteractive", "readOK"]);
    assert.ok(["availability", "execution-policy", "process-query", "stop-process", "other", "unavailable"]
      .includes(observation.command.kind));
    assert.ok(["x64", "x86", "unknown"].includes(observation.command.architecture));
    assert.equal(typeof observation.command.readOK, "boolean");
    assert.equal(typeof observation.command.noProfile, "boolean");
    assert.equal(typeof observation.command.nonInteractive, "boolean");
  }

  assert.ok(availableExit, "one availability command must be observed after it exits");
  assert.equal(availableExit.status, "exited");
  assert.equal(availableExit.exitCode, 7);
  assert.equal(availableExit.command.kind, "availability");
  assert.ok(["x64", "x86"].includes(availableExit.command.architecture));
  assert.equal(availableExit.command.noProfile, true);
  assert.equal(availableExit.command.nonInteractive, true);

  assert.ok(summary);
  assert.deepEqual(Object.keys(summary).sort(), ["enumerationFailures", "mayMissShortProcesses", "observed",
    "ownedInstallerCommandObservationSummary", "pending", "truncated", "unavailableExits"]);
  assert.ok(summary.observed >= 1);
  assert.equal(summary.pending, 0);
  assert.equal(summary.unavailableExits, 0);
  assert.equal(summary.enumerationFailures, 0);
  assert.equal(summary.truncated, false);
  assert.equal(summary.mayMissShortProcesses, true);
  assert.equal(observations.length, summary.observed);
  assert.equal(observations.filter(record => record.status === "pending").length, summary.pending);
  assert.equal(observations.filter(record => record.status === "unavailable").length, summary.unavailableExits);
  assert.deepEqual(output.find(record => record.ownedJobCleanup === "natural"), {
    ownedJobEmpty: true,
    ownedJobCleanup: "natural",
  });
  const desktopRecord = output.find(record => record.restrictedE2eDesktop === true);
  assert.ok(desktopRecord);
  if (mode === "probe-installer-command-exit-same-station") {
    assert.equal(desktopRecord.privateWindowStation, false, "The diagnostic control must keep the caller's station, not its desktop.");
  }
  assert.deepEqual(output.find(record => record.restrictedE2eChild === true), {
    restrictedE2eChild: true, administratorEnabled: false, powerUsersEnabled: false,
    privilegesReduced: true, sameUserToken: true, administratorDenied: true, userDefaultDacl: true,
  });
  assert.deepEqual(output.at(-1), {
    ownedDesktopClose: "closed",
    ownedWindowStationClose: desktopRecord.privateWindowStation ? "closed" : "not_owned",
  });
  assert.equal(result.stderr, "");
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, privateOutput);
}

test("owned Windows wrapper observes the naturally exited PowerShell command and closes its Job", { skip: process.platform !== "win32" }, async () => {
  await assertOwnedCommandExit("probe-installer-command-exit");
});

test("same-station diagnostic control keeps a private Desktop and the same restricted token and natural Job exit", { skip: process.platform !== "win32" }, async () => {
  await assertOwnedCommandExit("probe-installer-command-exit-same-station");
});

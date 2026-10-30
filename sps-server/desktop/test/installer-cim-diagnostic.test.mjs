import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInstallerCimProbe,
  summarizeInstallerCimProbe,
  validateInstallerCimProbeInput,
} from "../scripts/installer-cim-diagnostic.mjs";

const fixtureRoot = "C:\\fixtures\\installer-cim";
const windowsRoot = "C:\\Windows";
const cleanupArgument = "--owned-job-cleanup-pending";
const cimCommand = `if ((Get-CimInstance -ClassName Win32_Process | ? { $_.Path -and $_.Path.StartsWith('${fixtureRoot}', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }`;

test("installer CIM probe builds only the fixed readonly startup, legacy, and current commands", () => {
  const executable = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const expected = {
    startup: ["-C", "exit 0"],
    legacy: ["-C", cimCommand],
    current: ["-NoProfile", "-NonInteractive", "-C", cimCommand],
  };

  for (const [variant, args] of Object.entries(expected)) {
    const probe = buildInstallerCimProbe({ variant, fixtureRoot, windowsRoot });
    assert.equal(probe.executable, executable);
    assert.deepEqual(probe.args, args);
    assert.deepEqual(probe.options, {
      shell: false,
      windowsHide: true,
      timeout: 60000,
      maxBuffer: 32768,
      encoding: "buffer",
    });
    assert.equal(probe.args.includes("-File"), false);
    assert.equal(probe.args.some(arg => /Remove-|Stop-Process|Start-Process|Set-Item|taskkill/i.test(arg)), false);
  }
});

test("installer CIM input validation permits only the fixed Windows variants and owned cleanup argument", () => {
  for (const variant of ["startup", "legacy", "current"]) {
    assert.equal(validateInstallerCimProbeInput({
      platform: "win32", variant, args: [variant, cleanupArgument],
    }), undefined);
  }

  for (const invalid of [
    { platform: "linux", variant: "startup", args: ["startup", cleanupArgument] },
    { platform: "win32", variant: "arbitrary", args: ["arbitrary", cleanupArgument] },
    { platform: "win32", variant: "startup", args: ["legacy", cleanupArgument] },
    { platform: "win32", variant: "current", args: ["current", "--other"] },
    { platform: "win32", variant: "legacy", args: ["legacy", cleanupArgument, "extra"] },
  ]) assert.throws(() => validateInstallerCimProbeInput(invalid));
});

test("installer CIM probe rejects untrusted variants and command paths", () => {
  for (const variant of ["other", "--help", ""]) {
    assert.throws(() => buildInstallerCimProbe({ variant, fixtureRoot, windowsRoot }));
  }
  for (const badPath of [
    "relative\\fixture", "C:\\fixtures\\..\\outside", "C:\\fixtures\\bad'path",
    "C:\\fixtures\\bad`path", "C:\\fixtures\\bad$path", "C:\\fixtures\\line\nbreak",
  ]) {
    assert.throws(() => buildInstallerCimProbe({ variant: "legacy", fixtureRoot: badPath, windowsRoot }));
  }
  for (const badPath of ["Windows", "C:\\Windows\\..\\outside", "C:\\Windows\\bad'path"]) {
    assert.throws(() => buildInstallerCimProbe({ variant: "startup", fixtureRoot, windowsRoot: badPath }));
  }
});

test("installer CIM summaries expose counts and status only, and match only clean expected exits", () => {
  for (const [variant, exitCode] of [["startup", 0], ["legacy", 1], ["current", 1]]) {
    const summary = summarizeInstallerCimProbe({
      variant, exitCode, signal: null, stdout: Buffer.alloc(0), stderr: "", elapsedMs: 25,
    });
    assert.deepEqual(summary, {
      installerCimDiagnostic: true,
      diagnosticOnly: true,
      installerExecuted: false,
      variant,
      exitCode,
      signal: null,
      elapsedMs: 25,
      stdoutBytes: 0,
      stderrBytes: 0,
      matchedExpectedExit: true,
    });
  }

  const privateCommand = `Get-CimInstance -ClassName Win32_Process at ${fixtureRoot}`;
  const privateOutput = `C:\\Users\\private\\installer.exe ${privateCommand}`;
  const withOutput = summarizeInstallerCimProbe({
    variant: "legacy", exitCode: 1, signal: null,
    stdout: privateOutput, stderr: Buffer.from("nonterminating CIM error"), elapsedMs: 31,
  });
  assert.equal(withOutput.matchedExpectedExit, false);
  assert.equal(withOutput.stdoutBytes, Buffer.byteLength(privateOutput));
  assert.equal(withOutput.stderrBytes, Buffer.byteLength("nonterminating CIM error"));
  for (const secret of [privateCommand, privateOutput, "nonterminating CIM error", fixtureRoot, windowsRoot]) {
    assert.equal(JSON.stringify(withOutput).includes(secret), false);
  }

  const timedOut = summarizeInstallerCimProbe({
    variant: "current", exitCode: null, signal: "SIGTERM", stdout: "", stderr: "", elapsedMs: 60000,
  });
  assert.equal(timedOut.matchedExpectedExit, false);
  assert.equal("command" in timedOut, false);
  assert.equal("path" in timedOut, false);
  assert.equal("stdout" in timedOut, false);
  assert.equal("stderr" in timedOut, false);
});

test("installer CIM summary rejects malformed status and output", () => {
  const valid = {
    variant: "startup", exitCode: 0, signal: null, stdout: "", stderr: "", elapsedMs: 0,
  };
  for (const overrides of [
    { variant: "other" },
    { exitCode: 1.5 },
    { exitCode: 2147483648 },
    { signal: "SIGABRT" },
    { elapsedMs: -1 },
    { elapsedMs: Number.MAX_SAFE_INTEGER + 1 },
    { stdout: { text: "not output" } },
  ]) assert.throws(() => summarizeInstallerCimProbe({ ...valid, ...overrides }));
});

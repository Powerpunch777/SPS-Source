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

test("Windows CI E2E uses a checked reduced same-user token and confirms an empty owned job", { skip: process.platform !== "win32" }, async () => {
  const result = await run("probe");
  assert.deepEqual(records(result.stdout), [
    { restrictedE2eChild: true, administratorEnabled: false, powerUsersEnabled: false, privilegesReduced: true, sameUserToken: true },
    { ownedJobEmpty: true },
  ]);
  assert.equal(result.stderr, "");
});

test("Windows CI E2E preserves a failing child's exit instead of reporting a skipped pass", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-exit"), failure => {
    assert.equal(failure.code, 7);
    assert.equal(records(failure.stdout).at(-1).ownedJobEmpty, true);
    return true;
  });
});

test("Windows CI E2E timeout terminates and confirms the job before failing", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(run("probe-timeout"), failure => {
    assert.equal(failure.code, 124);
    assert.match(failure.stderr, /restricted_e2e_timeout/);
    assert.equal(records(failure.stdout).at(-1).ownedJobEmpty, true);
    return true;
  });
});

test("Windows CI E2E cleans a still-live owned descendant after its parent exits", { skip: process.platform !== "win32" }, async () => {
  const result = await run("probe-descendant");
  assert.deepEqual(records(result.stdout).slice(-2), [{ ownedDescendantCreated: true }, { ownedJobEmpty: true }]);
  assert.equal(result.stderr, "");
});

test("Windows CI E2E forwards Node output and exact quoted, trailing-slash and Unicode arguments", { skip: process.platform !== "win32" }, async () => {
  const result = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, "-Mode", "probe-node"], {
    env: { ...process.env, NODE_OPTIONS: "--no-warnings", ELECTRON_RUN_AS_NODE: "1", GITHUB_TOKEN: "fixture-ci-token", SPS_CI_E2E_SECRET_SENTINEL: "fixture-secret" },
    windowsHide: true, timeout: 30_000, maxBuffer: 32_768,
  });
  assert.deepEqual(records(result.stdout).slice(-2), [
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
  for (const mode of ["runtime-discovery", "workspace-surfaces", "plugin-preview", "host-plugin-lifecycle"]) {
    assert.match(workflow, new RegExp(`run: \\.\\\\scripts\\\\run-windows-ci-e2e\\.ps1 -Mode ${mode}`));
  }
  const source = await readFile(new URL("../scripts/windows-e2e/RestrictedE2eRunner.cs", import.meta.url), "utf8");
  assert.match(source, /CreateRestrictedToken\(token, 0x1/);
  assert.match(source, /AssignProcessToJobObject\(job, child.Process\)/);
  assert.match(source, /info.ActiveProcesses == 0/);
  assert.match(source, /if \(code != 0\) return code/);
  assert.doesNotMatch(source, /SANDBOX_INERT|CREATE_BREAKAWAY_FROM_JOB|LogonUser|net user|New-LocalUser/);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { observeConfirmedLegacyRecovery } from "../scripts/confirmed-legacy-recovery-ui.mjs";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const desktop = path.resolve(import.meta.dirname, "..");
test("real local recovery GUI orchestration is refused before filesystem, compiler or process work", async () => {
  await assert.rejects(observeConfirmedLegacyRecovery({}), /owned GitHub-hosted Windows CI launcher/);
});

test("confirmed recovery keeps the ordinary-removal diagnostic and adds real cancellation and residue checks", async () => {
  const stages = await readFile(path.join(desktop, "scripts", "historical-standard-recovery-stages.mjs"), "utf8");
  assert.match(stages, /const confirmingResidue = checkpoint\.state === "upgrade-failed"/);
  assert.match(stages, /if \(confirmingResidue\)[\s\S]*?observeConfirmedLegacyRecovery\(/);
  assert.match(stages, /ready: async \(\) =>[\s\S]*?assert\.equal\(unchanged\.sha256, checkpoint\.installationTreeSha256\)[\s\S]*?await run\(nsisInvocation\(copied, installation, \{ uninstall: true \}\)\)[\s\S]*?await verifyRetained\(\)/);
  assert.match(stages, /declined: async \(\) =>[\s\S]*?assert\.deepEqual\(await captureInstallerSnapshot\(installation\), residueSnapshot\)/);
  assert.match(stages, /standaloneCompleteRemovalQualified: false/);
  assert.match(stages, /planLegacyInstallerResidue\(\{ version: "0\.4\.86", automaticReplacementFailed: true/);
  assert.match(stages, /before: originalSnapshot, remaining: residueSnapshot/);
  assert.match(stages, /contentAllowlistOnly: true, cleanupAuthorized: false/);
  assert.match(stages, /assert\.equal\(installationAbsent, true\)/);
  const driver = await readFile(path.join(desktop, "scripts", "windows-e2e", "LegacyRecoveryUiDriver.cs"), "utf8");
  assert.match(driver, /const int OverallTimeoutMs = 450000/);
  assert.match(driver, /actualProcessId == processId/);
  assert.match(driver, /ReadDefaultId\(dialog, processId, out defaultId\) && defaultId == 7/);
  assert.match(driver, /WaitForHelperExit\(helper, 1\)/);
  assert.match(driver, /ConfirmDialog\(form, processId, root, 7\)/);
  assert.match(driver, /ConfirmDialog\(form, processId, root, 6\)/);
  assert.match(driver, /WaitForConfirmDialog\(form, processId\)/);
  assert.match(driver, /FindChildByText\(form, processId, UnsafeCleanupStatus, "Static"\)/);
  assert.match(driver, /CleanupSafetyRejectedFailure\) Console\.Error\.WriteLine\("LEGACY_UI_REASON:cleanup-safety-rejected"\)/);
  assert.match(driver, /WaitForHelperExit\(helper, 0\)/);
  assert.doesNotMatch(driver, /\.Kill\(|TerminateProcess|TerminateJobObject|File\.(?:Delete|Write)|Directory\.Delete|RegistryKey/);
});

test("Windows GUI driver compiles and its hosted guard rejects a local launch without opening a GUI", {
  skip: process.platform !== "win32", timeout: 30_000,
}, async t => {
  const parent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(parent), parent);
  const parentIdentity = await lstat(parent, { bigint: true });
  const owned = await mkdtemp(path.join(parent, "sps-legacy-ui-driver-"));
  const identity = await lstat(owned, { bigint: true });
  t.after(async () => {
    assert.equal(await assertPlainDirectory(parent), parent);
    assert.equal(await assertPlainDirectory(owned), owned);
    assert.equal(path.dirname(owned), parent);
    const currentParent = await lstat(parent, { bigint: true });
    const current = await lstat(owned, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) {
      assert.equal(currentParent[key], parentIdentity[key]);
      assert.equal(current[key], identity[key]);
    }
    await rm(owned, { recursive: true, force: false });
  });
  const executable = path.join(owned, "driver.exe");
  const compiler = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  const exec = promisify(execFile);
  await exec(compiler, ["/nologo", "/target:exe", "/platform:x64", `/out:${executable}`,
    ...["UIAutomationClient.dll", "UIAutomationTypes.dll", "WindowsBase.dll"]
      .map(name => `/reference:${path.join(path.dirname(compiler), "WPF", name)}`),
    path.join(desktop, "scripts", "windows-e2e", "LegacyRecoveryUiDriver.cs")],
  { cwd: owned, shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
  await assert.rejects(exec(executable, [], { cwd: owned, shell: false, windowsHide: true,
    env: { ...process.env, GITHUB_ACTIONS: "false" }, timeout: 5000, maxBuffer: 32768 }), error => {
    assert.equal(error.code, 2);
    assert.equal(error.stdout, "");
    assert.equal(error.stderr.trim(), "LEGACY_UI_FAILURE:entry");
    return true;
  });
});

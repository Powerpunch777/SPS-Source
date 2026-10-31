import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { nsisInvocation } from "../scripts/installer-ci-safety.mjs";

const source = await readFile(new URL("../scripts/smoke-historical-uninstaller-diagnostic.mjs", import.meta.url), "utf8");

test("ordinary legacy recovery uses the standard uninstaller without changing the automatic diagnostic", () => {
  const start = source.indexOf("const baseInvocation = nsisInvocation(");
  const end = source.indexOf("const uninstallStarted =", start);
  assert.ok(start >= 0 && end > start);
  const executable = "C:\\owned fixture\\old uninstaller.exe";
  const installation = "C:\\owned fixture\\SPS Desktop";
  for (const standardRecovery of [false, true]) {
    const result = runInNewContext(`${source.slice(start, end)}\ninvocation;`, {
      nsisInvocation, copiedUninstaller: executable, installation, standardRecovery,
    });
    assert.equal(result.executable, executable);
    assert.deepEqual([...result.args], standardRecovery
      ? ["/S", "/currentuser", `_?=${installation}`]
      : ["/S", "/KEEP_APP_DATA", "/currentuser", "--updated", `_?=${installation}`]);
    assert.equal(result.options.shell, false);
    assert.equal(result.options.windowsVerbatimArguments, true);
  }
});

test("recovery refuses combined shortened paths and proves all inert retained bytes and full program removal", () => {
  const guard = source.indexOf("assertHostedInstallerCi();");
  const mode = source.indexOf("const recoveryVariant = process.env.SPS_INSTALLER_DIAGNOSTIC_RECOVERY;");
  const data = source.indexOf("const appData =");
  assert.ok(guard >= 0 && mode > guard && data > mode);
  assert.match(source, /recoveryVariant === undefined \|\| recoveryVariant === "standard-uninstall"/);
  assert.match(source, /assert\.equal\(standardRecovery && compactControl, false/);
  assert.match(source, /assert\.equal\(retained\.length, 10\)/);
  assert.match(source, /details\.isFile\(\) && !details\.isSymbolicLink\(\) && details\.nlink === 1 && details\.size === 128/);
  assert.match(source, /createHash\("sha256"\)\.update\(await readFile\(item\.file\)\)\.digest\("hex"\), item\.sha256/);
  const uninstall = source.indexOf('trace("historical-uninstall-start")');
  const exit = source.indexOf("assert.equal(uninstallResult.code, 0)", uninstall);
  const retained = source.indexOf("await verifyRetainedData()", exit);
  const removed = source.indexOf("assert.equal(await missing(installation), true", retained);
  const qualified = source.indexOf("historicalStandardUninstallDataPreservationQualified: standardRecovery", removed);
  assert.ok(uninstall >= 0 && exit > uninstall && retained > exit && removed > retained && qualified > removed);
  assert.match(source, /operatorReinstallRecoveryQualified: false/);
  assert.match(source, /candidateUpgradeQualified: false, previousStableUpgradeQualified: false/);
  assert.match(source, /process\.exitCode = OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
  assert.doesNotMatch(source, /taskkill|Stop-Process|unlink\(|\brm\(/);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { parseHistoricalRecoveryCheckpoint } from "../scripts/historical-standard-recovery-stages.mjs";

const now = Date.now();
const checkpoint = () => ({ version: 2, createdAt: now, state: "installed",
  fixtureName: "sps-installer-data-uninstaller-diagnostic-aB12Cd", fixtureIdentity: "12:34:56",
  installerSha256: "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56",
  uninstallerSha256: "a".repeat(64), asarSha256: "b".repeat(64), retained: Array(10).fill("c".repeat(64)),
  candidateInstallerSha256: null, installationTreeSha256: null, installationIdentity: null });
const encode = value => `${JSON.stringify(value)}\n`;

test("checkpoint is exact, time-bound, pinned and contains no configurable absolute paths", () => {
  const value = checkpoint();
  assert.deepEqual(parseHistoricalRecoveryCheckpoint(encode(value), now), value);
  for (const changes of [{ version: 1 }, { createdAt: now + 1 }, { createdAt: now - 30 * 60_000 - 1 },
    { fixtureName: "../outside" }, { fixtureName: "C:\\outside" }, { fixtureIdentity: "12:-34:56" },
    { installerSha256: "d".repeat(64) }, { uninstallerSha256: "invalid" }, { asarSha256: "A".repeat(64) },
    { retained: [] }, { retained: Array(10).fill(null) }, { extra: true }, { state: "unknown" },
    { state: "upgrade-failed" }, { state: "uninstalled" }, { candidateInstallerSha256: "d".repeat(64) }]) {
    assert.throws(() => parseHistoricalRecoveryCheckpoint(encode({ ...value, ...changes }), now),
      { message: "Historical recovery checkpoint is invalid." });
  }
  for (const raw of [JSON.stringify(value), JSON.stringify(value, null, 2), `${encode(value)}\n`,
    `{"version":2,${JSON.stringify(value).slice(1)}\n`, "x".repeat(4097), "null", "[]"]) {
    assert.throws(() => parseHistoricalRecoveryCheckpoint(raw, now));
  }
});

test("only completed validated transitions can carry candidate and preserved-program identities", () => {
  for (const state of ["upgrade-failed", "uninstalled"]) {
    const value = { ...checkpoint(), state, candidateInstallerSha256: "d".repeat(64),
      installationTreeSha256: "e".repeat(64), installationIdentity: "4:5:6" };
    assert.deepEqual(parseHistoricalRecoveryCheckpoint(encode(value), now), value);
    for (const invalid of [{ candidateInstallerSha256: null }, { installationTreeSha256: null },
      { installationIdentity: null }, { state: "installed" }]) {
      assert.throws(() => parseHistoricalRecoveryCheckpoint(encode({ ...value, ...invalid }), now));
    }
  }
});

test("stages preserve original path, ordinary flags, exact bytes and separately pending Job evidence", async () => {
  const source = await readFile(new URL("../scripts/historical-standard-recovery-stages.mjs", import.meta.url), "utf8");
  const guard = source.indexOf("assertHostedInstallerCi();");
  const temp = source.indexOf("const temporaryRoot =");
  assert.ok(guard >= 0 && temp > guard);
  assert.match(source, /mkdtemp\(path\.join\(temporaryRoot, "sps-installer-data-uninstaller-diagnostic-"\)\)/);
  assert.match(source, /const installation = path\.join\(fixture, "SPS Desktop"\)/);
  assert.match(source, /assert\.equal\(await identity\(fixture\), checkpoint\.fixtureIdentity\)/);
  assert.match(source, /assert\.equal\(await hash\(uninstaller\), checkpoint\.uninstallerSha256\)/);
  assert.match(source, /assert\.equal\(await hash\(asar\), checkpoint\.asarSha256\)/);
  assert.match(source, /await writeFile\(checkpointPath, encoded, \{ flag: "wx", mode: 0o600 \}\)/);
  assert.match(source, /await run\(nsisInvocation\(copied, installation, \{ uninstall: true \}\)\)/);
  assert.doesNotMatch(source, /--updated|KEEP_APP_DATA|delete-app-data|Stop-Process|taskkill|\brm\(/);
  assert.match(source, /assert\.equal\(result\.signal, null\)/);
  assert.match(source, /assert\.equal\(result\.code, 0\)/);
  assert.match(source, /const installationAbsent = await missing\(installation\)/);
  assert.match(source, /assert\.equal\(installationAbsent, true\)/);
  assert.match(source, /"ordinary-uninstall-postconditions", \{ registrations: registrations\.length, installationAbsent \}/);
  assert.match(source, /if \(!installationAbsent\) trace\("ordinary-uninstall-remaining-tree", await collectInstallerPathCensus\(installation\)\)/);
  assert.match(source, /historicalStandardUninstallDataPreservationQualified: true, candidateUpgradeQualified: false/);
  assert.match(source, /operatorReinstallRecoveryQualified: false, previousStableUpgradeQualified: false/);
  assert.match(source, /return OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
  const entry = await readFile(new URL("../scripts/smoke-historical-uninstaller-diagnostic.mjs", import.meta.url), "utf8");
  const stage = entry.indexOf("const exitCode = await runHistoricalStandardRecoveryStage(recoveryVariant)");
  const flush = entry.indexOf('process.stdout.write("", error => error ? reject(error) : resolve())', stage);
  const exit = entry.indexOf("process.exit(exitCode)", flush);
  assert.ok(stage >= 0 && flush > stage && exit > flush);
});

test("stage entry rejects real local invocation before checkpoint, profile or process access", async () => {
  const script = new URL("../scripts/historical-standard-recovery-stages.mjs", import.meta.url).href;
  for (const stage of ["standard-uninstall-prepare", "standard-uninstall-complete", "operator-upgrade", "operator-reinstall"]) {
    await assert.rejects(promisify(execFile)(process.execPath, ["--input-type=module", "-e",
      `const {runHistoricalStandardRecoveryStage}=await import(${JSON.stringify(script)}); await runHistoricalStandardRecoveryStage(${JSON.stringify(stage)});`], {
      env: { ...process.env, GITHUB_ACTIONS: "false", RUNNER_OS: "", RUNNER_ENVIRONMENT: "" },
      windowsHide: true, timeout: 10_000, maxBuffer: 32_768,
    }), error => {
      assert.equal(error.stdout, "");
      assert.match(error.stderr, /Installer data preservation requires the owned GitHub-hosted Windows CI launcher/);
      return true;
    });
  }
});

test("operator recovery demands actual failure preservation then exact same-candidate reinstall and first frame", async () => {
  const source = await readFile(new URL("../scripts/historical-standard-recovery-stages.mjs", import.meta.url), "utf8");
  const upgrade = source.indexOf('} else if (stage === "operator-upgrade")');
  const reinstall = source.indexOf('} else if (stage === "operator-reinstall")', upgrade);
  const ordinary = source.indexOf('phase = "verify-prepared-input"', reinstall);
  assert.ok(upgrade >= 0 && reinstall > upgrade && ordinary > reinstall);
  const failure = source.slice(upgrade, reinstall);
  assert.match(failure, /assert\.equal\(checkpoint\.state, "installed"\)/);
  const before = failure.indexOf("await captureInstallerSnapshot(installation)");
  const attempt = failure.indexOf("await run(nsisInvocation(input.installer, installation)");
  const code = failure.indexOf("assert.equal(result.code, 2");
  const after = failure.indexOf("await captureInstallerSnapshot(installation)", before + 1);
  const preserve = failure.indexOf("assert.deepEqual(after, before)");
  const state = failure.indexOf('checkpoint.state = "upgrade-failed"');
  assert.ok(before >= 0 && attempt > before && code > attempt && after > code && preserve > after && state > preserve);
  assert.doesNotMatch(failure, /uninstall: true|operatorReinstallRecoveryQualified: true/);
  const restored = source.slice(reinstall, ordinary);
  assert.match(restored, /assert\.equal\(checkpoint\.state, "uninstalled"\)/);
  assert.match(restored, /assert\.equal\(await missing\(installation\), true\)/);
  assert.match(restored, /await run\(nsisInvocation\(input\.installer, installation\)\)/);
  assert.match(restored, /for \(const \[relative, sha256\] of input.expected\) assert.equal\(await hash/);
  assert.match(restored, /smoke-isolated-desktop-ui\.mjs/);
  assert.match(restored, /Isolated packaged SPS Desktop sign-in smoke test passed with confirmed owned Job cleanup/);
  assert.match(restored, /operatorReinstallRecoveryQualified: true/);
  assert.match(restored, /historicalInstallerUpgradeQualified: false, previousStableUpgradeQualified: false/);
  assert.match(source, /assert\.equal\(sha256, checkpoint\.candidateInstallerSha256\)/);
  assert.match(source, /assert\.equal\(baseline\.sourceRevision, await gitHead\(repository\)\)/);
  assert.match(source, /assert\.equal\(baseline\.core\.revision, await gitHead/);
  assert.match(source, /assert\.equal\(baseline\.pluginSdk\.revision, await gitHead/);
});

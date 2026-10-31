import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";
import { parseHistoricalRecoveryCheckpoint } from "../scripts/historical-standard-recovery-stages.mjs";

const now = Date.now();
const checkpoint = () => ({ version: 1, createdAt: now,
  fixtureName: "sps-installer-data-uninstaller-diagnostic-aB12Cd", fixtureIdentity: "12:34:56",
  installerSha256: "d65da55e0e326e65ed0b9b5c21a015b1d8cc2c79bfea589626a50288b00e0c56",
  uninstallerSha256: "a".repeat(64), asarSha256: "b".repeat(64), retained: Array(10).fill("c".repeat(64)) });
const encode = value => `${JSON.stringify(value)}\n`;

test("checkpoint is exact, time-bound, pinned and contains no configurable absolute paths", () => {
  const value = checkpoint();
  assert.deepEqual(parseHistoricalRecoveryCheckpoint(encode(value), now), value);
  for (const changes of [{ version: 2 }, { createdAt: now + 1 }, { createdAt: now - 30 * 60_000 - 1 },
    { fixtureName: "../outside" }, { fixtureName: "C:\\outside" }, { fixtureIdentity: "12:-34:56" },
    { installerSha256: "d".repeat(64) }, { uninstallerSha256: "invalid" }, { asarSha256: "A".repeat(64) },
    { retained: [] }, { retained: Array(10).fill(null) }, { extra: true }]) {
    assert.throws(() => parseHistoricalRecoveryCheckpoint(encode({ ...value, ...changes }), now),
      { message: "Historical recovery checkpoint is invalid." });
  }
  for (const raw of [JSON.stringify(value), JSON.stringify(value, null, 2), `${encode(value)}\n`,
    `{"version":2,${JSON.stringify(value).slice(1)}\n`, "x".repeat(4097), "null", "[]"]) {
    assert.throws(() => parseHistoricalRecoveryCheckpoint(raw, now));
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
  assert.match(source, /assert\.equal\(await missing\(installation\), true\)/);
  assert.match(source, /historicalStandardUninstallDataPreservationQualified: true, candidateUpgradeQualified: false/);
  assert.match(source, /operatorReinstallRecoveryQualified: false, previousStableUpgradeQualified: false/);
  assert.match(source, /return OWNED_JOB_CLEANUP_PENDING_EXIT_CODE/);
});

test("stage entry rejects real local invocation before checkpoint, profile or process access", async () => {
  const script = new URL("../scripts/historical-standard-recovery-stages.mjs", import.meta.url).href;
  for (const stage of ["standard-uninstall-prepare", "standard-uninstall-complete"]) {
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

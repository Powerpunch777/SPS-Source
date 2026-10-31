import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assertHostedInstallerCi, assertContained, assertPlainDirectory, nsisInvocation } from "./installer-ci-safety.mjs";
import { queryInstallerProcesses } from "./installer-process-query.mjs";
import { queryInstallerRegistrations } from "./installer-registry-query.mjs";
import { HISTORICAL_INSTALLER_BASELINE, stageHistoricalInstaller } from "./historical-installer-baseline.mjs";
import { OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";

const relativeRecords = ["sps-desktop-state.json", "workspaces/retained/data.bin", "secrets/retained-opaque-record.bin"];
const checkpointName = "sps-standard-recovery-checkpoint.json";
const digestPattern = /^[a-f0-9]{64}$/;

export function parseHistoricalRecoveryCheckpoint(text, now = Date.now()) {
  const invalid = () => new Error("Historical recovery checkpoint is invalid.");
  try {
    if (typeof text !== "string" || Buffer.byteLength(text) > 4096 || !Number.isSafeInteger(now)) throw invalid();
    const value = JSON.parse(text);
    const keys = ["version", "createdAt", "fixtureName", "fixtureIdentity", "installerSha256", "uninstallerSha256", "asarSha256", "retained"];
    if (!value || Object.keys(value).sort().join(",") !== keys.sort().join(",")
      || `${JSON.stringify(value)}\n` !== text || value.version !== 1
      || !Number.isSafeInteger(value.createdAt) || now < value.createdAt || now - value.createdAt > 30 * 60_000
      || !/^sps-installer-data-uninstaller-diagnostic-[A-Za-z0-9]{6}$/.test(value.fixtureName)
      || !/^\d+:\d+:\d+$/.test(value.fixtureIdentity)
      || value.installerSha256 !== HISTORICAL_INSTALLER_BASELINE.sha256
      || !digestPattern.test(value.uninstallerSha256) || !digestPattern.test(value.asarSha256)
      || !Array.isArray(value.retained) || value.retained.length !== 10
      || !value.retained.every(hash => typeof hash === "string" && digestPattern.test(hash))) throw invalid();
    return value;
  } catch { throw invalid(); }
}

export async function runHistoricalStandardRecoveryStage(stage) {
  assertHostedInstallerCi();
  assert.ok(stage === "standard-uninstall-prepare" || stage === "standard-uninstall-complete");
  const preparing = stage === "standard-uninstall-prepare";
  let phase = "prerequisites";
  const trace = (event, detail = {}) => console.log(JSON.stringify({ historicalRecoveryStage: stage, event, ...detail }));
  try {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(manifest.name, "@sps/desktop");
    assert.equal(manifest.build.productName, "SPS Desktop");
    assert.equal(manifest.build.nsis.perMachine, false);
    assert.equal(manifest.build.nsis.deleteAppDataOnUninstall, false);
    const temporaryRoot = await assertPlainDirectory(os.tmpdir());
    const appData = await assertPlainDirectory(process.env.APPDATA);
    const checkpointPath = path.join(temporaryRoot, checkpointName);
    const aliases = ["@spsdesktop", "SPS Desktop", "@sps/desktop"].map(name => path.join(appData, name));
    for (const alias of aliases) assertContained(appData, alias);
    const missing = async file => {
      try { await lstat(file); return false; }
      catch (error) { if (error.code === "ENOENT") return true; throw error; }
    };
    const noProcess = async () => assert.equal((await queryInstallerProcesses()).count, 0);
    const identity = async directory => {
      assert.equal(await assertPlainDirectory(directory), directory);
      const stat = await lstat(directory, { bigint: true });
      return [stat.dev, stat.ino, stat.birthtimeNs].join(":");
    };
    const hash = async file => {
      await assertPlainDirectory(path.dirname(file));
      const stat = await lstat(file, { bigint: true });
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n);
      const result = createHash("sha256");
      for await (const chunk of createReadStream(file)) result.update(chunk);
      const after = await lstat(file, { bigint: true });
      for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[key], stat[key]);
      return result.digest("hex");
    };
    let checkpoint;
    let checkpointIdentity;
    if (preparing) {
      assert.equal(await missing(checkpointPath), true);
      assert.deepEqual(await queryInstallerRegistrations(), []);
      await noProcess();
      for (const alias of aliases) assert.equal(await missing(alias), true);
      const fixture = await mkdtemp(path.join(temporaryRoot, "sps-installer-data-uninstaller-diagnostic-"));
      assertContained(temporaryRoot, fixture);
      checkpoint = { version: 1, createdAt: Date.now(), fixtureName: path.basename(fixture),
        fixtureIdentity: await identity(fixture), installerSha256: HISTORICAL_INSTALLER_BASELINE.sha256,
        uninstallerSha256: "", asarSha256: "", retained: [] };
    } else {
      const stat = await lstat(checkpointPath, { bigint: true });
      assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n && stat.size <= 4096n);
      checkpointIdentity = [stat.dev, stat.ino, stat.birthtimeNs].join(":");
      const handle = await open(checkpointPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const opened = await handle.stat({ bigint: true });
        assert.equal([opened.dev, opened.ino, opened.birthtimeNs].join(":"), checkpointIdentity);
        assert.ok(opened.isFile() && opened.nlink === 1n && opened.size <= 4096n);
        const bytes = Buffer.alloc(4097);
        let length = 0;
        while (length < bytes.length) {
          const { bytesRead } = await handle.read(bytes, length, bytes.length - length, length);
          if (!bytesRead) break;
          length += bytesRead;
        }
        assert.ok(length <= 4096 && BigInt(length) === opened.size);
        const after = await handle.stat({ bigint: true });
        for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[key], opened[key]);
        checkpoint = parseHistoricalRecoveryCheckpoint(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length)));
      } finally { await handle.close(); }
    }
    const fixture = path.join(temporaryRoot, checkpoint.fixtureName);
    assert.equal(path.dirname(fixture), temporaryRoot);
    const verifyFixture = async () => assert.equal(await identity(fixture), checkpoint.fixtureIdentity);
    await verifyFixture();
    const installation = path.join(fixture, "SPS Desktop");
    const uninstaller = path.join(installation, "Uninstall SPS Desktop.exe");
    const asar = path.join(installation, "resources", "app.asar");
    const records = aliases.flatMap(root => relativeRecords.map(relative => path.join(root, relative)));
    records.push(path.join(fixture, "retained-project", "source.txt"));
    const verifyRetained = async () => {
      assert.equal(checkpoint.retained.length, records.length);
      for (let index = 0; index < records.length; index++) {
        assert.equal((await lstat(records[index])).size, 128);
        assert.equal(await hash(records[index]), checkpoint.retained[index]);
      }
      trace("retained-data-verified", { userRecords: 9, projectRecords: 1 });
    };
    const verifyOld = async () => {
      await verifyFixture();
      assert.deepEqual(await queryInstallerRegistrations(), [{ name: "SPS Desktop 0.4.86", perUser: true,
        uninstall: `"${uninstaller}" /currentuser`, version: "0.4.86" }]);
      assert.equal(await hash(uninstaller), checkpoint.uninstallerSha256);
      assert.equal(await hash(asar), checkpoint.asarSha256);
    };
    const run = async invocation => {
      await noProcess();
      await verifyFixture();
      const started = Date.now();
      const child = spawn(invocation.executable, invocation.args, { ...invocation.options, cwd: fixture, stdio: "ignore" });
      const result = await new Promise((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (code, signal) => resolve({ code, signal, elapsedMs: Date.now() - started }));
      });
      trace("nsis-closed", { phase, ...result });
      assert.equal(result.signal, null);
      assert.equal(result.code, 0);
      await noProcess();
    };
    if (preparing) {
      phase = "seed-owned-data";
      await mkdir(installation);
      for (const alias of aliases) {
        assert.equal(await missing(alias), true);
        const parent = path.dirname(alias);
        if (parent !== appData && await missing(parent)) await mkdir(parent);
        await assertPlainDirectory(parent);
        await mkdir(alias);
      }
      for (const file of records) {
        await mkdir(path.dirname(file), { recursive: true });
        await assertPlainDirectory(path.dirname(file));
        await writeFile(file, randomBytes(128), { flag: "wx" });
        checkpoint.retained.push(await hash(file));
      }
      phase = "install-pinned-input";
      const staged = await stageHistoricalInstaller(fixture);
      await run(nsisInvocation(staged.path, installation));
      checkpoint.uninstallerSha256 = await hash(uninstaller);
      checkpoint.asarSha256 = await hash(asar);
      await verifyOld();
      await verifyRetained();
      const encoded = `${JSON.stringify(checkpoint)}\n`;
      parseHistoricalRecoveryCheckpoint(encoded);
      await writeFile(checkpointPath, encoded, { flag: "wx", mode: 0o600 });
      trace("prepared-checkpoint", { userRecords: 9, projectRecords: 1, cleanupQualification: "pending" });
    } else {
      phase = "verify-prepared-input";
      await noProcess();
      await verifyOld();
      await verifyRetained();
      const copied = path.join(fixture, "owned-standard-uninstaller.exe");
      await copyFile(uninstaller, copied, constants.COPYFILE_EXCL);
      assert.equal(await hash(copied), checkpoint.uninstallerSha256);
      phase = "ordinary-uninstall";
      await run(nsisInvocation(copied, installation, { uninstall: true }));
      await verifyRetained();
      assert.deepEqual(await queryInstallerRegistrations(), []);
      assert.equal(await missing(installation), true);
      const current = await lstat(checkpointPath, { bigint: true });
      assert.equal([current.dev, current.ino, current.birthtimeNs].join(":"), checkpointIdentity);
      assert.ok(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n);
      await unlink(checkpointPath);
      trace("ordinary-uninstall-preserved-data", { userRecords: 9, projectRecords: 1,
        historicalStandardUninstallDataPreservationQualified: true, candidateUpgradeQualified: false,
        operatorReinstallRecoveryQualified: false, previousStableUpgradeQualified: false,
        applicationLaunched: false, cleanupQualification: "pending" });
    }
    return OWNED_JOB_CLEANUP_PENDING_EXIT_CODE;
  } catch (error) {
    trace("failed", { phase, failed: true, errorType: error?.name === "AssertionError" ? "assertion" : "operation" });
    return 1;
  }
}

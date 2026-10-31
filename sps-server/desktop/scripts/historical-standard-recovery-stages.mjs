import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, constants } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, open, readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { assertHostedInstallerCi, assertContained, assertPlainDirectory, nsisInvocation } from "./installer-ci-safety.mjs";
import { queryInstallerProcesses } from "./installer-process-query.mjs";
import { queryInstallerRegistrations } from "./installer-registry-query.mjs";
import { HISTORICAL_INSTALLER_BASELINE, stageHistoricalInstaller } from "./historical-installer-baseline.mjs";
import { OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";
import { captureInstallerSnapshot } from "./installer-retained-snapshot.mjs";
import { collectInstallerPathCensus } from "./installer-path-census.mjs";
import { encodeLegacyProgramInventory } from "../src/legacy-installer-residue-plan.mjs";

const relativeRecords = ["sps-desktop-state.json", "workspaces/retained/data.bin", "secrets/retained-opaque-record.bin"];
const checkpointName = "sps-standard-recovery-checkpoint.json";
const digestPattern = /^[a-f0-9]{64}$/;

export function parseHistoricalRecoveryCheckpoint(text, now = Date.now()) {
  const invalid = () => new Error("Historical recovery checkpoint is invalid.");
  try {
    if (typeof text !== "string" || Buffer.byteLength(text) > 4096 || !Number.isSafeInteger(now)) throw invalid();
    const value = JSON.parse(text);
    const keys = ["version", "createdAt", "state", "fixtureName", "fixtureIdentity", "installerSha256", "uninstallerSha256", "asarSha256", "retained",
      "candidateInstallerSha256", "installationTreeSha256", "installationIdentity"];
    if (!value || Object.keys(value).sort().join(",") !== keys.sort().join(",")
      || `${JSON.stringify(value)}\n` !== text || value.version !== 2
      || !["installed", "upgrade-failed", "uninstalled"].includes(value.state)
      || !Number.isSafeInteger(value.createdAt) || now < value.createdAt || now - value.createdAt > 30 * 60_000
      || !/^sps-installer-data-uninstaller-diagnostic-[A-Za-z0-9]{6}$/.test(value.fixtureName)
      || !/^\d+:\d+:\d+$/.test(value.fixtureIdentity)
      || value.installerSha256 !== HISTORICAL_INSTALLER_BASELINE.sha256
      || !digestPattern.test(value.uninstallerSha256) || !digestPattern.test(value.asarSha256)
      || !Array.isArray(value.retained) || value.retained.length !== 10
      || !value.retained.every(hash => typeof hash === "string" && digestPattern.test(hash))) throw invalid();
    if (value.state === "installed") {
      if (value.candidateInstallerSha256 !== null || value.installationTreeSha256 !== null || value.installationIdentity !== null) throw invalid();
    } else if (!digestPattern.test(value.candidateInstallerSha256) || !digestPattern.test(value.installationTreeSha256)
      || !/^\d+:\d+:\d+$/.test(value.installationIdentity)) throw invalid();
    return value;
  } catch { throw invalid(); }
}

export async function runHistoricalStandardRecoveryStage(stage) {
  assertHostedInstallerCi();
  assert.ok(["standard-uninstall-prepare", "standard-uninstall-complete", "operator-upgrade", "operator-reinstall"].includes(stage));
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
      checkpoint = { version: 2, createdAt: Date.now(), state: "installed", fixtureName: path.basename(fixture),
        fixtureIdentity: await identity(fixture), installerSha256: HISTORICAL_INSTALLER_BASELINE.sha256,
        uninstallerSha256: "", asarSha256: "", retained: [], candidateInstallerSha256: null,
        installationTreeSha256: null, installationIdentity: null };
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
    const exec = promisify(execFile);
    const desktop = path.resolve(import.meta.dirname, "..");
    const repository = path.resolve(desktop, "../..");
    const candidateInput = async () => {
      const baseline = JSON.parse(await readFile(path.join(desktop, ".owner-host-runtime", "sps-release-baseline.json"), "utf8"));
      assert.equal(baseline.schemaVersion, 1);
      assert.equal(baseline.product, "SPS Desktop");
      assert.equal(baseline.desktopVersion, manifest.version);
      assert.equal(baseline.sourceDirty, false);
      assert.equal(baseline.core.dirty, false);
      assert.equal(baseline.pluginSdk.dirty, false);
      const gitHead = async directory => {
        const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: directory, shell: false,
          windowsHide: true, timeout: 10_000, maxBuffer: 4096 });
        const revision = stdout.trim();
        assert.match(revision, /^[a-f0-9]{40}$/);
        return revision;
      };
      assert.equal(baseline.sourceRevision, await gitHead(repository));
      assert.equal(baseline.core.revision, await gitHead(path.join(repository, "external", "sps-core")));
      assert.equal(baseline.pluginSdk.revision, await gitHead(path.join(repository, "external", "sps-plugin-sdk")));
      const installer = path.join(desktop, "dist", `SPS-Desktop-Setup-${manifest.version}.exe`);
      const sha256 = await hash(installer);
      if (checkpoint.candidateInstallerSha256) assert.equal(sha256, checkpoint.candidateInstallerSha256);
      const expected = new Map();
      for (const relative of ["SPS Desktop.exe", "resources/app.asar",
        "resources/sps-windows-job-supervisor/SpsWindowsJobSupervisor.exe",
        "resources/sps-owner-host-runtime-package/sps-owner-host-runtime.tgz",
        "resources/sps-owner-host-runtime-package/sps-owner-host-runtime-package.json"]) {
        expected.set(relative, await hash(path.join(desktop, "dist", "win-unpacked", relative)));
      }
      return { installer, sha256, expected, baseline };
    };
    const persistCheckpoint = async () => {
      checkpoint.createdAt = Date.now();
      const encoded = `${JSON.stringify(checkpoint)}\n`;
      parseHistoricalRecoveryCheckpoint(encoded);
      const handle = await open(checkpointPath, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat = await handle.stat({ bigint: true });
        assert.ok(stat.isFile() && stat.nlink === 1n);
        assert.equal([stat.dev, stat.ino, stat.birthtimeNs].join(":"), checkpointIdentity);
        await handle.truncate(0);
        await handle.writeFile(encoded);
        await handle.sync();
      } finally { await handle.close(); }
      const after = await lstat(checkpointPath, { bigint: true });
      assert.ok(after.isFile() && !after.isSymbolicLink() && after.nlink === 1n);
      assert.equal([after.dev, after.ino, after.birthtimeNs].join(":"), checkpointIdentity);
    };
    const removeCheckpoint = async () => {
      const current = await lstat(checkpointPath, { bigint: true });
      assert.equal([current.dev, current.ino, current.birthtimeNs].join(":"), checkpointIdentity);
      assert.ok(current.isFile() && !current.isSymbolicLink() && current.nlink === 1n);
      await unlink(checkpointPath);
    };
    const run = async (invocation, { allowLegacyFailure = false } = {}) => {
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
      if (allowLegacyFailure) assert.ok(result.code === 0 || result.code === 2);
      else assert.equal(result.code, 0);
      await noProcess();
      return result;
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
      phase = "capture-clean-package-inventory";
      const inventory = encodeLegacyProgramInventory(await captureInstallerSnapshot(installation));
      const output = path.join(desktop, "dist");
      await mkdir(output, { recursive: true });
      await assertPlainDirectory(output);
      await writeFile(path.join(output, "sps-legacy-program-inventory-0.4.86.json"), inventory, { flag: "wx", mode: 0o600 });
      trace("clean-package-inventory", { bytes: inventory.length, sha256: createHash("sha256").update(inventory).digest("hex"),
        installerSha256: HISTORICAL_INSTALLER_BASELINE.sha256, containsMachineIdentity: false });
      const encoded = `${JSON.stringify(checkpoint)}\n`;
      parseHistoricalRecoveryCheckpoint(encoded);
      await writeFile(checkpointPath, encoded, { flag: "wx", mode: 0o600 });
      trace("prepared-checkpoint", { userRecords: 9, projectRecords: 1, cleanupQualification: "pending" });
    } else if (stage === "operator-upgrade") {
      phase = "verify-automatic-replacement-input";
      assert.equal(checkpoint.state, "installed");
      await noProcess();
      await verifyOld();
      await verifyRetained();
      const input = await candidateInput();
      const before = await captureInstallerSnapshot(installation);
      phase = "attempt-automatic-replacement";
      const result = await run(nsisInvocation(input.installer, installation), { allowLegacyFailure: true });
      // This branch qualifies the actual failure/recovery path, not an automatic
      // success, arbitrary error, timeout, signal or a simulated installer exit.
      assert.equal(result.code, 2, "The operator-recovery fixture requires a real old-version replacement failure.");
      await verifyOld();
      await verifyRetained();
      const after = await captureInstallerSnapshot(installation);
      assert.deepEqual(after, before);
      checkpoint.state = "upgrade-failed";
      checkpoint.candidateInstallerSha256 = input.sha256;
      checkpoint.installationTreeSha256 = after.sha256;
      checkpoint.installationIdentity = [after.rootIdentity.dev, after.rootIdentity.ino, after.rootIdentity.birthtimeNs].join(":");
      await persistCheckpoint();
      trace("failed-replacement-preserved", { originalExitCode: 2, files: after.files.length,
        installationTreeSha256: after.sha256, userRecords: 9, projectRecords: 1,
        automaticUpgradeQualified: false, operatorRecoveryStarted: false, cleanupQualification: "pending" });
    } else if (stage === "operator-reinstall") {
      phase = "verify-reinstall-input";
      assert.equal(checkpoint.state, "uninstalled");
      const input = await candidateInput();
      await noProcess();
      await verifyFixture();
      await verifyRetained();
      assert.deepEqual(await queryInstallerRegistrations(), []);
      assert.equal(await missing(installation), true);
      phase = "operator-candidate-reinstall";
      await run(nsisInvocation(input.installer, installation));
      assert.deepEqual(await queryInstallerRegistrations(), [{ name: `SPS Desktop ${manifest.version}`, perUser: true,
        uninstall: `"${uninstaller}" /currentuser`, version: manifest.version }]);
      for (const [relative, sha256] of input.expected) assert.equal(await hash(path.join(installation, relative)), sha256);
      await verifyRetained();
      phase = "isolated-candidate-first-frame";
      const { stdout } = await exec(process.execPath, [path.join(desktop, "scripts", "smoke-isolated-desktop-ui.mjs")], {
        cwd: desktop, env: { ...process.env, SPS_DESKTOP_E2E_BINARY: path.join(installation, "SPS Desktop.exe") },
        windowsHide: true, shell: false, timeout: 60_000, maxBuffer: 1024 * 1024,
      });
      assert.match(stdout, /Isolated packaged SPS Desktop sign-in smoke test passed with confirmed owned Job cleanup/);
      await noProcess();
      await verifyRetained();
      await removeCheckpoint();
      trace("operator-candidate-reinstall-preserved-data", { userRecords: 9, projectRecords: 1,
        packageByteParity: input.expected.size, candidateInstallerSha256: input.sha256,
        sourceRevision: input.baseline.sourceRevision, coreRevision: input.baseline.core.revision,
        sdkRevision: input.baseline.pluginSdk.revision, operatorReinstallRecoveryQualified: true,
        historicalInstallerUpgradeQualified: false, previousStableUpgradeQualified: false,
        applicationDataMigrationQualified: false, normalUserProfileStartupQualified: false,
        signedInstallerQualified: false, physicalTwoDeviceQualified: false, cleanupQualification: "pending" });
    } else {
      phase = "verify-prepared-input";
      assert.ok(checkpoint.state === "installed" || checkpoint.state === "upgrade-failed");
      await noProcess();
      await verifyOld();
      await verifyRetained();
      if (checkpoint.state === "upgrade-failed") {
        await candidateInput();
        const snapshot = await captureInstallerSnapshot(installation);
        assert.equal(snapshot.sha256, checkpoint.installationTreeSha256);
        assert.equal([snapshot.rootIdentity.dev, snapshot.rootIdentity.ino, snapshot.rootIdentity.birthtimeNs].join(":"), checkpoint.installationIdentity);
      }
      const copied = path.join(fixture, "owned-standard-uninstaller.exe");
      await copyFile(uninstaller, copied, constants.COPYFILE_EXCL);
      assert.equal(await hash(copied), checkpoint.uninstallerSha256);
      let recoveryEvidence;
      const confirmingResidue = checkpoint.state === "upgrade-failed";
      if (confirmingResidue) {
        const { observeConfirmedLegacyRecovery } = await import("./confirmed-legacy-recovery-ui.mjs");
        let residueSnapshot;
        phase = "explicit-original-residue-recovery";
        recoveryEvidence = await observeConfirmedLegacyRecovery({ desktop, fixture, installation,
          ready: async () => {
            // The first GUI session was cancelled. The second remains open to
            // retain the registered target identity while Windows uninstalls it.
            await verifyOld();
            await verifyRetained();
            const unchanged = await captureInstallerSnapshot(installation);
            assert.equal(unchanged.sha256, checkpoint.installationTreeSha256);
            assert.equal([unchanged.rootIdentity.dev, unchanged.rootIdentity.ino, unchanged.rootIdentity.birthtimeNs].join(":"), checkpoint.installationIdentity);
            phase = "ordinary-uninstall-before-confirmed-cleanup";
            await run(nsisInvocation(copied, installation, { uninstall: true }));
            await verifyRetained();
            assert.deepEqual(await queryInstallerRegistrations(), []);
            await noProcess();
            assert.equal(await missing(installation), false, "This fixture must observe actual old-program residue, not waive the absence check.");
            residueSnapshot = await captureInstallerSnapshot(installation);
            const census = await collectInstallerPathCensus(installation);
            trace("ordinary-uninstall-residue-before-explicit-recovery", { ...census,
              standaloneCompleteRemovalQualified: false, retainedDataVerified: true });
            assert.equal(census.complete, true);
          },
          declined: async () => {
            assert.deepEqual(await captureInstallerSnapshot(installation), residueSnapshot);
            await verifyRetained();
            await noProcess();
            trace("residue-decline-preserved", { completeProgramSnapshotUnchanged: true, userRecords: 9, projectRecords: 1 });
          },
        });
      } else {
        phase = "ordinary-uninstall";
        await run(nsisInvocation(copied, installation, { uninstall: true }));
      }
      await verifyRetained();
      phase = confirmingResidue ? "verify-confirmed-recovery-removal" : "verify-ordinary-removal";
      const registrations = await queryInstallerRegistrations();
      const installationAbsent = await missing(installation);
      trace(confirmingResidue ? "confirmed-recovery-postconditions" : "ordinary-uninstall-postconditions", { registrations: registrations.length, installationAbsent });
      if (!installationAbsent) trace("ordinary-uninstall-remaining-tree", await collectInstallerPathCensus(installation));
      assert.deepEqual(registrations, []);
      assert.equal(installationAbsent, true);
      if (checkpoint.state === "upgrade-failed") {
        checkpoint.state = "uninstalled";
        await persistCheckpoint();
      } else await removeCheckpoint();
      trace(confirmingResidue ? "confirmed-original-residue-recovery-preserved-data" : "ordinary-uninstall-preserved-data", { userRecords: 9, projectRecords: 1,
        ...(recoveryEvidence ?? {}),
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

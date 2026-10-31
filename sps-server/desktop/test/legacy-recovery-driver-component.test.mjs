import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import test from "node:test";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const execFileAsync = promisify(execFile);
const desktop = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(desktop, "src", "legacy-recovery");
const fixture = path.join(desktop, "scripts", "windows-e2e", "LegacyRecoveryUiDriverFixture.cs");
const driver = path.join(desktop, "scripts", "windows-e2e", "LegacyRecoveryUiDriver.cs");
const inventory = path.join(desktop, "assets", "legacy-recovery", "program-inventory-0.4.86.json.gz");
const driverPhases = ["initial-window", "initial-target", "initial-controls", "initial-backup", "initial-inside",
  "initial-uncheck", "initial-recheck", "initial-cancel", "initial-exit"];

function compilerPath() {
  const framework = process.arch === "ia32" ? "Framework" : "Framework64";
  return path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
}

async function ownedTemp(t) {
  const tempParent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(tempParent), tempParent);
  const parentIdentity = await lstat(tempParent, { bigint: true });
  assert.equal(parentIdentity.isDirectory(), true);
  const owned = await mkdtemp(path.join(tempParent, "sps-legacy-driver-component-"));
  const ownedIdentity = await lstat(owned, { bigint: true });
  assert.equal(path.dirname(owned).toLowerCase(), tempParent.toLowerCase());
  t.after(async () => {
    assert.equal(await assertPlainDirectory(tempParent), tempParent);
    const currentParent = await lstat(tempParent, { bigint: true });
    const current = await lstat(owned, { bigint: true });
    assert.equal(currentParent.dev, parentIdentity.dev);
    assert.equal(currentParent.ino, parentIdentity.ino);
    assert.equal(currentParent.birthtimeNs, parentIdentity.birthtimeNs);
    assert.equal(current.dev, ownedIdentity.dev);
    assert.equal(current.ino, ownedIdentity.ino);
    assert.equal(current.birthtimeNs, ownedIdentity.birthtimeNs);
    assert.equal(path.dirname(owned).toLowerCase(), tempParent.toLowerCase());
    await rm(owned, { recursive: true, force: false });
  });
  return owned;
}

test("actual recovery UI driver exercises only the initial real form in an owned child", {
  skip: process.platform !== "win32",
  timeout: 90_000,
}, async t => {
  const fixtureSource = await readFile(fixture, "utf8");
  const driverSource = await readFile(driver, "utf8");
  assert.match(fixtureSource, /GetMethod\("ExerciseInitialForm", BindingFlags\.Static \| BindingFlags\.NonPublic\)/);
  assert.match(fixtureSource, /Application\.Run\(form\)/);
  assert.match(fixtureSource, /!cleanupAttempted && !cleanupCompleted && sentinelUnchanged/);
  assert.doesNotMatch(fixtureSource, /OpenRegisteredTarget|CleanAfterUserUninstalled|RegistryKey|Registrations|Process\.Start\s*\(.*helper/i);
  assert.match(driverSource, /static void ExerciseInitialForm\(Process helper, string root\)/);
  assert.match(driverSource, /Click\(backup, processId\)[\s\S]*?Click\(inside, processId\)[\s\S]*?Click\(FindEnabledButton\(form, processId, "Cancel"\), processId\)/);

  const owned = await ownedTemp(t);
  const root = path.join(owned, "caller-owned-program-root");
  const sentinel = path.join(root, "keep.txt");
  const executable = path.join(owned, "LegacyRecoveryUiDriverFixture.exe");
  const sources = ["VerifiedResidue.cs", "PinnedProgramCatalog.cs", "LegacyRecoverySession.cs", "LegacyRecoveryApp.cs"]
    .map(name => path.join(sourceRoot, name));
  await mkdir(root);
  const sentinelBytes = Buffer.from("caller-owned sentinel\n", "utf8");
  await writeFile(sentinel, sentinelBytes, { flag: "wx" });

  const compileArgs = ["/nologo", "/target:winexe", "/main:LegacyRecoveryUiDriverFixture", `/out:${executable}`,
    "/reference:System.Runtime.Serialization.dll", "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll",
    ...["UIAutomationClient.dll", "UIAutomationTypes.dll", "WindowsBase.dll"]
      .map(name => `/reference:${path.join(path.dirname(compilerPath()), "WPF", name)}`),
    `/resource:${inventory},Sps.LegacyProgramInventory`, ...sources, driver, fixture];
  try {
    await execFileAsync(compilerPath(), compileArgs, {
      cwd: owned, windowsHide: true, shell: false, timeout: 30_000, maxBuffer: 1_048_576,
    });
  } catch (error) {
    const compilerOutput = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const diagnostics = [...compilerOutput.matchAll(/(?:^|\r?\n)[^\r\n]*?\((\d+),(\d+)\): error (CS\d+):/g)]
      .map(match => `${match[3]}@${match[1]}:${match[2]}`);
    assert.fail(`Legacy recovery driver component fixture compilation failed${diagnostics.length ? ` (${diagnostics.join(",")})` : "."}`);
  }

  let result;
  try {
    result = await execFileAsync(executable, [root, sentinel], {
      cwd: owned, windowsHide: true, shell: false, timeout: 75_000, maxBuffer: 32_768, encoding: "utf8",
    });
  } catch (error) {
    let record;
    try { record = JSON.parse(String(error.stdout ?? "").trim()); } catch { record = null; }
    const trace = String(error.stderr ?? "").trim().split(/\r?\n/).filter(Boolean);
    const phaseLines = trace.filter(line => line.startsWith("LEGACY_UI_PHASE:"));
    const failureLines = trace.filter(line => line.startsWith("LEGACY_UI_FAILURE:"));
    assert.ok(record && record.ok === false && driverPhases.includes(record.phase),
      "Legacy recovery driver fixture failed without a safe phase record.");
    assert.ok(phaseLines.every(line => driverPhases.some(phase => line === `LEGACY_UI_PHASE:${phase}`)),
      "Legacy recovery driver emitted an unrecognized phase trace.");
    assert.deepEqual(failureLines, [`LEGACY_UI_FAILURE:${record.phase}`]);
    assert.fail(`Legacy recovery UI driver failed at ${record.phase}.`);
  }
  const trace = result.stderr.trim().split(/\r?\n/).filter(Boolean);
  assert.deepEqual(trace, driverPhases.map(phase => `LEGACY_UI_PHASE:${phase}`));
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: true,
    driverCompleted: true,
    childExitCode: 1,
    cleanupUntouched: true,
    sentinelUnchanged: true,
  });
  assert.deepEqual(await readFile(sentinel), sentinelBytes);
});

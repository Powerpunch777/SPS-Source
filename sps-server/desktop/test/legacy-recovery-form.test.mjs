import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { test } from "node:test";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const execFileAsync = promisify(execFile);
const desktop = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(desktop, "src", "legacy-recovery");
const fixture = path.join(desktop, "scripts", "windows-e2e", "LegacyRecoveryFormFixture.cs");
const inventory = path.join(desktop, "assets", "legacy-recovery", "program-inventory-0.4.86.json.gz");

function compilerPath() {
  const framework = process.arch === "ia32" ? "Framework" : "Framework64";
  return path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
}

async function ownedTemp(t) {
  const tempParent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(tempParent), tempParent);
  const parentIdentity = await lstat(tempParent, { bigint: true });
  assert.equal(parentIdentity.isDirectory(), true);
  const owned = await mkdtemp(path.join(tempParent, "sps-legacy-form-"));
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

test("legacy recovery form runs the real WinForms message loop without entering cleanup", {
  skip: process.platform !== "win32",
  timeout: 30_000,
}, async t => {
  const fixtureSource = await readFile(fixture, "utf8");
  assert.match(fixtureSource, /Application\.Run\(form\)/);
  assert.doesNotMatch(fixtureSource, /\b(?:OpenRegisteredTarget|CleanAfterUserUninstalled|Registrations|NoDesktopProcess|CheckRemaining)\s*\(|\b(?:Process|RegistryKey)\s*\./);
  const owned = await ownedTemp(t);
  const root = path.join(owned, "caller-owned-program-root");
  const sentinel = path.join(root, "keep.txt");
  const preview = path.join(root, "preview.png");
  const executable = path.join(owned, "LegacyRecoveryFormFixture.exe");
  const sources = ["VerifiedResidue.cs", "PinnedProgramCatalog.cs", "LegacyRecoverySession.cs", "LegacyRecoveryApp.cs"]
    .map(name => path.join(sourceRoot, name));
  await mkdir(root);
  const sentinelBytes = Buffer.from("caller-owned sentinel\n", "utf8");
  await writeFile(sentinel, sentinelBytes, { flag: "wx" });
  const compileArgs = ["/nologo", "/target:winexe", "/main:LegacyRecoveryFormFixture", `/out:${executable}`,
    "/reference:System.Runtime.Serialization.dll", "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll",
    `/resource:${inventory},Sps.LegacyProgramInventory`, ...sources, fixture];
  try {
    await execFileAsync(compilerPath(), compileArgs, {
      cwd: owned, windowsHide: true, shell: false, timeout: 30_000, maxBuffer: 1_048_576,
    });
  } catch (error) {
    const compilerOutput = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    const diagnostics = [...compilerOutput.matchAll(/(?:^|\r?\n)[^\r\n]*?\((\d+),(\d+)\): error (CS\d+):/g)]
      .map(match => `${match[3]}@${match[1]}:${match[2]}`);
    assert.fail(`Legacy recovery form fixture compilation failed${diagnostics.length ? ` (${diagnostics.join(",")})` : "."}`);
  }
  const result = await execFileAsync(executable, [root, sentinel, preview], {
    cwd: owned, windowsHide: true, shell: false, timeout: 30_000, maxBuffer: 32_768, encoding: "utf8",
  });
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    ok: true,
    controlsPresent: true,
    initialDisabled: true,
    singleCheckboxDisabled: true,
    bothEnabled: true,
    uncheckDisabled: true,
    recheckEnabled: true,
    cancelClosed: true,
    cleanupUntouched: true,
    sentinelUnchanged: true,
    layoutValid: true,
    previewGenerated: true,
  });
  assert.deepEqual(await readFile(sentinel), sentinelBytes);
  const previewInfo = await lstat(preview);
  assert.equal(previewInfo.isFile(), true);
  assert.equal(previewInfo.isSymbolicLink(), false);
  assert.ok(previewInfo.size > 8);
  assert.deepEqual((await readFile(preview)).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
});

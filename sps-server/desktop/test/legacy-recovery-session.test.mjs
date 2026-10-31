import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { test } from "node:test";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const execFileAsync = promisify(execFile);
const desktop = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.join(desktop, "src", "legacy-recovery");
const fixture = path.join(desktop, "scripts", "windows-e2e", "LegacyRecoverySessionFixture.cs");
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
  const owned = await mkdtemp(path.join(tempParent, "sps-legacy-session-"));
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

test("legacy recovery GUI retains its explicit cleanup and privacy safeguards", async () => {
  const app = await readFile(path.join(sourceRoot, "LegacyRecoveryApp.cs"), "utf8");
  const session = await readFile(path.join(sourceRoot, "LegacyRecoverySession.cs"), "utf8");
  assert.match(app, /return\s+session\.CleanupCompleted\s*\?\s*0\s*:\s*session\.CleanupAttempted\s*\?\s*2\s*:\s*1\s*;/);
  assert.match(app, /args\.Length\s*!=\s*2\s*\|\|\s*args\[0\]\s*!=\s*"--recover"/);
  assert.doesNotMatch(app, /--(?:yes|force|confirm|cleanup)\b|Environment\.GetCommandLineArgs\s*\(/i);
  assert.match(app, /CheckBox\s+backup\s*,\s*inside/);
  assert.equal([...app.matchAll(/(?:backup|inside)\s*=\s*new\s+CheckBox\s*\{/g)].length, 2);
  assert.match(app, /MessageBoxButtons\.YesNo[\s\S]*?MessageBoxDefaultButton\.Button2/);
  assert.doesNotMatch(app, /Process\s*\.\s*(?:Start|Kill)\s*\(|\bVerb\s*=\s*"runas"|runas\b/i);
  assert.doesNotMatch(session, /Process\s*\.\s*(?:Start|Kill)\s*\(|\bVerb\s*=\s*"runas"|runas\b/i);
  assert.doesNotMatch(session, /RegistryKey\s*\.\s*(?:CreateSubKey|SetValue|DeleteSubKey|DeleteValue)\s*\(/);
  assert.doesNotMatch(app, /(?:File|Directory)\s*\.\s*(?:Delete|Move|Copy)\s*\(|RegistryKey\s*\.\s*(?:CreateSubKey|SetValue|DeleteSubKey|DeleteValue)\s*\(/);
  assert.match(app, /AppData, Host Vault and external project folders are not cleanup targets\./);
});

test("compiled legacy recovery session matches only the exact per-user 0.4.86 registration", {
  skip: process.platform !== "win32",
  timeout: 30_000,
}, async t => {
  const owned = await ownedTemp(t);
  const executable = path.join(owned, "LegacyRecoverySessionFixture.exe");
  const sources = ["VerifiedResidue.cs", "PinnedProgramCatalog.cs", "LegacyRecoverySession.cs", "LegacyRecoveryApp.cs"]
    .map(name => path.join(sourceRoot, name));
  const compileArgs = ["/nologo", "/target:exe", "/main:LegacyRecoverySessionFixture", `/out:${executable}`,
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
    assert.fail(`Legacy recovery fixture compilation failed${diagnostics.length ? ` (${diagnostics.join(",")})` : "."}`);
  }
  const result = await execFileAsync(executable, [], {
    cwd: owned, windowsHide: true, shell: false, timeout: 30_000, maxBuffer: 32_768, encoding: "utf8",
  });
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, accepted: 3, rejected: 11 });
});

import { execFile } from "node:child_process";
import { lstat, mkdtemp, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const execFileAsync = promisify(execFile);
const desktop = path.resolve(import.meta.dirname, "..");
const source = path.join(desktop, "src", "legacy-recovery", "PinnedProgramCatalog.cs");
const residue = path.join(desktop, "src", "legacy-recovery", "VerifiedResidue.cs");
const fixture = path.join(desktop, "scripts", "windows-e2e", "LegacyCatalogFixture.cs");
const asset = path.join(desktop, "assets", "legacy-recovery", "program-inventory-0.4.86.json.gz");

function compilerPath() {
  const framework = process.arch === "ia32" ? "Framework" : "Framework64";
  return path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
}

test("pinned legacy catalog loads only the embedded, exact inventory", { skip: process.platform !== "win32" }, async () => {
  const tempParent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(tempParent), tempParent);
  const parentIdentity = await lstat(tempParent, { bigint: true });
  assert.equal(parentIdentity.isDirectory(), true);
  const owned = await mkdtemp(path.join(tempParent, "sps-legacy-catalog-"));
  const ownedIdentity = await lstat(owned, { bigint: true });
  assert.equal(path.dirname(owned).toLowerCase(), tempParent.toLowerCase());
  let cleaned = false;
  try {
    const exe = path.join(owned, "LegacyCatalogFixture.exe");
    const compiler = compilerPath();
    const compileArgs = ["/nologo", "/target:exe", `/out:${exe}`, "/reference:System.Runtime.Serialization.dll",
      `/resource:${asset},Sps.LegacyProgramInventory`, source, residue, fixture];
    await execFileAsync(compiler, compileArgs, { cwd: owned, windowsHide: true, shell: false, timeout: 30000, maxBuffer: 1024 * 1024 });
    const result = await execFileAsync(exe, [asset], { cwd: owned, windowsHide: true, shell: false, timeout: 30000, maxBuffer: 1024 * 1024 });
    assert.deepEqual(JSON.parse(result.stdout), { ok: true, files: 29314, directories: 3051 });
    assert.equal(result.stderr, "");
  } finally {
    assert.equal(await assertPlainDirectory(tempParent), tempParent);
    const currentParent = await lstat(tempParent, { bigint: true });
    const current = await lstat(owned, { bigint: true });
    assert.equal(path.dirname(owned).toLowerCase(), tempParent.toLowerCase());
    assert.equal(currentParent.dev, parentIdentity.dev);
    assert.equal(currentParent.ino, parentIdentity.ino);
    assert.equal(currentParent.birthtimeNs, parentIdentity.birthtimeNs);
    assert.equal(current.dev, ownedIdentity.dev);
    assert.equal(current.ino, ownedIdentity.ino);
    assert.equal(current.birthtimeNs, ownedIdentity.birthtimeNs);
    await rm(owned, { recursive: true, force: false });
    cleaned = true;
  }
  assert.equal(cleaned, true);
});

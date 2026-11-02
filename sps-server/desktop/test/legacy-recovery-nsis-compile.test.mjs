import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { getMakeNsisPath } from "app-builder-lib/out/toolsets/windows.js";
import { buildLegacyRecoveryHelper } from "../scripts/build-legacy-recovery-helper.mjs";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

test("both production recovery hooks compile with the actual x64 helper without executing Setup", {
  skip: process.platform !== "win32", timeout: 120_000,
}, async t => {
  const parent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(parent), parent);
  const parentIdentity = await lstat(parent, { bigint: true });
  const owned = await mkdtemp(path.join(parent, "sps-recovery-nsis-"));
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
  await buildLegacyRecoveryHelper(path.join(owned, ".legacy-recovery"));
  const compiler = await getMakeNsisPath();
  assert.match(compiler.path, /makensis\.exe$/i);
  const output = path.join(owned, "compile-only.exe");
  const desktop = path.resolve(import.meta.dirname, "..");
  const installUtil = await readFile(path.join(desktop, "node_modules", "app-builder-lib", "templates", "nsis", "include", "installUtil.nsh"), "utf8");
  assert.match(installUtil, /^\s*Var \/GLOBAL installationDir\s*$/m, "fixture must preserve electron-builder's late prior-install path declaration");
  const compileInput = path.join(desktop, "test", "fixtures", "nsis-uninstall-result.nsi");
  await promisify(execFile)(compiler.path, ["-WX", "/V2", "/INPUTCHARSET", "UTF8", `/DPROJECT_DIR=${owned}`,
    `/DSPS_UNINSTALL_INCLUDE=${path.join(desktop, "build", "installer.nsh")}`,
    `/DSPS_COMPILE_OUTPUT=${output}`, compileInput],
  { cwd: owned, env: { ...process.env, ...compiler.env }, shell: false, windowsHide: true,
    timeout: 60_000, maxBuffer: 1024 * 1024 });
  const result = await lstat(output);
  assert.ok(result.isFile() && !result.isSymbolicLink() && result.nlink === 1 && result.size > 1_000_000);
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const desktop = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(desktop, "scripts", "windows-e2e", "HarmlessRunnerFixture.cs");
const exec = promisify(execFile);
const expectedInvalidArguments = "Harmless runner fixture arguments are invalid.\r\n";

function expectedOutput(nonce, phase) {
  return `{"fixture":1,"nonce":"${nonce}","phase":"${phase}"}\r\n`;
}

test("compiles and runs only the bounded x64 harmless runner fixture", {
  skip: process.platform !== "win32",
  timeout: 30_000,
}, async t => {
  const temporaryParent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(temporaryParent), temporaryParent);
  const parentIdentity = await lstat(temporaryParent, { bigint: true });
  const owned = path.resolve(await mkdtemp(path.join(temporaryParent, "sps-harmless-runner-fixture-")));
  const canonicalOwned = await realpath(owned);
  const ownedIdentity = await lstat(owned, { bigint: true });
  assert.equal(canonicalOwned, owned);

  t.after(async () => {
    assert.equal(await assertPlainDirectory(temporaryParent), temporaryParent);
    assert.equal(await assertPlainDirectory(owned), owned);
    assert.equal(path.dirname(owned), temporaryParent);
    const currentParent = await lstat(temporaryParent, { bigint: true });
    const currentOwned = await lstat(owned, { bigint: true });
    for (const key of ["dev", "ino", "birthtimeNs"]) {
      assert.equal(currentParent[key], parentIdentity[key]);
      assert.equal(currentOwned[key], ownedIdentity[key]);
    }
    assert.equal(await realpath(owned), canonicalOwned);
    await rm(owned, { recursive: true, force: false });
  });

  const source = await readFile(sourcePath, "utf8");
  assert.match(source, /Thread\.Sleep\(30000\)/);
  assert.doesNotMatch(source, /Process\s*\.|ProcessStartInfo|DllImport|Http|WebRequest|Environment\.|File\s*\.|Directory\s*\./);

  const executable = path.join(owned, "ollama.exe");
  const compiler = path.join(process.env.WINDIR, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe");
  await exec(compiler, ["/nologo", "/target:exe", "/platform:x64", `/out:${executable}`, sourcePath], {
    cwd: owned, shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 1_048_576,
  });

  const image = await readFile(executable);
  assert.equal(image.toString("ascii", 0, 2), "MZ");
  const peOffset = image.readUInt32LE(0x3c);
  assert.equal(image.toString("ascii", peOffset, peOffset + 4), "PE\0\0");
  assert.equal(image.readUInt16LE(peOffset + 4), 0x8664);
  assert.equal(image.readUInt16LE(peOffset + 24), 0x20b);

  const successNonce = "f80d35be-45a0-4eb7-b63f-b9b4f377a8d1";
  const success = await exec(executable,
    ["--sps-runner-fixture", "success", successNonce],
    { cwd: owned, shell: false, windowsHide: true, timeout: 5_000, maxBuffer: 32_768 });
  assert.equal(success.stdout, expectedOutput(successNonce, "started") + expectedOutput(successNonce, "finished"));
  assert.equal(success.stderr, "");
  assert.doesNotMatch(success.stdout, /[\\/]|[A-Za-z]:/);

  const failureNonce = "72e8d52c-7b34-47f8-8dc3-01f98762a6de";
  await assert.rejects(exec(executable,
    ["--sps-runner-fixture", "failure", failureNonce],
    { cwd: owned, shell: false, windowsHide: true, timeout: 5_000, maxBuffer: 32_768 }), error => {
    assert.equal(error.code, 7);
    assert.equal(error.stdout, expectedOutput(failureNonce, "started") + expectedOutput(failureNonce, "finished"));
    assert.equal(error.stderr, "");
    assert.doesNotMatch(error.stdout, /[\\/]|[A-Za-z]:/);
    return true;
  });

  await assert.rejects(exec(executable,
    ["--sps-runner-fixture", "unexpected", "arbitrary-private-value"],
    { cwd: owned, shell: false, windowsHide: true, timeout: 5_000, maxBuffer: 32_768 }), error => {
    assert.equal(error.code, 64);
    assert.equal(error.stdout, "");
    assert.equal(error.stderr, expectedInvalidArguments);
    assert.doesNotMatch(error.stderr, /arbitrary-private-value|[\\/]|[A-Za-z]:/);
    return true;
  });

  assert.deepEqual(await readdir(owned), ["ollama.exe"]);
});

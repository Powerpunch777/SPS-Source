import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
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

async function bounded(operation, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded its five-second observation bound.`)), 5_000);
    })]);
  } finally { clearTimeout(timer); }
}

async function observeHeldFixture(executable, cwd, mode, nonce) {
  const child = spawn(executable, ["--sps-runner-fixture", mode, nonce], {
    cwd, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  const expectedReady = expectedOutput(nonce, "started");
  let stdout = "";
  let stderr = "";
  let size = 0;
  let outputFailure;
  let rejectFailure;
  const failed = new Promise((_, reject) => { rejectFailure = reject; });
  void failed.catch(() => {});
  const fail = error => { outputFailure ??= error; rejectFailure(outputFailure); };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const closed = new Promise(resolve => child.once("close", (code, signal) => resolve({ code, signal })));
  child.on("error", fail);
  for (const [name, stream] of [["stdout", child.stdout], ["stderr", child.stderr]]) {
    stream.setEncoding("utf8");
    stream.on("data", text => {
      size += Buffer.byteLength(text);
      if (size > 32_768) return fail(new Error("Harmless held fixture exceeded its output bound."));
      if (name === "stdout") {
        stdout += text;
        if (stdout === expectedReady) resolveReady();
        else if (!expectedReady.startsWith(stdout)) fail(new Error("Harmless held fixture emitted unexpected output."));
      } else {
        stderr += text;
        fail(new Error("Harmless held fixture unexpectedly wrote stderr."));
      }
    });
  }
  const eof = Promise.all([finished(child.stdout), finished(child.stderr)]);
  void eof.catch(fail);
  let terminal;
  try {
    await bounded(Promise.race([ready, failed, closed.then(() => {
      throw new Error("Harmless held fixture exited before its ready record.");
    })]), "Harmless held fixture readiness");
    assert.equal(child.exitCode, null);
    assert.equal(child.signalCode, null);
    assert.equal(child.kill("SIGKILL"), true, "Terminate only the retained, test-created child handle.");
    [terminal] = await bounded(Promise.all([closed, eof]), "Harmless held fixture close and EOF");
    assert.ok(terminal.code !== 0 || terminal.signal !== null, "The intentional forced stop must not masquerade as natural completion.");
    assert.equal(stdout, expectedReady, "A held fixture must not emit its finished record before the test stops it.");
    assert.equal(stderr, "");
    assert.equal(outputFailure, undefined);
  } finally {
    if (!terminal) {
      if (child.exitCode === null && child.signalCode === null && !child.killed) child.kill("SIGKILL");
      await bounded(Promise.all([closed, eof]), "Harmless held fixture failure cleanup");
    }
  }
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
  let cleanupQualified = false;

  t.after(async () => {
    if (!cleanupQualified) {
      t.diagnostic("Owned harmless fixture preserved after failed assertions or unconfirmed child close/EOF.");
      return;
    }
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
  assert.match(source, /if \(args\[1\] == "hold"\) Thread\.Sleep\(30000\)/);
  assert.match(source, /if \(args\[1\] == "lease-hold"\) Thread\.Sleep\(120000\)/);
  assert.doesNotMatch(source, /Process\s*\.|ProcessStartInfo|DllImport|Http|WebRequest|Environment\.|File\s*\.|Directory\s*\.|(?:int|Int32|TimeSpan)\.(?:Parse|TryParse|From)/);

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

  const workingDirectory = path.join(owned, "working");
  const syntheticUserData = path.join(owned, "userdata");
  await mkdir(workingDirectory);
  await mkdir(syntheticUserData);
  const sentinel = path.join(syntheticUserData, "preserved.json");
  const sentinelBytes = Buffer.from('{"synthetic":"do-not-touch"}\n');
  await writeFile(sentinel, sentinelBytes, { flag: "wx" });
  const sentinelIdentity = await lstat(sentinel, { bigint: true });
  await observeHeldFixture(executable, workingDirectory, "hold", "01111111-1111-4111-8111-111111111111");
  await observeHeldFixture(executable, workingDirectory, "lease-hold", "02222222-2222-4222-8222-222222222222");

  for (const args of [
    ["--sps-runner-fixture", "lease-hold", successNonce, "120000"],
    ["--sps-runner-fixture", "120000", successNonce],
    ["--sps-runner-fixture", "lease-hold=120000", successNonce],
    ["--sps-runner-fixture", "lease-hold", "arbitrary-path-or-command"],
  ]) {
    await assert.rejects(exec(executable, args,
      { cwd: workingDirectory, shell: false, windowsHide: true, timeout: 5_000, maxBuffer: 32_768 }), error => {
      assert.equal(error.code, 64);
      assert.equal(error.stdout, "");
      assert.equal(error.stderr, expectedInvalidArguments);
      return true;
    });
  }
  assert.deepEqual(await readFile(sentinel), sentinelBytes);
  const currentSentinel = await lstat(sentinel, { bigint: true });
  for (const key of ["dev", "ino", "birthtimeNs", "mtimeNs", "size"]) assert.equal(currentSentinel[key], sentinelIdentity[key]);
  assert.deepEqual(await readdir(workingDirectory), []);
  assert.deepEqual(await readdir(syntheticUserData), ["preserved.json"]);
  assert.deepEqual((await readdir(owned)).sort(), ["ollama.exe", "userdata", "working"]);
  cleanupQualified = true;
});

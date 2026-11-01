import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { c as createTar } from "tar";
import { spawnWindowsJobSupervisor } from "@sps/desktop-node";
import { createSpsWindowsRuntimeArchiveExtractor } from "../src/owner-host-runtime-native-extract.mjs";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

async function fixture(t) {
  const parent = await realpath(os.tmpdir());
  await assertPlainDirectory(parent);
  const root = await mkdtemp(path.join(parent, "sps-runtime-native-test-"));
  const initial = await lstat(root, { bigint: true });
  const result = { root, cleanup: true, source: path.join(root, "source"), cwd: path.join(root, "output"), file: path.join(root, "runtime.tgz") };
  t.after(async () => {
    if (!result.cleanup) return;
    assert.equal(await assertPlainDirectory(root), root);
    assert.equal(path.dirname(root), parent);
    assert.match(path.basename(root), /^sps-runtime-native-test-[A-Za-z0-9]+$/);
    const current = await lstat(root, { bigint: true });
    for (const field of ["dev", "ino", "birthtimeNs"]) assert.equal(current[field], initial[field]);
    await rm(root, { recursive: true });
  });
  await mkdir(path.join(result.source, "deep", "empty"), { recursive: true });
  await mkdir(result.cwd);
  await writeFile(path.join(result.source, "deep", "bytes.bin"), Buffer.from([0, 3, 127, 128, 255, 10]));
  await writeFile(path.join(result.source, "root.txt"), "unchanged runtime\n");
  await createTar({ cwd: result.source, file: result.file, gzip: true, strict: true, portable: true }, ["."]);
  result.options = { cwd: result.cwd, file: result.file, strict: true, preservePaths: false };
  return result;
}

const successful = { type: "exit", activeProcesses: 0, code: 0 };
function fakeJob({ terminal = successful, terminate = successful, ready = Promise.resolve(), onWait = () => {}, pending = false } = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.supervisorReady = ready;
  child.terminationCalls = 0;
  child.waitForOwnedJobTermination = async () => { await onWait(child); return pending ? new Promise(() => {}) : terminal; };
  child.terminateOwnedJob = async () => { child.terminationCalls += 1; if (terminate instanceof Error) throw terminate; return terminate; };
  return child;
}

test("actual Windows system tar extracts bytes/empty directories and its exact native Job closes naturally", {
  skip: process.platform !== "win32", timeout: 30_000,
}, async t => {
  const f = await fixture(t);
  const before = createHash("sha256").update(await readFile(f.file)).digest("hex");
  let terminal;
  let stderrBytes = 0;
  const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn: invocation => {
    const child = spawnWindowsJobSupervisor(invocation);
    child.stderr.on("data", chunk => { stderrBytes += chunk.length; });
    void child.supervisorTerminal.then(value => { terminal = value; }, () => {});
    return child;
  } });
  assert.equal(typeof extract, "function");
  try { await extract(f.options); }
  catch (error) {
    if (error.runtimeStagingCleanupUnconfirmed) f.cleanup = false;
    t.diagnostic(JSON.stringify({ nativeArchiveTest: true, terminal, stderrBytes }));
    throw error;
  }
  assert.deepEqual(await readFile(path.join(f.cwd, "deep", "bytes.bin")), await readFile(path.join(f.source, "deep", "bytes.bin")));
  assert.equal(await readFile(path.join(f.cwd, "root.txt"), "utf8"), "unchanged runtime\n");
  assert.deepEqual(await readdir(path.join(f.cwd, "deep", "empty")), []);
  assert.equal(createHash("sha256").update(await readFile(f.file)).digest("hex"), before);
});

test("runtime native extraction uses only fixed system paths/arguments and a reduced environment", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t);
  let invocation;
  const child = fakeJob();
  const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn: value => { invocation = value; return child; } });
  await extract(f.options);
  const windows = await realpath(process.env.SystemRoot ?? process.env.SYSTEMROOT);
  assert.deepEqual(invocation, { executable: path.join(windows, "System32", "tar.exe"),
    args: ["-xm", "-f", f.file, "-C", f.cwd, "--no-same-owner", "--no-same-permissions"], cwd: f.cwd,
    env: { SYSTEMROOT: windows, WINDIR: windows, PATH: path.join(windows, "System32") } });
  assert.equal(child.terminationCalls, 0);
});

test("native factory never searches PATH and only missing system tar permits the previous extractor", async t => {
  assert.equal(await createSpsWindowsRuntimeArchiveExtractor({ platform: "linux" }), null);
  if (process.platform !== "win32") return;
  const f = await fixture(t);
  await mkdir(path.join(f.root, "System32"));
  assert.equal(await createSpsWindowsRuntimeArchiveExtractor({ windowsRoot: f.root }), null);
  for (const windowsRoot of ["relative", "C:Windows", "\\\\server\\Windows", "C:\\Windows\\..\\other"])
    await assert.rejects(createSpsWindowsRuntimeArchiveExtractor({ windowsRoot }));
  await mkdir(path.join(f.root, "System32", "tar.exe"));
  await assert.rejects(createSpsWindowsRuntimeArchiveExtractor({ windowsRoot: f.root }));
});

test("native preflight rejects traversal, duplicate names and occupied staging before any process", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t);
  let calls = 0;
  const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn() { calls += 1; throw Error("must not start"); } });
  for (const [name, create] of [
    ["escape.tgz", file => createTar({ cwd: f.source, file, prefix: "../escape", gzip: true, portable: true }, ["root.txt"])],
    ["duplicate.tgz", file => createTar({ cwd: f.source, file, gzip: true, portable: true }, ["root.txt", "root.txt"])],
  ]) {
    const file = path.join(f.root, name);
    await create(file);
    await assert.rejects(extract({ ...f.options, file }));
    assert.deepEqual(await readdir(f.cwd), []);
  }
  await writeFile(path.join(f.cwd, "keep.txt"), "caller files");
  await assert.rejects(extract(f.options));
  assert.equal(await readFile(path.join(f.cwd, "keep.txt"), "utf8"), "caller files");
  assert.equal(calls, 0);
});

test("nonzero, partial-Job and excess-output failures never become successful extraction", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t);
  for (const configuration of [{ terminal: { ...successful, code: 7 } },
    { terminal: { ...successful, activeProcesses: 1 } },
    { onWait: child => child.stderr.write(Buffer.alloc(32_769)) }]) {
    const child = fakeJob(configuration);
    const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn: () => child });
    await assert.rejects(extract(f.options), error => {
      assert.equal(error.message, "SPS Windows runtime archive extraction failed.");
      assert.notEqual(error.runtimeStagingCleanupUnconfirmed, true);
      return true;
    });
    assert.equal(child.terminationCalls, 1);
  }
});

test("native failure retains staging authority when owned termination cannot be confirmed", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t);
  const child = fakeJob({ terminal: { ...successful, code: 7 }, terminate: new Error("unconfirmed") });
  const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn: () => child });
  await assert.rejects(extract(f.options), error => error.runtimeStagingCleanupUnconfirmed === true);
  assert.equal(child.terminationCalls, 1);
});

test("no returned process handle is uncertain termination, never permission to clear staging", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t);
  const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn() { throw Error("lost handle"); } });
  await assert.rejects(extract(f.options), error => error.runtimeStagingCleanupUnconfirmed === true);
});

test("native preflight refuses link entries, Windows ADS aliases and linked system roots", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t);
  let calls = 0;
  const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn() { calls += 1; throw Error("must not start"); } });
  const outside = path.join(f.root, "external-project");
  await mkdir(outside);
  await writeFile(path.join(outside, "keep.txt"), "keep external work");
  await symlink(outside, path.join(f.source, "linked"), "junction");
  const links = path.join(f.root, "links.tgz");
  await createTar({ cwd: f.source, file: links, gzip: true, portable: true }, ["linked"]);
  await assert.rejects(extract({ ...f.options, file: links }));
  const ads = path.join(f.root, "ads.tgz");
  await createTar({ cwd: f.source, file: ads, prefix: "safe:stream", gzip: true, portable: true }, ["root.txt"]);
  await assert.rejects(extract({ ...f.options, file: ads }));
  const alias = path.join(f.root, "windows-alias");
  await symlink(await realpath(process.env.SystemRoot ?? process.env.SYSTEMROOT), alias, "junction");
  await assert.rejects(createSpsWindowsRuntimeArchiveExtractor({ windowsRoot: alias }));
  assert.equal(calls, 0);
  assert.deepEqual(await readdir(f.cwd), []);
  assert.equal(await readFile(path.join(outside, "keep.txt"), "utf8"), "keep external work");
});

test("bounded native expiry cancels the same Job and remains a failure after confirmed close", { skip: process.platform !== "win32" }, async t => {
  const f = await fixture(t);
  const child = fakeJob({ pending: true });
  const extract = await createSpsWindowsRuntimeArchiveExtractor({ spawn: () => child, timeoutMs: 20 });
  await assert.rejects(extract(f.options), error => {
    assert.equal(error.message, "SPS Windows runtime archive extraction failed.");
    assert.notEqual(error.runtimeStagingCleanupUnconfirmed, true);
    return true;
  });
  assert.equal(child.terminationCalls, 1);
});

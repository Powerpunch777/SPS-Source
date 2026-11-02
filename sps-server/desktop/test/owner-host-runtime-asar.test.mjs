import assert from "node:assert/strict";
import { cp, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import test from "node:test";
import { c as createTar } from "tar";
import { spawnWindowsJobSupervisor } from "../../desktop-node/src/windows-job-supervisor.mjs";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const desktop = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const prefix = "sps-runtime-asar-test-";
const sourceNames = ["owner-host-runtime-extract.mjs", "owner-host-runtime-extract-worker.mjs", "owner-host-runtime-archive-path.mjs", "owner-host-runtime-native-extract.mjs"];
const fixtureFiles = ["a.txt", "node_modules/pkg/data.txt", "node_modules/@scope/lib/data.txt"];
const expected = { asarRuntimeWorkerSmoke: true, nativeArchiveSmoke: true, fromAsar: true, actualElectron: true, passed: true };

async function copyTarDependencies(appRoot) {
  const copied = new Map();
  async function copyDependency(name, from) {
    const resolver = createRequire(path.join(from, "package.json"));
    let directory = path.dirname(resolver.resolve(name));
    let metadata;
    for (;;) {
      try { metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8")); }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (metadata?.name === name) break;
      const parent = path.dirname(directory);
      assert.notEqual(parent, directory);
      directory = parent;
    }
    if (copied.has(name)) {
      assert.equal(copied.get(name), metadata.version);
      return;
    }
    copied.set(name, metadata.version);
    const target = path.join(appRoot, "node_modules", name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(directory, target, { recursive: true, dereference: true, force: false, errorOnExist: true,
      filter: file => !path.relative(directory, file).split(path.sep).includes("node_modules") });
    for (const dependency of Object.keys(metadata.dependencies ?? {})) await copyDependency(dependency, directory);
  }
  await copyDependency("tar", desktop);
  assert.deepEqual([...copied.keys()].sort(), ["@isaacs/fs-minipass", "chownr", "minipass", "minizlib", "tar", "yallist"].sort());
}

test("actual Electron ASAR loads the runtime fallback Workers and native extractor with real nested Job closure", {
  skip: process.platform !== "win32", timeout: 60_000,
}, async t => {
  const parent = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(parent), parent);
  const parentIdentity = await lstat(parent, { bigint: true });
  const root = await mkdtemp(path.join(parent, prefix));
  const rootIdentity = await lstat(root, { bigint: true });
  const appRoot = path.join(root, "app");
  let child;
  let natural = false;
  let passed = false;
  let failure;
  let cleanupFailure;
  let observationError;
  let rejectObservation;
  const observationFailed = new Promise((_, reject) => { rejectObservation = reject; });
  void observationFailed.catch(() => {});
  const failObservation = error => {
    observationError ??= error;
    rejectObservation(observationError);
  };
  const watchdog = setTimeout(() => failObservation(new Error("ASAR runtime regression exceeded its 45-second bound.")), 45_000);
  const onAbort = () => failObservation(new Error("ASAR runtime regression was aborted."));
  t.signal.addEventListener("abort", onAbort, { once: true });
  const bounded = operation => Promise.race([observationFailed, operation]);
  try {
    const { createPackage, extractFile } = require("@electron/asar");
    await bounded(mkdir(path.join(appRoot, "src"), { recursive: true }));
    const sourceBytes = new Map();
    for (const name of sourceNames) {
      const original = path.join(desktop, "src", name);
      const copied = path.join(appRoot, "src", name);
      const bytes = await bounded(readFile(original));
      sourceBytes.set(name, bytes);
      await bounded(writeFile(copied, bytes, { flag: "wx" }));
      assert.deepEqual(await bounded(readFile(copied)), bytes);
      assert.deepEqual(await bounded(readFile(original)), bytes);
    }
    await bounded(copyTarDependencies(appRoot));
    const nodePackage = path.join(desktop, "node_modules", "@sps", "desktop-node");
    const copiedNode = path.join(appRoot, "node_modules", "@sps", "desktop-node");
    await bounded(mkdir(copiedNode, { recursive: true }));
    await bounded(cp(path.join(nodePackage, "src"), path.join(copiedNode, "src"), { recursive: true, errorOnExist: true, force: false }));
    await bounded(cp(path.join(nodePackage, "package.json"), path.join(copiedNode, "package.json"), { errorOnExist: true, force: false }));
    const helperSource = path.join(nodePackage, "native", "windows-job-supervisor", "bin", "SpsWindowsJobSupervisor.exe");
    const helperBytes = await bounded(readFile(helperSource));
    await bounded(writeFile(path.join(root, "SpsWindowsJobSupervisor.exe"), helperBytes, { flag: "wx" }));
    await bounded(writeFile(path.join(appRoot, "package.json"), JSON.stringify({
      name: "sps-owned-runtime-asar-test", type: "module", main: "main.mjs",
    }), { flag: "wx" }));
    // Do not top-level-await whenReady: Electron must finish loading its main module first.
    const entry = `import { app } from 'electron';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { extractSpsOwnerRuntimeArchive } from './src/owner-host-runtime-extract.mjs';
import { createSpsWindowsRuntimeArchiveExtractor } from './src/owner-host-runtime-native-extract.mjs';
import { spawnWindowsJobSupervisor } from '@sps/desktop-node';
import { RUNTIME_EXTRACTION_PARTITIONS } from './src/owner-host-runtime-archive-path.mjs';
const root = process.argv.find(value => value.startsWith('--owned-fixture-root=')).slice('--owned-fixture-root='.length);
app.setPath('userData', path.join(root, 'profile'));
app.disableHardwareAcceleration();
async function run() {
  try {
    await app.whenReady();
    assert.equal(import.meta.url.includes('.asar/'), true);
    assert.equal(RUNTIME_EXTRACTION_PARTITIONS, 4);
    await extractSpsOwnerRuntimeArchive({ file: path.join(root, 'fixture.tgz'), cwd: path.join(root, 'output'), strict: true, preservePaths: false });
    for (const file of ${JSON.stringify(fixtureFiles)})
      assert.deepEqual(await readFile(path.join(root, 'output', file)), Buffer.from('known ' + file));
    const native = await createSpsWindowsRuntimeArchiveExtractor({
      spawn: invocation => spawnWindowsJobSupervisor(invocation, { helperPath: path.join(root, 'SpsWindowsJobSupervisor.exe') })
    });
    assert.equal(typeof native, 'function');
    await native({ file: path.join(root, 'fixture.tgz'), cwd: path.join(root, 'native-output'), strict: true, preservePaths: false });
    for (const file of ${JSON.stringify(fixtureFiles)})
      assert.deepEqual(await readFile(path.join(root, 'native-output', file)), Buffer.from('known ' + file));
    console.log(JSON.stringify(${JSON.stringify(expected)}));
    app.quit();
  } catch {
    console.log(JSON.stringify({ asarRuntimeWorkerSmoke: true, passed: false }));
    app.exit(1);
  }
}
void run();
`;
    await bounded(writeFile(path.join(appRoot, "main.mjs"), entry, { flag: "wx" }));
    const archive = path.join(root, "fixture.asar");
    await bounded(createPackage(appRoot, archive));
    for (const [name, bytes] of sourceBytes) assert.deepEqual(extractFile(archive, `src/${name}`), bytes);
    for (const name of ["input", "output", "native-output", "profile"]) await bounded(mkdir(path.join(root, name)));
    for (const file of fixtureFiles) {
      const target = path.join(root, "input", file);
      await bounded(mkdir(path.dirname(target), { recursive: true }));
      await bounded(writeFile(target, Buffer.from(`known ${file}`), { flag: "wx" }));
    }
    await bounded(createTar({ cwd: path.join(root, "input"), file: path.join(root, "fixture.tgz"),
      gzip: true, portable: true, noMtime: true, strict: true }, ["."]));
    const windir = process.env.WINDIR ?? "C:\\Windows";
    child = spawnWindowsJobSupervisor({ executable: path.join(desktop, "node_modules", "electron", "dist", "electron.exe"),
      args: [archive, `--user-data-dir=${path.join(root, "profile")}`, `--owned-fixture-root=${root}`], cwd: root,
      env: { SYSTEMROOT: process.env.SYSTEMROOT ?? windir, WINDIR: windir, PATH: path.join(windir, "System32") },
    }, { startupTimeoutMs: 10_000, cancellationTimeoutMs: 8_000, helperCloseTimeoutMs: 3_000 });
    const outputs = { stdout: "", stderr: "" };
    for (const name of ["stdout", "stderr"]) {
      let size = 0;
      child[name].on("data", bytes => {
        size += bytes.length;
        if (size > 32_768) failObservation(new Error("ASAR fixture output exceeded its fixed bound."));
        else outputs[name] += bytes.toString("utf8");
      });
    }
    const outputEof = Promise.all([finished(child.stdout), finished(child.stderr)]);
    void outputEof.catch(() => failObservation(new Error("ASAR fixture output did not reach EOF.")));
    await bounded(child.supervisorReady);
    const terminal = await bounded(child.waitForOwnedJobTermination());
    natural = terminal.type === "exit" && terminal.activeProcesses === 0;
    assert.deepEqual(terminal, { type: "exit", activeProcesses: 0, code: 0 });
    assert.equal(child.hasUnconfirmedOwnedJobTermination(), false);
    await bounded(outputEof);
    assert.ok(outputs.stdout.trim() === JSON.stringify(expected), "ASAR fixture must emit exactly the expected JSON result.");
    let result;
    try { result = JSON.parse(outputs.stdout); }
    catch { throw new Error("ASAR fixture must emit exactly one JSON result and EOF."); }
    assert.deepEqual(result, expected);
    for (const file of fixtureFiles) assert.deepEqual(await bounded(readFile(path.join(root, "output", file))), Buffer.from(`known ${file}`));
    if (observationError) throw observationError;
    passed = true;
  } catch (error) {
    failure = error;
  } finally {
    clearTimeout(watchdog);
    t.signal.removeEventListener("abort", onAbort);
    if (child && !natural) {
      let timer;
      try {
        const terminal = await Promise.race([child.terminateOwnedJob(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("ASAR fixture owned cleanup was not confirmed in time.")), 12_000);
        })]);
        assert.ok((terminal.type === "exit" || terminal.type === "cancelled") && terminal.activeProcesses === 0,
          "ASAR fixture cleanup must confirm an empty owned Job.");
        assert.equal(child.hasUnconfirmedOwnedJobTermination(), false);
      } catch (error) { cleanupFailure = error; }
      finally { clearTimeout(timer); }
    }
    if (passed && !failure && !cleanupFailure) {
      try {
        assert.ok(path.isAbsolute(root) && path.resolve(root) === root);
        assert.equal(path.dirname(root), parent);
        assert.match(path.basename(root), /^sps-runtime-asar-test-[A-Za-z0-9]{6}$/);
        assert.equal(await assertPlainDirectory(parent), parent);
        assert.equal(await assertPlainDirectory(root), root);
        const currentParent = await lstat(parent, { bigint: true });
        const currentRoot = await lstat(root, { bigint: true });
        assert.ok(currentRoot.isDirectory() && !currentRoot.isSymbolicLink());
        for (const key of ["dev", "ino", "birthtimeNs"]) {
          assert.equal(currentParent[key], parentIdentity[key]);
          assert.equal(currentRoot[key], rootIdentity[key]);
        }
        await rm(root, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 });
        await assert.rejects(lstat(root), error => error.code === "ENOENT");
      } catch (error) { cleanupFailure = error; }
    }
    if (failure || cleanupFailure) {
      t.diagnostic("ASAR fixture preserved after failed observation or cleanup; forced cleanup never qualifies as success.");
      if (failure && cleanupFailure) throw new AggregateError([failure, cleanupFailure], "ASAR regression failed and owned cleanup was not confirmed.");
      throw failure ?? cleanupFailure;
    }
  }
});

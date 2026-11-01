import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import test from "node:test";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";
import {
  createSpsOwnerHostRuntimePackage,
  SPS_REQUEST_HOSTNAME_RUNTIME_PATH,
} from "../src/owner-host-runtime-package.mjs";

const runtimeModule = new URL("../src/owner-host-runtime-package.mjs", import.meta.url).href;
const MARKER = ".sps-runtime-materialized.json";
const OUTPUT_LIMIT = 16_384;
const identityOf = details => [details.dev, details.ino, details.birthtimeNs];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

// Only the test's rename wrapper parks execution; extraction and recovery use
// the real package reader, tar implementation, default extractor and lock rules.
const CHILD_SOURCE = `
import fs from 'node:fs/promises';
import path from 'node:path';
const config = JSON.parse(process.argv[2]);
let complete = false;
let phase = 'module-load';
const phases = [];
process.once('disconnect', () => { if (!complete) process.exit(79); });
const send = value => new Promise((resolve, reject) => process.send(value, error => error ? reject(error) : resolve()));
try {
  const { materializeSpsOwnerHostRuntimePackage } = await import(process.argv[1]);
  let stale;
  const options = {
    packageRoot: config.packageRoot,
    targetRuntimeRoot: config.target,
    onProgress(value) { phase = value; phases.push(value); },
  };
  if (config.boundary) options.fsApi = {
    ...fs,
    async rename(from, to) {
      await fs.rename(from, to);
      const movedOld = from === config.target && to.startsWith(config.target + '.stale-');
      const promoted = to === config.target && from.startsWith(config.target + '.staging-');
      if (movedOld) stale = path.basename(to);
      if ((config.boundary === 'old-moved' && movedOld) || (config.boundary === 'new-promoted' && promoted)) {
        setInterval(() => {}, 1000);
        await send({ type: 'parked', nonce: config.nonce, boundary: config.boundary,
          from: path.basename(from), to: path.basename(to), stale });
        await new Promise(() => {});
      }
    },
  };
  const result = await materializeSpsOwnerHostRuntimePackage(options);
  if (result !== config.target) throw new Error('Unexpected materialization result.');
  await send({ type: 'ready', nonce: config.nonce, phases });
  complete = true;
  process.disconnect();
} catch {
  await send({ type: 'failed', nonce: config.nonce, phase });
  complete = true;
  process.exitCode = 1;
  process.disconnect();
}
`;

async function bounded(operation, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded its fixed observation bound.`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

async function captureHierarchy(root) {
  const entries = [];
  async function visit(relative) {
    const absolute = relative ? path.join(root, relative) : root;
    const details = await fs.lstat(absolute, { bigint: true });
    assert.equal(details.isSymbolicLink(), false, "Owned fixture trees must not contain links.");
    assert.ok(details.isDirectory() || (details.isFile() && details.nlink === 1n));
    entries.push({ relative, directory: details.isDirectory(), identity: identityOf(details) });
    if (details.isDirectory()) {
      for (const name of (await fs.readdir(absolute)).sort()) await visit(relative ? `${relative}/${name}` : name);
    }
  }
  await visit("");
  return entries;
}

async function ownedRoot(label) {
  const parent = await fs.realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(parent), parent);
  const ancestry = [];
  let ancestor = parent;
  for (;;) {
    const details = await fs.lstat(ancestor, { bigint: true });
    assert.ok(details.isDirectory() && !details.isSymbolicLink());
    ancestry.push({ path: ancestor, identity: identityOf(details) });
    const next = path.dirname(ancestor);
    if (next === ancestor) break;
    ancestor = next;
  }
  const prefix = `sps-runtime-crash-${label}-`;
  const root = await fs.mkdtemp(path.join(parent, prefix));
  assert.equal(await assertPlainDirectory(root), root);
  const identity = identityOf(await fs.lstat(root, { bigint: true }));
  return {
    root,
    async remove() {
      assert.ok(path.isAbsolute(root) && path.resolve(root) === root);
      assert.equal(path.dirname(root), parent);
      assert.ok(path.basename(root).startsWith(prefix));
      assert.equal(await assertPlainDirectory(root), root);
      for (const entry of [...ancestry, { path: root, identity }]) {
        const current = await fs.lstat(entry.path, { bigint: true });
        assert.ok(current.isDirectory() && !current.isSymbolicLink());
        assert.deepEqual(identityOf(current), entry.identity, "Refuse cleanup of a replaced directory.");
      }
      const hierarchy = await captureHierarchy(root);
      assert.deepEqual(await captureHierarchy(root), hierarchy, "Refuse cleanup of a changed fixture hierarchy.");
      await fs.rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
      await assert.rejects(fs.lstat(root), error => error?.code === "ENOENT");
    },
  };
}

async function versionPackage(root, version) {
  const source = path.join(root, `source-${version}`);
  const packageRoot = path.join(root, `package-${version}`);
  const files = {
    "sps-owner-host-runtime.json": Buffer.from(`${JSON.stringify({ format: 8, fixtureVersion: version })}\n`),
    "sps-release-baseline.json": Buffer.from(`${JSON.stringify({ desktopVersion: "0.4.137", fixtureVersion: version })}\n`),
    "sps-owner-host-bootstrap.mjs": Buffer.from(`export const version = '${version}';\n`),
    "sps-owner-host-restore.mjs": Buffer.from("export {};\n"),
    "package.json": Buffer.from('{"name":"inert-runtime-crash-fixture"}\n'),
    "bin/node.exe": Buffer.from(`inert ${version}, never executed`),
    "dist/index.js": Buffer.from(`export const version = '${version}';\n`),
    "ui-dist/index.html": Buffer.from(`<title>Fixture ${version}</title>\n`),
    "node_modules/tsx/dist/loader.mjs": Buffer.from("export {};\n"),
    [SPS_REQUEST_HOSTNAME_RUNTIME_PATH]: Buffer.from(`export const fixtureVersion = '${version}';\n`),
    "nested/data.bin": Buffer.from([0, version.charCodeAt(0), 255, 128, 0]),
  };
  for (const [relative, bytes] of Object.entries(files)) {
    const destination = path.join(source, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes, { flag: "wx" });
  }
  const manifest = await createSpsOwnerHostRuntimePackage({ runtimeRoot: source, packageRoot });
  return { packageRoot, manifest, files };
}

async function assertRuntime(directory, version) {
  const hierarchy = await captureHierarchy(directory);
  assert.deepEqual(hierarchy.filter(entry => !entry.directory).map(entry => entry.relative).sort(),
    [...Object.keys(version.files), MARKER].sort());
  for (const [relative, bytes] of Object.entries(version.files)) {
    assert.deepEqual(await fs.readFile(path.join(directory, relative)), bytes, `${relative} must retain the expected version bytes.`);
  }
  assert.equal(sha256(await fs.readFile(path.join(directory, SPS_REQUEST_HOSTNAME_RUNTIME_PATH))),
    version.manifest.runtime.criticalFiles[SPS_REQUEST_HOSTNAME_RUNTIME_PATH]);
  assert.equal(sha256(await fs.readFile(path.join(directory, "sps-owner-host-runtime.json"))), version.manifest.runtime.manifestSha256);
  const marker = JSON.parse(await fs.readFile(path.join(directory, MARKER), "utf8"));
  assert.equal(marker.format, 1);
  assert.equal(marker.archiveSha256, version.manifest.archive.sha256);
  assert.ok(Number.isFinite(Date.parse(marker.materializedAt)));
}

function startMaterializer(root, packageRoot, target, boundary = null) {
  const nonce = randomUUID();
  const env = process.platform === "win32" ? {
    SYSTEMROOT: process.env.SYSTEMROOT ?? process.env.SystemRoot ?? "C:\\Windows",
    WINDIR: process.env.WINDIR ?? process.env.SystemRoot ?? "C:\\Windows",
  } : {};
  const child = spawn(process.execPath, ["--input-type=module", "-e", CHILD_SOURCE, runtimeModule,
    JSON.stringify({ packageRoot, target, boundary, nonce })], {
    cwd: root, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let fail;
  let failure;
  const failed = new Promise((_, reject) => { fail = error => { failure ??= error; reject(failure); }; });
  void failed.catch(() => {});
  child.on("error", fail);
  let outputBytes = 0;
  for (const stream of [child.stdout, child.stderr]) stream.on("data", bytes => {
    outputBytes += bytes.length;
    if (outputBytes > OUTPUT_LIMIT) fail(new Error("Materializer output exceeded its fixed cap."));
  });
  const eof = Promise.all([finished(child.stdout), finished(child.stderr)]);
  void eof.catch(fail);
  let closeInfo;
  const closed = new Promise(resolve => child.once("close", (code, signal) => {
    closeInfo = { code, signal };
    resolve(closeInfo);
  }));
  let resolveNotice;
  const notice = new Promise(resolve => { resolveNotice = resolve; });
  let messages = 0;
  child.on("message", value => {
    if (++messages !== 1 || !value || value.nonce !== nonce || Buffer.byteLength(JSON.stringify(value)) > 4096) {
      fail(new Error("Materializer emitted an invalid or duplicate fixture message."));
    } else resolveNotice(value);
  });
  let confirmed = false;
  async function confirmClose() {
    const [terminal] = await bounded(Promise.all([closed, eof]), 5_000, "Materializer close and output EOF");
    confirmed = true;
    return terminal;
  }
  return {
    child,
    get confirmed() { return confirmed; },
    async waitNotice() {
      return bounded(Promise.race([notice, failed, closed.then(() => {
        throw new Error("Materializer closed before its required fixture message.");
      })]), 6_000, "Materializer fixture message");
    },
    async naturalClose() {
      const terminal = await Promise.race([confirmClose(), failed]);
      assert.deepEqual(terminal, { code: 0, signal: null });
      assert.equal(failure, undefined);
      return terminal;
    },
    async killAndConfirm() {
      if (!closeInfo && child.exitCode === null && child.signalCode === null && !child.killed) {
        assert.equal(child.kill("SIGKILL"), true, "Terminate only this retained, test-owned ChildProcess handle.");
      }
      return confirmClose();
    },
  };
}

for (const boundary of ["old-moved", "new-promoted"]) {
  test(`a real process crash at ${boundary} recovers B in a fresh process and preserves stale A`, { timeout: 30_000 }, async t => {
    const owned = await ownedRoot("runtime");
    const outside = await ownedRoot("witness");
    const children = [];
    let failure;
    let passed = false;
    try {
      const userdata = path.join(outside.root, "userdata");
      await fs.mkdir(userdata);
      await fs.writeFile(path.join(userdata, "settings.json"), '{"syntheticUserData":"preserve"}\n', { flag: "wx" });
      await fs.writeFile(path.join(outside.root, "sentinel.bin"), Buffer.from([255, 0, 123, 45]), { flag: "wx" });
      const outsideIdentity = await captureHierarchy(outside.root);
      const outsideSettings = await fs.readFile(path.join(userdata, "settings.json"));
      const outsideSentinel = await fs.readFile(path.join(outside.root, "sentinel.bin"));
      const a = await versionPackage(owned.root, "A");
      const b = await versionPackage(owned.root, "B");
      assert.notEqual(a.manifest.archive.sha256, b.manifest.archive.sha256);
      const cache = path.join(owned.root, "cache");
      await fs.mkdir(cache);
      const target = path.join(cache, "runtime");
      const launch = (version, point = null) => {
        const process = startMaterializer(owned.root, version.packageRoot, target, point);
        children.push(process);
        return process;
      };

      const initial = launch(a);
      assert.equal((await initial.waitNotice()).type, "ready");
      await initial.naturalClose();
      await assertRuntime(target, a);
      const originalAIdentity = await captureHierarchy(target);
      const originalAMarker = await fs.readFile(path.join(target, MARKER));

      const crashing = launch(b, boundary);
      const notice = await crashing.waitNotice();
      assert.equal(notice.type, "parked");
      assert.equal(notice.boundary, boundary);
      assert.equal(crashing.child.exitCode, null);
      assert.equal(crashing.child.signalCode, null);
      assert.match(notice.stale, new RegExp(`^runtime\\.stale-${crashing.child.pid}-[0-9]+$`));
      const stale = path.join(cache, notice.stale);
      assert.equal(await assertPlainDirectory(stale), stale);
      assert.deepEqual(await captureHierarchy(stale), originalAIdentity, "The real rename must retain the original A hierarchy identity.");
      await assertRuntime(stale, a);
      let staged;
      let currentBIdentity;
      let currentBMarker;
      if (boundary === "old-moved") {
        assert.equal(notice.from, "runtime");
        assert.equal(notice.to, notice.stale);
        await assert.rejects(fs.lstat(target), error => error?.code === "ENOENT");
        const candidates = (await fs.readdir(cache)).filter(name => new RegExp(`^runtime\\.staging-${crashing.child.pid}-[0-9]+$`).test(name));
        assert.equal(candidates.length, 1);
        staged = path.join(cache, candidates[0]);
        await assertRuntime(staged, b);
      } else {
        assert.match(notice.from, new RegExp(`^runtime\\.staging-${crashing.child.pid}-[0-9]+$`));
        assert.equal(notice.to, "runtime");
        await assertRuntime(target, b);
        currentBIdentity = await captureHierarchy(target);
        currentBMarker = await fs.readFile(path.join(target, MARKER));
      }
      const lockBefore = await fs.readFile(`${target}.lock`);
      assert.equal(JSON.parse(lockBefore.toString("utf8")).pid, crashing.child.pid);
      const crashExit = await crashing.killAndConfirm();
      assert.ok(crashExit.code !== 0 || crashExit.signal !== null, "The injected crash must not count as a normal exit.");

      const recovery = launch(b);
      assert.notEqual(recovery.child, crashing.child);
      const recovered = await recovery.waitNotice();
      assert.equal(recovered.type, "ready");
      await recovery.naturalClose();
      await assertRuntime(target, b);
      await assertRuntime(stale, a);
      assert.deepEqual(await captureHierarchy(stale), originalAIdentity);
      assert.deepEqual(await fs.readFile(path.join(stale, MARKER)), originalAMarker);
      if (boundary === "old-moved") {
        assert.ok(recovered.phases.includes("runtime-promoted"));
        await assertRuntime(staged, b);
        await assert.rejects(fs.lstat(`${target}.lock`), error => error?.code === "ENOENT");
      } else {
        assert.deepEqual(recovered.phases, ["package-verify-start", "package-verified", "cache-ready"]);
        assert.deepEqual(await captureHierarchy(target), currentBIdentity);
        assert.deepEqual(await fs.readFile(path.join(target, MARKER)), currentBMarker);
        // A warm return preserves the abandoned lock; this is not orphan GC.
        assert.deepEqual(await fs.readFile(`${target}.lock`), lockBefore);
      }
      assert.deepEqual(await captureHierarchy(outside.root), outsideIdentity);
      assert.deepEqual(await fs.readFile(path.join(userdata, "settings.json")), outsideSettings);
      assert.deepEqual(await fs.readFile(path.join(outside.root, "sentinel.bin")), outsideSentinel);
      passed = true;
    } catch (error) { failure = error; }
    finally {
      for (const process of children) {
        if (!process.confirmed) {
          try { await process.killAndConfirm(); }
          catch (error) { failure = failure ? new AggregateError([failure, error], "Runtime crash observation and owned child cleanup failed.") : error; }
        }
      }
      if (passed && !failure && children.every(process => process.confirmed)) {
        try { await owned.remove(); await outside.remove(); }
        catch (error) { failure = error; }
      } else t.diagnostic("Owned crash fixtures preserved after failed observation or uncertain child close/EOF.");
    }
    if (failure) throw failure;
  });
}

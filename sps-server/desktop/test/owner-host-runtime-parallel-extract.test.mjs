import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { setImmediate as nextTurn } from "node:timers/promises";
import test from "node:test";
import { c as createTar, t as listTar } from "tar";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";
import { extractSpsOwnerRuntimeArchive } from "../src/owner-host-runtime-extract.mjs";

const FAILURE_MESSAGE = "SPS Owner Host runtime archive extraction failed.";
const completion = partition => ({ type: "sps-runtime-extracted", partition });

async function ownedTemporaryRoot(t) {
  const parent = await fs.realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(parent), parent);
  const root = await fs.mkdtemp(path.join(parent, "sps-runtime-parallel-test-"));
  assert.equal(await assertPlainDirectory(root), root);
  const identity = await fs.lstat(root, { bigint: true });
  const fixture = { root, cleanupAllowed: true };
  t.after(async () => {
    if (!fixture.cleanupAllowed) return;
    assert.ok(path.isAbsolute(root) && path.resolve(root) === root);
    assert.equal(path.dirname(root), parent);
    assert.match(path.basename(root), /^sps-runtime-parallel-test-[A-Za-z0-9]+$/);
    assert.equal(await assertPlainDirectory(root), root);
    const current = await fs.lstat(root, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    for (const field of ["dev", "ino", "birthtimeNs"]) {
      assert.equal(current[field], identity[field], `Refuse cleanup after temporary root ${field} changed.`);
    }
    await fs.rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
  });
  return fixture;
}

async function tinyArchive(t) {
  const fixture = await ownedTemporaryRoot(t);
  const source = path.join(fixture.root, "source");
  const cwd = path.join(fixture.root, "output");
  const file = path.join(fixture.root, "runtime.tgz");
  const files = {
    "root.bin": Buffer.from([0, 1, 127, 128, 255, 10]),
    "package.json": Buffer.from('{"name":"inert-runtime-fixture"}\n'),
    "deep/root/nested.txt": Buffer.from("nested root bytes\n"),
    "node_modules/plainPkg/index.js": Buffer.from("export const plain = true;\n"),
    "node_modules/plainPkg/lib/deep/data.bin": Buffer.from([9, 0, 8, 0, 7]),
    "node_modules/plainPkg/node_modules/transitive/index.js": Buffer.from("export {};\n"),
    "node_modules/@scope/otherPkg/index.js": Buffer.from("export const scoped = true;\n"),
    "node_modules/@scope/otherPkg/assets/deep/data.bin": Buffer.from([6, 0, 5, 0, 4]),
  };
  for (const [relative, bytes] of Object.entries(files)) {
    const destination = path.join(source, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  for (const relative of ["empty", "node_modules/plainPkg/empty", "node_modules/@scope/otherPkg/deep/empty"]) {
    await fs.mkdir(path.join(source, relative), { recursive: true });
  }
  await fs.mkdir(cwd);
  await createTar({ cwd: source, file, gzip: true, portable: true, noMtime: true, strict: true }, ["."]);
  return { ...fixture, source, cwd, file, owner: fixture };
}

async function captureTree(root, relative = "") {
  const result = [];
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
  for (const entry of entries) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    const details = await fs.lstat(path.join(root, child));
    assert.equal(details.isSymbolicLink(), false);
    if (details.isDirectory()) {
      result.push({ path: child, type: "directory" }, ...await captureTree(root, child));
    } else {
      assert.equal(details.isFile(), true);
      result.push({ path: child, type: "file", bytes: await fs.readFile(path.join(root, child)) });
    }
  }
  return result;
}

async function actualExtraction(fixture, options, internal) {
  try { return await extractSpsOwnerRuntimeArchive(options, internal); }
  catch (error) {
    if (error?.runtimeStagingCleanupUnconfirmed === true) fixture.cleanupAllowed = false;
    throw error;
  }
}

test("real four-thread extraction preserves every byte and empty directory while the main loop responds", { timeout: 20_000 }, async t => {
  const fixture = await tinyArchive(t);
  const expected = await captureTree(fixture.source);
  let pending = true;
  let responsiveTurns = 0;
  const heartbeat = setInterval(() => { if (pending) responsiveTurns += 1; }, 1);
  try {
    await actualExtraction(fixture.owner, {
      file: fixture.file, cwd: fixture.cwd, preservePaths: false, strict: true,
    }, { platform: "win32" });
  } finally {
    pending = false;
    clearInterval(heartbeat);
  }
  assert.ok(responsiveTurns > 0, "Main-thread callbacks must run before extraction completes.");
  assert.deepEqual(await captureTree(fixture.cwd), expected);
});

test("non-Windows extraction retains the actual tar path without starting Workers", { timeout: 20_000 }, async t => {
  const fixture = await tinyArchive(t);
  let workers = 0;
  await actualExtraction(fixture.owner, {
    file: fixture.file, cwd: fixture.cwd, preservePaths: false, strict: true,
  }, {
    platform: "linux",
    createWorker() { workers += 1; throw new Error("Unexpected Worker on the non-Windows path."); },
  });
  assert.equal(workers, 0);
  assert.deepEqual(await captureTree(fixture.cwd), await captureTree(fixture.source));
});

test("a real ../escape-prefixed archive is rejected without changing an outside sentinel", { timeout: 20_000 }, async t => {
  const fixture = await tinyArchive(t);
  const escape = path.join(fixture.root, "escape");
  await fs.mkdir(escape);
  await fs.writeFile(path.join(escape, "root.bin"), "outside sentinel must remain unchanged");
  const before = await captureTree(escape);
  const malicious = path.join(fixture.root, "traversal.tgz");
  await createTar({ cwd: fixture.source, file: malicious, prefix: "../escape", gzip: true, portable: true, strict: true }, ["root.bin"]);
  const archivePaths = [];
  await listTar({ file: malicious, strict: true, onentry: entry => archivePaths.push(entry.path) });
  assert.deepEqual(archivePaths, ["../escape/root.bin"]);
  await assert.rejects(actualExtraction(fixture.owner, {
    file: malicious, cwd: fixture.cwd, preservePaths: false, strict: true,
  }, { platform: "win32" }), error => {
    assert.equal(error.message, FAILURE_MESSAGE);
    assert.notEqual(error.runtimeStagingCleanupUnconfirmed, true);
    return true;
  });
  assert.deepEqual(await captureTree(escape), before);
  assert.deepEqual(await captureTree(fixture.cwd), []);
});

function injectedPool(options, { startupFailure = false } = {}) {
  const workers = [];
  let settled = false;
  const operation = extractSpsOwnerRuntimeArchive(options, {
    platform: "win32",
    createWorker(data) {
      if (startupFailure && data.partition === 2) throw new Error("Controlled Worker startup failure.");
      const worker = new EventEmitter();
      worker.stdout = new PassThrough();
      worker.stderr = new PassThrough();
      let release;
      let reject;
      const stopped = new Promise((resolve, rejectPromise) => { release = resolve; reject = rejectPromise; });
      const record = { worker, data, terminateCalls: 0, release, reject };
      worker.terminate = () => { record.terminateCalls += 1; return stopped; };
      workers.push(record);
      return worker;
    },
  });
  const outcome = operation.then(
    value => { settled = true; return { value }; },
    error => { settled = true; return { error }; },
  );
  return { workers, outcome, get settled() { return settled; } };
}

function assertPoolData(pool, options) {
  assert.deepEqual(pool.workers.map(record => record.data), [0, 1, 2, 3].map(partition => ({
    file: options.file, cwd: options.cwd, partition,
  })));
}

async function finishInjectedPool(pool) {
  for (const record of pool.workers) {
    record.release(1);
    record.worker.emit("exit", 1);
  }
  await pool.outcome;
  for (const { worker } of pool.workers) {
    worker.stdout.destroy();
    worker.stderr.destroy();
  }
}

test("exactly four partitions require one completion each and actual exit 0, with captured output drained", { timeout: 5_000 }, async t => {
  const { root } = await ownedTemporaryRoot(t);
  const options = { file: path.join(root, "inert.tgz"), cwd: path.join(root, "output") };
  const pool = injectedPool(options);
  try {
    assertPoolData(pool, options);
    for (const { worker, data } of pool.workers) {
      worker.stdout.write("inert captured stdout");
      worker.stderr.write("inert captured stderr");
      assert.equal(worker.stdout.readableLength, 0);
      assert.equal(worker.stderr.readableLength, 0);
      worker.emit("message", completion(data.partition));
    }
    await nextTurn();
    assert.equal(pool.settled, false, "Messages alone must not complete extraction.");
    for (const { worker } of pool.workers.slice(0, -1)) worker.emit("exit", 0);
    await nextTurn();
    assert.equal(pool.settled, false, "Every partition's exit must be observed.");
    pool.workers.at(-1).worker.emit("exit", 0);
    const result = await pool.outcome;
    assert.equal(Object.hasOwn(result, "error"), false);
    assert.deepEqual(pool.workers.map(record => record.terminateCalls), [0, 0, 0, 0]);
  } finally { await finishInjectedPool(pool); }
});

const protocolFailures = [
  ["unknown message", worker => worker.emit("message", { type: "unexpected", partition: 0 })],
  ["wrong partition", worker => worker.emit("message", completion(1))],
  ["extra message field", worker => worker.emit("message", { ...completion(0), extra: true })],
  ["non-record message", worker => worker.emit("message", null)],
  ["duplicate completion", worker => { worker.emit("message", completion(0)); worker.emit("message", completion(0)); }],
  ["exit without completion", worker => worker.emit("exit", 0)],
  ["nonzero exit", worker => { worker.emit("message", completion(0)); worker.emit("exit", 7); }],
  ["Worker error", worker => worker.emit("error", new Error("Controlled Worker error."))],
  ["message deserialization error", worker => worker.emit("messageerror", new Error("Controlled message error."))],
];

for (const [name, trigger] of protocolFailures) {
  test(`${name} terminates and awaits all four started Workers before rejection`, { timeout: 5_000 }, async t => {
    const { root } = await ownedTemporaryRoot(t);
    const options = { file: path.join(root, "inert.tgz"), cwd: path.join(root, "output") };
    const pool = injectedPool(options);
    try {
      assertPoolData(pool, options);
      trigger(pool.workers[0].worker);
      await nextTurn();
      assert.deepEqual(pool.workers.map(record => record.terminateCalls), [1, 1, 1, 1]);
      assert.equal(pool.settled, false, "Failure cleanup must await termination.");
      for (const record of pool.workers.slice(0, -1)) record.release(1);
      await nextTurn();
      assert.equal(pool.settled, false, "A pending last Worker must hold failure cleanup open.");
      pool.workers.at(-1).release(1);
      const { error } = await pool.outcome;
      assert.ok(error instanceof Error);
      assert.equal(error.message, FAILURE_MESSAGE);
      assert.notEqual(error.runtimeStagingCleanupUnconfirmed, true);
    } finally { await finishInjectedPool(pool); }
  });
}

test("a synchronous startup failure terminates every Worker that did start and awaits them", { timeout: 5_000 }, async t => {
  const { root } = await ownedTemporaryRoot(t);
  const pool = injectedPool({ file: path.join(root, "inert.tgz"), cwd: path.join(root, "output") }, { startupFailure: true });
  try {
    assert.ok(pool.workers.length >= 2 && pool.workers.length < 4);
    assert.equal(pool.workers.some(record => record.data.partition === 2), false);
    await nextTurn();
    assert.ok(pool.workers.every(record => record.terminateCalls === 1));
    assert.equal(pool.settled, false);
    for (const record of pool.workers) record.release(1);
    const { error } = await pool.outcome;
    assert.equal(error.message, FAILURE_MESSAGE);
    assert.notEqual(error.runtimeStagingCleanupUnconfirmed, true);
  } finally { await finishInjectedPool(pool); }
});

test("a rejected termination keeps failure unconfirmed while awaiting the remaining Workers", { timeout: 5_000 }, async t => {
  const { root } = await ownedTemporaryRoot(t);
  const options = { file: path.join(root, "inert.tgz"), cwd: path.join(root, "output") };
  const pool = injectedPool(options);
  try {
    assertPoolData(pool, options);
    pool.workers[0].worker.emit("message", { type: "unexpected", partition: 0 });
    await nextTurn();
    assert.deepEqual(pool.workers.map(record => record.terminateCalls), [1, 1, 1, 1]);
    pool.workers[0].reject(new Error("Controlled termination rejection."));
    await nextTurn();
    assert.equal(pool.settled, false, "Unconfirmed termination must not skip waiting for other Workers.");
    for (const record of pool.workers.slice(1)) record.release(1);
    const { error } = await pool.outcome;
    assert.equal(error.message, FAILURE_MESSAGE);
    assert.equal(error.runtimeStagingCleanupUnconfirmed, true);
    assert.equal(Object.hasOwn(error, "runtimeStagingCleanupUnconfirmed"), true);
  } finally { await finishInjectedPool(pool); }
});

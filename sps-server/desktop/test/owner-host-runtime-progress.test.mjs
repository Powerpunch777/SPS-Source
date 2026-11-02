import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { t as listTar, x as extractTar } from "tar";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";
import {
  createSpsOwnerHostRuntimePackage,
  materializeSpsOwnerHostRuntimePackage,
  SPS_OWNER_HOST_RUNTIME_ARCHIVE,
  SPS_REQUEST_HOSTNAME_RUNTIME_PATH,
} from "../src/owner-host-runtime-package.mjs";

const COLD_PHASES = [
  "package-verify-start",
  "package-verified",
  "archive-preflight-start",
  "archive-preflight-complete",
  "extraction-start",
  "extraction-complete",
  "expanded-verification-start",
  "expanded-verification-complete",
  "runtime-promoted",
];
const WARM_PHASES = ["package-verify-start", "package-verified", "cache-ready"];

async function fixture(t) {
  const tempParent = await fs.realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(tempParent), tempParent);
  const root = await fs.mkdtemp(path.join(tempParent, "sps-owner-progress-"));
  assert.equal(await assertPlainDirectory(root), root);
  const identity = await fs.lstat(root, { bigint: true });
  t.after(async () => {
    assert.ok(path.isAbsolute(root) && path.resolve(root) === root);
    assert.equal(path.dirname(root), tempParent);
    assert.match(path.basename(root), /^sps-owner-progress-[A-Za-z0-9]+$/);
    assert.equal(await assertPlainDirectory(root), root);
    const current = await fs.lstat(root, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink());
    for (const field of ["dev", "ino", "birthtimeNs"]) {
      assert.equal(current[field], identity[field], `refuse cleanup after fixture ${field} changed`);
    }
    await fs.rm(root, { recursive: true, maxRetries: 5, retryDelay: 100 });
  });

  const runtimeRoot = path.join(root, "runtime");
  const packageRoot = path.join(root, "package");
  const targetRuntimeRoot = path.join(root, "materialized");
  // Keep this small runtime fixture independent of the existing unit test file.
  const files = {
    "sps-owner-host-runtime.json": '{"format":8}\n',
    "sps-release-baseline.json": '{"desktopVersion":"0.4.98"}\n',
    "sps-owner-host-bootstrap.mjs": "export {};\n",
    "sps-owner-host-restore.mjs": "export {};\n",
    "package.json": '{"name":"sps-owner-host-runtime"}\n',
    "bin/node.exe": "inert fixture, never executed",
    "dist/index.js": "export {};\n",
    "ui-dist/index.html": "<title>SPS</title>\n",
    "node_modules/tsx/dist/loader.mjs": "export {};\n",
    [SPS_REQUEST_HOSTNAME_RUNTIME_PATH]: "export const requestHostname = () => 'localhost';\n",
  };
  await Promise.all(Object.entries(files).map(async ([relative, content]) => {
    const file = path.join(runtimeRoot, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, "utf8");
  }));
  await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
  return { root, packageRoot, targetRuntimeRoot };
}

function assertNotices(calls, phases) {
  // Exact one-string arguments also prevent paths, errors, or other PII payloads.
  assert.deepEqual(calls, phases.map(phase => [phase]));
}

async function assertPreparationClean(root) {
  assert.deepEqual((await fs.readdir(root)).filter(name =>
    name.endsWith(".lock") || name.includes(".staging-") || name.includes(".stale-")), []);
}

test("cold runtime progress brackets real preflight, extraction, verification, and promotion", { timeout: 20_000 }, async t => {
  const { root, packageRoot, targetRuntimeRoot } = await fixture(t);
  const calls = [];
  const events = [];
  const fsApi = {
    ...fs,
    stat: async (file, ...args) => {
      const details = await fs.stat(file, ...args);
      if (file === path.join(packageRoot, SPS_OWNER_HOST_RUNTIME_ARCHIVE)) events.push("archive-stat");
      return details;
    },
    readdir: async (directory, ...args) => {
      const entries = await fs.readdir(directory, ...args);
      if (directory.startsWith(`${targetRuntimeRoot}.staging-`)) events.push("expanded-files-read");
      return entries;
    },
    rename: async (from, to) => {
      await fs.rename(from, to);
      if (to === targetRuntimeRoot) events.push("promotion-done");
    },
  };
  const result = await materializeSpsOwnerHostRuntimePackage({
    packageRoot, targetRuntimeRoot, fsApi,
    onProgress: (...args) => { calls.push(args); events.push(args[0]); },
    tarList: async options => {
      events.push("tar-list-start");
      await listTar(options);
      events.push("tar-list-done");
    },
    tarExtract: async options => {
      events.push("tar-extract-start");
      await extractTar(options);
      events.push("tar-extract-done");
    },
  });
  assert.equal(result, targetRuntimeRoot);
  assertNotices(calls, COLD_PHASES);
  const before = (left, right) => {
    assert.ok(events.includes(left) && events.includes(right), `${left} and ${right} must be observed`);
    assert.ok(events.indexOf(left) < events.indexOf(right), `${left} must precede ${right}`);
  };
  before("package-verify-start", "archive-stat");
  before("archive-stat", "package-verified");
  before("archive-preflight-start", "tar-list-start");
  before("tar-list-done", "archive-preflight-complete");
  before("extraction-start", "tar-extract-start");
  before("tar-extract-done", "extraction-complete");
  before("expanded-verification-start", "expanded-files-read");
  assert.ok(events.lastIndexOf("expanded-files-read") < events.indexOf("expanded-verification-complete"));
  before("expanded-verification-complete", "promotion-done");
  before("promotion-done", "runtime-promoted");
  assert.equal(await fs.readFile(path.join(targetRuntimeRoot, "dist", "index.js"), "utf8"), "export {};\n");
  await assertPreparationClean(root);
});

test("warm progress skips extraction but still rejects same-size archive corruption despite a throwing callback", { timeout: 20_000 }, async t => {
  const { root, packageRoot, targetRuntimeRoot } = await fixture(t);
  await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot });
  const marker = path.join(targetRuntimeRoot, ".sps-runtime-materialized.json");
  const originalMarker = await fs.readFile(marker, "utf8");
  const calls = [];
  const unexpectedOperations = [];
  const fsApi = { ...fs };
  for (const operation of ["mkdir", "open", "rename", "rm", "writeFile"]) {
    fsApi[operation] = async () => {
      unexpectedOperations.push(operation);
      throw new Error(`unexpected warm mutation: ${operation}`);
    };
  }
  const options = {
    packageRoot, targetRuntimeRoot, fsApi,
    onProgress: (...args) => { calls.push(args); },
    tarList: async () => { unexpectedOperations.push("tarList"); throw new Error("unexpected warm preflight"); },
    tarExtract: async () => { unexpectedOperations.push("tarExtract"); throw new Error("unexpected warm extraction"); },
  };
  assert.equal(await materializeSpsOwnerHostRuntimePackage(options), targetRuntimeRoot);
  assertNotices(calls, WARM_PHASES);
  assert.deepEqual(unexpectedOperations, []);

  const archivePath = path.join(packageRoot, SPS_OWNER_HOST_RUNTIME_ARCHIVE);
  const archive = await fs.readFile(archivePath);
  const originalSize = archive.length;
  archive[Math.floor(archive.length / 2)] ^= 1;
  await fs.writeFile(archivePath, archive);
  assert.equal((await fs.stat(archivePath)).size, originalSize);
  calls.length = 0;
  await assert.rejects(materializeSpsOwnerHostRuntimePackage({
    ...options,
    onProgress: (...args) => { calls.push(args); throw new Error("diagnostic callback failure"); },
  }), /archive failed SHA-256 verification/);
  assertNotices(calls, ["package-verify-start"]);
  assert.deepEqual(unexpectedOperations, []);
  assert.equal(await fs.readFile(marker, "utf8"), originalMarker);
  await assertPreparationClean(root);
});

test("throwing notices do not change successful cold or warm runtime acceptance", { timeout: 20_000 }, async t => {
  const { root, packageRoot, targetRuntimeRoot } = await fixture(t);
  const calls = [];
  const options = {
    packageRoot, targetRuntimeRoot,
    onProgress: (...args) => { calls.push(args); throw new Error("diagnostic callback failure"); },
  };
  assert.equal(await materializeSpsOwnerHostRuntimePackage(options), targetRuntimeRoot);
  assertNotices(calls, COLD_PHASES);
  calls.length = 0;
  assert.equal(await materializeSpsOwnerHostRuntimePackage(options), targetRuntimeRoot);
  assertNotices(calls, WARM_PHASES);
  assert.equal(await fs.readFile(path.join(targetRuntimeRoot, "dist", "index.js"), "utf8"), "export {};\n");
  await assertPreparationClean(root);
});

test("throwing notices preserve an extraction failure and its staging and lock cleanup", { timeout: 20_000 }, async t => {
  const { root, packageRoot, targetRuntimeRoot } = await fixture(t);
  const extractionFailure = new Error("controlled extraction failure");
  const calls = [];
  await assert.rejects(materializeSpsOwnerHostRuntimePackage({
    packageRoot, targetRuntimeRoot,
    onProgress: (...args) => { calls.push(args); throw new Error("diagnostic callback failure"); },
    tarExtract: async options => { await extractTar(options); throw extractionFailure; },
  }), error => error === extractionFailure);
  assertNotices(calls, COLD_PHASES.slice(0, COLD_PHASES.indexOf("extraction-complete")));
  await assert.rejects(fs.lstat(targetRuntimeRoot), error => error?.code === "ENOENT");
  await assertPreparationClean(root);
});

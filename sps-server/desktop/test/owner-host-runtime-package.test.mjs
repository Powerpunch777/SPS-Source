import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createSpsOwnerHostRuntimePackage,
  inspectSpsOwnerHostRuntimeArchive,
  isRuntimePreparationLockOwnerGone,
  materializeSpsOwnerHostRuntimePackage,
  readSpsOwnerHostRuntimePackage,
  SPS_OWNER_HOST_RUNTIME_ARCHIVE,
  SPS_REQUEST_HOSTNAME_RUNTIME_PATH,
} from "../src/owner-host-runtime-package.mjs";

async function writeFile(root, relative, content = relative) {
  const target = path.join(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

async function createRuntime(root) {
  await Promise.all([
    writeFile(root, "sps-owner-host-runtime.json", "{\"format\":8}\n"),
    writeFile(root, "sps-release-baseline.json", "{\"desktopVersion\":\"0.4.98\"}\n"),
    writeFile(root, "sps-owner-host-bootstrap.mjs", "export {};\n"),
    writeFile(root, "sps-owner-host-restore.mjs", "export {};\n"),
    writeFile(root, "package.json", "{\"name\":\"sps-owner-host-runtime\"}\n"),
    writeFile(root, "bin/node.exe", "node"),
    writeFile(root, "dist/index.js", "export {};\n"),
    writeFile(root, "ui-dist/index.html", "<title>SPS</title>\n"),
    writeFile(root, "node_modules/tsx/dist/loader.mjs", "export {};\n"),
    writeFile(root, SPS_REQUEST_HOSTNAME_RUNTIME_PATH, "export const requestHostname = () => 'localhost';\n"),
  ]);
}

test("packages, verifies, materializes, and reuses one Owner Host runtime archive", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-package-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  try {
    await createRuntime(runtimeRoot);
    const created = await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    assert.equal(created.runtime.fileCount, 10);
    assert.match(created.archive.sha256, /^[a-f0-9]{64}$/);
    assert.match(created.runtime.criticalFiles[SPS_REQUEST_HOSTNAME_RUNTIME_PATH], /^[a-f0-9]{64}$/);
    const inspected = await readSpsOwnerHostRuntimePackage(packageRoot);
    assert.equal(inspected.manifest.archive.sha256, created.archive.sha256);
    assert.equal(await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: targetRoot }), targetRoot);
    const firstWrite = (await fs.stat(path.join(targetRoot, "dist", "index.js"))).mtimeMs;
    assert.equal(await fs.readFile(path.join(targetRoot, "dist", "index.js"), "utf8"), "export {};\n");
    assert.equal(await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: targetRoot }), targetRoot);
    assert.equal((await fs.stat(path.join(targetRoot, "dist", "index.js"))).mtimeMs, firstWrite);
    await fs.writeFile(path.join(targetRoot, SPS_REQUEST_HOSTNAME_RUNTIME_PATH), "tampered", "utf8");
    await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: targetRoot });
    assert.equal(
      await fs.readFile(path.join(targetRoot, SPS_REQUEST_HOSTNAME_RUNTIME_PATH), "utf8"),
      "export const requestHostname = () => 'localhost';\n",
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("serializes archive creation for large Windows node_modules trees", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-create-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  let capturedOptions = null;
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({
      runtimeRoot,
      packageRoot,
      tarCreate: async (options, entries) => {
        capturedOptions = options;
        assert.deepEqual(entries, ["."]);
        await fs.writeFile(options.file, "archive", "utf8");
      },
    });
    assert.equal(capturedOptions.jobs, 1);
    assert.equal(capturedOptions.linkCache.get("existing"), undefined);
    assert.equal(capturedOptions.linkCache.set("file", "target"), capturedOptions.linkCache);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("rejects a tampered Owner Host runtime archive before extraction", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-tamper-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.appendFile(path.join(packageRoot, SPS_OWNER_HOST_RUNTIME_ARCHIVE), "tampered", "utf8");
    await assert.rejects(
      readSpsOwnerHostRuntimePackage(packageRoot),
      /size does not match|SHA-256 verification/i,
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("rejects archive path traversal and link entries during preflight", async () => {
  const expected = { fileCount: 1, sizeBytes: 1 };
  await assert.rejects(
    inspectSpsOwnerHostRuntimeArchive({
      archivePath: "unused",
      expected,
      tarList: async ({ onentry }) => onentry({ path: "../escape", type: "File", size: 1 }),
    }),
    /path traversal/i,
  );
  await assert.rejects(
    inspectSpsOwnerHostRuntimeArchive({
      archivePath: "unused",
      expected,
      tarList: async ({ onentry }) => onentry({ path: "link", type: "SymbolicLink", size: 1 }),
    }),
    /unsupported entry type/i,
  );
});

test("keeps a failed extraction out of the final runtime path", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-partial-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await assert.rejects(materializeSpsOwnerHostRuntimePackage({
      packageRoot,
      targetRuntimeRoot: targetRoot,
      tarExtract: async ({ cwd }) => {
        await writeFile(cwd, "partial.txt", "partial");
        throw new Error("simulated extraction failure");
      },
    }), /simulated extraction failure/);
    await assert.rejects(fs.access(targetRoot));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("restores the previous runtime when promoting the extracted runtime fails", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-promotion-rollback-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const oldMarker = path.join(targetRoot, "old-marker.txt");
  const promotionError = Object.assign(new Error("simulated sharing violation"), { code: "EPERM" });
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(oldMarker, "previous runtime", "utf8");

    await assert.rejects(
      materializeSpsOwnerHostRuntimePackage({
        packageRoot,
        targetRuntimeRoot: targetRoot,
        fsApi: {
          ...fs,
          rename: async (from, to) => {
            if (from.startsWith(`${targetRoot}.staging-`) && to === targetRoot) throw promotionError;
            return fs.rename(from, to);
          },
        },
        delay: async () => {},
      }),
      error => error === promotionError,
    );
    assert.equal(await fs.readFile(oldMarker, "utf8"), "previous runtime");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("retries a transient runtime promotion failure before succeeding", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-promotion-retry-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const promotionError = Object.assign(new Error("transient sharing violation"), { code: "EPERM" });
  let promotionAttempts = 0;
  let retryDelays = 0;
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, "old-marker.txt"), "previous runtime", "utf8");

    await materializeSpsOwnerHostRuntimePackage({
      packageRoot,
      targetRuntimeRoot: targetRoot,
      fsApi: {
        ...fs,
        rename: async (from, to) => {
          if (from.startsWith(`${targetRoot}.staging-`) && to === targetRoot && ++promotionAttempts === 1) {
            throw promotionError;
          }
          return fs.rename(from, to);
        },
      },
      delay: async () => { retryDelays += 1; },
    });

    assert.equal(promotionAttempts, 2);
    assert.equal(retryDelays, 1);
    assert.equal(await fs.readFile(path.join(targetRoot, "bin", "node.exe"), "utf8"), "node");
    assert.match(await fs.readFile(path.join(targetRoot, ".sps-runtime-materialized.json"), "utf8"), /archiveSha256/);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("preserves both previous and staged runtimes when rollback also fails", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-rollback-failure-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const promotionError = Object.assign(new Error("promotion sharing violation"), { code: "EPERM" });
  const restoreError = Object.assign(new Error("restore denied"), { code: "EACCES" });
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, "old-marker.txt"), "previous runtime", "utf8");

    await assert.rejects(
      materializeSpsOwnerHostRuntimePackage({
        packageRoot,
        targetRuntimeRoot: targetRoot,
        fsApi: {
          ...fs,
          rename: async (from, to) => {
            if (from.startsWith(`${targetRoot}.staging-`) && to === targetRoot) throw promotionError;
            if (from.startsWith(`${targetRoot}.stale-`) && to === targetRoot) throw restoreError;
            return fs.rename(from, to);
          },
        },
        delay: async () => {},
      }),
      error => error instanceof AggregateError
        && error.errors.includes(promotionError)
        && error.errors.includes(restoreError),
    );

    const entries = await fs.readdir(temporary);
    const staleRoot = path.join(temporary, entries.find(name => name.startsWith("materialized.stale-")));
    const stagingRoot = path.join(temporary, entries.find(name => name.startsWith("materialized.staging-")));
    assert.equal(await fs.readFile(path.join(staleRoot, "old-marker.txt"), "utf8"), "previous runtime");
    assert.equal(await fs.readFile(path.join(stagingRoot, "bin", "node.exe"), "utf8"), "node");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("does not overwrite an unexpected target during rollback", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-rollback-occupied-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const promotionError = Object.assign(new Error("promotion sharing violation"), { code: "EPERM" });
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.mkdir(targetRoot, { recursive: true });
    await fs.writeFile(path.join(targetRoot, "old-marker.txt"), "previous runtime", "utf8");

    await assert.rejects(
      materializeSpsOwnerHostRuntimePackage({
        packageRoot,
        targetRuntimeRoot: targetRoot,
        fsApi: {
          ...fs,
          rename: async (from, to) => {
            if (from.startsWith(`${targetRoot}.staging-`) && to === targetRoot) {
              await fs.mkdir(targetRoot, { recursive: true });
              await fs.writeFile(path.join(targetRoot, "unexpected-marker.txt"), "unexpected target", "utf8");
              throw promotionError;
            }
            return fs.rename(from, to);
          },
        },
        delay: async () => {},
      }),
      error => error instanceof AggregateError
        && error.errors[0] === promotionError
        && /destination is occupied/.test(error.errors[1]?.message ?? ""),
    );

    assert.equal(await fs.readFile(path.join(targetRoot, "unexpected-marker.txt"), "utf8"), "unexpected target");
    const entries = await fs.readdir(temporary);
    const staleRoot = path.join(temporary, entries.find(name => name.startsWith("materialized.stale-")));
    const stagingRoot = path.join(temporary, entries.find(name => name.startsWith("materialized.staging-")));
    assert.equal(await fs.readFile(path.join(staleRoot, "old-marker.txt"), "utf8"), "previous runtime");
    assert.equal(await fs.readFile(path.join(stagingRoot, "bin", "node.exe"), "utf8"), "node");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("classifies stale runtime lock owners conservatively", () => {
  const cases = [
    {
      name: "ESRCH confirms a different PID is gone",
      owner: { pid: process.pid + 10_000 },
      probe: () => { throw Object.assign(new Error("missing process"), { code: "ESRCH" }); },
      expected: true,
    },
    {
      name: "EPERM leaves a different PID unknown",
      owner: { pid: process.pid + 10_000 },
      probe: () => { throw Object.assign(new Error("permission denied"), { code: "EPERM" }); },
      expected: false,
    },
    {
      name: "other probe errors leave a different PID unknown",
      owner: { pid: process.pid + 10_000 },
      probe: () => { throw Object.assign(new Error("probe failed"), { code: "EIO" }); },
      expected: false,
    },
    {
      name: "a successful probe keeps a different PID live",
      owner: { pid: process.pid + 10_000 },
      probe: () => undefined,
      expected: false,
    },
    {
      name: "the current process is never reclaimed as a stale owner",
      owner: { pid: process.pid },
      probe: () => { throw Object.assign(new Error("probe must not run"), { code: "ESRCH" }); },
      expected: false,
    },
    ...[
      null,
      {},
      { pid: "123" },
      { pid: 0 },
      { pid: -1 },
      { pid: 1.5 },
      { pid: Number.MAX_SAFE_INTEGER + 1 },
    ].map(owner => ({
      name: `invalid owner record ${JSON.stringify(owner)}`,
      owner,
      probe: () => { throw Object.assign(new Error("probe must not run"), { code: "ESRCH" }); },
      expected: false,
    })),
  ];

  for (const entry of cases) {
    assert.equal(
      isRuntimePreparationLockOwnerGone(entry.owner, { probe: entry.probe }),
      entry.expected,
      entry.name,
    );
  }
});

test("does not reclaim an old runtime lock while its recorded process is alive", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-live-lock-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const lockPath = `${targetRoot}.lock`;
  const staleAt = new Date(Date.now() - 16 * 60_000);
  const lockContents = `${JSON.stringify({ pid: process.pid, createdAt: staleAt.toISOString() })}\n`;
  const waitingSentinel = new Error("waited for the live runtime lock");
  let extractionCalls = 0;
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.writeFile(lockPath, lockContents, "utf8");
    await fs.utimes(lockPath, staleAt, staleAt);

    await assert.rejects(
      materializeSpsOwnerHostRuntimePackage({
        packageRoot,
        targetRuntimeRoot: targetRoot,
        delay: async () => { throw waitingSentinel; },
        tarExtract: async () => {
          extractionCalls += 1;
          throw new Error("unexpected extraction while another process owns the lock");
        },
      }),
      error => error === waitingSentinel,
    );
    assert.equal(extractionCalls, 0);
    assert.equal(await fs.readFile(lockPath, "utf8"), lockContents);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("reclaims a fresh lock after confirming its spawned owner exited", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-dead-lock-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const lockPath = `${targetRoot}.lock`;
  const child = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0);
  assert.throws(() => process.kill(child.pid, 0), error => error?.code === "ESRCH");
  const waitingSentinel = new Error("waited instead of reclaiming a dead owner lock");
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.writeFile(lockPath, `${JSON.stringify({ pid: child.pid, createdAt: new Date().toISOString() })}\n`, "utf8");

    assert.equal(await materializeSpsOwnerHostRuntimePackage({
      packageRoot,
      targetRuntimeRoot: targetRoot,
      delay: async () => { throw waitingSentinel; },
    }), targetRoot);

    assert.equal(await fs.readFile(path.join(targetRoot, "dist", "index.js"), "utf8"), "export {};\n");
    await assert.rejects(fs.stat(lockPath), error => error?.code === "ENOENT");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("preserves a replaced dead-owner lock when its identity changes during the probe", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-replaced-lock-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const lockPath = `${targetRoot}.lock`;
  const child = spawnSync(process.execPath, ["-e", ""], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0);
  assert.throws(() => process.kill(child.pid, 0), error => error?.code === "ESRCH");
  const replacementLock = `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`;
  const waitingSentinel = new Error("waited after the lock identity changed");
  let lockStats = 0;
  let extractionCalls = 0;
  const fsApi = Object.create(fs);
  fsApi.stat = async (filePath, ...args) => {
      const details = await fs.stat(filePath, ...args);
      if (filePath === lockPath && ++lockStats === 2) {
        await fs.writeFile(lockPath, replacementLock, "utf8");
        const changedAt = new Date(Date.now() + 2_000);
        await fs.utimes(lockPath, changedAt, changedAt);
        return await fs.stat(lockPath);
      }
      return details;
  };
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.writeFile(lockPath, `${JSON.stringify({ pid: child.pid, createdAt: new Date().toISOString() })}\n`, "utf8");

    await assert.rejects(materializeSpsOwnerHostRuntimePackage({
      packageRoot,
      targetRuntimeRoot: targetRoot,
      fsApi,
      delay: async () => { throw waitingSentinel; },
      tarExtract: async () => {
        extractionCalls += 1;
        throw new Error("unexpected extraction after a lock identity change");
      },
    }), error => error === waitingSentinel);

    assert.equal(lockStats, 2);
    assert.equal(extractionCalls, 0);
    assert.equal(await fs.readFile(lockPath, "utf8"), replacementLock);
    await assert.rejects(fs.stat(path.join(targetRoot, "dist", "index.js")), error => error?.code === "ENOENT");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("does not reclaim a malformed stale runtime lock", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-malformed-lock-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  const lockPath = `${targetRoot}.lock`;
  const staleAt = new Date(Date.now() - 16 * 60_000);
  const lockContents = "{malformed stale lock\n";
  const waitingSentinel = new Error("waited for the malformed runtime lock");
  let extractionCalls = 0;
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    await fs.writeFile(lockPath, lockContents, "utf8");
    await fs.utimes(lockPath, staleAt, staleAt);

    await assert.rejects(
      materializeSpsOwnerHostRuntimePackage({
        packageRoot,
        targetRuntimeRoot: targetRoot,
        delay: async () => { throw waitingSentinel; },
        tarExtract: async () => {
          extractionCalls += 1;
          throw new Error("unexpected extraction while a malformed lock exists");
        },
      }),
      error => error === waitingSentinel,
    );
    assert.equal(extractionCalls, 0);
    assert.equal(await fs.readFile(lockPath, "utf8"), lockContents);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("serializes concurrent materialization into one verified runtime", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sps-owner-concurrent-"));
  const runtimeRoot = path.join(temporary, "runtime");
  const packageRoot = path.join(temporary, "package");
  const targetRoot = path.join(temporary, "materialized");
  try {
    await createRuntime(runtimeRoot);
    await createSpsOwnerHostRuntimePackage({ runtimeRoot, packageRoot });
    const results = await Promise.all([
      materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: targetRoot }),
      materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: targetRoot }),
    ]);
    assert.deepEqual(results, [targetRoot, targetRoot]);
    assert.equal(await fs.readFile(path.join(targetRoot, "bin", "node.exe"), "utf8"), "node");
  } finally {
    await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

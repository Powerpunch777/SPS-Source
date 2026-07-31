import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createSpsOwnerHostRuntimePackage,
  inspectSpsOwnerHostRuntimeArchive,
  materializeSpsOwnerHostRuntimePackage,
  readSpsOwnerHostRuntimePackage,
  SPS_OWNER_HOST_RUNTIME_ARCHIVE,
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
    writeFile(root, "package.json", "{\"name\":\"sps-owner-host-runtime\"}\n"),
    writeFile(root, "bin/node.exe", "node"),
    writeFile(root, "dist/index.js", "export {};\n"),
    writeFile(root, "ui-dist/index.html", "<title>SPS</title>\n"),
    writeFile(root, "node_modules/tsx/dist/loader.mjs", "export {};\n"),
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
    assert.equal(created.runtime.fileCount, 8);
    assert.match(created.archive.sha256, /^[a-f0-9]{64}$/);
    const inspected = await readSpsOwnerHostRuntimePackage(packageRoot);
    assert.equal(inspected.manifest.archive.sha256, created.archive.sha256);
    assert.equal(await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: targetRoot }), targetRoot);
    const firstWrite = (await fs.stat(path.join(targetRoot, "dist", "index.js"))).mtimeMs;
    assert.equal(await fs.readFile(path.join(targetRoot, "dist", "index.js"), "utf8"), "export {};\n");
    assert.equal(await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: targetRoot }), targetRoot);
    assert.equal((await fs.stat(path.join(targetRoot, "dist", "index.js"))).mtimeMs, firstWrite);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
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
    await fs.rm(temporary, { recursive: true, force: true });
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
    await fs.rm(temporary, { recursive: true, force: true });
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
    await fs.rm(temporary, { recursive: true, force: true });
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
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

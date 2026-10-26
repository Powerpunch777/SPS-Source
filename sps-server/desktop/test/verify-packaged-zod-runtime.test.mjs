import assert from "node:assert/strict";
import { cp, lstat, mkdtemp, readFile, realpath, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyPackagedZodRuntime } from "../scripts/verify-packaged-zod-runtime.mjs";

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = path.resolve(desktopRoot, "..", "..");
const coreRoot = path.join(workspaceRoot, "external", "sps-core");
const coreRequire = createRequire(path.join(coreRoot, "server", "package.json"));
const installedZodPackageJson = coreRequire.resolve("zod/package.json");
const installedZodRoot = path.dirname(installedZodPackageJson);

async function withRuntimeFixture(run) {
  const base = await realpath(os.tmpdir());
  const tempRoot = await mkdtemp(path.join(base, "sps-packaged-zod-test-"));
  const verifiedRoot = await realpath(tempRoot);
  assert.equal(path.dirname(verifiedRoot), base);
  assert.match(path.basename(verifiedRoot), /^sps-packaged-zod-test-/);
  const runtimeRoot = path.join(tempRoot, "runtime");
  const serverRoot = path.join(runtimeRoot, "node_modules", "@paperclipai", "server");
  await mkdir(path.join(serverRoot, "node_modules"), { recursive: true });
  await writeFile(path.join(serverRoot, "package.json"), '{"name":"@paperclipai/server","version":"1.0.0"}\n');
  await cp(installedZodRoot, path.join(serverRoot, "node_modules", "zod"), { recursive: true, dereference: true });
  try {
    return await run(runtimeRoot, path.join(serverRoot, "node_modules", "zod", "package.json"));
  } finally {
    const current = await lstat(tempRoot);
    const resolved = await realpath(tempRoot);
    assert.equal(current.isDirectory(), true);
    assert.equal(current.isSymbolicLink(), false);
    assert.equal(resolved, verifiedRoot);
    assert.equal(path.dirname(resolved), base);
    assert.match(path.basename(resolved), /^sps-packaged-zod-test-/);
    await rm(resolved, { recursive: true, force: false });
  }
}

test("verifies only the Core server's deployed Zod dependency across public entrypoints", async () => {
  await withRuntimeFixture(async runtimeRoot => {
    const result = await verifyPackagedZodRuntime(runtimeRoot);
    assert.deepEqual(result, {
      version: "3.25.76",
      issueLimit: 100,
      entrypoints: ["root ESM", "v3 ESM", "root CommonJS", "v3 CommonJS"],
    });
  });
});

test("requires an explicit absolute runtime root", async () => {
  await assert.rejects(verifyPackagedZodRuntime(), /absolute packaged Owner Host runtime root/);
  await assert.rejects(verifyPackagedZodRuntime("relative-runtime"), /absolute packaged Owner Host runtime root/);
});

test("rechecks replaced package code at the same path in a fresh verifier process", async () => {
  await withRuntimeFixture(async (runtimeRoot, packageJsonPath) => {
    await verifyPackagedZodRuntime(runtimeRoot);
    const packageRoot = path.dirname(packageJsonPath);
    for (const relative of ["v3/helpers/parseUtil.js", "v3/helpers/parseUtil.cjs"]) {
      const file = path.join(packageRoot, relative);
      const source = await readFile(file, "utf8");
      assert.ok(source.includes("const issueLimit = budget.limit ?? MAX_RETAINED_ISSUES"));
      await writeFile(file, source.replaceAll("const issueLimit = budget.limit ?? MAX_RETAINED_ISSUES", "const issueLimit = 1000000"));
    }
    await assert.rejects(verifyPackagedZodRuntime(runtimeRoot), /does not enforce the 100-issue budget/);
  });
});

test("rejects a missing packaged dependency instead of resolving outside runtimeRoot", async () => {
  await withRuntimeFixture(async (runtimeRoot, packageJsonPath) => {
    await rm(path.dirname(packageJsonPath), { recursive: true, force: false });
    await assert.rejects(verifyPackagedZodRuntime(runtimeRoot), /verification failed|cannot find|module not found/i);
  });
});
test("rejects a deployed Zod junction that escapes the explicit runtime root", async () => {
  await withRuntimeFixture(async (runtimeRoot, packageJsonPath) => {
    const deployedZodRoot = path.dirname(packageJsonPath);
    await rm(deployedZodRoot, { recursive: true, force: false });
    await symlink(installedZodRoot, deployedZodRoot, "junction");
    await assert.rejects(verifyPackagedZodRuntime(runtimeRoot), /Core server Zod dependency resolves outside the packaged runtime/);
  });
});

test("rejects a missing deployed Core server package manifest", async () => {
  await withRuntimeFixture(async (runtimeRoot, packageJsonPath) => {
    await rm(path.dirname(path.dirname(packageJsonPath)), { recursive: true, force: false });
    await assert.rejects(verifyPackagedZodRuntime(runtimeRoot), /Packaged Core Zod verification failed/);
  });
});
test("rejects a runtime package with a different manifest identity", async () => {
  await withRuntimeFixture(async (runtimeRoot, packageJsonPath) => {
    const serverPackageJsonPath = path.join(runtimeRoot, "node_modules", "@paperclipai", "server", "package.json");
    const manifest = JSON.parse(await readFile(serverPackageJsonPath, "utf8"));
    manifest.name = "other-package";
    await writeFile(serverPackageJsonPath, `${JSON.stringify(manifest)}\n`);
    await assert.rejects(verifyPackagedZodRuntime(runtimeRoot), /unexpected package name: other-package/);
  });
});
test("rejects a deployed Zod package with an unexpected version", async () => {
  await withRuntimeFixture(async (runtimeRoot, packageJsonPath) => {
    const manifest = JSON.parse(await readFile(packageJsonPath, "utf8"));
    manifest.version = "3.25.75";
    await writeFile(packageJsonPath, `${JSON.stringify(manifest)}\n`);
    await assert.rejects(verifyPackagedZodRuntime(runtimeRoot), /must resolve Zod 3\.25\.76/);
  });
});
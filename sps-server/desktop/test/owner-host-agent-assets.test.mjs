import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const SPS_SERVER_ROOT = path.resolve(TEST_DIRECTORY, "..", "..");
const WORKSPACE_ROOT = path.resolve(SPS_SERVER_ROOT, "..");
const CORE_ROOT = path.resolve(
  process.env.SPS_HOST_CORE_ROOT?.trim() || path.join(WORKSPACE_ROOT, "external", "sps-core"),
);
const CORE_SERVER_ROOT = path.join(CORE_ROOT, "server");
const TEMP_DIRECTORY_PREFIX = "sps-owner-host-agent-assets-";
const INSTRUCTION_ASSETS = [
  ["default", "AGENTS.md"],
  ["ceo", "AGENTS.md"],
  ["ceo", "HEARTBEAT.md"],
  ["ceo", "SOUL.md"],
  ["ceo", "TOOLS.md"],
];

function comparablePath(value) {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function assertTreeHasNoSymbolicLinks(root) {
  const entries = [root];
  while (entries.length > 0) {
    const entry = entries.pop();
    const info = await lstat(entry);
    assert.equal(info.isSymbolicLink(), false, `Unexpected symbolic link in owned temp tree: ${entry}`);
    if (!info.isDirectory()) continue;
    for (const child of await readdir(entry)) {
      entries.push(path.join(entry, child));
    }
  }
}

async function removeOwnedTempTree({ root, canonicalRoot, canonicalParent, identity }) {
  const currentCanonicalRoot = await realpath(root);
  const rootInfo = await lstat(root, { bigint: true });
  assert.equal(comparablePath(currentCanonicalRoot), comparablePath(canonicalRoot),
    "Refusing to remove a temp path whose canonical identity changed.");
  assert.equal(comparablePath(path.dirname(currentCanonicalRoot)), comparablePath(canonicalParent),
    "Refusing to remove a temp path outside its canonical parent.");
  assert.ok(path.basename(currentCanonicalRoot).startsWith(TEMP_DIRECTORY_PREFIX),
    "Refusing to remove a temp path without the expected owned prefix.");
  assert.ok(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(),
    "Refusing to remove a temp path that is no longer an owned directory.");
  assert.equal(rootInfo.dev, identity.dev);
  assert.equal(rootInfo.ino, identity.ino);
  assert.equal(rootInfo.birthtimeNs, identity.birthtimeNs);
  await assertTreeHasNoSymbolicLinks(currentCanonicalRoot);
  const finalIdentity = await lstat(root, { bigint: true });
  assert.equal(finalIdentity.dev, identity.dev);
  assert.equal(finalIdentity.ino, identity.ino);
  assert.equal(finalIdentity.birthtimeNs, identity.birthtimeNs);
  await rm(currentCanonicalRoot, { recursive: true, force: false });
}

test("Core build asset copying makes packaged default and CEO instructions loadable", async () => {
  const canonicalParent = await realpath(os.tmpdir());
  const root = await mkdtemp(path.join(canonicalParent, TEMP_DIRECTORY_PREFIX));
  const identity = await lstat(root, { bigint: true });
  let canonicalRoot;

  try {
    canonicalRoot = await realpath(root);
    assert.equal(comparablePath(path.dirname(canonicalRoot)), comparablePath(canonicalParent),
      "The owned fixture must be a direct child of the canonical temp directory.");
    assert.ok(path.basename(canonicalRoot).startsWith(TEMP_DIRECTORY_PREFIX));

    const fixtureServerRoot = path.join(canonicalRoot, "server");
    const fixtureSourceRoot = path.join(fixtureServerRoot, "src");
    const fixtureDistRoot = path.join(fixtureServerRoot, "dist");
    const fixtureScript = path.join(fixtureServerRoot, "scripts", "copy-build-assets.mjs");
    const corePackageJson = path.join(CORE_SERVER_ROOT, "package.json");
    const coreRequire = createRequire(corePackageJson);
    const typescript = coreRequire("typescript");

    const loaderSourcePath = path.join(CORE_SERVER_ROOT, "src", "services", "default-agent-instructions.ts");
    const loaderSource = await readFile(loaderSourcePath, "utf8");
    const transpiledLoader = typescript.transpileModule(loaderSource, {
      fileName: loaderSourcePath,
      compilerOptions: {
        module: typescript.ModuleKind.ESNext,
        target: typescript.ScriptTarget.ES2022,
      },
    }).outputText;
    const fixtureLoader = path.join(fixtureDistRoot, "services", "default-agent-instructions.mjs");
    await mkdir(path.dirname(fixtureLoader), { recursive: true });
    await writeFile(fixtureLoader, transpiledLoader, "utf8");

    const { loadDefaultAgentInstructionsBundle } = await import(pathToFileURL(fixtureLoader).href);
    await assert.rejects(loadDefaultAgentInstructionsBundle("default"), { code: "ENOENT" });

    const expectedBundles = { default: {}, ceo: {} };
    for (const [role, fileName] of INSTRUCTION_ASSETS) {
      const source = path.join(CORE_SERVER_ROOT, "src", "onboarding-assets", role, fileName);
      const sourceInfo = await lstat(source);
      assert.ok(sourceInfo.isFile() && !sourceInfo.isSymbolicLink(), `Expected a real Core source asset: ${source}`);
      const destination = path.join(fixtureSourceRoot, "onboarding-assets", role, fileName);
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(source, destination);
      expectedBundles[role][fileName] = await readFile(source, "utf8");
    }

    const builtInFixture = path.join(fixtureSourceRoot, "built-ins", "fixture-agent.json");
    const builtInContents = '{"name":"fixture-agent"}\n';
    await mkdir(path.dirname(builtInFixture), { recursive: true });
    await writeFile(builtInFixture, builtInContents, "utf8");

    const coreCopyScript = path.join(CORE_SERVER_ROOT, "scripts", "copy-build-assets.mjs");
    const copyScriptBytes = await readFile(coreCopyScript);
    await mkdir(path.dirname(fixtureScript), { recursive: true });
    await writeFile(fixtureScript, copyScriptBytes);
    assert.deepEqual(await readFile(fixtureScript), copyScriptBytes,
      "The fixture must execute the unmodified Core asset-copy script.");

    const child = spawnSync(process.execPath, [fixtureScript], {
      cwd: fixtureServerRoot,
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, `Core asset copy script failed.\n${child.stdout}\n${child.stderr}`);

    assert.deepEqual(await loadDefaultAgentInstructionsBundle("default"), expectedBundles.default);
    assert.deepEqual(await loadDefaultAgentInstructionsBundle("ceo"), expectedBundles.ceo);
    assert.equal(await readFile(path.join(fixtureDistRoot, "built-ins", "fixture-agent.json"), "utf8"),
      builtInContents);
  } finally {
    if (canonicalRoot) {
      await removeOwnedTempTree({ root, canonicalRoot, canonicalParent, identity });
    }
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, renameSync, rmSync,
  symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorkspaceE2eFixture } from "../scripts/workspace-e2e-fixture.mjs";
import { canonicalNativeSmokeDirectorySync } from "../src/native-identity-smoke-paths.mjs";

const TEST_DIRECTORY_PREFIX = "sps-workspace-e2e-fixture-test-";

function ownedTemporaryDirectory(t) {
  const created = mkdtempSync(path.join(os.tmpdir(), TEST_DIRECTORY_PREFIX));
  const directory = canonicalNativeSmokeDirectorySync(created);
  const stat = lstatSync(directory, { bigint: true });
  const identity = { dev: stat.dev, ino: stat.ino, birthtimeNs: stat.birthtimeNs };
  t.after(() => {
    const currentCanonical = canonicalNativeSmokeDirectorySync(directory);
    const current = lstatSync(currentCanonical, { bigint: true });
    assert.equal(currentCanonical, directory);
    assert.equal(current.isDirectory(), true);
    assert.equal(current.isSymbolicLink(), false);
    assert.equal(current.dev, identity.dev);
    assert.equal(current.ino, identity.ino);
    assert.equal(current.birthtimeNs, identity.birthtimeNs);
    rmSync(directory, { recursive: true });
  });
  return directory;
}

async function assertSafeFailure(operation, stage) {
  await assert.rejects(operation, error => {
    assert.equal(error.code, "ERR_WORKSPACE_E2E_FIXTURE");
    assert.equal(error.stage, stage);
    assert.equal(error.message, "Workspace E2E fixture operation failed.");
    assert.equal(error.message.includes(os.tmpdir()), false);
    return true;
  });
}

function createLinkOrSkip(t, target, link, type) {
  try {
    symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip("This filesystem or process does not support creating the link fixture.");
      return false;
    }
    throw error;
  }
}

test("creates and removes only its owned canonical fixture directory", async t => {
  const temporaryDirectory = ownedTemporaryDirectory(t);
  const sibling = path.join(temporaryDirectory, "keep-this-sibling");
  writeFileSync(sibling, "outside fixture");

  const fixture = await createWorkspaceE2eFixture({ temporaryDirectory });
  assert.equal(Object.isFrozen(fixture), true);
  assert.equal(path.dirname(fixture.directory), temporaryDirectory);
  assert.equal(path.basename(fixture.directory).startsWith("sps-workspace-surfaces-e2e-"), true);
  assert.equal(await fixture.assertCurrent(), true);
  writeFileSync(path.join(fixture.directory, "owned-data"), "owned");

  await fixture.remove();
  assert.equal(lstatSync(sibling).isFile(), true);
  assert.equal(readdirSync(temporaryDirectory).includes(path.basename(fixture.directory)), false);
  await fixture.remove();
});

test("rejects hostile options and throwing temporary-directory getters with fixed safe errors", async () => {
  let getterCalls = 0;
  const hostileGetter = { get temporaryDirectory() {
    getterCalls += 1;
    throw new Error("C:\\private\\absolute\\path");
  } };
  const hostileProxy = new Proxy({ unexpected: true }, { get() { throw new Error("/private/absolute/path"); } });
  const nonThrowingGetter = { get temporaryDirectory() { getterCalls += 1; return os.tmpdir(); } };
  const symbolOption = { [Symbol("temporaryDirectory")]: os.tmpdir() };
  const inheritedOption = Object.create({ temporaryDirectory: os.tmpdir() });
  for (const options of [null, 7, "not-options", hostileGetter, nonThrowingGetter, hostileProxy,
    [], () => {}, symbolOption, inheritedOption, { temporaryDirectory: os.tmpdir(), extra: true },
    { temporaryDirectory: 42 }, { temporaryDirectory: { toString() { throw new Error("must not run"); } } },
    { temporaryDirectory: "" }, { temporaryDirectory: "." }]) {
    await assertSafeFailure(createWorkspaceE2eFixture(options), "arguments");
  }
  assert.equal(getterCalls, 0);
});

test("rejects a replaced fixture root and preserves the replacement and moved original", async t => {
  const temporaryDirectory = ownedTemporaryDirectory(t);
  const fixture = await createWorkspaceE2eFixture({ temporaryDirectory });
  const movedOriginal = path.join(temporaryDirectory, "moved-original");
  renameSync(fixture.directory, movedOriginal);
  writeFileSync(path.join(movedOriginal, "original-marker"), "original");
  mkdirSync(fixture.directory);
  const replacementMarker = path.join(fixture.directory, "replacement-marker");
  writeFileSync(replacementMarker, "replacement");

  await assertSafeFailure(fixture.assertCurrent(), "assert-current");
  await assertSafeFailure(fixture.remove(), "assert-current");
  assert.equal(lstatSync(replacementMarker).isFile(), true);
  assert.equal(lstatSync(path.join(movedOriginal, "original-marker")).isFile(), true);
});

test("rejects a replaced temporary root and preserves the replacement", async t => {
  const sandbox = ownedTemporaryDirectory(t);
  const temporaryDirectory = path.join(sandbox, "owned-temp");
  mkdirSync(temporaryDirectory);
  const fixture = await createWorkspaceE2eFixture({ temporaryDirectory });
  const movedTemporaryDirectory = path.join(sandbox, "moved-temp");
  renameSync(temporaryDirectory, movedTemporaryDirectory);
  mkdirSync(temporaryDirectory);
  const replacementMarker = path.join(temporaryDirectory, "replacement-marker");
  writeFileSync(replacementMarker, "replacement");

  await assertSafeFailure(fixture.assertCurrent(), "assert-current");
  await assertSafeFailure(fixture.remove(), "assert-current");
  assert.equal(lstatSync(replacementMarker).isFile(), true);
  assert.throws(() => lstatSync(fixture.directory), { code: "ENOENT" });
  assert.equal(lstatSync(path.join(movedTemporaryDirectory, path.basename(fixture.directory))).isDirectory(), true);
});

test("rejects a directory symlink as the temporary directory and as an ancestor", async t => {
  const sandbox = ownedTemporaryDirectory(t);
  const realTemporaryDirectory = path.join(sandbox, "real-temp");
  mkdirSync(path.join(realTemporaryDirectory, "child"), { recursive: true });
  const link = path.join(sandbox, "linked-temp");
  if (!createLinkOrSkip(t, realTemporaryDirectory, link, "dir")) return;
  const before = readdirSync(sandbox).sort();

  await assertSafeFailure(createWorkspaceE2eFixture({ temporaryDirectory: link }), "temporary-directory");
  await assertSafeFailure(createWorkspaceE2eFixture({ temporaryDirectory: path.join(link, "child") }),
    "temporary-directory");
  assert.deepEqual(readdirSync(sandbox).sort(), before);
});

test("rejects a Windows junction as the temporary directory and as an ancestor", {
  skip: process.platform !== "win32",
}, async t => {
  const sandbox = ownedTemporaryDirectory(t);
  const realTemporaryDirectory = path.join(sandbox, "real-temp");
  mkdirSync(path.join(realTemporaryDirectory, "child"), { recursive: true });
  const junction = path.join(sandbox, "junction-temp");
  if (!createLinkOrSkip(t, realTemporaryDirectory, junction, "junction")) return;
  const before = readdirSync(sandbox).sort();

  await assertSafeFailure(createWorkspaceE2eFixture({ temporaryDirectory: junction }), "temporary-directory");
  await assertSafeFailure(createWorkspaceE2eFixture({ temporaryDirectory: path.join(junction, "child") }),
    "temporary-directory");
  assert.deepEqual(readdirSync(sandbox).sort(), before);
});

test("accepts an actual Windows 8.3 alias for its temporary directory", {
  skip: process.platform !== "win32",
}, async t => {
  const temporaryDirectory = ownedTemporaryDirectory(t);
  const canonicalTemporaryDirectory = realpathSync.native(temporaryDirectory);
  if (!/^[A-Za-z]:\\[A-Za-z0-9 ._\\-]+$/.test(temporaryDirectory)) {
    t.skip("The temp path is not safe ASCII for the read-only short-path command.");
    return;
  }
  const alias = execFileSync("cmd.exe", ["/d", "/c", `for %I in ("${temporaryDirectory}") do @echo %~sI`], {
    encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 4096,
  }).trim();
  assert.equal(alias.includes("\n") || alias.includes("\r"), false);
  assert.equal(path.isAbsolute(alias), true);
  if (!/\b[A-Za-z0-9_-]+~[0-9]+\b/.test(alias) || alias.toLowerCase() === temporaryDirectory.toLowerCase()) {
    t.skip("No distinct Windows 8.3 alias is available for the temp directory.");
    return;
  }

  const fixture = await createWorkspaceE2eFixture({ temporaryDirectory: alias });
  assert.equal(path.dirname(fixture.directory), canonicalTemporaryDirectory);
  assert.equal(realpathSync.native(alias), canonicalTemporaryDirectory);
  assert.equal(await fixture.assertCurrent(), true);
  await fixture.remove();
});

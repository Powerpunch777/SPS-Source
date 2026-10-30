import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalNativeSmokeDirectorySync } from "../src/native-identity-smoke-paths.mjs";

const prefix = "sps-native-smoke-paths-canonical-";

function assertNoLinks(directory) {
  for (const name of readdirSync(directory)) {
    const child = path.join(directory, name);
    const stat = lstatSync(child);
    assert.equal(stat.isSymbolicLink(), false, "Refusing cleanup through a fixture link.");
    if (stat.isDirectory()) assertNoLinks(child);
  }
}

function fixture(t) {
  const temporaryRoot = mkdtempSync(path.join(os.tmpdir(), prefix));
  const originalStat = lstatSync(temporaryRoot);
  const root = realpathSync.native(temporaryRoot);
  const temporaryParent = realpathSync.native(os.tmpdir());
  const links = new Map();
  function assertOwnedRoot() {
    const stat = lstatSync(root);
    const canonical = realpathSync.native(root);
    const relative = path.relative(temporaryParent, canonical);
    assert.equal(stat.isSymbolicLink(), false);
    assert.equal(stat.isDirectory(), true);
    assert.equal(canonical, root);
    assert.equal(stat.dev, originalStat.dev);
    assert.equal(stat.ino, originalStat.ino);
    assert.equal(path.isAbsolute(relative), false);
    assert.equal(path.dirname(relative), ".");
    assert.equal(relative.startsWith(prefix), true);
    assert.equal(realpathSync.native(path.dirname(root)), temporaryParent);
  }
  t.after(() => {
    assertOwnedRoot();
    for (const [link, original] of links) {
      assert.equal(path.dirname(link), root);
      assert.equal(realpathSync.native(path.dirname(link)), root);
      const stat = lstatSync(link);
      assert.equal(stat.isSymbolicLink(), true);
      assert.equal(stat.dev, original.dev);
      assert.equal(stat.ino, original.ino);
      unlinkSync(link);
    }
    assertNoLinks(root);
    assertOwnedRoot();
    rmSync(root, { recursive: true });
  });
  assertOwnedRoot();
  return {
    root,
    registerLink(link) {
      assert.equal(path.dirname(link), root);
      const stat = lstatSync(link);
      assert.equal(stat.isSymbolicLink(), true);
      links.set(link, stat);
    },
  };
}

function createFixtureLink(t, paths, target, type) {
  const link = path.join(paths.root, `linked-${type}`);
  try {
    symlinkSync(target, link, type);
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.skip("This filesystem or process does not support creating the fixture link.");
      return null;
    }
    throw error;
  }
  paths.registerLink(link);
  return link;
}

test("canonicalizes owned directories with native realpath and matches async realpath", async t => {
  const { root } = fixture(t);
  const child = path.join(root, "owned-long-directory-name");
  mkdirSync(child);
  for (const directory of [root, child]) {
    assert.equal(canonicalNativeSmokeDirectorySync(directory), realpathSync.native(directory));
    assert.equal(canonicalNativeSmokeDirectorySync(directory), await realpath(directory));
  }
  assert.equal(canonicalNativeSmokeDirectorySync(path.join(child, "..", path.basename(child))), child);
});

test("rejects a missing directory", t => {
  const { root } = fixture(t);
  assert.throws(() => canonicalNativeSmokeDirectorySync(path.join(root, "missing")), { code: "ENOENT" });
});

test("rejects a regular file and a file ancestor", t => {
  const { root } = fixture(t);
  const file = path.join(root, "not-a-directory");
  writeFileSync(file, "owned fixture", { flag: "wx" });
  assert.throws(() => canonicalNativeSmokeDirectorySync(file), /linked or non-directory/);
  assert.throws(() => canonicalNativeSmokeDirectorySync(path.join(file, "child")));
});

test("rejects a directory symbolic link and a linked ancestor", t => {
  const paths = fixture(t);
  const target = path.join(paths.root, "target-directory");
  mkdirSync(path.join(target, "child"), { recursive: true });
  const link = createFixtureLink(t, paths, target, "dir");
  if (!link) return;
  assert.throws(() => canonicalNativeSmokeDirectorySync(link), /linked or non-directory/);
  assert.throws(() => canonicalNativeSmokeDirectorySync(path.join(link, "child")), /linked or non-directory/);
});

test("rejects a file symbolic link", t => {
  const paths = fixture(t);
  const target = path.join(paths.root, "target-file");
  writeFileSync(target, "owned fixture", { flag: "wx" });
  const link = createFixtureLink(t, paths, target, "file");
  if (!link) return;
  assert.throws(() => canonicalNativeSmokeDirectorySync(link), /linked or non-directory/);
});

test("rejects a Windows junction and a junction ancestor", { skip: process.platform !== "win32" }, t => {
  const paths = fixture(t);
  const target = path.join(paths.root, "junction-target");
  mkdirSync(path.join(target, "child"), { recursive: true });
  const link = createFixtureLink(t, paths, target, "junction");
  if (!link) return;
  assert.throws(() => canonicalNativeSmokeDirectorySync(link), /linked or non-directory/);
  assert.throws(() => canonicalNativeSmokeDirectorySync(path.join(link, "child")), /linked or non-directory/);
});

test("canonicalizes an actual Windows 8.3 alias with native realpath", { skip: process.platform !== "win32" }, async t => {
  const { root } = fixture(t);
  if (!/^[A-Za-z]:\\[A-Za-z0-9 ._\\-]+$/.test(root)) {
    t.skip("The owned temporary path is not safe ASCII for the read-only short-path command; alias coverage not exercised.");
    return;
  }
  const alias = execFileSync("cmd.exe", ["/d", "/c", `for %I in ("${root}") do @echo %~sI`], {
    encoding: "utf8", windowsHide: true, timeout: 5_000, maxBuffer: 4096,
  }).trim();
  assert.equal(alias.includes("\n") || alias.includes("\r"), false);
  assert.equal(path.isAbsolute(alias), true);
  if (!/\b[A-Za-z0-9_-]+~[0-9]+\b/.test(alias) || alias.toLowerCase() === root.toLowerCase()) {
    t.skip("No distinct Windows 8.3 alias is available for the owned fixture; alias coverage not exercised.");
    return;
  }
  const original = lstatSync(root);
  const aliased = lstatSync(alias);
  assert.equal(aliased.isDirectory(), true);
  assert.equal(aliased.isSymbolicLink(), false);
  assert.equal(aliased.dev, original.dev);
  assert.equal(aliased.ino, original.ino);
  assert.equal(realpathSync.native(alias), root);
  assert.equal(canonicalNativeSmokeDirectorySync(alias), realpathSync.native(root));
  assert.equal(canonicalNativeSmokeDirectorySync(alias), await realpath(alias));
  t.diagnostic("Actual Windows 8.3 alias exercised; native synchronous and asynchronous canonical paths agree.");
});

import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rename, rm, rmdir, symlink, link, realpath, lstat } from "node:fs/promises";
import { captureInstallerSnapshot, assertInstallerSnapshot } from "../scripts/installer-retained-snapshot.mjs";

async function fixture(t, temporaryDirectory = os.tmpdir()) {
  const canonicalTemporaryDirectory = await realpath(temporaryDirectory);
  const parent = await mkdtemp(path.join(canonicalTemporaryDirectory, "sps-installer-snapshot-"));
  const owned = await lstat(parent, { bigint: true });
  const root = path.join(parent, "root");
  await mkdir(root);
  t.after(async () => {
    assert.equal(await realpath(parent), parent);
    const details = await lstat(parent, { bigint: true });
    assert.ok(details.isDirectory() && !details.isSymbolicLink());
    assert.equal(details.dev, owned.dev);
    assert.equal(details.ino, owned.ino);
    assert.equal(details.birthtimeNs, owned.birthtimeNs);
    await rm(parent, { recursive: true, force: true });
  });
  return { parent, root };
}

test("fixture canonicalizes an available Windows 8.3 temporary-directory alias", {
  skip: process.platform !== "win32",
}, async t => {
  const temporaryDirectory = await realpath(os.tmpdir());
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

  const { parent } = await fixture(t, alias);
  assert.equal(path.dirname(parent), temporaryDirectory);
  assert.equal(await realpath(alias), temporaryDirectory);
});

test("unchanged trees pass and digest is independent of directory enumeration order", async t => {
  const { root } = await fixture(t);
  await mkdir(path.join(root, "empty"));
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "z.txt"), "same bytes");
  await writeFile(path.join(root, "nested", "a.txt"), "other");
  const first = await captureInstallerSnapshot(root);
  const second = await captureInstallerSnapshot(root);
  assert.deepEqual(second, first);
  assert.equal(await assertInstallerSnapshot(root, first), true);
  assert.deepEqual(first.directories.map(entry => entry.path), [".", "empty", "nested"]);
});

test("modified content, filename, file set, and empty directories fail comparison", async t => {
  const { root } = await fixture(t);
  const file = path.join(root, "data.bin");
  await writeFile(file, "abcd");
  const original = await captureInstallerSnapshot(root);
  await writeFile(file, "wxyz");
  await assert.rejects(assertInstallerSnapshot(root, original), /Installer snapshot is unavailable/);
  await writeFile(file, "abcd");
  const restored = await captureInstallerSnapshot(root);
  await rename(file, path.join(root, "renamed.bin"));
  await assert.rejects(assertInstallerSnapshot(root, restored), /Installer snapshot is unavailable/);
  await rename(path.join(root, "renamed.bin"), file);
  await mkdir(path.join(root, "new-empty"));
  await assert.rejects(assertInstallerSnapshot(root, restored), /Installer snapshot is unavailable/);
  await rmdir(path.join(root, "new-empty"));
  await writeFile(path.join(root, "added"), "x");
  await assert.rejects(assertInstallerSnapshot(root, restored), /Installer snapshot is unavailable/);
});

test("rejects symbolic links, junctions, and hard-linked files", async t => {
  const { parent, root } = await fixture(t);
  const target = path.join(parent, "target");
  await mkdir(target);
  await symlink(target, path.join(root, "junction"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(captureInstallerSnapshot(root), /Installer snapshot is unavailable/);
  await rm(path.join(root, "junction"));
  await writeFile(path.join(root, "source"), "x");
  await link(path.join(root, "source"), path.join(root, "hardlink"));
  await assert.rejects(captureInstallerSnapshot(root), /Installer snapshot is unavailable/);
});

test("rejects a replaced root and enforces entry, byte, depth, and timeout bounds", async t => {
  const { parent, root } = await fixture(t);
  await writeFile(path.join(root, "small"), "1234");
  const snapshot = await captureInstallerSnapshot(root);
  const moved = path.join(parent, "old-root");
  await rename(root, moved);
  await mkdir(root);
  await writeFile(path.join(root, "small"), "1234");
  await assert.rejects(assertInstallerSnapshot(root, snapshot), /Installer snapshot is unavailable/);
  await assert.rejects(captureInstallerSnapshot(root, { maxEntries: 1 }), /Installer snapshot is unavailable/);
  await assert.rejects(captureInstallerSnapshot(root, { maxBytes: 3 }), /Installer snapshot is unavailable/);
  await assert.rejects(captureInstallerSnapshot(root, { timeoutMs: 0 }), /Installer snapshot is unavailable/);
  await assert.rejects(captureInstallerSnapshot(root, { timeoutMs: 120001 }), /Installer snapshot is unavailable/);
  await assert.rejects(captureInstallerSnapshot(root, { maxEntries: 100001 }), /Installer snapshot is unavailable/);
  await assert.rejects(captureInstallerSnapshot(root, { maxBytes: 4 * 1024 ** 3 + 1 }), /Installer snapshot is unavailable/);
  for (let index = 0; index < 100; index++) await writeFile(path.join(root, `timeout-${index}`), "x");
  await assert.rejects(captureInstallerSnapshot(root, { timeoutMs: 1 }), /Installer snapshot is unavailable/);
  let deep = root;
  for (let i = 0; i < 65; i++) { deep = path.join(deep, "d"); await mkdir(deep); }
  await assert.rejects(captureInstallerSnapshot(root), /Installer snapshot is unavailable/);
});

test("errors never disclose paths or file contents", async t => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, "private-name"), "private-content");
  const error = await captureInstallerSnapshot(root, { maxBytes: 1 }).then(() => null, caught => caught);
  assert.equal(error.message, "Installer snapshot is unavailable.");
  assert.doesNotMatch(error.message, /private-name|private-content|sps-installer-snapshot/);
  for (const invalid of ["relative-fixture", "", null, `${root}\n`]) {
    await assert.rejects(captureInstallerSnapshot(invalid), /Installer snapshot is unavailable/);
  }
});

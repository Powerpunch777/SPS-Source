import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile, rename, rm, rmdir, symlink, link, realpath, lstat } from "node:fs/promises";
import { captureInstallerSnapshot, assertInstallerSnapshot } from "../scripts/installer-retained-snapshot.mjs";

async function fixture(t) {
  const parent = await mkdtemp(path.join(os.tmpdir(), "sps-installer-snapshot-"));
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

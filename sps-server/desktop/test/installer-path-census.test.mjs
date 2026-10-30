import test from "node:test";
import assert from "node:assert/strict";
import { link, lstat, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectInstallerPathCensus } from "../scripts/installer-path-census.mjs";

async function fixture(t) {
  const parent = await realpath(os.tmpdir());
  const root = path.resolve(await mkdtemp(path.join(parent, "sps-installer-census-")));
  const canonical = await realpath(root);
  const identity = await lstat(root, { bigint: true });
  assert.equal(canonical, root);
  t.after(async () => {
    const info = await lstat(root, { bigint: true });
    assert.ok(info.isDirectory() && !info.isSymbolicLink());
    assert.equal(path.dirname(root), parent);
    assert.equal(await realpath(os.tmpdir()), parent);
    assert.match(path.basename(root), /^sps-installer-census-[a-z0-9]+$/i);
    assert.equal(info.dev, identity.dev);
    assert.equal(info.ino, identity.ino);
    assert.equal(info.birthtimeNs, identity.birthtimeNs);
    assert.equal(await realpath(root), canonical);
    await rm(root, { recursive: true, force: false });
  });
  return root;
}

test("counts a plain tree and returns only fixed JSON-safe measurements", async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, "nested"));
  await writeFile(path.join(root, "one.txt"), "one");
  await writeFile(path.join(root, "nested", "two.txt"), "two");
  const census = await collectInstallerPathCensus(root);
  assert.deepEqual(census, {
    files: 2, directories: 2, links: 0, hardlinkedFiles: 0,
    maxAbsolutePathLength: Math.max(root.length + 7, root.length + 15),
    maxRelativePathLength: 14, over259Paths: 0, complete: true, truncatedReason: null,
  });
  const serialized = JSON.stringify(census);
  assert.doesNotMatch(serialized, /one\.txt|two\.txt|sps-installer-census/);
});

test("bounds entry and depth traversal", async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, "a", "b"), { recursive: true });
  await writeFile(path.join(root, "first"), "x");
  const entries = await collectInstallerPathCensus(root, { maxEntries: 1 });
  assert.equal(entries.complete, false);
  assert.equal(entries.truncatedReason, "entry-limit");
  const depth = await collectInstallerPathCensus(root, { maxDepth: 1 });
  assert.equal(depth.complete, false);
  assert.equal(depth.truncatedReason, "depth-limit");
  assert.ok(depth.files <= 1);
});

test("does not descend through directory symlinks or junctions", async t => {
  const root = await fixture(t);
  const scanRoot = path.join(root, "scan");
  const outside = path.join(root, "outside");
  const linked = path.join(scanRoot, "linked");
  await mkdir(scanRoot);
  await mkdir(outside);
  await writeFile(path.join(outside, "private-name"), "x");
  try { await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { t.skip(`Directory links unavailable (${error.code ?? "unknown"}).`); return; }
  const census = await collectInstallerPathCensus(scanRoot);
  assert.equal(census.links, 1);
  assert.equal(census.files, 0);
  assert.equal(census.complete, false);
  assert.equal(census.truncatedReason, "link");
  assert.doesNotMatch(JSON.stringify(census), /private-name/);
});

test("rejects invalid limits and reports root failures without filesystem details", async t => {
  const root = await fixture(t);
  for (const options of [
    { maxEntries: 0 }, { maxEntries: 1.5 }, { maxEntries: 1_000_001 },
    { maxDepth: 257 }, { timeoutMs: Infinity }, { timeoutMs: 0 },
  ]) await assert.rejects(collectInstallerPathCensus(root, options), TypeError);
  const missing = path.join(root, "secret-missing-root");
  await assert.rejects(collectInstallerPathCensus(missing), error => {
    assert.equal(error.message, "Invalid census root.");
    assert.doesNotMatch(error.message, /secret-missing-root|ENOENT/);
    return true;
  });
});

test("measures long paths and hardlinked files without reading their contents", async t => {
  const root = await fixture(t);
  const nested = path.join(root, "a".repeat(100), "b".repeat(100));
  await mkdir(nested, { recursive: true });
  const file = path.join(nested, "c".repeat(60));
  const alias = path.join(root, "private-alias-canary");
  await writeFile(file, "private-content-canary");
  await link(file, alias);
  const census = await collectInstallerPathCensus(root);
  assert.equal(census.complete, true);
  assert.equal(census.maxAbsolutePathLength, file.length);
  assert.equal(census.maxRelativePathLength, path.relative(root, file).length);
  assert.ok(census.over259Paths >= 1);
  assert.equal(census.hardlinkedFiles, 2);
  assert.doesNotMatch(JSON.stringify(census), /private-content-canary|private-alias-canary|a{10}|b{10}|c{10}/);
});

test("an expired time budget does not start a new filesystem operation", async t => {
  const root = await fixture(t);
  let now = 0;
  t.mock.method(Date, "now", () => { now += 2; return now; });
  const census = await collectInstallerPathCensus(root, { timeoutMs: 1 });
  assert.equal(census.complete, false);
  assert.equal(census.truncatedReason, "timeout");
  assert.equal(census.files, 0);
  assert.equal(census.directories, 0);
});

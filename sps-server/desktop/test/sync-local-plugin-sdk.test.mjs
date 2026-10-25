import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { synchronizeLocalPluginSdk } from "../scripts/sync-local-plugin-sdk.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-sdk-sync-test-"));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("sps-sdk-sync-test-"));
    await rm(root, { recursive: true, force: true });
  });
  const desktopRoot = path.join(root, "sps-server", "desktop");
  const source = path.join(root, "external", "sps-plugin-sdk");
  const target = path.join(desktopRoot, "node_modules", "@sonparkserver", "plugin-sdk");
  const meta = { name: "@sonparkserver/plugin-sdk", version: "0.11.0", dependencies: { example: "1.0.0" } };
  for (const directory of [source, target]) {
    await mkdir(path.join(directory, "worker"), { recursive: true });
    await writeFile(path.join(directory, "package.json"), JSON.stringify(meta));
  }
  await writeFile(path.join(source, "worker/index.mjs"), "export const actions = true;");
  await writeFile(path.join(target, "worker/index.mjs"), "export const actions = false;");
  return { root, desktopRoot, source, target, meta };
}

test("detects a stale SDK with the same package version without mutating check-only mode", async t => {
  const f = await fixture(t);
  await assert.rejects(synchronizeLocalPluginSdk({ desktopRoot: f.desktopRoot, checkOnly: true }), /stale/);
  assert.match(await readFile(path.join(f.target, "worker/index.mjs"), "utf8"), /false/);
});

test("repairs exact public source bytes and removes obsolete files without copying caches or git metadata", async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.target, "worker/obsolete.mjs"), "old");
  await writeFile(path.join(f.source, ".git"), "private worktree metadata");
  await mkdir(path.join(f.source, ".npm-cache"));
  await writeFile(path.join(f.source, ".npm-cache", "cache"), "not distributable");
  assert.deepEqual(await synchronizeLocalPluginSdk({ desktopRoot: f.desktopRoot }), { changed: true });
  assert.match(await readFile(path.join(f.target, "worker/index.mjs"), "utf8"), /true/);
  await assert.rejects(access(path.join(f.target, "worker/obsolete.mjs")));
  await assert.rejects(access(path.join(f.target, ".git")));
  await assert.rejects(access(path.join(f.target, ".npm-cache")));
  assert.deepEqual(await synchronizeLocalPluginSdk({ desktopRoot: f.desktopRoot, checkOnly: true }), { changed: false });
});

test("does not hide a changed dependency graph by copying source over an old install", async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.source, "package.json"), JSON.stringify({ ...f.meta, dependencies: { example: "2.0.0" } }));
  await assert.rejects(synchronizeLocalPluginSdk({ desktopRoot: f.desktopRoot }), /dependency graph changed/);
  assert.match(await readFile(path.join(f.target, "worker/index.mjs"), "utf8"), /false/);
});

test("refuses an SDK junction outside the canonical checkout and preserves its target", async t => {
  const f = await fixture(t);
  const outside = path.join(f.root, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "sentinel"), "keep");
  await rm(f.target, { recursive: true });
  await symlink(outside, f.target, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(synchronizeLocalPluginSdk({ desktopRoot: f.desktopRoot }), /outside the canonical/);
  assert.equal(await readFile(path.join(outside, "sentinel"), "utf8"), "keep");
});

test("refuses linked package parents rather than recursively replacing external files", async t => {
  const f = await fixture(t);
  const parent = path.dirname(f.target);
  await rm(parent, { recursive: true });
  await symlink(f.source, parent, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(synchronizeLocalPluginSdk({ desktopRoot: f.desktopRoot }), /parent must not/);
  assert.match(await readFile(path.join(f.source, "worker/index.mjs"), "utf8"), /true/);
});

test("sync runs before development, Desktop tests, packaging and every Electron acceptance suite", async () => {
  const { scripts } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  for (const key of ["prestart", "predev", "pretest", "prepare:owner-host-runtime", ...Object.keys(scripts).filter(key => key.startsWith("test:e2e:"))]) {
    assert.match(scripts[key], /sync:plugin-sdk/, `${key} does not synchronize the public SDK`);
  }
});

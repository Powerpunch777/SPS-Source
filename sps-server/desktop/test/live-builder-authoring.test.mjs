import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildLiveBuilderPrompt,
  collectAuthoringSnapshot,
  verifyLiveBuilderChanges,
} from "../scripts/live-builder-authoring.mjs";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const digest = (text) => createHash("sha256").update(text).digest("hex");

async function temporaryDirectory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "live-builder-authoring-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("snapshot hashes regular files deterministically without returning contents", async (t) => {
  const root = await temporaryDirectory(t);
  await mkdir(path.join(root, "dist", "ui"), { recursive: true });
  await writeFile(path.join(root, "dist", "ui", "index.js"), "export const value = 1;\n");
  await writeFile(path.join(root, "package.json"), "{\"files\":[\"dist/ui\"]}\n");

  const first = await collectAuthoringSnapshot(root);
  const second = await collectAuthoringSnapshot(root);
  assert.deepEqual(first, second);
  assert.deepEqual(Object.keys(first), ["dist/ui/index.js", "package.json"]);
  assert.equal(first["dist/ui/index.js"], digest("export const value = 1;\n"));
  assert.ok(Object.values(first).every((value) => /^[a-f0-9]{64}$/.test(value)));
  assert.equal(JSON.stringify(first).includes("export const"), false);

  await writeFile(path.join(root, "dist", "ui", "index.js"), "export const value = 2;\n");
  const changed = await collectAuthoringSnapshot(root);
  assert.notEqual(changed["dist/ui/index.js"], first["dist/ui/index.js"]);
  assert.equal(changed["package.json"], first["package.json"]);
});

test("snapshot omits only root node_modules and .git, including an SDK junction", async (t) => {
  const root = await temporaryDirectory(t);
  const sdkTarget = await temporaryDirectory(t);
  await writeFile(path.join(sdkTarget, "sdk.js"), "sdk source");
  await mkdir(path.join(root, ".git"));
  await writeFile(path.join(root, ".git", "config"), "repository metadata");
  const linkKind = process.platform === "win32" ? "junction" : "dir";
  try {
    await symlink(sdkTarget, path.join(root, "node_modules"), linkKind);
  } catch (error) {
    t.skip(`Could not create the SDK junction fixture: ${error.code || error.message}`);
    return;
  }
  await writeFile(path.join(root, "package.json"), "{}\n");

  assert.deepEqual(await collectAuthoringSnapshot(root), { "package.json": digest("{}\n") });
});

test("snapshot rejects linked project entries instead of traversing them", async (t) => {
  const root = await temporaryDirectory(t);
  const external = await temporaryDirectory(t);
  const outsideFile = path.join(external, "outside.js");
  await writeFile(outsideFile, "outside");
  try {
    await symlink(outsideFile, path.join(root, "linked.js"), process.platform === "win32" ? "file" : undefined);
  } catch (error) {
    t.skip(`Could not create the linked-file fixture: ${error.code || error.message}`);
    return;
  }
  await assert.rejects(collectAuthoringSnapshot(root), /linked entry/);
});

test("snapshot enforces the file-count and per-file byte limits", async (t) => {
  const root = await temporaryDirectory(t);
  for (let index = 0; index < 256; index += 1) {
    await writeFile(path.join(root, `file-${String(index).padStart(3, "0")}.txt`), "");
  }
  assert.equal(Object.keys(await collectAuthoringSnapshot(root)).length, 256);
  await writeFile(path.join(root, "file-256.txt"), "");
  await assert.rejects(collectAuthoringSnapshot(root), /file-count limit/);

  const sizeRoot = await temporaryDirectory(t);
  await writeFile(path.join(sizeRoot, "bounded.bin"), Buffer.alloc(MAX_FILE_BYTES));
  assert.equal(Object.keys(await collectAuthoringSnapshot(sizeRoot)).length, 1);
  await writeFile(path.join(sizeRoot, "bounded.bin"), Buffer.alloc(MAX_FILE_BYTES + 1));
  await assert.rejects(collectAuthoringSnapshot(sizeRoot), /size limit/);
});

test("snapshot bounds nested depth and total directories, including empty trees", async (t) => {
  const deepRoot = await temporaryDirectory(t);
  let deepest = deepRoot;
  for (let depth = 0; depth < 32; depth += 1) {
    deepest = path.join(deepest, "d");
    await mkdir(deepest);
  }
  assert.deepEqual(await collectAuthoringSnapshot(deepRoot), {});
  await mkdir(path.join(deepest, "d"));
  await assert.rejects(collectAuthoringSnapshot(deepRoot), /directory-depth limit/);

  const wideRoot = await temporaryDirectory(t);
  for (let index = 0; index < 511; index += 1) {
    await mkdir(path.join(wideRoot, `dir-${String(index).padStart(3, "0")}`));
  }
  assert.deepEqual(await collectAuthoringSnapshot(wideRoot), {});
  await mkdir(path.join(wideRoot, "dir-511"));
  await assert.rejects(collectAuthoringSnapshot(wideRoot), /directory-count limit/);
});

test("snapshot enforces the aggregate byte limit", async (t) => {
  const root = await temporaryDirectory(t);
  for (let index = 0; index < 4; index += 1) {
    await writeFile(path.join(root, `part-${index}.bin`), Buffer.alloc(MAX_FILE_BYTES));
  }
  assert.equal(Object.keys(await collectAuthoringSnapshot(root)).length, 4);
  await writeFile(path.join(root, "part-4.bin"), "x");
  await assert.rejects(collectAuthoringSnapshot(root), /total snapshot size limit/);
});

test("verifier returns the sorted exact four-file authoring diff", () => {
  const before = {
    "dist/manifest.js": "1".repeat(64),
    "package.json": "2".repeat(64),
    "sps-plugin.json": "3".repeat(64),
    "worker.js": "4".repeat(64),
  };
  const after = {
    "dist/manifest.js": "5".repeat(64),
    "dist/ui/index.js": "6".repeat(64),
    "package.json": "7".repeat(64),
    "sps-plugin.json": "8".repeat(64),
    "worker.js": before["worker.js"],
  };
  assert.deepEqual(verifyLiveBuilderChanges(before, after), [
    "dist/manifest.js",
    "dist/ui/index.js",
    "package.json",
    "sps-plugin.json",
  ]);
});

test("verifier rejects unexpected additions or modifications, deletions, and incomplete authoring", () => {
  const before = {
    "dist/manifest.js": "1".repeat(64),
    "package.json": "2".repeat(64),
    "sps-plugin.json": "3".repeat(64),
    "worker.js": "4".repeat(64),
  };
  const complete = {
    "dist/manifest.js": "5".repeat(64),
    "dist/ui/index.js": "6".repeat(64),
    "package.json": "7".repeat(64),
    "sps-plugin.json": "8".repeat(64),
    "worker.js": before["worker.js"],
  };

  assert.throws(() => verifyLiveBuilderChanges(before, { ...complete, "notes.txt": "9".repeat(64) }), /outside the allowlist/);
  assert.throws(() => verifyLiveBuilderChanges(before, { ...complete, "worker.js": "9".repeat(64) }), /outside the allowlist/);
  const deleted = { ...complete };
  delete deleted["worker.js"];
  assert.throws(() => verifyLiveBuilderChanges(before, deleted), /deleted a project file/);
  assert.throws(() => verifyLiveBuilderChanges(before, { ...complete, "sps-plugin.json": before["sps-plugin.json"] }), /all four required/);
  assert.throws(() => verifyLiveBuilderChanges(before, { ...complete, "dist/ui/index.js": undefined }), /unsafe path or hash/);
});

test("verifier validates snapshot paths, hashes, and data-only values", () => {
  const valid = { "dist/manifest.js": "1".repeat(64) };
  assert.throws(() => verifyLiveBuilderChanges({ "../outside": "1".repeat(64) }, valid), /unsafe path or hash/);
  assert.throws(() => verifyLiveBuilderChanges({ "manifest.js": "A".repeat(64) }, valid), /unsafe path or hash/);
  let getterCalled = false;
  const getterSnapshot = {};
  Object.defineProperty(getterSnapshot, "package.json", {
    enumerable: true,
    get() { getterCalled = true; return "1".repeat(64); },
  });
  assert.throws(() => verifyLiveBuilderChanges(getterSnapshot, valid), /unsafe path or hash/);
  assert.equal(getterCalled, false);
});

test("verifier accepts 256-entry snapshots and rejects larger maps before reading values", () => {
  const before = {
    "dist/manifest.js": "1".repeat(64),
    "package.json": "2".repeat(64),
    "sps-plugin.json": "3".repeat(64),
  };
  for (let index = 0; index < 252; index += 1) before[`unchanged-${index}`] = "4".repeat(64);
  const after = {
    ...before,
    "dist/manifest.js": "5".repeat(64),
    "package.json": "6".repeat(64),
    "sps-plugin.json": "7".repeat(64),
    "dist/ui/index.js": "8".repeat(64),
  };
  assert.equal(Object.keys(after).length, 256);
  assert.deepEqual(verifyLiveBuilderChanges(before, after), [
    "dist/manifest.js",
    "dist/ui/index.js",
    "package.json",
    "sps-plugin.json",
  ]);

  let getterCalls = 0;
  const oversized = {};
  for (let index = 0; index < 257; index += 1) {
    Object.defineProperty(oversized, `entry-${index}`, {
      enumerable: true,
      get() { getterCalls += 1; return "9".repeat(64); },
    });
  }
  assert.throws(() => verifyLiveBuilderChanges(oversized, {}), /entry-count limit/);
  assert.equal(getterCalls, 0);
});

test("builder prompt specifies the fixture, package contract, and operational boundaries", () => {
  const prompt = buildLiveBuilderPrompt();
  for (const required of [
    "Builder Preview Fixture",
    "createElement",
    "useState",
    "builder-fixture-count",
    "Count: 0",
    "Count: 1",
    "entrypoints.ui: \"./dist/ui\"",
    "routePath \"builder-fixture\"",
    "exportName \"BuilderFixture\"",
    "plugin.state.read and ui.page.register",
    "calculateStaticCapabilitiesDigest",
    "runtime.manifestSha256",
    "package.json",
    "sps-plugin.json",
    "dist/manifest.js",
    "dist/ui/index.js",
    "Do not modify or create any other file",
    "Do not add dependencies or use the network",
    "not a sandbox or filesystem permission boundary",
  ]) assert.ok(prompt.includes(required), `Prompt omitted: ${required}`);
});

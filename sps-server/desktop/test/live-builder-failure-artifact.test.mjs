import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { captureLiveBuilderFailureArtifact } from "../scripts/live-builder-failure-artifact.mjs";

const TEMP_PREFIX = "live-builder-failure-artifact-test-";
const MAX_FILE_BYTES = 256 * 1024;
const ALLOWED_FILES = [
  "package.json",
  "sps-plugin.json",
  "dist/manifest.js",
  "dist/ui/index.js",
];
const digest = (contents) => createHash("sha256").update(contents).digest("hex");

async function temporaryDirectory(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  t.after(async () => {
    const deletionTarget = path.resolve(root);
    assert.equal(path.dirname(deletionTarget), path.resolve(os.tmpdir()));
    assert.ok(path.basename(deletionTarget).startsWith(TEMP_PREFIX));
    await rm(deletionTarget, { recursive: true, force: true });
  });
  return root;
}

async function putFixtureFiles(fixtureRoot, entries = Object.fromEntries(ALLOWED_FILES.map((name) => [name, `fixture:${name}\n`]))) {
  for (const [relativePath, contents] of Object.entries(entries)) {
    const target = path.join(fixtureRoot, ...relativePath.split("/"));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}

async function listFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.posix.join(prefix.replaceAll(path.sep, "/"), entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else files.push(relative);
  }
  return files.sort();
}

test("captures only allowlisted files into a fresh private development-failure child with hashes", async (t) => {
  const root = await temporaryDirectory(t);
  const desktopRoot = path.join(root, "desktop");
  const fixtureRoot = path.join(root, "fixture");
  await mkdir(desktopRoot);
  await mkdir(fixtureRoot);
  await putFixtureFiles(fixtureRoot);
  await writeFile(path.join(fixtureRoot, ".env"), "SHOULD_NOT_BE_CAPTURED=secret\n");
  await writeFile(path.join(fixtureRoot, "raw.log"), "SHOULD_NOT_BE_CAPTURED\n");
  await writeFile(path.join(fixtureRoot, "dist", "worker.js"), "not allowlisted\n");

  const { artifactPath, metadata } = await captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot });
  const distRoot = await realpath(path.join(desktopRoot, "dist"));
  assert.equal(path.dirname(await realpath(artifactPath)), distRoot);
  assert.match(path.basename(artifactPath), /^live-builder-failure-/);
  assert.deepEqual(await listFiles(artifactPath), [...ALLOWED_FILES, "artifact.json"].sort());
  assert.deepEqual(metadata, JSON.parse(await readFile(path.join(artifactPath, "artifact.json"), "utf8")));
  assert.equal(metadata.schemaVersion, 1);
  assert.equal(metadata.artifactKind, "live-builder-failure");
  assert.equal(metadata.visibility, "private");
  assert.equal(metadata.result, "development-failure");
  assert.equal(metadata.previewVerified, false);
  assert.equal(metadata.success, false);
  assert.match(metadata.capturedAt, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual(metadata.files.map(({ path: filePath }) => filePath), [...ALLOWED_FILES].sort());
  assert.deepEqual(Object.keys(metadata.files[0]).sort(), ["path", "sha256", "sizeBytes"]);
  assert.doesNotMatch(JSON.stringify(metadata), /credential|environment|\.env|raw\.log|SHOULD_NOT_BE_CAPTURED/i);

  for (const file of metadata.files) {
    const copied = await readFile(path.join(artifactPath, ...file.path.split("/")));
    const original = await readFile(path.join(fixtureRoot, ...file.path.split("/")));
    assert.deepEqual(copied, original);
    assert.equal(file.sizeBytes, copied.length);
    assert.equal(file.sha256, digest(copied));
  }

  const second = await captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot });
  assert.notEqual(second.artifactPath, artifactPath);
  assert.equal(await lstat(artifactPath).then((stat) => stat.isDirectory()), true);
});

test("accepts exactly the per-file and aggregate size bounds and rejects an oversized file", async (t) => {
  const root = await temporaryDirectory(t);
  const desktopRoot = path.join(root, "desktop");
  const fixtureRoot = path.join(root, "fixture");
  await mkdir(desktopRoot);
  await mkdir(fixtureRoot);
  const fullSizeEntries = Object.fromEntries(ALLOWED_FILES.map((name, index) => [
    name,
    Buffer.alloc(MAX_FILE_BYTES, index + 1),
  ]));
  await putFixtureFiles(fixtureRoot, fullSizeEntries);

  const accepted = await captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot });
  assert.equal(accepted.metadata.files.reduce((sum, file) => sum + file.sizeBytes, 0), 1024 * 1024);
  assert.equal(accepted.metadata.files.length, 4);

  await writeFile(path.join(fixtureRoot, "package.json"), Buffer.alloc(MAX_FILE_BYTES + 1));
  await assert.rejects(captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot }), /256 KiB limit/);
  assert.deepEqual((await readdir(path.join(desktopRoot, "dist"))).sort(), [path.basename(accepted.artifactPath)]);
});

test("rejects linked fixture roots, files, and parent directories without copying an escape", async (t) => {
  const root = await temporaryDirectory(t);
  const desktopRoot = path.join(root, "desktop");
  const fixtureRoot = path.join(root, "fixture");
  const outside = path.join(root, "outside");
  await mkdir(desktopRoot);
  await mkdir(fixtureRoot);
  await mkdir(outside);
  await writeFile(path.join(outside, "secret.js"), "outside fixture data");
  const kind = process.platform === "win32" ? "junction" : "dir";

  const linkedRoot = path.join(root, "linked-root");
  try {
    await symlink(fixtureRoot, linkedRoot, kind);
    await assert.rejects(captureLiveBuilderFailureArtifact({ fixtureRoot: linkedRoot, desktopRoot }), /real directory/);
    await symlink(path.join(outside, "secret.js"), path.join(fixtureRoot, "package.json"), process.platform === "win32" ? "file" : undefined);
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error?.code)) {
      t.skip(`Could not create the linked fixture: ${error.code}`);
      return;
    }
    throw error;
  }
  await assert.rejects(captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot }), /linked entry/);
  assert.equal(await readdir(path.join(desktopRoot, "dist")).then(() => true, (error) => error.code === "ENOENT"), true);

  await rm(path.join(fixtureRoot, "package.json"));
  const linkedDist = path.join(fixtureRoot, "dist");
  await symlink(outside, linkedDist, kind);
  await assert.rejects(captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot }), /linked entry/);
  assert.equal(await readFile(path.join(outside, "secret.js"), "utf8"), "outside fixture data");

  await rm(linkedDist);
  await mkdir(linkedDist);
  await symlink(outside, path.join(linkedDist, "ui"), kind);
  await assert.rejects(captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot }), /linked entry/);
  assert.equal(await readFile(path.join(outside, "secret.js"), "utf8"), "outside fixture data");
});

test("rejects non-regular entries at allowlisted file paths", async (t) => {
  const root = await temporaryDirectory(t);
  const desktopRoot = path.join(root, "desktop");
  const fixtureRoot = path.join(root, "fixture");
  await mkdir(desktopRoot);
  await mkdir(fixtureRoot);
  await mkdir(path.join(fixtureRoot, "package.json"));

  await assert.rejects(captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot }), /unlinked regular files/);
  assert.equal(await readdir(path.join(desktopRoot, "dist")).then(() => true, (error) => error.code === "ENOENT"), true);
});

test("rejects an output dist symlink and leaves its external target untouched", async (t) => {
  const root = await temporaryDirectory(t);
  const desktopRoot = path.join(root, "desktop");
  const fixtureRoot = path.join(root, "fixture");
  const outside = path.join(root, "outside-dist");
  await mkdir(desktopRoot);
  await mkdir(fixtureRoot);
  await mkdir(outside);
  await putFixtureFiles(fixtureRoot, { "package.json": "{}\n" });
  const sentinel = path.join(outside, "keep.txt");
  await writeFile(sentinel, "preserve me");
  try {
    await symlink(outside, path.join(desktopRoot, "dist"), process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EINVAL"].includes(error?.code)) {
      t.skip(`Could not create the output symlink: ${error.code}`);
      return;
    }
    throw error;
  }

  await assert.rejects(captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot }), /Desktop dist must be a real directory/);
  assert.equal(await readFile(sentinel, "utf8"), "preserve me");
  assert.deepEqual(await readdir(outside), ["keep.txt"]);
});

test("accepts a partial failed fixture and records only the files that exist", async (t) => {
  const root = await temporaryDirectory(t);
  const desktopRoot = path.join(root, "desktop");
  const fixtureRoot = path.join(root, "fixture");
  await mkdir(desktopRoot);
  await mkdir(fixtureRoot);
  await putFixtureFiles(fixtureRoot, { "dist/ui/index.js": "export const partial = true;\n" });

  const result = await captureLiveBuilderFailureArtifact({ fixtureRoot, desktopRoot });
  assert.deepEqual(result.metadata.files.map((file) => file.path), ["dist/ui/index.js"]);
  assert.equal(result.metadata.previewVerified, false);
  assert.equal(result.metadata.success, false);
});

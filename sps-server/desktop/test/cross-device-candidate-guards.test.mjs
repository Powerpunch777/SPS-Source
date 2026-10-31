import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { link, lstat, mkdir, realpath, rm, symlink, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectCrossDeviceCandidate } from "../scripts/cross-device-candidate-guards.mjs";
import { assertPlainDirectory } from "../scripts/installer-ci-safety.mjs";

const expected = {
  desktopVersion: "1.2.3",
  sourceRevision: "a".repeat(40),
  coreRevision: "b".repeat(40),
  sdkRevision: "c".repeat(40),
};

async function fixture(t, { name = `sps-workspace-surfaces-e2e-${Math.random().toString(36).slice(2, 12)}`, baseline } = {}) {
  const canonicalTemp = await realpath(os.tmpdir());
  assert.equal(await assertPlainDirectory(canonicalTemp), canonicalTemp);
  assert.match(name, /^sps-workspace-surfaces-e2e-[A-Za-z0-9]+$/);
  const root = path.join(canonicalTemp, name);
  await mkdir(root);
  assert.equal(await assertPlainDirectory(root), root);
  const ownedIdentity = await lstat(root, { bigint: true }).then(({ dev, ino, birthtimeNs }) => ({ dev, ino, birthtimeNs }));
  t.after(async () => {
    assert.equal(path.dirname(root), canonicalTemp, "fixture cleanup must remain under the canonical temporary directory");
    assert.match(path.basename(root), /^sps-workspace-surfaces-e2e-[A-Za-z0-9]+$/);
    const current = await lstat(root, { bigint: true });
    assert.ok(current.isDirectory() && !current.isSymbolicLink(), "fixture root must remain a plain directory until cleanup");
    assert.deepEqual(
      { dev: current.dev, ino: current.ino, birthtimeNs: current.birthtimeNs },
      ownedIdentity,
      "fixture cleanup must retain the originally created directory identity",
    );
    await rm(root, { recursive: true });
  });
  const candidate = path.join(root, "candidate");
  await mkdir(path.join(candidate, "resources", "sps-owner-host-runtime-package"), { recursive: true });
  const contents = {
    executable: Buffer.from("inert executable fixture"),
    appAsar: Buffer.from("inert app archive fixture"),
    runtimeArchive: Buffer.from("inert runtime archive fixture"),
  };
  await writeFile(path.join(candidate, "SPS Desktop.exe"), contents.executable);
  await writeFile(path.join(candidate, "resources", "app.asar"), contents.appAsar);
  await writeFile(path.join(candidate, "resources", "sps-owner-host-runtime-package", "sps-owner-host-runtime.tgz"), contents.runtimeArchive);
  await writeFile(path.join(root, "candidate-baseline.json"), JSON.stringify(baseline === undefined ? {
    schemaVersion: 1,
    product: "SPS Desktop",
    status: "development-candidate",
    desktopVersion: expected.desktopVersion,
    sourceRevision: expected.sourceRevision,
    sourceDirty: false,
    core: { revision: expected.coreRevision, dirty: false },
    pluginSdk: { revision: expected.sdkRevision, dirty: false },
    privateBuildMetadata: { retained: true },
  } : baseline));
  return { root, candidate, contents };
}

test("inspects only the owned candidate and returns hashes without paths", async t => {
  const { root, contents } = await fixture(t);
  const result = await inspectCrossDeviceCandidate({ fixtureRoot: root, expected });
  const hashes = Object.fromEntries(Object.entries(contents).map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")]));
  assert.deepEqual(result.installedArtifacts, hashes);
  assert.equal(result.baseline.privateBuildMetadata.retained, true);
  assert.equal(JSON.stringify(result).includes(root), false);
  assert.deepEqual(await lstat(path.join(root, "candidate", "SPS Desktop.exe")).then(s => [s.isFile(), s.size > 0]), [true, true]);
});

test("rejects invalid expected tuples before filesystem access", async () => {
  for (const invalid of [
    { ...expected, extra: true },
    { ...expected, desktopVersion: "1.2" },
    { ...expected, sourceRevision: "A".repeat(40) },
    { ...expected, coreRevision: "" },
    { ...expected, sdkRevision: 123 },
    null,
  ]) {
    await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: "not a path", expected: invalid }), /Expected candidate tuple/);
  }
});

test("rejects accessors, symbols, and unknown keys without invoking getters", async () => {
  let getterCalls = 0;
  const accessorExpected = { ...expected };
  Object.defineProperty(accessorExpected, "desktopVersion", { enumerable: true, get() { getterCalls += 1; return expected.desktopVersion; } });
  const symbolExpected = { ...expected, [Symbol("extra")]: true };
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: "not a path", expected: accessorExpected }), /data properties/);
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: "not a path", expected: symbolExpected }), /exactly/);
  const accessorOptions = { expected };
  Object.defineProperty(accessorOptions, "fixtureRoot", { enumerable: true, get() { getterCalls += 1; return "not a path"; } });
  await assert.rejects(inspectCrossDeviceCandidate(accessorOptions), /data properties/);
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: "not a path", expected, ignored: true }), /exactly/);
  assert.equal(getterCalls, 0);
});

test("rejects tuple mismatches and dirty or malformed baselines", async t => {
  const goodBaseline = {
    status: "development-candidate", desktopVersion: expected.desktopVersion,
    sourceRevision: expected.sourceRevision, sourceDirty: false,
    core: { revision: expected.coreRevision, dirty: false },
    pluginSdk: { revision: expected.sdkRevision, dirty: false },
  };
  const variants = [
    { ...goodBaseline, desktopVersion: "9.9.9" },
    { ...goodBaseline, sourceDirty: true },
    { ...goodBaseline, core: { revision: expected.coreRevision, dirty: "false" } },
    { ...goodBaseline, pluginSdk: { revision: "d".repeat(40), dirty: false } },
    [], null, { ...goodBaseline, status: "stable" },
  ];
  for (const baseline of variants) {
    const { root } = await fixture(t, { baseline });
    await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: root, expected }), /Candidate baseline/);
  }
});

test("rejects roots outside the exact plain temporary child and rejects directory junctions", async t => {
  const { root } = await fixture(t);
  const outside = await fixture(t);
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: path.dirname(root), expected }), /absolute direct temporary-directory child/);
  const canonicalTemp = await realpath(os.tmpdir());
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: path.join(canonicalTemp, "sps-workspace-surfaces-e2e-bad-name!"), expected }), /absolute direct temporary-directory child/);
  const linkedRoot = path.join(canonicalTemp, `sps-workspace-surfaces-e2e-${Math.random().toString(36).slice(2, 12)}`);
  await symlink(root, linkedRoot, process.platform === "win32" ? "junction" : "dir");
  const linkedIdentity = await lstat(linkedRoot, { bigint: true });
  t.after(async () => {
    const current = await lstat(linkedRoot, { bigint: true });
    assert.ok(current.isSymbolicLink() && current.dev === linkedIdentity.dev && current.ino === linkedIdentity.ino);
    await rm(linkedRoot);
  });
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: linkedRoot, expected }), /linked or non-directory/);
  await rm(path.join(root, "candidate"), { recursive: true });
  await symlink(outside.candidate, path.join(root, "candidate"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: root, expected }), /linked or non-directory/);
  assert.equal(await lstat(path.join(outside.candidate, "SPS Desktop.exe")).then(stats => stats.isFile()), true);
});

test("rejects linked, hard-linked, and empty candidate files", async t => {
  const linkedFixture = await fixture(t);
  const linkedFile = path.join(linkedFixture.candidate, "SPS Desktop.exe");
  const original = `${linkedFile}.original`;
  await rm(linkedFile);
  await writeFile(original, "fixture");
  await symlink(original, linkedFile);
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: linkedFixture.root, expected }), /plain file with one link/);

  const hardlinkedFixture = await fixture(t);
  const hardlink = path.join(hardlinkedFixture.candidate, "SPS Desktop.exe");
  await link(hardlink, `${hardlink}.second-link`);
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: hardlinkedFixture.root, expected }), /plain file with one link/);

  const emptyFixture = await fixture(t);
  await writeFile(path.join(emptyFixture.candidate, "SPS Desktop.exe"), "");
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: emptyFixture.root, expected }), /plain file with one link/);
});

test("rejects a baseline larger than 64 KiB", async t => {
  const { root } = await fixture(t);
  await writeFile(path.join(root, "candidate-baseline.json"), `${JSON.stringify({})}${" ".repeat(65 * 1024)}`);
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: root, expected }), /exceeds 64 KiB/);
});

test("rejects an oversized sparse artifact before hashing it", async t => {
  const { root, candidate } = await fixture(t);
  await truncate(path.join(candidate, "SPS Desktop.exe"), 512 * 1024 * 1024 + 1);
  await assert.rejects(inspectCrossDeviceCandidate({ fixtureRoot: root, expected }), /exceeds 512 MiB/);
});

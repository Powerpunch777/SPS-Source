import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveSpsReleaseBaseline,
  validateSpsSupportMatrix,
} from "../scripts/release-baseline.mjs";
import { createSpsReleaseManifest } from "../scripts/create-release-manifest.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const workspaceRoot = path.resolve(spsServerRoot, "..");
const coreRoot = path.join(workspaceRoot, "external", "sps-core");

test("pins the development candidate to the checked-out Desktop, Core, and bundled extensions", async () => {
  const matrix = JSON.parse(await readFile(path.join(spsServerRoot, "release", "support-matrix.json"), "utf8"));
  assert.deepEqual(validateSpsSupportMatrix(matrix), []);
  const baseline = await resolveSpsReleaseBaseline({
    workspaceRoot,
    desktopRoot,
    spsServerRoot,
    coreRoot,
    builtAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(baseline.desktopVersion, "0.4.79");
  assert.equal(baseline.core.revision, "c8846a0e93962f7f1179f859b299da7648b48a50");
  assert.deepEqual(baseline.pluginSdk, {
    repository: "Powerpunch777/sps-plugin-sdk",
    revision: "acf5c8011cff6afadf05bd542a2e640625413609",
    package: "@sonparkserver/plugin-sdk",
    version: "0.1.1",
    dirty: false,
  });
  assert.deepEqual(baseline.extensionProfile, { version: "1.0", pluginApi: 1 });
  assert.equal(baseline.update.channel, "latest");
  assert.equal(baseline.update.repository, "Powerpunch777/SPS-Desktop-Releases");
  assert.deepEqual(
    baseline.bundledExtensions.map((extension) => [extension.id, extension.version]),
    [["sps.default-memory", "0.1.0"], ["sps.plugin-discovery", "0.1.0"], ["local.room-chat", "0.3.91"]],
  );
});

test("creates a hash manifest only when latest.yml points to the exact installer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-release-baseline-"));
  const runtimeRoot = path.join(root, "runtime");
  const distRoot = path.join(root, "dist");
  try {
    await Promise.all([mkdir(runtimeRoot), mkdir(distRoot)]);
    await writeFile(path.join(runtimeRoot, "sps-release-baseline.json"), JSON.stringify({
      schemaVersion: 1,
      desktopVersion: "0.4.79",
    }), "utf8");
    await writeFile(path.join(distRoot, "SPS-Desktop-Setup-0.4.79.exe"), "installer", "utf8");
    await writeFile(path.join(distRoot, "SPS-Desktop-Setup-0.4.79.exe.blockmap"), "blockmap", "utf8");
    await writeFile(path.join(distRoot, "latest.yml"), [
      "version: 0.4.79",
      "path: SPS-Desktop-Setup-0.4.79.exe",
      "",
    ].join("\n"), "utf8");

    const manifest = await createSpsReleaseManifest({ runtimeRoot, distRoot });
    assert.equal(manifest.artifacts.installer.file, "SPS-Desktop-Setup-0.4.79.exe");
    assert.match(manifest.artifacts.installer.sha256, /^[0-9a-f]{64}$/);

    await writeFile(path.join(distRoot, "latest.yml"), [
      "version: 0.4.79",
      "path: SPS-Desktop-Setup-0.4.78.exe",
      "",
    ].join("\n"), "utf8");
    await assert.rejects(
      () => createSpsReleaseManifest({ runtimeRoot, distRoot }),
      /does not match SPS-Desktop-Setup-0\.4\.79\.exe/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  resolveSpsReleaseBaseline,
  validateSpsSupportMatrix,
} from "../scripts/release-baseline.mjs";
import { createSpsReleaseManifest } from "../scripts/create-release-manifest.mjs";
import { writeSpsUpdateMetadata } from "../scripts/write-update-metadata.mjs";

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
  assert.equal(baseline.desktopVersion, "0.4.98");
  assert.equal(baseline.core.revision, "c4ce4bf866cac1aa2d7276f289c30b531769ada1");
  assert.equal(baseline.pluginSdk.repository, "Powerpunch777/sps-plugin-sdk");
  assert.equal(baseline.pluginSdk.revision, "f24d9b236a8bdaee9441f37694b7e4298aa7e6c2");
  assert.equal(baseline.pluginSdk.package, "@sonparkserver/plugin-sdk");
  assert.equal(baseline.pluginSdk.version, "0.11.0");
  assert.equal(typeof baseline.pluginSdk.dirty, "boolean");
  assert.deepEqual(baseline.extensionProfile, { version: "2.0", pluginApi: 1 });
  assert.deepEqual(baseline.extensionProfiles, ["1.0", "2.0"]);
  assert.equal(baseline.update.channel, "latest");
  assert.equal(baseline.update.repository, "Powerpunch777/SPS-Desktop-Releases");
  assert.deepEqual(
    baseline.bundledExtensions.map((extension) => [extension.id, extension.version]),
    [["sps.default-memory", "0.1.0"], ["sps.plugin-discovery", "0.4.0"], ["local.room-chat", "0.3.91"]],
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
    await writeFile(path.join(distRoot, "SPS-Agent-Runtime-Pack-codex-acp-0.4.79.zip"), "runtime-pack", "utf8");
    await writeFile(path.join(distRoot, "sps-agent-runtime-packs.json"), `\uFEFF${JSON.stringify({
      schemaVersion: 1,
      packs: [{
        id: "codex-acp",
        label: "Codex ACP",
        version: "0.4.79",
        commands: ["codex-acp"],
        archive: "SPS-Agent-Runtime-Pack-codex-acp-0.4.79.zip",
      }],
    })}`, "utf8");

    const manifest = await createSpsReleaseManifest({ runtimeRoot, distRoot });
    assert.equal(manifest.artifacts.installer.file, "SPS-Desktop-Setup-0.4.79.exe");
    assert.match(manifest.artifacts.installer.sha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(manifest.artifacts.agentRuntimePacks.map((pack) => [pack.id, pack.file]), [
      ["codex-acp", "SPS-Agent-Runtime-Pack-codex-acp-0.4.79.zip"],
    ]);

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

test("writes update metadata from the exact candidate installer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-update-metadata-"));
  const runtimeRoot = path.join(root, "runtime");
  const distRoot = path.join(root, "dist");
  try {
    await Promise.all([mkdir(runtimeRoot), mkdir(distRoot)]);
    await writeFile(path.join(runtimeRoot, "sps-release-baseline.json"), JSON.stringify({
      desktopVersion: "0.4.91",
    }), "utf8");
    await writeFile(path.join(distRoot, "SPS-Desktop-Setup-0.4.91.exe"), "installer", "utf8");

    const { metadata } = await writeSpsUpdateMetadata({
      runtimeRoot,
      distRoot,
      releasedAt: new Date("2026-07-30T12:00:00.000Z"),
    });

    assert.equal(metadata.version, "0.4.91");
    assert.equal(metadata.path, "SPS-Desktop-Setup-0.4.91.exe");
    assert.equal(metadata.files[0].size, 9);
    const latest = await readFile(path.join(distRoot, "latest.yml"), "utf8");
    assert.match(latest, /^version: 0\.4\.91$/m);
    assert.match(latest, /path: SPS-Desktop-Setup-0\.4\.91\.exe/);
    assert.equal((await stat(path.join(distRoot, "SPS-Desktop-Setup-0.4.91.exe.blockmap"))).isFile(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

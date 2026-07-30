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
  assert.equal(baseline.desktopVersion, "0.4.85");
  assert.equal(baseline.core.revision, "95665eb49996cd0e9c13e2da817326dfffe0f2a3");
  assert.equal(baseline.pluginSdk.repository, "Powerpunch777/sps-plugin-sdk");
  assert.equal(baseline.pluginSdk.revision, "1232ca3aa4a5ee109214ed9b0af9e6189e53b882");
  assert.equal(baseline.pluginSdk.package, "@sonparkserver/plugin-sdk");
  assert.equal(baseline.pluginSdk.version, "0.2.0");
  assert.equal(typeof baseline.pluginSdk.dirty, "boolean");
  assert.deepEqual(baseline.extensionProfile, { version: "2.0", pluginApi: 1 });
  assert.deepEqual(baseline.extensionProfiles, ["1.0", "2.0"]);
  assert.equal(baseline.update.channel, "latest");
  assert.equal(baseline.update.repository, "Powerpunch777/SPS-Desktop-Releases");
  assert.deepEqual(
    baseline.bundledExtensions.map((extension) => [extension.id, extension.version]),
    [["sps.default-memory", "0.1.0"], ["sps.plugin-discovery", "0.3.0"], ["local.room-chat", "0.3.91"]],
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

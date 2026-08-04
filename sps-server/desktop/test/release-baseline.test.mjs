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
import {
  assertSpsReleaseBaselineUnchanged,
  createSpsReleaseManifest,
} from "../scripts/create-release-manifest.mjs";
import { writeSpsUpdateMetadata } from "../scripts/write-update-metadata.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const workspaceRoot = path.resolve(spsServerRoot, "..");
const coreRoot = path.join(workspaceRoot, "external", "sps-core");

test("pins the development candidate to the checked-out Desktop, Core, and bundled extensions", async () => {
  const matrix = JSON.parse(await readFile(path.join(spsServerRoot, "release", "support-matrix.json"), "utf8"));
  assert.deepEqual(validateSpsSupportMatrix(matrix), []);
  const candidate = matrix.candidate;
  const baseline = await resolveSpsReleaseBaseline({
    workspaceRoot,
    desktopRoot,
    spsServerRoot,
    coreRoot,
    builtAt: "2026-07-28T00:00:00.000Z",
  });
  assert.equal(baseline.desktopVersion, candidate.desktopVersion);
  assert.equal(baseline.core.revision, candidate.core.revision);
  assert.equal(baseline.pluginSdk.repository, candidate.pluginSdk.repository);
  assert.equal(baseline.pluginSdk.revision, candidate.pluginSdk.revision);
  assert.equal(baseline.pluginSdk.package, candidate.pluginSdk.package);
  assert.equal(baseline.pluginSdk.version, candidate.pluginSdk.version);
  assert.equal(typeof baseline.pluginSdk.dirty, "boolean");
  assert.deepEqual(baseline.extensionProfile, candidate.extensionProfile);
  assert.deepEqual(baseline.extensionProfiles, candidate.extensionProfiles);
  assert.equal(baseline.update.channel, candidate.update.channel);
  assert.equal(baseline.update.repository, candidate.update.repository);
  assert.deepEqual(
    baseline.bundledExtensions.map((extension) => [extension.id, extension.version]),
    candidate.bundledExtensions.map((extension) => [extension.id, extension.version]),
  );
});

test("rejects a repository mutation after the release baseline is captured", () => {
  const baseline = {
    status: "development-candidate",
    desktopVersion: "0.4.119",
    sourceRevision: "a".repeat(40),
    sourceDirty: false,
    core: { repository: "Powerpunch777/SPS-Core", revision: "b".repeat(40), dirty: false },
    pluginSdk: { repository: "Powerpunch777/sps-plugin-sdk", revision: "c".repeat(40), dirty: false },
    bundledExtensions: [{ id: "local.room-chat", version: "0.3.92" }],
  };
  assert.doesNotThrow(() => assertSpsReleaseBaselineUnchanged(baseline, structuredClone(baseline)));

  const changed = structuredClone(baseline);
  changed.sourceDirty = true;
  assert.throws(
    () => assertSpsReleaseBaselineUnchanged(baseline, changed),
    /changed during packaging/,
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
      sourceRevision: "a".repeat(40),
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

    const trustedDeviceFingerprints = { host: "1".repeat(64), member: "2".repeat(64) };
    const manifest = await createSpsReleaseManifest({ runtimeRoot, distRoot, trustedDeviceFingerprints, requireTrustedDevices: true });
    assert.equal(manifest.artifacts.installer.file, "SPS-Desktop-Setup-0.4.79.exe");
    assert.match(manifest.artifacts.installer.sha256, /^[0-9a-f]{64}$/);
    assert.equal(manifest.artifacts.releaseChallenge.file, "sps-release-challenge.json");
    const challenge = JSON.parse(await readFile(path.join(distRoot, "sps-release-challenge.json"), "utf8"));
    assert.equal(challenge.sourceRevision, "a".repeat(40));
    assert.equal(challenge.installerSha256, manifest.artifacts.installer.sha256);
    assert.match(challenge.releaseNonce, /^[0-9a-f]{64}$/);
    assert.deepEqual(challenge.trustedDeviceFingerprints, trustedDeviceFingerprints);
    assert.deepEqual(manifest.artifacts.agentRuntimePacks.map((pack) => [pack.id, pack.file]), [
      ["codex-acp", "SPS-Agent-Runtime-Pack-codex-acp-0.4.79.zip"],
    ]);

    await writeFile(path.join(distRoot, "latest.yml"), [
      "version: 0.4.79",
      "path: SPS-Desktop-Setup-0.4.78.exe",
      "",
    ].join("\n"), "utf8");
    await assert.rejects(
      () => createSpsReleaseManifest({ runtimeRoot, distRoot, trustedDeviceFingerprints, requireTrustedDevices: true }),
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

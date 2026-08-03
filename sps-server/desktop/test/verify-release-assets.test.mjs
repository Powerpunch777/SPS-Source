import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyReleaseAssets } from "../scripts/verify-release-assets.mjs";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("verifies every immutable release byte against the exact Source tuple", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-release-assets-"));
  try {
    const matrix = JSON.parse(await readFile(new URL("../../release/support-matrix.json", import.meta.url), "utf8"));
    const sourceRevision = "a".repeat(40);
    const installerName = `SPS-Desktop-Setup-${matrix.candidate.desktopVersion}.exe`;
    const installerContent = Buffer.from("installer");
    const challenge = {
      schemaVersion: 1,
      desktopVersion: matrix.candidate.desktopVersion,
      sourceRevision,
      installerSha256: hash(installerContent),
      releaseNonce: "9".repeat(64),
      generatedAt: "2026-08-04T00:00:00.000Z",
      trustedDeviceFingerprints: { host: "1".repeat(64), member: "2".repeat(64) },
    };
    const files = {
      [installerName]: installerContent,
      [`SPS-Desktop-Setup-${matrix.candidate.desktopVersion}.exe.blockmap`]: Buffer.from("blockmap"),
      "latest.yml": Buffer.from("metadata"),
      "sps-agent-runtime-packs.json": Buffer.from("catalog"),
      "sps-release-challenge.json": Buffer.from(`${JSON.stringify(challenge)}\n`),
      "SPS-Agent-Runtime-Pack-codex-win.zip": Buffer.from("runtime"),
    };
    for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content);
    const artifact = (name, withSize = false) => ({ file: name, sha256: hash(files[name]), ...(withSize ? { sizeBytes: files[name].length } : {}) });
    const manifest = {
      schemaVersion: 1,
      baseline: {
        desktopVersion: matrix.candidate.desktopVersion,
        sourceRevision,
        sourceDirty: false,
        core: { revision: matrix.candidate.core.revision, dirty: false },
        pluginSdk: { revision: matrix.candidate.pluginSdk.revision, dirty: false },
      },
      artifacts: {
        installer: artifact(installerName, true),
        updateMetadata: artifact("latest.yml"),
        blockmap: artifact(`SPS-Desktop-Setup-${matrix.candidate.desktopVersion}.exe.blockmap`),
        agentRuntimeCatalog: artifact("sps-agent-runtime-packs.json"),
        releaseChallenge: artifact("sps-release-challenge.json", true),
        agentRuntimePacks: [artifact("SPS-Agent-Runtime-Pack-codex-win.zip", true)],
      },
    };
    await writeFile(path.join(root, "sps-release-manifest.json"), JSON.stringify(manifest));
    const result = await verifyReleaseAssets({ assetsDirectory: root, sourceRevision, requireAuthenticode: false });
    assert.equal(result.manifest.baseline.sourceRevision, sourceRevision);
    await writeFile(path.join(root, "latest.yml"), "tampered");
    await assert.rejects(() => verifyReleaseAssets({ assetsDirectory: root, sourceRevision, requireAuthenticode: false }), /hash mismatch/);
    await writeFile(path.join(root, "latest.yml"), files["latest.yml"]);
    await verifyReleaseAssets({ assetsDirectory: root, sourceRevision, requireAuthenticode: false, requireExactFileSet: true });
    await writeFile(path.join(root, "unexpected.txt"), "unexpected");
    await assert.rejects(() => verifyReleaseAssets({ assetsDirectory: root, sourceRevision, requireAuthenticode: false, requireExactFileSet: true }), /unexpected immutable assets/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
    const files = {
      [`SPS-Desktop-Setup-${matrix.candidate.desktopVersion}.exe`]: Buffer.from("installer"),
      [`SPS-Desktop-Setup-${matrix.candidate.desktopVersion}.exe.blockmap`]: Buffer.from("blockmap"),
      "latest.yml": Buffer.from("metadata"),
      "sps-agent-runtime-packs.json": Buffer.from("catalog"),
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
        installer: artifact(`SPS-Desktop-Setup-${matrix.candidate.desktopVersion}.exe`, true),
        updateMetadata: artifact("latest.yml"),
        blockmap: artifact(`SPS-Desktop-Setup-${matrix.candidate.desktopVersion}.exe.blockmap`),
        agentRuntimeCatalog: artifact("sps-agent-runtime-packs.json"),
        agentRuntimePacks: [artifact("SPS-Agent-Runtime-Pack-codex-win.zip", true)],
      },
    };
    await writeFile(path.join(root, "sps-release-manifest.json"), JSON.stringify(manifest));
    const result = await verifyReleaseAssets({ assetsDirectory: root, sourceRevision, requireAuthenticode: false });
    assert.equal(result.manifest.baseline.sourceRevision, sourceRevision);
    await writeFile(path.join(root, "latest.yml"), "tampered");
    await assert.rejects(() => verifyReleaseAssets({ assetsDirectory: root, sourceRevision, requireAuthenticode: false }), /hash mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

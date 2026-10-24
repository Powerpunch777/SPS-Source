import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createTailscaleServeEvidenceFile } from "../scripts/create-tailscale-serve-evidence.mjs";
import { verifyTailscaleServeEvidenceFile } from "../scripts/verify-tailscale-serve-evidence.mjs";
import {
  tailscaleServeChallengeForReleaseNonce,
  tailscaleServePathForReleaseNonce,
} from "../scripts/tailscale-serve-release-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("file generator rehashes installer, archive, and loaded module bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "sps-serve-evidence-files-"));
  try {
    const installer = Buffer.from("unsigned-installer");
    const archive = Buffer.from("runtime-archive");
    const module = Buffer.from("transport-module");
    const installerPath = path.join(root, "SPS-Desktop-Setup-0.4.131.exe");
    const archivePath = path.join(root, "sps-owner-host-runtime.tgz");
    const modulePath = path.join(root, "request-hostname.js");
    const manifestPath = path.join(root, "manifest.json");
    const challengePath = path.join(root, "challenge.json");
    const capturePath = path.join(root, "capture.json");
    const outputPath = path.join(root, "evidence.json");
    const sourceRevision = "1".repeat(40);
    const releaseNonce = "8".repeat(64);
    const responseChallenge = tailscaleServeChallengeForReleaseNonce(releaseNonce);
    const servePath = tailscaleServePathForReleaseNonce(releaseNonce);
    const manifest = {
      baseline: {
        desktopVersion: "0.4.131",
        sourceRevision,
        core: { revision: "2".repeat(40) },
        pluginSdk: { revision: "3".repeat(40) },
        platform: { minimumRemoteTransportVersion: "1.52.0" },
      },
      ownerHostRuntime: {
        archive: { file: path.basename(archivePath), sizeBytes: archive.length, sha256: sha256(archive) },
        runtimeManifestSha256: "4".repeat(64),
        requestHostnameModule: { relativePath: "request-hostname.js", sha256: sha256(module) },
      },
      artifacts: {
        installer: { file: path.basename(installerPath), sizeBytes: installer.length, sha256: sha256(installer) },
      },
    };
    const challenge = { schemaVersion: 1, desktopVersion: "0.4.131", sourceRevision, installerSha256: sha256(installer), releaseNonce };
    const encoded = (accepted, source, identity) => Buffer.from(JSON.stringify({
      accepted,
      challenge: responseChallenge,
      parsedIdentity: { source, peer: "loopback", identity },
    })).toString("base64");
    const capture = {
      schemaVersion: 1,
      releaseNonce,
      completedAt: new Date().toISOString(),
      servePath,
      backendPort: 31311,
      hostTailscaleVersion: { short: "1.98.8" },
      memberTailscaleVersion: { short: "1.98.4" },
      runtimeArchiveSha256: sha256(archive),
      requestHostnameModuleSha256: sha256(module),
      memberResponse: { httpStatus: 200, responseBodyBase64: encoded(true, "tailscale-serve", { present: true }) },
      directSpoofResponse: { httpStatus: 403, responseBodyBase64: encoded(false, "direct", null) },
    };
    await Promise.all([
      writeFile(installerPath, installer), writeFile(archivePath, archive), writeFile(modulePath, module),
      writeFile(manifestPath, JSON.stringify(manifest)), writeFile(challengePath, JSON.stringify(challenge)),
      writeFile(capturePath, JSON.stringify(capture)),
    ]);
    const evidence = await createTailscaleServeEvidenceFile({
      capturePath, outputPath, releaseManifestPath: manifestPath, releaseChallengePath: challengePath,
      installerPath, runtimeArchivePath: archivePath, requestHostnameModulePath: modulePath,
      authenticodeStatusFn: async () => "NotSigned",
    });
    assert.equal(evidence.status, "development-smoke");
    assert.equal(JSON.parse(await readFile(outputPath, "utf8")).runtime.archiveSha256, sha256(archive));
    await writeFile(installerPath, "changed");
    await assert.rejects(() => createTailscaleServeEvidenceFile({
      capturePath, outputPath: path.join(root, "second.json"), releaseManifestPath: manifestPath,
      releaseChallengePath: challengePath, installerPath, runtimeArchivePath: archivePath,
      requestHostnameModulePath: modulePath,
      authenticodeStatusFn: async () => "NotSigned",
    }), /Installer bytes do not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("standalone verifier cannot claim signed Stable completion", async () => {
  await assert.rejects(() => verifyTailscaleServeEvidenceFile({ requireStable: true }), /signed physical release evidence verifier/);
});

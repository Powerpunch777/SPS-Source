import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");

async function digest(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function safeArtifactName(value) {
  return typeof value === "string" && value === path.basename(value) && !value.includes("..") && value.length > 0;
}

async function verifyArtifact(root, artifact, { requireSize = false } = {}) {
  if (!safeArtifactName(artifact?.file) || !/^[0-9a-f]{64}$/.test(artifact?.sha256 ?? "")) throw new Error("Release manifest contains an invalid artifact contract.");
  const filePath = path.join(root, artifact.file);
  const info = await stat(filePath);
  if (!info.isFile()) throw new Error(`Release artifact is not a file: ${artifact.file}`);
  if (requireSize && info.size !== artifact.sizeBytes) throw new Error(`Release artifact size mismatch: ${artifact.file}`);
  if (await digest(filePath) !== artifact.sha256) throw new Error(`Release artifact hash mismatch: ${artifact.file}`);
  return filePath;
}

export async function verifyReleaseAssets({
  assetsDirectory,
  sourceRevision,
  requireAuthenticode = true,
} = {}) {
  const suppliedRoot = assetsDirectory ?? process.env.SPS_RELEASE_ASSETS_DIRECTORY;
  if (!suppliedRoot) throw new Error("SPS release assets directory is required.");
  const root = path.resolve(suppliedRoot);
  const manifest = JSON.parse(await readFile(path.join(root, "sps-release-manifest.json"), "utf8"));
  const matrix = JSON.parse(await readFile(path.join(spsServerRoot, "release", "support-matrix.json"), "utf8"));
  const expectedSource = sourceRevision ?? process.env.SPS_SOURCE_REVISION ?? process.env.GITHUB_SHA;
  if (manifest.schemaVersion !== 1 || manifest.baseline?.desktopVersion !== matrix.candidate.desktopVersion) throw new Error("Release manifest Desktop candidate does not match the support matrix.");
  if (!expectedSource || manifest.baseline?.sourceRevision !== expectedSource) throw new Error("Release manifest Source SHA does not match the release tag.");
  if (manifest.baseline?.sourceDirty !== false || manifest.baseline?.core?.dirty !== false || manifest.baseline?.pluginSdk?.dirty !== false) throw new Error("Release manifest was not produced from clean repositories.");
  if (manifest.baseline?.core?.revision !== matrix.candidate.core.revision || manifest.baseline?.pluginSdk?.revision !== matrix.candidate.pluginSdk.revision) throw new Error("Release manifest Core or Plugin SDK revision does not match the support matrix.");
  const installerPath = await verifyArtifact(root, manifest.artifacts?.installer, { requireSize: true });
  await verifyArtifact(root, manifest.artifacts?.updateMetadata);
  await verifyArtifact(root, manifest.artifacts?.blockmap);
  await verifyArtifact(root, manifest.artifacts?.agentRuntimeCatalog);
  for (const artifact of manifest.artifacts?.agentRuntimePacks ?? []) await verifyArtifact(root, artifact, { requireSize: true });
  if (requireAuthenticode) {
    if (process.platform !== "win32") throw new Error("Authenticode verification requires Windows.");
    const escaped = installerPath.replaceAll("'", "''");
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `(Get-AuthenticodeSignature -LiteralPath '${escaped}').Status`], { windowsHide: true });
    if (stdout.trim() !== "Valid") throw new Error("Release installer Authenticode signature is not Valid.");
  }
  return { manifest, installerPath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await verifyReleaseAssets();
  console.log(JSON.stringify({ installerPath: result.installerPath, sha256: result.manifest.artifacts.installer.sha256, sizeBytes: result.manifest.artifacts.installer.sizeBytes }));
}

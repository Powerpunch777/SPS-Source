import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createTailscaleServeReleaseEvidence } from "./tailscale-serve-release-evidence.mjs";

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");

async function readJson(filePath, label) {
  try {
    return JSON.parse((await readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(`${label} is missing or invalid: ${filePath}`);
  }
}

async function authenticodeStatus(installerPath) {
  if (process.platform !== "win32") throw new Error("Serve evidence installer verification requires Windows.");
  const escaped = installerPath.replaceAll("'", "''");
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `(Get-AuthenticodeSignature -LiteralPath '${escaped}').Status`,
  ], { windowsHide: true });
  return stdout.trim();
}

async function verifyFileIdentity(filePath, expected, label) {
  let details;
  let content;
  try {
    [details, content] = await Promise.all([stat(filePath), readFile(filePath)]);
  } catch {
    throw new Error(`${label} is missing: ${filePath}`);
  }
  const sha256 = createHash("sha256").update(content).digest("hex");
  if (!details.isFile()
      || (expected.sizeBytes !== undefined && details.size !== expected.sizeBytes)
      || sha256 !== expected.sha256) {
    throw new Error(`${label} bytes do not match the release manifest.`);
  }
  return { sizeBytes: details.size, sha256 };
}

export async function createTailscaleServeEvidenceFile({
  capturePath,
  outputPath,
  releaseManifestPath = process.env.SPS_RELEASE_MANIFEST_PATH?.trim() || path.join(desktopRoot, "dist", "sps-release-manifest.json"),
  releaseChallengePath = process.env.SPS_RELEASE_CHALLENGE_PATH?.trim() || path.join(desktopRoot, "dist", "sps-release-challenge.json"),
  installerPath,
  runtimeArchivePath = process.env.SPS_OWNER_HOST_RUNTIME_ARCHIVE_PATH?.trim(),
  requestHostnameModulePath = process.env.SPS_REQUEST_HOSTNAME_MODULE_PATH?.trim(),
  authenticodeStatusFn = authenticodeStatus,
} = {}) {
  if (!capturePath || !outputPath) throw new Error("Private capture and sanitized evidence output paths are required.");
  const releaseManifest = await readJson(path.resolve(releaseManifestPath), "Release manifest");
  const releaseChallenge = await readJson(path.resolve(releaseChallengePath), "Release challenge");
  const capture = await readJson(path.resolve(capturePath), "Private Serve capture");
  const resolvedInstallerPath = path.resolve(installerPath ?? path.join(
    path.dirname(path.resolve(releaseManifestPath)),
    releaseManifest.artifacts?.installer?.file ?? "missing-installer",
  ));
  const resolvedRuntimeArchivePath = path.resolve(runtimeArchivePath ?? path.join(
    path.dirname(path.resolve(releaseManifestPath)),
    "win-unpacked",
    "resources",
    "sps-owner-host-runtime-package",
    releaseManifest.ownerHostRuntime?.archive?.file ?? "missing-runtime-archive",
  ));
  if (!requestHostnameModulePath) {
    throw new Error("The exact loaded request-hostname module path is required in SPS_REQUEST_HOSTNAME_MODULE_PATH.");
  }
  await verifyFileIdentity(resolvedInstallerPath, releaseManifest.artifacts?.installer ?? {}, "Installer");
  await verifyFileIdentity(resolvedRuntimeArchivePath, releaseManifest.ownerHostRuntime?.archive ?? {}, "Owner Host runtime archive");
  await verifyFileIdentity(path.resolve(requestHostnameModulePath), {
    sha256: releaseManifest.ownerHostRuntime?.requestHostnameModule?.sha256,
  }, "Loaded request-hostname module");
  const evidence = createTailscaleServeReleaseEvidence({
    capture,
    releaseManifest,
    releaseChallenge,
    installerSignatureStatus: await authenticodeStatusFn(resolvedInstallerPath),
  });
  await writeFile(path.resolve(outputPath), `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , capturePath, outputPath] = process.argv;
  const evidence = await createTailscaleServeEvidenceFile({ capturePath, outputPath });
  process.stdout.write(`Created anonymized ${evidence.status} Tailscale Serve evidence: ${path.resolve(outputPath)}\n`);
}

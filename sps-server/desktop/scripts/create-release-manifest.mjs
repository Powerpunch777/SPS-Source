import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");

function yamlScalar(source, key) {
  const match = source.match(new RegExp(`^${key}:\\s*['"]?([^\\r\\n'"]+)['"]?\\s*$`, "m"));
  return match?.[1]?.trim() || null;
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function runtimePackArtifacts(distRoot) {
  const catalogPath = path.join(distRoot, "sps-agent-runtime-packs.json");
  let catalog;
  try {
    catalog = JSON.parse((await readFile(catalogPath, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return [];
  }
  if (!Array.isArray(catalog?.packs)) throw new Error("Agent Runtime pack catalog is invalid.");
  return Promise.all(catalog.packs.map(async (pack) => {
    if (typeof pack?.archive !== "string" || !/^SPS-Agent-Runtime-Pack-[A-Za-z0-9._-]+-[A-Za-z0-9._-]+\.zip$/.test(pack.archive)) {
      throw new Error("Agent Runtime pack catalog contains an unsafe archive name.");
    }
    const archivePath = path.join(distRoot, pack.archive);
    const archive = await stat(archivePath);
    return {
      id: pack.id,
      label: pack.label,
      version: pack.version,
      commands: pack.commands,
      file: pack.archive,
      sizeBytes: archive.size,
      sha256: await sha256(archivePath),
    };
  }));
}

export async function createSpsReleaseManifest({
  runtimeRoot = path.join(desktopRoot, ".owner-host-runtime"),
  distRoot = path.join(desktopRoot, "dist"),
  outputPath = path.join(distRoot, "sps-release-manifest.json"),
} = {}) {
  const baseline = JSON.parse(await readFile(path.join(runtimeRoot, "sps-release-baseline.json"), "utf8"));
  const updateMetadataPath = path.join(distRoot, "latest.yml");
  const updateMetadata = await readFile(updateMetadataPath, "utf8");
  const metadataVersion = yamlScalar(updateMetadata, "version");
  const metadataInstaller = yamlScalar(updateMetadata, "path");
  const expectedInstaller = `SPS-Desktop-Setup-${baseline.desktopVersion}.exe`;

  if (metadataVersion !== baseline.desktopVersion) {
    throw new Error(`latest.yml version ${metadataVersion ?? "missing"} does not match ${baseline.desktopVersion}.`);
  }
  if (metadataInstaller !== expectedInstaller) {
    throw new Error(`latest.yml installer ${metadataInstaller ?? "missing"} does not match ${expectedInstaller}.`);
  }

  const installerPath = path.join(distRoot, expectedInstaller);
  let installerStats;
  try {
    installerStats = await stat(installerPath);
  } catch {
    throw new Error(`Release output is missing the expected installer ${expectedInstaller}.`);
  }
  if (!installerStats.isFile()) throw new Error(`Release installer is not a file: ${expectedInstaller}.`);
  const manifest = {
    schemaVersion: 1,
    baseline,
    artifacts: {
      installer: {
        file: expectedInstaller,
        sizeBytes: installerStats.size,
        sha256: await sha256(installerPath),
      },
      updateMetadata: {
        file: "latest.yml",
        sha256: await sha256(updateMetadataPath),
      },
      blockmap: {
        file: `${expectedInstaller}.blockmap`,
        sha256: await sha256(path.join(distRoot, `${expectedInstaller}.blockmap`)),
      },
      agentRuntimePacks: await runtimePackArtifacts(distRoot),
    },
  };
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.join(desktopRoot, "dist");
  await createSpsReleaseManifest({ distRoot });
  console.log(`Created SPS release manifest: ${path.join(distRoot, "sps-release-manifest.json")}`);
}

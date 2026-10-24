import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const require = createRequire(import.meta.url);
const { buildBlockMap } = require("app-builder-lib/out/targets/blockmap/blockmap.js");

function sha512(content) {
  return createHash("sha512").update(content).digest("base64");
}

export async function writeSpsUpdateMetadata({
  runtimeRoot = path.join(desktopRoot, ".owner-host-runtime"),
  distRoot = path.join(desktopRoot, "dist"),
  releasedAt = new Date(),
} = {}) {
  const baseline = JSON.parse(await readFile(path.join(runtimeRoot, "sps-release-baseline.json"), "utf8"));
  const version = baseline?.desktopVersion;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("SPS release baseline must declare a valid desktop version.");
  }

  const installer = `SPS-Desktop-Setup-${version}.exe`;
  const installerPath = path.join(distRoot, installer);
  const installerStats = await stat(installerPath);
  if (!installerStats.isFile()) throw new Error(`SPS installer is not a file: ${installer}`);
  await buildBlockMap(installerPath, "gzip", `${installerPath}.blockmap`);

  const metadata = {
    version,
    files: [{
      url: installer,
      sha512: sha512(await readFile(installerPath)),
      size: installerStats.size,
    }],
    path: installer,
    sha512: sha512(await readFile(installerPath)),
    releaseDate: releasedAt.toISOString(),
  };
  const yaml = [
    `version: ${metadata.version}`,
    "files:",
    `  - url: ${metadata.files[0].url}`,
    `    sha512: ${metadata.files[0].sha512}`,
    `    size: ${metadata.files[0].size}`,
    `path: ${metadata.path}`,
    `sha512: ${metadata.sha512}`,
    `releaseDate: '${metadata.releaseDate}'`,
    "",
  ].join("\n");
  const outputPath = path.join(distRoot, "latest.yml");
  await writeFile(outputPath, yaml, "utf8");
  return { outputPath, metadata };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await writeSpsUpdateMetadata();
  console.log(`Wrote SPS update metadata: ${result.outputPath}`);
}

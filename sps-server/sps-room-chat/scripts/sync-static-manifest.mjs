import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifestPath = resolve(root, "dist", "manifest.js");
const manifestSource = await readFile(manifestPath, "utf8");
const manifestModule = await import(`${pathToFileURL(manifestPath).href}?v=${encodeURIComponent(packageJson.version)}`);
const manifest = manifestModule.default;

if (!manifest?.id || !manifest?.apiVersion || !Array.isArray(manifest?.capabilities)) {
  throw new Error("Built Room Workplane manifest is incomplete.");
}

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const staticManifest = {
  schemaVersion: 1,
  plugin: {
    id: manifest.id,
    version: packageJson.version,
    apiVersion: String(manifest.apiVersion),
  },
  runtime: {
    manifestEntry: "dist/manifest.js",
    manifestSha256: sha256(manifestSource),
  },
  capabilities: manifest.capabilities,
  permissionsDigest: sha256(JSON.stringify(manifest.capabilities)),
};

await writeFile(
  resolve(root, "sps-plugin.json"),
  `${JSON.stringify(staticManifest, null, 2)}\n`,
  "utf8",
);

console.log(`Synchronized static Room Workplane manifest for v${packageJson.version}.`);

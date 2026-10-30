import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { writeGeneratedFileAtomic } from "./generated-file-writer.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = String(packageJson.version || "").trim();
if (!version) throw new Error("Room Chat plugin package.json must declare a version.");
const files = [
  "team-workplane-profile.js",
  "codex-app-server-client.js",
  "agy-room-client.js"
];

await mkdir(resolve(root, "dist"), { recursive: true });
await build({
  entryPoints: [resolve(root, "src", "worker.js")],
  outfile: resolve(root, "dist", "worker.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  logLevel: "warning"
});
await Promise.all(
  files.map((file) => copyFile(resolve(root, "src", file), resolve(root, "dist", file)))
);
const versionPlaceholder = "__SPS_ROOM_PLUGIN_VERSION__";
const synchronizeVersion = (source) => source.replaceAll(versionPlaceholder, version);
const manifest = synchronizeVersion(await readFile(resolve(root, "src", "manifest.js"), "utf8"));
const workerPath = resolve(root, "dist", "worker.js");
const worker = synchronizeVersion(await readFile(workerPath, "utf8"));
if (manifest.includes(versionPlaceholder) || worker.includes(versionPlaceholder)) {
  throw new Error("Room Chat manifest version was not synchronized.");
}
await Promise.all([
  writeGeneratedFileAtomic(resolve(root, "dist", "manifest.js"), manifest),
  writeGeneratedFileAtomic(workerPath, worker)
]);

console.log(`Bundled Room worker with its SDK, synchronized v${version}, and copied ${files.length} support files.`);

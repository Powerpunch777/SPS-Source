import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = String(packageJson.version || "").trim();
if (!version) throw new Error("Room Chat plugin package.json must declare a version.");

const distDirectory = resolve(root, "dist");
const outputDirectoryName = `ui-v${version}`;
const outputDirectory = resolve(distDirectory, outputDirectoryName);
await mkdir(distDirectory, { recursive: true });
for (const entry of await readdir(distDirectory, { withFileTypes: true })) {
  if (!entry.name.startsWith("ui-v") || entry.name === outputDirectoryName) continue;
  await rm(resolve(distDirectory, entry.name), { recursive: true, force: true });
}
await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [resolve(root, "src", "ui", "RoomWorkplane.jsx")],
  outfile: resolve(outputDirectory, "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"],
  logLevel: "info"
});

console.log(`Bundled Room Chat UI for v${version}.`);

import { cp, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../../../external/sps-core/node_modules/esbuild/lib/main.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = String(packageJson.version || "").trim();
if (!version) throw new Error("Plugin Discovery package.json must declare a version.");

await mkdir(resolve(root, "dist"), { recursive: true });
await Promise.all([
  cp(resolve(root, "src", "manifest.js"), resolve(root, "dist", "manifest.js")),
  cp(resolve(root, "src", "worker.js"), resolve(root, "dist", "worker.js")),
  cp(resolve(root, "src", "catalog-tools.js"), resolve(root, "dist", "catalog-tools.js")),
  cp(resolve(root, "src", "conversation.js"), resolve(root, "dist", "conversation.js")),
]);

const outputDirectory = resolve(root, "dist", `ui-v${version}`);
await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [resolve(root, "src", "ui", "DiscoveryPage.jsx")],
  outfile: resolve(outputDirectory, "index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"],
  logLevel: "warning",
});

console.log(`Built Plugin Discovery v${version}.`);

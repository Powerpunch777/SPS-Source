import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "manifest.js",
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

console.log(`Bundled Room worker with its SDK and copied ${files.length} support files.`);

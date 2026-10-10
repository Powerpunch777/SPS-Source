import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = String(packageJson.version || "").trim();
if (!version) throw new Error("Plugin Builder package.json must declare a version.");
const publicPluginSdkRoot = resolve(root, "..", "..", "external", "sps-plugin-sdk");
const publicWorkerSdkEntry = resolve(publicPluginSdkRoot, "worker", "index.mjs");
const publicPlatformSdkEntry = resolve(publicPluginSdkRoot, "platform", "index.mjs");
try {
  await Promise.all([access(publicWorkerSdkEntry), access(publicPlatformSdkEntry)]);
} catch {
  throw new Error("The public SPS Plugin SDK is unavailable. Check out external/sps-plugin-sdk before packaging Plugin Builder.");
}

await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(resolve(root, "dist"), { recursive: true });
await Promise.all([
  cp(resolve(root, "src", "manifest.js"), resolve(root, "dist", "manifest.js")),
  cp(resolve(root, "src", "authoring.js"), resolve(root, "dist", "authoring.js")),
]);

// A bundled first-party Worker must be executable from either the source
// checkout or an installed Desktop runtime. Never rely on a parent
// node_modules layout that happens to exist on a developer machine.
await build({
  entryPoints: [resolve(root, "src", "worker.js")],
  outfile: resolve(root, "dist", "worker.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  alias: {
    "@sonparkserver/plugin-sdk/worker": publicWorkerSdkEntry,
    "@sonparkserver/plugin-sdk/platform": publicPlatformSdkEntry,
  },
  logLevel: "warning",
});

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
  external: ["react", "react-dom", "react/jsx-runtime", "@sonparkserver/plugin-sdk/ui/bridge"],
  logLevel: "warning",
});

console.log(`Built SPS Plugin Builder v${version}.`);

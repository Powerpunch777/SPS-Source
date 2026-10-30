import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electron = require("electron");
const { context } = createRequire(path.resolve(root, "../sps-room-chat/package.json"))("esbuild");
const contexts = [];
for (const [name, entry, external] of [
  ["sps-room-chat", "RoomWorkplane.jsx", ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"]],
  ["sps-plugin-discovery", "DiscoveryPage.jsx", ["react", "react-dom", "react/jsx-runtime", "@sonparkserver/plugin-sdk/ui/bridge"]],
  ["sps-memory", "MemoryTab.jsx", []],
]) {
  const cwd = path.resolve(root, "..", name);
  const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
  const memory = name === "sps-memory";
  const builder = await context({
    absWorkingDir: cwd,
    entryPoints: [path.join(cwd, "src/ui", entry)],
    outfile: path.join(cwd, "dist", memory ? "ui" : `ui-v${pkg.version}`, "index.js"),
    bundle: true, format: "esm", platform: "browser", target: "es2022",
    ...(memory ? { minify: true, sourcemap: true } : { jsx: "automatic" }),
    external, logLevel: "info",
  });
  contexts.push(builder);
  await builder.watch();
}

const env = { ...process.env, SPS_DESKTOP_DEV: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const app = spawn(electron, ["."], { cwd: root, env, stdio: "inherit", windowsHide: false });
app.once("error", error => { console.error(error); process.exitCode = 1; });
app.once("close", async code => {
  await Promise.all(contexts.map(builder => builder.dispose()));
  process.exit(code ?? 1);
});
console.log("[SPS dev] Development Desktop is starting with an isolated persistent profile.");
console.log("[SPS dev] Core UI: Vite HMR. Plugin UI: automatic incremental bundle and reload.");
console.log("[SPS dev] Main/preload/backend changes require restarting npm run dev, not packaging.");

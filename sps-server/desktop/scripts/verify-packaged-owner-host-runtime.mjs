import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const runtimeRoot = path.resolve(
  process.env.SPS_PACKAGED_OWNER_HOST_RUNTIME_ROOT
    || path.join(desktopRoot, "dist", "win-unpacked", "resources", "sps-owner-host-runtime"),
);

const requiredFiles = [
  "sps-owner-host-runtime.json",
  "sps-release-baseline.json",
  "sps-owner-host-bootstrap.mjs",
  "bin/node.exe",
  "dist/index.js",
  "ui-dist/index.html",
  "memory-sidecar/memory-sidecar.mjs",
  "sps-default-memory/dist/manifest.js",
  "sps-plugin-discovery/dist/manifest.js",
  "sps-room-chat/dist/manifest.js",
  "node_modules/@paperclipai/server/package.json",
  "node_modules/@sps/mcp-server/package.json",
  "node_modules/@sps/mcp-server/dist/marketplace-assistant-stdio.js",
];

const missing = [];
for (const relativePath of requiredFiles) {
  try {
    await access(path.join(runtimeRoot, relativePath));
  } catch {
    missing.push(relativePath);
  }
}

if (missing.length > 0) {
  throw new Error(
    `The packaged SPS Owner Host runtime is incomplete at ${runtimeRoot}. Missing: ${missing.join(", ")}`,
  );
}

const [runtimeManifest, releaseBaseline] = await Promise.all([
  readFile(path.join(runtimeRoot, "sps-owner-host-runtime.json"), "utf8").then(JSON.parse),
  readFile(path.join(runtimeRoot, "sps-release-baseline.json"), "utf8").then(JSON.parse),
]);

if (
  runtimeManifest.format < 8
  || runtimeManifest.releaseBaseline?.desktopVersion !== releaseBaseline.desktopVersion
  || runtimeManifest.releaseBaseline?.core?.revision !== releaseBaseline.core?.revision
) {
  throw new Error("The packaged SPS Owner Host runtime is missing a matching release baseline.");
}

if (!Array.isArray(runtimeManifest.agentRuntimePacks) || runtimeManifest.agentRuntimePacks.length < 2) {
  throw new Error("The packaged SPS Owner Host runtime is missing its explicit Agent Runtime pack contract.");
}

console.log(`Packaged SPS Owner Host runtime verification passed: ${runtimeRoot}`);

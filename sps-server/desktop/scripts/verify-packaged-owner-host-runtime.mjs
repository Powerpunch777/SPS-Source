import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materializeSpsOwnerHostRuntimePackage } from "../src/owner-host-runtime-package.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const desktopVersion = JSON.parse(await readFile(path.join(desktopRoot, "package.json"), "utf8")).version;
const packageRoot = path.join(desktopRoot, "dist", "win-unpacked", "resources", "sps-owner-host-runtime-package");
const runtimeRoot = path.resolve(process.env.SPS_PACKAGED_OWNER_HOST_RUNTIME_ROOT
  || path.join(desktopRoot, "dist", ".verified-owner-host-runtime", desktopVersion));
if (!process.env.SPS_PACKAGED_OWNER_HOST_RUNTIME_ROOT) {
  await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot: runtimeRoot });
}

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
  "node_modules/@paperclipai/skills-catalog/dist/src/canonical-bytes.js",
  "node_modules/@sps/mcp-server/package.json",
  "node_modules/@sps/mcp-server/dist/marketplace-assistant-stdio.js",
  "node_modules/acpx/node_modules/@agentclientprotocol/sdk/package.json",
  "node_modules/@embedded-postgres/windows-x64/dist/index.js",
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

const [runtimeManifest, releaseBaseline, windowsPostgresModule] = await Promise.all([
  readFile(path.join(runtimeRoot, "sps-owner-host-runtime.json"), "utf8").then(JSON.parse),
  readFile(path.join(runtimeRoot, "sps-release-baseline.json"), "utf8").then(JSON.parse),
  readFile(path.join(runtimeRoot, "node_modules", "@embedded-postgres", "windows-x64", "dist", "index.js"), "utf8"),
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

if (
  !runtimeManifest.acpxRuntimeCompatibility?.acpxVersion
  || !runtimeManifest.acpxRuntimeCompatibility?.sdkVersion
  || runtimeManifest.acpxRuntimeCompatibility?.sdkPackage
    !== "node_modules/acpx/node_modules/@agentclientprotocol/sdk/package.json"
) {
  throw new Error("The packaged SPS Owner Host runtime is missing its ACPX dependency closure contract.");
}

await new Promise((resolve, reject) => {
  const child = spawn(path.join(runtimeRoot, "bin", "node.exe"), [
    "--input-type=module",
    "--eval",
    "await import('acpx/runtime')",
  ], {
    cwd: runtimeRoot,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.once("error", reject);
  child.once("exit", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`The packaged SPS Owner Host ACPX runtime cannot load (${code}): ${stderr.trim()}`));
  });
});

if (
  runtimeManifest.windowsPostgresUnicodePathCompatibility?.version !== "18.1.0-beta.16"
  || !windowsPostgresModule.includes("SPS_EMBEDDED_POSTGRES_BINARY_DIR")
) {
  throw new Error("The packaged SPS Owner Host runtime is missing Windows PostgreSQL Unicode-path compatibility.");
}

console.log(`Packaged SPS Owner Host runtime verification passed: ${runtimeRoot}`);

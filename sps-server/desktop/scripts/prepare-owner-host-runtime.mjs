import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const workspaceRoot = path.resolve(desktopRoot, "..", "..");
const coreRoot = path.resolve(process.env.SPS_HOST_CORE_ROOT || path.join(workspaceRoot, "external", "sps-core"));
const runtimeRoot = path.join(desktopRoot, ".owner-host-runtime");

function assertDesktopBuildPath(target) {
  const relative = path.relative(desktopRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify a path outside SPS Desktop: ${target}`);
  }
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code ?? "unknown"}.`));
    });
  });
}

async function resolvePnpmInvocation() {
  const configuredPnpmCli = process.env.SPS_PNPM_CLI?.trim();
  if (configuredPnpmCli) {
    const cliPath = path.resolve(configuredPnpmCli);
    await requireFile(cliPath, "SPS_PNPM_CLI does not point to a pnpm CLI file.");
    return { command: process.execPath, prefixArgs: [cliPath] };
  }
  if (process.platform !== "win32") return { command: "pnpm", prefixArgs: [] };
  const pathEntries = String(process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const directory of pathEntries) {
    const commandFile = path.join(directory, "pnpm.cmd");
    let source;
    try {
      source = await readFile(commandFile, "utf8");
    } catch {
      continue;
    }
    const match = source.match(/"%~dp0([^\"]*node\.exe)"\s+"%~dp0([^\"]*pnpm\.(?:mjs|cjs))"/i);
    if (!match) continue;
    return {
      command: path.resolve(directory, match[1].replaceAll("\\", path.sep)),
      prefixArgs: [path.resolve(directory, match[2].replaceAll("\\", path.sep))],
    };
  }
  throw new Error("Could not locate a direct pnpm runtime. Install pnpm or set a pnpm.cmd entry on PATH.");
}

async function requireFile(entry, message) {
  try {
    await access(entry);
  } catch {
    throw new Error(message);
  }
}

async function buildOwnerHostCoreArtifacts() {
  const dbTsconfig = path.join(coreRoot, "packages", "db", "tsconfig.json");
  const serverTsconfig = path.join(coreRoot, "server", "tsconfig.json");
  const tscCli = path.join(coreRoot, "node_modules", "typescript", "bin", "tsc");
  await requireFile(tscCli, "SPS Owner Host requires the Core TypeScript compiler. Run pnpm install in external/sps-core first.");
  await requireFile(dbTsconfig, "SPS Owner Host database TypeScript config is missing.");
  await requireFile(serverTsconfig, "SPS Owner Host server TypeScript config is missing.");

  // pnpm deploy packages built output, not the workspace TypeScript sources.
  // Rebuild the two runtime packages here so a Desktop release cannot ship
  // stale database/server code after a Core update.
  await run(process.execPath, [tscCli, "-p", dbTsconfig], coreRoot);
  await run(process.execPath, [tscCli, "-p", serverTsconfig], coreRoot);
}

async function normalizeWorkspacePackageExports(runtimeRoot) {
  const workspaceScopeRoot = path.join(runtimeRoot, "node_modules", "@paperclipai");
  let entries;
  try {
    entries = await readdir(workspaceScopeRoot, { withFileTypes: true });
  } catch {
    throw new Error("SPS Owner Host runtime is missing its workspace packages.");
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageFile = path.join(workspaceScopeRoot, entry.name, "package.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(packageFile, "utf8"));
    } catch {
      continue;
    }
    const published = manifest.publishConfig;
    if (!published?.exports) continue;
    manifest.exports = published.exports;
    if (published.main) manifest.main = published.main;
    if (published.types) manifest.types = published.types;
    await rm(packageFile, { force: true });
    await writeFile(packageFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
}

const SPS_BUNDLED_OWNER_HOST_PLUGINS = [
  "sps-default-memory",
  "sps-room-chat",
];

async function copyBundledSpsNodeRuntime(runtimeRoot) {
  // The deployed Core includes native dependencies. Run it with the same Node
  // executable that prepared those dependencies instead of Electron's bundled
  // Node, whose ABI can differ from the release build environment.
  const executableName = process.platform === "win32" ? "node.exe" : "node";
  const nodeTarget = path.join(runtimeRoot, "bin", executableName);
  await requireFile(process.execPath, "SPS Owner Host requires a Node.js executable while preparing the Desktop runtime.");
  await mkdir(path.dirname(nodeTarget), { recursive: true });
  await cp(process.execPath, nodeTarget);
  return { executableName, version: process.version };
}

async function copyBundledSpsPluginRuntime(runtimeRoot) {
  for (const pluginName of SPS_BUNDLED_OWNER_HOST_PLUGINS) {
    const pluginSource = path.join(spsServerRoot, pluginName);
    const pluginTarget = path.join(runtimeRoot, pluginName);
    await requireFile(path.join(pluginSource, "package.json"), `Bundled SPS plugin is missing its package manifest: ${pluginName}.`);
    await requireFile(path.join(pluginSource, "dist", "manifest.js"), `Bundled SPS plugin is not built: ${pluginName}.`);
    await cp(pluginSource, pluginTarget, {
      recursive: true,
      filter: (entry) => !["node_modules", "package-lock.json", "scripts", "src", "tests"].includes(path.basename(entry)),
    });
  }

  const sidecarSource = path.join(spsServerRoot, "memory-sidecar", "memory-sidecar.mjs");
  const sidecarTarget = path.join(runtimeRoot, "memory-sidecar", "memory-sidecar.mjs");
  await requireFile(sidecarSource, "SPS Default Memory sidecar source is missing.");
  await mkdir(path.dirname(sidecarTarget), { recursive: true });
  await cp(sidecarSource, sidecarTarget);
}

async function writeOwnerHostBootstrap(runtimeRoot) {
  const bootstrapPath = path.join(runtimeRoot, "sps-owner-host-bootstrap.mjs");
  const source = [
    "// SPS Desktop owns onboarding and configuration. Start the packaged server directly",
    "// instead of routing Electron-as-Node through the general-purpose CLI parser.",
    "import { cleanupWindowsSubstMappings } from '@paperclipai/db';",
    "import { startServer } from '@paperclipai/server';",
    "const releaseWindowsNativeMappings = () => cleanupWindowsSubstMappings();",
    "process.prependOnceListener('SIGINT', releaseWindowsNativeMappings);",
    "process.prependOnceListener('SIGTERM', releaseWindowsNativeMappings);",
    "process.once('exit', releaseWindowsNativeMappings);",
    "try {",
    "  await startServer();",
    "} catch (error) {",
    "  releaseWindowsNativeMappings();",
    "  console.error('SPS Owner Host failed to start.', error instanceof Error ? error.stack ?? error.message : String(error));",
    "  process.exitCode = 1;",
    "}",
    "",
  ].join("\n");
  await writeFile(bootstrapPath, source, "utf8");
}

await requireFile(
  path.join(coreRoot, "cli", "dist", "index.js"),
  "SPS Owner Host CLI is not built. Build SPS Core before packaging SPS Desktop.",
);
await requireFile(
  path.join(coreRoot, "node_modules"),
  "SPS Core dependencies are missing. Run pnpm install in external/sps-core first.",
);
await buildOwnerHostCoreArtifacts();

assertDesktopBuildPath(runtimeRoot);
await rm(runtimeRoot, { recursive: true, force: true });
await mkdir(runtimeRoot, { recursive: true });

const pnpm = await resolvePnpmInvocation();
await run(
  pnpm.command,
  [
    ...pnpm.prefixArgs,
    "--dir", coreRoot,
    "--config.injectWorkspacePackages=true",
    "--config.dangerouslyAllowAllBuilds=true",
    "--config.node-linker=hoisted",
    "--filter", "paperclipai",
    "deploy",
    "--prod",
    runtimeRoot,
  ],
  workspaceRoot,
);

await normalizeWorkspacePackageExports(runtimeRoot);
await writeOwnerHostBootstrap(runtimeRoot);
await run(process.execPath, ["--import", "tsx", "-e", "await import('@paperclipai/server')"], runtimeRoot);
await copyBundledSpsPluginRuntime(runtimeRoot);
const bundledNode = await copyBundledSpsNodeRuntime(runtimeRoot);
await writeFile(
  path.join(runtimeRoot, "sps-owner-host-runtime.json"),
  `${JSON.stringify({
    format: 6,
    entry: "dist/index.js",
    loader: "node-esm",
    vendorDirectory: "node_modules",
    nodeRuntime: bundledNode,
    bundledDefaultMemory: true,
    version: process.env.npm_package_version || "development",
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared SPS Owner Host runtime: ${runtimeRoot}`);

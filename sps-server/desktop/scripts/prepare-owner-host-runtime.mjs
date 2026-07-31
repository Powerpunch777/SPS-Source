import { access, chmod, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeSpsReleaseBaseline } from "./release-baseline.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, "..");
const spsServerRoot = path.resolve(desktopRoot, "..");
const workspaceRoot = path.resolve(desktopRoot, "..", "..");
const coreRoot = path.resolve(process.env.SPS_HOST_CORE_ROOT || path.join(workspaceRoot, "external", "sps-core"));
const defaultRuntimeRoot = path.join(desktopRoot, ".owner-host-runtime");
const runtimeRoot = path.resolve(process.env.SPS_DESKTOP_RUNTIME_OUTPUT?.trim() || defaultRuntimeRoot);
const defaultAgentRuntimePacksRoot = path.join(desktopRoot, ".agent-runtime-packs");
const agentRuntimePacksRoot = path.resolve(process.env.SPS_DESKTOP_AGENT_RUNTIME_PACKS_OUTPUT?.trim() || defaultAgentRuntimePacksRoot);
const releaseBaselinePath = path.join(runtimeRoot, "sps-release-baseline.json");

function assertDesktopBuildPath(target) {
  const relative = path.relative(desktopRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify a path outside SPS Desktop: ${target}`);
  }
}

function nodeModulesPackagePath(nodeModulesRoot, packageName) {
  return path.join(nodeModulesRoot, ...packageName.split("/"));
}

async function pathExists(entry) {
  try {
    await access(entry);
    return true;
  } catch {
    return false;
  }
}

async function copyRuntimePackageClosure({ sourceNodeModules, targetNodeModules, packageNames }) {
  const queue = packageNames.map((name) => ({ name, required: true }));
  const visited = new Set();
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.name)) continue;
    visited.add(next.name);
    const source = nodeModulesPackagePath(sourceNodeModules, next.name);
    if (!await pathExists(source)) {
      if (next.required) throw new Error(`Agent Runtime pack dependency is missing: ${next.name}`);
      continue;
    }
    const manifestPath = path.join(source, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const target = nodeModulesPackagePath(targetNodeModules, next.name);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, dereference: true });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      queue.push({ name: dependency, required: true });
    }
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
      queue.push({ name: dependency, required: false });
    }
  }
}

async function writeAgentRuntimePackWrapper({ packRoot, command, entry }) {
  const binRoot = path.join(packRoot, "bin");
  await mkdir(binRoot, { recursive: true });
  if (process.platform === "win32") {
    const wrapperPath = path.join(binRoot, `${command}.cmd`);
    const relativeEntry = entry.split("/").join("\\");
    await writeFile(wrapperPath, [
      "@echo off",
      "setlocal",
      "if not defined SPS_OWNER_HOST_NODE (",
      "  echo SPS_OWNER_HOST_NODE is not configured. >&2",
      "  exit /b 1",
      ")",
      `\"%SPS_OWNER_HOST_NODE%\" \"%~dp0..\\${relativeEntry}\" %*`,
      "",
    ].join("\r\n"), "utf8");
    return "bin/" + command + ".cmd";
  }
  const wrapperPath = path.join(binRoot, command);
  await writeFile(wrapperPath, [
    "#!/usr/bin/env sh",
    "if [ -z \"${SPS_OWNER_HOST_NODE:-}\" ]; then",
    "  echo 'SPS_OWNER_HOST_NODE is not configured.' >&2",
    "  exit 1",
    "fi",
    `exec \"$SPS_OWNER_HOST_NODE\" \"$(dirname \"$0\")/../${entry}\" \"$@\"`,
    "",
  ].join("\n"), "utf8");
  await chmod(wrapperPath, 0o755);
  return `bin/${command}`;
}

const SPS_AGENT_RUNTIME_PACKS = [
  {
    id: "codex-acp",
    label: "Codex ACP",
    command: "codex-acp",
    entry: "node_modules/@agentclientprotocol/codex-acp/dist/index.js",
    packages: ["@agentclientprotocol/codex-acp"],
  },
  {
    id: "claude-acp",
    label: "Claude ACP",
    command: "claude-agent-acp",
    entry: "node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js",
    packages: ["@agentclientprotocol/claude-agent-acp"],
  },
];

async function prepareAgentRuntimePacks(runtimeRoot, packRoot) {
  assertDesktopBuildPath(packRoot);
  const sourceNodeModules = path.join(runtimeRoot, "node_modules");
  const version = process.env.npm_package_version || "development";
  await rm(packRoot, { recursive: true, force: true });
  const prepared = [];
  for (const definition of SPS_AGENT_RUNTIME_PACKS) {
    const targetRoot = path.join(packRoot, definition.id, version);
    await copyRuntimePackageClosure({
      sourceNodeModules,
      targetNodeModules: path.join(targetRoot, "node_modules"),
      packageNames: definition.packages,
    });
    const command = await writeAgentRuntimePackWrapper({
      packRoot: targetRoot,
      command: definition.command,
      entry: definition.entry,
    });
    await writeFile(path.join(targetRoot, "sps-agent-runtime-pack.json"), `${JSON.stringify({
      format: 1,
      id: definition.id,
      label: definition.label,
      version,
      platform: process.platform,
      arch: process.arch,
      commands: { [definition.command]: command },
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`, "utf8");
    prepared.push({ id: definition.id, version, command: definition.command });
  }

  // The Core keeps adapter contracts, but vendor ACP bridges and their native
  // provider binaries belong to explicit packs. Remove both packages and stale
  // npm shims so an absent pack is reported as unavailable rather than failing
  // halfway through an Agent turn.
  for (const packageName of [
    "@agentclientprotocol/codex-acp",
    "@agentclientprotocol/claude-agent-acp",
    "@agentclientprotocol/sdk",
    "@openai/codex",
    "@openai/codex-win32-x64",
    "@openai/codex-win32-arm64",
    "@anthropic-ai/claude-agent-sdk",
    "@anthropic-ai/claude-agent-sdk-win32-x64",
    "@anthropic-ai/claude-agent-sdk-win32-arm64",
  ]) {
    await rm(nodeModulesPackagePath(sourceNodeModules, packageName), { recursive: true, force: true });
  }
  for (const command of ["codex-acp", "claude-agent-acp"]) {
    for (const suffix of ["", ".cmd", ".ps1"]) {
      await rm(path.join(sourceNodeModules, ".bin", `${command}${suffix}`), { force: true });
    }
  }
  await writeFile(path.join(packRoot, "sps-agent-runtime-packs.json"), `${JSON.stringify({
    format: 1,
    desktopVersion: version,
    packs: prepared,
  }, null, 2)}\n`, "utf8");
  return prepared;
}

function run(command, args, cwd, { shell = false, environment = {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      windowsHide: true,
      shell,
      env: { ...process.env, ...environment },
    });
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
    const environment = { npm_execpath: cliPath };
    if (process.platform === "win32") {
      if ([process.execPath, cliPath].some((entry) => /[%"\r\n]/.test(entry))) {
        throw new Error("SPS_PNPM_CLI and node.exe must use batch-safe Windows paths.");
      }
      const shimDirectory = path.join(spsServerRoot, ".tmp", `pnpm-cli-shim-${process.pid}`);
      await mkdir(shimDirectory, { recursive: true });
      await writeFile(
        path.join(shimDirectory, "pnpm.cmd"),
        `@echo off\r\n"${process.execPath}" "${cliPath}" %*\r\n`,
        "utf8",
      );
      environment.PATH = `${shimDirectory}${path.delimiter}${process.env.PATH || ""}`;
    }
    return { command: process.execPath, prefixArgs: [cliPath], environment };
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
  for (const directory of pathEntries) {
    const commandFile = path.join(directory, "pnpm.cmd");
    try {
      await access(commandFile);
      return { command: commandFile, prefixArgs: [], shell: true };
    } catch {
      // Keep searching PATH for a usable pnpm.cmd wrapper.
    }
  }
  throw new Error("Could not locate a pnpm runtime. Install pnpm or set SPS_PNPM_CLI.");
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
  const dbPackageRoot = path.join(coreRoot, "packages", "db");
  const sharedTsconfig = path.join(coreRoot, "packages", "shared", "tsconfig.json");
  const adapterUtilsTsconfig = path.join(coreRoot, "packages", "adapter-utils", "tsconfig.json");
  const codexAdapterTsconfig = path.join(coreRoot, "packages", "adapters", "codex-local", "tsconfig.json");
  const claudeAdapterTsconfig = path.join(coreRoot, "packages", "adapters", "claude-local", "tsconfig.json");
  const serverTsconfig = path.join(coreRoot, "server", "tsconfig.json");
  const prepareServerUiDist = path.join(coreRoot, "scripts", "prepare-server-ui-dist.mjs");
  const tscCli = path.join(coreRoot, "node_modules", "typescript", "bin", "tsc");
  await requireFile(tscCli, "SPS Owner Host requires the Core TypeScript compiler. Run pnpm install in external/sps-core first.");
  await requireFile(dbTsconfig, "SPS Owner Host database TypeScript config is missing.");
  await requireFile(sharedTsconfig, "SPS Owner Host shared-contract TypeScript config is missing.");
  await requireFile(adapterUtilsTsconfig, "SPS Owner Host adapter utility TypeScript config is missing.");
  await requireFile(codexAdapterTsconfig, "SPS Owner Host Codex adapter TypeScript config is missing.");
  await requireFile(claudeAdapterTsconfig, "SPS Owner Host Claude adapter TypeScript config is missing.");
  await requireFile(serverTsconfig, "SPS Owner Host server TypeScript config is missing.");
  await requireFile(prepareServerUiDist, "SPS Owner Host UI packaging script is missing.");

  // pnpm deploy packages built output, not the workspace TypeScript sources.
  // Rebuild every runtime package in dependency order. pnpm deploy copies
  // built output, so compiling only the server can otherwise package stale
  // shared contract exports beside a freshly compiled server.
  // The DB package build copies SQL migrations into dist/migrations. A plain
  // TypeScript compile leaves that directory stale, which can make a Desktop
  // update run newer routes against an older on-disk schema.
  const pnpm = await resolvePnpmInvocation();
  await run(
    pnpm.command,
    [...pnpm.prefixArgs, "--dir", dbPackageRoot, "run", "build"],
    coreRoot,
    { shell: pnpm.shell, environment: pnpm.environment },
  );
  await run(process.execPath, [tscCli, "-p", sharedTsconfig], coreRoot);
  await run(process.execPath, [tscCli, "-p", adapterUtilsTsconfig], coreRoot);
  await run(process.execPath, [tscCli, "-p", codexAdapterTsconfig], coreRoot);
  await run(process.execPath, [tscCli, "-p", claudeAdapterTsconfig], coreRoot);
  await run(process.execPath, [tscCli, "-p", serverTsconfig], coreRoot);
  await run(process.execPath, [prepareServerUiDist], coreRoot);
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
  "sps-plugin-discovery",
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

async function copyBundledSpsPluginDeveloperKit(runtimeRoot) {
  const sourceNodeModules = path.join(desktopRoot, "node_modules");
  const targetNodeModules = path.join(runtimeRoot, "developer-kit", "node_modules");
  await requireFile(
    path.join(sourceNodeModules, "@sonparkserver", "plugin-sdk", "cli", "sps-plugin.mjs"),
    "SPS Plugin SDK is missing. Install SPS Desktop dependencies before packaging.",
  );
  await copyRuntimePackageClosure({
    sourceNodeModules,
    targetNodeModules,
    packageNames: ["@sonparkserver/plugin-sdk"],
  });
  return {
    cli: "developer-kit/node_modules/@sonparkserver/plugin-sdk/cli/sps-plugin.mjs",
  };
}

async function writeOwnerHostBootstrap(runtimeRoot) {
  const bootstrapPath = path.join(runtimeRoot, "sps-owner-host-bootstrap.mjs");
  const source = [
    "// SPS Desktop owns onboarding and configuration. Start the packaged server directly",
    "// instead of routing Electron-as-Node through the general-purpose CLI parser.",
    "import { cleanupWindowsSubstMappings } from '@paperclipai/db';",
    "import { readFile } from 'node:fs/promises';",
    "import { startServer } from '@paperclipai/server';",
    "const runtimeMetadata = JSON.parse(await readFile(new URL('./sps-owner-host-runtime.json', import.meta.url), 'utf8'));",
    "process.env.PAPERCLIP_HOST_VERSION ||= runtimeMetadata.releaseBaseline?.desktopVersion || runtimeMetadata.version || '0.0.0';",
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
  { shell: pnpm.shell, environment: pnpm.environment },
);

await normalizeWorkspacePackageExports(runtimeRoot);
const serverUiDist = path.join(coreRoot, "server", "ui-dist");
await requireFile(path.join(serverUiDist, "index.html"), "SPS Owner Host static UI is missing after the Core build.");
await cp(serverUiDist, path.join(runtimeRoot, "ui-dist"), { recursive: true });
await writeOwnerHostBootstrap(runtimeRoot);
await run(process.execPath, ["--import", "tsx", "-e", "await import('@paperclipai/server')"], runtimeRoot);
await copyBundledSpsPluginRuntime(runtimeRoot);
const pluginDeveloperKit = await copyBundledSpsPluginDeveloperKit(runtimeRoot);
const bundledNode = await copyBundledSpsNodeRuntime(runtimeRoot);
const agentRuntimePacks = await prepareAgentRuntimePacks(runtimeRoot, agentRuntimePacksRoot);
const releaseBaseline = await writeSpsReleaseBaseline({
  outputPath: releaseBaselinePath,
  workspaceRoot,
  desktopRoot,
  spsServerRoot,
  coreRoot,
});
await writeFile(
  path.join(runtimeRoot, "sps-owner-host-runtime.json"),
  `${JSON.stringify({
    format: 8,
    entry: "dist/index.js",
    loader: "node-esm",
    vendorDirectory: "node_modules",
    nodeRuntime: bundledNode,
    bundledDefaultMemory: true,
    pluginDeveloperKit,
    agentRuntimePacks,
    version: process.env.npm_package_version || "development",
    releaseBaseline,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared SPS Owner Host runtime: ${runtimeRoot}`);

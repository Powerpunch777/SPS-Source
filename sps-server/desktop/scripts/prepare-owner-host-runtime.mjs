import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
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

async function copyBundledSpsMemoryRuntime(runtimeRoot) {
  const providerSource = path.join(spsServerRoot, "sps-default-memory");
  const providerTarget = path.join(runtimeRoot, "sps-default-memory");
  const sidecarSource = path.join(spsServerRoot, "memory-sidecar", "memory-sidecar.mjs");
  const sidecarTarget = path.join(runtimeRoot, "memory-sidecar", "memory-sidecar.mjs");
  await requireFile(path.join(providerSource, "package.json"), "SPS Default Memory provider package is missing.");
  await requireFile(sidecarSource, "SPS Default Memory sidecar source is missing.");
  await cp(providerSource, providerTarget, {
    recursive: true,
    filter: (entry) => !["node_modules", "package-lock.json"].includes(path.basename(entry)),
  });
  await mkdir(path.dirname(sidecarTarget), { recursive: true });
  await cp(sidecarSource, sidecarTarget);
}

await requireFile(
  path.join(coreRoot, "cli", "dist", "index.js"),
  "SPS Owner Host CLI is not built. Build SPS Core before packaging SPS Desktop.",
);
await requireFile(
  path.join(coreRoot, "node_modules"),
  "SPS Core dependencies are missing. Run pnpm install in external/sps-core first.",
);

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
await run(process.execPath, ["--import", "tsx", "dist/index.js", "run", "--help"], runtimeRoot);
await run(process.execPath, ["--import", "tsx", "-e", "await import('@paperclipai/server')"], runtimeRoot);
await copyBundledSpsMemoryRuntime(runtimeRoot);
await rename(path.join(runtimeRoot, "node_modules"), path.join(runtimeRoot, "sps-vendor"));
await writeFile(
  path.join(runtimeRoot, "sps-owner-host-runtime.json"),
  `${JSON.stringify({
    format: 2,
    entry: "dist/index.js",
    loader: "tsx",
    vendorDirectory: "sps-vendor",
    bundledDefaultMemory: true,
    version: process.env.npm_package_version || "development",
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`,
  "utf8",
);

console.log(`Prepared SPS Owner Host runtime: ${runtimeRoot}`);

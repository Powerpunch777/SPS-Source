import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function ensureElectronRuntime({
  desktopRoot = join(dirname(fileURLToPath(import.meta.url)), ".."),
  platform = process.platform,
  nodeExecutable = process.execPath,
  env = process.env,
  exists = existsSync,
  spawn = spawnSync,
} = {}) {
  const electronRoot = join(desktopRoot, "node_modules", "electron");
  const runtimePath = join(electronRoot, "dist", platform === "win32" ? "electron.exe" : "electron");
  if (exists(runtimePath)) return runtimePath;
  const installerPath = join(electronRoot, "install.js");
  if (!exists(installerPath)) {
    throw new Error("Electron package is unavailable after dependency installation.");
  }

  const result = spawn(nodeExecutable, [installerPath], {
    cwd: electronRoot,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0 || !exists(runtimePath)) {
    throw new Error(`Electron runtime installation failed (exit ${result.status ?? "unknown"}).`);
  }
  return runtimePath;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  console.log(`Electron runtime ready: ${ensureElectronRuntime()}`);
}

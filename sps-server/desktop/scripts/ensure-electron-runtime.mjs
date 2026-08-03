import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronRoot = join(desktopRoot, "node_modules", "electron");
const runtimePath = join(
  electronRoot,
  "dist",
  process.platform === "win32" ? "electron.exe" : "electron",
);

if (!existsSync(runtimePath)) {
  const installerPath = join(electronRoot, "install.js");
  if (!existsSync(installerPath)) {
    throw new Error("Electron package is unavailable after dependency installation.");
  }

  const result = spawnSync(process.execPath, [installerPath], {
    cwd: electronRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0 || !existsSync(runtimePath)) {
    throw new Error(`Electron runtime installation failed (exit ${result.status ?? "unknown"}).`);
  }
}

console.log(`Electron runtime ready: ${runtimePath}`);

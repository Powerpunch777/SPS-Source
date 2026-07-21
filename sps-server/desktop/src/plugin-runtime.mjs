import { execFile } from "node:child_process";

function run(command, args, execFileImpl) {
  return new Promise((resolve, reject) => {
    execFileImpl(command, args, { windowsHide: true, timeout: 5_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(String(stdout ?? "").trim());
    });
  });
}

export async function inspectSpsPluginRuntime({
  platform = process.platform,
  npmCommand = process.env.SPS_PLUGIN_NPM_COMMAND?.trim() || null,
  execFileImpl = execFile,
} = {}) {
  const candidates = npmCommand
    ? [npmCommand]
    : platform === "win32" ? ["npm.cmd", "npm"] : ["npm"];
  let lastError = null;
  for (const command of candidates) {
    try {
      const version = await run(command, ["--version"], execFileImpl);
      if (!version) throw new Error("npm did not report a version.");
      return {
        state: "ready",
        command,
        version,
        message: "npm plugins and local-folder plugins are available.",
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    state: "local-folder-only",
    command: null,
    version: null,
    message: "npm is unavailable. Install Node.js on this computer to add npm plugins; local-folder plugins remain available.",
    lastError,
  };
}

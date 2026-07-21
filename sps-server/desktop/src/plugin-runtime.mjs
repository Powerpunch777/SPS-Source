import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

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
  environment = process.env,
  existsSyncImpl = existsSync,
  execFileImpl = execFile,
} = {}) {
  const candidates = npmCommand
    ? [{ command: npmCommand, args: [], npmCli: null }]
    : npmCandidates({ platform, environment, existsSyncImpl });
  let lastError = null;
  for (const candidate of candidates) {
    try {
      const version = await run(candidate.command, [...candidate.args, "--version"], execFileImpl);
      if (!version) throw new Error("npm did not report a version.");
      return {
        state: "ready",
        command: candidate.command,
        npmCli: candidate.npmCli,
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
    npmCli: null,
    version: null,
    message: "npm is unavailable. Install Node.js on this computer to add npm plugins; local-folder plugins remain available.",
    lastError,
  };
}

function npmCandidates({ platform, environment, existsSyncImpl }) {
  if (platform !== "win32") return [{ command: "npm", args: [], npmCli: null }];
  const installedCommands = [
    environment.ProgramW6432,
    environment.ProgramFiles,
    environment["ProgramFiles(x86)"],
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => ({
      node: path.join(value, "nodejs", "node.exe"),
      npmCli: path.join(value, "nodejs", "node_modules", "npm", "bin", "npm-cli.js"),
    }))
    .filter((candidate) => existsSyncImpl(candidate.node) && existsSyncImpl(candidate.npmCli))
    .map((candidate) => ({ command: candidate.node, args: [candidate.npmCli], npmCli: candidate.npmCli }));
  return [
    { command: "npm.cmd", args: [], npmCli: null },
    { command: "npm", args: [], npmCli: null },
    ...installedCommands,
  ];
}

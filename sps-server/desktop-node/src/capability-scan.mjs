import { spawnSync } from "node:child_process";

const RUNTIMES = [
  { command: "codex", kind: "codex_cli", label: "Codex CLI" },
  { command: "agy", kind: "agy_cli", label: "Agy CLI" },
  { command: "ollama", kind: "ollama", label: "Ollama" },
  { command: "lms", kind: "lm_studio", label: "LM Studio" },
];

function defaultFindCommand(command) {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
    encoding: "utf8",
    timeout: 3_000,
    windowsHide: true,
  });
  return result.status === 0;
}

function defaultReadVersion(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  const firstLine = `${result.stdout}\n${result.stderr}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.slice(0, 120) ?? null;
}

export function scanLocalCapabilities({
  findCommand = defaultFindCommand,
  readVersion = defaultReadVersion,
} = {}) {
  return RUNTIMES
    .filter((runtime) => findCommand(runtime.command))
    .map((runtime) => ({
      kind: runtime.kind,
      label: runtime.label,
      version: readVersion(runtime.command),
    }));
}

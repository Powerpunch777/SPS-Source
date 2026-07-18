import { spawnSync } from "node:child_process";

const MAX_PUBLISHED_MODELS = 24;
const MAX_PUBLISHED_MODEL_LENGTH = 160;
const RUNTIMES = [
  { command: "claude", kind: "claude_cli", label: "Claude Code" },
  { command: "codex", kind: "codex_cli", label: "Codex CLI" },
  { command: "agy", kind: "agy_cli", label: "Agy CLI" },
  { command: "gemini", kind: "gemini_cli", label: "Gemini CLI" },
  { command: "opencode", kind: "opencode_cli", label: "OpenCode CLI" },
  { command: "pi", kind: "pi_cli", label: "Pi CLI" },
  {
    command: "ollama",
    kind: "ollama",
    label: "Ollama",
    modelArgs: ["ls"],
    parseModels: parseOllamaModels,
  },
  {
    command: "lms",
    kind: "lm_studio",
    label: "LM Studio",
    modelArgs: ["ls", "--json"],
    parseModels: parseLmStudioModels,
  },
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

function normalizePublishedModelName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > MAX_PUBLISHED_MODEL_LENGTH) return null;
  // Model identifiers are useful to a company, but local filesystem paths are not.
  if (
    normalized.startsWith("/")
    || /^[a-z]:/i.test(normalized)
    || normalized.split("/").includes("..")
    || /[\\\u0000-\u001f]/.test(normalized)
  ) return null;
  return normalized;
}

function publishedModelNames(values) {
  const seen = new Set();
  const output = [];
  for (const value of values ?? []) {
    const model = normalizePublishedModelName(value);
    if (!model || seen.has(model)) continue;
    seen.add(model);
    output.push(model);
    if (output.length >= MAX_PUBLISHED_MODELS) break;
  }
  return output;
}

export function parseOllamaModels(output) {
  return publishedModelNames(
    String(output ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/, 1)[0] ?? "")
      .filter((model) => model && model.toUpperCase() !== "NAME"),
  );
}

export function parseLmStudioModels(output) {
  try {
    const parsed = JSON.parse(String(output ?? ""));
    const rows = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.models)
        ? parsed.models
        : [];
    return publishedModelNames(rows.map((entry) => {
      if (typeof entry === "string") return entry;
      if (!entry || typeof entry !== "object") return null;
      return entry.modelKey ?? entry.key ?? entry.id ?? entry.name ?? entry.model ?? entry.path ?? null;
    }));
  } catch {
    return [];
  }
}

function defaultReadModels(command, args, parseModels) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 8_000,
    windowsHide: true,
  });
  if (result.status !== 0) return [];
  return parseModels(result.stdout);
}

export function scanLocalCapabilities({
  findCommand = defaultFindCommand,
  readVersion = defaultReadVersion,
  readModels = defaultReadModels,
} = {}) {
  return RUNTIMES
    .filter((runtime) => findCommand(runtime.command))
    .map((runtime) => {
      let models = [];
      if (runtime.modelArgs && runtime.parseModels) {
        try {
          models = publishedModelNames(readModels(runtime.command, runtime.modelArgs, runtime.parseModels));
        } catch {
          models = [];
        }
      }
      return {
        kind: runtime.kind,
        label: runtime.label,
        version: readVersion(runtime.command),
        ...(models.length > 0 ? { models } : {}),
      };
    });
}

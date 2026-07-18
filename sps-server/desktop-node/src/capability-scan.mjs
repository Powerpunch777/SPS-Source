import { spawn } from "node:child_process";
import { resolveSpsNodeInvocation } from "./command-runner.mjs";

const MAX_PUBLISHED_MODELS = 24;
const MAX_PUBLISHED_MODEL_LENGTH = 160;
const MAX_RUNTIME_OUTPUT_BYTES = 16 * 1024;
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

async function defaultFindCommand(command) {
  return await new Promise((resolve) => {
    const lookup = spawn(process.platform === "win32" ? "where.exe" : "which", [command], {
      windowsHide: true,
      stdio: "ignore",
    });
    lookup.once("error", () => resolve(false));
    lookup.once("close", (code) => resolve(code === 0));
  });
}

async function readRuntimeOutput(command, args, { timeoutMs = 8_000 } = {}) {
  let invocation;
  try {
    invocation = await resolveSpsNodeInvocation(command, args);
  } catch {
    return null;
  }

  return await new Promise((resolve) => {
    const child = spawn(invocation.executable, invocation.args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    let timeout = null;
    const append = (chunk) => {
      if (output.length >= MAX_RUNTIME_OUTPUT_BYTES) return;
      output += chunk.toString("utf8").slice(0, MAX_RUNTIME_OUTPUT_BYTES - output.length);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve(value);
    };
    timeout = setTimeout(() => {
      child.kill();
      finish(null);
    }, timeoutMs);
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code === 0 ? output : null));
  });
}

async function defaultReadVersion(command) {
  const output = await readRuntimeOutput(command, ["--version"], { timeoutMs: 5_000 });
  if (!output) return null;
  const firstLine = output
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

async function defaultReadModels(command, args, parseModels) {
  const output = await readRuntimeOutput(command, args);
  return output ? parseModels(output) : [];
}

export async function scanLocalCapabilities({
  findCommand = defaultFindCommand,
  readVersion = defaultReadVersion,
  readModels = defaultReadModels,
} = {}) {
  const capabilities = [];
  for (const runtime of RUNTIMES) {
    if (!await findCommand(runtime.command)) continue;
    const version = await readVersion(runtime.command);
    let models = [];
    if (runtime.modelArgs && runtime.parseModels) {
      try {
        models = publishedModelNames(await readModels(runtime.command, runtime.modelArgs, runtime.parseModels));
      } catch {
        models = [];
      }
    }
    capabilities.push({
      kind: runtime.kind,
      label: runtime.label,
      version,
      ...(models.length > 0 ? { models } : {}),
    });
  }
  return capabilities;
}

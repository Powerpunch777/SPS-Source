import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { redactDeveloperDiagnosticText } from "./developer-diagnostics.mjs";

const ALLOWED_COMMANDS = new Set(["build", "validate", "test"]);
const DEVELOPMENT_BUILD_SCHEMA_VERSION = "development-build/v1";
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_DIAGNOSTICS = 100;
const MAX_DIAGNOSTIC_TEXT = 2_000;
const DEFAULT_TIMEOUTS = Object.freeze({
  build: 120_000,
  validate: 60_000,
  test: 60_000,
});

function boundedText(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_DIAGNOSTIC_TEXT) {
    throw new Error(`Developer command ${label} is invalid.`);
  }
  return value;
}
function optionalHash(value, label) {
  if (value === null) return null;
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`Developer command ${label} is invalid.`);
  }
  return value;
}

function parseIsoTimestamp(value, label) {
  if (typeof value !== "string" || value.length > 64 || Number.isNaN(Date.parse(value))) {
    throw new Error(`Developer command ${label} is invalid.`);
  }
  return value;
}

function validateDevelopmentResult(value, expectedCommand) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Developer command returned an invalid result.");
  }
  if (value.schemaVersion !== DEVELOPMENT_BUILD_SCHEMA_VERSION || value.command !== expectedCommand) {
    throw new Error("Developer command returned an incompatible result.");
  }
  if (typeof value.success !== "boolean") {
    throw new Error("Developer command success state is invalid.");
  }
  if (!Array.isArray(value.diagnostics) || value.diagnostics.length > MAX_DIAGNOSTICS) {
    throw new Error("Developer command diagnostics are invalid.");
  }
  return Object.freeze({
    schemaVersion: DEVELOPMENT_BUILD_SCHEMA_VERSION,
    command: expectedCommand,
    success: value.success,
    sourceFingerprint: optionalHash(value.sourceFingerprint, "source fingerprint"),
    manifestSha256: optionalHash(value.manifestSha256, "manifest fingerprint"),
    workerSha256: optionalHash(value.workerSha256, "worker fingerprint"),
    uiSha256: optionalHash(value.uiSha256, "UI fingerprint"),
    startedAt: parseIsoTimestamp(value.startedAt, "start time"),
    completedAt: parseIsoTimestamp(value.completedAt, "completion time"),
    diagnostics: Object.freeze(value.diagnostics.map((diagnostic) => {
      if (!diagnostic || typeof diagnostic !== "object" || Array.isArray(diagnostic)) {
        throw new Error("Developer command diagnostic is invalid.");
      }
      return Object.freeze({
        code: boundedText(diagnostic.code, "diagnostic code"),
        phase: boundedText(diagnostic.phase, "diagnostic phase"),
        message: redactDeveloperDiagnosticText(boundedText(diagnostic.message, "diagnostic message")),
      });
    })),
  });
}

async function assertRegularFile(filePath, label, fsApi) {
  const absolutePath = path.resolve(filePath ?? "");
  const stats = await fsApi.lstat(absolutePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file.`);
  }
  return await fsApi.realpath(absolutePath);
}

async function assertSourceDirectory(sourceDirectory, fsApi) {
  const absolutePath = path.resolve(sourceDirectory ?? "");
  const stats = await fsApi.lstat(absolutePath);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("Developer source must be a regular directory, not a symlink or junction.");
  }
  return await fsApi.realpath(absolutePath);
}

export function createDeveloperCommandEnvironment(environment = process.env) {
  const allowed = [
    "ALLUSERSPROFILE",
    "APPDATA",
    "COMSPEC",
    // Source Desktop uses Electron's executable as its pinned Node runtime.
    // This fixed, non-secret flag is required for that executable to run the
    // SDK CLI instead of launching another Desktop process.
    "ELECTRON_RUN_AS_NODE",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "LOCALAPPDATA",
    "NUMBER_OF_PROCESSORS",
    "OS",
    "PATH",
    "PATHEXT",
    "PROCESSOR_ARCHITECTURE",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "PROGRAMFILES(X86)",
    "PROGRAMW6432",
    "SYSTEMDRIVE",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "USERDOMAIN",
    "USERNAME",
    "USERPROFILE",
    "WINDIR",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => typeof environment[key] === "string")
      .map((key) => [key, environment[key]]),
  );
}

async function terminateProcessTree(child, { platform, spawnImpl }) {
  if (!child || child.exitCode !== null || !Number.isInteger(child.pid)) return;
  if (platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawnImpl("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", resolve);
      killer.once("exit", resolve);
    });
    return;
  }
  child.kill("SIGKILL");
}

/**
 * Runs one exact public SDK development command. No shell or caller-provided
 * arguments are accepted, and raw stdout/stderr never leave this boundary.
 */
export async function runSpsDeveloperCommand({
  command,
  sourceDirectory,
  nodeCommand,
  sdkCliPath,
  timeoutMs = DEFAULT_TIMEOUTS[command],
  environment = process.env,
  fsApi = fs,
  spawnImpl = spawn,
  platform = process.platform,
} = {}) {
  if (!ALLOWED_COMMANDS.has(command)) {
    throw new Error("Developer command must be build, validate, or test.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 10 * 60_000) {
    throw new Error("Developer command timeout is invalid.");
  }

  const [sourceRoot, nodePath, cliPath] = await Promise.all([
    assertSourceDirectory(sourceDirectory, fsApi),
    assertRegularFile(nodeCommand, "Developer Node runtime", fsApi),
    assertRegularFile(sdkCliPath, "SPS Plugin SDK CLI", fsApi),
  ]);
  const started = Date.now();
  const child = spawnImpl(nodePath, [cliPath, command, sourceRoot, "--json"], {
    cwd: sourceRoot,
    env: createDeveloperCommandEnvironment(environment),
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderrBytes = 0;
  let overflow = false;
  const collect = (chunk, target) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    if (target === "stdout") {
      if (Buffer.byteLength(stdout, "utf8") + buffer.length > MAX_OUTPUT_BYTES) {
        overflow = true;
        return;
      }
      stdout += buffer.toString("utf8");
      return;
    }
    stderrBytes += buffer.length;
    if (stderrBytes > MAX_OUTPUT_BYTES) overflow = true;
  };
  child.stdout?.on("data", (chunk) => collect(chunk, "stdout"));
  child.stderr?.on("data", (chunk) => collect(chunk, "stderr"));

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void terminateProcessTree(child, { platform, spawnImpl });
  }, timeoutMs);

  const { code, signal } = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, exitSignal) => resolve({ code: exitCode, signal: exitSignal }));
  }).finally(() => clearTimeout(timer));

  if (timedOut) throw new Error(`Developer ${command} timed out after ${timeoutMs} ms.`);
  if (overflow) throw new Error(`Developer ${command} exceeded the bounded output limit.`);

  const trimmed = stdout.trim();
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`Developer ${command} did not return one valid JSON result.`);
  }
  const result = validateDevelopmentResult(parsed, command);
  if ((code === 0) !== result.success) {
    throw new Error(`Developer ${command} exit status did not match its signed result contract.`);
  }
  return Object.freeze({
    command,
    success: result.success,
    durationMs: Math.max(0, Date.now() - started),
    exitCode: code,
    signal: signal ?? null,
    result,
  });
}

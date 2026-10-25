import { constants, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { redactPluginPreviewDiagnosticMessage } from "../src/plugin-preview-diagnostics.mjs";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TAIL_BYTES = 64 * 1024;
const TYPES = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "PostgresError", "ZodError"]);
const CODES = new Set(["EACCES", "EPERM", "ENOENT", "EEXIST", "EINVAL", "ENOTDIR", "EIO", "ETIMEDOUT", "ECONNREFUSED", "ERR_MODULE_NOT_FOUND", "ERR_PACKAGE_PATH_NOT_EXPORTED"]);
const SQL_CODES = new Set(["08001", "08003", "08006", "22001", "22003", "22P02", "23502", "23503", "23505", "23514", "40001", "40P01", "42501", "42601", "42703", "42P01", "53300", "57014", "57P01"]);
const unavailable = () => Object.freeze({ status: "unavailable", errors: Object.freeze([]) });
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.birthtimeNs === b.birthtimeNs;
const samePath = (a, b) => process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

async function safeDirectories(directory) {
  const resolved = path.resolve(directory), root = path.parse(resolved).root;
  let current = root;
  const identities = [];
  for (const segment of resolved.slice(root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await fs.realpath(current), current)) throw new Error("path");
    identities.push([current, stat]);
  }
  return identities;
}

async function recheckDirectories(identities) {
  for (const [directory, expected] of identities) {
    const actual = await fs.lstat(directory, { bigint: true });
    if (!actual.isDirectory() || actual.isSymbolicLink() || !sameFile(expected, actual)
      || !samePath(await fs.realpath(directory), directory)) throw new Error("path");
  }
}

function projectError(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const error = input.err ?? input.errorContext ?? input;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const rawMessage = error.message ?? error.errorMessage;
  if (typeof rawMessage !== "string" || rawMessage.length === 0 || rawMessage.length > 8192) return null;
  const message = redactPluginPreviewDiagnosticMessage(rawMessage);
  const rawType = error.type ?? error.name ?? error.errorName;
  const type = TYPES.has(rawType) ? rawType : "UnknownError";
  const rawCode = error.code;
  const code = CODES.has(rawCode) || SQL_CODES.has(rawCode)
    ? rawCode : null;
  let category = "unclassified";
  if (/EACCES|EPERM|permission denied|access is denied/i.test(message)) category = "permission_denied";
  else if (/ENOENT|no such file|cannot find (?:module|package)|ERR_MODULE_NOT_FOUND/i.test(message)) category = "missing_dependency_or_file";
  else if (/duplicate key|violates .*constraint|foreign key|not-null/i.test(message)) category = "database_constraint";
  else if (/column .*does not exist|relation .*does not exist/i.test(message)) category = "database_schema";
  else if (/not a function|cannot read properties|cannot destructure/i.test(message)) category = "javascript_contract";
  else if (/unknown adapter|unsupported adapter|adapter .*not found/i.test(message)) category = "adapter_unavailable";
  else if (/timeout|timed out/i.test(message)) category = "timeout";
  // Never return arbitrary log text, even after the shared redactor has run.
  return Object.freeze({ type, code, category,
    messageSha256: createHash("sha256").update(rawMessage).digest("hex") });
}

function parseErrors(text) {
  const errors = [];
  for (const line of text.split(/\r?\n/)) {
    let parsed;
    try {
      if (line.startsWith("{")) {
        parsed = JSON.parse(line);
        if (!Number.isFinite(parsed.level) || parsed.level < 50) continue;
      } else {
        if (!/^\[[0-9:. -]+\] ERROR: /.test(line)) continue;
        const start = line.indexOf(" {");
        if (start < 0) continue;
        parsed = JSON.parse(line.slice(start + 1));
      }
      const error = projectError(parsed);
      if (error) errors.push(error);
    } catch { /* Unstructured output is not a reason to expose a raw log line. */ }
  }
  return Object.freeze(errors.slice(-5));
}

// Only this harness's owned temporary log is eligible, never a caller-selected log.
export async function collectPreviewE2eHostDiagnostics({ fixtureRoot } = {}) {
  let handle;
  try {
    if (typeof fixtureRoot !== "string" || !path.isAbsolute(fixtureRoot)) return unavailable();
    const root = path.resolve(fixtureRoot);
    if (!/^sps-plugin-preview-desktop-e2e-[A-Za-z0-9_-]+$/.test(path.basename(root))
      || !samePath(await fs.realpath(path.dirname(root)), await fs.realpath(os.tmpdir()))) return unavailable();
    const log = path.join(root, "user-data", "owner-vault", "logs", "server.log");
    const identities = await safeDirectories(path.dirname(log));
    const expected = await fs.lstat(log, { bigint: true });
    if (!expected.isFile() || expected.isSymbolicLink() || expected.nlink !== 1n
      || expected.size > BigInt(MAX_FILE_BYTES) || !samePath(await fs.realpath(log), log)) return unavailable();
    handle = await fs.open(log, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const start = await handle.stat({ bigint: true });
    if (!sameFile(start, expected) || !start.isFile() || start.nlink !== 1n) return unavailable();
    const length = Math.min(Number(start.size), MAX_TAIL_BYTES), offset = Number(start.size) - length;
    const buffer = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const result = await handle.read(buffer, read, length - read, offset + read);
      if (!result.bytesRead) return unavailable();
      read += result.bytesRead;
    }
    const end = await handle.stat({ bigint: true }), current = await fs.lstat(log, { bigint: true });
    if (![end, current].every(stat => sameFile(start, stat) && stat.isFile() && stat.nlink === 1n
      && stat.size >= start.size && stat.size <= BigInt(MAX_FILE_BYTES))
      || current.isSymbolicLink() || !samePath(await fs.realpath(log), log)) return unavailable();
    await recheckDirectories(identities);
    // Drop the first possibly partial line before strict UTF-8 decoding.
    const bytes = offset ? buffer.subarray(buffer.indexOf(10) + 1) : buffer;
    if (offset && buffer.indexOf(10) < 0) return unavailable();
    const errors = parseErrors(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return Object.freeze({ status: errors.length ? "captured" : "no_structured_error", errors });
  } catch { return unavailable(); }
  finally { await handle?.close().catch(() => {}); }
}

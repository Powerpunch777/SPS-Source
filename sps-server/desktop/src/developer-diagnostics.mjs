import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeSpsPluginDiagnosticEventV1 } from "@sonparkserver/plugin-sdk/diagnostics/v1.mjs";

export const SPS_PLUGIN_DIAGNOSTIC_SCHEMA = "sps-plugin-diagnostic/v1";
export const MAX_DEVELOPER_DIAGNOSTICS = 300;

const ORIGINS = new Set(["core", "desktop", "plugin"]);
const CATEGORIES = new Set(["manifest", "compatibility", "capability", "worker", "tool", "event", "job", "run", "stream", "ui", "connector", "mcp", "migration", "backup", "rollback", "visibility"]);
const LEVELS = new Set(["debug", "info", "warn", "error"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID = /^[a-z0-9][a-z0-9._:-]{0,119}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,119}$/;
const MAX_LEDGER_BYTES = 512 * 1024;
const queues = new Map();

function plain(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function redactDeveloperDiagnosticText(value) {
  if (typeof value !== "string") return "SPS could not safely describe this diagnostic.";
  return value
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/(?:postgres(?:ql)?|https?):\/\/[^\s'"`<>]+/gi, "[redacted-url]")
    .replace(/\b(token|secret|password|authorization|cookie|api[_-]?key|client[_-]?secret)\b\s*(?:=|:|"\s*:\s*")\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk|rk|ghp|github_pat|xox[abprs]|AIza)[_-]?[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-token]")
    .replace(/(?:(?<![a-z0-9])[a-z]:[\\/][^\s'"`<>|?*]+|\\\\[^\\/\s]+\\[^\\/\s]+(?:\\[^\s'"`<>|?*]+)*)/gi, "[local-path]")
    .replace(/(?<![:\\/\w])\/(?:Users|home|root|private|Volumes|mnt|srv|var|tmp|opt|ProgramData|Windows)(?:\/[^\s'"`<>]+)*/g, "[local-path]")
    .replace(/(?<![:\\/\w])\/(?!\/)[^\s'"`<>]+/g, "[local-path]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1024) || "SPS could not safely describe this diagnostic.";
}

function safeDetails(input) {
  if (!plain(input)) return {};
  const details = {};
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string")) return {};
  for (const key of keys.slice(0, 16)) {
    if (!/^[a-z][A-Za-z0-9._-]{0,63}$/.test(key) || /secret|token|password|credential|authorization|cookie|key|output|stdout|stderr|command|path|directory|folder|file/i.test(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) continue;
    const value = descriptor.value;
    if (value === null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) details[key] = value;
    else if (typeof value === "string") details[key] = redactDeveloperDiagnosticText(value);
  }
  return details;
}

function eventId() {
  return `desktop.${randomUUID().toLowerCase()}`;
}

function normalize(input) {
  if (!plain(input)) throw new Error("Developer diagnostic event is invalid.");
  const event = {
    schemaVersion: SPS_PLUGIN_DIAGNOSTIC_SCHEMA,
    id: typeof input.id === "string" && ID.test(input.id) ? input.id : eventId(),
    origin: ORIGINS.has(input.origin) ? input.origin : "desktop",
    category: CATEGORIES.has(input.category) ? input.category : "compatibility",
    level: LEVELS.has(input.level) ? input.level : "error",
    code: typeof input.code === "string" && CODE.test(input.code) ? input.code : "DESKTOP_DIAGNOSTIC",
    message: redactDeveloperDiagnosticText(input.message),
    occurredAt: typeof input.occurredAt === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.occurredAt) && !Number.isNaN(Date.parse(input.occurredAt)) ? input.occurredAt : new Date().toISOString(),
    details: safeDetails(input.details),
  };
  return JSON.parse(JSON.stringify(normalizeSpsPluginDiagnosticEventV1(event)));
}

function normalizePersisted(input) {
  return JSON.parse(JSON.stringify(normalizeSpsPluginDiagnosticEventV1(input)));
}

function layout(ownerVault) {
  if (typeof ownerVault !== "string" || !ownerVault.trim()) throw new Error("SPS Owner Vault root is required.");
  const root = path.join(path.resolve(ownerVault), "developer-mode");
  return { root, ledgerPath: path.join(root, "diagnostics-v1.json") };
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

async function lstatIfExists(entry, fsApi) {
  try {
    return await fsApi.lstat(entry);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertNoLinks(target, fsApi) {
  const resolved = path.resolve(target);
  const parsed = path.parse(resolved);
  const relative = path.relative(parsed.root, resolved);
  let current = parsed.root;
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    const stat = await lstatIfExists(current, fsApi);
    if (stat?.isSymbolicLink()) throw new Error("Developer diagnostics cannot use a symbolic link or junction path.");
  }
}

async function assertSafeLedgerPath(target, fsApi) {
  if (!isContained(target.root, target.ledgerPath)) throw new Error("Developer diagnostics ledger escapes Developer Mode.");
  await assertNoLinks(target.root, fsApi);
  const stat = await lstatIfExists(target.ledgerPath, fsApi);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
    throw new Error("Developer diagnostics ledger must be a regular file.");
  }
  return stat;
}

async function readLedger(target, fsApi) {
  try {
    const stat = await assertSafeLedgerPath(target, fsApi);
    if (!stat) return [];
    if (stat.size > MAX_LEDGER_BYTES) throw new Error("Developer diagnostic ledger is unavailable.");
    const parsed = JSON.parse((await fsApi.readFile(target.ledgerPath, "utf8")).replace(/^\uFEFF/, ""));
    if (!plain(parsed) || parsed.schemaVersion !== SPS_PLUGIN_DIAGNOSTIC_SCHEMA || !Array.isArray(parsed.events)) throw new Error("Developer diagnostic ledger is invalid.");
    if (parsed.events.length > MAX_DEVELOPER_DIAGNOSTICS) throw new Error("Developer diagnostic ledger exceeds retention.");
    return parsed.events.map(normalizePersisted);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function writeLedger(target, events, fsApi) {
  await assertNoLinks(path.dirname(target.root), fsApi);
  await fsApi.mkdir(target.root, { recursive: true, mode: 0o700 });
  await assertSafeLedgerPath(target, fsApi);
  const contents = `${JSON.stringify({ schemaVersion: SPS_PLUGIN_DIAGNOSTIC_SCHEMA, events: events.slice(-MAX_DEVELOPER_DIAGNOSTICS) })}\n`;
  if (Buffer.byteLength(contents, "utf8") > MAX_LEDGER_BYTES) throw new Error("Developer diagnostic ledger exceeds its size limit.");
  const temporary = path.join(target.root, `.diagnostics-${randomUUID()}.json`);
  try {
    await fsApi.writeFile(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fsApi.rename(temporary, target.ledgerPath);
  } finally {
    await fsApi.rm(temporary, { force: true }).catch(() => {});
  }
  await fsApi.chmod(target.ledgerPath, 0o600).catch(() => {});
}

async function serial(target, operation) {
  const key = process.platform === "win32" ? target.ledgerPath.toLowerCase() : target.ledgerPath;
  const current = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, current);
  try { return await current; } finally { if (queues.get(key) === current) queues.delete(key); }
}

export async function appendDeveloperDiagnostic({ ownerVault, event, fsApi = fs } = {}) {
  const target = layout(ownerVault);
  const normalized = normalize(event);
  await serial(target, async () => {
    const events = await readLedger(target, fsApi);
    events.push(normalized);
    await writeLedger(target, events, fsApi);
  });
  return normalized;
}

export async function listDeveloperDiagnostics({ ownerVault, filters = {}, fsApi = fs } = {}) {
  const target = layout(ownerVault);
  const events = await readLedger(target, fsApi);
  const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? Math.min(filters.limit, MAX_DEVELOPER_DIAGNOSTICS) : 80;
  return events.filter((event) => (
    (!filters.origin || event.origin === filters.origin)
    && (!filters.category || event.category === filters.category)
    && (!filters.level || event.level === filters.level)
    && (!filters.projectId || event.details.projectId === filters.projectId)
    && (!filters.buildId || event.details.buildId === filters.buildId)
  )).slice(-limit).reverse();
}

export async function clearDeveloperDiagnostics({ ownerVault, fsApi = fs } = {}) {
  const target = layout(ownerVault);
  await serial(target, async () => await writeLedger(target, [], fsApi));
  return { cleared: true };
}

export function developerDiagnosticFromGate({ projectId, command, report }) {
  const result = report?.result ?? {};
  const details = { projectId, gate: command, success: report?.success === true, durationMs: Number.isInteger(report?.durationMs) ? report.durationMs : 0, diagnosticCount: Array.isArray(result.diagnostics) ? result.diagnostics.length : 0 };
  if (report?.success) return {
    origin: "desktop", category: command === "validate" ? "manifest" : "worker", level: "info",
    code: `DEVELOPER_${command.toUpperCase()}_PASSED`, message: `Plugin ${command} gate passed.`, details,
  };
  const first = Array.isArray(result.diagnostics) ? result.diagnostics[0] : null;
  return {
    origin: "desktop", category: command === "validate" ? "manifest" : "worker", level: "error",
    code: `DEVELOPER_${command.toUpperCase()}_FAILED`, message: first?.message || `Plugin ${command} gate did not pass.`, details,
  };
}

export function developerDiagnosticFromPreview({ projectId, buildId, pluginId, phase, level = "info", code, message }) {
  const category = ({ runtime: "worker", workspace: "visibility", stage: "compatibility", activation: "worker", renderer: "ui", worker: "worker", fixture: "ui", cleanup: "rollback" })[phase] ?? "compatibility";
  return {
    origin: "desktop", category, level, code, message,
    details: { projectId, buildId, ...(pluginId ? { pluginId } : {}), phase },
  };
}

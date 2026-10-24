import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const PLUGIN_PREVIEW_DIAGNOSTICS_SCHEMA_VERSION = 1;
export const MAX_PLUGIN_PREVIEW_DIAGNOSTICS = 200;
export const MAX_PLUGIN_PREVIEW_DIAGNOSTIC_MESSAGE_LENGTH = 1_200;

const MAX_LEDGER_BYTES = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLUGIN_ID = /^[a-z0-9][a-z0-9._-]{2,127}$/;
const PHASES = new Set(["runtime", "workspace", "stage", "activation", "renderer", "worker", "fixture", "cleanup"]);
const LEVELS = new Set(["info", "warn", "error"]);
const ledgerWriteQueues = new Map();

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertString(value, label, { min = 1, max = 512 } = {}) {
  if (typeof value !== "string" || value.length < min || value.length > max || value.includes("\0")) {
    throw new Error(`${label} is invalid.`);
  }
  return value;
}

function assertId(value, prefix, label) {
  assertString(value, label, { min: prefix.length + 36, max: prefix.length + 36 });
  if (!value.startsWith(prefix) || !UUID.test(value.slice(prefix.length))) throw new Error(`${label} is invalid.`);
  return value.toLowerCase();
}

function assertTimestamp(value) {
  assertString(value, "Preview diagnostic timestamp", { min: 24, max: 24 });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error("Preview diagnostic timestamp is invalid.");
  }
  return value;
}

function assertCode(value) {
  const code = assertString(value, "Preview diagnostic code", { min: 1, max: 128 });
  if (!/^[A-Z][A-Z0-9_.-]*$/i.test(code)) throw new Error("Preview diagnostic code is invalid.");
  return code;
}

export function redactPluginPreviewDiagnosticMessage(value) {
  const message = assertString(value, "Preview diagnostic message", { min: 1, max: 8_192 })
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/postgres(?:ql)?:\/\/[^\s'"`<>]+/gi, "postgres://[redacted]")
    .replace(/\b(token|secret|password|authorization)\b\s*(?:=|:|\"\s*:\s*\")\s*(?:\"[^\"]*\"|'[^']*'|[^\s,;]+)/gi, "$1=[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|pk|rk|ghp|github_pat|xox[abprs]|AIza)[_-]?[A-Za-z0-9_-]{12,}\b/g, "[redacted-secret]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "[redacted-token]")
    .replace(/(?:(?<![a-z0-9])[a-z]:[\\/][^\s'"`<>|?*]+|\\\\[^\\/\s]+\\[^\\/\s]+(?:\\[^\s'"`<>|?*]+)*)/gi, "[local-path]")
    .replace(/(?<![:\\/\w])\/(?:Users|home|root|private|Volumes|mnt|srv|var|tmp|opt)(?:\/[^\s'"`<>]+)*/g, "[local-path]")
    .replace(/(?<![:\\/\w])\/(?!\/)[^\s'"`<>]+/g, "[local-path]")
    .replace(/\s+/g, " ")
    .trim();
  if (!message) throw new Error("Preview diagnostic message is empty after redaction.");
  return message.slice(0, MAX_PLUGIN_PREVIEW_DIAGNOSTIC_MESSAGE_LENGTH);
}

function normalizeEvent(value) {
  if (!isPlainObject(value)) throw new Error("Preview diagnostic event is invalid.");
  const projectId = assertId(value.projectId, "dev-", "Preview diagnostic project id");
  const buildId = assertId(value.buildId, "build-", "Preview diagnostic build id");
  const pluginId = value.pluginId == null ? undefined : assertString(value.pluginId, "Preview diagnostic plugin id", { min: 3, max: 128 }).toLowerCase();
  if (pluginId && !PLUGIN_ID.test(pluginId)) throw new Error("Preview diagnostic plugin id is invalid.");
  if (!PHASES.has(value.phase)) throw new Error("Preview diagnostic phase is invalid.");
  if (!LEVELS.has(value.level)) throw new Error("Preview diagnostic level is invalid.");
  return {
    projectId,
    buildId,
    ...(pluginId ? { pluginId } : {}),
    phase: value.phase,
    level: value.level,
    code: assertCode(value.code),
    message: redactPluginPreviewDiagnosticMessage(value.message),
    timestamp: assertTimestamp(value.timestamp),
  };
}

function emptyLedger() {
  return { schemaVersion: PLUGIN_PREVIEW_DIAGNOSTICS_SCHEMA_VERSION, events: [] };
}

function normalizeLedger(value) {
  if (!isPlainObject(value) || value.schemaVersion !== PLUGIN_PREVIEW_DIAGNOSTICS_SCHEMA_VERSION || !Array.isArray(value.events)) {
    throw new Error("Preview diagnostics ledger is invalid.");
  }
  if (value.events.length > MAX_PLUGIN_PREVIEW_DIAGNOSTICS) throw new Error("Preview diagnostics ledger exceeds retention.");
  return {
    schemaVersion: PLUGIN_PREVIEW_DIAGNOSTICS_SCHEMA_VERSION,
    events: value.events.map(normalizeEvent),
  };
}

function diagnosticsRoot(ownerVault) {
  if (typeof ownerVault !== "string" || !ownerVault.trim()) throw new Error("SPS Owner Vault root is required.");
  return path.join(path.resolve(ownerVault), "developer-mode");
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
    if (stat?.isSymbolicLink()) throw new Error("Preview diagnostics cannot use a symbolic link or junction path.");
  }
}

async function assertSafeLedgerPath(layout, fsApi) {
  if (!isContained(layout.root, layout.ledgerPath)) throw new Error("Preview diagnostics ledger escapes developer mode.");
  await assertNoLinks(layout.root, fsApi);
  const stat = await lstatIfExists(layout.ledgerPath, fsApi);
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
    throw new Error("Preview diagnostics ledger must be a regular file.");
  }
  return stat;
}

async function loadLedger(layout, fsApi) {
  const stat = await assertSafeLedgerPath(layout, fsApi);
  if (!stat) return emptyLedger();
  if (stat.size > MAX_LEDGER_BYTES) throw new Error("Preview diagnostics ledger exceeds the size limit.");
  let raw;
  try {
    raw = await fsApi.readFile(layout.ledgerPath, "utf8");
    if (Buffer.byteLength(raw, "utf8") > MAX_LEDGER_BYTES) throw new Error("Preview diagnostics ledger exceeds the size limit.");
    return normalizeLedger(JSON.parse(raw.replace(/^\uFEFF/, "")));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Preview diagnostics ledger is not valid JSON.");
    throw error;
  }
}

async function saveLedger(layout, ledger, fsApi, randomId) {
  const normalized = normalizeLedger(ledger);
  const content = `${JSON.stringify(normalized, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_LEDGER_BYTES) throw new Error("Preview diagnostics ledger exceeds the size limit.");
  await assertNoLinks(path.dirname(layout.root), fsApi);
  await fsApi.mkdir(layout.root, { recursive: true, mode: 0o700 });
  await assertSafeLedgerPath(layout, fsApi);
  const uuid = randomId();
  if (typeof uuid !== "string" || !UUID.test(uuid)) throw new Error("Preview diagnostics temporary id is invalid.");
  const temporaryPath = path.join(layout.root, `.preview-diagnostics-${uuid}.json`);
  try {
    await fsApi.writeFile(temporaryPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await fsApi.rename(temporaryPath, layout.ledgerPath);
  } finally {
    await fsApi.rm(temporaryPath, { force: true }).catch(() => {});
  }
  try {
    await fsApi.chmod(layout.ledgerPath, 0o600);
  } catch {
    // The private Owner Vault ACL protects this file on Windows.
  }
  return normalized;
}

async function withLedgerWrite(layout, operation) {
  const key = process.platform === "win32" ? layout.ledgerPath.toLowerCase() : layout.ledgerPath;
  const previous = ledgerWriteQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  ledgerWriteQueues.set(key, current);
  try {
    return await current;
  } finally {
    if (ledgerWriteQueues.get(key) === current) ledgerWriteQueues.delete(key);
  }
}

function normalizeFilters(filters = {}) {
  if (!isPlainObject(filters)) throw new Error("Preview diagnostics filters are invalid.");
  const projectId = filters.projectId == null ? undefined : assertId(filters.projectId, "dev-", "Preview diagnostics filter project id");
  const buildId = filters.buildId == null ? undefined : assertId(filters.buildId, "build-", "Preview diagnostics filter build id");
  const pluginId = filters.pluginId == null ? undefined : assertString(filters.pluginId, "Preview diagnostics filter plugin id", { min: 3, max: 128 }).toLowerCase();
  if (pluginId && !PLUGIN_ID.test(pluginId)) throw new Error("Preview diagnostics filter plugin id is invalid.");
  const phase = filters.phase == null ? undefined : filters.phase;
  const level = filters.level == null ? undefined : filters.level;
  if (phase && !PHASES.has(phase)) throw new Error("Preview diagnostics filter phase is invalid.");
  if (level && !LEVELS.has(level)) throw new Error("Preview diagnostics filter level is invalid.");
  const limit = filters.limit == null ? MAX_PLUGIN_PREVIEW_DIAGNOSTICS : filters.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PLUGIN_PREVIEW_DIAGNOSTICS) throw new Error("Preview diagnostics filter limit is invalid.");
  return { projectId, buildId, pluginId, phase, level, limit };
}

export function pluginPreviewDiagnosticsLayout({ ownerVault } = {}) {
  const root = diagnosticsRoot(ownerVault);
  return { root, ledgerPath: path.join(root, "preview-diagnostics.json") };
}

export async function appendPluginPreviewDiagnostic({ ownerVault, event, fsApi = fs, randomId = randomUUID } = {}) {
  const layout = pluginPreviewDiagnosticsLayout({ ownerVault });
  const normalizedEvent = normalizeEvent(event);
  await withLedgerWrite(layout, async () => {
    const ledger = await loadLedger(layout, fsApi);
    ledger.events.push(normalizedEvent);
    ledger.events = ledger.events.slice(-MAX_PLUGIN_PREVIEW_DIAGNOSTICS);
    await saveLedger(layout, ledger, fsApi, randomId);
  });
  return clone(normalizedEvent);
}

export async function listPluginPreviewDiagnostics({ ownerVault, filters, fsApi = fs } = {}) {
  const layout = pluginPreviewDiagnosticsLayout({ ownerVault });
  const normalizedFilters = normalizeFilters(filters);
  const ledger = await loadLedger(layout, fsApi);
  const events = ledger.events.filter((event) => (
    (!normalizedFilters.projectId || event.projectId === normalizedFilters.projectId)
    && (!normalizedFilters.buildId || event.buildId === normalizedFilters.buildId)
    && (!normalizedFilters.pluginId || event.pluginId === normalizedFilters.pluginId)
    && (!normalizedFilters.phase || event.phase === normalizedFilters.phase)
    && (!normalizedFilters.level || event.level === normalizedFilters.level)
  ));
  return clone(events.slice(-normalizedFilters.limit).reverse());
}

export async function clearPluginPreviewDiagnostics({ ownerVault, fsApi = fs, randomId = randomUUID } = {}) {
  const layout = pluginPreviewDiagnosticsLayout({ ownerVault });
  await withLedgerWrite(layout, async () => {
    await loadLedger(layout, fsApi);
    await saveLedger(layout, emptyLedger(), fsApi, randomId);
  });
  return { cleared: true };
}

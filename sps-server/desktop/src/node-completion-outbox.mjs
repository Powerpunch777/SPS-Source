import { createHash } from "node:crypto";

const OUTBOX_VERSION = 1;
const DEFAULT_MAX_RECORDS = 64;
const MAX_COMPLETION_BYTES = 64 * 1024;
const MAX_RECEIPT_RESERVE_BYTES = MAX_COMPLETION_BYTES + 4 * 1024;
const RECORD_KEYS = new Set(["kind", "hubUrl", "nodeId", "commandId", "accountSubject", "publicKeyFingerprint", "completion"]);
const COMPLETION_KEYS = new Set(["status", "exitCode", "signal", "timedOut", "error", "usageReport"]);

export class SpsNodeCompletionOutboxError extends Error {
  constructor(code = "unavailable") {
    super("SPS Node completion receipt storage is unavailable.");
    this.name = "SpsNodeCompletionOutboxError";
    this.code = code;
  }
}

function fail(code = "invalid") {
  throw new SpsNodeCompletionOutboxError(code);
}

function boundedText(value, max = 2048) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isAllowedHubUrl(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback = hostname === "localhost" || hostname === "::1" || hostname === "127.0.0.1";
  return (url.protocol === "https:" || (url.protocol === "http:" && loopback))
    && !url.username && !url.password;
}

function fingerprint(identity) {
  if (!boundedText(identity?.publicKeyPem, 32 * 1024)) fail("invalid");
  return createHash("sha256").update(identity.publicKeyPem, "utf8").digest("hex");
}

function safeCompletion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid");
  if (Object.keys(value).some(key => !COMPLETION_KEYS.has(key))) fail("invalid");
  if (value.status !== "succeeded" && value.status !== "failed") fail("invalid");
  if (value.exitCode !== null && (!Number.isInteger(value.exitCode) || !Number.isSafeInteger(value.exitCode))) fail("invalid");
  if (value.signal !== undefined && value.signal !== null && (typeof value.signal !== "string" || value.signal.trim().length > 120)) fail("invalid");
  if (value.timedOut !== undefined && typeof value.timedOut !== "boolean") fail("invalid");
  if (value.error !== undefined && value.error !== null && (typeof value.error !== "string" || value.error.trim().length > 16_000)) fail("invalid");
  if (value.usageReport !== undefined) validateUsageReport(value.usageReport);
  let serialized;
  try { serialized = JSON.stringify(value); } catch { fail("invalid"); }
  if (typeof serialized !== "string" || Buffer.byteLength(serialized, "utf8") > MAX_COMPLETION_BYTES) fail("limit");
  let copy;
  try { copy = canonicalValue(JSON.parse(serialized)); } catch { fail("invalid"); }
  if (!copy || typeof copy !== "object" || Array.isArray(copy)) fail("invalid");
  copy.signal = copy.signal == null ? null : copy.signal.trim();
  copy.timedOut = copy.timedOut ?? false;
  copy.error = copy.error == null ? null : copy.error.trim();
  return copy;
}

function validateUsageReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => !["schemaVersion", "source", "inputTokens", "cachedInputTokens", "outputTokens"].includes(key))
    || value.schemaVersion !== 1 || value.source !== "claude_model_usage_v1") fail("invalid");
  let hasMetric = false;
  for (const key of ["inputTokens", "cachedInputTokens", "outputTokens"]) {
    const entry = value[key];
    if (entry !== null && (!Number.isSafeInteger(entry) || entry < 0)) fail("invalid");
    if (entry !== null) hasMetric = true;
  }
  if (!hasMetric) fail("invalid");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalValue(value[key])]));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function completionReceiptDigest(record) {
  const normalizedCompletion = {
    status: record.completion.status,
    exitCode: record.completion.exitCode,
    signal: record.completion.signal ?? null,
    timedOut: record.completion.timedOut ?? false,
    error: record.completion.error ?? null,
    ...(record.completion.usageReport === undefined ? {} : { usageReport: record.completion.usageReport }),
  };
  return createHash("sha256").update(canonicalJson({
    version: 1,
    kind: record.kind,
    nodeId: record.nodeId,
    commandId: record.commandId,
    completion: normalizedCompletion,
  }), "utf8").digest("hex");
}

function bindingFrom({ kind, payload, accountSubject }) {
  if (kind !== "agent-command" && kind !== "plugin-run") fail("invalid");
  if (!payload || typeof payload !== "object") fail("invalid");
  if (!boundedText(accountSubject, 512)
    || !boundedText(payload.hubUrl, 2048)
    || !boundedText(payload.nodeId, 512)
    || !boundedText(payload.commandId, 512)) fail("invalid");
  if (!isAllowedHubUrl(payload.hubUrl)) fail("invalid");
  return {
    kind,
    hubUrl: payload.hubUrl,
    nodeId: payload.nodeId,
    commandId: payload.commandId,
    accountSubject,
    publicKeyFingerprint: fingerprint(payload.identity),
  };
}

function receiptKey(record) {
  return JSON.stringify([record.kind, record.hubUrl, record.nodeId, record.commandId]);
}

function validateRecords(value, maxRecords) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some(key => key !== "version" && key !== "receipts")
    || Object.keys(value).length !== 2
    || value.version !== OUTBOX_VERSION || !Array.isArray(value.receipts)
    || value.receipts.length > maxRecords) fail("invalid");
  const keys = new Set();
  for (const record of value.receipts) {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || Object.keys(record).some(key => !RECORD_KEYS.has(key))
      || Object.keys(record).length !== RECORD_KEYS.size) fail("invalid");
    if (!record || typeof record !== "object" || Array.isArray(record)
      || (record.kind !== "agent-command" && record.kind !== "plugin-run")
      || !boundedText(record.hubUrl, 2048) || !boundedText(record.nodeId, 512)
      || !boundedText(record.commandId, 512) || !boundedText(record.accountSubject, 512)
      || !/^[a-f0-9]{64}$/.test(record.publicKeyFingerprint)) fail("invalid");
    if (!isAllowedHubUrl(record.hubUrl)) fail("invalid");
    const completion = safeCompletion(record.completion);
    if (JSON.stringify(canonicalValue(completion)) !== JSON.stringify(canonicalValue(record.completion))) fail("invalid");
    const key = receiptKey(record);
    if (keys.has(key)) fail("invalid");
    keys.add(key);
  }
  return value.receipts;
}

export function createSpsNodeCompletionOutbox({
  readEncrypted,
  writeEncrypted,
  encrypt,
  decrypt,
  maxRecords = DEFAULT_MAX_RECORDS,
}) {
  if (typeof readEncrypted !== "function" || typeof writeEncrypted !== "function"
    || typeof encrypt !== "function" || typeof decrypt !== "function"
    || !Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 256) {
    throw new TypeError("Invalid SPS Node completion outbox configuration.");
  }

  let tail = Promise.resolve();
  const serialize = action => {
    const result = tail.then(action, action);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  async function readRecords() {
    let encrypted;
    try { encrypted = await readEncrypted(); } catch { fail("unavailable"); }
    if (encrypted === null || encrypted === undefined) return [];
    if (typeof encrypted !== "string" || encrypted.length > 4 * 1024 * 1024) fail("invalid");
    let plaintext;
    try { plaintext = await decrypt(encrypted); } catch { fail("invalid"); }
    if (typeof plaintext !== "string" || Buffer.byteLength(plaintext, "utf8") > 2 * 1024 * 1024) fail("invalid");
    let parsed;
    try { parsed = JSON.parse(plaintext); } catch { fail("invalid"); }
    try { return validateRecords(parsed, maxRecords); } catch { fail("invalid"); }
  }

  async function writeRecords(receipts) {
    const plaintext = JSON.stringify({ version: OUTBOX_VERSION, receipts });
    if (Buffer.byteLength(plaintext, "utf8") > 2 * 1024 * 1024) fail("limit");
    let encrypted;
    try { encrypted = await encrypt(plaintext); } catch { fail("unavailable"); }
    if (typeof encrypted !== "string" || encrypted.length < 1 || encrypted.length > 4 * 1024 * 1024) fail("unavailable");
    try { await writeEncrypted(encrypted); } catch { fail("unavailable"); }
  }

  async function persist({ kind, payload, accountSubject }) {
    const binding = bindingFrom({ kind, payload, accountSubject });
    const completion = safeCompletion(payload.completion);
    return serialize(async () => {
      const receipts = await readRecords();
      const key = receiptKey(binding);
      const existing = receipts.find(receipt => receiptKey(receipt) === key);
      const record = { ...binding, completion };
      if (existing) {
        if (existing.accountSubject !== record.accountSubject
          || existing.publicKeyFingerprint !== record.publicKeyFingerprint
          || JSON.stringify(canonicalValue(existing.completion)) !== JSON.stringify(canonicalValue(record.completion))) fail("conflict");
        // readEncrypted can observe a caller's mutated in-memory state even
        // when its previous save failed. Re-write and await the durable slot
        // before allowing another completion POST.
        await writeRecords(receipts);
        return key;
      }
      if (receipts.length >= maxRecords) fail("limit");
      await writeRecords([...receipts, record]);
      return key;
    });
  }

  function matchesAcceptedRow(record, response) {
    if (!response || typeof response !== "object" || Array.isArray(response)
      || response.id !== record.commandId || response.nodeId !== record.nodeId
      || !["succeeded", "failed", "cancelled"].includes(response.status)) return false;

    if (response.completionReportJson !== undefined && response.completionReportJson !== null) {
      let report;
      try { report = safeCompletion(response.completionReportJson); } catch { return false; }
      return JSON.stringify(canonicalValue(report)) === JSON.stringify(canonicalValue(record.completion))
        && typeof response.completionReceiptDigest === "string"
        && /^[a-f0-9]{64}$/.test(response.completionReceiptDigest)
        && response.completionReceiptDigest === completionReceiptDigest(record);
    }

    if (response.exitCode !== record.completion.exitCode
      || (response.signal ?? null) !== record.completion.signal
      || (response.timedOut !== 0 && response.timedOut !== 1)
      || (response.timedOut === 1) !== record.completion.timedOut
      || (response.completionReceiptDigest !== undefined && response.completionReceiptDigest !== null
        && (typeof response.completionReceiptDigest !== "string"
          || !/^[a-f0-9]{64}$/.test(response.completionReceiptDigest)
          || response.completionReceiptDigest !== completionReceiptDigest(record)))) return false;
    const expectedUsage = record.completion.usageReport;
    if (expectedUsage !== undefined) {
      const usageReceipt = response.usageJson?.spsNodeUsageReceipt;
      if (usageReceipt?.scope?.runId !== record.commandId
        || usageReceipt?.scope?.nodeId !== record.nodeId
        || JSON.stringify(canonicalValue(usageReceipt.report)) !== JSON.stringify(expectedUsage)) return false;
    }
    if (response.status === record.completion.status) return (response.error ?? null) === record.completion.error;
    return response.status === "cancelled"
      && response.completionReceiptDigest === completionReceiptDigest(record);
  }

  async function acknowledge({ kind, payload, accountSubject, response }) {
    if (response === undefined || response === null) fail("ack-mismatch");
    const binding = bindingFrom({ kind, payload, accountSubject });
    return serialize(async () => {
      const receipts = await readRecords();
      const key = receiptKey(binding);
      const index = receipts.findIndex(receipt => receiptKey(receipt) === key);
      if (index < 0) return false;
      const existing = receipts[index];
      if (existing.accountSubject !== binding.accountSubject
        || existing.publicKeyFingerprint !== binding.publicKeyFingerprint
        || JSON.stringify(canonicalValue(existing.completion)) !== JSON.stringify(canonicalValue(safeCompletion(payload.completion)))) fail("conflict");
      if (!matchesAcceptedRow(existing, response)) fail("ack-mismatch");
      await writeRecords(receipts.filter((_, itemIndex) => itemIndex !== index));
      return true;
    });
  }

  async function retryMatching({
    accountSubject,
    hubUrl,
    nodeId,
    identity,
    accessToken,
    sessionCookie,
    completeNodeCommand,
    completePluginRun,
    assertCurrent = () => {},
  }) {
    if (!boundedText(accountSubject, 512) || !boundedText(hubUrl, 2048)
      || !boundedText(nodeId, 512) || !identity || typeof assertCurrent !== "function"
      || typeof completeNodeCommand !== "function" || typeof completePluginRun !== "function") fail("invalid");
    const publicKeyFingerprint = fingerprint(identity);
    const receipts = await serialize(readRecords);
    assertCurrent();
    let acknowledged = 0;
    for (const record of receipts) {
      if (record.accountSubject !== accountSubject || record.hubUrl !== hubUrl
        || record.nodeId !== nodeId || record.publicKeyFingerprint !== publicKeyFingerprint) continue;
      assertCurrent();
      const payload = {
        hubUrl: record.hubUrl,
        nodeId: record.nodeId,
        identity,
        accessToken,
        sessionCookie,
        commandId: record.commandId,
        completion: record.completion,
      };
      await persist({ kind: record.kind, payload, accountSubject: record.accountSubject });
      assertCurrent();
      const complete = record.kind === "plugin-run" ? completePluginRun : completeNodeCommand;
      const response = await complete(payload);
      assertCurrent();
      await acknowledge({ kind: record.kind, payload, accountSubject: record.accountSubject, response });
      assertCurrent();
      acknowledged += 1;
    }
    return acknowledged;
  }

  async function assertAvailable() {
    const receipts = await serialize(readRecords);
    if (receipts.length >= maxRecords
      || Buffer.byteLength(JSON.stringify({ version: OUTBOX_VERSION, receipts }), "utf8") > 2 * 1024 * 1024 - MAX_RECEIPT_RESERVE_BYTES) {
      fail("limit");
    }
  }

  return Object.freeze({ assertAvailable, persist, acknowledge, retryMatching });
}

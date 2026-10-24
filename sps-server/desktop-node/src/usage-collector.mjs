import { TextDecoder } from "node:util";

const MAX_PENDING_LINE_BYTES = 64 * 1024;
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

function sumMetric(entries, fields) {
  let total = 0;
  for (const entry of entries) {
    for (const field of fields) {
      const value = entry[field];
      if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_INTEGER - total) {
        return null;
      }
      total += value;
    }
  }
  return total;
}

function reportFromModelUsage(modelUsage) {
  if (modelUsage === null || typeof modelUsage !== "object" || Array.isArray(modelUsage)) return null;
  const entries = Object.values(modelUsage);
  if (entries.length < 1 || entries.length > 64) return null;
  if (entries.some((entry) => entry === null || typeof entry !== "object" || Array.isArray(entry))) return null;

  const inputTokens = sumMetric(entries, ["inputTokens", "cacheCreationInputTokens"]);
  const cachedInputTokens = sumMetric(entries, ["cacheReadInputTokens"]);
  const outputTokens = sumMetric(entries, ["outputTokens"]);
  if (inputTokens === null && cachedInputTokens === null && outputTokens === null) return null;
  return {
    schemaVersion: 1,
    source: "claude_model_usage_v1",
    inputTokens,
    cachedInputTokens,
    outputTokens,
  };
}

export function createSpsNodeUsageCollector(runtimeKind) {
  const enabled = runtimeKind === "claude_cli";
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let pendingParts = [];
  let pendingBytes = 0;
  let discardingLine = false;
  let finished = false;
  let report = null;

  const clearPending = () => {
    pendingParts = [];
    pendingBytes = 0;
  };

  const consumeLine = (bytes) => {
    let text;
    try {
      text = decoder.decode(bytes);
    } catch {
      report = null;
      return;
    }
    if (text.endsWith("\r")) text = text.slice(0, -1);

    let value;
    try {
      value = JSON.parse(text);
    } catch {
      if (text.trimStart().startsWith("{")) report = null;
      return;
    }
    if (value === null || typeof value !== "object" || Array.isArray(value) || value.type !== "result") return;
    report = reportFromModelUsage(value.modelUsage);
  };

  return {
    push(value) {
      if (!enabled || finished || (!Buffer.isBuffer(value) && typeof value !== "string")) return;
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
      let offset = 0;

      while (offset < chunk.length) {
        const newline = chunk.indexOf(0x0a, offset);
        const end = newline === -1 ? chunk.length : newline;
        const segment = chunk.subarray(offset, end);

        if (!discardingLine) {
          if (pendingBytes + segment.length > MAX_PENDING_LINE_BYTES) {
            clearPending();
            discardingLine = true;
            report = null;
          } else if (segment.length > 0) {
            pendingParts.push(Buffer.from(segment));
            pendingBytes += segment.length;
          }
        }

        if (newline === -1) break;
        if (!discardingLine) {
          consumeLine(pendingParts.length === 1 ? pendingParts[0] : Buffer.concat(pendingParts, pendingBytes));
        }
        clearPending();
        discardingLine = false;
        offset = newline + 1;
      }
    },
    finish() {
      if (!finished) {
        finished = true;
        if (enabled && !discardingLine && pendingBytes > 0) {
          consumeLine(pendingParts.length === 1 ? pendingParts[0] : Buffer.concat(pendingParts, pendingBytes));
        }
        clearPending();
      }
      return report;
    },
  };
}

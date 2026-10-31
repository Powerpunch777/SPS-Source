export const HISTORICAL_PROFILE_PROGRESS_PHASES = Object.freeze([
  "fixture-ready",
  "initial-main-start",
  "initial-main-ready",
  "initial-account-stored",
  "initial-main-closed",
  "historical-db-start",
  "historical-db-prepared",
  "legacy-state-prepared",
  "migration-main-start",
  "migration-main-ready",
  "migration-data-verified",
  "migration-main-closed",
  "restart-main-start",
  "restart-main-ready",
  "restart-data-verified",
  "restart-main-closed",
  "candidate-verified",
  "cleanup-start",
  "cleanup-complete",
]);

const phaseSet = new Set(HISTORICAL_PROFILE_PROGRESS_PHASES);
const MAX_ELAPSED_MS = 1_080_000;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_LINE_LENGTH = 512;
const EVENT_KEYS = "elapsedMs,historicalProfileProgress,phase";

function isElapsedMs(value) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= 0 && value <= MAX_ELAPSED_MS;
}

export function createHistoricalProfileProgress({ write, now = Date.now } = {}) {
  if (typeof write !== "function" || typeof now !== "function") {
    throw new TypeError("Historical profile progress requires a writer and clock.");
  }
  const startedAt = now();
  if (!Number.isFinite(startedAt)) throw new TypeError("Historical profile progress clock is invalid.");

  return phase => {
    if (!phaseSet.has(phase)) throw new TypeError("Unknown historical profile progress phase.");
    const elapsedMs = now() - startedAt;
    if (!isElapsedMs(elapsedMs)) throw new RangeError("Historical profile progress elapsed time is invalid.");
    return write(`${JSON.stringify({ historicalProfileProgress: true, phase, elapsedMs })}\n`);
  };
}

export function parseHistoricalProfileProgress(text) {
  if (typeof text !== "string" || Buffer.byteLength(text, "utf8") > MAX_INPUT_BYTES) return [];
  const records = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0 || line.length > MAX_LINE_LENGTH) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).sort().join(",") !== EVENT_KEYS
      || value.historicalProfileProgress !== true || !phaseSet.has(value.phase)
      || !isElapsedMs(value.elapsedMs)) continue;
    records.push({ historicalProfileProgress: true, phase: value.phase, elapsedMs: value.elapsedMs });
  }
  return records;
}

const RUNTIME_PHASES = Object.freeze([
  "package-verify-start", "package-verified", "cache-ready", "archive-preflight-start", "archive-preflight-complete",
  "extraction-start", "extraction-complete", "expanded-verification-start", "expanded-verification-complete", "runtime-promoted",
]);
const HOST_PHASES = Object.freeze([
  "resolve-runtime-start", "resolve-runtime-complete", "prepare-job-start", "prepare-job-complete", "core-spawned", "core-ready",
]);

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
  "migration-host-ready", "migration-db-verified", "migration-workspace-seen", "migration-workspace-ready",
  "restart-host-ready", "restart-db-verified", "restart-workspace-seen", "restart-workspace-ready",
  "failed-setup", "failed-host-readiness", "failed-state-data", "failed-workspace-window",
  "failed-workspace-visibility", "failed-projects", "failed-historical-preparation", "failed-sign-in",
  "failed-shutdown", "failed-candidate",
  "app-begin", "app-identity-session-start", "app-identity-session-complete", "app-node-registration-start",
  "app-node-registration-complete", "app-workspace-load-start", "app-workspace-load-complete",
  "app-window-ready-to-show", "app-window-shown", "app-captured-window-discarded", "app-scope-account-changed",
  "app-scope-host-context-changed", "app-scope-host-instance-changed", "app-scope-connection-changed",
  "app-scope-rejection-unclassified", "app-existing-window-reused", "app-window-closed",
  ...RUNTIME_PHASES.map(phase => `runtime-${phase}`),
  ...HOST_PHASES.map(phase => `host-${phase}`),
]);

const phaseSet = new Set(HISTORICAL_PROFILE_PROGRESS_PHASES);
const MAX_ELAPSED_MS = 1_080_000;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_LINE_LENGTH = 512;
const EVENT_KEYS = "elapsedMs,historicalProfileProgress,phase";

// Read fixed diagnostics live so a parent's timeout cannot erase the last phase.
// Arbitrary app output, paths and payloads never reach the evidence writer.
export function createHistoricalRuntimeObserver(progress) {
  if (typeof progress !== "function") throw new TypeError("Runtime progress requires a writer.");
  let line = "";
  let discarding = false;
  let bytes = 0;
  return chunk => {
    if (typeof chunk !== "string" && !Buffer.isBuffer(chunk)) return;
    const text = String(chunk);
    bytes += Buffer.byteLength(text);
    if (bytes > MAX_INPUT_BYTES) { line = ""; discarding = true; return; }
    for (const character of text) {
      if (character === "\n") {
        if (!discarding) {
          const value = line.endsWith("\r") ? line.slice(0, -1) : line;
          const runtime = /^\[owner-host-runtime\] phase=([a-z-]+)$/.exec(value);
          const host = /^\[owner-host-job\] ([a-z-]+)$/.exec(value);
          if (runtime && RUNTIME_PHASES.includes(runtime[1])) progress(`runtime-${runtime[1]}`);
          else if (host && HOST_PHASES.includes(host[1])) progress(`host-${host[1]}`);
        }
        line = "";
        discarding = false;
      } else if (!discarding) {
        if (line.length >= MAX_LINE_LENGTH) { line = ""; discarding = true; }
        else line += character;
      }
    }
  };
}

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

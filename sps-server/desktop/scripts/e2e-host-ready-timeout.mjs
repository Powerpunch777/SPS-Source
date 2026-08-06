export const DEFAULT_E2E_HOST_READY_TIMEOUT_MS = 360_000;
export const MIN_E2E_HOST_READY_TIMEOUT_MS = 30_000;
export const MAX_E2E_HOST_READY_TIMEOUT_MS = 600_000;

export function parseE2eHostReadyTimeout(rawValue) {
  if (rawValue === undefined || String(rawValue).trim() === "") {
    return DEFAULT_E2E_HOST_READY_TIMEOUT_MS;
  }
  const timeout = Number(rawValue);
  if (!Number.isInteger(timeout)
    || timeout < MIN_E2E_HOST_READY_TIMEOUT_MS
    || timeout > MAX_E2E_HOST_READY_TIMEOUT_MS) {
    throw new Error(
      `SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS must be an integer from ${MIN_E2E_HOST_READY_TIMEOUT_MS} to ${MAX_E2E_HOST_READY_TIMEOUT_MS}.`,
    );
  }
  return timeout;
}

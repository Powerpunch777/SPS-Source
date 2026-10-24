const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export function spsRequestTimeoutSignal(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  return typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
}

export function spsRequestError(error, fallback) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") return new Error(fallback);
  return error;
}

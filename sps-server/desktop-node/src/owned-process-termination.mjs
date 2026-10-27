import { terminateWindowsChild } from "./windows-command-termination.mjs";

const GENERIC_TERMINATION_FAILURE = "Local command termination failed.";
const UNCONFIRMED_TERMINATION_FAILURE = "Local command termination has not been confirmed.";

/**
 * Owns termination attempts for spawned child processes. Failed attempts stay
 * attached to their child so a later terminal event cannot erase uncertainty.
 */
export function createOwnedProcessTerminator(options = {}) {
  const platform = options.platform ?? process.platform;
  const signalProcess = options.signalProcess ?? ((pid, signal) => process.kill(pid, signal));
  const terminateWindows = options.terminateWindowsChild ?? terminateWindowsChild;
  const wait = options.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? Date.now;
  const pollIntervalMs = options.pollIntervalMs ?? 30;
  const posixGraceMs = options.posixGraceMs ?? 1_500;
  const confirmationTimeoutMs = options.confirmationTimeoutMs ?? 2_000;
  const terminations = new WeakMap();

  function isAlive(child) {
    if (!child?.pid) return false;
    // A Windows PID stops belonging to the child as soon as Node reports its
    // terminal event. Never signal it again: the OS may already have reused it.
    if (platform === "win32" && (child.exitCode !== null || child.signalCode !== null)) return false;
    try {
      signalProcess(platform === "win32" ? child.pid : -child.pid, 0);
      return true;
    } catch (error) {
      return error?.code !== "ESRCH";
    }
  }

  function pending(child) {
    return child && (typeof child === "object" || typeof child === "function")
      ? terminations.get(child)?.promise
      : undefined;
  }

  function hasUnconfirmedTermination(child) {
    const state = child && (typeof child === "object" || typeof child === "function")
      ? terminations.get(child)
      : undefined;
    return Boolean(state && state.status !== "succeeded");
  }

  function terminate(child) {
    if (!child?.pid) return Promise.resolve();

    const prior = terminations.get(child);
    if (prior) {
      if (prior.status !== "failed") return prior.promise;
      // A failure may be retried only while the exact child/process group is
      // still alive. A terminal Windows child must never cause another PID kill.
      if (!isAlive(child)) return Promise.reject(prior.error);
    } else if (platform === "win32" && !isAlive(child)) {
      // Natural Windows child exit has no remaining tree handle to terminate.
      return Promise.resolve();
    }

    const state = { status: "running", promise: undefined, error: undefined };
    const operation = Promise.resolve().then(async () => {
      if (platform === "win32") {
        await terminateWindows(child);
      } else {
        try {
          signalProcess(-child.pid, "SIGTERM");
        } catch (error) {
          if (error?.code !== "ESRCH") throw error;
        }
        const deadline = now() + posixGraceMs;
        while (isAlive(child) && now() < deadline) await wait(pollIntervalMs);
        if (isAlive(child)) {
          try {
            signalProcess(-child.pid, "SIGKILL");
          } catch (error) {
            if (error?.code !== "ESRCH") throw error;
          }
        }
      }

      const deadline = now() + confirmationTimeoutMs;
      while (isAlive(child) && now() < deadline) await wait(pollIntervalMs);
      if (isAlive(child)) throw new Error(UNCONFIRMED_TERMINATION_FAILURE);
      state.status = "succeeded";
    }).catch(() => {
      state.status = "failed";
      state.error = new Error(GENERIC_TERMINATION_FAILURE);
      throw state.error;
    });

    state.promise = operation;
    terminations.set(child, state);
    // The operation remains available through pending(); mark its rejection
    // handled here because many callers intentionally observe it later.
    void operation.catch(() => {});
    return operation;
  }

  return { isAlive, terminate, pending, hasUnconfirmedTermination };
}

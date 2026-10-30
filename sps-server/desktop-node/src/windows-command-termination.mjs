import { spawn } from "node:child_process";

const fail = () => new Error("Windows process-tree termination has not been confirmed.");

/** Stop only the taskkill helper and direct child owned by this invocation. */
export function terminateWindowsChild(child, {
  spawnKiller = spawn,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  timeoutMs = 5_000,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 5_000) {
    return Promise.reject(fail());
  }
  if (!child || !Number.isSafeInteger(child.pid) || child.pid <= 0) return Promise.reject(fail());
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    let killer = null;
    let timer = null;

    const cleanup = () => {
      if (timer !== null) clearTimer(timer);
      timer = null;
      killer?.removeListener("close", onClose);
    };
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const fallback = () => {
      if (settled) return;
      // The helper and this child belong to this command. Never kill by a
      // stale PID after the child has already reported terminal state.
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill(); } catch { /* Retain the generic unconfirmed result. */ }
      }
      finish(fail());
    };
    const onError = () => fallback();
    const onClose = code => code === 0 ? finish() : fallback();

    timer = setTimer(() => {
      fallback();
      try { killer?.kill(); } catch { /* Only the taskkill helper is targeted. */ }
    }, timeoutMs);

    try {
      killer = spawnKiller("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      // Keep the settled guard for errors emitted by timeout-driven helper kill.
      killer.on("error", onError);
      killer.once("close", onClose);
    } catch {
      fallback();
    }
  });
}

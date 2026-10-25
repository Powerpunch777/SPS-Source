const MAX_GRACEFUL_WAIT_MS = 20_000;
const MAX_FORCE_STOP_WAIT_MS = 15_000;

function boundedTimeout(value, fallback, maximum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(maximum, Math.trunc(value)));
}

function exitSnapshot(child, observedExit) {
  const exitCode = Number.isInteger(child?.exitCode)
    ? child.exitCode
    : observedExit?.exitCode ?? null;
  const signalCode = typeof child?.signalCode === "string" && child.signalCode.length <= 32
    ? child.signalCode
    : observedExit?.signalCode ?? null;
  return {
    exitConfirmed: exitCode !== null || signalCode !== null,
    exitCode,
    signalCode,
  };
}

function observeExit(child) {
  if (typeof child?.once !== "function" || typeof child?.removeListener !== "function") return null;

  let observedExit = null;
  let resolveExit;
  const exited = new Promise(resolve => { resolveExit = resolve; });
  const onExit = (code, signal) => {
    observedExit = {
      exitCode: Number.isInteger(code) ? code : null,
      signalCode: typeof signal === "string" && signal.length <= 32 ? signal : null,
    };
    resolveExit();
  };

  child.once("exit", onExit);
  return {
    exited,
    snapshot: () => exitSnapshot(child, observedExit),
    cleanup: () => child.removeListener("exit", onExit),
  };
}

async function waitForExitOrTimeout(observer, timeoutMs, setTimer, clearTimer) {
  if (observer.snapshot().exitConfirmed) return;
  let timer;
  try {
    await Promise.race([
      observer.exited,
      new Promise(resolve => { timer = setTimer(resolve, timeoutMs); }),
    ]);
  } catch {}
  finally {
    if (timer !== undefined) clearTimer(timer);
  }
}

async function waitForOperation(operation, timeoutMs, setTimer, clearTimer) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve(operation).then(() => undefined, () => undefined),
      new Promise(resolve => { timer = setTimer(resolve, timeoutMs); }),
    ]);
  } catch {}
  finally {
    if (timer !== undefined) clearTimer(timer);
  }
}

function result(graceful, snapshot) {
  return {
    graceful: graceful && snapshot.exitConfirmed && snapshot.exitCode === 0 && snapshot.signalCode === null,
    exitConfirmed: snapshot.exitConfirmed,
    exitCode: snapshot.exitCode,
    signalCode: snapshot.signalCode,
  };
}

export async function shutdownPreviewE2eDesktop({
  child,
  requestBrowserClose,
  forceStop,
  timeoutMs = MAX_GRACEFUL_WAIT_MS,
  forceStopTimeoutMs = MAX_FORCE_STOP_WAIT_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  const initial = exitSnapshot(child);
  if (initial.exitConfirmed) return result(true, initial);

  const observer = observeExit(child);
  const gracefulWaitMs = boundedTimeout(timeoutMs, MAX_GRACEFUL_WAIT_MS, MAX_GRACEFUL_WAIT_MS);
  const forceWaitMs = boundedTimeout(forceStopTimeoutMs, MAX_FORCE_STOP_WAIT_MS, MAX_FORCE_STOP_WAIT_MS);

  try {
    if (observer && typeof requestBrowserClose === "function") {
      const beforeRequest = observer.snapshot();
      if (beforeRequest.exitConfirmed) return result(true, beforeRequest);

      try {
        Promise.resolve(requestBrowserClose()).catch(() => {});
      } catch {}

      await waitForExitOrTimeout(observer, gracefulWaitMs, setTimer, clearTimer);
      const afterGracefulWait = observer.snapshot();
      if (afterGracefulWait.exitConfirmed) return result(true, afterGracefulWait);
    }

    const beforeForceStop = observer?.snapshot() ?? exitSnapshot(child);
    if (beforeForceStop.exitConfirmed) return result(true, beforeForceStop);
    if (typeof forceStop !== "function") return result(false, beforeForceStop);

    let forceStopOperation;
    try {
      forceStopOperation = Promise.resolve(forceStop(child));
    } catch {
      forceStopOperation = Promise.resolve();
    }
    forceStopOperation.catch(() => {});
    await waitForOperation(forceStopOperation, forceWaitMs, setTimer, clearTimer);
    return result(false, observer?.snapshot() ?? exitSnapshot(child));
  } finally {
    observer?.cleanup();
  }
}

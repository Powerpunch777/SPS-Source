/** Coordinates ordinary quit attempts with update-owned shutdown drains. */
export function createSpsDesktopQuitCoordinator({
  isComplete,
  isInstalling,
  drain,
  setQuitting,
  setShutdownComplete,
  consumeQuitRequest,
  quit,
  showFailure,
  requestQuit,
  trace = () => {},
}) {
  let pending = null;

  function handle(event) {
    const complete = isComplete();
    trace(complete ? "before_quit_complete" : "before_quit_start");
    if (complete) return Promise.resolve(false);

    event.preventDefault();
    if (isInstalling()) {
      // The updater owns this drain and must hand off the installer first.
      consumeQuitRequest();
      return Promise.resolve(false);
    }
    if (pending) return pending;

    setQuitting(true);
    const operation = Promise.resolve().then(drain).then(async () => {
      trace("drain_complete");
      setShutdownComplete(true);
      trace("retry_app_quit");
      if (pending === operation) pending = null;
      quit();
      return true;
    }).catch(async () => {
      trace("drain_failed");
      setShutdownComplete(false);
      setQuitting(false);
      consumeQuitRequest();
      let shouldRetry = false;
      try { shouldRetry = (await showFailure()) === true; } catch {}

      // Keep the attempt singleflight until its failure UI is dismissed.
      if (pending === operation) pending = null;
      consumeQuitRequest();
      if (shouldRetry) requestQuit();
      return false;
    });
    pending = operation;
    return operation;
  }

  return {
    handle,
    isPending: () => pending !== null,
  };
}

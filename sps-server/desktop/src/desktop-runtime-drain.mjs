/** Join every owned cleanup, including when an earlier stage failed. Managers
 * own their bounded graceful wait/escalation and must reject unconfirmed exits. */
export function createSpsDesktopRuntimeDrain({ stopIngress, stopScheduling, cancelCommands,
  stopUpdates, getManagers, trace = () => {} }) {
  let inFlight = null;

  async function perform() {
    const failures = [];
    async function attempt(label, action) {
      try { await action(); }
      catch { failures.push(new Error(label)); }
    }
    await attempt("Native listener cleanup did not finish.", stopIngress);
    trace("stop_scheduling_start");
    await attempt("Node scheduling did not stop.", stopScheduling);
    trace("stop_scheduling_done");
    trace("cancel_commands_start");
    await attempt("Node command cleanup did not finish.", cancelCommands);
    trace("cancel_commands_done");
    await attempt("Update scheduling did not stop.", stopUpdates);
    trace("stop_managers_start");
    const managers = getManagers();
    const settled = await Promise.allSettled(managers.map(async manager => {
      await manager.stop();
      manager.onStopped?.();
    }));
    for (let index = 0; index < settled.length; index++) {
      if (settled[index].status === "rejected") {
        failures.push(new Error(`${managers[index].name} cleanup did not finish.`));
      }
    }
    trace("stop_managers_done");
    if (failures.length) throw new AggregateError(failures, "SPS Desktop cleanup did not finish.");
  }

  return function drain() {
    if (inFlight) return inFlight;
    // Defer execution until the shared promise is retained, including sync throws.
    const operation = Promise.resolve().then(perform);
    inFlight = operation;
    const release = () => { if (inFlight === operation) inFlight = null; };
    void operation.then(release, release);
    return operation;
  };
}

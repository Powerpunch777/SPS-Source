/** Join every owned cleanup, including when an earlier stage failed. Managers
 * own their bounded graceful wait/escalation and must reject unconfirmed exits. */
export function createSpsDesktopRuntimeDrain({ stopIngress, stopScheduling, cancelCommands,
  stopUpdates, stopHostShares, getManagers, trace = () => {} }) {
  let inFlight = null;

  const managerTraceIds = new Map([
    ["Native Workspace", "native_workspace"],
    ["Native Plugin", "native_plugin"],
    ["Native Node", "native_node"],
    ["Memory", "memory"],
    ["Owner Host", "owner_host"],
    ["Owner Host restore", "owner_host_restore"],
    ["Plugin preview", "plugin_preview"],
  ]);
  const managerLabels = new Map([...managerTraceIds].map(([label, id]) => [id, label]));
  const emit = stage => {
    try { trace(stage); } catch { /* Diagnostics cannot interrupt cleanup. */ }
  };

  async function perform() {
    const failures = [];
    async function attempt(label, stage, action) {
      emit(`${stage}_start`);
      try {
        await action();
        emit(`${stage}_done`);
      } catch {
        emit(`${stage}_failed`);
        failures.push(new Error(label));
      }
    }
    // Closing share admission is synchronous in this callback. Join its full
    // accepted actions before stopping the Core they may still be using, while
    // allowing independent ingress/command cleanup to proceed.
    const hostShares = stopHostShares
      ? attempt("Host share cleanup did not finish.", "stop_host_shares", stopHostShares)
      : Promise.resolve();
    await attempt("Native listener cleanup did not finish.", "stop_ingress", stopIngress);
    await attempt("Node scheduling did not stop.", "stop_scheduling", stopScheduling);
    await attempt("Node command cleanup did not finish.", "cancel_commands", cancelCommands);
    await attempt("Update scheduling did not stop.", "stop_updates", stopUpdates);
    await hostShares;
    emit("stop_managers_start");
    const managers = getManagers();
    const settled = await Promise.allSettled(managers.map(async manager => {
      const id = managerTraceIds.get(manager.name);
      if (id) emit(`manager_${id}_start`);
      try {
        await manager.stop();
        manager.onStopped?.();
        if (id) emit(`manager_${id}_done`);
      } catch (error) {
        if (id) emit(`manager_${id}_failed`);
        throw error;
      }
    }));
    for (let index = 0; index < settled.length; index++) {
      if (settled[index].status === "rejected") {
        const id = managerTraceIds.get(managers[index].name);
        failures.push(new Error(id
          ? `${managerLabels.get(id)} cleanup did not finish.`
          : "Runtime manager cleanup did not finish."));
      }
    }
    emit("stop_managers_done");
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

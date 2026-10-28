/**
 * Selects one unit of Desktop Node work without assigning workflow meaning to
 * it. Legacy Agent commands retain priority for compatibility; a plugin-owned
 * run is claimed only when that queue is empty and always carries its own
 * event, lease, and completion transport.
 */
export function createSpsNodeCommandPollGate() {
  let generation = 0;
  let inFlight = null;

  return Object.freeze({
    begin(isEligible) {
      if (inFlight || !isEligible()) return null;
      generation += 1;
      const ticket = Object.freeze({ generation });
      inFlight = ticket;
      return ticket;
    },
    isCurrent(ticket, isEligible) {
      return Boolean(ticket && inFlight === ticket && ticket.generation === generation && isEligible());
    },
    isGeneration(value) {
      return value === generation;
    },
    currentGeneration() {
      return generation;
    },
    stop() {
      generation += 1;
      inFlight = null;
    },
    finish(ticket) {
      if (inFlight === ticket) inFlight = null;
    },
  });
}

export async function claimNextSpsNodeWork({ claimAgentCommand, claimPluginRun, assertCurrent = () => {} }) {
  assertCurrent();
  const agentCommand = await claimAgentCommand();
  assertCurrent();
  if (agentCommand) return { kind: "agent-command", command: agentCommand };

  assertCurrent();
  const pluginRun = await claimPluginRun();
  assertCurrent();
  return pluginRun ? { kind: "plugin-run", command: pluginRun } : null;
}

export function executionTransportForSpsNodeWork(kind, pluginTransport) {
  if (kind !== "plugin-run") return {};
  return {
    appendCommandEvent: pluginTransport.appendCommandEvent,
    checkCommandLease: pluginTransport.checkCommandLease,
    completeCommand: pluginTransport.completeCommand,
  };
}

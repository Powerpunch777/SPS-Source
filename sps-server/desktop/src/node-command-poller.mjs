/**
 * Selects one unit of Desktop Node work without assigning workflow meaning to
 * it. Legacy Agent commands retain priority for compatibility; a plugin-owned
 * run is claimed only when that queue is empty and always carries its own
 * event, lease, and completion transport.
 */
export async function claimNextSpsNodeWork({ claimAgentCommand, claimPluginRun }) {
  const agentCommand = await claimAgentCommand();
  if (agentCommand) return { kind: "agent-command", command: agentCommand };

  const pluginRun = await claimPluginRun();
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

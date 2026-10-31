export const LEGACY_RECOVERY_UI_PHASES = Object.freeze([
  "initial-launch", "initial-window", "initial-target", "initial-controls", "initial-backup", "initial-inside",
  "initial-uncheck", "initial-recheck", "initial-cancel", "initial-exit", "cleanup-launch", "cleanup-window",
  "cleanup-target", "cleanup-controls", "await-uninstalled", "decline-check", "decline-confirm", "decline-status",
  "await-cleanup", "cleanup-check", "cleanup-confirm", "cleanup-status", "cleanup-close", "cleanup-exit", "done",
]);

export function parseLegacyRecoveryUiTrace(line) {
  if (typeof line !== "string" || line.length > 80) throw new Error("Invalid legacy recovery UI trace.");
  const reason = /^LEGACY_UI_REASON:(recovery-unavailable|recovery-window-deadline|check-observation-deadline|cleanup-safety-rejected)$/.exec(line);
  if (reason && reason[0] === line) return { kind: "reason", phase: reason[1] };
  const match = /^LEGACY_UI_(PHASE|FAILURE):([a-z-]+)$/.exec(line);
  if (!match || match[0] !== line || (!LEGACY_RECOVERY_UI_PHASES.includes(match[2])
    && !(match[1] === "FAILURE" && match[2] === "entry"))) {
    throw new Error("Invalid legacy recovery UI trace.");
  }
  return { kind: match[1] === "PHASE" ? "phase" : "failure", phase: match[2] };
}

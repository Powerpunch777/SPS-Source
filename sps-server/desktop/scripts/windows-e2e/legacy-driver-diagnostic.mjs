const phases = new Set(["initial-window", "initial-target", "initial-controls", "initial-backup", "initial-inside",
  "initial-uncheck", "initial-recheck", "initial-cancel", "initial-exit", "check-observation", "confirmation",
  "fixture-compilation", "child-timeout", "child-output", "child-launch", "child-result"]);
const types = new Set(["DriverFailure", "CheckObservationDeadlineFailure", "RecoveryWindowDeadlineFailure", "AggregateException",
  "COMException", "ElementNotAvailableException", "InvalidOperationException", "TargetInvocationException",
  "compilation-failure", "contract-failure", "timeout", "output-limit", "launch-failure", "test-failure", "unclassified"]);
const operations = new Set(["FindTopWindows", "WindowClass", "ReadWindowText", "WaitForRecoveryWindow",
  "RemainingMilliseconds", "RecoveryWindowDeadlineFailure", "DriverFailure", "unclassified"]);
const modalSteps = new Set(["start", "window", "decline", "decline-result", "accept", "exit", "unclassified"]);

function boundedCode(value) {
  return Number.isInteger(value) && value >= -1 && value <= 65535 ? value : undefined;
}

export function formatLegacyDriverDiagnostic(failure, exitCode) {
  const phase = phases.has(failure?.phase) ? failure.phase : "wrapper-child";
  const type = types.has(failure?.type) ? failure.type : `exit-${boundedCode(exitCode) ?? "unknown"}`;
  const operation = operations.has(failure?.operation) ? failure.operation : undefined;
  const nativeCode = boundedCode(failure?.nativeCode);
  const modalStep = modalSteps.has(failure?.modalStep) ? failure.modalStep : undefined;
  const interactive = typeof failure?.interactive === "boolean" ? failure.interactive : undefined;
  return `Private-desktop component probe failed at ${phase} (${type}${operation ? `; ${operation}` : ""}`
    + `${nativeCode === undefined ? "" : `; native-${nativeCode}`}`
    + `${modalStep ? `; modal-${modalStep}` : ""}${interactive === undefined ? "" : `; interactive-${interactive}`}).`;
}

export const NATIVE_IDENTITY_FAILURE_PREFIX = "SPS_NATIVE_IDENTITY_FAILURE=";

const phases = new Set(["create", "reload"]);
const stages = new Set([
  "electron_startup",
  "arguments",
  "root_validation",
  "user_data_setup",
  "app_ready",
  "runtime_validation",
  "secure_storage",
  "identity_store",
  "identity_create",
  "identity_reload",
  "storage_validation",
  "member_pending_create",
  "member_pending_reload",
  "member_issued_create",
  "member_issued_reload",
  "watchdog",
  "child_protocol",
  "owned_temp_cleanup",
  "orchestration",
]);
const errorCodes = new Set([
  "electron_process_failed",
  "electron_startup_failed",
  "invalid_invocation",
  "unsafe_smoke_root",
  "smoke_root_directory_invalid",
  "smoke_temp_directory_invalid",
  "smoke_root_parent_mismatch",
  "smoke_root_prefix_invalid",
  "smoke_directory_setup_failed",
  "electron_version_mismatch",
  "runtime_override_disallowed",
  "secure_storage_unavailable",
  "identity_operation_failed",
  "member_pending_operation_failed",
  "smoke_watchdog_expired",
  "child_report_invalid",
  "owned_temp_cleanup_refused",
  "orchestration_failed",
]);
const MAX_STDERR_LENGTH = 8 * 1024;
const MAX_DIAGNOSTIC_LINE_LENGTH = 1024;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)/;
const fingerprintPattern = /^[a-f0-9]{64}/;
const keys = [
  "phase",
  "stage",
  "errorCode",
  "electronRuntimeVersion",
  "nodeRuntimeVersion",
  "expectedElectronVersion",
];
const sortedKeys = [...keys].sort();

export function isNativeIdentityVersion(value) {
  if (typeof value !== "string" || value.length > 64) return false;
  return versionPattern.exec(value)?.[0] === value;
}

export function isNativeIdentityFingerprint(value) {
  if (typeof value !== "string" || value.length !== 64) return false;
  return fingerprintPattern.exec(value)?.[0] === value;
}

function isVersion(value, nullable = false) {
  return (nullable && value === null) || isNativeIdentityVersion(value);
}

export function createNativeIdentityFailureReport(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = {
    phase: value.phase,
    stage: value.stage,
    errorCode: value.errorCode,
    electronRuntimeVersion: value.electronRuntimeVersion,
    nodeRuntimeVersion: value.nodeRuntimeVersion,
    expectedElectronVersion: value.expectedElectronVersion,
  };
  if (!phases.has(report.phase) || !stages.has(report.stage) || !errorCodes.has(report.errorCode)
    || !isVersion(report.electronRuntimeVersion, true) || !isVersion(report.nodeRuntimeVersion, true)
    || !isVersion(report.expectedElectronVersion)) return null;
  return report;
}

export function serializeNativeIdentityFailure(value) {
  const report = createNativeIdentityFailureReport(value);
  return report ? NATIVE_IDENTITY_FAILURE_PREFIX + JSON.stringify(report) : null;
}

export function parseNativeIdentityFailure(stderr, expected = {}) {
  if (typeof stderr !== "string" || stderr.length > MAX_STDERR_LENGTH) return null;
  const lines = stderr.split(/\r?\n/).filter(line => line.startsWith(NATIVE_IDENTITY_FAILURE_PREFIX));
  if (lines.length !== 1) return null;
  const encoded = lines[0].slice(NATIVE_IDENTITY_FAILURE_PREFIX.length);
  if (!encoded || encoded.length > MAX_DIAGNOSTIC_LINE_LENGTH) return null;
  let value;
  try { value = JSON.parse(encoded); }
  catch { return null; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (JSON.stringify(value) !== encoded) return null;
  const actualKeys = Object.keys(value).sort();
  if (actualKeys.length !== sortedKeys.length || actualKeys.some((key, index) => key !== sortedKeys[index])) return null;
  const report = createNativeIdentityFailureReport(value);
  if (!report || (expected.phase && report.phase !== expected.phase)
    || (expected.expectedElectronVersion && report.expectedElectronVersion !== expected.expectedElectronVersion)) return null;
  return report;
}

export function formatNativeIdentityFailure(value) {
  const report = createNativeIdentityFailureReport(value);
  if (!report) return "Native identity smoke failed (code=child_report_invalid).";
  return `Native identity smoke failed: phase=${report.phase} stage=${report.stage} code=${report.errorCode} `
    + `Electron=${report.electronRuntimeVersion ?? "unknown"} Node=${report.nodeRuntimeVersion ?? "unknown"} `
    + `expectedElectron=${report.expectedElectronVersion}.`;
}

const PHASES = new Set(["bootstrap", "identity_start", "desktop_launch", "owner_creation", "owner_workspace",
  "agent_registration", "builder_tools", "builder_project", "builder_surface", "developer_registry",
  "project_handoff", "sdk_project", "lead_folder", "preview_feedback", "live_authoring", "authoring_gates",
  "preview_apply", "isolation_checks", "packaging", "diagnostics", "production_install", "cleanup"]);
const OPERATIONS = new Set(["plugin_tools_list", "plugin_tool_execute", "plugin_list", "agent_get",
  "agent_create", "heartbeat_invoke", "project_list", "project_create"]);
const CODES = new Set(["ERR_ASSERTION", "EACCES", "EPERM", "ENOENT", "EEXIST", "EINVAL", "EBUSY",
  "ENOSPC", "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ERR_MODULE_NOT_FOUND"]);
const uuid = "[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}";

function ownValue(value, name) {
  try { return Object.getOwnPropertyDescriptor(value, name)?.value; }
  catch { return undefined; }
}

function operationFor(method, pathName) {
  if (typeof pathName !== "string" || pathName.length > 512) return null;
  if (method === "GET" && pathName === "/api/plugins/tools?pluginId=sps.plugin-discovery") return "plugin_tools_list";
  if (method === "POST" && pathName === "/api/plugins/tools/execute") return "plugin_tool_execute";
  if (method === "GET" && pathName === "/api/plugins") return "plugin_list";
  if (method === "GET" && new RegExp(`^/api/agents/${uuid}$`, "i").test(pathName)) return "agent_get";
  if (method === "POST" && new RegExp(`^/api/agents/${uuid}/heartbeat/invoke$`, "i").test(pathName)) return "heartbeat_invoke";
  if (new RegExp(`^/api/companies/${uuid}/agents$`, "i").test(pathName) && method === "POST") return "agent_create";
  if (new RegExp(`^/api/companies/${uuid}/projects$`, "i").test(pathName)) {
    if (method === "GET") return "project_list";
    if (method === "POST") return "project_create";
  }
  return null;
}

function categoryFor(message) {
  if (typeof message !== "string" || message.length > 64 * 1024) return "unclassified";
  if (/EACCES|EPERM|permission denied|access is denied|forbidden|not authorized/i.test(message)) return "permission_denied";
  if (/ENOENT|no such file|cannot find (?:module|package)|ERR_MODULE_NOT_FOUND/i.test(message)) return "missing_file_or_dependency";
  if (/run.*(?:not running|inactive|unavailable)|run_context|heartbeat.*unavailable/i.test(message)) return "run_context_unavailable";
  if (/not a function|cannot read properties|cannot set properties|cannot destructure/i.test(message)) return "javascript_contract";
  if (/timeout|timed out/i.test(message)) return "timeout";
  return "unclassified";
}

export function annotatePreviewE2eCdpFailure(error, details) {
  const exception = ownValue(details, "exception");
  const className = ownValue(exception, "className");
  const kind = className === "TypeError" ? "type_error" : className === "RangeError" ? "range_error"
    : className === "SyntaxError" ? "syntax_error" : "error";
  const category = categoryFor(ownValue(exception, "description"));
  try { Object.defineProperty(error, "previewE2eCdp", { value: Object.freeze({ kind, category }) }); }
  catch { /* Preserve the original CDP failure and its digest. */ }
  return error;
}

export function annotatePreviewE2eApiFailure(error, { method, pathName, status } = {}) {
  const operation = operationFor(method, pathName);
  const httpStatus = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
  try {
    Object.defineProperty(error, "previewE2eApi", { value: Object.freeze({ operation, httpStatus }) });
  } catch { /* Preserve a frozen or non-object original failure unchanged. */ }
  return error;
}

// Finite diagnostic hints only: never echo an exception, path, API body or label.
export function snapshotPreviewE2eFailure(error, phase) {
  const code = ownValue(error, "code");
  let kind = code === "ERR_ASSERTION" ? "assertion" : "error";
  try {
    if (error instanceof TypeError) kind = "type_error";
    else if (error instanceof RangeError) kind = "range_error";
    else if (error instanceof SyntaxError) kind = "syntax_error";
  } catch {}
  const metadata = ownValue(error, "previewE2eApi");
  const operation = ownValue(metadata, "operation");
  const status = ownValue(metadata, "httpStatus");
  const cdp = ownValue(error, "previewE2eCdp"), cdpKind = ownValue(cdp, "kind"), cdpCategory = ownValue(cdp, "category");
  if (["type_error", "range_error", "syntax_error"].includes(cdpKind)) kind = cdpKind;
  let category = categoryFor(ownValue(error, "message"));
  if (category === "unclassified" && ["permission_denied", "missing_file_or_dependency", "run_context_unavailable",
    "javascript_contract", "timeout"].includes(cdpCategory)) category = cdpCategory;
  if (category === "unclassified" && Number.isInteger(status) && status >= 300 && status <= 599) category = "http_failure";
  if (category === "unclassified" && kind === "assertion") category = "assertion";
  return Object.freeze({ phase: PHASES.has(phase) ? phase : "unknown", kind, category,
    code: CODES.has(code) ? code : null,
    apiOperation: OPERATIONS.has(operation) ? operation : null,
    httpStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null });
}

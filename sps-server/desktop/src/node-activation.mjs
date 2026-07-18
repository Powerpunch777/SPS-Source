const SPS_NODE_STATUSES = new Set(["pending", "active", "revoked"]);

export function normalizeSpsNodeStatus(value) {
  return typeof value === "string" && SPS_NODE_STATUSES.has(value) ? value : null;
}

export function canRunSpsNodeCommands(status) {
  return normalizeSpsNodeStatus(status) === "active";
}

export function spsNodeStatusLabel(status) {
  switch (normalizeSpsNodeStatus(status)) {
    case "active":
      return "approved";
    case "pending":
      return "waiting for Owner approval";
    case "revoked":
      return "revoked";
    default:
      return "checking approval";
  }
}

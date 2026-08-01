const SPS_NODE_STATUSES = new Set(["pending", "active", "revoked"]);

/**
 * A signed-in Member refreshes the existing Node record on startup and when
 * entering Workspace. Core matches the registration by the existing public
 * identity, so this refresh keeps the Node id while publishing current
 * Desktop metadata and transport material. Revoked/removed connections must
 * never be revived by this automatic path.
 */
export function shouldRefreshJoinedDesktopNode({
  profile,
  signedIn,
  nodeId,
  nodeStatus,
}) {
  if (profile?.connectionKind === "owner-host") return false;
  if (!profile?.companyId || !signedIn) return false;
  if (!nodeId) return true;
  if (nodeStatus === "revoked" || nodeStatus === "removed") return false;
  return nodeStatus === null || nodeStatus === undefined || SPS_NODE_STATUSES.has(nodeStatus);
}

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

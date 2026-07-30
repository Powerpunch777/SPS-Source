export function shouldEnsureJoinedDesktopNode({
  profile,
  signedIn,
  nodeId,
  nodeStatus,
  hasTransportIdentity = true,
  hasPublishedTransportKey = true,
}) {
  if (profile?.connectionKind === "owner-host") return false;
  if (!profile?.companyId || !signedIn) return false;
  if (!nodeId || nodeStatus === "revoked") return true;
  // Legacy Member identities predate the Node-sealed project-source key.
  // Registering once updates the existing Node record; it does not create a
  // second Node or change its Owner approval.
  return !hasTransportIdentity || !hasPublishedTransportKey;
}

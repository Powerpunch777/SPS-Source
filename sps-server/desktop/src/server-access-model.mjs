export const SPS_SERVER_ACCESS_MODE = Object.freeze({
  UNCONFIGURED: "unconfigured",
  LOCAL_TRUSTED: "local_trusted",
  AUTHENTICATED_MEMBERSHIP: "authenticated_membership",
});

// Server data always belongs to the SPS Server. This describes only how a
// person is allowed to reach that data from the current Desktop installation.
export function resolveSpsServerAccess({ profile, teamAccess } = {}) {
  const ownerHost = profile?.connectionKind === "owner-host";
  const teamProtected = Boolean(teamAccess?.enabled && teamAccess?.phase === "active");

  if (ownerHost && !teamProtected) {
    return {
      mode: SPS_SERVER_ACCESS_MODE.LOCAL_TRUSTED,
      dataOwner: "server",
      requiresMembership: false,
      offlineCapable: true,
      serverRole: "host",
    };
  }

  if (teamProtected || profile?.connectionKind === "remote") {
    return {
      mode: SPS_SERVER_ACCESS_MODE.AUTHENTICATED_MEMBERSHIP,
      dataOwner: "server",
      requiresMembership: true,
      offlineCapable: false,
      serverRole: ownerHost ? "host" : "member",
    };
  }

  return {
    mode: SPS_SERVER_ACCESS_MODE.UNCONFIGURED,
    dataOwner: "server",
    requiresMembership: false,
    offlineCapable: false,
    serverRole: "none",
  };
}

export const SPS_SERVER_ACCESS_MODE = Object.freeze({
  UNCONFIGURED: "unconfigured",
  AUTHENTICATED_HOST: "authenticated_host",
  AUTHENTICATED_MEMBERSHIP: "authenticated_membership",
});

// Server data always belongs to the SPS Server. This describes only how a
// person is allowed to reach that data from the current Desktop installation.
export function resolveSpsServerAccess({ profile, teamAccess } = {}) {
  const ownerHost = profile?.connectionKind === "owner-host";
  const teamProtected = Boolean(teamAccess?.enabled && teamAccess?.phase === "active");

  if (ownerHost && !teamProtected) {
    return {
      mode: SPS_SERVER_ACCESS_MODE.AUTHENTICATED_HOST,
      dataOwner: "server",
      requiresMembership: false,
      serverRole: "host",
    };
  }

  if (teamProtected || profile?.connectionKind === "remote") {
    return {
      mode: SPS_SERVER_ACCESS_MODE.AUTHENTICATED_MEMBERSHIP,
      dataOwner: "server",
      requiresMembership: true,
      serverRole: ownerHost ? "host" : "member",
    };
  }

  return {
    mode: SPS_SERVER_ACCESS_MODE.UNCONFIGURED,
    dataOwner: "server",
    requiresMembership: false,
    serverRole: "none",
  };
}

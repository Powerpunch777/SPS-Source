function hasProfile(status) {
  return Boolean(status?.profile?.hubUrl);
}

function hasCompany(status) {
  return Boolean(status?.profile?.companyId);
}

function isApproved(status) {
  return status?.nodeStatus === "active";
}

export function createSpsDesktopSetupReadiness(status) {
  const ownerHostReady = ["running", "running-existing"].includes(status?.ownerHost?.state);
  if (status?.profile?.connectionKind === "owner-host") {
    const steps = [
      {
        id: "owner-host",
        title: "Start Owner Host",
        detail: ownerHostReady
          ? "This computer is running the SPS Host and its encrypted Owner Vault."
          : status?.ownerHost?.lastError ?? "SPS Owner Host is starting on this computer.",
        state: ownerHostReady ? "complete" : "current",
      },
      {
        id: "workspace",
        title: "Open workspace",
        detail: ownerHostReady
          ? "Projects, Rooms, Tasks, and local Agents are ready in SPS Desktop."
          : "The workspace opens after the Owner Host is ready.",
        state: ownerHostReady ? "current" : "blocked",
      },
      {
        id: "team-access",
        title: "Add team access later",
        detail: "Private or public team access, invitations, and Member Nodes are configured after the local workspace is ready.",
        state: "blocked",
      },
    ];
    return {
      steps,
      ready: ownerHostReady,
      canOpenInvite: false,
      canStartAuth: false,
      canCheckAuth: false,
      canConnectNode: false,
      canOpenWorkspace: ownerHostReady,
      canManageProjects: false,
    };
  }
  const profileReady = hasProfile(status);
  const signedIn = Boolean(status?.signedIn);
  const companyReady = hasCompany(status);
  const nodePending = Boolean(status?.nodeId) && status?.nodeStatus === "pending";
  const nodeApproved = isApproved(status);
  const steps = [
    {
      id: "profile",
      title: "Save team connection",
      detail: profileReady ? "Team address is saved. Google names this computer after sign-in." : "Open an invitation or enter the team address for this computer.",
      state: profileReady ? "complete" : "current",
    },
    {
      id: "sign-in",
      title: "Sign in with Google",
      detail: signedIn ? "This computer has a protected SPS Desktop session." : "Accept an invitation when needed, then approve Google sign-in in your browser.",
      state: signedIn ? "complete" : profileReady ? "current" : "blocked",
    },
    {
      id: "company",
      title: "Choose company",
      detail: companyReady ? "This computer is scoped to the selected SPS company." : "Select the company this computer may serve after sign-in.",
      state: companyReady ? "complete" : signedIn ? "current" : "blocked",
    },
    {
      id: "node",
      title: "Register this computer",
      detail: nodeApproved
        ? "Owner approval is active. This computer can run only authorized Agent commands."
        : nodePending
          ? "The computer key is verified. It is waiting for an Owner to approve it in Company settings > Nodes."
          : "Register the local runtimes, then an Owner grants this computer access to Agents.",
      state: nodeApproved ? "complete" : nodePending ? "current" : companyReady ? "current" : "blocked",
    },
  ];

  return {
    steps,
    ready: nodeApproved,
    canOpenInvite: profileReady,
    canStartAuth: profileReady && !signedIn,
    canCheckAuth: Boolean(status?.pendingAuth),
    canConnectNode: profileReady && signedIn && companyReady,
    canOpenWorkspace: profileReady && signedIn,
    canManageProjects: signedIn && companyReady,
  };
}

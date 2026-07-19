function hasProfile(status) {
  return Boolean(status?.profile?.hubUrl && status?.profile?.displayName);
}

function hasCompany(status) {
  return Boolean(status?.profile?.companyId);
}

function isApproved(status) {
  return status?.nodeStatus === "active";
}

export function createSpsDesktopSetupReadiness(status) {
  const profileReady = hasProfile(status);
  const signedIn = Boolean(status?.signedIn);
  const companyReady = hasCompany(status);
  const nodePending = Boolean(status?.nodeId) && status?.nodeStatus === "pending";
  const nodeApproved = isApproved(status);
  const steps = [
    {
      id: "profile",
      title: "Save Hub profile",
      detail: profileReady ? "Hub address and computer name are saved." : "Enter the Hub address and a name for this computer.",
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
          ? "The computer key is verified. It is waiting for an Owner to approve it in SPS Hub."
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

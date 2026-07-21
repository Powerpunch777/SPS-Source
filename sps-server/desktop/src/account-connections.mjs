function stringOrEmpty(value, limit = 4096) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function cloneProjectWorkspaces(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([projectId, workspacePath]) => (
        typeof projectId === "string"
        && projectId.length > 0
        && projectId.length <= 240
        && typeof workspacePath === "string"
      ))
      .map(([projectId, workspacePath]) => [projectId, workspacePath.slice(0, 4096)]),
  );
}

// A connection is only routing and local-workspace metadata. Authentication
// tokens and Node signing keys remain active-session state and are cleared on
// account switch.
export function normalizeSpsAccountConnection(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const hubUrl = stringOrEmpty(value.hubUrl);
  if (!hubUrl) return null;
  const connectionKind = value.connectionKind === "owner-host" ? "owner-host" : "remote";
  return {
    hubUrl,
    connectionKind,
    companyId: stringOrEmpty(value.companyId, 240),
    displayName: stringOrEmpty(value.displayName, 120),
    defaultWorkspacePath: stringOrEmpty(value.defaultWorkspacePath),
    projectWorkspaces: cloneProjectWorkspaces(value.projectWorkspaces),
  };
}

export function getSpsAccountConnection(connections, subject) {
  if (!connections || typeof connections !== "object" || Array.isArray(connections)) return null;
  const key = stringOrEmpty(subject, 512);
  if (!key) return null;
  return normalizeSpsAccountConnection(connections[key]);
}

export function setSpsAccountConnection(connections, subject, profile) {
  const key = stringOrEmpty(subject, 512);
  const normalized = normalizeSpsAccountConnection(profile);
  const current = connections && typeof connections === "object" && !Array.isArray(connections)
    ? connections
    : {};
  if (!key || !normalized) return { ...current };
  return { ...current, [key]: normalized };
}

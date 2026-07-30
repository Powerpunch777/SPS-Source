function text(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/**
 * Normalize Host-local source metadata. A registered Core handle can exist
 * without a folder mapping after a Host Vault transfer; that never gives a
 * Member computer the right to substitute its own folder.
 */
export function normalizeSpsWorkspaceSources(value) {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set();
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const id = text(candidate.id, 80);
    const name = text(candidate.name, 96);
    const sourcePath = text(candidate.sourcePath, 4096);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,79}$/.test(id) || !name || seenIds.has(id)) return [];
    seenIds.add(id);
    return [{ id, name, sourcePath }];
  });
}

export function addSpsWorkspaceSource(sources, source) {
  const normalized = normalizeSpsWorkspaceSources(sources);
  const candidate = normalizeSpsWorkspaceSources([source])[0];
  if (!candidate?.sourcePath) throw new Error("Choose a local folder before registering a Workspace source.");
  if (normalized.some((item) => item.id === candidate.id)) {
    throw new Error("A Workspace source with this identifier already exists.");
  }
  return [...normalized, candidate];
}

export function renameSpsWorkspaceSource(sources, sourceId, name) {
  const id = text(sourceId, 80);
  const nextName = text(name, 96);
  if (!id || !nextName) throw new Error("A Workspace source name is required.");
  const normalized = normalizeSpsWorkspaceSources(sources);
  let found = false;
  const result = normalized.map((source) => {
    if (source.id !== id) return source;
    found = true;
    return { ...source, name: nextName };
  });
  if (!found) throw new Error("The Workspace source no longer exists.");
  return result;
}

export function removeSpsWorkspaceSource(sources, sourceId) {
  const id = text(sourceId, 80);
  const normalized = normalizeSpsWorkspaceSources(sources);
  const result = normalized.filter((source) => source.id !== id);
  if (result.length === normalized.length) throw new Error("The Workspace source no longer exists.");
  return result;
}

export function builderDraftKey(companyId, conversationId) {
  return JSON.stringify([companyId, conversationId ?? null]);
}

// Drafts and attachment contents stay in this mounted page, never browser storage.
export function createBuilderDraftStore() {
  const entries = new Map();
  const empty = () => ({ draft: "", files: [] });
  return {
    read(key) { return entries.get(key) ?? empty(); },
    update(key, patch) {
      const next = { ...(entries.get(key) ?? empty()), ...patch };
      if (!next.draft && !next.files.length) entries.delete(key);
      else entries.set(key, next);
      return next;
    },
    move(from, to) {
      if (from === to) return;
      const entry = entries.get(from);
      if (entry) entries.set(to, entry);
      entries.delete(from);
    },
    clearSent(key, sent) {
      const entry = entries.get(key);
      if (!entry) return;
      const next = {
        draft: entry.draft === sent.draft ? "" : entry.draft,
        files: entry.files.filter(file => !sent.files.includes(file)),
      };
      if (!next.draft && !next.files.length) entries.delete(key);
      else entries.set(key, next);
    },
    hasDrafts() { return entries.size > 0; },
    clear() { entries.clear(); },
  };
}

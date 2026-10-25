// Process-local lifecycle exclusion, not user authorization or an OS file lock.
export function createSpsOwnerVaultOperationGate() {
  let starts = 0;
  let connectionChanges = 0;
  let restoring = null;
  return Object.freeze({
    isRestoring: () => restoring !== null,
    async changeConnection(action) {
      if (restoring !== null) throw new Error("Wait for the SPS Host restore to finish before changing accounts or servers.");
      connectionChanges++;
      try { return await action(); } finally { connectionChanges--; }
    },
    async start(action, { restorePermit } = {}) {
      if (restoring !== null && restorePermit !== restoring) {
        throw new Error("Wait for the current SPS Host restore to finish before starting a Host.");
      }
      starts++;
      try { return await action(); } finally { starts--; }
    },
    async restore(action) {
      if (restoring !== null || starts !== 0 || connectionChanges !== 0) {
        throw new Error("Another SPS Host start, connection change or restore is already in progress.");
      }
      const permit = Symbol("SPS Host restore activation");
      restoring = permit;
      try { return await action(permit); } finally { restoring = null; }
    },
  });
}

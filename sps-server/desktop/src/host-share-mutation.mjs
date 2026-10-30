/**
 * Orders Host share grants, revokes, and metadata updates. The caller owns the
 * authority snapshot and must keep using the same assertion for the full
 * operation; this coordinator does not refresh or replace that authority.
 */
export function createSpsHostShareMutationCoordinator() {
  let tail = Promise.resolve();
  let closed = false;
  let closeAndDrainPromise = null;

  function assertCurrentNow(assertCurrent) {
    const result = assertCurrent();
    if (result && typeof result.then === "function") {
      // Observe a mistaken asynchronous assertion so it cannot become an
      // unhandled rejection; authority checks must complete synchronously.
      void Promise.resolve(result).catch(() => undefined);
      throw new TypeError("SPS Host share authority checks must be synchronous.");
    }
  }

  async function run(assertCurrent, action) {
    if (closed) throw new Error("SPS Host share mutations are shutting down.");
    if (typeof assertCurrent !== "function" || typeof action !== "function") {
      throw new TypeError("SPS Host share mutations require an authority check and an action.");
    }

    // Reject already-stale work without putting it into the serialized queue.
    assertCurrentNow(assertCurrent);
    const operation = tail.then(async () => {
      // Authority may have changed while a previous mutation was in progress.
      assertCurrentNow(assertCurrent);
      return await action();
    });
    // A rejected operation must not poison later queued work.
    tail = operation.then(() => undefined, () => undefined);
    return await operation;
  }

  function closeAndDrain() {
    if (!closeAndDrainPromise) {
      closed = true;
      // `tail` deliberately observes each action's rejection so a later
      // queued operation can proceed. Action callers receive the original
      // failure; shutdown only joins their settled work and does not confuse a
      // business reconciliation error with an unclosed child process.
      closeAndDrainPromise = tail;
    }
    return closeAndDrainPromise;
  }

  return Object.freeze({ run, closeAndDrain });
}

export class SpsHostShareReconciliationRequiredError extends Error {
  constructor({ localAccessMayHaveChanged = false, coreMayHaveChanged = false } = {}) {
    super("SPS Host share changes may be incomplete; refresh and reconcile access before retrying.");
    this.name = "SpsHostShareReconciliationRequiredError";
    this.code = "sps_host_share_reconciliation_required";
    this.localAccessMayHaveChanged = localAccessMayHaveChanged === true;
    this.coreMayHaveChanged = coreMayHaveChanged === true;
  }
}

import { OWNED_JOB_CLEANUP_PENDING_EXIT_CODE } from "./preview-e2e-cleanup-contract.mjs";

// Child stdout EOF is local pipe evidence, not evidence that descendants died.
// Only the owning launcher can qualify delegated whole-Job cleanup.
export function workspaceE2eCleanupDisposition({ delegated, children, exited, orderly,
  outputEnded, outputFailed, finalDesktopGraceful, temporaryDataRemoved, identityClosed } = {}) {
  if (typeof delegated !== "boolean" || typeof finalDesktopGraceful !== "boolean"
    || typeof temporaryDataRemoved !== "boolean" || typeof identityClosed !== "boolean"
    || ![children, exited, orderly, outputEnded, outputFailed].every(Number.isSafeInteger)
    || children < 1 || children > 10 || exited < 0 || exited > children || orderly < 0 || orderly > exited
    || outputEnded < 0 || outputEnded > children * 2 || outputFailed < 0 || outputFailed > children * 2) {
    throw new TypeError("Invalid Workspace E2E cleanup evidence.");
  }
  if (exited !== children || orderly !== children || !finalDesktopGraceful
    || !temporaryDataRemoved || !identityClosed || outputFailed !== 0
    || !delegated && outputEnded !== children * 2) {
    throw new Error("Workspace E2E cleanup is incomplete; the test cannot be accepted.");
  }
  return Object.freeze({ exitCode: delegated ? OWNED_JOB_CLEANUP_PENDING_EXIT_CODE : 0,
    kind: delegated ? "owned-job-cleanup-pending" : "local-main-and-output-confirmed" });
}

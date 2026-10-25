export const OWNED_JOB_CLEANUP_ARGUMENT = "--owned-job-cleanup-pending";
export const OWNED_JOB_CLEANUP_PENDING_EXIT_CODE = 76;

// A script cannot qualify its own delegated Job cleanup. Only the owning
// launcher can normalize this nonzero result after independent OS observation.
export function previewE2eCleanupDisposition({ delegated, desktopExitConfirmed, desktopGraceful,
  postgresCleanupConfirmed, temporaryDataRemoved } = {}) {
  if (typeof delegated !== "boolean" || typeof desktopExitConfirmed !== "boolean"
    || typeof desktopGraceful !== "boolean" || typeof temporaryDataRemoved !== "boolean"
    || (delegated ? postgresCleanupConfirmed !== null : typeof postgresCleanupConfirmed !== "boolean")) {
    throw new TypeError("Invalid Preview E2E cleanup evidence.");
  }
  if (!desktopExitConfirmed || !desktopGraceful || !temporaryDataRemoved
    || !delegated && !postgresCleanupConfirmed) {
    throw new Error("Preview E2E cleanup is incomplete; the test cannot be accepted.");
  }
  return Object.freeze({
    exitCode: delegated ? OWNED_JOB_CLEANUP_PENDING_EXIT_CODE : 0,
    kind: delegated ? "owned-job-cleanup-pending" : "local-cleanup-confirmed",
  });
}

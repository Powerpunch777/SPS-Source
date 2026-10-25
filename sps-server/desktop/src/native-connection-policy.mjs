export const SPS_NATIVE_PAIRING_DEFAULT_TTL_MS = 60 * 60 * 1000;

/** Product defaults only; this neither authenticates the caller nor issues an invitation. */
export function defaultSpsNativePairingIssue(actorUserId) {
  if (typeof actorUserId !== "string" || !actorUserId.trim() || actorUserId.length > 200
    || /[\u0000-\u001f\u007f]/.test(actorUserId)) {
    throw new TypeError("An authenticated SPS Host user is required.");
  }
  return Object.freeze({
    actorUserId,
    target: Object.freeze({ kind: "any_verified_user" }),
    ttlMs: SPS_NATIVE_PAIRING_DEFAULT_TTL_MS,
  });
}

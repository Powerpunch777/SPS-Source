export const SPS_TECHNICAL_MEMBER_REMOVED_CODE = "sps_technical_member_removed";

/**
 * A removed Member needs a new invitation. This is distinct from a Node-only
 * revocation, where the same team connection may create a new pending Node.
 */
export function isSpsTechnicalMemberAccessRemoved(error) {
  return error?.status === 403 && error?.code === SPS_TECHNICAL_MEMBER_REMOVED_CODE;
}

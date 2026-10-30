import { randomUUID } from "node:crypto";

const CLAIM_REQUEST_ID_PATTERN = /^v1:[1-9][0-9]{12}:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function createSpsNodeClaimRequestId({ now = Date.now() } = {}) {
  if (!Number.isSafeInteger(now) || now < 1_000_000_000_000 || now >= 10_000_000_000_000) {
    throw new TypeError("SPS Node claim request time must be a 13-digit millisecond timestamp.");
  }
  return `v1:${now}:${randomUUID()}`;
}

export function validateSpsNodeClaimReceipt(value, { claimRequestId, kind } = {}) {
  if (!CLAIM_REQUEST_ID_PATTERN.test(claimRequestId)
    || (kind !== "agent-command" && kind !== "plugin-run")
    || !value || typeof value !== "object" || Array.isArray(value)
    || value.schemaVersion !== 1
    || value.claimRequestId !== claimRequestId
    || value.kind !== kind) {
    return { valid: false };
  }
  const work = value.work;
  if (work !== null && (!work || typeof work !== "object" || Array.isArray(work)
    || typeof work.id !== "string" || work.id.trim().length === 0)) {
    return { valid: false };
  }
  return { valid: true, work };
}

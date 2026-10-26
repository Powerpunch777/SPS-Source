export const SPS_NATIVE_PAIRING_DEFAULT_TTL_MS = 60 * 60 * 1000;
// Approved product policy; Core primitives still require explicit configuration.
export const SPS_NATIVE_PAIRING_DEFAULT_POLICY = Object.freeze({
  maxTtlMs: SPS_NATIVE_PAIRING_DEFAULT_TTL_MS,
  maxAttempts: 5,
  maxActiveInvites: 10,
});

export const SPS_NATIVE_SERVER_CERT_VALIDITY_DAYS = 90;
export const SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS = 90;
export const SPS_NATIVE_ISSUER_CA_CERT_VALIDITY_DAYS = 365;

const MS_PER_SECOND = 1000;
const MS_PER_DAY = 24 * 60 * 60 * MS_PER_SECOND;
const MAX_DATE_EPOCH_MS = Date.UTC(9999, 11, 31, 23, 59, 59);
const CERTIFICATE_VALIDITY_DAYS = Object.freeze({
  server: SPS_NATIVE_SERVER_CERT_VALIDITY_DAYS,
  "member-device": SPS_NATIVE_MEMBER_DEVICE_CERT_VALIDITY_DAYS,
  "issuer-ca": SPS_NATIVE_ISSUER_CA_CERT_VALIDITY_DAYS,
});

/** Deterministic defaults only; this does not create, store, or renew certificates. */
export const defaultSpsNativeCertificateValidity = Object.freeze(function defaultSpsNativeCertificateValidity(
  certificateKind,
  nowEpochMs,
) {
  if (typeof certificateKind !== "string" || !Object.hasOwn(CERTIFICATE_VALIDITY_DAYS, certificateKind)) {
    throw new TypeError("A supported SPS Native certificate kind is required.");
  }
  const validityDays = CERTIFICATE_VALIDITY_DAYS[certificateKind];
  if (typeof nowEpochMs !== "number" || !Number.isFinite(nowEpochMs) || !Number.isInteger(nowEpochMs)) {
    throw new TypeError("nowEpochMs must be an integer epoch-millisecond timestamp.");
  }
  if (!Number.isSafeInteger(nowEpochMs) || nowEpochMs < 1000 || nowEpochMs > MAX_DATE_EPOCH_MS) {
    throw new RangeError("nowEpochMs is outside the supported epoch-millisecond range.");
  }

  const notBeforeEpochSeconds = Math.floor(nowEpochMs / MS_PER_SECOND);
  const notAfterEpochSeconds = notBeforeEpochSeconds + validityDays * MS_PER_DAY / MS_PER_SECOND;
  const notAfterEpochMs = notAfterEpochSeconds * MS_PER_SECOND;
  if (!Number.isSafeInteger(notAfterEpochMs) || notAfterEpochMs > MAX_DATE_EPOCH_MS) {
    throw new RangeError("The certificate validity end is outside the supported date range.");
  }

  return Object.freeze({
    certificateKind,
    validityDays,
    notBeforeEpochSeconds,
    notAfterEpochSeconds,
  });
});

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

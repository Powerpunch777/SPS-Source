import { createHash, timingSafeEqual, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { checkServerIdentity, connect } from "node:tls";
import { parseSpsNativeInviteCode } from "./native-connection-invite.mjs";

const MESSAGES = Object.freeze({
  native_invitation_invalid: "The SPS native invitation is invalid.",
  native_invitation_expired: "The SPS native invitation has expired.",
  native_invitation_not_yet_valid: "The SPS native invitation is not valid yet.",
  native_server_certificate_invalid: "The SPS server certificate is invalid.",
  native_server_certificate_expired: "The SPS server certificate has expired.",
  native_server_certificate_not_yet_valid: "The SPS server certificate is not valid yet.",
  native_server_pin_mismatch: "The SPS server fingerprint does not match the invitation.",
  native_server_name_mismatch: "The SPS server certificate does not match the invited address.",
  native_connection_invalid_options: "The SPS native connection options are invalid.",
  native_connection_failed: "The SPS native TLS connection could not be verified.",
  native_connection_timeout: "The SPS native TLS check timed out.",
  native_connection_cancelled: "The SPS native TLS check was cancelled.",
});

function connectionError(code) {
  return Object.assign(new Error(MESSAGES[code]), { code });
}

function peerHostname(origin) {
  const hostname = new URL(origin).hostname;
  return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
}

function spkiHash(certificate) {
  return createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest();
}

// Validates the invitation's public certificate, not a live peer, device or user.
// The live TLS handshake must still prove possession using this exact certificate.
export function verifySpsNativeInvitationCertificate(code, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now <= 0) throw connectionError("native_connection_invalid_options");
  const invitation = parseSpsNativeInviteCode(code);
  if (!invitation) throw connectionError("native_invitation_invalid");
  if (now >= invitation.expiresAt) throw connectionError("native_invitation_expired");
  if (now < invitation.issuedAt) throw connectionError("native_invitation_not_yet_valid");

  let certificate;
  try {
    const bytes = Buffer.from(invitation.serverCertificate, "base64url");
    certificate = new X509Certificate(bytes);
    if (!certificate.raw.equals(bytes) || certificate.ca
      || certificate.subject !== certificate.issuer || !certificate.verify(certificate.publicKey)
      || !certificate.keyUsage?.includes("1.3.6.1.5.5.7.3.1")) {
      throw new Error("invalid certificate");
    }
  } catch {
    throw connectionError("native_server_certificate_invalid");
  }

  if (!timingSafeEqual(spkiHash(certificate), Buffer.from(invitation.spkiSha256, "hex"))) {
    throw connectionError("native_server_pin_mismatch");
  }
  const notBefore = Date.parse(certificate.validFrom);
  const notAfter = Date.parse(certificate.validTo);
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter) || notBefore >= notAfter) {
    throw connectionError("native_server_certificate_invalid");
  }
  if (now >= notAfter) throw connectionError("native_server_certificate_expired");
  if (now < notBefore) throw connectionError("native_server_certificate_not_yet_valid");

  const hostname = peerHostname(invitation.origin);
  const nameMatches = isIP(hostname)
    ? certificate.checkIP(hostname)
    : certificate.checkHost(hostname, { subject: "never" });
  if (!nameMatches) throw connectionError("native_server_name_mismatch");

  return Object.freeze({
    origin: invitation.origin,
    spkiSha256: invitation.spkiSha256,
    certificatePem: certificate.toString(),
    certificateExpiresAt: notAfter,
  });
}

function validateProbeOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)
    || (Object.getPrototypeOf(options) !== Object.prototype && Object.getPrototypeOf(options) !== null)) {
    throw connectionError("native_connection_invalid_options");
  }
  const descriptors = Object.getOwnPropertyDescriptors(options);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string"
    || !["timeoutMs", "signal"].includes(key) || !("value" in descriptors[key]))) {
    throw connectionError("native_connection_invalid_options");
  }
  const timeoutMs = descriptors.timeoutMs?.value === undefined ? 10_000 : descriptors.timeoutMs.value;
  const signal = descriptors.signal?.value;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000
    || (signal !== undefined && !(signal instanceof AbortSignal))) {
    throw connectionError("native_connection_invalid_options");
  }
  return { timeoutMs, signal };
}

// No HTTP bytes or credentials are sent. Not a pairing or readiness check.
// This remains unconnected to Desktop UI and is exercised only by isolated tests.
export async function probeSpsNativeServerTls(code, options = {}) {
  let validated;
  try { validated = validateProbeOptions(options); }
  catch { throw connectionError("native_connection_invalid_options"); }
  const { timeoutMs, signal } = validated;
  if (signal?.aborted) throw connectionError("native_connection_cancelled");
  const target = verifySpsNativeInvitationCertificate(code);
  const hostname = peerHostname(target.origin);
  const port = Number(new URL(target.origin).port || 443);
  const expectedCertificate = new X509Certificate(target.certificatePem);

  return new Promise((resolve, reject) => {
    let socket;
    let outcome;
    let timer;
    const onAbort = () => stop(connectionError("native_connection_cancelled"));
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (outcome?.error) reject(outcome.error);
      else if (outcome?.value) resolve(outcome.value);
      else reject(connectionError("native_connection_failed"));
    };
    const stop = (error, value) => {
      if (outcome) return;
      outcome = { error, value };
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (socket) socket.destroy();
      else finish();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      stop(connectionError("native_connection_cancelled"));
      return;
    }

    try {
      socket = connect({
        host: hostname,
        port,
        ...(isIP(hostname) ? {} : { servername: hostname }),
        ca: target.certificatePem,
        // Trust only the validated invitation leaf on Electron as well as Node.
        // Hostname and exact peer DER checks below remain mandatory.
        allowPartialTrustChain: true,
        rejectUnauthorized: true,
        minVersion: "TLSv1.3",
        maxVersion: "TLSv1.3",
        checkServerIdentity: (_serverName, peer) => {
          if (checkServerIdentity(hostname, peer)) return connectionError("native_server_name_mismatch");
          if (!Buffer.isBuffer(peer.raw) || !peer.raw.equals(expectedCertificate.raw)) {
            return connectionError("native_server_pin_mismatch");
          }
          return undefined;
        },
      });
      socket.once("error", () => stop(connectionError("native_connection_failed")));
      socket.once("close", finish);
      socket.once("secureConnect", () => {
        try {
          if (!socket.authorized || socket.getProtocol() !== "TLSv1.3"
            || !socket.getPeerX509Certificate()?.raw.equals(expectedCertificate.raw)) {
            throw connectionError("native_connection_failed");
          }
          // The invitation may have expired while the handshake was pending.
          verifySpsNativeInvitationCertificate(code);
          stop(null, Object.freeze({
            state: "tls_peer_verified",
            origin: target.origin,
            spkiSha256: target.spkiSha256,
            protocol: "TLSv1.3",
            observedAt: new Date().toISOString(),
          }));
        } catch (error) {
          stop(typeof error?.code === "string" && Object.hasOwn(MESSAGES, error.code)
            ? connectionError(error.code) : connectionError("native_connection_failed"));
        }
      });
      timer = setTimeout(() => stop(connectionError("native_connection_timeout")), timeoutMs);
    } catch {
      stop(connectionError("native_connection_failed"));
    }
  });
}

import { X509Certificate } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import { parseSpsNativeInviteCode } from "./native-connection-invite.mjs";
import { verifySpsNativeInvitationCertificate } from "./native-connection-tls.mjs";
import { nativeCertificateRecord as record, encodeNativeCertificatePem } from "./native-certificate-primitives.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";
import { publicSpsNativeMemberEnrollmentRequest } from "./native-member-certificates.mjs";
import { validateSpsNativeMemberCredential } from "./native-member-credential.mjs";
import { parseSpsNativeEnrollmentResponse } from "./native-enrollment-response.mjs";

const PATHS = Object.freeze({ exchange: "/sps-native/v1/session/exchange",
  issue: "/sps-native/v1/enrollment/issue", complete: "/sps-native/v1/enrollment/complete" });
const MESSAGES = Object.freeze({ invalid_options: "Native enrollment client options are invalid.",
  unavailable: "The Native enrollment request could not complete.",
  invalid_response: "The Native enrollment response is invalid.",
  busy: "A Native enrollment request is already in progress.",
  session_required: "Native enrollment requires a current SPS session.",
  cancelled: "The Native enrollment request was cancelled.",
  timeout: "The Native enrollment request timed out.",
  disposed: "The Native enrollment connection is closed." });
const ownErrors = new WeakSet();
function failure(kind) {
  const error = Object.assign(new Error(MESSAGES[kind]), { code: `native_enrollment_client_${kind}` });
  ownErrors.add(error);
  return error;
}
function safeFailure(error) { return ownErrors.has(error) ? error : failure("unavailable"); }
function operationSignal(input) {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const value = record(input, Object.hasOwn(descriptors, "signal") ? ["signal"] : []);
    if (value.signal !== undefined && !(value.signal instanceof AbortSignal)) throw new Error();
    return value.signal;
  } catch { throw failure("invalid_options"); }
}
function keySnapshot(input) {
  return Object.freeze(record(input, ["v", "kind", "hostId", "deviceKeyId", "requestPem", "privateKeyPem"]));
}
function derPem(value) {
  if (typeof value !== "string" || !value.length || value.length > 5462 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
  const bytes = Buffer.from(value, "base64url");
  if (!bytes.length || bytes.length > 4096 || bytes.toString("base64url") !== value) throw new Error();
  return encodeNativeCertificatePem(bytes, "CERTIFICATE");
}

// Main-private transport only. The caller supplies independently trusted issuer
// scope and rechecks its current account/Host generation. No UI or listener is wired.
export function createSpsNativeEnrollmentClient(input) {
  let options, context, invitation, target;
  try {
    options = record(input, ["invitationCode", "context", "timeoutMs", "assertCurrent"]);
    context = validateSpsNativeMemberPendingContext(options.context);
    invitation = parseSpsNativeInviteCode(options.invitationCode);
    target = verifySpsNativeInvitationCertificate(options.invitationCode);
    if (!invitation || invitation.hostId !== context.hostId || target.spkiSha256 !== context.serverSpkiSha256
      || !Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 60_000
      || typeof options.assertCurrent !== "function") throw new Error();
  } catch { throw failure("invalid_options"); }
  const expectedCertificate = new X509Certificate(target.certificatePem);
  const address = new URL(target.origin);
  const hostname = address.hostname.startsWith("[") ? address.hostname.slice(1, -1) : address.hostname;
  let disposed = false, busy = false, cookie = null, sessionExpiresAt = 0, completed = false;
  let cancelRequest = null;

  function checkCurrent() {
    if (disposed) throw failure("disposed");
    const value = options.assertCurrent();
    if (value !== undefined) {
      if (value instanceof Promise) void value.catch(() => {});
      throw failure("invalid_options");
    }
    if (disposed) throw failure("disposed");
    verifySpsNativeInvitationCertificate(options.invitationCode);
  }
  function requireSession() {
    if (!cookie || Date.now() >= sessionExpiresAt) {
      cookie = null;
      throw failure("session_required");
    }
  }
  async function run(operation, signalInput, action) {
    const signal = operationSignal(signalInput);
    if (disposed) throw failure("disposed");
    if (busy) throw failure("busy");
    if (completed) throw failure("unavailable");
    if (signal?.aborted) throw failure("cancelled");
    busy = true;
    const deadline = Date.now() + options.timeoutMs;
    const guard = () => {
      if (signal?.aborted) throw failure("cancelled");
      if (Date.now() >= deadline) throw failure("timeout");
      checkCurrent();
      if (signal?.aborted) throw failure("cancelled");
      if (Date.now() >= deadline) throw failure("timeout");
    };
    try {
      guard();
      if (operation !== "exchange") requireSession();
      const result = await action({ guard, signal, deadline });
      guard();
      return result;
    } catch (error) {
      cookie = null;
      sessionExpiresAt = 0;
      throw safeFailure(error);
    }
    finally { busy = false; }
  }

  function post(operation, bytes, auth, credential, { guard, signal, deadline }) {
    guard();
    if (!Buffer.isBuffer(bytes) || bytes.length > 8192) throw failure("invalid_options");
    return new Promise((resolve, reject) => {
      let request, socket, timer, outcome, finished = false;
      const onAbort = () => stop(failure("cancelled"));
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        if (cancelRequest === cancel) cancelRequest = null;
        if (outcome?.error) reject(outcome.error);
        else if (outcome?.value) resolve(outcome.value);
        else reject(failure("unavailable"));
      };
      const stop = (error, value) => {
        if (outcome) return;
        outcome = { error, value };
        request?.destroy();
        socket?.destroy();
        if (!socket) finish();
      };
      const cancel = () => stop(failure("disposed"));
      cancelRequest = cancel;
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted || disposed) { stop(failure(disposed ? "disposed" : "cancelled")); return; }
      try {
        request = httpsRequest({ hostname, port: Number(address.port || 443), path: PATHS[operation],
          method: "POST", agent: false, maxHeaderSize: 16_384,
          ca: target.certificatePem, rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
          ...(isIP(hostname) ? {} : { servername: hostname }),
          ...(credential ? { cert: credential.certificatePem, key: credential.privateKeyPem } : {}),
          checkServerIdentity(_name, peer) {
            try {
              guard();
              if (checkServerIdentity(hostname, peer) || !Buffer.isBuffer(peer.raw)
                || !peer.raw.equals(expectedCertificate.raw)) throw new Error();
              return undefined;
            } catch { return failure("unavailable"); }
          },
          headers: { "Content-Type": "application/json; charset=utf-8", "Content-Length": String(bytes.length),
            Connection: "close", ...(operation === "exchange" ? { Authorization: `Bearer ${auth}` } : { Cookie: auth }) },
        }, response => {
          const chunks = [];
          let size = 0;
          response.on("error", () => stop(failure("unavailable")));
          response.once("aborted", () => stop(failure("invalid_response")));
          response.on("data", chunk => {
            if (!Buffer.isBuffer(chunk) || size + chunk.length > 16_384) { stop(failure("invalid_response")); return; }
            size += chunk.length; chunks.push(chunk);
          });
          response.once("end", () => {
            if (outcome) return;
            try {
              guard();
              if (!response.complete) throw new Error();
              const value = parseSpsNativeEnrollmentResponse(operation,
                { statusCode: response.statusCode, rawHeaders: response.rawHeaders, body: Buffer.concat(chunks, size) });
              stop(null, value);
            } catch (error) { stop(ownErrors.has(error) ? error : failure("invalid_response")); }
          });
        });
        request.on("error", () => stop(failure("unavailable")));
        request.once("socket", current => {
          socket = current;
          socket.once("close", finish);
          socket.once("secureConnect", () => {
            try {
              guard();
              if (!socket.authorized || socket.getProtocol() !== "TLSv1.3" || socket.isSessionReused()
                || !socket.getPeerX509Certificate()?.raw.equals(expectedCertificate.raw)) throw new Error();
              if (operation !== "exchange") requireSession();
              // No HTTP headers/body are flushed before this exact handshake.
              request.end(bytes);
            } catch (error) { stop(safeFailure(error)); }
          });
          if (outcome) socket.destroy();
        });
        timer = setTimeout(() => stop(failure("timeout")), Math.max(1, deadline - Date.now()));
      } catch (error) { stop(safeFailure(error)); }
    });
  }

  async function checkedKey(input, guard) {
    const key = keySnapshot(input);
    if (key.hostId !== context.hostId || key.deviceKeyId !== context.deviceKeyId) throw failure("invalid_options");
    const publicRequest = await publicSpsNativeMemberEnrollmentRequest(key);
    guard();
    return { key, publicRequest };
  }
  async function checkedIssuance(input, key, guard) {
    const issuance = Object.freeze(record(input, ["enrollmentId", "certificate", "issuerCertificate", "expiresAt"]));
    if (typeof issuance.enrollmentId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(issuance.enrollmentId)
      || typeof issuance.expiresAt !== "string" || issuance.expiresAt.length !== 24
      || new Date(issuance.expiresAt).toISOString() !== issuance.expiresAt
      || Date.parse(issuance.expiresAt) !== invitation.expiresAt) throw failure("invalid_response");
    const issuerCertificatePem = derPem(issuance.issuerCertificate);
    const credential = await validateSpsNativeMemberCredential({ keyRequest: key,
      certificate: { v: 1, kind: "sps.native.member-certificate", hostId: context.hostId, deviceKeyId: context.deviceKeyId,
        certificatePem: derPem(issuance.certificate), issuerCertificatePem },
      issuerCertificatePem, issuerSpkiSha256: context.issuerSpkiSha256, now: Date.now() });
    guard();
    return { issuance, credential };
  }

  return Object.freeze({
    exchange(accessToken, signalInput = {}) {
      return run("exchange", signalInput, async operation => {
        if (cookie || typeof accessToken !== "string" || accessToken.length >= 8192
          || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(accessToken)) throw failure("invalid_options");
        const startedAt = Date.now();
        const result = await post("exchange", Buffer.alloc(0), accessToken, null, operation);
        operation.guard();
        cookie = result.cookie;
        sessionExpiresAt = startedAt + result.expiresInSeconds * 1000;
        return Object.freeze({ state: "session_prepared", expiresAt: new Date(sessionExpiresAt).toISOString() });
      });
    },
    issue(keyRequest, signalInput = {}) {
      return run("issue", signalInput, async operation => {
        const { key, publicRequest } = await checkedKey(keyRequest, operation.guard);
        const result = await post("issue", Buffer.from(JSON.stringify({ pairingId: invitation.pairingId,
          pairingSecret: invitation.pairingSecret, deviceKeyId: context.deviceKeyId, requestPem: publicRequest.requestPem })),
        cookie, null, operation);
        return (await checkedIssuance(result, key, operation.guard)).issuance;
      });
    },
    complete(input, signalInput = {}) {
      return run("complete", signalInput, async operation => {
        const value = record(input, ["keyRequest", "issuance", "displayName"]);
        if (typeof value.displayName !== "string" || !value.displayName.trim() || value.displayName.length > 120
          || /[\u0000-\u001f\u007f]/.test(value.displayName)) throw failure("invalid_options");
        const { key } = await checkedKey(value.keyRequest, operation.guard);
        const { issuance, credential } = await checkedIssuance(value.issuance, key, operation.guard);
        const result = await post("complete", Buffer.from(JSON.stringify({ pairingId: invitation.pairingId,
          pairingSecret: invitation.pairingSecret, enrollmentId: issuance.enrollmentId, displayName: value.displayName })),
        cookie, credential, operation);
        operation.guard();
        completed = true;
        cookie = null;
        return result;
      });
    },
    dispose() { if (!disposed) { disposed = true; cookie = null; cancelRequest?.(); } },
  });
}

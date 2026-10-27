import { createHash, X509Certificate } from "node:crypto";
import { request as httpsRequest } from "node:https";
import { checkServerIdentity } from "node:tls";
import { parseSpsNativeInviteCode } from "./native-connection-invite.mjs";
import { verifySpsNativeInvitationCertificate } from "./native-connection-tls.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid, encodeNativeCertificatePem } from "./native-certificate-primitives.mjs";
import { validateSpsNativeMemberPendingContext } from "./native-member-pending-capsule.mjs";
import { publicSpsNativeMemberEnrollmentRequest } from "./native-member-certificates.mjs";
import { validateSpsNativeMemberCredential } from "./native-member-credential.mjs";
import { parseSpsNativeEnrollmentResponse, parseSpsNativeWorkspaceSurfaceResponse,
  parseSpsNativeInboxStateResponse, validateSpsNativeInboxStateInput } from "./native-enrollment-response.mjs";
import { validateSpsNativeMemberIssuerCertificate, validateSpsNativeServerCertificate,
  validateSpsNativeServerCertificateTransition } from "./native-identity-certificates.mjs";
import { validateSpsNativeMemberHostTarget } from "./native-member-target-capsule.mjs";
import { nativeServerCertificateServername } from "./native-server-certificate-selection.mjs";

const PATHS = Object.freeze({ identity: "/sps-native/v1/identity", exchange: "/sps-native/v1/session/exchange",
  issue: "/sps-native/v1/enrollment/issue", complete: "/sps-native/v1/enrollment/complete",
  reconcile: "/sps-native/v1/enrollment/reconcile", renewal: "/sps-native/v1/enrollment/renew", workspaces: "/sps-native/v1/workspaces",
  serverCertificate: "/sps-native/v1/server-certificate",
  workspaceBootstrap: "/api/companies" });
const WORKSPACE_SURFACES = new Set(["shell", "providers", "dashboard", "inbox"]);
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

function workspaceSurfaceRequest(input) {
  try {
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const hasArchived = Object.hasOwn(descriptors, "archived");
    const value = record(input, hasArchived
      ? ["workspaceId", "surface", "archived", "keyRequest", "issuance"]
      : ["workspaceId", "surface", "keyRequest", "issuance"]);
    uuid(value.workspaceId);
    if (!WORKSPACE_SURFACES.has(value.surface)) throw new Error();
    if (value.surface === "inbox") {
      if (hasArchived && typeof value.archived !== "boolean") throw new Error();
    } else if (hasArchived) throw new Error();
    return value;
  } catch { throw failure("invalid_options"); }
}

function workspaceSurfacePath(workspaceId, surface, archived) {
  const base = `/api/companies/${workspaceId}`;
  if (surface === "shell") return `${base}/workspace-shell`;
  if (surface === "providers") return `${base}/workspace-shell/providers`;
  if (surface === "dashboard") return `${base}/workspace-dashboard`;
  if (surface === "inbox") return `${base}/workspace-inbox${archived === undefined ? "" : `?archived=${archived}`}`;
  throw failure("invalid_options");
}

// Main-private transport only. The caller supplies independently trusted issuer
// scope and rechecks its current account/Host generation. No UI or listener is wired.
export function createSpsNativeEnrollmentClient(input) {
  return createClient(input, "enroll");
}

// The invitation already authenticates the server. Only public issuer metadata
// is learned here; a successful read grants no session or device approval.
export function createSpsNativeEnrollmentBootstrap(input) {
  return createClient(input, "bootstrap");
}

// Recovery uses an independently retained, protected target and the existing
// issued key. It cannot create/complete enrollment or extend an invitation.
export function createSpsNativeEnrollmentRecoveryClient(input) {
  return createClient(input, "recover");
}

// Manual pre-expiry same-key renewal over the existing pinned Host target and
// currently valid Member credential. It cannot enroll, recover, or replace keys.
export function createSpsNativeMemberRenewalClient(input) {
  return createClient(input, "renewal");
}

// Reads only public certificate metadata over the exact retained TLS pin. It
// creates no session and sends no Member key or credential.
export function createSpsNativeServerCertificateClient(input) {
  return createClient(input, "serverCertificate");
}

// Main-private access using an existing protected target and issued key. It
// creates no registration and returns only authorized Workspace ID/name DTOs.
export function createSpsNativeMemberWorkspaceClient(input) {
  return createClient(input, "workspace");
}

function createClient(input, mode) {
  const bootstrap = mode === "bootstrap", workspace = mode === "workspace", renewal = mode === "renewal",
    serverCertificate = mode === "serverCertificate",
    recovery = mode === "recover" || workspace || renewal || serverCertificate;
  let options, context, invitation, target, retainedTarget;
  try {
    options = record(input, [recovery ? "target" : "invitationCode", ...(bootstrap ? [] : ["context"]), "timeoutMs", "assertCurrent"]);
    context = bootstrap ? null : validateSpsNativeMemberPendingContext(options.context);
    if (recovery) {
      retainedTarget = validateSpsNativeMemberHostTarget(options.target, context);
      target = { origin: retainedTarget.origin, spkiSha256: context.serverSpkiSha256,
        certificatePem: retainedTarget.serverCertificatePem };
    } else {
      invitation = parseSpsNativeInviteCode(options.invitationCode);
      target = verifySpsNativeInvitationCertificate(options.invitationCode);
      if (!invitation || context && (invitation.hostId !== context.hostId || target.spkiSha256 !== context.serverSpkiSha256)) throw new Error();
    }
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 60_000
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
    if (recovery) validateSpsNativeMemberHostTarget(retainedTarget, context);
    else verifySpsNativeInvitationCertificate(options.invitationCode);
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
      if (operation !== "exchange" && operation !== "identity" && operation !== "serverCertificate") requireSession();
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

  function post(operation, bytes, auth, credential, { guard, signal, deadline, workspaceId, surface, archived, itemId }) {
    guard();
    if (!Buffer.isBuffer(bytes) || bytes.length > 8192) throw failure("invalid_options");
    const path = operation === "workspaceBootstrap"
      ? `${PATHS.workspaceBootstrap}/${workspaceId}/workspace-bootstrap`
      : operation === "workspaceSurface" ? workspaceSurfacePath(workspaceId, surface, archived)
        : operation === "inboxState" ? `/api/companies/${workspaceId}/workspace-inbox/${itemId}` : PATHS[operation];
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
        else if (outcome && Object.hasOwn(outcome, "value")) resolve(outcome.value);
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
        request = httpsRequest({ hostname, port: Number(address.port || 443), path,
          method: operation === "inboxState" ? "PATCH" : operation === "workspaces" || operation === "workspaceBootstrap" || operation === "workspaceSurface" ? "GET" : "POST", agent: false, maxHeaderSize: 16_384,
          // Electron's TLS runtime needs explicit leaf trust. The only trust
          // anchor is this validated pinned leaf; exact peer checks still apply.
          ca: target.certificatePem, allowPartialTrustChain: true,
          rejectUnauthorized: true, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
          servername: nativeServerCertificateServername(target.certificatePem),
          ...(credential ? { cert: credential.certificatePem, key: credential.privateKeyPem } : {}),
          checkServerIdentity(_name, peer) {
            try {
              guard();
              if (checkServerIdentity(hostname, peer) || !Buffer.isBuffer(peer.raw)
                || !peer.raw.equals(expectedCertificate.raw)) throw new Error();
              return undefined;
            } catch { return failure("unavailable"); }
          },
          headers: { ...(operation === "workspaces" || operation === "workspaceBootstrap" || operation === "workspaceSurface" ? {}
            : { "Content-Type": operation === "inboxState" ? "application/json" : "application/json; charset=utf-8" }), "Content-Length": String(bytes.length),
            Connection: "close", ...(operation === "identity" || operation === "serverCertificate" ? {}
              : operation === "exchange" ? { Authorization: `Bearer ${auth}` } : { Cookie: auth }) },
        }, response => {
          const chunks = [];
          let size = 0;
          response.on("error", () => stop(failure("unavailable")));
          response.once("aborted", () => stop(failure("invalid_response")));
          response.on("data", chunk => {
            if (!Buffer.isBuffer(chunk) || size + chunk.length > (operation === "workspaces" || operation === "workspaceBootstrap" || operation === "workspaceSurface" ? 256 * 1024 : 16_384)) { stop(failure("invalid_response")); return; }
            size += chunk.length; chunks.push(chunk);
          });
          response.once("end", () => {
            if (outcome) return;
            try {
              guard();
              if (!response.complete) throw new Error();
              const envelope = { statusCode: response.statusCode, rawHeaders: response.rawHeaders, body: Buffer.concat(chunks, size) };
              const value = operation === "inboxState" ? parseSpsNativeInboxStateResponse(envelope) : operation === "workspaceSurface"
                ? parseSpsNativeWorkspaceSurfaceResponse(surface, workspaceId, envelope)
                : parseSpsNativeEnrollmentResponse(operation, envelope);
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
              if (operation !== "exchange" && operation !== "identity" && operation !== "serverCertificate") requireSession();
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
      || !recovery && Date.parse(issuance.expiresAt) !== invitation.expiresAt) throw failure("invalid_response");
    const issuerCertificatePem = derPem(issuance.issuerCertificate);
    const credential = await validateSpsNativeMemberCredential({ keyRequest: key,
      certificate: { v: 1, kind: "sps.native.member-certificate", hostId: context.hostId, deviceKeyId: context.deviceKeyId,
        certificatePem: derPem(issuance.certificate), issuerCertificatePem },
      issuerCertificatePem, issuerSpkiSha256: context.issuerSpkiSha256, now: Date.now() });
    guard();
    return { issuance, credential };
  }

  const dispose = () => { if (!disposed) { disposed = true; cookie = null; cancelRequest?.(); } };
  if (bootstrap) return Object.freeze({
    inspect(signalInput = {}) {
      return run("identity", signalInput, async operation => {
        const value = await post("identity", Buffer.alloc(0), null, null, operation);
        operation.guard();
        if (value.hostId !== invitation.hostId || value.serverSpkiSha256 !== target.spkiSha256) throw failure("invalid_response");
        const issuerCertificatePem = derPem(value.issuerCertificate);
        const issuer = validateSpsNativeMemberIssuerCertificate(issuerCertificatePem, invitation.hostId, Date.now());
        const pin = createHash("sha256").update(issuer.publicKey.export({ type: "spki", format: "der" })).digest("hex");
        if (pin !== value.issuerSpkiSha256 || pin === target.spkiSha256) throw failure("invalid_response");
        operation.guard();
        return Object.freeze({ hostId: invitation.hostId, serverSpkiSha256: target.spkiSha256,
          issuerSpkiSha256: pin, issuerCertificatePem });
      });
    },
    dispose,
  });
  if (serverCertificate) return Object.freeze({
    getServerCertificate(signalInput = {}) {
      return run("serverCertificate", signalInput, async operation => {
        const value = await post("serverCertificate", Buffer.alloc(0), null, null, operation);
        operation.guard();
        if (value === null) return null;
        if (value.hostId !== context.hostId || value.issuerSpkiSha256 !== context.issuerSpkiSha256) throw failure("invalid_response");
        const predecessorPem = retainedTarget.serverCertificatePem;
        const predecessor = new X509Certificate(predecessorPem);
        const predecessorHash = createHash("sha256").update(predecessor.raw).digest("hex");
        if (value.predecessorCertificateSha256 !== predecessorHash) throw failure("invalid_response");
        const certificatePem = derPem(value.serverCertificate);
        const next = validateSpsNativeServerCertificate(certificatePem, context.hostId, Date.now());
        const nextSpki = createHash("sha256").update(next.publicKey.export({ type: "spki", format: "der" })).digest("hex");
        if (nextSpki !== context.serverSpkiSha256) throw failure("invalid_response");
        if (!next.raw.equals(predecessor.raw)) {
          validateSpsNativeServerCertificateTransition({ hostId: context.hostId,
            predecessorCertificatePem: predecessorPem, certificatePem });
        }
        operation.guard();
        return value;
      });
    },
    dispose,
  });
  function exchange(accessToken, signalInput = {}) {
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
  }
  if (workspace) return Object.freeze({
    exchange,
    updateInboxState(input, signalInput = {}) {
      return run("inboxState", signalInput, async operation => {
        const value = record(input, ["workspaceId", "state", "keyRequest", "issuance"]);
        const workspaceId = uuid(value.workspaceId);
        const state = validateSpsNativeInboxStateInput(value.state);
        const { key } = await checkedKey(value.keyRequest, operation.guard);
        const { credential } = await checkedIssuance(value.issuance, key, operation.guard);
        const body = {};
        for (const field of ["read", "archived"]) if (Object.hasOwn(state, field)) body[field] = state[field];
        return post("inboxState", Buffer.from(JSON.stringify(body)), cookie, credential,
          { ...operation, workspaceId, itemId: state.itemId });
      });
    },
    listAvailableWorkspaces(input, signalInput = {}) {
      return run("workspaces", signalInput, async operation => {
        const value = record(input, ["keyRequest", "issuance"]);
        const { key } = await checkedKey(value.keyRequest, operation.guard);
        const { credential } = await checkedIssuance(value.issuance, key, operation.guard);
        return post("workspaces", Buffer.alloc(0), cookie, credential, operation);
      });
    },
    getWorkspaceBootstrap(input, signalInput = {}) {
      return run("workspaceBootstrap", signalInput, async operation => {
        const value = record(input, ["workspaceId", "keyRequest", "issuance"]);
        let workspaceId;
        try { workspaceId = uuid(value.workspaceId); }
        catch { throw failure("invalid_options"); }
        const { key } = await checkedKey(value.keyRequest, operation.guard);
        const { credential } = await checkedIssuance(value.issuance, key, operation.guard);
        const result = await post("workspaceBootstrap", Buffer.alloc(0), cookie, credential,
          { ...operation, workspaceId: value.workspaceId });
        operation.guard();
        if (result.workspace.id !== value.workspaceId) throw failure("invalid_response");
        return result;
      });
    },
    readWorkspaceSurface(input, signalInput = {}) {
      const value = workspaceSurfaceRequest(input);
      return run("workspaceSurface", signalInput, async operation => {
        const { key } = await checkedKey(value.keyRequest, operation.guard);
        const { credential } = await checkedIssuance(value.issuance, key, operation.guard);
        return post("workspaceSurface", Buffer.alloc(0), cookie, credential,
          { ...operation, workspaceId: value.workspaceId, surface: value.surface, archived: value.archived });
      });
    },
    dispose,
  });
  if (renewal) return Object.freeze({
    exchange,
    renew(input, signalInput = {}) {
      return run("renewal", signalInput, async operation => {
        const value = record(input, ["keyRequest", "issuance"]);
        const { key, publicRequest } = await checkedKey(value.keyRequest, operation.guard);
        const { issuance, credential } = await checkedIssuance(value.issuance, key, operation.guard);
        const response = await post("renewal", Buffer.from(JSON.stringify({ deviceKeyId: context.deviceKeyId,
          requestPem: publicRequest.requestPem })), cookie, credential, operation);
        operation.guard();
        const oldLeaf = new X509Certificate(credential.certificatePem);
        const oldHash = createHash("sha256").update(oldLeaf.raw).digest("hex");
        if (response.predecessorCertificateSha256 !== oldHash
          || response.issuerCertificate !== issuance.issuerCertificate) throw failure("invalid_response");
        const issuerCertificatePem = derPem(response.issuerCertificate);
        const nextCredential = await validateSpsNativeMemberCredential({ keyRequest: key,
          certificate: { v: 1, kind: "sps.native.member-certificate", hostId: context.hostId,
            deviceKeyId: context.deviceKeyId, certificatePem: derPem(response.certificate), issuerCertificatePem },
          issuerCertificatePem, issuerSpkiSha256: context.issuerSpkiSha256, now: Date.now() });
        operation.guard();
        const nextLeaf = new X509Certificate(nextCredential.certificatePem);
        if (Date.parse(nextLeaf.validTo) <= Date.parse(oldLeaf.validTo)
          || new Date(Date.parse(nextLeaf.validFrom)).toISOString() !== response.certificateNotBefore
          || new Date(Date.parse(nextLeaf.validTo)).toISOString() !== response.certificateNotAfter) throw failure("invalid_response");
        return response;
      });
    },
    dispose,
  });
  if (recovery) return Object.freeze({
    exchange,
    reconcile(input, signalInput = {}) {
      return run("reconcile", signalInput, async operation => {
        const value = record(input, ["keyRequest", "issuance"]);
        const { key } = await checkedKey(value.keyRequest, operation.guard);
        const { issuance, credential } = await checkedIssuance(value.issuance, key, operation.guard);
        return post("reconcile", Buffer.from(JSON.stringify({ enrollmentId: issuance.enrollmentId })), cookie, credential, operation);
      });
    },
    dispose,
  });
  return Object.freeze({
    exchange,
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
    dispose,
  });
}

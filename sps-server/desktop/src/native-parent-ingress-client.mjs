import { randomUUID } from "node:crypto";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

const REQUEST = "sps.native.parent-ingress.request";
const RESPONSE = "sps.native.parent-ingress.response";
const CANCEL = "sps.native.parent-ingress.cancel";
const OPERATIONS = new Set(["identity", "session.exchange", "enrollment.issue", "enrollment.complete", "enrollment.reconcile", "enrollment.renew"]);
const unavailable = () => Object.assign(new Error("The owned Native Host channel is unavailable."), { code: "native_ingress_unavailable" });
const pin = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
function certificate(value) {
  if (typeof value !== "string" || !value.length || value.length > 5462 || !/^[A-Za-z0-9_-]+$/.test(value)) throw unavailable();
  const bytes = Buffer.from(value, "base64url");
  if (!bytes.length || bytes.length > 4096 || bytes.toString("base64url") !== value) throw unavailable();
  return value;
}

function request(operation, input) {
  const value = record(input, operation === "identity" ? ["transport", "body"] : ["transport", "body", "credential"]);
  const needsPeer = ["enrollment.complete", "enrollment.reconcile", "enrollment.renew"].includes(operation);
  const transport = record(value.transport, ["tlsVersion", "sessionReused", "remoteAddress", ...(needsPeer ? ["peerCertificateDer"] : [])]);
  if (transport.tlsVersion !== "TLSv1.3" || transport.sessionReused !== false
    || !(transport.remoteAddress === null || typeof transport.remoteAddress === "string" && transport.remoteAddress.length <= 45)) throw unavailable();
  if (needsPeer) certificate(transport.peerCertificateDer);
  if (["identity", "session.exchange"].includes(operation)) { if (value.body !== null) throw unavailable(); }
  else {
    const keys = operation === "enrollment.issue" ? ["pairingId", "pairingSecret", "deviceKeyId", "requestPem"]
      : operation === "enrollment.complete" ? ["pairingId", "pairingSecret", "enrollmentId", "displayName"]
        : operation === "enrollment.renew" ? ["deviceKeyId", "requestPem"] : ["enrollmentId"];
    value.body = record(value.body, keys);
    for (const key of keys) {
      const entry = value.body[key];
      if (typeof entry !== "string" || !entry || entry.length > (key === "requestPem" ? 3000 : 200)) throw unavailable();
    }
  }
  if (operation !== "identity") {
    const key = operation === "session.exchange" ? "accessToken" : "sessionCookie";
    value.credential = record(value.credential, [key]);
    if (typeof value.credential[key] !== "string" || !value.credential[key] || value.credential[key].length >= 8192
      || /[\u0000-\u001f\u007f]/.test(value.credential[key])) throw unavailable();
  }
  // Copy before asynchronous dispatch so a caller cannot change scope, body or
  // transport evidence while the IPC send callback is pending.
  return Object.freeze({ ...value, transport: Object.freeze(transport),
    ...(value.body ? { body: Object.freeze(value.body) } : {}),
    ...(value.credential ? { credential: Object.freeze(value.credential) } : {}) });
}

function result(operation, input) {
  const keys = operation === "identity" ? ["hostId", "serverSpkiSha256", "issuerSpkiSha256", "issuerCertificate"]
    : operation === "session.exchange" ? ["token", "expiresInSeconds"]
    : operation === "enrollment.issue" ? ["enrollmentId", "certificate", "issuerCertificate", "expiresAt"]
      : operation === "enrollment.renew" ? ["renewalId", "deviceId", "predecessorCertificateSha256", "certificate", "issuerCertificate", "certificateNotBefore", "certificateNotAfter"]
        : ["deviceId", "status"];
  const value = record(input, keys);
  if (operation === "identity") {
    uuid(value.hostId); certificate(value.issuerCertificate);
    if (!pin(value.serverSpkiSha256) || !pin(value.issuerSpkiSha256)) throw unavailable();
  } else if (operation === "session.exchange") {
    if (typeof value.token !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(value.token)
      || value.expiresInSeconds !== 604800) throw unavailable();
  } else if (operation === "enrollment.issue") {
    uuid(value.enrollmentId); certificate(value.certificate); certificate(value.issuerCertificate);
    if (typeof value.expiresAt !== "string" || value.expiresAt.length !== 24
      || new Date(value.expiresAt).toISOString() !== value.expiresAt) throw unavailable();
  } else if (operation === "enrollment.renew") {
    uuid(value.renewalId); uuid(value.deviceId); certificate(value.certificate); certificate(value.issuerCertificate);
    if (!pin(value.predecessorCertificateSha256)
      || typeof value.certificateNotBefore !== "string" || value.certificateNotBefore.length !== 24
      || typeof value.certificateNotAfter !== "string" || value.certificateNotAfter.length !== 24
      || !Number.isFinite(Date.parse(value.certificateNotBefore)) || !Number.isFinite(Date.parse(value.certificateNotAfter))
      || new Date(value.certificateNotBefore).toISOString() !== value.certificateNotBefore
      || new Date(value.certificateNotAfter).toISOString() !== value.certificateNotAfter
      || Date.parse(value.certificateNotBefore) >= Date.parse(value.certificateNotAfter)) throw unavailable();
  } else {
    uuid(value.deviceId);
    if (!(operation === "enrollment.complete" ? ["pending"] : ["pending", "approved", "revoked"]).includes(value.status)) throw unavailable();
  }
  return Object.freeze(value);
}

// Main-to-directly-owned-Core IPC only. This is independent of renderer bridges
// and the child-to-Main signer protocol sharing the inherited Node IPC channel.
export function createSpsNativeParentIngressClient(child, {
  isCurrent, timeoutMs = 15000, maxPending = 2, maxRequests = 4096,
} = {}) {
  if (!child || typeof child.on !== "function" || typeof child.once !== "function"
    || typeof child.removeListener !== "function" || typeof child.send !== "function" || typeof isCurrent !== "function"
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000
    || !Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 16
    || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 65536) throw new TypeError("Invalid Native ingress channel.");
  const pending = new Map();
  const seen = new Set();
  let closed = false;
  const active = () => {
    try { return !closed && child.connected === true && child.exitCode == null && isCurrent() === true; }
    catch { return false; }
  };
  function assertAvailable() { if (!active()) { dispose(); throw unavailable(); } }
  function finish(entry, value, failed) {
    clearTimeout(entry.timer);
    entry.signal?.removeEventListener("abort", entry.abort);
    if (!entry.settled) {
      entry.settled = true;
      if (failed) entry.reject(unavailable()); else entry.resolve(value);
    }
  }
  function dispose() {
    if (closed) return;
    closed = true;
    child.removeListener("message", onMessage);
    for (const event of ["disconnect", "exit", "error"]) child.removeListener(event, dispose);
    for (const entry of pending.values()) finish(entry, null, true);
    pending.clear();
  }
  function cancel(entry) {
    if (entry.settled) return;
    // Keep capacity occupied until the exact child reply or channel disposal:
    // cancellation does not prove that Core stopped transactional work.
    finish(entry, null, true);
    if (active()) {
      try { child.send({ v: 1, kind: CANCEL, id: entry.id }, error => { if (error) dispose(); }); }
      catch { dispose(); }
    }
  }
  function onMessage(message) {
    try {
      if (Object.getOwnPropertyDescriptor(message ?? {}, "kind")?.value !== RESPONSE) return;
      assertAvailable();
      const ok = Object.getOwnPropertyDescriptor(message, "ok")?.value;
      const value = record(message, ["v", "kind", "id", "ok", ok === true ? "result" : "errorCode"]);
      if (value.v !== 1 || typeof ok !== "boolean") throw unavailable();
      uuid(value.id);
      const entry = pending.get(value.id);
      if (!entry || !ok && value.errorCode !== "native_ingress_unavailable") throw unavailable();
      const checked = ok ? result(entry.operation, value.result) : null;
      if (!entry.settled) entry.check();
      pending.delete(value.id);
      finish(entry, checked, !ok);
    } catch { dispose(); }
  }
  child.on("message", onMessage);
  for (const event of ["disconnect", "exit", "error"]) child.once(event, dispose);
  return Object.freeze({
    dispatch(operation, input, { signal, assertCurrent = () => {} } = {}) {
      try {
        assertAvailable();
        if (!OPERATIONS.has(operation) || signal !== undefined && !(signal instanceof AbortSignal)
          || typeof assertCurrent !== "function" || signal?.aborted || pending.size >= maxPending || seen.size >= maxRequests) throw unavailable();
        const payload = request(operation, input);
        const check = () => {
          assertAvailable();
          const value = assertCurrent();
          if (value !== undefined) { if (value instanceof Promise) void value.catch(() => {}); throw unavailable(); }
        };
        check();
        const id = randomUUID();
        seen.add(id);
        return new Promise((resolve, reject) => {
          const entry = { id, operation, resolve, reject, signal, check, settled: false, timer: null, abort: null };
          entry.abort = () => cancel(entry);
          pending.set(id, entry);
          signal?.addEventListener("abort", entry.abort, { once: true });
          entry.timer = setTimeout(() => cancel(entry), timeoutMs);
          try {
            check();
            child.send({ v: 1, kind: REQUEST, id, operation, request: payload }, error => { if (error) dispose(); });
          } catch { dispose(); }
        });
      } catch { return Promise.reject(unavailable()); }
    },
    assertAvailable,
    dispose,
  });
}

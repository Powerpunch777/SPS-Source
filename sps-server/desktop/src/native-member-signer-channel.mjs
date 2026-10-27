import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

const REQUEST = "sps.native.signer.request";
const RESPONSE = "sps.native.signer.response";
function publicResult(operation, input) {
  const value = record(input, operation === "inspect" ? ["hostId", "serverSpkiSha256", "issuerSpkiSha256", "issuerCertificate"] : ["certificate", "requestSha256"]);
  const certificate = operation === "inspect" ? value.issuerCertificate : value.certificate;
  const bytes = typeof certificate === "string" && certificate.length <= 5462 && /^[A-Za-z0-9_-]+$/.test(certificate) && Buffer.from(certificate, "base64url");
  if (!bytes || !bytes.length || bytes.length > 4096 || bytes.toString("base64url") !== certificate) throw new Error("result");
  const pins = operation === "inspect" ? [value.serverSpkiSha256, value.issuerSpkiSha256] : [value.requestSha256];
  if (pins.some(pin => typeof pin !== "string" || !/^[0-9a-f]{64}$/.test(pin))) throw new Error("result");
  if (operation === "inspect") uuid(value.hostId);
  return Object.freeze(value);
}

// Parent-child IPC only. No socket listener, Owner proof, path, key or token is
// accepted from the child. Closed channels cannot reattach to a running Host.
export function attachSpsNativeMemberSignerChannel(child, signer, { isCurrent, timeoutMs = 10_000, maxRequests = 256,
  maxPending = 2, disconnectOnDispose = true } = {}) {
  if (!child || typeof child.on !== "function" || typeof child.send !== "function" || typeof child.removeListener !== "function"
    || typeof child.disconnect !== "function"
    || !signer || typeof signer.inspect !== "function" || typeof signer.sign !== "function" || typeof signer.dispose !== "function"
    || typeof isCurrent !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30_000
    || !Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 256
    || !Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 2
    || typeof disconnectOnDispose !== "boolean") throw new TypeError("Invalid Native signing channel.");
  const seen = new Set();
  const pending = new Map();
  let closed = false;
  const alive = () => {
    try { return !closed && child.connected === true && child.exitCode == null && isCurrent() === true; } catch { return false; }
  };
  function dispose() {
    if (closed) return;
    closed = true;
    child.removeListener("message", onMessage);
    child.removeListener("disconnect", dispose);
    child.removeListener("exit", dispose);
    child.removeListener("error", dispose);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.cancelled = true; entry.controller.abort(); }
    try { signer.dispose(); } catch { /* No alternate signing route or raw error. */ }
    // Authority is already revoked above. A job-owned Host leaves the transport
    // open for natural Core EOF so Node can account for ChildProcess.close;
    // other callers retain physical disconnect and the separate stop-only pipe.
    if (disconnectOnDispose) {
      try { if (child.connected) child.disconnect(); } catch { /* Already unavailable. */ }
    }
  }
  function send(id, result, failed = false) {
    if (!alive()) { dispose(); return; }
    const reply = failed ? { v: 1, kind: RESPONSE, id, ok: false, errorCode: "native_signer_unavailable" }
      : { v: 1, kind: RESPONSE, id, ok: true, result };
    try { child.send(reply, error => { if (error) dispose(); }); } catch { dispose(); }
  }
  function onMessage(message) {
    try {
      const kind = message && Object.getOwnPropertyDescriptor(message, "kind");
      if (kind?.value !== REQUEST) return;
      if (!alive()) { dispose(); return; }
      const operation = Object.getOwnPropertyDescriptor(message, "operation")?.value;
      const value = record(message, operation === "sign" ? ["v", "kind", "id", "operation", "payload"] : ["v", "kind", "id", "operation"]);
      if (value.v !== 1 || !["inspect", "sign", "cancel"].includes(value.operation)) { dispose(); return; }
      const id = uuid(value.id);
      if (operation === "cancel") {
        const entry = pending.get(id);
        if (entry) { entry.cancelled = true; clearTimeout(entry.timer); entry.controller.abort(); }
        return;
      }
      if (seen.has(id) || seen.size >= maxRequests) { dispose(); return; }
      seen.add(id);
      if (pending.size >= maxPending) { send(id, null, true); return; }
      const entry = { controller: new AbortController(), cancelled: false, timer: null };
      pending.set(id, entry);
      entry.timer = setTimeout(() => {
        if (!entry.cancelled) { entry.cancelled = true; entry.controller.abort(); send(id, null, true); }
      }, timeoutMs);
      // An aborted operation keeps the occupied slot until its actual work
      // settles; neither timeout nor cancellation starts replacement signing.
      void Promise.resolve().then(() => {
        if (!alive() || entry.cancelled) throw new Error("unavailable");
        return operation === "inspect" ? signer.inspect({ signal: entry.controller.signal }) : signer.sign(value.payload, { signal: entry.controller.signal });
      }).then(result => publicResult(operation, result))
        .then(result => { if (!entry.cancelled) send(id, result); }, () => { if (!entry.cancelled) send(id, null, true); })
        .finally(() => { clearTimeout(entry.timer); pending.delete(id); });
    } catch { dispose(); }
  }
  child.on("message", onMessage);
  child.once("disconnect", dispose);
  child.once("exit", dispose);
  child.once("error", dispose);
  return Object.freeze({ dispose });
}

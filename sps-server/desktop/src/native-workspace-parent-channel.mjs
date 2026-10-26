import { randomBytes } from "node:crypto";
import { createSpsNativeWorkspaceRequestSigner } from "./native-workspace-proof.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

const REQUEST = "sps.native.workspace.bootstrap.request";
const RESPONSE = "sps.native.workspace.bootstrap.response";
const READY = "sps.native.workspace.bootstrap.ready";
const CLOSE = "sps.native.workspace.bootstrap.close";
const MAX_RESPONSE_BYTES = 256 * 1024;
const unavailable = () => Object.assign(new Error("The owned Native Workspace channel is unavailable."), { code: "native_workspace_unavailable" });
const pin = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const WORKSPACE_TARGET = /^\/api\/companies\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/(?:workspace-shell(?:\/providers)?|workspace-dashboard|workspace-inbox(?:\?archived=(?:true|false))?)$/;

function identity(value) {
  const keys = ["hostId", "serverSpkiSha256", "issuerSpkiSha256",
    ...(Object.getOwnPropertyDescriptor(value ?? {}, "issuerCertificate") ? ["issuerCertificate"] : [])];
  const result = record(value, keys);
  uuid(result.hostId);
  if (!pin(result.serverSpkiSha256) || !pin(result.issuerSpkiSha256)) throw unavailable();
  return Object.freeze({ hostId: result.hostId, serverSpkiSha256: result.serverSpkiSha256,
    issuerSpkiSha256: result.issuerSpkiSha256 });
}

async function boundedJson(response) {
  if (!response?.body || typeof response.body.getReader !== "function") throw unavailable();
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      length += chunk.length;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {});
        throw unavailable();
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock?.();
  }
  try {
    const text = Buffer.concat(chunks, length).toString("utf8");
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") throw new Error();
    return parsed;
  } catch { throw unavailable(); }
}

// Parent-child IPC only. A single bootstrap creates a per-child key and a
// private loopback reader. Neither the key nor the endpoint is exposed by
// inspect(), and the child cannot choose the destination host or port.
export function attachSpsNativeWorkspaceParentChannel(child, {
  inspectBinding,
  isCurrent,
  fetchImpl = fetch,
  timeoutMs = 10_000,
  createProofSigner = createSpsNativeWorkspaceRequestSigner,
} = {}) {
  if (!child || typeof child.on !== "function" || typeof child.once !== "function"
    || typeof child.removeListener !== "function" || typeof child.send !== "function"
    || typeof inspectBinding !== "function" || typeof isCurrent !== "function"
    || typeof fetchImpl !== "function" || typeof createProofSigner !== "function"
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30_000) {
    throw new TypeError("Invalid Native Workspace parent channel.");
  }

  let closed = false;
  let bootstrapId = null;
  let binding = null;
  let proofSigner = null;
  let port = null;
  let bootstrapPromise = null;
  let activeReads = 0;
  let bootstrapTimer = null;
  let bootstrapController = null;
  let bootstrapGranted = false;
  const controllers = new Set();

  const alive = () => {
    try { return !closed && child.connected === true && child.exitCode == null && isCurrent() === true; }
    catch { return false; }
  };
  function assertAvailable() { if (!alive()) throw unavailable(); }
  function dispose(notifyCore = true) {
    if (closed) return;
    if (notifyCore && bootstrapGranted && bootstrapId && alive()) {
      try { child.send({ v: 1, kind: CLOSE, id: bootstrapId }, () => {}); } catch { /* IPC is already closing. */ }
    }
    closed = true;
    if (bootstrapTimer) clearTimeout(bootstrapTimer);
    bootstrapTimer = null;
    bootstrapController?.abort();
    bootstrapController = null;
    child.removeListener("message", onMessage);
    for (const event of ["disconnect", "exit", "error"]) child.removeListener(event, dispose);
    for (const controller of controllers) controller.abort();
    controllers.clear();
    port = null;
    binding = null;
    try { proofSigner?.dispose(); } catch { /* The authority remains revoked. */ }
    proofSigner = null;
  }
  function send(message) {
    assertAvailable();
    try { child.send(message, error => { if (error) dispose(); }); }
    catch { dispose(); throw unavailable(); }
  }
  const onChildLoss = () => dispose(false);
  async function handleBootstrap(message) {
    const value = record(message, ["v", "kind", "id", "hostId", "serverSpkiSha256", "issuerSpkiSha256"]);
    if (value.v !== 1) throw unavailable();
    const id = uuid(value.id);
    const requested = identity({ hostId: value.hostId, serverSpkiSha256: value.serverSpkiSha256,
      issuerSpkiSha256: value.issuerSpkiSha256 });
    if (bootstrapId) throw unavailable();
    bootstrapId = id;
    const current = identity(await inspectBinding({ signal: bootstrapController?.signal }));
    assertAvailable();
    if (current.hostId !== requested.hostId || current.serverSpkiSha256 !== requested.serverSpkiSha256
      || current.issuerSpkiSha256 !== requested.issuerSpkiSha256) throw unavailable();
    const key = randomBytes(32);
    try {
      binding = current;
      proofSigner = createProofSigner({ hostId: current.hostId, key, assertCurrent: () => { assertAvailable(); } });
      const encodedKey = key.toString("base64url");
      key.fill(0);
      assertAvailable();
      send({ v: 1, kind: RESPONSE, id, ok: true, hostId: current.hostId,
        serverSpkiSha256: current.serverSpkiSha256, issuerSpkiSha256: current.issuerSpkiSha256, key: encodedKey });
      bootstrapGranted = true;
    } catch (error) {
      key.fill(0);
      try { proofSigner?.dispose(); } catch {}
      proofSigner = null;
      binding = null;
      throw error;
    }
  }
  function onMessage(message) {
    const kind = Object.getOwnPropertyDescriptor(message ?? {}, "kind")?.value;
    if (kind !== REQUEST && kind !== READY && kind !== CLOSE) return;
    try {
      assertAvailable();
      if (kind === CLOSE) {
        const value = record(message, ["v", "kind", "id"]);
        if (value.v !== 1 || !bootstrapId || value.id !== bootstrapId) throw unavailable();
        dispose(false);
        return;
      }
      if (kind === REQUEST) {
        if (bootstrapPromise) throw unavailable();
        bootstrapController = new AbortController();
        bootstrapTimer = setTimeout(() => {
          bootstrapController?.abort();
          if (alive() && bootstrapId) {
            try { send({ v: 1, kind: RESPONSE, id: bootstrapId, ok: false, errorCode: "native_workspace_unavailable" }); } catch {}
          }
          dispose();
        }, timeoutMs);
        bootstrapPromise = handleBootstrap(message);
        void bootstrapPromise.catch(() => {
          if (alive()) {
            const id = bootstrapId;
            if (id) {
              try { send({ v: 1, kind: RESPONSE, id, ok: false, errorCode: "native_workspace_unavailable" }); } catch {}
            }
          }
          dispose();
        });
        return;
      }
      void Promise.resolve(bootstrapPromise).then(() => {
        const value = record(message, ["v", "kind", "id", "hostId", "serverSpkiSha256", "issuerSpkiSha256", "host", "port"]);
        if (value.v !== 1 || !bootstrapId || value.id !== bootstrapId || value.host !== "127.0.0.1"
          || !Number.isSafeInteger(value.port) || value.port < 1 || value.port > 65535 || !binding
          || value.hostId !== binding.hostId || value.serverSpkiSha256 !== binding.serverSpkiSha256
          || value.issuerSpkiSha256 !== binding.issuerSpkiSha256 || port !== null) throw unavailable();
        assertAvailable();
        port = value.port;
        if (bootstrapTimer) clearTimeout(bootstrapTimer);
        bootstrapTimer = null;
      }).catch(() => dispose());
    } catch { dispose(); }
  }

  child.on("message", onMessage);
  for (const event of ["disconnect", "exit", "error"]) child.once(event, onChildLoss);

  return Object.freeze({
    inspect() {
      assertAvailable();
      return Object.freeze({ ready: port !== null, ...(binding ? { ...binding } : {}) });
    },
    async read(input, { signal, assertCurrent = () => {} } = {}) {
      let counted = false;
      let controller = null;
      let timer = null;
      let abort = null;
      try {
        assertAvailable();
        if (!proofSigner || port === null || !binding || signal !== undefined && !(signal instanceof AbortSignal)
          || typeof assertCurrent !== "function" || signal?.aborted || activeReads >= 4) throw unavailable();
        const request = record(input, ["workspaceId", "target", "cookie", "peerCertificateDer"]);
        uuid(request.workspaceId);
        if (typeof request.target !== "string" || typeof request.cookie !== "string"
          || !Buffer.isBuffer(request.peerCertificateDer)) throw unavailable();
        const snapshot = Object.freeze({ workspaceId: request.workspaceId, target: request.target,
          cookie: request.cookie, peerCertificateDer: Buffer.from(request.peerCertificateDer) });
        const route = WORKSPACE_TARGET.exec(snapshot.target);
        if (!route || route[1] !== snapshot.workspaceId) throw unavailable();
        activeReads += 1;
        counted = true;
        controller = new AbortController();
        controllers.add(controller);
        abort = () => controller.abort();
        signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(abort, timeoutMs);
        const check = () => {
          assertAvailable();
          if (controller.signal.aborted || signal?.aborted) throw unavailable();
          const result = assertCurrent();
          if (result !== undefined) {
            if (result && typeof result.then === "function") void Promise.resolve(result).catch(() => {});
            throw unavailable();
          }
        };
        check();
        const current = identity(await inspectBinding({ signal: controller.signal }));
        check();
        if (current.hostId !== binding.hostId || current.serverSpkiSha256 !== binding.serverSpkiSha256
          || current.issuerSpkiSha256 !== binding.issuerSpkiSha256) throw unavailable();
        const body = Buffer.alloc(0);
        const proof = proofSigner.signWorkspaceRequest({ workspaceId: snapshot.workspaceId, method: "GET",
          target: snapshot.target, body, cookie: snapshot.cookie, contentType: "", peerCertificateDer: snapshot.peerCertificateDer });
        const headers = { cookie: snapshot.cookie, "x-sps-native-workspace-proof": proof,
          "content-length": "0", connection: "close" };
        check();
        const response = await fetchImpl(new URL(snapshot.target, `http://127.0.0.1:${port}`).href, {
          method: "GET", headers, body: undefined, redirect: "manual", cache: "no-store", signal: controller.signal,
        });
        check();
        const contentType = response.headers?.get?.("content-type") ?? "";
        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw unavailable();
        const payload = await boundedJson(response);
        check();
        const confirmed = identity(await inspectBinding({ signal: controller.signal }));
        check();
        if (confirmed.hostId !== binding.hostId || confirmed.serverSpkiSha256 !== binding.serverSpkiSha256
          || confirmed.issuerSpkiSha256 !== binding.issuerSpkiSha256) throw unavailable();
        if (response.status === 403) throw Object.assign(new Error("Native Workspace access was denied."), { statusCode: 403 });
        if (!response.ok) throw unavailable();
        return payload;
      } catch (error) {
        if (Number.isInteger(error?.statusCode)) throw error;
        throw unavailable();
      } finally {
        if (timer) clearTimeout(timer);
        if (controller) controllers.delete(controller);
        signal?.removeEventListener("abort", abort);
        if (counted) activeReads -= 1;
      }
    },
    dispose,
  });
}

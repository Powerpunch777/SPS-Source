import { randomBytes } from "node:crypto";
import { TextDecoder } from "node:util";
import { createSpsNativeWorkspaceRequestSigner } from "./native-workspace-proof.mjs";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";
import { requireSpsNativePluginRequest, NATIVE_PLUGIN_MAX_RESPONSE } from "./native-plugin-protocol.mjs";
import { requireSpsNativeNodeRequest, NATIVE_NODE_TARGET, NATIVE_NODE_MAX_REQUEST, NATIVE_NODE_MAX_RESPONSE }
  from "./native-node-protocol.mjs";

const REQUEST = "sps.native.workspace.bootstrap.request";
const RESPONSE = "sps.native.workspace.bootstrap.response";
const READY = "sps.native.workspace.bootstrap.ready";
const CLOSE = "sps.native.workspace.bootstrap.close";
const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_PLUGIN_REQUEST_BYTES = 64 * 1024;
const unavailable = () => Object.assign(new Error("The owned Native Workspace channel is unavailable."), { code: "native_workspace_unavailable" });
const pin = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const WORKSPACE_TARGET = /^\/api\/companies\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/(?:workspace-bootstrap|workspace-shell(?:\/providers)?|workspace-dashboard|workspace-inbox(?:\?archived=(?:true|false))?)$/;
const DISCOVERY_TARGET = "/sps-native/v1/workspaces";
const PLUGIN_RUNTIME_TARGET = "/sps-native/v1/plugin-runtime";
const INBOX_PATCH_TARGET = /^\/api\/companies\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/workspace-inbox\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/;
const PLUGIN_REQUEST_FIELDS = ["pluginId", "surface", "surfaceId", "operation", "key", "params"];

function identity(value) {
  const keys = ["hostId", "serverSpkiSha256", "issuerSpkiSha256",
    ...(Object.getOwnPropertyDescriptor(value ?? {}, "issuerCertificate") ? ["issuerCertificate"] : [])];
  const result = record(value, keys);
  uuid(result.hostId);
  if (!pin(result.serverSpkiSha256) || !pin(result.issuerSpkiSha256)) throw unavailable();
  return Object.freeze({ hostId: result.hostId, serverSpkiSha256: result.serverSpkiSha256,
    issuerSpkiSha256: result.issuerSpkiSha256 });
}

async function boundedJson(response, maximum = MAX_RESPONSE_BYTES) {
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
      if (length > maximum) {
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

function inboxStateBody(value) {
  if (!Buffer.isBuffer(value) || value.length < 1 || value.length > 128) throw unavailable();
  let text;
  let parsed;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
    if (text.includes("\uFEFF") || text.includes("\0") || text.includes("\uFFFD")) throw new Error();
    parsed = JSON.parse(text);
  } catch { throw unavailable(); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.getPrototypeOf(parsed) !== Object.prototype) throw unavailable();
  const descriptors = Object.getOwnPropertyDescriptors(parsed);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length < 1 || keys.some(key => typeof key !== "string" || !["read", "archived"].includes(key)
    || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")
    || typeof descriptors[key].value !== "boolean")) throw unavailable();
  if (JSON.stringify(parsed) !== text) throw unavailable();
  return Buffer.from(value);
}

function pluginRuntimeBody(value) {
  if (!Buffer.isBuffer(value) || value.length < 1 || value.length > MAX_PLUGIN_REQUEST_BYTES) throw unavailable();
  let text;
  let parsed;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
    // JSON parse plus exact stringify below rejects BOMs and noncanonical JSON;
    // Unicode replacement/BOM characters remain valid inside plugin params.
    parsed = JSON.parse(text);
  } catch { throw unavailable(); }
  let request;
  try { request = requireSpsNativePluginRequest(parsed); }
  catch { throw unavailable(); }
  const expectedFields = Object.hasOwn(parsed, "revision")
    ? ["pluginId", "surface", "surfaceId", "revision", "operation", "key", "params"] : PLUGIN_REQUEST_FIELDS;
  if (JSON.stringify(Reflect.ownKeys(parsed)) !== JSON.stringify(expectedFields)
    || JSON.stringify(parsed) !== text) throw unavailable();
  try { uuid(request.pluginId); } catch { throw unavailable(); }
  if ((request.surface !== "shell" && request.surface !== "widget")
    || !["describe", "asset", "data", "action"].includes(request.operation)
    || typeof request.surfaceId !== "string" || request.surfaceId.length < 1 || request.surfaceId.length > 200
    || /[\u0000-\u001f\u007f]/.test(request.surfaceId)
    || typeof request.key !== "string" || request.key.length < 1 || request.key.length > 200
    || /[\u0000-\u001f\u007f]/.test(request.key)) throw unavailable();
  if (!request.params || typeof request.params !== "object" || Array.isArray(request.params)
    || Object.getPrototypeOf(request.params) !== Object.prototype) throw unavailable();
  return Buffer.from(value);
}

function nodeRuntimeBody(value) {
  if (!Buffer.isBuffer(value) || value.length < 1 || value.length > NATIVE_NODE_MAX_REQUEST) throw unavailable();
  let text;
  let parsed;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(value);
    parsed = JSON.parse(text);
  } catch { throw unavailable(); }
  let request;
  try { request = requireSpsNativeNodeRequest(parsed); }
  catch { throw unavailable(); }
  if (JSON.stringify(parsed) !== text || JSON.stringify(Reflect.ownKeys(parsed))
    !== JSON.stringify(["operation", "nodeId", "resourceId", "payload"])) throw unavailable();
  return Buffer.from(value);
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
    for (const event of ["disconnect", "exit", "error"]) child.removeListener(event, onChildLoss);
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
        if (!input || typeof input !== "object" || Array.isArray(input)) throw unavailable();
        const mutationRequest = Object.hasOwn(input, "method") || Object.hasOwn(input, "body");
        const request = record(input, mutationRequest
          ? ["workspaceId", "target", "cookie", "peerCertificateDer", "method", "body"]
          : ["workspaceId", "target", "cookie", "peerCertificateDer"]);
        const discovery = request.workspaceId === null && request.target === DISCOVERY_TARGET;
        if (!discovery) uuid(request.workspaceId);
        if (typeof request.target !== "string" || typeof request.cookie !== "string"
          || !Buffer.isBuffer(request.peerCertificateDer)) throw unavailable();
        const postRequest = mutationRequest && request.method === "POST";
        const patchRequest = mutationRequest && request.method === "PATCH";
        const snapshot = Object.freeze({ workspaceId: request.workspaceId, target: request.target,
          cookie: request.cookie, peerCertificateDer: Buffer.from(request.peerCertificateDer),
          ...(mutationRequest ? { method: request.method,
            body: postRequest ? request.target === NATIVE_NODE_TARGET ? nodeRuntimeBody(request.body) : pluginRuntimeBody(request.body)
              : patchRequest ? inboxStateBody(request.body) : (() => { throw unavailable(); })() } : {}) });
        if (mutationRequest && (discovery || postRequest && ![PLUGIN_RUNTIME_TARGET, NATIVE_NODE_TARGET].includes(snapshot.target)
          || patchRequest && [PLUGIN_RUNTIME_TARGET, NATIVE_NODE_TARGET].includes(snapshot.target))) throw unavailable();
        const patchRoute = patchRequest ? INBOX_PATCH_TARGET.exec(snapshot.target) : null;
        const route = discovery ? null : WORKSPACE_TARGET.exec(snapshot.target);
        if (postRequest) {
          if (snapshot.workspaceId === null || ![PLUGIN_RUNTIME_TARGET, NATIVE_NODE_TARGET].includes(snapshot.target)) throw unavailable();
          uuid(snapshot.workspaceId);
        } else if (patchRequest ? (!patchRoute || patchRoute[1] !== snapshot.workspaceId)
          : (!discovery && (!route || route[1] !== snapshot.workspaceId))) throw unavailable();
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
        const body = mutationRequest ? snapshot.body : Buffer.alloc(0);
        const method = mutationRequest ? snapshot.method : "GET";
        const requestContentType = mutationRequest ? "application/json" : "";
        const proof = proofSigner.signWorkspaceRequest({ workspaceId: snapshot.workspaceId, method,
          target: snapshot.target, body, cookie: snapshot.cookie, contentType: requestContentType, peerCertificateDer: snapshot.peerCertificateDer });
        const headers = { cookie: snapshot.cookie, "x-sps-native-workspace-proof": proof,
          "content-length": String(body.length), connection: "close", ...(mutationRequest ? { "content-type": requestContentType } : {}) };
        check();
        const response = await fetchImpl(new URL(snapshot.target, `http://127.0.0.1:${port}`).href, {
          method, headers, body: mutationRequest ? body : undefined, redirect: "manual", cache: "no-store", signal: controller.signal,
        });
        check();
        const contentType = response.headers?.get?.("content-type") ?? "";
        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) throw unavailable();
        const postPayload = postRequest ? JSON.parse(snapshot.body.toString("utf8")) : null;
        const payload = await boundedJson(response, postRequest && snapshot.target === NATIVE_NODE_TARGET ? NATIVE_NODE_MAX_RESPONSE
          : postRequest && postPayload.operation === "asset" ? NATIVE_PLUGIN_MAX_RESPONSE : MAX_RESPONSE_BYTES);
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

import { constants as cryptoConstants, createHash, X509Certificate } from "node:crypto";
import { createServer as createHttpsServer } from "node:https";
import { createSecureContext } from "node:tls";
import { isIP } from "node:net";
import { TextDecoder } from "node:util";
import { requireCurrentSpsNativeHostIdentity, validateSpsNativeServerCertificate,
  validateSpsNativeServerCertificateTransition } from "./native-identity-certificates.mjs";
import { nativeServerCertificateServername, parseNativeServerCertificateServername } from "./native-server-certificate-selection.mjs";
import { NATIVE_PLUGIN_TARGET, NATIVE_PLUGIN_MAX_RESPONSE, requireSpsNativePluginRequest } from "./native-plugin-protocol.mjs";

const ROUTES = Object.freeze({
  "/sps-native/v1/identity": { operation: "identity", peer: false, credential: null, body: null },
  "/sps-native/v1/server-certificate": { operation: "server-certificate", peer: false, credential: null, body: null },
  "/sps-native/v1/session/exchange": { operation: "session.exchange", peer: false, credential: "accessToken", body: null },
  "/sps-native/v1/enrollment/issue": { operation: "enrollment.issue", peer: false, credential: "sessionCookie", body: "issue" },
  "/sps-native/v1/enrollment/complete": { operation: "enrollment.complete", peer: true, credential: "sessionCookie", body: "complete" },
  "/sps-native/v1/enrollment/reconcile": { operation: "enrollment.reconcile", peer: true, credential: "sessionCookie", body: "reconcile" },
  "/sps-native/v1/enrollment/renew": { operation: "enrollment.renew", peer: true, credential: "sessionCookie", body: "renew" },
});
const WORKSPACE_DISCOVERY_TARGET = "/sps-native/v1/workspaces";
const WORKSPACE_INBOX_PATCH_TARGET = /^\/api\/companies\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/workspace-inbox\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})$/;
const MAX_BODY_BYTES = 8192;
const MAX_RESPONSE_BYTES = 16_384;
const MAX_HEADERS_BYTES = 16_384;
const RESPONSE_HEADERS = Object.freeze({
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "connection": "close",
  "x-content-type-options": "nosniff",
});
const SAFE_FAILURE = Object.freeze({ error: "native_enrollment_unavailable" });
const ALLOWED_HEADERS = new Set(["host", "connection", "content-type", "content-length", "authorization", "cookie", "x-sps-native-workspace"]);
const BROWSER_HEADERS = new Set(["origin", "referer", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user", "upgrade", "proxy-authorization", "proxy-connection"]);
const isUuid = value => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);

function fail(statusCode = 400) {
  const error = new Error("request");
  error.statusCode = statusCode;
  return error;
}

function exactObject(value, keys, statusCode = 400) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) throw fail(statusCode);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => typeof key !== "string" || key !== expected[index]
    || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))) throw fail(statusCode);
  return value;
}

function parseBody(bytes, kind) {
  if (!Buffer.isBuffer(bytes) || bytes.length > (kind === "inboxState" ? 128 : MAX_BODY_BYTES)) throw fail(413);
  if (kind === null) {
    if (bytes.length !== 0) throw fail();
    return null;
  }
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw fail(); }
  if (text.includes("\uFEFF") || text.includes("\0") || text.includes("\uFFFD")) throw fail();
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw fail(); }
  if (kind === "inboxState") {
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)
      || Object.getPrototypeOf(parsed) !== Object.prototype) throw fail();
    const descriptors = Object.getOwnPropertyDescriptors(parsed);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length < 1 || keys.some(key => typeof key !== "string" || !["read", "archived"].includes(key)
      || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value")
      || typeof descriptors[key].value !== "boolean")) throw fail();
    if (JSON.stringify(parsed) !== text) throw fail();
    return parsed;
  }
  const keys = kind === "issue" ? ["pairingId", "pairingSecret", "deviceKeyId", "requestPem"]
    : kind === "complete" ? ["pairingId", "pairingSecret", "enrollmentId", "displayName"]
      : kind === "renew" ? ["deviceKeyId", "requestPem"] : ["enrollmentId"];
  exactObject(parsed, keys);
  if (JSON.stringify(parsed) !== text) throw fail();
  const isSecret = value => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)
    && Buffer.from(value, "base64url").toString("base64url") === value;
  if (kind === "issue") {
    if (!isUuid(parsed.pairingId) || !isSecret(parsed.pairingSecret) || !isUuid(parsed.deviceKeyId)
      || typeof parsed.requestPem !== "string" || parsed.requestPem.length < 1 || parsed.requestPem.length > 3000) throw fail();
  } else if (kind === "complete") {
    if (!isUuid(parsed.pairingId) || !isSecret(parsed.pairingSecret) || !isUuid(parsed.enrollmentId)
      || typeof parsed.displayName !== "string" || !parsed.displayName.trim() || parsed.displayName.length > 120
      || /[\u0000-\u001f\u007f]/.test(parsed.displayName)) throw fail();
  } else if (kind === "renew") {
    if (!isUuid(parsed.deviceKeyId) || typeof parsed.requestPem !== "string" || parsed.requestPem.length < 1 || parsed.requestPem.length > 3000) throw fail();
  } else if (!isUuid(parsed.enrollmentId)) throw fail();
  return parsed;
}

function readHeaders(request, workspace = false, workspacePatch = false, plugin = false) {
  const raw = request.rawHeaders;
  if (!Array.isArray(raw) || raw.length % 2 || raw.length / 2 > 32) throw fail();
  let total = 0;
  const seen = new Set();
  for (let index = 0; index < raw.length; index += 2) {
    const name = raw[index]; const value = raw[index + 1];
    if (typeof name !== "string" || typeof value !== "string" || /[\r\n\0]/.test(value)) throw fail();
    total += Buffer.byteLength(name, "latin1") + Buffer.byteLength(value, "latin1") + 4;
    if (total > MAX_HEADERS_BYTES) throw fail(431);
    const normalized = name.toLowerCase();
    if (seen.has(normalized) || BROWSER_HEADERS.has(normalized) || !ALLOWED_HEADERS.has(normalized)) throw fail();
    seen.add(normalized);
  }
  const headers = request.headers;
  if (headers["transfer-encoding"] !== undefined || headers["content-encoding"] !== undefined
    || headers.expect !== undefined || headers.upgrade !== undefined) throw fail();
  if (!plugin && headers["x-sps-native-workspace"] !== undefined) throw fail();
  if (plugin && !isUuid(headers["x-sps-native-workspace"])) throw fail();
  if (workspacePatch || plugin ? headers["content-type"] !== "application/json"
    : workspace ? headers["content-type"] !== undefined
      : headers["content-type"] !== "application/json; charset=utf-8") throw fail();
  if (headers["connection"]?.toLowerCase() !== "close") throw fail();
  const rawLength = headers["content-length"];
  if (typeof rawLength !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(rawLength)) throw fail();
  const length = Number(rawLength);
  if (!Number.isSafeInteger(length)) throw fail();
  if (length > (plugin ? 64 * 1024 : MAX_BODY_BYTES)) throw fail(413);
  if (workspace && !workspacePatch && !plugin && length !== 0) throw fail();
  if (plugin && length < 2) throw fail();
  if (workspacePatch && (length < 1 || length > 128)) throw fail(length > 128 ? 413 : 400);
  return { length, headers };
}

function exactCredential(route, headers) {
  if (!route.credential) {
    if (headers.authorization !== undefined || headers.cookie !== undefined) throw fail();
    return undefined;
  }
  if (route.credential === "accessToken") {
    const value = headers.authorization;
    if (headers.cookie !== undefined) throw fail();
    if (typeof value !== "string" || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)
      || value.length >= MAX_BODY_BYTES) throw fail();
    return { accessToken: value.slice(7) };
  }
  if (headers.authorization !== undefined) throw fail();
  const value = headers.cookie;
  const match = typeof value === "string" && /^sps_identity_session=([A-Za-z0-9_-]{64})$/.exec(value);
  if (!match) throw fail();
  return { sessionCookie: value };
}

function writeJson(response, statusCode, value, cookie = null, maximum = MAX_RESPONSE_BYTES) {
  if (response.destroyed || response.writableEnded) return;
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  if (bytes.length > maximum) {
    response.destroy();
    return;
  }
  response.writeHead(statusCode, {
    ...RESPONSE_HEADERS,
    "content-length": String(bytes.length),
    ...(cookie ? { "set-cookie": cookie } : {}),
  });
  response.end(bytes);
}

function validateResult(operation, value, expectedIdentity) {
  const keys = operation === "identity" ? ["hostId", "serverSpkiSha256", "issuerSpkiSha256", "issuerCertificate"]
    : operation === "session.exchange" ? ["token", "expiresInSeconds"]
      : operation === "enrollment.issue" ? ["enrollmentId", "certificate", "issuerCertificate", "expiresAt"]
        : operation === "enrollment.renew" ? ["renewalId", "deviceId", "predecessorCertificateSha256", "certificate", "issuerCertificate",
          "certificateNotBefore", "certificateNotAfter"] : ["deviceId", "status"];
  const result = exactObject(value, keys, 502);
  const uuid = input => typeof input === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(input);
  const cert = input => typeof input === "string" && input.length > 0 && input.length <= 5462 && /^[A-Za-z0-9_-]+$/.test(input)
    && Buffer.from(input, "base64url").toString("base64url") === input
    && Buffer.from(input, "base64url").length <= 4096;
  if (operation === "identity") {
    if (!uuid(result.hostId) || !/^[0-9a-f]{64}$/.test(result.serverSpkiSha256)
      || !/^[0-9a-f]{64}$/.test(result.issuerSpkiSha256) || !cert(result.issuerCertificate)) throw fail(502);
    if (result.hostId !== expectedIdentity.identity.hostId
      || result.serverSpkiSha256 !== expectedIdentity.serverSpkiSha256
      || result.issuerSpkiSha256 !== expectedIdentity.issuerSpkiSha256
      || result.issuerCertificate !== expectedIdentity.issuerCertificateDer) throw fail(502);
  } else if (operation === "session.exchange") {
    if (typeof result.token !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(result.token) || result.expiresInSeconds !== 604800) throw fail(502);
  } else if (operation === "enrollment.issue") {
    if (!uuid(result.enrollmentId) || !cert(result.certificate) || !cert(result.issuerCertificate)
      || typeof result.expiresAt !== "string" || result.expiresAt.length !== 24
      || !Number.isFinite(Date.parse(result.expiresAt)) || new Date(result.expiresAt).toISOString() !== result.expiresAt) throw fail(502);
    if (result.issuerCertificate !== expectedIdentity.issuerCertificateDer) throw fail(502);
  } else if (operation === "enrollment.renew") {
    if (!uuid(result.renewalId) || !uuid(result.deviceId) || !/^[0-9a-f]{64}$/.test(result.predecessorCertificateSha256)
      || !cert(result.certificate) || !cert(result.issuerCertificate)
      || typeof result.certificateNotBefore !== "string" || result.certificateNotBefore.length !== 24
      || typeof result.certificateNotAfter !== "string" || result.certificateNotAfter.length !== 24
      || !Number.isFinite(Date.parse(result.certificateNotBefore)) || !Number.isFinite(Date.parse(result.certificateNotAfter))
      || new Date(result.certificateNotBefore).toISOString() !== result.certificateNotBefore
      || new Date(result.certificateNotAfter).toISOString() !== result.certificateNotAfter
      || Date.parse(result.certificateNotBefore) >= Date.parse(result.certificateNotAfter)
      || result.issuerCertificate !== expectedIdentity.issuerCertificateDer) throw fail(502);
  } else if (!uuid(result.deviceId) || (operation === "enrollment.complete"
    ? result.status !== "pending" : !["pending", "approved", "revoked"].includes(result.status))) throw fail(502);
  return result;
}

function errorResponse(response, statusCode) {
  writeJson(response, statusCode, SAFE_FAILURE);
}

function validateLimits(value) {
  const limits = { maxSockets: 24, maxOperations: 8, readTimeoutMs: 10_000, operationTimeoutMs: 30_000,
    handshakeTimeoutMs: 10_000, ...(value ?? {}) };
  for (const [key, minimum, maximum] of [["maxSockets", 1, 128], ["maxOperations", 1, 32],
    ["readTimeoutMs", 1000, 60_000], ["operationTimeoutMs", 1000, 60_000], ["handshakeTimeoutMs", 1000, 60_000]]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < minimum || limits[key] > maximum) throw new TypeError("Invalid Native Host ingress limits.");
  }
  return Object.freeze(limits);
}

function canonicalAddress(value) {
  if (typeof value !== "string" || isIP(value) === 0) throw new TypeError("Native Host ingress requires one literal IP bind address.");
  return value.toLowerCase();
}

export function createSpsNativeHostIngress({ getIdentity, getServerCertificates, assertCurrent, dispatch, dispatchWorkspace, limits: inputLimits } = {}) {
  if (typeof getIdentity !== "function" || typeof assertCurrent !== "function" || typeof dispatch !== "function") {
    throw new TypeError("Invalid Native Host ingress dependencies.");
  }
  if (dispatchWorkspace !== undefined && typeof dispatchWorkspace !== "function") throw new TypeError("Invalid Native Workspace dispatcher.");
  if (getServerCertificates !== undefined && typeof getServerCertificates !== "function") throw new TypeError("Invalid Native server certificate source.");
  const limits = validateLimits(inputLimits);
  let server = null;
  let disposed = false;
  let state = "disabled";
  let sockets = new Set();
  let activeOperations = new Map();
  let identitySnapshot = null;
  let certificateContexts = new Map();

  function currentIdentity() {
    const value = getIdentity();
    const identity = requireCurrentSpsNativeHostIdentity(value);
    const certificate = new X509Certificate(identity.server.certificatePem);
    const issuerCertificate = new X509Certificate(identity.memberIssuer.certificatePem);
    const thumbprint = createHash("sha256").update(certificate.raw).digest("base64url");
    const issuerThumbprint = createHash("sha256").update(issuerCertificate.raw).digest("base64url");
    const serverSpkiSha256 = createHash("sha256").update(certificate.publicKey.export({ type: "spki", format: "der" })).digest("hex");
    const issuerSpkiSha256 = createHash("sha256").update(issuerCertificate.publicKey.export({ type: "spki", format: "der" })).digest("hex");
    return { identity, certificate, thumbprint, issuerThumbprint, serverSpkiSha256, issuerSpkiSha256,
      issuerCertificateDer: issuerCertificate.raw.toString("base64url") };
  }

  function assertIdentityCurrent(expected) {
    if (disposed || !server) throw fail(503);
    const guardResult = assertCurrent();
    if (guardResult !== undefined) {
      if (guardResult instanceof Promise) void guardResult.catch(() => {});
      throw fail(503);
    }
    const current = currentIdentity();
    if (current.identity.hostId !== expected.identity.hostId || current.thumbprint !== expected.thumbprint
      || current.issuerThumbprint !== expected.issuerThumbprint
      || current.identity.server.privateKeyPem !== expected.identity.server.privateKeyPem) throw fail(503);
    return current;
  }

  function serverCertificateHistory(snapshot) {
    const supplied = typeof getServerCertificates === "function"
      ? getServerCertificates(snapshot.identity) : [snapshot.identity.server.certificatePem];
    if (!Array.isArray(supplied) || supplied.length < 1 || supplied.length > 257
      || supplied.some(value => typeof value !== "string" || !value.length || value.length > 16_384)
      || supplied.at(-1) !== snapshot.identity.server.certificatePem) throw fail(503);
    const entries = supplied.map(pem => {
      const certificate = new X509Certificate(pem);
      if (!certificate.publicKey.export({ type: "spki", format: "der" }).equals(snapshot.certificate.publicKey.export({ type: "spki", format: "der" }))) throw fail(503);
      return Object.freeze({ pem, certificate, raw: certificate.raw });
    });
    for (let index = 1; index < entries.length; index++) {
      validateSpsNativeServerCertificateTransition({ hostId: snapshot.identity.hostId,
        predecessorCertificatePem: entries[index - 1].pem, certificatePem: entries[index].pem });
    }
    validateSpsNativeServerCertificate(supplied.at(-1), snapshot.identity.hostId, Date.now());
    if (!entries.at(-1).raw.equals(snapshot.certificate.raw)) throw fail(503);
    return Object.freeze(entries);
  }

  function selectedServerCertificate(socket) {
    const local = socket.getX509Certificate?.();
    if (!local?.raw?.length || local.raw.length > 4096) throw fail(401);
    const selected = identitySnapshot.serverCertificates.find(entry => entry.raw.equals(local.raw));
    if (!selected || Date.now() < Date.parse(selected.certificate.validFrom)
      || Date.now() >= Date.parse(selected.certificate.validTo)) throw fail(401);
    return selected;
  }

  function respondHttpError(response, statusCode) {
    errorResponse(response, statusCode);
  }

  async function handle(request, response) {
    const socket = request.socket;
    let operationId = null;
    let timeout;
    let finished = false;
    let activeController = null;
    const stopResponse = () => {
      finished = true;
      clearTimeout(timeout);
      if (activeController && !activeController.signal.aborted && !response.writableEnded) activeController.abort();
    };
    response.once("close", stopResponse);
    try {
      if (disposed || !server) throw fail(503);
      const workspacePath = request.method === "GET" && typeof dispatchWorkspace === "function"
        && /^\/api\/companies\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/(?:workspace-bootstrap|workspace-shell(?:\/providers)?|workspace-dashboard|workspace-inbox(?:\?archived=(?:true|false))?)$/.exec(request.url);
      const workspaceInboxPatch = request.method === "PATCH" && typeof dispatchWorkspace === "function"
        && WORKSPACE_INBOX_PATCH_TARGET.exec(request.url);
      const workspaceDiscovery = request.method === "GET" && typeof dispatchWorkspace === "function"
        && request.url === WORKSPACE_DISCOVERY_TARGET;
      const pluginRequest = request.method === "POST" && typeof dispatchWorkspace === "function" && request.url === NATIVE_PLUGIN_TARGET;
      const workspaceRequest = Boolean(workspacePath || workspaceDiscovery || workspaceInboxPatch || pluginRequest);
      const workspacePatch = Boolean(workspaceInboxPatch);
      const route = workspaceRequest ? { peer: true, credential: "sessionCookie", body: null } : ROUTES[request.url];
      if (!workspaceRequest && (request.method !== "POST" || !route || request.url.includes("?") || request.url.includes("#"))) throw fail(404);
      const { length, headers } = readHeaders(request, workspaceRequest, workspacePatch, pluginRequest);
      const credential = exactCredential(route, headers);
      const peer = socket.getPeerCertificate?.(true);
      const peerPresent = Boolean(peer?.raw?.length);
      if (peerPresent && !socket.authorized) throw fail(401);
      if (route.peer !== peerPresent) throw fail(401);
      if (peerPresent && peer.raw.length > 4096) throw fail(401);
      if (socket.getProtocol?.() !== "TLSv1.3" || socket.isSessionReused?.() !== false) throw fail(401);
      const pieces = [];
      let received = 0;
      await new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(fail(408)), limits.readTimeoutMs);
        request.on("data", chunk => {
          if (!Buffer.isBuffer(chunk) || received + chunk.length > (pluginRequest ? 64 * 1024 : MAX_BODY_BYTES)) {
            reject(fail(413));
            request.destroy();
            return;
          }
          received += chunk.length;
          pieces.push(chunk);
        });
        request.once("end", () => {
          if (received !== length) reject(fail()); else resolve();
        });
        request.once("aborted", () => reject(fail()));
        request.once("error", () => reject(fail()));
      });
      clearTimeout(timeout);
      // The fixed request-body deadline and socket idle timeout protect parsing.
      // Once the bounded body is complete, let the separate operation deadline
      // own the response lifetime instead of aborting dispatch on socket idle.
      socket.setTimeout(0);
      if (finished || response.destroyed || disposed) return;
      const rawBody = Buffer.concat(pieces, received);
      let pluginBody;
      if (pluginRequest) {
        try {
          const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(rawBody);
          pluginBody = requireSpsNativePluginRequest(JSON.parse(text));
          if (JSON.stringify(pluginBody) !== text) throw fail();
        } catch { throw fail(); }
      }
      const body = pluginRequest ? null : workspacePatch ? parseBody(rawBody, "inboxState") : parseBody(rawBody, route.body);
      const expected = assertIdentityCurrent(identitySnapshot);
      const selectedLeaf = selectedServerCertificate(socket);
      if (route.operation === "server-certificate") {
        const latest = expected.certificate;
        const now = Date.now();
        if (!latest.raw.equals(identitySnapshot.serverCertificates.at(-1).raw)
          || now < Date.parse(latest.validFrom) || now >= Date.parse(latest.validTo)) throw fail(503);
        const responseValue = Object.freeze({ hostId: expected.identity.hostId,
          predecessorCertificateSha256: createHash("sha256").update(selectedLeaf.raw).digest("hex"),
          serverCertificate: latest.raw.toString("base64url"), issuerSpkiSha256: expected.issuerSpkiSha256 });
        assertIdentityCurrent(expected);
        if (!selectedServerCertificate(socket).raw.equals(selectedLeaf.raw)) throw fail(503);
        writeJson(response, 200, responseValue);
        return;
      }
      const transport = Object.freeze({ tlsVersion: "TLSv1.3", sessionReused: false,
        remoteAddress: typeof socket.remoteAddress === "string" && socket.remoteAddress.length <= 128 ? socket.remoteAddress : null,
        ...(peerPresent ? { peerCertificateDer: peer.raw.toString("base64url") } : {}) });
      if (activeOperations.size >= limits.maxOperations) throw fail(429);
      const controller = new AbortController();
      activeController = controller;
      const active = { controller, response, settled: false };
      const operationKey = Symbol("native-host-ingress-operation");
      operationId = operationKey;
      activeOperations.set(operationKey, active);
      timeout = setTimeout(() => {
        if (active.settled) return;
        controller.abort();
        errorResponse(response, 504);
      }, limits.operationTimeoutMs);
      try {
        const dispatchOptions = { signal: controller.signal, assertCurrent: () => { assertIdentityCurrent(expected); } };
        const result = workspaceRequest
          ? await dispatchWorkspace(Object.freeze(pluginRequest
            ? { workspaceId: headers["x-sps-native-workspace"], target: NATIVE_PLUGIN_TARGET, cookie: credential.sessionCookie,
              peerCertificateDer: Buffer.from(peer.raw), method: "POST", body: rawBody }
            : workspacePatch
            ? { workspaceId: workspaceInboxPatch[1], target: request.url, cookie: credential.sessionCookie,
              peerCertificateDer: Buffer.from(peer.raw), method: "PATCH", body: Buffer.from(pieces.length ? Buffer.concat(pieces, received) : []) }
            : { workspaceId: workspaceDiscovery ? null : workspacePath[1], target: request.url,
              cookie: credential.sessionCookie, peerCertificateDer: Buffer.from(peer.raw) }), dispatchOptions)
          : await dispatch(route.operation, Object.freeze({ body, transport, ...(credential ? { credential } : {}) }), dispatchOptions);
        if (disposed || controller.signal.aborted || finished || response.destroyed) return;
        assertIdentityCurrent(expected);
        if (workspaceRequest) {
          // Core's private reader owns session/device/Workspace authorization.
          // Only its selected public surface result is serialized here.
          writeJson(response, 200, result, null, pluginBody?.operation === "asset" ? NATIVE_PLUGIN_MAX_RESPONSE : 256 * 1024);
          return;
        }
        validateResult(route.operation, result, expected);
        const cookie = route.operation === "session.exchange" ? (() => {
          if (typeof result.token !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(result.token)
            || result.expiresInSeconds !== 604800) throw fail(502);
          return `sps_identity_session=${result.token}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`;
        })() : null;
        const responseBody = route.operation === "session.exchange"
          ? { expiresInSeconds: 604800 } : result;
        const status = route.operation === "session.exchange" ? 201 : 200;
        const responseHeaders = route.operation === "session.exchange"
          ? { ...RESPONSE_HEADERS, "content-length": String(Buffer.byteLength(JSON.stringify(responseBody))), "set-cookie": cookie }
          : undefined;
        if (responseHeaders) {
          const bytes = Buffer.from(JSON.stringify(responseBody), "utf8");
          if (bytes.length > MAX_RESPONSE_BYTES) throw fail(502);
          if (!response.destroyed && !response.writableEnded) { response.writeHead(status, responseHeaders); response.end(bytes); }
        } else writeJson(response, status, responseBody);
      } finally {
        active.settled = true;
        clearTimeout(timeout);
        activeOperations.delete(operationKey);
      }
    } catch (error) {
      clearTimeout(timeout);
      if (operationId) {
        const active = activeOperations.get(operationId);
        if (active && !active.settled) {
          active.controller.abort();
        }
      }
      if (!finished && !response.destroyed && !response.writableEnded) respondHttpError(response, Number.isInteger(error?.statusCode) ? error.statusCode : 503);
    }
  }

  return Object.freeze({
    inspect() {
      const address = server?.address();
      return Object.freeze({ state: disposed ? "disposed" : state,
        ...(address && typeof address !== "string" && server?.listening ? { bindAddress: address.address, port: address.port } : {}) });
    },
    async start({ bindAddress, port } = {}) {
      if (disposed || server) throw new Error("Native Host ingress is already started or disposed.");
      const address = canonicalAddress(bindAddress);
      if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new TypeError("Invalid Native Host ingress port.");
      const guardResult = assertCurrent();
      if (guardResult !== undefined) {
        if (guardResult instanceof Promise) void guardResult.catch(() => {});
        throw new TypeError("Native Host ingress guards must be synchronous.");
      }
      identitySnapshot = currentIdentity();
      const certificate = identitySnapshot.certificate;
      if (!certificate.checkIP(address)) throw new Error("Native Host ingress certificate does not cover the selected bind address.");
      identitySnapshot.serverCertificates = serverCertificateHistory(identitySnapshot);
      certificateContexts = new Map(identitySnapshot.serverCertificates.map(entry => [
        nativeServerCertificateServername(entry.pem), createSecureContext({ cert: entry.pem,
          key: identitySnapshot.identity.server.privateKeyPem, ca: identitySnapshot.identity.memberIssuer.certificatePem }),
      ]));
      const instance = createHttpsServer({ cert: identitySnapshot.identity.server.certificatePem,
        key: identitySnapshot.identity.server.privateKeyPem,
        ca: identitySnapshot.identity.memberIssuer.certificatePem,
        requestCert: true, rejectUnauthorized: false, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
        secureOptions: cryptoConstants.SSL_OP_NO_TICKET,
        handshakeTimeout: limits.handshakeTimeoutMs, sessionTimeout: 0, maxHeaderSize: MAX_HEADERS_BYTES,
        SNICallback(servername, callback) {
          try {
            const alias = parseNativeServerCertificateServername(servername);
            if (!alias) { callback(null, certificateContexts.get(nativeServerCertificateServername(identitySnapshot.identity.server.certificatePem))); return; }
            if (!alias.valid) throw new Error("invalid reserved SNI");
            const entry = identitySnapshot.serverCertificates.find(value => createHash("sha256").update(value.raw).digest("hex") === alias.certificateSha256);
            if (!entry || Date.now() < Date.parse(entry.certificate.validFrom) || Date.now() >= Date.parse(entry.certificate.validTo)) throw new Error("unknown or expired SNI");
            assertIdentityCurrent(identitySnapshot);
            callback(null, certificateContexts.get(servername));
          } catch { callback(new Error("Native Host certificate selection failed.")); }
        },
        allowHalfOpen: false }, handle);
      const failClosed = () => {
        if (server !== instance) return;
        server = null;
        state = "failed";
        identitySnapshot = null;
        certificateContexts.clear();
        for (const active of activeOperations.values()) active.controller.abort();
        for (const socket of sockets) socket.destroy();
        try { instance.close(() => {}); } catch {}
      };
      const socketsSet = sockets;
      instance.on("connection", socket => {
        socketsSet.add(socket);
        socket.once("close", () => socketsSet.delete(socket));
        if (socketsSet.size > limits.maxSockets) socket.destroy();
      });
      instance.on("secureConnection", socket => {
        // The HTTP request and handler use the TLS socket, not the underlying
        // TCP socket emitted by `connection`; keep the idle read guard on the
        // same socket that can disable it once parsing finishes.
        socket.setTimeout(limits.readTimeoutMs, () => socket.destroy());
      });
      instance.on("clientError", (_error, socket) => socket.destroy());
      instance.on("tlsClientError", (_error, socket) => socket.destroy());
      instance.on("checkContinue", (_request, response) => errorResponse(response, 417));
      instance.on("checkExpectation", (_request, response) => errorResponse(response, 417));
      instance.on("connect", (_request, socket) => socket.destroy());
      instance.on("upgrade", (_request, socket) => socket.destroy());
      server = instance;
      state = "starting";
      instance.on("error", failClosed);
      instance.on("close", failClosed);
      try {
        await new Promise((resolve, reject) => {
          const onError = error => { instance.removeListener("listening", onListening); reject(error); };
          const onListening = () => { resolve(); };
          instance.once("error", onError); instance.once("listening", onListening);
          instance.listen({ host: address, port, exclusive: true });
        });
        assertIdentityCurrent(identitySnapshot);
        const bound = instance.address();
        if (!bound || typeof bound === "string") throw new Error("Native Host ingress did not bind a TCP address.");
        state = "listening";
        return Object.freeze({ state: "listening", bindAddress: bound.address, port: bound.port,
          hostId: identitySnapshot.identity.hostId });
      } catch (error) {
        await this.stop();
        throw error;
      }
    },
    async stop() {
      const instance = server;
      if (!instance) return;
      server = null;
      state = "stopping";
      for (const active of activeOperations.values()) active.controller.abort();
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => instance.close(() => resolve()));
      identitySnapshot = null;
      certificateContexts.clear();
      if (!disposed && state === "stopping") state = "disabled";
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await this.stop();
      state = "disposed";
    },
  });
}

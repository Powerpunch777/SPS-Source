import { createHash, createHmac, randomBytes } from "node:crypto";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

const HEADER = "X-SPS-Native-Workspace-Proof";
const COOKIE = /^sps_identity_session=[A-Za-z0-9_-]{64}$/;
const CONTENT_TYPES = new Set(["", "application/json"]);
const METHODS = new Set(["GET", "PUT", "PATCH", "POST"]);
const DISCOVERY_TARGET = "/sps-native/v1/workspaces";
const PLUGIN_RUNTIME_TARGET = "/sps-native/v1/plugin-runtime";
const NODE_RUNTIME_TARGET = "/sps-native/v1/node-runtime";
const MAX_TARGET_BYTES = 2048;
const MAX_PLUGIN_BODY_BYTES = 64 * 1024;
const MAX_NODE_BODY_BYTES = 512 * 1024;
const MAX_CERTIFICATE_BYTES = 4096;
const MAX_HEADER_BYTES = 8192;
const ERROR = "SPS Native Workspace request signing is unavailable.";
const fail = () => Object.assign(new Error(ERROR), { code: "native_workspace_proof_unavailable" });

function proofTarget(value) {
  if (typeof value !== "string" || value.length === 0 || Buffer.byteLength(value, "utf8") > MAX_TARGET_BYTES
    || !value.startsWith("/") || value.startsWith("//") || /[^\x21-\x7e]/.test(value)
    || /[\\#]/.test(value) || /%(?![0-9a-fA-F]{2})/.test(value)) throw new Error();
  const path = value.split("?", 1)[0];
  if (/%(?:2f|5c)/i.test(value)) throw new Error();
  for (const segment of path.split("/")) {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { throw new Error(); }
    if (decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\")) throw new Error();
  }
  let canonical;
  try {
    const parsed = new URL(value, "https://sps-native.invalid");
    canonical = parsed.pathname + parsed.search;
  } catch { throw new Error(); }
  if (canonical !== value) throw new Error();
  return value;
}

function requestFields(input) {
  const value = record(input, ["workspaceId", "method", "target", "body", "cookie", "contentType", "peerCertificateDer"]);
  if (value.workspaceId === null) {
    if (value.method !== "GET" || value.target !== DISCOVERY_TARGET) throw new Error();
  } else {
    uuid(value.workspaceId);
    if (value.target === DISCOVERY_TARGET) throw new Error();
  }
  if (!METHODS.has(value.method)) throw new Error();
  const target = proofTarget(value.target);
  const maximumBody = target === NODE_RUNTIME_TARGET ? MAX_NODE_BODY_BYTES : MAX_PLUGIN_BODY_BYTES;
  if (!Buffer.isBuffer(value.body) || value.body.length > maximumBody) throw new Error();
  if (value.method === "POST") {
    if (value.workspaceId === null || ![PLUGIN_RUNTIME_TARGET, NODE_RUNTIME_TARGET].includes(target) || value.body.length === 0
      || value.contentType !== "application/json") throw new Error();
  } else if (target === PLUGIN_RUNTIME_TARGET || target === NODE_RUNTIME_TARGET) throw new Error();
  if (typeof value.cookie !== "string" || !COOKIE.test(value.cookie)) throw new Error();
  if (typeof value.contentType !== "string" || !CONTENT_TYPES.has(value.contentType)) throw new Error();
  if (!Buffer.isBuffer(value.peerCertificateDer) || value.peerCertificateDer.length === 0
    || value.peerCertificateDer.length > MAX_CERTIFICATE_BYTES) throw new Error();
  return Object.freeze({
    workspaceId: value.workspaceId,
    method: value.method,
    target,
    body: value.body,
    cookie: value.cookie,
    contentType: value.contentType,
    peerCertificateDer: value.peerCertificateDer,
  });
}

/** Main-process only signer for an exact request received on the owned TLS listener. */
export function createSpsNativeWorkspaceRequestSigner(options) {
  let config;
  try {
    config = record(options, ["hostId", "key", "assertCurrent", ...(Object.hasOwn(options ?? {}, "now") ? ["now"] : [])]);
    uuid(config.hostId);
    if (!Buffer.isBuffer(config.key) || config.key.length !== 32 || typeof config.assertCurrent !== "function"
      || (config.now !== undefined && typeof config.now !== "function")) throw new Error();
  } catch { throw fail(); }

  const hostId = config.hostId;
  const key = Buffer.from(config.key);
  const assertCurrent = config.assertCurrent;
  const now = config.now ?? Date.now;
  let disposed = false;

  function guard() {
    if (disposed) throw fail();
    try {
      const result = assertCurrent();
      if (result !== undefined) {
        try {
          if (result && ["object", "function"].includes(typeof result) && typeof result.then === "function") {
            void Promise.resolve(result).catch(() => {});
          }
        } catch { /* The authority result is invalid regardless of its thenable shape. */ }
        throw new Error();
      }
    } catch { throw fail(); }
    if (disposed) throw fail();
  }

  function sign(input) {
    try {
      guard();
      const value = requestFields(input);
      const timestamp = now();
      if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new Error();
      const nonce = randomBytes(32).toString("base64url");
      const fields = [1, hostId, value.workspaceId, value.method, value.target, nonce, timestamp,
        createHash("sha256").update(value.body).digest("hex"), value.cookie, value.contentType,
        value.peerCertificateDer.toString("base64url")];
      const canonical = Buffer.from(JSON.stringify(fields), "utf8");
      const encoded = canonical.toString("base64url");
      guard();
      const signature = createHmac("sha256", key).update(canonical).digest("base64url");
      guard();
      const header = `${encoded}.${signature}`;
      if (Buffer.byteLength(header, "ascii") > MAX_HEADER_BYTES) throw new Error();
      return header;
    } catch { throw fail(); }
  }

  return Object.freeze({
    headerName: HEADER,
    signWorkspaceRequest: sign,
    dispose() {
      if (disposed) return;
      disposed = true;
      key.fill(0);
    },
  });
}

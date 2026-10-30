import { createHash } from "node:crypto";
import { nativeCertificateRecord as record, nativeCertificateUuid as uuid } from "./native-certificate-primitives.mjs";

export const NATIVE_PLUGIN_TARGET = "/sps-native/v1/plugin-runtime";
export const NATIVE_PLUGIN_MAX_ASSET = 4 * 1024 * 1024;
export const NATIVE_PLUGIN_MAX_RESPONSE = 6 * 1024 * 1024;
const SHA = /^[0-9a-f]{64}$/;
const fail = () => { throw new Error("The Native Plugin is unavailable."); };
const MIME = new Map([["js", "text/javascript; charset=utf-8"], ["mjs", "text/javascript; charset=utf-8"],
  ["css", "text/css; charset=utf-8"], ["json", "application/json; charset=utf-8"], ["svg", "image/svg+xml"],
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["gif", "image/gif"],
  ["webp", "image/webp"], ["ico", "image/x-icon"], ["woff", "font/woff"], ["woff2", "font/woff2"], ["ttf", "font/ttf"]]);

export function nativePluginAssetType(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.split("/").length > 8
    || value.split("/").some(part => !/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(part) || part === "." || part === "..")) fail();
  const type = MIME.get(value.split(".").at(-1)?.toLowerCase());
  if (!type) fail();
  return type;
}

export function snapshotNativePluginJson(value, maximum = 64 * 1024) {
  let nodes = 0, characters = 0;
  const parents = new Set();
  function visit(item, depth) {
    if (++nodes > 8192 || depth > 24) fail();
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") { if (!Number.isFinite(item)) fail(); return item; }
    if (typeof item === "string") { if ((characters += item.length) > maximum) fail(); return item; }
    if (!item || typeof item !== "object" || parents.has(item)) fail();
    parents.add(item);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(item);
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype || item.length > 8192
          || Reflect.ownKeys(descriptors).length !== item.length + 1) fail();
        return Array.from({ length: item.length }, (_, index) => {
          const d = descriptors[index];
          if (!d?.enumerable || !("value" in d)) fail();
          return visit(d.value, depth + 1);
        });
      }
      if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) fail();
      const out = Object.create(null);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string" || !descriptors[key].enumerable || !("value" in descriptors[key])) fail();
        if ((characters += key.length) > maximum) fail();
        out[key] = visit(descriptors[key].value, depth + 1);
      }
      return out;
    } finally { parents.delete(item); }
  }
  const result = visit(value, 0), text = JSON.stringify(result);
  if (Buffer.byteLength(text) > maximum) fail();
  return JSON.parse(text);
}

export function requireSpsNativePluginSelection(value) {
  const input = record(value, ["pluginId", "surface", "surfaceId"]);
  uuid(input.pluginId);
  if (!["shell", "widget"].includes(input.surface) || typeof input.surfaceId !== "string"
    || !input.surfaceId || input.surfaceId.length > 200 || /[\x00-\x1f\x7f]/.test(input.surfaceId)) fail();
  return Object.freeze(input);
}

export function requireSpsNativePluginRequest(value) {
  const revised = Object.hasOwn(value ?? {}, "revision");
  const input = record(value, ["pluginId", "surface", "surfaceId", ...(revised ? ["revision"] : []), "operation", "key", "params"]);
  requireSpsNativePluginSelection({ pluginId: input.pluginId, surface: input.surface, surfaceId: input.surfaceId });
  if (!["describe", "asset", "data", "action"].includes(input.operation)
    || typeof input.key !== "string" || !input.key || input.key.length > 200 || /[\x00-\x1f\x7f]/.test(input.key)
    || !input.params || typeof input.params !== "object" || Array.isArray(input.params)) fail();
  if (input.operation === "describe") {
    if (!revised || input.revision !== null || input.key !== "surface" || Reflect.ownKeys(input.params).length) fail();
  } else if (revised && (typeof input.revision !== "string" || !SHA.test(input.revision))) fail();
  if (input.operation === "asset") {
    if (!revised || Reflect.ownKeys(input.params).length) fail();
    nativePluginAssetType(input.key);
  }
  return Object.freeze(snapshotNativePluginJson(input));
}

export function validateSpsNativePluginDescriptor(value) {
  const input = record(snapshotNativePluginJson(value, 256 * 1024), ["v", "kind", "workspaceId", "pluginId", "pluginKey", "displayName", "revision",
    "surface", "surfaceId", "entryFile", "exportName", "widget", "slot", "cssFiles"]);
  uuid(input.workspaceId);
  requireSpsNativePluginSelection({ pluginId: input.pluginId, surface: input.surface, surfaceId: input.surfaceId });
  if (input.v !== 1 || input.kind !== "sps.native.plugin.surface" || !SHA.test(input.revision)
    || typeof input.pluginKey !== "string" || !input.pluginKey || input.pluginKey.length > 200
    || typeof input.displayName !== "string" || !input.displayName || input.displayName.length > 200
    || input.entryFile !== "index.js" || typeof input.exportName !== "string" || !/^[A-Za-z_$][\w$]{0,199}$/.test(input.exportName)
    || !Array.isArray(input.cssFiles) || input.cssFiles.length > 32 || new Set(input.cssFiles).size !== input.cssFiles.length) fail();
  for (const css of input.cssFiles) if (nativePluginAssetType(css) !== "text/css; charset=utf-8" || css.includes("/")) fail();
  if (input.surface === "widget") {
    if (!input.widget || input.slot !== null || input.widget.id !== input.surfaceId || input.widget.exportName !== input.exportName
      || typeof input.widget.dataAction !== "string" || !input.widget.dataAction || input.widget.dataAction.length > 200) fail();
  } else if (!input.slot || input.widget !== null || input.slot.type !== "page" || input.slot.exportName !== input.exportName) fail();
  return Object.freeze(snapshotNativePluginJson(input, 256 * 1024));
}

export function validateSpsNativePluginAsset(value, expectedPath) {
  const input = record(value, ["path", "contentType", "bytes", "sha256"]);
  if (input.path !== expectedPath || input.contentType !== nativePluginAssetType(input.path)
    || typeof input.bytes !== "string" || input.bytes.length > Math.ceil(NATIVE_PLUGIN_MAX_ASSET * 4 / 3) + 2
    || !/^[A-Za-z0-9_-]*$/.test(input.bytes) || !SHA.test(input.sha256)) fail();
  const bytes = Buffer.from(input.bytes, "base64url");
  if (bytes.length > NATIVE_PLUGIN_MAX_ASSET || bytes.toString("base64url") !== input.bytes
    || createHash("sha256").update(bytes).digest("hex") !== input.sha256) fail();
  return Object.freeze(input);
}

export function parseSpsNativePluginResponse(envelope, request) {
  if (envelope.statusCode !== 200 || !Buffer.isBuffer(envelope.body)
    || envelope.body.length > (request.operation === "asset" ? NATIVE_PLUGIN_MAX_RESPONSE : 256 * 1024)) fail();
  const pairs = envelope.rawHeaders;
  if (!Array.isArray(pairs) || pairs.length > 64) fail();
  const headers = new Map();
  for (let i = 0; i < pairs.length; i += 2) {
    const key = pairs[i]?.toLowerCase();
    if (!key || typeof pairs[i + 1] !== "string" || headers.has(key)) fail();
    headers.set(key, pairs[i + 1]);
  }
  if (!/^application\/json(?:; charset=utf-8)?$/.test(headers.get("content-type") ?? "")
    || headers.get("cache-control") !== "no-store" || headers.has("set-cookie") || headers.has("location")
    || headers.has("content-encoding") || headers.has("transfer-encoding")
    || headers.get("content-length") !== String(envelope.body.length)) fail();
  const data = record(JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(envelope.body)), ["data"]).data;
  if (request.operation === "describe") return Object.freeze({ data: validateSpsNativePluginDescriptor(data) });
  if (request.operation === "asset") return Object.freeze({ data: validateSpsNativePluginAsset(data, request.key) });
  return Object.freeze({ data: snapshotNativePluginJson(data, 256 * 1024) });
}

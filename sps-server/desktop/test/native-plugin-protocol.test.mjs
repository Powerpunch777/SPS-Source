import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { requireSpsNativePluginRequest, validateSpsNativePluginDescriptor, validateSpsNativePluginAsset,
  snapshotNativePluginJson, parseSpsNativePluginResponse } from "../src/native-plugin-protocol.mjs";

const PLUGIN = "11111111-1111-4111-8111-111111111111", WORKSPACE = "22222222-2222-4222-8222-222222222222";
const base = { pluginId: PLUGIN, surface: "widget", surfaceId: "count", revision: "a".repeat(64),
  operation: "data", key: "count", params: {} };
const descriptor = { v: 1, kind: "sps.native.plugin.surface", workspaceId: WORKSPACE, pluginId: PLUGIN,
  pluginKey: "sps.count", displayName: "Count", revision: "a".repeat(64), surface: "widget", surfaceId: "count",
  entryFile: "index.js", exportName: "Count", widget: { id: "count", exportName: "Count", dataAction: "count" }, slot: null, cssFiles: ["index.css"] };

test("Native Plugin request admits only fixed operations, revision and bounded data without evaluating getters", () => {
  assert.deepEqual(requireSpsNativePluginRequest(base), base);
  const describe = { ...base, revision: null, operation: "describe", key: "surface" };
  assert.deepEqual(requireSpsNativePluginRequest(describe), describe);
  for (const input of [{ ...base, revision: null }, { ...base, workspaceId: WORKSPACE },
    { ...base, operation: "GET" }, { ...describe, key: "arbitrary" }, { ...base, operation: "asset", key: "../key.js" },
    { ...base, operation: "asset", key: "index.js", params: { url: "https://other" } },
    { ...base, params: { text: "x".repeat(65_536) } }]) assert.throws(() => requireSpsNativePluginRequest(input));
  let getters = 0;
  assert.throws(() => snapshotNativePluginJson(Object.defineProperty({}, "key", { enumerable: true, get() { getters++; } })));
  assert.equal(getters, 0);
});

test("Native Plugin descriptor and asset reject scope confusion, paths and corrupt payloads", () => {
  assert.deepEqual(validateSpsNativePluginDescriptor(descriptor), descriptor);
  assert.throws(() => validateSpsNativePluginDescriptor({ ...descriptor, url: "file:///private" }));
  assert.throws(() => validateSpsNativePluginDescriptor({ ...descriptor, widget: { ...descriptor.widget, id: "other" } }));
  assert.throws(() => validateSpsNativePluginDescriptor({ ...descriptor, cssFiles: ["../private.css"] }));
  const bytes = Buffer.from("export const Count = 1;");
  const asset = { path: "index.js", contentType: "text/javascript; charset=utf-8", bytes: bytes.toString("base64url"),
    sha256: createHash("sha256").update(bytes).digest("hex") };
  assert.deepEqual(validateSpsNativePluginAsset(asset, "index.js"), asset);
  assert.throws(() => validateSpsNativePluginAsset(asset, "different.js"));
  assert.throws(() => validateSpsNativePluginAsset({ ...asset, bytes: asset.bytes + "=" }, "index.js"));
  assert.throws(() => validateSpsNativePluginAsset({ ...asset, sha256: "b".repeat(64) }, "index.js"));
  assert.throws(() => validateSpsNativePluginAsset({ ...asset, contentType: "text/html" }, "index.js"));
});

test("Native Plugin response requires closed JSON framing and no cookies, redirects or compression", () => {
  const body = Buffer.from(JSON.stringify({ data: descriptor }));
  const envelope = { statusCode: 200, body, rawHeaders: ["Content-Type", "application/json; charset=utf-8",
    "Cache-Control", "no-store", "Content-Length", String(body.length)] };
  const request = { ...base, operation: "describe" };
  assert.deepEqual(parseSpsNativePluginResponse(envelope, request), { data: descriptor });
  for (const header of ["Set-Cookie", "Location", "Content-Encoding", "Transfer-Encoding"]) {
    assert.throws(() => parseSpsNativePluginResponse({ ...envelope, rawHeaders: [...envelope.rawHeaders, header, "forbidden"] }, request));
  }
  assert.throws(() => parseSpsNativePluginResponse({ ...envelope, statusCode: 302 }, request));
});

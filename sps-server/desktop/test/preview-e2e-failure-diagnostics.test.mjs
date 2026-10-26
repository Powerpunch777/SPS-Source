import assert from "node:assert/strict";
import test from "node:test";
import { annotatePreviewE2eApiFailure, annotatePreviewE2eCdpFailure, snapshotPreviewE2eFailure } from "../scripts/preview-e2e-failure-diagnostics.mjs";

test("projects only finite phases and API operation/status while preserving the original error", () => {
  const error = new Error("API POST failed (403): forbidden customer@private.test C:\\private token=secret");
  assert.equal(annotatePreviewE2eApiFailure(error, { method: "POST", pathName: "/api/plugins/tools/execute", status: 403 }), error);
  assert.deepEqual(snapshotPreviewE2eFailure(error, "builder_project"), { phase: "builder_project", kind: "error",
    category: "permission_denied", code: null, apiOperation: "plugin_tool_execute", httpStatus: 403 });
  assert.match(error.message, /customer@private/);
  assert.doesNotMatch(JSON.stringify(snapshotPreviewE2eFailure(error, "builder_project")), /customer|private|token|secret/);
});

test("classifies known API paths without emitting request UUIDs, query values or arbitrary method/path text", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  for (const [method, pathName, operation] of [
    ["GET", "/api/plugins/tools?pluginId=sps.plugin-discovery", "plugin_tools_list"],
    ["GET", "/api/plugins", "plugin_list"],
    ["GET", `/api/agents/${id}`, "agent_get"],
    ["POST", `/api/agents/${id}/heartbeat/invoke`, "heartbeat_invoke"],
    ["POST", `/api/companies/${id}/agents`, "agent_create"],
    ["GET", `/api/companies/${id}/projects`, "project_list"],
    ["POST", `/api/companies/${id}/projects`, "project_create"],
    ["POST", "https://customer:secret@private.test/api/plugins/tools/execute", null],
    ["GET", "/api/plugins/tools?token=secret", null],
    ["GET", `/api/agents/${id}?token=secret`, null],
    ["customer@private.test", "/api/plugins", null],
  ]) {
    const snapshot = snapshotPreviewE2eFailure(annotatePreviewE2eApiFailure(new Error("failure"), { method, pathName, status: 500 }), "builder_tools");
    assert.equal(snapshot.apiOperation, operation);
    assert.doesNotMatch(JSON.stringify(snapshot), /11111111|customer|private|secret|https/);
  }
});

test("rejects arbitrary metadata, malformed status, accessors and hostile exceptions without leaking their values", () => {
  let getterCalls = 0;
  const accessor = Object.defineProperty({}, "message", { get() { getterCalls += 1; return "secret"; } });
  const hostile = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("secret"); }, getPrototypeOf() { throw new Error("secret"); } });
  for (const error of [null, undefined, "customer@private.test", accessor, hostile,
    { message: "customer@private.test", code: "secret", previewE2eApi: { operation: "private", httpStatus: "403" } }]) {
    const snapshot = snapshotPreviewE2eFailure(error, "C:\\customer@private.test");
    assert.equal(snapshot.phase, "unknown");
    assert.equal(snapshot.code, null);
    assert.equal(snapshot.apiOperation, null);
    assert.equal(snapshot.httpStatus, null);
    assert.doesNotMatch(JSON.stringify(snapshot), /customer|private|secret/);
  }
  assert.equal(getterCalls, 0);
  for (const status of [undefined, NaN, Infinity, -1, 99, 600, 400.5, "403"]) {
    const error = annotatePreviewE2eApiFailure(new Error("failure"), { method: "GET", pathName: "/api/plugins", status });
    assert.equal(snapshotPreviewE2eFailure(error, "builder_tools").httpStatus, null);
  }
});

test("keeps fixed assertion/type/filesystem/timeout hints and never serializes original payloads", () => {
  const assertion = new Error("private payload"); assertion.code = "ERR_ASSERTION";
  assert.equal(snapshotPreviewE2eFailure(assertion, "builder_tools").kind, "assertion");
  assert.equal(snapshotPreviewE2eFailure(new TypeError("not a function private path"), "builder_surface").category, "javascript_contract");
  assert.equal(snapshotPreviewE2eFailure(new RangeError("private"), "bootstrap").kind, "range_error");
  assert.equal(snapshotPreviewE2eFailure(new SyntaxError("private"), "bootstrap").kind, "syntax_error");
  const missing = Object.assign(new Error("ENOENT C:\\private"), { code: "ENOENT" });
  assert.equal(snapshotPreviewE2eFailure(missing, "sdk_project").code, "ENOENT");
  assert.equal(snapshotPreviewE2eFailure(new Error("Timed out waiting for private"), "owner_workspace").category, "timeout");
  assert.equal(snapshotPreviewE2eFailure(new Error("Run is not running private"), "builder_project").category, "run_context_unavailable");
  const frozen = Object.freeze(new Error("private"));
  assert.equal(annotatePreviewE2eApiFailure(frozen, { method: "GET", pathName: "/api/plugins", status: 500 }), frozen);
  assert.equal(snapshotPreviewE2eFailure(frozen, "builder_tools").httpStatus, null);
});

test("retains finite CDP exception hints without changing Uncaught or echoing descriptions and stacks", () => {
  const original = new Error("Uncaught");
  const result = annotatePreviewE2eCdpFailure(original, { text: "Uncaught", exception: { className: "TypeError",
    description: "TypeError: Cannot read properties of undefined (reading 'click') at C:\\customer\\private user@private.test token=secret" } });
  assert.equal(result, original);
  assert.equal(result.message, "Uncaught");
  assert.deepEqual(snapshotPreviewE2eFailure(result, "builder_surface"), { phase: "builder_surface", kind: "type_error",
    category: "javascript_contract", code: null, apiOperation: null, httpStatus: null });
  assert.doesNotMatch(JSON.stringify(snapshotPreviewE2eFailure(result, "builder_surface")), /customer|private|token|secret|click/);
  const unknown = annotatePreviewE2eCdpFailure(new Error("Uncaught"), { exception: { className: "private", description: "private" } });
  assert.equal(snapshotPreviewE2eFailure(unknown, "builder_surface").kind, "error");
  const forged = Object.assign(new Error("Uncaught"), { previewE2eCdp: { kind: "private", category: "private" } });
  assert.doesNotMatch(JSON.stringify(snapshotPreviewE2eFailure(forged, "builder_surface")), /private/);
});

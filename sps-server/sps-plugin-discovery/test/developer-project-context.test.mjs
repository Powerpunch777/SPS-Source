import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVELOPER_PROJECT_PLUGIN_ID,
  buildDeveloperProjectContextInput,
  getDeveloperProjectBridge,
  normalizeDeveloperProjectContextResponse,
} from "../src/ui/developer-project-context.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const contextId = "22222222-2222-4222-8222-222222222222";

test("project context input is UUID-scoped and pins the Plugin ID", () => {
  assert.deepEqual(buildDeveloperProjectContextInput({ companyId, contextId }), {
    companyId,
    pluginId: DEVELOPER_PROJECT_PLUGIN_ID,
    contextId,
  });
  assert.equal(DEVELOPER_PROJECT_PLUGIN_ID, "sps.plugin-discovery");
});

test("malformed and incomplete scopes are rejected", () => {
  for (const scope of [null, [], {}, { companyId, contextId: "not-a-uuid" },
    { companyId: "not-a-uuid", contextId }, { companyId, contextId: null }]) {
    assert.equal(buildDeveloperProjectContextInput(scope), null);
  }
});

test("Host bridge is unavailable unless both scoped methods exist", () => {
  assert.equal(getDeveloperProjectBridge(undefined), null);
  assert.equal(getDeveloperProjectBridge({ getDeveloperProjectContext() {} }), null);
  assert.equal(getDeveloperProjectBridge({ openDeveloperProjectContext() {} }), null);
});

test("bridge calls preserve Host receiver and pass only allowlisted scope", async () => {
  const calls = [];
  const host = {
    token: "host receiver",
    getDeveloperProjectContext(input) {
      assert.equal(this, host);
      calls.push(["get", input]);
      return { available: true, project: null, missingProject: true };
    },
    openDeveloperProjectContext(input) {
      assert.equal(this, host);
      calls.push(["open", input]);
      return { opened: true };
    },
  };
  const bridge = getDeveloperProjectBridge(host);
  await bridge.get({ companyId, contextId, pluginId: "other.plugin", folderPath: "C:\\secret" });
  await bridge.open({ companyId, contextId, token: "not forwarded" });
  const expected = { companyId, pluginId: DEVELOPER_PROJECT_PLUGIN_ID, contextId };
  assert.deepEqual(calls, [["get", expected], ["open", expected]]);
  assert.throws(() => bridge.get({ companyId, contextId: "invalid" }), /valid Workspace and conversation/);
});

test("project context response is minimized and rejects path-like display labels", () => {
  assert.deepEqual(normalizeDeveloperProjectContextResponse({
    available: true,
    context: { private: "ignored" },
    workspaceName: "ignored",
    pluginName: "ignored",
    missingProject: false,
    project: { id: "project-1", displayName: "Weather Plugin", sourceLabel: "Developer Registry", verified: true, folderPath: "C:\\secret" },
  }), {
    project: { id: "project-1", displayName: "Weather Plugin", sourceLabel: "Developer Registry", verified: true },
    missingProject: false,
    validationFeedbackState: "absent",
  });
  assert.equal(normalizeDeveloperProjectContextResponse({
    available: true, missingProject: false,
    project: { id: "project-1", displayName: "C:\\secret", sourceLabel: "Developer Registry", verified: true },
  }), null);
  assert.equal(normalizeDeveloperProjectContextResponse({ available: false, project: null, missingProject: true }), null);
  assert.deepEqual(normalizeDeveloperProjectContextResponse({ available: true, project: null, missingProject: false }), {
    project: null, missingProject: false, validationFeedbackState: "absent",
  });
  assert.deepEqual(normalizeDeveloperProjectContextResponse({ available: true, project: null, missingProject: true }), {
    project: null, missingProject: true, validationFeedbackState: "absent",
  });
  assert.deepEqual(normalizeDeveloperProjectContextResponse({
    available: true, project: null, missingProject: false, validationFeedback: null,
  }), {
    project: null, missingProject: false, validationFeedbackState: "absent",
  });
  assert.equal(normalizeDeveloperProjectContextResponse({
    available: true, project: null, missingProject: false, validationFeedback: { status: "failed" },
  }).validationFeedbackState, "invalid");
  const withFailure = normalizeDeveloperProjectContextResponse({
    available: true,
    missingProject: false,
    project: { id: "project-1", displayName: "Weather Plugin", sourceLabel: "Developer Registry", verified: false },
    validationFeedback: {
      schemaVersion: 1,
      attemptId: "desktop.33333333-3333-4333-8333-333333333333",
      kind: "gates",
      status: "failed",
      occurredAt: "2026-10-24T12:34:56.000Z",
      diagnostics: [{ code: "GATE_FAILED", message: "Check one bounded diagnostic." }],
    },
  });
  assert.equal(withFailure.validationFeedbackState, "valid");
  assert.equal(withFailure.validationFeedback.status, "failed");
  assert.equal(withFailure.project.id, "project-1");
});

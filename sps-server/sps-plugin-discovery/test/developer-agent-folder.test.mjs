import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDeveloperAgentFolderCheckInput,
  getDeveloperAgentFolderBridge,
  normalizeDeveloperAgentFolderCheckResponse,
} from "../src/ui/developer-agent-folder.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const contextId = "22222222-2222-4222-8222-222222222222";
const agentId = "33333333-3333-4333-8333-333333333333";
const projectId = "dev-44444444-4444-4444-8444-444444444444";
const scope = { companyId, contextId };
const dto = status => ({ schemaVersion: 1, projectId, agentId, status });

test("builds only the fixed plugin and UUID-scoped Host input", () => {
  assert.deepEqual(buildDeveloperAgentFolderCheckInput({ ...scope, pluginId: "other.plugin", extra: "ignored" }, agentId), {
    context: { companyId, pluginId: "sps.plugin-discovery", contextId },
    agentId,
  });
  for (const [badScope, badAgent] of [
    [null, agentId],
    [{ companyId: "not-a-uuid", contextId }, agentId],
    [{ companyId, contextId: "not-a-uuid" }, agentId],
    [scope, "not-a-uuid"],
  ]) assert.equal(buildDeveloperAgentFolderCheckInput(badScope, badAgent), null);
});

test("optional bridge works independently of project get/open methods and preserves Host receiver", async () => {
  assert.equal(getDeveloperAgentFolderBridge(undefined), null);
  assert.equal(getDeveloperAgentFolderBridge({ getDeveloperProjectContext() {}, openDeveloperProjectContext() {} }), null);
  const calls = [];
  const host = {
    checkDeveloperAgentFolder(input) {
      assert.equal(this, host);
      calls.push(input);
      return dto("configured-match");
    },
  };
  const bridge = getDeveloperAgentFolderBridge(host);
  assert.deepEqual(await bridge.check({ ...scope, ignored: "not forwarded" }, agentId), dto("configured-match"));
  assert.deepEqual(calls, [{ context: { companyId, pluginId: "sps.plugin-discovery", contextId }, agentId }]);
  assert.throws(() => bridge.check(scope, "invalid"), /valid Workspace, conversation, and Lead/);
  assert.equal(calls.length, 1);
});

test("accepts each known status only when the strict DTO is bound to expected project and Lead", () => {
  for (const status of ["configured-match", "configured-different", "not-configured", "unsupported", "unavailable"]) {
    assert.deepEqual(normalizeDeveloperAgentFolderCheckResponse(dto(status), { projectId, agentId }), dto(status));
  }
  assert.equal(normalizeDeveloperAgentFolderCheckResponse({ ...dto("configured-match"), extra: "secret" }, { projectId, agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse({ ...dto("configured-match"), status: "ready" }, { projectId, agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse({ ...dto("configured-match"), schemaVersion: "1" }, { projectId, agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse({ projectId, agentId, status: "configured-match" }, { projectId, agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse({ ...dto("configured-match"), projectId: "project-1" }, { projectId, agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse({ ...dto("configured-match"), agentId: companyId }, { projectId, agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse(dto("configured-match"), { projectId: "dev-not-a-uuid", agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse(dto("configured-match"), { projectId, agentId: "not-a-uuid" }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse(dto("configured-match"), { projectId: "dev-55555555-5555-4555-8555-555555555555", agentId }), null);
  assert.equal(normalizeDeveloperAgentFolderCheckResponse(dto("configured-match"), { projectId, agentId: companyId }), null);
});

test("matches UUID identities case-insensitively while binding each returned identity", () => {
  const upperProject = projectId.replace(/[a-f]/g, char => char.toUpperCase());
  const upperAgent = agentId.replace(/[a-f]/g, char => char.toUpperCase());
  assert.deepEqual(normalizeDeveloperAgentFolderCheckResponse(
    { ...dto("configured-match"), projectId: upperProject, agentId: upperAgent },
    { projectId, agentId },
  ), { schemaVersion: 1, projectId: upperProject, agentId: upperAgent, status: "configured-match" });
  assert.equal(normalizeDeveloperAgentFolderCheckResponse(dto("configured-match"), {
    projectId,
    agentId: "55555555-5555-4555-8555-555555555555",
  }), null);
});

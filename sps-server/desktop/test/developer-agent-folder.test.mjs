import assert from "node:assert/strict";
import test from "node:test";
import { assessDeveloperAgentFolder } from "../src/developer-agent-folder.mjs";

const PROJECT_ID = "dev-123e4567-e89b-12d3-a456-426614174000";
const COMPANY_ID = "223e4567-e89b-12d3-a456-426614174000";
const AGENT_ID = "323e4567-e89b-12d3-a456-426614174000";
const OTHER_COMPANY_ID = "423e4567-e89b-12d3-a456-426614174000";
const PROJECT_PATH = "/work/example";

function input(overrides = {}) {
  return {
    project: { id: PROJECT_ID, sourcePath: PROJECT_PATH },
    agent: {
      id: AGENT_ID,
      companyId: COMPANY_ID,
      status: "idle",
      adapterType: "codex_local",
      adapterConfig: { cwd: PROJECT_PATH },
    },
    companyId: COMPANY_ID,
    agentId: AGENT_ID,
    platform: "linux",
    ...overrides,
  };
}

function expected(status) {
  return { schemaVersion: 1, projectId: PROJECT_ID, agentId: AGENT_ID, status };
}

test("returns only the exact DTO and never reveals folder or config values", () => {
  const result = assessDeveloperAgentFolder(input({
    project: { id: PROJECT_ID, sourcePath: "/private/project-path" },
    agent: {
      ...input().agent,
      adapterConfig: { cwd: "/private/project-path", apiKey: "secret-value" },
    },
  }));
  assert.deepEqual(result, expected("configured-match"));
  assert.deepEqual(Object.keys(result).sort(), ["agentId", "projectId", "schemaVersion", "status"]);
  assert.doesNotMatch(JSON.stringify(result), /private|secret-value|cwd|adapterConfig/);
});

test("returns unavailable for absent or inactive Agents", () => {
  assert.deepEqual(assessDeveloperAgentFolder(input({ agent: null })), expected("unavailable"));
  for (const status of ["paused", "terminated", "pending_approval", "error"]) {
    assert.deepEqual(assessDeveloperAgentFolder(input({
      agent: { ...input().agent, status },
    })), expected("unavailable"), status);
  }
});

test("Windows 8.3 aliases remain lexically different until the caller supplies the canonical path", () => {
  const canonical = "C:\\Users\\runneradmin\\AppData\\Local\\Temp\\plugin";
  const alias = "C:\\Users\\RUNNER~1\\AppData\\Local\\Temp\\plugin";
  const fixture = input({ platform: "win32", project: { id: PROJECT_ID, sourcePath: canonical } });
  assert.deepEqual(assessDeveloperAgentFolder({ ...fixture,
    agent: { ...fixture.agent, adapterConfig: { cwd: alias } },
  }), expected("configured-different"));
  assert.deepEqual(assessDeveloperAgentFolder({ ...fixture,
    agent: { ...fixture.agent, adapterConfig: { cwd: canonical } },
  }), expected("configured-match"));
});

test("throws for malformed or foreign Agent identity instead of reporting unavailable", () => {
  assert.throws(() => assessDeveloperAgentFolder(input({
    agent: { ...input().agent, companyId: "not-a-uuid" },
  })), /identity is invalid/);
  assert.throws(() => assessDeveloperAgentFolder(input({
    agent: { ...input().agent, companyId: OTHER_COMPANY_ID },
  })), /identity does not match/);
  assert.throws(() => assessDeveloperAgentFolder(input({
    agent: { ...input().agent, id: OTHER_COMPANY_ID },
  })), /identity does not match/);
});

test("rejects malformed or non-canonical identities", () => {
  assert.throws(() => assessDeveloperAgentFolder(input({ companyId: "not-a-uuid" })), TypeError);
  assert.throws(() => assessDeveloperAgentFolder(input({ agentId: "not-a-uuid" })), TypeError);
  assert.throws(() => assessDeveloperAgentFolder(input({
    project: { id: PROJECT_ID.toUpperCase(), sourcePath: PROJECT_PATH },
  })), TypeError);
});

test("reports unsupported adapters and remote execution targets without exposing them", () => {
  assert.deepEqual(assessDeveloperAgentFolder(input({
    agent: { ...input().agent, adapterType: "claude_local" },
  })), expected("unsupported"));
  const remote = assessDeveloperAgentFolder(input({
    agent: {
      ...input().agent,
      executionTarget: { kind: "remote", nodeLabel: "private-node", token: "secret-value" },
    },
  }));
  assert.deepEqual(remote, expected("unsupported"));
  assert.doesNotMatch(JSON.stringify(remote), /private-node|secret-value|remote/);
  assert.deepEqual(assessDeveloperAgentFolder(input({
    agent: { ...input().agent, executionTarget: { kind: "unknown" } },
  })), expected("unsupported"));
});

test("reports empty and malformed working directories as not configured", () => {
  for (const cwd of ["", "relative/project", "C:relative", "\u0000/work", `/work/${"x".repeat(32_000)}`]) {
    assert.deepEqual(assessDeveloperAgentFolder(input({
      agent: { ...input().agent, adapterConfig: { cwd } },
    })), expected("not-configured"));
  }
  assert.deepEqual(assessDeveloperAgentFolder(input({
    agent: { ...input().agent, adapterConfig: {} },
  })), expected("not-configured"));
  assert.deepEqual(assessDeveloperAgentFolder(input({
    project: { id: PROJECT_ID, sourcePath: "relative/project" },
  })), expected("not-configured"));
});

test("normalizes POSIX dot segments and trailing separators without matching siblings", () => {
  assert.deepEqual(assessDeveloperAgentFolder(input({
    project: { id: PROJECT_ID, sourcePath: "/work/team/../example/" },
    agent: { ...input().agent, adapterConfig: { cwd: "/work/example/./" } },
  })), expected("configured-match"));
  assert.deepEqual(assessDeveloperAgentFolder(input({
    agent: { ...input().agent, adapterConfig: { cwd: "/work/example-other" } },
  })), expected("configured-different"));
  assert.deepEqual(assessDeveloperAgentFolder(input({
    project: { id: PROJECT_ID, sourcePath: "//server/work/example" },
  })), expected("not-configured"));
});

test("normalizes Windows drive paths case-insensitively and ignores trailing separators", () => {
  assert.deepEqual(assessDeveloperAgentFolder(input({
    platform: "win32",
    project: { id: PROJECT_ID, sourcePath: "C:\\Work\\Team\\..\\Example\\" },
    agent: { ...input().agent, adapterConfig: { cwd: "c:/work/example/." } },
  })), expected("configured-match"));
  assert.deepEqual(assessDeveloperAgentFolder(input({
    platform: "win32",
    project: { id: PROJECT_ID, sourcePath: "C:\\Work\\Example" },
    agent: { ...input().agent, adapterConfig: { cwd: "D:\\Work\\Example" } },
  })), expected("configured-different"));
  assert.deepEqual(assessDeveloperAgentFolder(input({
    platform: "win32",
    project: { id: PROJECT_ID, sourcePath: "C:\\Work\\Example" },
    agent: { ...input().agent, adapterConfig: { cwd: "C:\\Work\\ExampleSibling" } },
  })), expected("configured-different"));
});

test("rejects Windows drive-relative, root-relative, UNC, and device paths as unconfigured", () => {
  const invalidPaths = [
    "C:Work\\Example",
    "\\Work\\Example",
    "\\\\server\\share\\Example",
    "//server/share/Example",
    "\\\\?\\C:\\Work\\Example",
    "\\\\.\\C:\\Work\\Example",
  ];
  for (const cwd of invalidPaths) {
    assert.deepEqual(assessDeveloperAgentFolder(input({
      platform: "win32",
      agent: { ...input().agent, adapterConfig: { cwd } },
    })), expected("not-configured"), cwd);
  }
});

test("does not fall back to the process working directory", () => {
  const result = assessDeveloperAgentFolder(input({
    agent: { ...input().agent, adapterConfig: { cwd: "" } },
  }));
  assert.deepEqual(result, expected("not-configured"));
});

test("does not execute accessors on identity, path, or execution-target input", () => {
  let getterCalled = false;
  const agent = input().agent;
  Object.defineProperty(agent.adapterConfig, "cwd", {
    enumerable: true,
    get() { getterCalled = true; return PROJECT_PATH; },
  });
  const result = assessDeveloperAgentFolder(input({ agent }));
  assert.deepEqual(result, expected("not-configured"));
  assert.equal(getterCalled, false);
});

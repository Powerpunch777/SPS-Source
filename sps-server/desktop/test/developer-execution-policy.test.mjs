import assert from "node:assert/strict";
import test from "node:test";
import { requireTrustedDeveloperExecution } from "../src/developer-execution-policy.mjs";

test("unsupported protected development cannot fall back to legacy local execution", () => {
  for (const executionMode of [undefined, null, "protected", "sandbox", "trusted", true, { supported: true }]) {
    assert.throws(() => requireTrustedDeveloperExecution({ projectId: "project-1", executionMode }), /Protected development execution is unavailable/);
  }
  assert.throws(() => requireTrustedDeveloperExecution({ projectId: "project-1" }));
  assert.equal(requireTrustedDeveloperExecution({ projectId: "project-1", executionMode: "trusted-local" }), "project-1");
});

test("local development mode does not accept caller privileges, paths, scopes or accessor fields", () => {
  let read = false;
  const getter = Object.defineProperty({ projectId: "project-1" }, "executionMode", { enumerable: true,
    get() { read = true; return "trusted-local"; } });
  for (const input of [getter, { projectId: "project-1", executionMode: "trusted-local", protected: true },
    { projectId: "../outside", executionMode: "trusted-local" },
    { projectId: "https://other.invalid", executionMode: "trusted-local" },
    { projectId: "C:\\private", executionMode: "trusted-local" }, null, []]) assert.throws(() => requireTrustedDeveloperExecution(input));
  assert.equal(read, false);
});

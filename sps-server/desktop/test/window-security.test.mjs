import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpsSetupWindowPreferences,
  createSpsWorkspaceWindowPreferences,
  isAllowedSpsWorkspaceNavigation,
} from "../src/window-security.mjs";

test("keeps the Desktop preload bridge out of remote SPS team windows", () => {
  const setup = createSpsSetupWindowPreferences("C:/SPS/preload.mjs");
  const workspace = createSpsWorkspaceWindowPreferences();
  assert.equal(setup.preload, "C:/SPS/preload.mjs");
  assert.equal("preload" in workspace, false);
  assert.deepEqual(workspace, {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  });
});

test("allows only the local Owner Host Workspace to receive its narrow Desktop bridge", () => {
  const workspace = createSpsWorkspaceWindowPreferences("C:/SPS/workspace-preload.cjs");

  assert.equal(workspace.preload, "C:/SPS/workspace-preload.cjs");
  assert.equal(workspace.contextIsolation, true);
  assert.equal(workspace.nodeIntegration, false);
  assert.equal(workspace.sandbox, true);
});

test("keeps remote workspace navigation on the configured Hub", () => {
  const hub = "https://hub.example.test";
  assert.equal(isAllowedSpsWorkspaceNavigation("https://hub.example.test/CMP/dashboard", hub), true);
  assert.equal(isAllowedSpsWorkspaceNavigation("https://other.example.test/api", hub), false);
});

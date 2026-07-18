import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpsSetupWindowPreferences,
  createSpsWorkspaceWindowPreferences,
  isAllowedSpsWorkspaceNavigation,
} from "../src/window-security.mjs";

test("keeps the Desktop preload bridge out of remote SPS Hub windows", () => {
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

test("keeps remote workspace navigation on the configured Hub", () => {
  const hub = "https://hub.example.test";
  assert.equal(isAllowedSpsWorkspaceNavigation("https://hub.example.test/CMP/dashboard", hub), true);
  assert.equal(isAllowedSpsWorkspaceNavigation("https://other.example.test/api", hub), false);
});

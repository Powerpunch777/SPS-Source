import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpsSetupWindowPreferences,
  createSpsWorkspaceWindowPreferences,
  isAllowedSpsWorkspaceNavigation,
  normalizeSpsExternalUrl,
  requireSpsExternalUrl,
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

test("allows secure external URLs, mail links, and loopback HTTP", () => {
  assert.equal(normalizeSpsExternalUrl("https://example.test/docs"), "https://example.test/docs");
  assert.equal(normalizeSpsExternalUrl("mailto:team@example.test?subject=SPS"), "mailto:team@example.test?subject=SPS");
  assert.equal(normalizeSpsExternalUrl("http://localhost:31310/CMP"), "http://localhost:31310/CMP");
  assert.equal(normalizeSpsExternalUrl("http://127.0.0.1:31310/CMP"), "http://127.0.0.1:31310/CMP");
  assert.equal(normalizeSpsExternalUrl("http://[::1]:31310/CMP"), "http://[::1]:31310/CMP");
});

test("blocks unsafe schemes, remote HTTP, and URL credentials", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,<h1>SPS</h1>",
    "file:///C:/Windows/System32/calc.exe",
    "sps://example.test/invite",
    "http://example.test/invite",
    "https://user:password@example.test/private",
    "mailto://user:password@example.test",
  ]) {
    assert.equal(normalizeSpsExternalUrl(value), null, value);
    assert.throws(() => requireSpsExternalUrl(value), /unsafe external URL/);
  }
});

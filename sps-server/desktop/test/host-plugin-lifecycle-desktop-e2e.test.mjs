import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const harnessPath = path.join(desktopRoot, "scripts", "smoke-host-plugin-lifecycle-desktop.mjs");
const fixturePath = path.join(desktopRoot, "scripts", "fixtures", "deterministic-marketplace-acp.mjs");

test("Host plugin lifecycle Desktop E2E uses real UI controls and keeps Marketplace/Builder side-effect free", async () => {
  const harness = await readFile(harnessPath, "utf8");
  assert.match(harness, /SPS_DESKTOP_E2E_BINARY/);
  assert.match(harness, /mockIdentity/);
  assert.match(harness, /#start-sps-account|Sign in/);
  assert.match(harness, /#create-owner-server|Create/);
  assert.match(harness, /company\/settings\/instance\/plugins/);
  assert.match(harness, /Install Plugin/);
  assert.match(harness, /Start and use/);
  assert.match(harness, /Stop using/);
  assert.match(harness, /re-enable/i);
  assert.match(harness, /Uninstall Plugin/);
  assert.match(harness, /Uninstall and keep summaries/);
  assert.match(harness, /Cancel/);
  assert.match(harness, /Marketplace/);
  assert.match(harness, /Open secure install review/);
  assert.match(harness, /Stage for review/);
  assert.match(harness, /Apply this exact reviewed plugin version/);
  assert.match(harness, /assistantLifecycleUnchanged/);
  assert.match(harness, /Marketplace Assistant message send/);
  assert.match(harness, /deterministic-marketplace-acp\.mjs/);
  assert.match(harness, /Deterministic Marketplace Assistant response/);
  assert.match(harness, /--live-agent/);
  assert.match(harness, /Plugin Builder surface/);
  assert.match(harness, /lifecycleBeforeWorkspaceActions/);
  assert.match(harness, /Review update/);
  assert.match(harness, /approve-capabilities-/);
  assert.match(harness, /Approve and apply update/);
  assert.match(harness, /productionAfter/);
  assert.doesNotMatch(harness, /fetch\([^\n]+\/api\/plugins\/(?:install|enable|disable|uninstall)/i, "Lifecycle mutation must not be performed by API from the E2E harness.");
  assert.doesNotMatch(harness, /method:\s*["'](?:POST|PUT|DELETE)["'][^\n]+plugins/i, "The harness must reserve lifecycle changes for visible UI controls.");
  assert.doesNotMatch(harness, /ipcMain|E2E-only IPC|test-only IPC/i);
});

test("required Host lifecycle E2E uses a deterministic ACP fixture with Marketplace MCP injection", async () => {
  const fixture = await readFile(fixturePath, "utf8");
  const manifest = JSON.parse(await readFile(path.join(desktopRoot, "package.json"), "utf8"));
  assert.match(fixture, /session\/new/);
  assert.match(fixture, /sps-marketplace/);
  assert.match(fixture, /agent_message_chunk/);
  assert.doesNotMatch(manifest.scripts["test:e2e:host-plugin-lifecycle"], /--live-agent/);
  assert.match(manifest.scripts["test:e2e:host-plugin-lifecycle:live"], /--live-agent/);
});

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
  assert.match(harness, /SPS_DESKTOP_E2E_HOST_READY_TIMEOUT_MS/);
  assert.match(harness, /parseE2eHostReadyTimeout/);
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
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");
  const manifest = JSON.parse(await readFile(path.join(desktopRoot, "package.json"), "utf8"));
  assert.match(fixture, /session\/new/);
  assert.match(fixture, /sps-marketplace/);
  assert.match(fixture, /spawn\(marketplaceServer\.command/);
  assert.match(fixture, /request\("tools\/call"/);
  assert.match(fixture, /search_marketplace_plugins/);
  assert.match(fixture, /search_marketplace_plugins result:/);
  assert.match(fixture, /returned an MCP error\$\{text/);
  assert.match(fixture, /agent_message_chunk/);
  assert.match(main, /SPS_MARKETPLACE_MCP_ENTRY:\s*path\.join\(/);
  assert.match(main, /"@sps",\s*\n\s*"mcp-server"/);
  assert.doesNotMatch(manifest.scripts["test:e2e:host-plugin-lifecycle"], /--live-agent/);
  assert.match(manifest.scripts["test:e2e:host-plugin-lifecycle:live"], /--live-agent/);
});

test("deterministic Host lifecycle E2E wires isolated synthetic Codex auth to its pinned local fixture", async () => {
  const harness = await readFile(harnessPath, "utf8");
  const fixture = await readFile(fixturePath, "utf8");
  assert.match(harness, /deterministicAgentCommand = `"\$\{process\.execPath\}" "\$\{deterministicAcp\}"`/);
  assert.match(harness, /syntheticOpenAiApiKey = "sk-test-sps-e2e-not-valid-for-provider"/);
  assert.match(harness, /syntheticCodexHome = liveAgent \? null : path\.join\(temporaryRoot, "synthetic-codex-home"\)/);
  assert.match(harness, /writeFile\(path\.join\(syntheticCodexHome, "auth\.json"\)/);
  assert.match(harness, /JSON\.stringify\(\{\s*OPENAI_API_KEY: syntheticOpenAiApiKey,/);
  assert.doesNotMatch(harness, /auth_mode\s*:/);
  assert.match(harness, /CODEX_HOME: codexHome/);
  assert.match(harness, /agentCommand: deterministicAgentCommand, env: \{ OPENAI_API_KEY: syntheticOpenAiApiKey \}/);
  assert.doesNotMatch(harness, /env: \{ CODEX_HOME: syntheticCodexHome \}/);
  assert.match(harness, /isolatedDeterministicEnvironment\(syntheticCodexHome\)/);
  assert.doesNotMatch(harness, /\b(?:HOME|USERPROFILE):\s*temporaryHome/);
  assert.match(harness, /credentialEnvironmentName\.test\(name\)/);
  const credentialPattern = harness.match(/const credentialEnvironmentName = (\/[^;\n]+\/[a-z]*);/)?.[1];
  assert.ok(credentialPattern, "Deterministic E2E must define a credential environment filter.");
  const patternEnd = credentialPattern.lastIndexOf("/");
  const credentialEnvironmentName = new RegExp(credentialPattern.slice(1, patternEnd), credentialPattern.slice(patternEnd + 1));
  for (const name of ["OPENAI_API_KEY", "CODEX_AUTH_TOKEN", "AWS_SECRET_ACCESS_KEY"]) {
    assert.equal(credentialEnvironmentName.test(name), true, `${name} must not reach the deterministic E2E process.`);
  }
  for (const name of ["PATH", "HOME", "USERPROFILE", "CI"]) {
    assert.equal(credentialEnvironmentName.test(name), false, `${name} must remain available to the deterministic E2E process.`);
  }
  assert.match(harness, /managedCodexHome\?\.type, "plain"/);
  assert.match(harness, /managedHomeRelative = path\.relative\(userData, managedCodexHome\.value\)/);
  assert.match(harness, /path\.join\("companies", company\.id, "agents", lifecycleAgent\.id, "codex-home"\)/);
  assert.match(fixture, /spawn\(marketplaceServer\.command[\s\S]*?shell: false/);
  assert.doesNotMatch(fixture, /spawn\(\s*["']codex(?:\.exe)?["']/i);
});

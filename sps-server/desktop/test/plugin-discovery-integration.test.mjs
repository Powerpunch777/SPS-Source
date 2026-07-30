import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import manifest from "../../sps-plugin-discovery/dist/manifest.js";
import { inspectSpsExtensionProfileV2 } from "../../../external/sps-plugin-sdk/profile/extension-profile-v2.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const serverRoot = path.resolve(desktopRoot, "..");

test("Plugin Discovery is a neutral, valid SPS tool provider", () => {
  const profile = inspectSpsExtensionProfileV2(manifest);
  assert.equal(profile.valid, true, profile.errors.join("\n"));
  assert.equal(manifest.agentPlatform.kind, "tool_provider");
  assert.deepEqual(manifest.sps, { contractVersion: "2.0", primitives: [] });
  assert.equal(manifest.companyActivation?.defaultEnabled, true);
  assert.deepEqual(manifest.capabilities, [
    "agent.tools.register",
    "agents.read",
    "agent.sessions.create",
    "agent.sessions.list",
    "agent.sessions.send",
    "agent.sessions.close",
    "registry.catalog.read",
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register",
    "ui.sidebar.register",
  ]);
  assert.equal(manifest.ui?.slots?.find((slot) => slot.type === "page")?.routePath, "discover");
  assert.equal(manifest.entrypoints.ui, "./dist/ui-v0.3.0");
  assert.deepEqual(manifest.tools.map((tool) => tool.name), ["search-sps-extensions", "draft-sps-extension"]);
});

test("Desktop packages Plugin Discovery and gives it only a catalog snapshot path", async () => {
  const [runtimeBuild, ownerHost, smoke] = await Promise.all([
    readFile(path.join(desktopRoot, "scripts", "prepare-owner-host-runtime.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "src", "owner-host.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "scripts", "smoke-packaged-owner-host-runtime.mjs"), "utf8"),
  ]);
  assert.match(runtimeBuild, /"sps-plugin-discovery"/);
  assert.match(ownerHost, /"sps-plugin-discovery", "package\.json"/);
  assert.match(smoke, /SPS_PLUGIN_DISCOVERY_CATALOG_PATH/);
  assert.match(smoke, /assertPluginDiscoveryPlugin/);
  assert.match(smoke, /assertPluginDiscoveryBridge/);
  assert.match(smoke, /discovery-workspace/);
  assert.match(smoke, /Select an available Assistant/);
  assert.match(smoke, /keep only Plugin Discovery enabled for a new Workspace/);
  assert.match(smoke, /legacy built-in-agent API available/);
  assert.match(smoke, /SPS_CORE_BASELINE_MODE: "true"/);
  assert.match(smoke, /conversation assets were not bundled/);
  assert.match(await readFile(path.join(serverRoot, "sps-plugin-discovery", "dist", "ui-v0.3.0", "index.js"), "utf8"), /PluginDiscoveryPage/);
  assert.match(await readFile(path.join(serverRoot, "sps-plugin-discovery", "dist", "conversation.js"), "utf8"), /createDiscoveryConversationService/);
  assert.match(await readFile(path.join(serverRoot, "sps-plugin-discovery", "package.json"), "utf8"), /sps-plugin-discovery/);
});

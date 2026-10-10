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

test("Plugin Builder is a neutral, lifecycle-free SPS tool provider", () => {
  const profile = inspectSpsExtensionProfileV2(manifest);
  assert.equal(profile.valid, true, profile.errors.join("\n"));
  assert.equal(manifest.agentPlatform.kind, "tool_provider");
  assert.deepEqual(manifest.sps, { contractVersion: "2.0", primitives: [] });
  assert.equal(manifest.companyActivation?.defaultEnabled, true);
  assert.deepEqual(manifest.capabilities, [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register",
  ]);
  assert.equal(manifest.displayName, "Plugin Builder");
  assert.equal(manifest.ui?.slots?.find((slot) => slot.type === "page")?.routePath, "builder");
  assert.equal(manifest.ui?.slots?.some((slot) => slot.type === "companySettingsPage"), false);
  assert.equal(manifest.ui?.slots?.some((slot) => slot.type === "sidebar"), false);
  assert.equal(manifest.entrypoints.ui, "./dist/ui-v0.4.0");
  assert.deepEqual(manifest.tools.map((tool) => tool.name), [
    "create-sps-plugin-project",
    "run-sps-authoring-step",
    "inspect-sps-plugin-build",
    "open-sps-plugin-preview",
    "create-sps-plugin-package",
  ]);
  assert.equal(manifest.capabilities.some((capability) => capability.startsWith("plugin.lifecycle.")), false);
  assert.equal(manifest.tools.some((tool) => /install|enable|activate|update|disable|remove|lifecycle/i.test(tool.name)), false);
});

test("Desktop packages Plugin Builder without Marketplace or lifecycle authority", async () => {
  const [runtimeBuild, ownerHost, smoke, builderBuild, builderPackage, desktopMain] = await Promise.all([
    readFile(path.join(desktopRoot, "scripts", "prepare-owner-host-runtime.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "src", "owner-host.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "scripts", "smoke-packaged-owner-host-runtime.mjs"), "utf8"),
    readFile(path.join(serverRoot, "sps-plugin-discovery", "scripts", "build.mjs"), "utf8"),
    readFile(path.join(serverRoot, "sps-plugin-discovery", "package.json"), "utf8"),
    readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8"),
  ]);
  assert.match(runtimeBuild, /"sps-plugin-discovery"/);
  assert.match(ownerHost, /"sps-plugin-discovery", "package\.json"/);
  assert.match(desktopMain, /SPS_MARKETPLACE_CATALOG_PATH: discoveryCatalog\.catalogPath/);
  assert.doesNotMatch(desktopMain, /SPS_PLUGIN_DISCOVERY_CATALOG_PATH/);
  assert.match(desktopMain, /const discoveryPluginPath = app\.isPackaged && packagedDiscoveryPluginPath/);
  assert.doesNotMatch(smoke, /SPS_PLUGIN_DISCOVERY_CATALOG_PATH/);
  assert.match(smoke, /assertPluginBuilderPlugin/);
  assert.match(smoke, /assertPluginBuilderBridge/);
  assert.match(smoke, /plugin-builder-workspace/);
  assert.match(smoke, /keep only Plugin Builder enabled for a new Workspace/);
  assert.match(smoke, /legacy built-in-agent API available/);
  assert.match(smoke, /SPS_CORE_BASELINE_MODE: "true"/);
  assert.match(smoke, /ui-v0\.4\.0/);
  assert.match(await readFile(path.join(serverRoot, "sps-plugin-discovery", "dist", "ui-v0.4.0", "index.js"), "utf8"), /PluginBuilderPage/);
  assert.match(await readFile(path.join(serverRoot, "sps-plugin-discovery", "package.json"), "utf8"), /sps-plugin-discovery/);
  assert.match(builderBuild, /from "esbuild"/);
  assert.doesNotMatch(builderBuild, /external[\\/]sps-core|@paperclipai[\\/]core/);
  assert.match(builderPackage, /"esbuild"/);
});

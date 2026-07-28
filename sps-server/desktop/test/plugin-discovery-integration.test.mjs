import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import manifest from "../../sps-plugin-discovery/dist/manifest.js";
import { inspectSpsExtensionProfile } from "../../../external/sps-plugin-sdk/profile/extension-profile-v1.mjs";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testDirectory, "..");
const serverRoot = path.resolve(desktopRoot, "..");

test("Plugin Discovery is a neutral, valid SPS tool provider", () => {
  const profile = inspectSpsExtensionProfile(manifest);
  assert.equal(profile.valid, true, profile.errors.join("\n"));
  assert.equal(manifest.agentPlatform.kind, "tool_provider");
  assert.deepEqual(manifest.capabilities, ["agent.tools.register"]);
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
  assert.match(await readFile(path.join(serverRoot, "sps-plugin-discovery", "package.json"), "utf8"), /sps-plugin-discovery/);
});

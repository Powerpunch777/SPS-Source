import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import manifest from "../dist/manifest.js";

const workerBundle = await readFile(new URL("../dist/worker.js", import.meta.url), "utf8");

assert.equal(manifest.id, "sps.plugin-discovery");
assert.equal(manifest.agentPlatform?.kind, "tool_provider");
assert.equal(manifest.companyActivation?.defaultEnabled, true);
assert.ok(manifest.capabilities.includes("agent.tools.register"));
assert.ok(manifest.capabilities.includes("ui.page.register"));
assert.ok(manifest.entrypoints.ui);
assert.equal(manifest.ui?.slots?.find((slot) => slot.type === "page")?.routePath, "builder");
assert.equal(manifest.ui?.slots?.find((slot) => slot.type === "page")?.exportName, "PluginBuilderPage");
assert.equal(manifest.ui?.workspaceShell, undefined);
assert.equal(manifest.ui?.dashboardWidgets, undefined);
assert.equal(manifest.ui?.slots?.some((slot) => slot.type === "companySettingsPage"), false);
assert.equal(manifest.ui?.slots?.some((slot) => slot.type === "sidebar"), false);
assert.deepEqual(manifest.tools.map((tool) => tool.name), [
  "create-sps-plugin-project",
  "run-sps-authoring-step",
  "inspect-sps-plugin-build",
  "open-sps-plugin-preview",
  "create-sps-plugin-package",
  "builder-delegate-worker",
  "builder-worker-result",
]);
assert.match(manifest.tools.find((tool) => tool.name === "create-sps-plugin-project")?.description ?? "", /does not install or activate/i);
assert.match(manifest.tools.find((tool) => tool.name === "open-sps-plugin-preview")?.description ?? "", /does not affect the production Workspace/i);
assert.match(manifest.tools.find((tool) => tool.name === "create-sps-plugin-package")?.description ?? "", /never installs/i);
assert.ok(manifest.tools.every((tool) => !/search|recommend|install|activate|update|disable|remove|delete/i.test(tool.name)));
assert.doesNotMatch(
  workerBundle,
  /(?:from\s+|import\s*\()\s*["']@paperclipai\//,
  "Plugin Builder Worker must bundle its private first-party runtime dependencies.",
);
console.log("SPS Plugin Builder manifest verification passed.");

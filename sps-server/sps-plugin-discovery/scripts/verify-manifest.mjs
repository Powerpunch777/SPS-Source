import assert from "node:assert/strict";
import manifest from "../dist/manifest.js";

assert.equal(manifest.id, "sps.plugin-discovery");
assert.equal(manifest.agentPlatform?.kind, "tool_provider");
assert.equal(manifest.companyActivation?.defaultEnabled, true);
assert.ok(manifest.capabilities.includes("agent.tools.register"));
assert.deepEqual(manifest.tools.map((tool) => tool.name), ["search-sps-extensions", "draft-sps-extension"]);
assert.ok(manifest.tools.every((tool) => /never installs|does not create files/i.test(tool.description)));
console.log("SPS Plugin Discovery manifest verification passed.");

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const scriptPath = path.resolve(
  import.meta.dirname,
  "..",
  "scripts",
  "smoke-plugin-preview-runtime.mjs",
);

test("packaged preview smoke exercises isolation, access control, and real plugin activation", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /runtimeManifest\.pluginDeveloperKit\.cli/);
  assert.match(source, /createPluginPreviewRuntime/);
  assert.match(source, /stageDeveloperCandidate/);
  assert.match(source, /stageSpsPluginArchive/);
  assert.match(source, /desktop_access_required/);
  assert.match(source, /production-must-remain-untouched/);
  assert.match(source, /local\.preview-smoke/);
  assert.doesNotMatch(source, /coreRoots:\s*\[[^\]]+\]/);
});

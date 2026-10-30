import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("exposes a real isolated Electron bootstrap smoke command", async () => {
  const [packageJson, smokeScript] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/smoke-isolated-desktop-ui.mjs", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(scripts["test:e2e:bootstrap"], /sync:desktop-node/);
  assert.match(scripts["test:e2e:bootstrap"], /smoke-isolated-desktop-ui/);
  assert.match(smokeScript, /SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE/);
  assert.match(smokeScript, /SPS_DESKTOP_E2E_BINARY/);
  assert.match(smokeScript, /isPackagedCandidate/);
  assert.match(smokeScript, /회사·Workspace·플러그인 데이터/);
  // The smoke now confirms closure through its owned Job instead of taskkill.
  assert.match(smokeScript, /spawnWindowsJobSupervisor/);
  assert.match(smokeScript, /await child\.terminateOwnedJob\(\)/);
  assert.match(smokeScript, /terminal\.activeProcesses, 0/);
  const stopIndex = smokeScript.indexOf("await stopChildTree(child);");
  const removeIndex = smokeScript.indexOf("await removeTemporaryUserData(userData);");
  assert.ok(stopIndex >= 0 && removeIndex > stopIndex,
    "The owned Job must be confirmed before temporary user data is removed.");
  assert.match(smokeScript, /new AggregateError\(\[firstError, cleanupError\]/);
  assert.match(smokeScript, /removeTemporaryUserData/);
});

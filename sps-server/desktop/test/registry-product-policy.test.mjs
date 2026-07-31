import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(testRoot, "..");

test("keeps first-release Registry UI and IPC limited to Official plus local development sources", async () => {
  const [html, renderer, main] = await Promise.all([
    readFile(path.join(desktopRoot, "renderer", "registry.html"), "utf8"),
    readFile(path.join(desktopRoot, "renderer", "registry.mjs"), "utf8"),
    readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8"),
  ]);

  assert.match(html, /Add local development Registry/);
  assert.doesNotMatch(html, /value="git"|value="official"|remote-source-fields|source-index-url/);
  assert.doesNotMatch(renderer, /source-kind|trustedRootKeyId|trustedRootPublicKey/);
  assert.match(main, /currently accepts only Owner-selected local development Registries/);
});

test("uses the narrow Host proof for native Registry and Vault actions", async () => {
  const main = await readFile(path.join(desktopRoot, "src", "main.mjs"), "utf8");

  assert.match(main, /async function stageRegistryPluginFromFilePicker\(\)[\s\S]*?\/plugins\/registry\/stages[\s\S]*?ownerBootstrap: true/);
  assert.match(main, /async function stageDesktopRegistryRelease[\s\S]*?\/plugins\/registry\/stages[\s\S]*?ownerBootstrap: true/);
  assert.match(main, /async function enableDesktopRegistryStage[\s\S]*?ownerBootstrap: true/);
  assert.match(main, /async function listDesktopRegistryStages[\s\S]*?ownerBootstrap: true/);
  assert.match(main, /async function showRegistryPluginStages[\s\S]*?ownerBootstrap: true/);
  assert.match(main, /async function exportOwnerVaultTransfer[\s\S]*?\/instance\/database-backups[\s\S]*?ownerBootstrap: true/);
});

test("shows canonical development diagnostics and conformance evidence in Registry", async () => {
  const [html, renderer] = await Promise.all([
    readFile(path.join(desktopRoot, "renderer", "registry.html"), "utf8"),
    readFile(path.join(desktopRoot, "renderer", "registry.mjs"), "utf8"),
  ]);

  for (const category of ["manifest", "capability", "tool", "event", "job", "run", "stream", "connector", "mcp", "migration", "backup", "rollback", "visibility"]) {
    assert.match(html, new RegExp(`<option value="${category}">`));
  }
  assert.match(renderer, /function developerConformanceMarkup/);
  assert.match(renderer, /<dt>Conformance<\/dt>/);
});

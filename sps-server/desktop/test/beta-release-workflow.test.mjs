import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(testDirectory, "..");
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");

test("keeps the unsigned Desktop Beta release separate from the signed release channel", async () => {
  const [manifestText, workflow] = await Promise.all([
    readFile(path.join(desktopDirectory, "package.json"), "utf8"),
    readFile(path.join(repositoryDirectory, ".github", "workflows", "sps-desktop-beta-release.yml"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.match(manifest.scripts["release:beta:win"], /--config\.publish\.releaseType=prerelease/);
  assert.doesNotMatch(manifest.scripts["release:beta:win"], /forceCodeSigning/);
  assert.match(workflow, /desktop-beta-v\*/);
  assert.match(workflow, /desktop-beta-v\$\(\$manifest\.version\)/);
  assert.match(workflow, /SPS_DESKTOP_RELEASES_TOKEN is required/);
  assert.doesNotMatch(workflow, /SPS_WINDOWS_CSC_LINK/);
  assert.match(workflow, /submodules: recursive/);
  assert.match(workflow, /working-directory: external\/sps-core/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm --filter @paperclipai\/plugin-sdk run build/);
  assert.match(workflow, /pnpm --filter "@paperclipai\/adapter-\*" run build/);
  assert.match(workflow, /pnpm --filter paperclipai run build/);
  assert.match(workflow, /npm run release:beta:win/);
});

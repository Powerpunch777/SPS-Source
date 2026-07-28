import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(testDirectory, "..");

test("builds and bundles the static Core Workspace UI with the Owner Host runtime", async () => {
  const buildScript = await readFile(path.join(desktopDirectory, "scripts", "prepare-owner-host-runtime.mjs"), "utf8");
  assert.match(buildScript, /prepare-server-ui-dist\.mjs/);
  assert.match(buildScript, /serverUiDist/);
  assert.match(buildScript, /path\.join\(runtimeRoot, "ui-dist"\)/);
  assert.match(buildScript, /writeSpsReleaseBaseline/);
  assert.match(buildScript, /releaseBaseline/);
  assert.match(buildScript, /PAPERCLIP_HOST_VERSION/);
  assert.match(buildScript, /pnpm-cli-shim/);
  assert.match(buildScript, /environment\.PATH/);
});

test("smoke test proves the packaged Owner Host serves its Workspace UI", async () => {
  const smokeScript = await readFile(path.join(desktopDirectory, "scripts", "smoke-packaged-owner-host-runtime.mjs"), "utf8");
  assert.match(smokeScript, /assertStaticWorkspaceUi/);
  assert.match(smokeScript, /<title>SPS<\/title>/);
  assert.match(smokeScript, /sps-release-baseline\.json/);
  assert.match(smokeScript, /runtimeManifest\.format < 7/);
});

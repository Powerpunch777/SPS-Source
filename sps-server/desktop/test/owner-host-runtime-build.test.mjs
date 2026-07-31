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
  assert.match(buildScript, /packages", "db"/);
  assert.match(buildScript, /"run", "build"/);
  assert.match(buildScript, /SQL migrations into dist\/migrations/);
  assert.match(buildScript, /packages", "shared", "tsconfig\.json/);
  assert.match(buildScript, /\[tscCli, "-p", sharedTsconfig\]/);
  assert.match(buildScript, /adapterUtilsTsconfig/);
  assert.match(buildScript, /codexAdapterTsconfig/);
  assert.match(buildScript, /claudeAdapterTsconfig/);
  assert.match(buildScript, /serverUiDist/);
  assert.match(buildScript, /path\.join\(runtimeRoot, "ui-dist"\)/);
  assert.match(buildScript, /writeSpsReleaseBaseline/);
  assert.match(buildScript, /releaseBaseline/);
  assert.match(buildScript, /PAPERCLIP_HOST_VERSION/);
  assert.match(buildScript, /pnpm-cli-shim/);
  assert.match(buildScript, /environment\.PATH/);
  assert.match(buildScript, /prepareAgentRuntimePacks/);
  assert.match(buildScript, /codex-acp/);
  assert.match(buildScript, /claude-acp/);
  assert.match(buildScript, /sps-agent-runtime-pack\.json/);
  assert.match(buildScript, /copyBundledSpsPluginDeveloperKit/);
  assert.match(buildScript, /@sonparkserver", "plugin-sdk", "cli", "sps-plugin\.mjs/);
  assert.match(buildScript, /pluginDeveloperKit/);
});

test("uses a cross-platform DB migration copy step for Windows Desktop builds", async () => {
  const packageManifest = JSON.parse(await readFile(
    path.resolve(desktopDirectory, "..", "..", "external", "sps-core", "packages", "db", "package.json"),
    "utf8",
  ));
  const copyScript = await readFile(
    path.resolve(desktopDirectory, "..", "..", "external", "sps-core", "packages", "db", "scripts", "copy-migrations.mjs"),
    "utf8",
  );

  assert.match(packageManifest.scripts.build, /node scripts\/copy-migrations\.mjs/);
  assert.match(copyScript, /await cp\(sourceDirectory, destinationDirectory/);
  assert.doesNotMatch(packageManifest.scripts.build, /\bcp -r\b/);
});

test("uses normal installer compression from the Desktop build contract", async () => {
  const packageManifest = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
  assert.equal(packageManifest.build.compression, "normal");
});

test("smoke test proves the packaged Owner Host remains Desktop-only while serving its Workspace UI", async () => {
  const smokeScript = await readFile(path.join(desktopDirectory, "scripts", "smoke-packaged-owner-host-runtime.mjs"), "utf8");
  assert.match(smokeScript, /assertStaticWorkspaceUi/);
  assert.match(smokeScript, /assertDesktopOnlyBoundary/);
  assert.match(smokeScript, /SPS_DESKTOP_ACCESS_TOKEN/);
  assert.match(smokeScript, /<title>SPS<\/title>/);
  assert.match(smokeScript, /sps-release-baseline\.json/);
  assert.match(smokeScript, /runtimeManifest\.format < 8/);
});

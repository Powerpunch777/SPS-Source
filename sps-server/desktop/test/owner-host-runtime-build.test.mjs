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
  assert.match(buildScript, /marketplaceMcpTsconfig/);
  assert.match(buildScript, /packages", "mcp-server", "tsconfig\.json/);
  assert.match(buildScript, /\[tscCli, "-p", marketplaceMcpTsconfig\]/);
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

test("keeps the Marketplace MCP stdio runtime in the Owner Host package contract", async () => {
  const buildScript = await readFile(path.join(desktopDirectory, "scripts", "prepare-owner-host-runtime.mjs"), "utf8");
  const verifierScript = await readFile(path.join(desktopDirectory, "scripts", "verify-packaged-owner-host-runtime.mjs"), "utf8");
  const serverManifest = JSON.parse(await readFile(
    path.resolve(desktopDirectory, "..", "..", "external", "sps-core", "server", "package.json"),
    "utf8",
  ));
  const mcpManifest = JSON.parse(await readFile(
    path.resolve(desktopDirectory, "..", "..", "external", "sps-core", "packages", "mcp-server", "package.json"),
    "utf8",
  ));

  assert.equal(serverManifest.dependencies["@sps/mcp-server"], "workspace:*");
  assert.equal(mcpManifest.name, "@sps/mcp-server");
  assert.equal(mcpManifest.bin["sps-marketplace-assistant-mcp"], "./dist/marketplace-assistant-stdio.js");
  assert.match(buildScript, /marketplaceMcpTsconfig/);
  assert.match(buildScript, /\[tscCli, "-p", marketplaceMcpTsconfig\]/);
  assert.match(buildScript, /"deploy"/);
  assert.match(buildScript, /runtimeRoot/);
  assert.match(verifierScript, /node_modules\/\@sps\/mcp-server\/package\.json/);
  assert.match(verifierScript, /node_modules\/\@sps\/mcp-server\/dist\/marketplace-assistant-stdio\.js/);
});

test("runs the bundled Marketplace MCP protocol in every Windows package pipeline", async () => {
  const packageManifest = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
  const smokeScript = await readFile(
    path.join(desktopDirectory, "scripts", "smoke-packaged-marketplace-mcp-runtime.mjs"),
    "utf8",
  );

  for (const scriptName of ["package:win", "release:win", "package:candidate:win"]) {
    assert.match(packageManifest.scripts[scriptName], /smoke:packaged-marketplace-mcp-runtime/);
  }
  assert.match(smokeScript, /new StdioClientTransport/);
  assert.match(smokeScript, /command: process\.platform === "win32" \? "node\.exe"/);
  assert.match(smokeScript, /SPS_MARKETPLACE_MCP_NODE/);
  assert.match(smokeScript, /search_marketplace_plugins/);
  assert.match(smokeScript, /get_marketplace_plugin/);
  assert.match(smokeScript, /packaged-scoped-token/);
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

test("packages the managed Windows PostgreSQL Unicode-path compatibility patch", async () => {
  const coreRoot = path.resolve(desktopDirectory, "..", "..", "external", "sps-core");
  const buildScript = await readFile(path.join(desktopDirectory, "scripts", "prepare-owner-host-runtime.mjs"), "utf8");
  const verifierScript = await readFile(path.join(desktopDirectory, "scripts", "verify-packaged-owner-host-runtime.mjs"), "utf8");
  const workspace = await readFile(path.join(coreRoot, "pnpm-workspace.yaml"), "utf8");
  const nativePatch = await readFile(
    path.join(coreRoot, "patches", "@embedded-postgres__windows-x64@18.1.0-beta.16.patch"),
    "utf8",
  );
  const serverEntry = await readFile(path.join(coreRoot, "server", "src", "index.ts"), "utf8");

  assert.match(workspace, /@embedded-postgres\/windows-x64@18\.1\.0-beta\.16/);
  assert.match(nativePatch, /SPS_EMBEDDED_POSTGRES_BINARY_DIR/);
  assert.match(buildScript, /installWindowsPostgresUnicodePathCompatibility/);
  assert.match(buildScript, /Unsupported @embedded-postgres\/windows-x64 version/);
  assert.match(buildScript, /windowsPostgresUnicodePathCompatibility/);
  assert.match(verifierScript, /missing Windows PostgreSQL Unicode-path compatibility/);
  assert.ok(
    serverEntry.indexOf("await prepareEmbeddedPostgresNativeRuntime()")
      < serverEntry.indexOf("const mod = await import(moduleName)"),
    "Core must derive the Windows native path before importing embedded-postgres.",
  );
});

test("uses a fast-extract ZIP payload for the Desktop installer", async () => {
  const packageManifest = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
  assert.equal(packageManifest.build.compression, "normal");
  assert.equal(packageManifest.build.nsis.useZip, true);
  assert.equal(packageManifest.build.nsis.differentialPackage, false);
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

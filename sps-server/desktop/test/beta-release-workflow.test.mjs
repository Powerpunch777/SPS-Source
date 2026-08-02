import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(testDirectory, "..");
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");

test("keeps the unsigned Desktop candidate inside Actions and outside the update repository", async () => {
  const [manifestText, workflow] = await Promise.all([
    readFile(path.join(desktopDirectory, "package.json"), "utf8"),
    readFile(path.join(repositoryDirectory, ".github", "workflows", "sps-desktop-beta-release.yml"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.match(manifest.scripts["package:candidate:win"], /electron-builder --win nsis --publish never/);
  assert.match(manifest.scripts["package:candidate:win"], /create-release-manifest\.mjs/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /verify:\s*\r?\n\s*uses: \.\/\.github\/workflows\/sps-verify\.yml/);
  assert.match(workflow, /build-and-publish-beta:[\s\S]*?needs: verify/);
  assert.doesNotMatch(workflow, /desktop-beta-v\*/);
  assert.doesNotMatch(workflow, /SPS_DESKTOP_RELEASES_TOKEN/);
  assert.doesNotMatch(workflow, /gh release/);
  assert.match(workflow, /submodules: recursive/);
  assert.match(workflow, /working-directory: external\/sps-core/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /pnpm --filter @paperclipai\/plugin-sdk run build/);
  assert.match(workflow, /pnpm --filter "@paperclipai\/adapter-\*" run build/);
  assert.match(workflow, /pnpm --filter @paperclipai\/hermes-paperclip-adapter run build/);
  assert.match(workflow, /pnpm --filter paperclipai run build/);
  assert.match(workflow, /npm run package:candidate:win/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /sps-release-manifest\.json/);
  assert.match(workflow, /SPS-Agent-Runtime-Pack-\*\.zip/);
  assert.match(workflow, /sps-agent-runtime-packs\.json/);
});

test("requires the complete SPS verification gate before packaging a pilot", async () => {
  const workflow = await readFile(
    path.join(repositoryDirectory, ".github", "workflows", "sps-desktop-pilot.yml"),
    "utf8",
  );

  assert.match(workflow, /verify:\s*\r?\n\s*uses: \.\/\.github\/workflows\/sps-verify\.yml/);
  assert.match(workflow, /package-pilot:[\s\S]*?needs: verify/);
  assert.match(workflow, /npm run package:candidate:win/);
});

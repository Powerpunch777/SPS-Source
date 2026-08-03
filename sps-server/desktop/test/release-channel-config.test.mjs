import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(testDirectory, "..");
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");

test("keeps the unified SPS Desktop release on its explicit stable update channel", async () => {
  const manifest = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.build.artifactName, "SPS-Desktop-Setup-${version}.${ext}");
  assert.deepEqual(manifest.build.extraResources, [
    {
      from: ".owner-host-runtime-package",
      to: "sps-owner-host-runtime-package",
    },
  ]);

  assert.deepEqual(manifest.build.publish, [{
    provider: "github",
    owner: "Powerpunch777",
    repo: "SPS-Desktop-Releases",
    releaseType: "release",
    channel: "latest",
  }]);
  assert.deepEqual(manifest.build.nsis, {
    oneClick: true,
    perMachine: false,
    deleteAppDataOnUninstall: false,
    useZip: false,
    differentialPackage: false,
  });
  assert.match(manifest.scripts["package:win"], /write-update-metadata/);
  assert.match(manifest.scripts["package:win"], /verify:packaged-owner-host-runtime/);
  assert.match(manifest.scripts["package:win"], /stage:agent-runtime-packs/);
  assert.match(manifest.scripts["package:win"], /archive:agent-runtime-packs/);
  assert.match(manifest.scripts["release:win"], /verify:packaged-owner-host-runtime/);
  assert.match(manifest.scripts["release:win"], /stage:agent-runtime-packs/);
  assert.match(manifest.scripts["release:win"], /archive:agent-runtime-packs/);
  assert.match(manifest.scripts["package:candidate:win"], /verify:packaged-owner-host-runtime/);
  assert.match(manifest.scripts["package:candidate:win"], /stage:agent-runtime-packs/);
  assert.match(manifest.scripts["package:candidate:win"], /archive:agent-runtime-packs/);
});

test("release workflow requires the official Desktop release publishing token", async () => {
  const workflow = await readFile(
    path.join(repositoryDirectory, ".github", "workflows", "sps-desktop-release.yml"),
    "utf8",
  );

  assert.match(workflow, /GH_TOKEN:\s*\$\{\{ secrets\.SPS_DESKTOP_RELEASES_TOKEN \}\}/);
  assert.match(workflow, /SPS_DESKTOP_RELEASES_TOKEN is required/);
  assert.match(workflow, /tags:\s*\r?\n\s*- "v\*"/);
  assert.match(workflow, /\$expectedTag = "v\$\(\$manifest\.version\)"/);
  assert.match(workflow, /submodules: recursive/);
  assert.match(workflow, /SPS_SOURCE_READ_TOKEN/);
  assert.match(workflow, /verify:\s*\r?\n\s*uses: \.\/\.github\/workflows\/sps-verify\.yml/);
  assert.match(workflow, /build-sign-and-publish:\s*\r?\n\s*needs: verify/);
  assert.match(workflow, /npm run release:win/);
  assert.match(workflow, /SPS_REQUIRE_CLEAN_RELEASE:\s*"1"/);
  assert.match(workflow, /SPS_RELEASE_STATUS:\s*"stable"/);
  assert.match(workflow, /Verify physical Host and Member release evidence/);
  assert.match(workflow, /secrets\.SPS_PHYSICAL_RELEASE_EVIDENCE_JSON/);
  assert.match(workflow, /SPS_PHYSICAL_EVIDENCE_PATH = \$evidencePath/);
  assert.match(workflow, /verify-physical-release-evidence\.mjs/);
  assert.match(workflow, /sps-release-manifest\.json/);
  assert.match(workflow, /SPS-Agent-Runtime-Pack-\*\.zip/);
  assert.match(workflow, /sps-agent-runtime-packs\.json/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /gh release create \$tag --repo \$releaseRepo --target main/);
  assert.match(workflow, /gh release edit \$tag --repo \$releaseRepo --draft=false --prerelease=false --latest/);
  assert.doesNotMatch(workflow, /--clobber/);
  assert.doesNotMatch(workflow, /GH_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

test("release verification includes every bundled SPS plugin", async () => {
  const workflow = await readFile(
    path.join(repositoryDirectory, ".github", "workflows", "sps-verify.yml"),
    "utf8",
  );

  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /working-directory: sps-server\/sps-default-memory/);
  assert.match(workflow, /working-directory: sps-server\/sps-plugin-discovery/);
  assert.match(workflow, /working-directory: sps-server\/sps-room-chat/);
  assert.match(workflow, /working-directory: external\/sps-plugin-sdk/);
  assert.match(workflow, /working-directory: sps-server\/desktop-node/);
  assert.match(workflow, /core-full-regression:[\s\S]*?pnpm typecheck[\s\S]*?pnpm test:run[\s\S]*?pnpm build/);
  assert.match(workflow, /identity:[\s\S]*?working-directory: sps-server\/sps-identity[\s\S]*?run: npm test/);
});

test("release verification runs every Windows Desktop E2E before publishing", async () => {
  const workflow = await readFile(
    path.join(repositoryDirectory, ".github", "workflows", "sps-verify.yml"),
    "utf8",
  );

  assert.match(workflow, /npm run test:e2e:bootstrap/);
  assert.match(workflow, /npm run prepare:owner-host-runtime/);
  assert.match(workflow, /electron-builder --win dir --publish never/);
  assert.match(workflow, /SPS_DESKTOP_E2E_BINARY:/);
  assert.match(workflow, /npm run test:e2e:workspace-surfaces/);
  assert.match(workflow, /npm run test:e2e:plugin-preview/);
  assert.match(workflow, /npm run test:e2e:host-plugin-lifecycle/);
});

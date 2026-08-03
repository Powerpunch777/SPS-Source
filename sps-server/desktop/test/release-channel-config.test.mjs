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
  assert.match(workflow, /name: Prepare SPS Desktop Release/);
  assert.match(workflow, /submodules: recursive/);
  assert.match(workflow, /SPS_SOURCE_READ_TOKEN/);
  assert.match(workflow, /verify:\s*\r?\n\s*uses: \.\/\.github\/workflows\/sps-verify\.yml/);
  assert.match(workflow, /build-sign-and-stage:\s*\r?\n\s*name: Build, sign, and stage immutable Desktop assets/);
  assert.match(workflow, /npm run release:win/);
  assert.match(workflow, /SPS_REQUIRE_CLEAN_RELEASE:\s*"1"/);
  assert.match(workflow, /SPS_RELEASE_STATUS:\s*"stable"/);
  assert.match(workflow, /sps-release-manifest\.json/);
  assert.match(workflow, /sps-release-challenge\.json/);
  assert.match(workflow, /sps-agent-runtime-packs\.json/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /GitHub did not verify the release tag signature/);
  assert.match(workflow, /pinned SPS Core revision must be reachable from its main branch/);
  assert.match(workflow, /verify-release-assets\.mjs/);
  assert.match(workflow, /gh release create \$tag --repo Powerpunch777\/SPS-Desktop-Releases --draft/);
  assert.doesNotMatch(workflow, /--draft=false/);
  assert.doesNotMatch(workflow, /GH_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);

  const publishWorkflow = await readFile(
    path.join(repositoryDirectory, ".github", "workflows", "sps-desktop-publish.yml"),
    "utf8",
  );
  assert.match(publishWorkflow, /workflow_dispatch:/);
  assert.match(publishWorkflow, /gh release download/);
  assert.match(publishWorkflow, /ref: \$\{\{ inputs\.tag \}\}/);
  assert.match(publishWorkflow, /verify-release-assets\.mjs/);
  assert.match(publishWorkflow, /SPS_REQUIRE_EXACT_RELEASE_ASSET_SET/);
  assert.match(publishWorkflow, /release-asset-snapshot\.json/);
  assert.match(publishWorkflow, /SPS_RELEASE_CHALLENGE_PATH/);
  assert.match(publishWorkflow, /verify-release-attestation\.mjs/);
  assert.match(publishWorkflow, /pinned Plugin SDK revision must be reachable from its main branch/);
  assert.match(publishWorkflow, /gh release edit "\$\{\{ inputs\.tag \}\}" --repo .* --draft=false/);
  assert.doesNotMatch(publishWorkflow, /electron-builder|npm run release:win/);
  assert.doesNotMatch(publishWorkflow, /gh release upload|--clobber/);
  assert.match(workflow, /merge-base --is-ancestor \$env:GITHUB_SHA origin\/main/);
  assert.match(publishWorkflow, /merge-base --is-ancestor \$tagCommit origin\/main/);
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

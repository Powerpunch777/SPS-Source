import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(testDirectory, "..");
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");

test("uses the separate artifact channel first and mirrors the one-time bridge release to the legacy source channel", async () => {
  const manifest = JSON.parse(await readFile(path.join(desktopDirectory, "package.json"), "utf8"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.build.artifactName, "SPS-Desktop-Setup-${version}.${ext}");
  assert.deepEqual(manifest.build.extraResources, [
    {
      from: ".owner-host-runtime",
      to: "sps-owner-host-runtime",
      filter: ["**/*"],
    },
    {
      from: ".owner-host-runtime/node_modules",
      to: "sps-owner-host-runtime/node_modules",
      filter: ["**/*"],
    },
  ]);

  assert.deepEqual(manifest.build.publish, [
    {
      provider: "github",
      owner: "Powerpunch777",
      repo: "SPS-Desktop-Releases",
      releaseType: "release",
    },
    {
      provider: "github",
      owner: "Powerpunch777",
      repo: "SPS",
      releaseType: "release",
    },
  ]);
});

test("release workflow requires the cross-repository publishing token", async () => {
  const workflow = await readFile(
    path.join(repositoryDirectory, ".github", "workflows", "sps-desktop-release.yml"),
    "utf8",
  );

  assert.match(workflow, /GH_TOKEN:\s*\$\{\{ secrets\.SPS_DESKTOP_RELEASES_TOKEN \}\}/);
  assert.match(workflow, /SPS_DESKTOP_RELEASES_TOKEN is required/);
  assert.match(workflow, /tags:\s*\r?\n\s*- "v\*"/);
  assert.match(workflow, /\$expectedTag = "v\$\(\$manifest\.version\)"/);
  assert.match(workflow, /gh release create \$tag --repo \$releaseRepo --target main/);
  assert.doesNotMatch(workflow, /GH_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

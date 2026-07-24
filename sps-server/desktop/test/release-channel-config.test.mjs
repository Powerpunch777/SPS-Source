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
  assert.equal(manifest.version, "0.4.27");

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
  assert.doesNotMatch(workflow, /GH_TOKEN:\s*\$\{\{ secrets\.GITHUB_TOKEN \}\}/);
});

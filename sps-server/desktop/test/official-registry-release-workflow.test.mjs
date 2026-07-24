import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryDirectory = path.resolve(testDirectory, "..", "..", "..");

test("publishes Official Registry artifacts only through the separate public repository", async () => {
  const workflow = await readFile(
    path.join(repositoryDirectory, ".github", "workflows", "sps-official-registry-publish.yml"),
    "utf8",
  );

  assert.match(workflow, /repository: Powerpunch777\/SPS-Official-Extensions/);
  assert.match(workflow, /token: \$\{\{ secrets\.SPS_OFFICIAL_REGISTRY_TOKEN \}\}/);
  assert.match(workflow, /REGISTRY_DIRECTORY: official-registry/);
  assert.match(workflow, /Missing SPS_OFFICIAL_REGISTRY_TOKEN/);
  assert.doesNotMatch(workflow, /actions\/deploy-pages/);
  assert.doesNotMatch(workflow, /sps-server\/website\/registry/);
});

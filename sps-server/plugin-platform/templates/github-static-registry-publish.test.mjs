import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const templatePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "github-static-registry-publish.yml");
const officialWorkflowPath = path.resolve(path.dirname(templatePath), "..", "..", "..", ".github", "workflows", "sps-official-registry-publish.yml");

test("GitHub static Registry template keeps signing and publication manual", async () => {
  const workflow = await readFile(templatePath, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request):/m);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /SPS_REGISTRY_PUBLISHER_PRIVATE_KEY/);
  assert.match(workflow, /SPS_REGISTRY_ROOT_PRIVATE_KEY/);
  assert.match(workflow, /umask 077/);
  assert.match(workflow, /sps-plugin\.mjs "\$\{args\[@\]\}"/);
  assert.match(workflow, /sps-plugin\.mjs inspect "\$REGISTRY_DIRECTORY"/);
  assert.match(workflow, /git add -- "\$REGISTRY_DIRECTORY"/);
});

test("SPS Official Registry workflow targets the separate artifact repository and remains manual", async () => {
  const workflow = await readFile(officialWorkflowPath, "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(push|pull_request):/m);
  assert.match(workflow, /REGISTRY_DIRECTORY: official-registry/);
  assert.match(workflow, /SPS_REGISTRY_PUBLISHER_PRIVATE_KEY/);
  assert.match(workflow, /SPS_REGISTRY_ROOT_PRIVATE_KEY/);
  assert.match(workflow, /SPS_OFFICIAL_REGISTRY_TOKEN/);
  assert.match(workflow, /repository: Powerpunch777\/SPS-Official-Extensions/);
  assert.match(workflow, /sps-plugin\.mjs publish-local/);
  assert.match(workflow, /sps-plugin\.mjs inspect "\$REGISTRY_DIRECTORY"/);
  assert.match(workflow, /https:\/\/raw\.githubusercontent\.com\/Powerpunch777\/SPS-Official-Extensions\/main\/registry\.json/);
  assert.match(workflow, /working-directory: official-registry/);
  assert.doesNotMatch(workflow, /pages: write/);
  assert.doesNotMatch(workflow, /actions\/deploy-pages@v4/);
});

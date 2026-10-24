import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(testDirectory, "..");
const serverDirectory = path.resolve(desktopDirectory, "..");
const repositoryDirectory = path.resolve(serverDirectory, "..");

const bundledPluginNames = ["sps-default-memory", "sps-plugin-discovery", "sps-room-chat"];
const packagingWorkflows = [
  { file: "sps-verify.yml", job: "desktop", command: "npm run prepare:owner-host-runtime" },
  { file: "sps-desktop-release.yml", job: "build-sign-and-stage", command: "npm run release:win" },
  { file: "sps-desktop-beta-release.yml", job: "build-and-publish-beta", command: "npm run package:candidate:win" },
  { file: "sps-desktop-pilot.yml", job: "package-pilot", command: "npm run package:candidate:win" },
  { file: "sps-live-agent-canary.yml", job: "live-codex-host-lifecycle", command: "npm run prepare:owner-host-runtime" },
];

test("installs bundled plugin dependencies before every Desktop runtime packaging job", async () => {
  const dependencyBearingPlugins = [];
  for (const pluginName of bundledPluginNames) {
    const pluginDirectory = path.join(serverDirectory, pluginName);
    const manifest = JSON.parse(await readFile(path.join(pluginDirectory, "package.json"), "utf8"));
    if (Object.keys(manifest.dependencies ?? {}).length + Object.keys(manifest.devDependencies ?? {}).length === 0) {
      continue;
    }

    await access(path.join(pluginDirectory, "package-lock.json"));
    dependencyBearingPlugins.push(pluginName);
  }

  for (const { file, job: jobName, command } of packagingWorkflows) {
    const workflow = yaml.load(await readFile(path.join(repositoryDirectory, ".github", "workflows", file), "utf8"));
    const steps = workflow.jobs[jobName]?.steps ?? [];
    const packagingStepIndex = steps.findIndex((step) => step.run?.includes(command));
    assert.notEqual(packagingStepIndex, -1, `${file} is missing ${command} in job ${jobName}`);

    for (const pluginName of dependencyBearingPlugins) {
      const matchingSteps = steps
        .map((step, index) => ({ step, index }))
        .filter(({ step }) => step["working-directory"] === `sps-server/${pluginName}` && step.run?.trim() === "npm ci");
      assert.equal(matchingSteps.length, 1, `${file} must install ${pluginName} exactly once in ${jobName}`);
      assert.ok(
        matchingSteps[0].index < packagingStepIndex,
        `${file} must install ${pluginName} before ${command} in ${jobName}`,
      );
    }
  }
});

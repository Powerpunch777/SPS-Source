import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopDirectory = path.resolve(testDirectory, "..");
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");
const sdkDirectory = "external/sps-plugin-sdk";
const workflows = [
  {
    file: "sps-verify.yml",
    job: "desktop",
    prerequisites: ["npm run prepare:owner-host-runtime", "electron-builder --win dir --publish never"],
    usesNpmCache: true,
  },
  {
    file: "sps-desktop-release.yml",
    job: "build-sign-and-stage",
    prerequisites: ["npm run release:win"],
    usesNpmCache: true,
  },
  {
    file: "sps-desktop-beta-release.yml",
    job: "build-and-publish-beta",
    prerequisites: ["npm run package:candidate:win"],
    usesNpmCache: true,
  },
  {
    file: "sps-desktop-pilot.yml",
    job: "package-pilot",
    prerequisites: ["npm run package:candidate:win"],
    usesNpmCache: true,
  },
  {
    file: "sps-live-agent-canary.yml",
    job: "live-codex-host-lifecycle",
    prerequisites: ["npm run prepare:owner-host-runtime", "electron-builder --win dir --publish never"],
    usesNpmCache: true,
  },
];

test("installs the public Plugin SDK build tools before Windows runtime preparation and packaging", async () => {
  for (const { file, job: jobName, prerequisites, usesNpmCache } of workflows) {
    const workflowText = await readFile(path.join(repositoryDirectory, ".github", "workflows", file), "utf8");
    const workflow = yaml.load(workflowText);
    const steps = workflow.jobs[jobName]?.steps ?? [];
    const sdkInstallSteps = steps
      .map((step, index) => ({ step, index }))
      .filter(({ step }) => step["working-directory"] === sdkDirectory && step.run?.trim() === "npm ci");

    assert.equal(sdkInstallSteps.length, 1, `${file} must run npm ci in ${sdkDirectory} for ${jobName}`);

    for (const command of prerequisites) {
      const prerequisiteIndex = steps.findIndex((step) => step.run?.includes(command));
      assert.notEqual(prerequisiteIndex, -1, `${file} is missing ${command} in ${jobName}`);
      assert.ok(
        sdkInstallSteps[0].index < prerequisiteIndex,
        `${file} must install the public Plugin SDK before ${command} in ${jobName}`,
      );
    }

    if (usesNpmCache) {
      const setupNode = steps.find((step) => step.uses?.startsWith("actions/setup-node@"));
      assert.match(
        setupNode?.["with"]?.["cache-dependency-path"] ?? "",
        /external\/sps-plugin-sdk\/package-lock\.json/,
        `${file} must key its npm cache with the public Plugin SDK lockfile`,
      );
    }
  }
});

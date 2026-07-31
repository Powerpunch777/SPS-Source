import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPluginTemplate } from "@sonparkserver/plugin-sdk/authoring/plugin-package-v1.mjs";
import {
  createDeveloperCandidateFromGateReports,
  stageDeveloperCandidate,
} from "../src/developer-build-pipeline.mjs";
import { runSpsDeveloperCommand } from "../src/developer-command-runner.mjs";
import { stageSpsPluginArchive } from "../src/registry-staging.mjs";

const desktopRoot = path.resolve(import.meta.dirname, "..");
const sdkRoot = path.join(desktopRoot, "node_modules", "@sonparkserver", "plugin-sdk");
const sdkCliPath = path.join(sdkRoot, "cli", "sps-plugin.mjs");

test("external plugin passes the real Developer Mode gate and code-free staging pipeline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-mode-integration-"));
  const sourceDirectory = path.join(root, "external-plugin");
  const vaultRoot = path.join(root, "owner-vault");
  try {
    await createPluginTemplate({
      directory: sourceDirectory,
      pluginId: "local.developer-mode-reference",
      packageName: "@sps/reference-developer-mode",
      displayName: "Developer Mode Reference",
      version: "0.1.0",
    });
    const sdkLink = path.join(sourceDirectory, "node_modules", "@sonparkserver", "plugin-sdk");
    await mkdir(path.dirname(sdkLink), { recursive: true });
    await symlink(sdkRoot, sdkLink, process.platform === "win32" ? "junction" : "dir");

    const reports = [];
    for (const command of ["build", "validate", "test"]) {
      reports.push(await runSpsDeveloperCommand({
        command,
        sourceDirectory,
        nodeCommand: process.execPath,
        sdkCliPath,
      }));
    }
    assert.deepEqual(reports.map((report) => report.success), [true, true, true]);
    const candidate = createDeveloperCandidateFromGateReports(reports);

    let registeredBody = null;
    const staged = await stageDeveloperCandidate({
      vaultRoot,
      projectId: "dev-11111111-1111-4111-8111-111111111111",
      sourceDirectory,
      candidate: {
        ...candidate,
        createdAt: "2026-07-31T00:00:00.000Z",
      },
      randomId: () => "22222222-2222-4222-8222-222222222222",
      stageArchive: async ({ archivePath, source }) => await stageSpsPluginArchive({
        vaultRoot,
        archivePath,
        source,
        randomId: () => "33333333-3333-4333-8333-333333333333",
        registerStage: async (body) => {
          registeredBody = body;
          return {
            stageId: "f".repeat(32),
            pluginId: body.source.registryId,
            status: "staged",
          };
        },
      }),
    });
    assert.equal(staged.staged, true);
    assert.equal(staged.inspection.package.staticManifest.plugin.id, "local.developer-mode-reference");
    assert.equal(registeredBody.source.registryId, "sps.desktop.development");
    assert.match(registeredBody.packageRoot, /registry-staging[\\/]packages/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendDeveloperDiagnostic,
  clearDeveloperDiagnostics,
  developerDiagnosticFromGate,
  developerDiagnosticFromPreview,
  listDeveloperDiagnostics,
} from "../src/developer-diagnostics.mjs";

const PROJECT_ID = "dev-123e4567-e89b-12d3-a456-426614174000";
const BUILD_ID = "build-123e4567-e89b-12d3-a456-426614174000";

test("stores only SDK v1-safe Desktop diagnostics and filters origin, category, and level", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-diagnostics-"));
  try {
    const failed = developerDiagnosticFromGate({
      projectId: PROJECT_ID,
      command: "validate",
      report: {
        success: false,
        durationMs: 12,
        result: { diagnostics: [{ message: "token=top-secret C:\\Users\\young\\plugin\\stderr.log /custom/build/stdout.log" }] },
      },
    });
    const first = await appendDeveloperDiagnostic({ ownerVault: root, event: failed });
    await appendDeveloperDiagnostic({
      ownerVault: root,
      event: developerDiagnosticFromPreview({
        projectId: PROJECT_ID,
        buildId: BUILD_ID,
        phase: "renderer",
        level: "warn",
        code: "PREVIEW_RENDERER_SLOW",
        message: "Preview renderer took longer than expected.",
      }),
    });
    assert.equal(first.schemaVersion, "sps-plugin-diagnostic/v1");
    assert.equal(first.origin, "desktop");
    assert.equal(first.category, "manifest");
    assert.equal(first.level, "error");
    assert.equal(first.message.includes("top-secret"), false);
    assert.equal(first.message.includes("C:\\Users"), false);
    assert.equal(first.details.projectId, PROJECT_ID);
    assert.equal(first.details.gate, "validate");
    const filtered = await listDeveloperDiagnostics({ ownerVault: root, filters: { origin: "desktop", category: "manifest", level: "error" } });
    assert.deepEqual(filtered.map((event) => event.code), ["DEVELOPER_VALIDATE_FAILED"]);
    const projectFiltered = await listDeveloperDiagnostics({ ownerVault: root, filters: { projectId: PROJECT_ID } });
    assert.deepEqual(projectFiltered.map((event) => event.code), ["PREVIEW_RENDERER_SLOW", "DEVELOPER_VALIDATE_FAILED"]);
    const buildFiltered = await listDeveloperDiagnostics({ ownerVault: root, filters: { buildId: BUILD_ID } });
    assert.deepEqual(buildFiltered.map((event) => event.code), ["PREVIEW_RENDERER_SLOW"]);
    const disk = await readFile(path.join(root, "developer-mode", "diagnostics-v1.json"), "utf8");
    assert.equal(disk.includes("top-secret"), false);
    assert.equal(disk.includes("stderr.log"), false);
    assert.equal(disk.includes("C:\\Users"), false);
    assert.equal(disk.includes("/custom/build"), false);
    assert.deepEqual(await clearDeveloperDiagnostics({ ownerVault: root }), { cleared: true });
    assert.deepEqual(await listDeveloperDiagnostics({ ownerVault: root }), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("refuses a Developer Mode junction that escapes the Owner Vault", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-developer-diagnostics-link-"));
  const ownerVault = path.join(root, "vault");
  const outside = path.join(root, "outside");
  try {
    await Promise.all([mkdir(ownerVault), mkdir(outside)]);
    await symlink(outside, path.join(ownerVault, "developer-mode"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(
      () => appendDeveloperDiagnostic({
        ownerVault,
        event: {
          origin: "desktop",
          category: "worker",
          level: "error",
          code: "DEVELOPER_BUILD_FAILED",
          message: "Plugin build failed.",
          details: {},
        },
      }),
      /symbolic link or junction/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

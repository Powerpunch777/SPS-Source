import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireSpsWorkspaceDirectory } from "../src/workspace-directory.mjs";

test("accepts an existing absolute project folder", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-workspace-"));
  try {
    assert.equal(await requireSpsWorkspaceDirectory(root), path.resolve(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("allows a blank mapping so a project folder can be removed", async () => {
  assert.equal(await requireSpsWorkspaceDirectory("  "), null);
});

test("rejects relative, missing, and file project paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "sps-workspace-"));
  const filePath = path.join(root, "not-a-folder.txt");
  await writeFile(filePath, "SPS");
  try {
    await assert.rejects(
      () => requireSpsWorkspaceDirectory("relative-project"),
      /absolute folder path available to this computer/,
    );
    await assert.rejects(
      () => requireSpsWorkspaceDirectory(path.join(root, "missing")),
      /not available to this computer/,
    );
    await assert.rejects(
      () => requireSpsWorkspaceDirectory(filePath),
      /must be a folder/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

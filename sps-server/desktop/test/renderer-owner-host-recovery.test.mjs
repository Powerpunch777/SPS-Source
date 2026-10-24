import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rendererPath = new URL("../renderer/renderer.mjs", import.meta.url);

test("keeps checking a slow Owner Host and opens Workspace after it is healthy", async () => {
  const [renderer, onboarding] = await Promise.all([
    readFile(rendererPath, "utf8"),
    readFile(new URL("../renderer/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(renderer, /const OWNER_HOST_RECOVERY_INTERVAL_MS = 2_000/);
  assert.match(renderer, /setInterval\(\(\) => \{\s*void refreshStatus\(\)\.catch\(\(\) => \{\}\);\s*\}, OWNER_HOST_RECOVERY_INTERVAL_MS\)/);
  assert.match(renderer, /const workspaceReady = account\(status\)\.signedIn[\s\S]*?isOwnerHost\(status\) \? ownerHostReady\(status\) : Boolean\(status\.signedIn\)[\s\S]*?await window\.spsDesktop\.openWorkspace\(\)/);
  assert.match(onboarding, /id="open-workspace-retry"/);
  assert.match(renderer, /const visible = hasProfile && !showingLocalFolders/);
  assert.match(renderer, /SPS Workspace is ready/);
  assert.match(renderer, /workspaceOpenError = error instanceof Error/);
});

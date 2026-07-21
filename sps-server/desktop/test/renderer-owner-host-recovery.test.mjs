import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rendererPath = new URL("../renderer/renderer.mjs", import.meta.url);

test("keeps checking a slow Owner Host and opens Workspace after it is healthy", async () => {
  const renderer = await readFile(rendererPath, "utf8");

  assert.match(renderer, /const OWNER_HOST_RECOVERY_INTERVAL_MS = 2_000/);
  assert.match(renderer, /setInterval\(\(\) => \{\s*void refreshStatus\(\)\.catch\(\(\) => \{\}\);\s*\}, OWNER_HOST_RECOVERY_INTERVAL_MS\)/);
  assert.match(renderer, /isOwnerHost\(status\) && ownerHostReady\(status\)[\s\S]*?await window\.spsDesktop\.openWorkspace\(\)/);
});

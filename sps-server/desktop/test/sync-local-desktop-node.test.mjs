import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps the local Desktop Node dependency synchronized before Desktop workflows run", async () => {
  const [packageJson, syncScript] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/sync-local-desktop-node.mjs", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.equal(scripts["sync:desktop-node"], "node scripts/sync-local-desktop-node.mjs");
  assert.match(scripts.prestart, /sync:desktop-node/);
  assert.match(scripts.pretest, /sync:desktop-node/);
  assert.match(scripts["prepare:owner-host-runtime"], /sync:desktop-node/);
  assert.match(syncScript, /stale\. Run npm run sync:desktop-node/);
  assert.match(syncScript, /synchronization did not produce an exact local source copy/);
});

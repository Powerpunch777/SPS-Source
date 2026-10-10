import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainPath = new URL("../src/main.mjs", import.meta.url);

test("gives a joined team member a Desktop command to register their own Node", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /function canRegisterCurrentDesktopNode\(\)/);
  assert.match(main, /async function registerCurrentDesktopNode\(\)/);
  assert.match(main, /Connect this computer as an SPS Node/);
  assert.match(main, /SPS Node registration requested/);
  assert.match(main, /Waiting for Owner approval/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps production single-instance while allowing an isolated E2E Desktop", async () => {
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");

  assert.match(main, /SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE === "1"/);
  assert.match(main, /!allowsIsolatedE2eInstance && !app\.requestSingleInstanceLock\(\)/);
});

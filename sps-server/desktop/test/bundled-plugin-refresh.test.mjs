import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainPath = new URL("../src/main.mjs", import.meta.url);

test("refreshes previously installed optional first-party plugins without enabling them for a new company", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(
    main,
    /SPS_BUNDLED_PLUGIN_REFRESH_PATHS:\s*\[memoryPluginPath, roomPluginPath\]\.join\(path\.delimiter\)/,
  );
  assert.match(main, /SPS_BUNDLED_PLUGIN_PATHS:\s*bundledPluginPaths\.join\(path\.delimiter\)/);
});

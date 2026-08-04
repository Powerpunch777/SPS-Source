import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("keeps production single-instance while allowing an isolated E2E Desktop", async () => {
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");

  assert.match(main, /SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE === "1"/);
  assert.match(main, /!allowsIsolatedE2eInstance && !app\.requestSingleInstanceLock\(\)/);
});

test("isolates Electron E2E application data below the system temp directory", async () => {
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(main, /SPS_DESKTOP_E2E_USER_DATA_DIR/);
  assert.match(main, /path\.relative\(temporaryRoot, target\)/);
  assert.match(main, /app\.setPath\("userData", target\)/);

  for (const script of [
    "smoke-isolated-desktop-ui.mjs",
    "smoke-workspace-surfaces-desktop.mjs",
    "smoke-plugin-preview-desktop.mjs",
    "smoke-host-plugin-lifecycle-desktop.mjs",
  ]) {
    const source = await readFile(new URL(`../scripts/${script}`, import.meta.url), "utf8");
    assert.match(source, /SPS_DESKTOP_E2E_USER_DATA_DIR/);
  }
});

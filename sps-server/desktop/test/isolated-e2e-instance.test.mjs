import test from "node:test";
import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveSpsE2eUserDataDirectory } from "../src/e2e-user-data.mjs";

test("keeps production single-instance while allowing an isolated E2E Desktop", async () => {
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");

  assert.match(main, /SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE === "1"/);
  assert.match(main, /!allowsIsolatedE2eInstance && !app\.requestSingleInstanceLock\(\)/);
});

test("isolates Electron E2E application data below the system temp directory", async () => {
  const main = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(main, /resolveSpsE2eUserDataDirectory\(\)/);
  assert.match(main, /app\.setPath\("userData", target\)/);

  for (const script of [
    "smoke-isolated-desktop-ui.mjs",
    "smoke-core-settings-desktop.mjs",
    "smoke-workspace-surfaces-desktop.mjs",
    "smoke-plugin-preview-desktop.mjs",
    "smoke-host-plugin-lifecycle-desktop.mjs",
  ]) {
    const source = await readFile(new URL(`../scripts/${script}`, import.meta.url), "utf8");
    assert.match(source, /SPS_DESKTOP_E2E_USER_DATA_DIR/);
  }
});

test("fails closed when E2E isolation is enabled without a dedicated directory", () => {
  assert.throws(
    () => resolveSpsE2eUserDataDirectory({ enabled: true, configured: "" }),
    /SPS_DESKTOP_E2E_USER_DATA_DIR is required/,
  );
});

test("accepts a real E2E directory below the operating-system temp folder", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sps-e2e-user-data-test-"));
  try {
    assert.equal(
      resolveSpsE2eUserDataDirectory({ enabled: true, configured: directory }),
      realpathSync.native(directory),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a symlink or junction that escapes the operating-system temp folder", async (t) => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "sps-e2e-link-test-"));
  const link = path.join(parent, "escaped");
  try {
    try {
      await symlink(process.cwd(), link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`This host cannot create a test link: ${error.message}`);
      return;
    }
    assert.throws(
      () => resolveSpsE2eUserDataDirectory({ enabled: true, configured: link }),
      /real isolated directory/,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

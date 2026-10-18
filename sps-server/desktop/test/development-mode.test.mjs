import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { resolveDesktopDevelopment } from "../src/development-mode.mjs";

test("normal Desktop does not create or enable a development profile", () => {
  assert.equal(resolveDesktopDevelopment({ enabled: false, packaged: true }), null);
});
test("development mode rejects packaged and E2E apps", () => {
  assert.throws(() => resolveDesktopDevelopment({ enabled: true, packaged: true }));
  assert.throws(() => resolveDesktopDevelopment({ enabled: true, packaged: false, e2e: true }));
});
test("development profile is persistent, separate and cannot be redirected", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sps-development-mode-"));
  try {
    const options = { enabled: true, packaged: false, desktopRoot: root };
    const result = resolveDesktopDevelopment(options);
    assert.equal(result.profile, path.join(root, ".dev-profile"));
    assert.equal(result.uiMiddleware, "true");
    assert.deepEqual(resolveDesktopDevelopment(options), result);
    rmSync(result.profile, { recursive: true });
    symlinkSync(os.tmpdir(), result.profile, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => resolveDesktopDevelopment(options), /must not redirect/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

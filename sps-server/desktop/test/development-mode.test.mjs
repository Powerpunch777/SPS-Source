import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
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
test("development database vault stays outside a Unicode checkout and varies by workspace", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "sps-development-vault-"));
  try {
    const options = { enabled: true, packaged: false, desktopRoot: root, vaultBase: os.tmpdir() };
    const result = resolveDesktopDevelopment(options);
    assert.ok(result.vaultRoot.startsWith(path.join(os.tmpdir(), "SPS-Development") + path.sep));
    assert.ok(!result.vaultRoot.startsWith(root + path.sep));
    assert.equal(resolveDesktopDevelopment(options).vaultRoot, result.vaultRoot);
    const unicodeCheckout = path.join(root, "\uac1c\ubc1c");
    mkdirSync(unicodeCheckout);
    const other = resolveDesktopDevelopment({ ...options, desktopRoot: unicodeCheckout });
    assert.notEqual(other.vaultRoot, result.vaultRoot);
    assert.match(other.vaultRoot, /SPS-Development[\\/][a-f0-9]{16}[\\/]owner-vault$/);
    assert.ok(!other.vaultRoot.includes("\uac1c\ubc1c"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

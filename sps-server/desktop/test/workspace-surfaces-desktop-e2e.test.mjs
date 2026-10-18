import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("ships a packaged Desktop Workspace Surfaces E2E harness", async () => {
  const [packageJson, script] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/smoke-workspace-surfaces-desktop.mjs", import.meta.url), "utf8"),
  ]);
  const scripts = JSON.parse(packageJson).scripts;

  assert.match(scripts["test:e2e:workspace-surfaces"], /smoke-workspace-surfaces-desktop/);
  for (const required of [
    "SPS_DESKTOP_E2E_BINARY",
    "SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE",
    "SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY",
    "parseE2eHostReadyTimeout",
    "generateKeyPairSync",
    "/.well-known/jwks.json",
    "/v1/desktop/authorize",
    "/v1/desktop/token",
    "/v1/desktop/refresh",
    "/v1/desktop/revoke",
    "#start-sps-account",
    "#create-owner-server",
    "workspace-shell",
    "workspace-dashboard",
    "workspace-inbox",
    "Neutral Workspace",
    "Plugin Builder",
    "무엇을 만들까요?",
    "Team Workplane",
    "taskkill",
    "removeTemporaryDirectory",
  ]) {
    assert.ok(script.includes(required), `Workspace Surfaces E2E is missing ${required}`);
  }
});

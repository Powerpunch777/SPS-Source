import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpsDesktopAccessToken,
  isSpsDesktopWorkspaceRequest,
  SPS_DESKTOP_ACCESS_TOKEN_ENV,
  spsDesktopAccessEnvironment,
} from "../src/desktop-local-access.mjs";

test("creates one launch-scoped Owner Host access token", () => {
  const token = createSpsDesktopAccessToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.deepEqual(spsDesktopAccessEnvironment(token), { [SPS_DESKTOP_ACCESS_TOKEN_ENV]: token });
});

test("injects the desktop token only into the active local Owner Host origin", () => {
  const input = {
    workspaceOrigin: "http://127.0.0.1:31310",
  };
  assert.equal(isSpsDesktopWorkspaceRequest({ ...input, url: "http://127.0.0.1:31310/SPS/projects" }), true);
  assert.equal(isSpsDesktopWorkspaceRequest({ ...input, url: "https://redongames.com" }), false);
  assert.equal(isSpsDesktopWorkspaceRequest({ ...input, url: "http://127.0.0.1:31311/SPS/projects" }), false);
});

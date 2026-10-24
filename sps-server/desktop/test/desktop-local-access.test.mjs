import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpsDesktopAccessToken,
  isSpsDesktopTechnicalHostRequest,
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

test("limits the Host proof to Core technical-team routes on the active Owner Host", () => {
  const input = { workspaceOrigin: "http://127.0.0.1:31310" };
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/companies/company-1/sps-members",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/companies/company-1/invites",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/companies/company-1/sps-workspace-sources",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/companies/company-1/workspace-shell",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/plugins/install",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/instance/settings",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/instance/database-backups",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/cli-auth/me",
  }), true);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "http://127.0.0.1:31310/api/companies/company-1/issues",
  }), false);
  assert.equal(isSpsDesktopTechnicalHostRequest({
    ...input,
    url: "https://remote.tailnet.ts.net/api/companies/company-1/sps-members",
  }), false);
});

test("grants execution-summary Host proof only to the exact GET endpoint on the active Host", () => {
  const workspaceOrigin = "http://127.0.0.1:31310";
  const endpoint = "/api/companies/11111111-1111-4111-8111-111111111111/sps-executions/summary";
  const check = (url, method) => isSpsDesktopTechnicalHostRequest({ workspaceOrigin, url, method });
  assert.equal(check(`${workspaceOrigin}${endpoint}?pluginId=fixture`, "GET"), true);
  for (const method of [undefined, "POST", "PUT", "DELETE", "PATCH"]) {
    assert.equal(check(`${workspaceOrigin}${endpoint}`, method), false);
  }
  for (const url of [
    `https://remote.tailnet.ts.net${endpoint}`,
    `http://127.0.0.1:31311${endpoint}`,
    `${workspaceOrigin}${endpoint}/other`,
    `${workspaceOrigin}${endpoint}-other`,
    `${workspaceOrigin}/api/companies/not-uuid/sps-executions/summary`,
  ]) assert.equal(check(url, "GET"), false);
});

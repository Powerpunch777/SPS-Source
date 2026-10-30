import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainPath = new URL("../src/main.mjs", import.meta.url);
const rendererPath = new URL("../renderer/renderer.mjs", import.meta.url);
const onboardingPath = new URL("../renderer/index.html", import.meta.url);
const workspacePreloadPath = new URL("../src/workspace-preload.cjs", import.meta.url);

test("moves private team access and SPS2 invitations into Host Workspace settings", async () => {
  const [main, renderer, onboarding, workspacePreload] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(rendererPath, "utf8"),
    readFile(onboardingPath, "utf8"),
    readFile(workspacePreloadPath, "utf8"),
  ]);

  // The onboarding window chooses or joins a Server. A running Host is
  // managed inside its Workspace settings through the narrow Host bridge.
  assert.match(onboarding, /id="owner-server-screen"/);
  assert.match(renderer, /const visible = false;/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-server-settings"\)/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-enable-private-team-access"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-create-member-invite"\)/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-list-member-invites"\)/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-revoke-member-invite"/);
  assert.match(main, /function assertLocalOwnerWorkspace\(event, action\)/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-server-settings"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-enable-private-team-access"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-create-member-invite"/);
  assert.match(main, /async function enablePrivateTeamAccess\([\s\S]*?state\.teamAccess = \{ \.\.\.nextTeamAccess, phase: "active" \};[\s\S]*?await activateOwnerHostProfile\(\);/);
  assert.match(main, /async function createMemberInvite\(\)[\s\S]*?ownerBootstrap: true/);
  assert.match(main, /allowedJoinTypes: "human",[\s\S]*?humanRole: "operator",[\s\S]*?agentMessage: null/);
  assert.doesNotMatch(main, /agentMessage: "SPS Desktop member invitation\."/);
  assert.match(main, /async function listMemberInvites\(\)[\s\S]*?ownerBootstrap: true/);
  assert.match(main, /invite\.allowedJoinTypes === "human"[\s\S]*?invite\.humanRole === "operator"/);
  assert.match(main, /async function revokeMemberInvite\(input\)[\s\S]*?ownerBootstrap: true/);
  assert.match(renderer, /const workspaceReady = account\(status\)\.signedIn[\s\S]*?isOwnerHost\(status\) \? ownerHostReady\(status\) : Boolean\(status\.signedIn\)[\s\S]*?await window\.spsDesktop\.openWorkspace\(\)/);
});

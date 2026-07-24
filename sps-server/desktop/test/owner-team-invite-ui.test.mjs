import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainPath = new URL("../src/main.mjs", import.meta.url);
const rendererPath = new URL("../renderer/renderer.mjs", import.meta.url);
const onboardingPath = new URL("../renderer/index.html", import.meta.url);

test("lets an Owner enable team access and share a complete SPS2 invitation", async () => {
  const [main, renderer, onboarding] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(rendererPath, "utf8"),
    readFile(onboardingPath, "utf8"),
  ]);

  assert.match(onboarding, /id="owner-server-screen"/);
  assert.match(onboarding, /id="enable-private-team"/);
  assert.match(onboarding, /id="create-member-invite"/);
  assert.match(onboarding, /전체 <strong>SPS2-\.\.\.<\/strong> 코드를 그대로 전달하세요/);
  assert.match(renderer, /enablePrivateTeamAccess\(\{ companyId \}\)/);
  assert.match(renderer, /createMemberInvite\(\)/);
  assert.match(renderer, /copyText\(\{ text: memberInviteCode \}\)/);
  assert.match(renderer, /const workspaceReady = account\(status\)\.signedIn[\s\S]*?isOwnerHost\(status\) \? ownerHostReady\(status\) : Boolean\(status\.signedIn\)[\s\S]*?await window\.spsDesktop\.openWorkspace\(\)/);
  assert.match(main, /async function showMemberInvite\(\)[\s\S]*?createMemberInvite\(\)[\s\S]*?clipboard\.writeText\(invite\.code\)/);
  assert.match(main, /async function enablePrivateTeamAccess\([\s\S]*?state\.teamAccess = \{ \.\.\.nextTeamAccess, phase: "active" \};[\s\S]*?await activateOwnerHostProfile\(\);/);
  assert.match(main, /Create teammate invitation\.\.\./);
});

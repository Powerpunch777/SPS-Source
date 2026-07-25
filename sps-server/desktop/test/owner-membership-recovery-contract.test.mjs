import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mainPath = new URL("../src/main.mjs", import.meta.url);
const accessPath = new URL("../src/desktop-local-access.mjs", import.meta.url);

test("repairs a stale private-team Owner membership through a narrow local proof", async () => {
  const [main, access] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(accessPath, "utf8"),
  ]);

  assert.match(access, /SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER/);
  assert.match(main, /ownerBootstrap = false/);
  assert.match(main, /headers\[SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER\] = ownerHostDesktopAccessToken/);
  assert.match(main, /async function listCurrentOwnerIdentityCompanies\(\)/);
  assert.match(main, /async function ensurePrivateTeamOwnerMembership\(\)/);
  assert.match(main, /humanRole: "owner"/);
  assert.match(main, /SPS Desktop Owner membership recovery\./);
  assert.match(main, /await acceptSpsIdentityInvite\(state\.teamAccess\.url, recoveryInvitation\.token\)/);
  assert.match(main, /Private team access is already enabled for another company/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const preloadPath = new URL("../src/preload.cjs", import.meta.url);
const mainPath = new URL("../src/main.mjs", import.meta.url);

test("uses a sandbox-compatible CommonJS preload bridge", async () => {
  const [preload, main] = await Promise.all([
    readFile(preloadPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  assert.match(main, /preload\.cjs/);
  assert.match(preload, /require\("electron"\)/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\("spsDesktop"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:check-hub"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:start-google-account"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:create-owner-server"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:join-server"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:connect-node"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:disconnect-node"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:choose-project-workspace"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:inspect-team-access"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:enable-private-team-access"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:disable-private-team-access"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:accept-invite-code"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:create-member-invite"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:list-member-invites"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:revoke-member-invite"/);
});

test("notifies the renderer when Google Desktop sign-in state changes", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(
    main,
    /async function configureDesktopGoogleClient\(input\) \{[\s\S]*?await persistState\(\);\s*sendDesktopAccountStatus\(\);[\s\S]*?return publicStatus\(\);/,
  );
  assert.match(
    main,
    /async function signOutDesktopAccount\(\) \{[\s\S]*?await persistState\(\);\s*sendDesktopAccountStatus\(\);[\s\S]*?return publicStatus\(\);/,
  );
});

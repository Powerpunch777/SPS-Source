import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const preloadPath = new URL("../src/preload.cjs", import.meta.url);
const mainPath = new URL("../src/main.mjs", import.meta.url);
const workspacePreloadPath = new URL("../src/workspace-preload.cjs", import.meta.url);
const registryPreloadPath = new URL("../src/registry-preload.cjs", import.meta.url);
const registryHtmlPath = new URL("../renderer/registry.html", import.meta.url);
const officialExtensionsPreloadPath = new URL("../src/official-extensions-preload.cjs", import.meta.url);
const officialExtensionsHtmlPath = new URL("../renderer/official-extensions.html", import.meta.url);

test("uses a sandbox-compatible CommonJS preload bridge", async () => {
  const [preload, workspacePreload, main] = await Promise.all([
    readFile(preloadPath, "utf8"),
    readFile(workspacePreloadPath, "utf8"),
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
  assert.match(preload, /ipcRenderer\.invoke\("desktop:open-official-extensions"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:choose-project-workspace"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:inspect-team-access"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:enable-private-team-access"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:disable-private-team-access"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:accept-invite-code"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:create-member-invite"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:list-member-invites"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:revoke-member-invite"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:export-owner-vault-transfer"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:inspect-owner-vault-transfer"/);
  assert.match(workspacePreload, /contextBridge\.exposeInMainWorld\("spsDesktopWorkspace"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-account"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-sign-out"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-open-plugin-registries"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-account"/);
  assert.match(main, /ipcMain\.handle\("desktop:open-official-extensions"[\s\S]*?Official Extensions requests must come from the SPS Desktop window[\s\S]*?showOfficialExtensionsWindow\(\)/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-sign-out"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-open-plugin-registries"[\s\S]*?Plugin Registry management[\s\S]*?showRegistryWindow\(\)/);
  assert.match(main, /Official extensions\.\.\."\s*,\s*accelerator: "CommandOrControl\+Alt\+E"/);
  assert.match(main, /Plugin sources & review\.\.\."\s*,\s*accelerator: "CommandOrControl\+Alt\+R"/);
});

test("keeps the Registry window on a narrow Owner-only preload bridge", async () => {
  const [main, registryPreload, registryHtml] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(registryPreloadPath, "utf8"),
    readFile(registryHtmlPath, "utf8"),
  ]);

  assert.match(main, /async function showRegistryWindow\(\{ sourceId = null \} = \{\}\) \{[\s\S]*?assertRegistryOwner\(\);[\s\S]*?registry-preload\.cjs/);
  assert.match(main, /ipcMain\.handle\("desktop:registry-list-sources"/);
  assert.match(main, /ipcMain\.handle\("desktop:registry-stage-release"/);
  assert.match(main, /ipcMain\.handle\("desktop:registry-list-stages"/);
  assert.match(main, /ipcMain\.handle\("desktop:registry-enable-stage"/);
  assert.match(registryPreload, /contextBridge\.exposeInMainWorld\("spsRegistry"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:registry-add-source"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:registry-stage-release"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:registry-list-stages"/);
  assert.doesNotMatch(registryPreload, /nodeIntegration|require\("node:/);
  assert.match(registryHtml, /default-src 'self'; style-src 'self'; script-src 'self'/);
  assert.match(registryHtml, /Review queue/);
});

test("keeps Official Extensions discovery separate from Owner-only Registry installation review", async () => {
  const [main, officialExtensionsPreload, officialExtensionsHtml] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(officialExtensionsPreloadPath, "utf8"),
    readFile(officialExtensionsHtmlPath, "utf8"),
  ]);

  assert.match(main, /async function showOfficialExtensionsWindow\(\) \{[\s\S]*?official-extensions-preload\.cjs/);
  assert.match(main, /ipcMain\.handle\("desktop:official-extensions-load-catalog"[\s\S]*?Official Extensions window/);
  assert.match(main, /ipcMain\.handle\("desktop:official-extensions-open-install-review"[\s\S]*?assertRegistryOwner\(\)[\s\S]*?showRegistryWindow\(\{ sourceId: SPS_OFFICIAL_REGISTRY_SOURCE\.id \}\)/);
  assert.match(officialExtensionsPreload, /contextBridge\.exposeInMainWorld\("spsOfficialExtensions"/);
  assert.match(officialExtensionsPreload, /ipcRenderer\.invoke\("desktop:official-extensions-load-catalog"\)/);
  assert.match(officialExtensionsPreload, /ipcRenderer\.invoke\("desktop:official-extensions-open-install-review"\)/);
  assert.match(officialExtensionsHtml, /default-src 'self'; style-src 'self'; script-src 'self'/);
  assert.match(officialExtensionsHtml, /Open secure install review/);
});

test("notifies the renderer when Google Desktop sign-in state changes", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(
    main,
    /async function configureDesktopGoogleClient\(input\) \{[\s\S]*?await persistState\(\);\s*sendDesktopAccountStatus\(\);[\s\S]*?return publicStatus\(\);/,
  );
  assert.match(
    main,
    /async function signOutDesktopAccount\(\) \{[\s\S]*?await disconnectCurrentNode\(\);[\s\S]*?state\.encryptedDesktopAccount = null;[\s\S]*?await persistState\(\{ rememberActiveConnection: false \}\);[\s\S]*?sendDesktopAccountStatus\(\);[\s\S]*?return \{ \.\.\.publicStatus\(\), nodeDisconnect \};/,
  );
});

test("shuts down the Owner Host gracefully before quitting Desktop", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /async function stopDesktopRuntimeGracefully\(\) \{[\s\S]*?ownerHostManager\?\.stop\(\{ force: false \}\)/);
  assert.match(main, /app\.on\("before-quit", \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?shutdownComplete = true;[\s\S]*?app\.quit\(\);/);
});

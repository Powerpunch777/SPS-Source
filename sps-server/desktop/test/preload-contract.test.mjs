import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const preloadPath = new URL("../src/preload.cjs", import.meta.url);
const mainPath = new URL("../src/main.mjs", import.meta.url);
const accountControllerPath = new URL("../src/desktop-account-controller.mjs", import.meta.url);
const rendererPath = new URL("../renderer/renderer.mjs", import.meta.url);
const workspacePreloadPath = new URL("../src/workspace-preload.cjs", import.meta.url);
const registryPreloadPath = new URL("../src/registry-preload.cjs", import.meta.url);
const previewPreloadPath = new URL("../src/plugin-preview-preload.cjs", import.meta.url);
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
  assert.match(preload, /ipcRenderer\.invoke\("desktop:start-sps-account"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:create-owner-server"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:restore-owner-server"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:join-server"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:connect-node"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:disconnect-node"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:save-default-workspace"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:choose-project-workspace"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:manage-host-project-source"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:inspect-team-access"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:enable-private-team-access"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:disable-private-team-access"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:accept-invite-code"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:create-member-invite"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:list-member-invites"\)/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:revoke-member-invite"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:export-owner-vault-transfer"/);
  assert.match(preload, /ipcRenderer\.invoke\("desktop:inspect-owner-vault-transfer"/);
  assert.match(main, /ipcMain\.handle\("desktop:restore-owner-server"/);
  assert.match(workspacePreload, /contextBridge\.exposeInMainWorld\("spsDesktopWorkspace"/);
  assert.match(workspacePreload, /manageHostWorkspaceSource: \(input\) => ipcRenderer\.invoke\("desktop:workspace-manage-host-workspace-source", input\)/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-account"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-sign-out"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-server-settings"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-enable-private-team-access"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-create-member-invite"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-list-member-invites"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-revoke-member-invite"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-open-plugin-registries"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-host-project-sources"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-choose-host-project-source"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-clear-host-project-source"/);
  assert.match(workspacePreload, /ipcRenderer\.invoke\("desktop:workspace-manage-host-project-source"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-account"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-sign-out"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-server-settings"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-enable-private-team-access"/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-open-plugin-registries"[\s\S]*?Plugin Registry management[\s\S]*?showRegistryWindow\(\{ sourceId: SPS_OFFICIAL_REGISTRY_SOURCE\.id \}\)/);
  assert.match(main, /ipcMain\.handle\("desktop:workspace-host-project-sources"[\s\S]*?event\.sender\.id !== workspaceWindow\.webContents\.id/);
  assert.match(main, /async function chooseHostProjectSourceForWorkspace\(projectId\)/);
  assert.match(main, /Revoke every Member's source access before changing or clearing this Host project folder/);
  assert.match(main, /Official extensions\.\.\."[\s\S]*?visible: workspaceOpen/);
  assert.match(main, /Plugin sources & review\.\.\."[\s\S]*?visible: workspaceOpen/);
});

test("offers Host restore before activation and explains the fresh-Host boundary", async () => {
  const [onboardingHtml, onboardingRenderer, main] = await Promise.all([
    readFile(new URL("../renderer/index.html", import.meta.url), "utf8"),
    readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  assert.match(onboardingHtml, /id="restore-owner-server"/);
  assert.match(onboardingHtml, /새 Host/);
  assert.match(onboardingRenderer, /restoreOwnerServer\(\)/);
  assert.match(main, /SPS Host restore is allowed only on a fresh Host/);
  assert.match(main, /state\.ownerHostOwnerSubject \|\| isOwnerHostProfile\(\)/);
  assert.doesNotMatch(main, /state\.ownerHostOwnerSubject \|\| state\.profile/);
  assert.match(main, /await runOwnerHostRestoreProcess\(/);
  assert.match(main, /await startOwnerHost\(\{ activate: true \}\)/);
});

test("keeps plugins out of the SPS sign-in and server-setup screens", async () => {
  const [onboardingHtml, onboardingRenderer, preload] = await Promise.all([
    readFile(new URL("../renderer/index.html", import.meta.url), "utf8"),
    readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8"),
    readFile(preloadPath, "utf8"),
  ]);

  assert.doesNotMatch(onboardingHtml, /open-official-extensions/);
  assert.doesNotMatch(onboardingRenderer, /openOfficialExtensions/);
  assert.doesNotMatch(preload, /desktop:open-official-extensions/);
});

test("keeps a member Node identity available for the same account after an expired sign-in", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /function suspendExpiredAccountConnection\(\)[\s\S]*?state\.encryptedBoardApiToken = null;[\s\S]*?state\.companies = \[\];[\s\S]*?state\.projects = \[\];/);
  assert.match(main, /function restoreCurrentAccountConnection\(\) \{[\s\S]*?if \(!account\) \{\s*suspendExpiredAccountConnection\(\);\s*return false;/);
});

test("lets a signed-in Node owner map local task folders before opening Workspace", async () => {
  const [main, onboardingHtml, onboardingRenderer] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(new URL("../renderer/index.html", import.meta.url), "utf8"),
    readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(main, /let setupMode = false;/);
  assert.match(main, /ipcMain\.handle\("desktop:save-default-workspace"/);
  assert.match(main, /ipcMain\.handle\("desktop:manage-host-project-source"/);
  assert.match(main, /ownerHostApi\(`\/companies\/\$\{encodeURIComponent\(companyId\)\}\/projects`\)/);
  assert.match(main, /state\.teamAccess\?\.companyId/);
  assert.match(main, /async function openSetup\(\) \{[\s\S]*?await refreshProjects\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(main, /setupMode,/);
  assert.match(onboardingHtml, /Host project folders/);
  assert.match(onboardingHtml, /Only the Owner Host chooses/);
  assert.match(onboardingHtml, /id="project-folder-list"/);
  assert.match(onboardingRenderer, /function renderLocalFolders\(status\)/);
  assert.match(onboardingRenderer, /saveProjectWorkspace\(\{ projectId, workspacePath \}\)/);
  assert.doesNotMatch(onboardingRenderer, /Existing folder on this Owner Host/);
  assert.doesNotMatch(onboardingRenderer, /button\.dataset\.action === "save"/);
  assert.match(onboardingRenderer, /Share with Member/);
  assert.match(onboardingRenderer, /manageHostProjectSource\(\{ projectId \}\)/);
  assert.match(onboardingRenderer, /workspaceReady && status\?\.setupMode !== true/);
});

test("keeps the Hub address from a desktop invitation through member join", async () => {
  const [main, renderer] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(main, /const explicitHub = input\?\.hub \? requireSpsHubOrigin\(input\.hub\) : null;/);
  assert.match(main, /const hubUrl = routed\?\.hub \?\? explicitHub \?\? state\.profile\?\.hubUrl \?\? null;/);
  assert.match(renderer, /let pendingJoinHub = null;/);
  assert.match(renderer, /hub: pendingJoinHub \?\? undefined/);
  assert.match(renderer, /pendingJoinHub = join\.hub \?\? null;/);
  assert.match(renderer, /\$\("#invite-code"\)\.focus\(\);/);
});

test("accepts a signed-in desktop invitation without relying on setup-screen timing", async () => {
  const [main, accountController] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(accountControllerPath, "utf8"),
  ]);

  assert.match(main, /async function acceptDesktopJoinLink\(join\) \{[\s\S]*?acceptInviteCode\(\{ code: join\.code, hub: join\.hub \}\)[\s\S]*?maybeOpenWorkspaceForCurrentAccount\(\)/);
  assert.match(main, /function sendJoinToRenderer\(value\) \{[\s\S]*?pendingJoin = join;[\s\S]*?void acceptDesktopJoinLink\(join\);/);
  assert.match(accountController, /const pendingJoin = getPendingJoin\(\);[\s\S]*?if \(pendingJoin\) await acceptDesktopJoinLink\(pendingJoin\);[\s\S]*?else await maybeOpenWorkspaceForCurrentAccount\(\);/);
  assert.match(main, /Before SPS account sign-in, retain the full routed invitation in the[\s\S]*?if \(!currentDesktopAccount\(\) \|\| isOwnerHostProfile\(\)\) return null;/);
});

test("opens the Member workspace after direct invitation acceptance", async () => {
  const [main, renderer] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(rendererPath, "utf8"),
  ]);

  assert.match(main, /async function acceptInviteCode\(input\) \{[\s\S]*?await refreshSpsIdentityTeamContext\(\);[\s\S]*?await maybeOpenWorkspaceForCurrentAccount\(\);[\s\S]*?direct: true/);
  assert.match(renderer, /const result = await window\.spsDesktop\.joinServer\([\s\S]*?result\?\.direct[\s\S]*?Invitation accepted\. This computer is waiting for Host Node approval\./);
});

test("normalizes the readable SPS code before direct invite acceptance", async () => {
  const accountController = await readFile(accountControllerPath, "utf8");

  assert.match(accountController, /const normalizedInviteToken = normalizeInviteToken\(inviteToken\);/);
  assert.match(accountController, /\/api\/invites\/\$\{encodeURIComponent\(normalizedInviteToken\)\}\/accept/);
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
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-list-projects"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-run-gates"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-apply-candidate"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-reload-ui"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-restart-worker"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-preview-state"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-update-preview-environment"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-list-preview-diagnostics"/);
  assert.match(registryPreload, /ipcRenderer\.invoke\("desktop:developer-clear-preview-diagnostics"/);
  assert.match(main, /ipcMain\.handle\("desktop:developer-reload-ui"/);
  assert.match(main, /ipcMain\.handle\("desktop:developer-restart-worker"/);
  assert.match(main, /ipcMain\.handle\("desktop:developer-preview-state"/);
  assert.match(main, /ipcMain\.handle\("desktop:developer-update-preview-environment"/);
  assert.match(main, /\/plugins\/\$\{encodeURIComponent\(pluginId\)\}\/worker\/restart/);
  assert.match(main, /assertRegistryWindowEvent\(event\)/);
  assert.doesNotMatch(registryPreload, /nodeIntegration|require\("node:/);
  assert.match(registryHtml, /default-src 'self'; style-src 'self'; script-src 'self'/);
  assert.match(registryHtml, /Review queue/);
});

test("keeps the Preview fixture bridge separate from Registry and Workspace privileges", async () => {
  const previewPreload = await readFile(previewPreloadPath, "utf8");
  assert.match(previewPreload, /require\("electron"\)/);
  assert.match(previewPreload, /ipcRenderer\.sendSync\("desktop:plugin-preview-fixture"\)/);
  assert.match(previewPreload, /contextBridge\.exposeInMainWorld\("__SPS_PLUGIN_PREVIEW_FIXTURE_V1__"/);
  assert.doesNotMatch(previewPreload, /invoke|send\(|nodeIntegration|require\("node:/);
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

test("notifies the renderer when SPS Identity Desktop sign-in state changes", async () => {
  const [main, accountController] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(accountControllerPath, "utf8"),
  ]);

  assert.match(main, /createSpsDesktopAccountController\(\{[\s\S]*?onStatusChanged: sendDesktopAccountStatus/);
  assert.match(accountController, /async function startSignIn\(\)[\s\S]*?recordAttempt\("succeeded"\)[\s\S]*?notifyStatus\(\);/);
  assert.match(accountController, /async function signOut\(\)[\s\S]*?await disconnectCurrentNode\(\)[\s\S]*?state\.encryptedDesktopAccount = null;[\s\S]*?persistState\(\{ rememberActiveConnection: false \}\)[\s\S]*?notifyStatus\(\);/);
});

test("resumes a pending legacy Owner Host adoption after Desktop restarts", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(
    main,
    /async function adoptLegacyOwnerHostIfNeeded\(\)[\s\S]*?startOwnerHost\(\{ activate: true \}\)[\s\S]*?legacyOwnerHostAdoptionPending = false/,
  );
  assert.match(
    main,
    /async function bootstrapOwnerHost\(\)[\s\S]*?legacyOwnerHostAdoptionPending[\s\S]*?adoptLegacyOwnerHostIfNeeded\(\)/,
  );
});

test("reopens an accepted Member workspace on Desktop restart", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(
    main,
    /void bootstrapOwnerHost\(\)\.finally\(\(\) => \{[\s\S]*?if \(isOwnerHostProfile\(\)\) return;[\s\S]*?maybeOpenWorkspaceForCurrentAccount\(\)/,
  );
});

test("returns an expired Member refresh token to the SPS sign-in screen without losing its team connection", async () => {
  const accountController = await readFile(accountControllerPath, "utf8");

  assert.match(
    accountController,
    /async function ensureAccessToken\(\)[\s\S]*?isExpiredRefreshToken\(error\)[\s\S]*?state\.encryptedDesktopAccount = null;[\s\S]*?recordAttempt\("failed", "SPS sign-in expired\. Sign in again to continue\."\)[\s\S]*?persistState\(\{ rememberActiveConnection: false \}\)/,
  );
});

test("shares one in-flight Desktop token refresh across concurrent SPS requests", async () => {
  const accountController = await readFile(accountControllerPath, "utf8");

  assert.match(accountController, /let refreshPromise = null;/);
  assert.match(
    accountController,
    /if \(!refreshPromise\) \{[\s\S]*?refreshPromise = \(async \(\) => withRefreshLock\([\s\S]*?refreshIdentity\([\s\S]*?\.finally\(\(\) => \{[\s\S]*?refreshPromise = null;/,
  );
  assert.match(accountController, /const persistedState = await loadPersistedState\(\);/);
  assert.match(accountController, /persistedAccount\?\.refreshToken && persistedAccount\.refreshToken !== account\.refreshToken/);
  assert.match(accountController, /return await refreshPromise;/);
});

test("keeps central OAuth secrets out of the Desktop renderer and uses SPS Identity", async () => {
  const [main, renderer, preload] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(new URL("../renderer/renderer.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/preload.cjs", import.meta.url), "utf8"),
  ]);

  assert.match(main, /configuredSpsIdentityUrl\(process\.env\.SPS_IDENTITY_URL\)/);
  assert.match(main, /startSpsDesktopIdentitySignIn/);
  assert.doesNotMatch(main, /SPS_DESKTOP_GOOGLE_CLIENT_SECRET/);
  assert.doesNotMatch(renderer, /configureGoogleAccount/);
  assert.doesNotMatch(preload, /configureGoogleAccount/);
});

test("establishes an SPS Identity Workspace session for every Owner Host", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /const usesIdentitySession = await establishSpsIdentityCoreSession\(hubOrigin\);/);
  assert.match(main, /requestHeaders\[SPS_DESKTOP_ACCESS_HEADER\] = ownerHostDesktopAccessToken/);
  assert.match(main, /signedIn:[\s\S]*?isOwnerHostProfile\(\) && currentAccountOwnsOwnerHost\(\)/);
});

test("uses the Desktop-only access token while the local Host creates its Identity session", async () => {
  const accountController = await readFile(accountControllerPath, "utf8");

  assert.match(
    accountController,
    /async function establishCoreSession\(hubOrigin\)[\s\S]*?ownerHostStatus\.url[\s\S]*?new URL\(hubOrigin\)\.origin === requireOwnerHostOrigin\(ownerHostStatus\.url\)[\s\S]*?headers\[desktopAccessHeader\] = getOwnerHostDesktopAccessToken\(\)/,
  );
  assert.doesNotMatch(
    accountController,
    /async function establishCoreSession\(hubOrigin\)[\s\S]*?isOwnerHostProfile/,
  );
});

test("refreshes Member Node metadata when reopening Workspace", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /import \{[\s\S]*?shouldRefreshJoinedDesktopNode,[\s\S]*?\} from "\.\/node-activation\.mjs";/);
  assert.match(main, /async function ensureJoinedDesktopNode\(\)[\s\S]*?shouldRefreshJoinedDesktopNode\([\s\S]*?return await connectNode\(\)/);
  assert.match(main, /appVersion: app\.getVersion\(\),[\s\S]*?capabilities,[\s\S]*?runners,[\s\S]*?transportPublicKey: identity\.transportPublicKeyPem/);
});

test("marks Desktop-owned Core mutations with their exact trusted origin", async () => {
  const [main, accountController] = await Promise.all([
    readFile(mainPath, "utf8"),
    readFile(accountControllerPath, "utf8"),
  ]);

  assert.match(
    accountController,
    /async function establishCoreSession\(hubOrigin\)[\s\S]*?origin: new URL\(hubOrigin\)\.origin/,
  );
  assert.match(
    accountController,
    /async function acceptIdentityInvite\(hubUrl, inviteToken\)[\s\S]*?const origin = requireHubOrigin\(hubUrl\);[\s\S]*?origin,[\s\S]*?cookie:/,
  );
  assert.match(
    main,
    /async function ownerHostApi\(pathname,[\s\S]*?const ownerHostOrigin = requireSpsOwnerHostOrigin\(ownerHostStatus\.url\);[\s\S]*?origin: ownerHostOrigin/,
  );
});

test("shuts down the Owner Host gracefully before quitting Desktop", async () => {
  const main = await readFile(mainPath, "utf8");

  assert.match(main, /async function stopDesktopRuntimeGracefully\(\) \{[\s\S]*?ownerHostManager\?\.stop\(\{ force: false \}\)/);
  assert.match(main, /app\.on\("before-quit", \(event\) => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?shutdownComplete = true;[\s\S]*?app\.quit\(\);/);
  assert.match(main, /desktopUpdateController\.stop\(\);/);
  assert.match(main, /createSpsDesktopUpdateController\(\{[\s\S]*?stopDesktopRuntimeGracefully,[\s\S]*?setQuitting:[\s\S]*?setShutdownComplete:/);
});

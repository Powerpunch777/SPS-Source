import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, safeStorage, session, shell, Tray } from "electron";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn as spawnChildProcess } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSpsE2eUserDataDirectory } from "./e2e-user-data.mjs";
import { resolveDesktopDevelopment, watchDevelopmentSurfaces } from "./development-mode.mjs";
import { coreRecoveryEnvironment, loadCoreRecoverySettings, saveCoreRecoverySettings } from "./core-recovery-store.mjs";
import { createCoreSettingsController } from "./core-settings-controller.mjs";
import { redactPluginPreviewDiagnosticMessage as redactLocalDiagnostic } from "./plugin-preview-diagnostics.mjs";
import {
  cancelSpsNodeCommands,
  createNodeIdentity,
  createNodeTransportIdentity,
  claimSpsNodeCommand,
  claimSpsPluginNodeRun,
  appendSpsPluginNodeRunEvent,
  checkSpsPluginNodeRunLease,
  completeSpsPluginNodeRun,
  disconnectSpsNode,
  executeSpsNodeCommand,
  getSpsDesktopAccount,
  listSpsCompanies,
  listSpsProjects,
  pollSpsDesktopAuth,
  probeSpsHub,
  registerSpsNode,
  scanLocalCapabilities,
  scanLocalRunnerProfiles,
  sendSpsNodeHeartbeat,
  SpsHubRequestError,
  startSpsDesktopAuth,
} from "@sps/desktop-node";
import {
  claimNextSpsNodeWork,
  executionTransportForSpsNodeWork,
  spsNodeWorkRequiresMarketplaceMcp,
} from "./node-command-poller.mjs";
import {
  buildInviteUrl,
  createSpsRoutedInviteCode,
  findSpsJoinUriArg,
  normalizeSpsInviteToken,
  parseSpsJoinUri,
  parseSpsRoutedInviteCode,
} from "./invite.mjs";
import { resolveSpsNodeDisplayName } from "./node-display-name.mjs";
import { withSpsDesktopRefreshLock } from "./desktop-refresh-lock.mjs";
import {
  canRunSpsNodeCommands,
  normalizeSpsNodeStatus,
  shouldRefreshJoinedDesktopNode,
} from "./node-activation.mjs";
import { isSpsTechnicalMemberAccessRemoved } from "./member-access.mjs";
import { emptyState, loadState, saveState } from "./state.mjs";
import {
  getSpsAccountConnection,
  normalizeSpsAccountConnection,
  setSpsAccountConnection,
} from "./account-connections.mjs";
import {
  addSpsWorkspaceSource,
  normalizeSpsWorkspaceSources,
  removeSpsWorkspaceSource,
  renameSpsWorkspaceSource,
} from "./workspace-sources.mjs";
import { createSpsDesktopUpdateController } from "./desktop-update-controller.mjs";
import { createSpsDesktopAccountController } from "./desktop-account-controller.mjs";
import { spsRequestError, spsRequestTimeoutSignal } from "./desktop-request.mjs";
import {
  createSpsDesktopAccessToken,
  isSpsDesktopTechnicalHostRequest,
  isSpsDesktopWorkspaceRequest,
  SPS_DESKTOP_ACCESS_HEADER,
  SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER,
  spsDesktopAccessEnvironment,
} from "./desktop-local-access.mjs";
import {
  createSpsOwnerHostManager,
  materializeStableSpsOwnerHostNode,
  materializeSpsOwnerHostRuntime,
  resolveSpsOwnerHostRuntime,
  spsOwnerHostBundledNodePath,
} from "./owner-host.mjs";
import { materializeSpsOwnerHostRuntimePackage } from "./owner-host-runtime-package.mjs";
import {
  configureSpsOwnerHostAuthenticatedLocal,
  configureSpsOwnerHostPrivateTeamAccess,
  ensureSpsOwnerHostConfig,
  rebaseSpsOwnerHostConfigPaths,
  spsOwnerHostUrl,
  updateSpsOwnerHostConfig,
} from "./owner-host-config.mjs";
import {
  createSpsDefaultMemoryManager,
  ensureSpsDefaultMemoryConfig,
  spsDefaultMemoryUrl,
} from "./default-memory-host.mjs";
import { isSpsHubApiUrl, requireSpsHubOrigin, requireSpsOwnerHostOrigin } from "./workspace-url.mjs";
import { requireSpsWorkspaceDirectory } from "./workspace-directory.mjs";
import {
  createSpsHostProjectShareCredential,
  sealSpsHostProjectShareCredential,
  spsHostProjectShareName,
  spsHostProjectSharePath,
  SPS_HOST_SHARE_CREDENTIAL_ALGORITHM,
  updateSpsHostProjectShareWindowsAccess,
} from "./host-project-share.mjs";
import {
  classifyHostProjectSourceMembers,
  unavailableHostProjectSourceMemberDialog,
} from "./host-project-source-members.mjs";
import {
  assertSpsOwnerVaultRestoreTarget,
  exportSpsOwnerVaultTransfer,
  importSpsOwnerVaultTransfer,
  inspectSpsOwnerVaultTransfer,
} from "./owner-vault-transfer.mjs";
import { inspectSpsPluginRuntime } from "./plugin-runtime.mjs";
import {
  installSpsAgentRuntimePack,
  listSpsAgentRuntimePacks,
  spsAgentRuntimePackEnvironment,
  spsAgentRuntimePacksRoot,
} from "./agent-runtime-packs.mjs";
import { stageSpsPluginArchive } from "./registry-staging.mjs";
import {
  acquireRegistryRelease,
  addRegistrySource,
  isBundledRegistrySource,
  inspectRegistrySource,
  loadRegistrySources,
  removeRegistrySource,
  SPS_OFFICIAL_REGISTRY_SOURCE,
} from "./registry-source-catalog.mjs";
import {
  connectDeveloperProject,
  loadDeveloperProjects,
  promoteDeveloperCandidate,
  publicDeveloperProject,
  publicDeveloperProjectState,
  recordDeveloperCandidate,
  removeDeveloperProject,
  rollbackDeveloperProject,
} from "./developer-project-store.mjs";
import { readDeveloperAgentFolder } from "./developer-agent-folder-reader.mjs";
import { chooseLocalAgentWorkingDirectory, registerDesktopAgentDirectoryIpc } from "./desktop-agent-directory-controller.mjs";
import {
  createDeveloperCommandEnvironment,
  runSpsDeveloperCommand,
} from "./developer-command-runner.mjs";
import {
  createDeveloperCandidateFromGateReports,
  createDeveloperConformanceEvidence,
  inspectDeveloperSourceTuple,
  stageDeveloperCandidate,
} from "./developer-build-pipeline.mjs";
import {
  cleanupPluginPreview,
  createPluginPreviewRuntime,
  ensurePluginPreviewFixture,
  updatePluginPreviewFixture,
} from "./plugin-preview-runtime.mjs";
import {
  appendDeveloperDiagnostic,
  clearDeveloperDiagnostics,
  developerDiagnosticFromGate,
  developerDiagnosticFromPreview,
  listDeveloperDiagnostics,
} from "./developer-diagnostics.mjs";
import { registerDesktopRegistryIpc } from "./desktop-registry-controller.mjs";
import { resolveDeveloperPackageArtifact } from "./developer-package-artifact.mjs";
import { normalizeDeveloperContext, getDeveloperContextLink, setDeveloperContextLink, clearDeveloperContextLink } from "./developer-context-store.mjs";
import { registerDesktopDeveloperContextIpc } from "./desktop-developer-context-controller.mjs";
import { buildDeveloperValidationFeedback } from "./developer-validation-feedback.mjs";
import { assessSpsPluginCompatibility } from "./plugin-compatibility.mjs";
import { loadSpsOfficialExtensionsCatalog } from "./official-extensions-catalog.mjs";
import {
  pluginDiscoveryVaultLayout,
  refreshSpsDiscoveryCatalog,
} from "./discovery-catalog.mjs";
import {
  disableSpsTailscaleServe,
  enableSpsTailscaleServe,
  inspectSpsTailscale,
  reconcileSpsTailscaleServe,
  spsTailnetPublicUrl,
} from "./team-access.mjs";
import {
  createSpsSetupWindowPreferences,
  createSpsWorkspaceWindowPreferences,
  isAllowedSpsWorkspaceNavigation,
  requireSpsExternalUrl,
} from "./window-security.mjs";
import {
  configuredSpsIdentityUrl,
  isExpiredSpsDesktopRefreshToken,
  refreshSpsDesktopIdentity,
  revokeSpsDesktopIdentity,
  startSpsDesktopIdentitySignIn,
} from "./sps-identity-account.mjs";
import { spsOwnerHostRuntimeEnvironment } from "./owner-host-identity.mjs";
import { resolveSpsServerAccess } from "./server-access-model.mjs";
import {
  disabledSpsExtensionStatus,
  isSpsDefaultMemoryEnabled,
  isSpsPluginDiscoveryEnabled,
  isSpsRoomWorkplaneBundled,
} from "./bundled-extensions.mjs";
import { synchronizeSpsTeamWorkplaneConfig } from "./bundled-workplane-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const developmentMode = resolveDesktopDevelopment({
  packaged: app.isPackaged,
  enabled: process.env.SPS_DESKTOP_DEV === "1",
  desktopRoot: path.resolve(__dirname, ".."),
  vaultBase: app.getPath("appData"),
  e2e: process.env.SPS_DESKTOP_E2E === "1",
});
if (developmentMode) {
  app.setPath("userData", developmentMode.profile);
  app.on("browser-window-created", (_event, window) => {
    window.on("page-title-updated", (event, title) => {
      event.preventDefault();
      window.setTitle(`[DEV] ${title}`);
    });
  });
}

function configureIsolatedE2eUserData() {
  const target = resolveSpsE2eUserDataDirectory();
  if (!target) return;
  // Chromium's --user-data-dir does not change Electron's app userData path.
  // Set both in E2E so an automated run can never reuse a person's live Host.
  app.setPath("userData", target);
}

configureIsolatedE2eUserData();
const SPS_START_HIDDEN_ARGUMENT = "--sps-start-hidden";
const opensCoreSettingsOnLaunch = process.argv.includes("--sps-core-settings");
let mainWindow = null;
let ownerCreationInProgress = false;
let workspaceWindow = null;
let registryWindow = null;
let registryDeveloperContext = null;
let pluginPreviewWindow = null;
let pluginPreviewRuntime = null;
let pluginPreviewClosing = false;
const activeDeveloperProjectOperations = new Set();
let officialExtensionsWindow = null;
let coreSettingsController = null;
let ownerHostRecoveryPluginsDisabled = null;
let state = emptyState();
let pendingAuth = null;
let desktopAccountController = null;
let heartbeatTimer = null;
let commandPollTimer = null;
let commandPollInFlight = false;
let pendingJoin = null;
let pendingJoinError = null;
let rendererReadyForJoinLinks = false;
let workspaceOrigin = null;
let setupMode = false;
let nodeRuntimeStatus = emptyNodeRuntimeStatus();
let tray = null;
let isQuitting = false;
let shutdownPromise = null;
let shutdownComplete = false;
const startedHidden = process.argv.includes(SPS_START_HIDDEN_ARGUMENT);
// Status is rendered often by the setup screen. Do not synchronously ask
// Windows for login-item settings on that hot IPC path: some Windows builds
// can stall the call while their startup registration is being refreshed.
let launchAtLoginEnabled = false;
const desktopUpdateController = createSpsDesktopUpdateController({
  app,
  dialog,
  getMainWindow: () => mainWindow,
  stopDesktopRuntimeGracefully,
  setQuitting: () => { isQuitting = true; },
  setShutdownComplete: () => { shutdownComplete = true; },
});
let ownerHostManager = null;
let ownerHostRuntimePromise = null;
let defaultMemoryManager = null;
let defaultMemoryStatus = disabledSpsExtensionStatus();
let ownerHostStatus = {
  state: "initializing",
  url: null,
  startedAt: null,
  lastError: null,
  vaultPath: null,
};
let lastTeamWorkplaneBindingUrl = null;
let teamWorkplaneSyncPromise = null;
let lastTeamWorkplaneSyncAttempt = null;
const TEAM_WORKPLANE_SYNC_RETRY_MS = 30_000;
// This is never persisted. It separates the visible SPS Desktop Workspace from
// a normal browser pointed at the loopback Owner Host.
const ownerHostDesktopAccessToken = createSpsDesktopAccessToken();
const ownerHostAgentJwtSecret = randomBytes(48).toString("base64url");
let ownerHostCompanies = [];
let pluginRuntimeStatus = {
  state: "checking",
  command: null,
  npmCli: null,
  version: null,
  message: "Checking SPS plugin runtime.",
};
let agentRuntimePacks = [];

function emptyNodeRuntimeStatus() {
  return {
    lastHeartbeatAt: null,
    heartbeatError: null,
    lastCommandPollAt: null,
    commandPollError: null,
  };
}

function resetNodeRuntimeStatus() {
  nodeRuntimeStatus = emptyNodeRuntimeStatus();
}

function refreshLaunchAtLoginStatus() {
  try {
    launchAtLoginEnabled = Boolean(app.getLoginItemSettings().openAtLogin);
  } catch {
    // The cached value remains usable when Windows startup registration is unavailable.
  }
}

function safeNodeCommandFailure(error) {
  const message = error instanceof Error ? error.message.trim() : "";
  const safePrefixes = [
    "No local workspace is configured",
    "No local workspace",
    "Configured workspace is not a directory",
    "Selected Codex profile is not signed in",
    "SPS Desktop rejected",
    "SPS Desktop could not",
    "SPS Hub did not provide",
  ];
  if (message && safePrefixes.some((prefix) => message.startsWith(prefix))) {
    return `The latest local command could not complete: ${message.slice(0, 420)}`;
  }
  return "The latest local command could not complete. Check its Task run for details.";
}

async function initializeUpdates() {
  await desktopUpdateController.initialize();
}

async function checkForDesktopBetaUpdate() {
  return desktopUpdateController.check();
}

function requireEncryption() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows secure storage is unavailable. SPS Desktop will not store credentials in plaintext.");
  }
}

function encrypt(value) {
  requireEncryption();
  return safeStorage.encryptString(value).toString("base64");
}

function decrypt(value) {
  requireEncryption();
  return safeStorage.decryptString(Buffer.from(value, "base64"));
}

async function persistState({ rememberActiveConnection = true } = {}) {
  if (rememberActiveConnection) rememberCurrentAccountConnection();
  await saveState(app.getPath("userData"), state);
}

function currentIdentity() {
  if (!state.identity?.publicKeyPem || !state.identity?.encryptedPrivateKey) return null;
  return {
    algorithm: "ed25519",
    publicKeyPem: state.identity.publicKeyPem,
    privateKeyPem: decrypt(state.identity.encryptedPrivateKey),
    transportAlgorithm: state.identity.transportAlgorithm ?? null,
    transportPublicKeyPem: state.identity.transportPublicKeyPem ?? null,
    transportPrivateKeyPem: state.identity.encryptedTransportPrivateKey
      ? decrypt(state.identity.encryptedTransportPrivateKey)
      : null,
  };
}

async function ensureIdentity() {
  const identity = currentIdentity();
  if (identity?.transportPublicKeyPem && identity.transportPrivateKeyPem) return identity;
  if (identity) {
    const transport = createNodeTransportIdentity();
    state.identity = {
      ...state.identity,
      transportAlgorithm: transport.transportAlgorithm,
      transportPublicKeyPem: transport.transportPublicKeyPem,
      encryptedTransportPrivateKey: encrypt(transport.transportPrivateKeyPem),
    };
    await persistState();
    return currentIdentity();
  }
  const created = createNodeIdentity();
  state.identity = {
    publicKeyPem: created.publicKeyPem,
    encryptedPrivateKey: encrypt(created.privateKeyPem),
    transportAlgorithm: created.transportAlgorithm,
    transportPublicKeyPem: created.transportPublicKeyPem,
    encryptedTransportPrivateKey: encrypt(created.transportPrivateKeyPem),
  };
  await persistState();
  return created;
}

function currentBoardToken() {
  return state.encryptedBoardApiToken ? decrypt(state.encryptedBoardApiToken) : null;
}

function currentDesktopAccount() {
  return desktopAccountController?.currentAccount() ?? null;
}

function currentDesktopAccountSubject() {
  return currentDesktopAccount()?.subject ?? null;
}

async function ensureDesktopIdentityAccessToken() {
  return desktopAccountController.ensureAccessToken();
}

async function establishSpsIdentityCoreSession(hubOrigin) {
  return desktopAccountController.establishCoreSession(hubOrigin);
}

async function clearSpsIdentityCoreSessions() {
  return desktopAccountController.clearCoreSessions();
}

function isSpsIdentityRemoteProfile(profile = state.profile) {
  return profile?.connectionKind === "remote" && profile?.authMode === "sps-identity";
}

async function resolveSpsCoreRequestAccess(hubUrl, profile = state.profile) {
  const accessToken = currentBoardToken();
  if (accessToken) return { accessToken, sessionCookie: null };
  if (!isSpsIdentityRemoteProfile(profile)) return { accessToken: null, sessionCookie: null };
  const sessionCookie = await establishSpsIdentityCoreSession(hubUrl);
  return { accessToken: null, sessionCookie };
}

async function requireSpsCoreRequestAccess(hubUrl, profile = state.profile) {
  const access = await resolveSpsCoreRequestAccess(hubUrl, profile);
  if (!access.accessToken && !access.sessionCookie) {
    throw new Error("Sign in to SPS Desktop before contacting this SPS Server.");
  }
  return access;
}

async function refreshSpsIdentityTeamContext() {
  if (!isSpsIdentityRemoteProfile() || !state.profile) return null;
  const access = await requireSpsCoreRequestAccess(state.profile.hubUrl);
  const companies = await listSpsCompanies({ hubUrl: state.profile.hubUrl, ...access });
  state.companies = normalizeCompanyList(companies);
  if (!state.profile.companyId && state.companies.length === 1) {
    state.profile.companyId = state.companies[0].id;
  }
  await persistState();
  if (state.profile.companyId) await refreshProjects();
  return state.companies;
}

async function acceptSpsIdentityInvite(hubUrl, inviteToken) {
  return desktopAccountController.acceptIdentityInvite(hubUrl, inviteToken);
}

function rememberCurrentAccountConnection() {
  const subject = currentDesktopAccountSubject();
  if (!subject || !state.profile) return;
  state.accountConnections = setSpsAccountConnection(state.accountConnections, subject, state.profile);
}

function clearActiveConnectionState() {
  stopNodeScheduling();
  state.profile = null;
  state.identity = null;
  state.nodeId = null;
  state.nodeStatus = null;
  state.transportKeyPublishedAt = null;
  state.encryptedBoardApiToken = null;
  state.companies = [];
  state.projects = [];
  pendingAuth = null;
  resetNodeRuntimeStatus();
  closeWorkspaceWindow();
}

function suspendExpiredAccountConnection() {
  // Keep the account-scoped Node identity intact while SPS Identity is signed
  // out. A refreshed or newly completed sign-in for the same account can then
  // resume the already approved computer instead of registering a duplicate
  // pending Node. Account switching still uses clearActiveConnectionState().
  stopNodeScheduling();
  state.encryptedBoardApiToken = null;
  state.companies = [];
  state.projects = [];
  pendingAuth = null;
  resetNodeRuntimeStatus();
  closeWorkspaceWindow();
}

function profilesMatch(left, right) {
  return JSON.stringify(normalizeSpsAccountConnection(left)) === JSON.stringify(normalizeSpsAccountConnection(right));
}

// v1-v4 had one machine-wide `profile`. On first v5 launch, claim that
  // legacy record for the already signed-in SPS account only. Later account
// switches never inherit another account's routing or local-workspace record.
function restoreCurrentAccountConnection() {
  const account = currentDesktopAccount();
  if (!account) {
    suspendExpiredAccountConnection();
    return false;
  }
  if (Object.keys(state.accountConnections).length === 0 && state.profile) {
    state.accountConnections = setSpsAccountConnection(state.accountConnections, account.subject, state.profile);
    if (isOwnerHostProfile(state.profile) && !state.ownerHostOwnerSubject) {
      state.ownerHostOwnerSubject = account.subject;
    }
  }
  let savedProfile = getSpsAccountConnection(state.accountConnections, account.subject);
  if (
    savedProfile
    && isOwnerHostProfile(savedProfile)
    && state.ownerHostOwnerSubject
    && state.ownerHostOwnerSubject !== account.subject
  ) {
    savedProfile = null;
  }
  if (!savedProfile) {
    clearActiveConnectionState();
    return false;
  }
  if (!profilesMatch(state.profile, savedProfile)) {
    clearActiveConnectionState();
    state.profile = savedProfile;
  }
  return true;
}

function currentAccountOwnsOwnerHost() {
  const subject = currentDesktopAccountSubject();
  return Boolean(subject && state.ownerHostOwnerSubject === subject);
}

function configuredDesktopIdentityUrl() {
  return configuredSpsIdentityUrl(process.env.SPS_IDENTITY_URL);
}

function ensureDesktopDeviceId() {
  const existing = String(state.desktopDeviceId ?? "").trim();
  if (/^[A-Za-z0-9._:-]{16,160}$/.test(existing)) return existing;
  const created = `sps-desktop-${randomBytes(24).toString("base64url")}`;
  state.desktopDeviceId = created;
  return created;
}

function safeDesktopAccountError(error) {
  const message = error instanceof Error ? error.message.trim() : String(error ?? "").trim();
  if (!message) return "SPS sign-in could not finish.";
  return message.slice(0, 360);
}

function recordDesktopJoinAttempt(status, error = null) {
  state.desktopJoinLastAttempt = {
    status,
    at: new Date().toISOString(),
    error: error ? safeDesktopAccountError(error) : null,
  };
}

async function adoptLegacyOwnerHostIfNeeded() {
  if (!state.legacyOwnerHostAdoptionPending || state.ownerHostOwnerSubject || !currentDesktopAccount()) {
    return false;
  }
  await startOwnerHost({ activate: true });
  state.legacyOwnerHostAdoptionPending = false;
  await persistState();
  return true;
}

function sendDesktopAccountStatus() {
  createApplicationMenu();
  refreshTrayMenu();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop:desktop-account-changed", publicStatus());
}

function openSpsExternalUrl(value) {
  return shell.openExternal(requireSpsExternalUrl(value));
}

async function startDesktopAccountSignIn() {
  return desktopAccountController.signIn();
}

async function signOutDesktopAccount() {
  return desktopAccountController.signOut();
}

function currentTeamCredentials() {
  if (!state.encryptedTeamCredentials) return null;
  try {
    const parsed = JSON.parse(decrypt(state.encryptedTeamCredentials));
    return typeof parsed?.authSecret === "string" && parsed.authSecret.trim()
      ? { authSecret: parsed.authSecret }
      : null;
  } catch {
    return null;
  }
}

function currentHostProjectShareSecrets() {
  if (!state.encryptedHostProjectShareSecrets) return { version: 1, projects: {} };
  try {
    const parsed = JSON.parse(decrypt(state.encryptedHostProjectShareSecrets));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid protected source-access state");
    }
    const projects = parsed.projects;
    if (!projects || typeof projects !== "object" || Array.isArray(projects)) {
      throw new Error("invalid protected source-access project records");
    }
    return { version: 1, projects: { ...projects } };
  } catch {
    throw new Error("Windows secure storage could not read SPS Host project source credentials. Existing Guest access was not changed.");
  }
}

async function saveHostProjectShareSecrets(value) {
  state.encryptedHostProjectShareSecrets = encrypt(JSON.stringify({ version: 1, projects: value.projects ?? {} }));
  await persistState();
}

function assertOwnerHostProjectSourceAccess() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Only the signed-in SPS Owner Host can choose or change a project's source folder.");
  }
}

function assertHostWorkspaceSourceAccess() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Only the signed-in SPS Host can manage Workspace source folders.");
  }
}

function currentHostWorkspaceSources() {
  return normalizeSpsWorkspaceSources(state.profile?.workspaceSources);
}

function hostWorkspaceSourceCompanyId() {
  const companyId = String(state.profile?.companyId || state.teamAccess?.companyId || "").trim();
  if (!companyId) throw new Error("Choose an SPS Workspace before managing Host source folders.");
  return companyId;
}

async function loadCoreHostWorkspaceSources() {
  const companyId = hostWorkspaceSourceCompanyId();
  const value = await ownerHostApi(`/companies/${encodeURIComponent(companyId)}/sps-workspace-sources`, {
    ownerBootstrap: true,
  });
  if (!value || typeof value !== "object" || !Array.isArray(value.sources)) {
    throw new Error("SPS Owner Host returned an invalid Workspace Source list.");
  }
  return {
    companyId,
    sources: value.sources,
    nodes: Array.isArray(value.nodes) ? value.nodes : [],
  };
}

async function synchronizeHostWorkspaceSources() {
  const localSources = currentHostWorkspaceSources();
  const { companyId, sources: coreSources, nodes } = await loadCoreHostWorkspaceSources();
  const knownCoreSources = [...coreSources];
  const usedCoreIds = new Set();
  let changed = false;
  const nextSources = [];

  for (const localSource of localSources) {
    let coreSource = knownCoreSources.find((source) => source?.id === localSource.id) ?? null;
    if (!coreSource) {
      coreSource = knownCoreSources.find((source) => (
        !usedCoreIds.has(source?.id)
        && String(source?.displayName ?? "").trim() === localSource.name
      )) ?? null;
    }
    if (!coreSource) {
      coreSource = await ownerHostApi(`/companies/${encodeURIComponent(companyId)}/sps-workspace-sources`, {
        method: "POST",
        ownerBootstrap: true,
        body: { displayName: localSource.name },
      });
      knownCoreSources.push(coreSource);
    }
    usedCoreIds.add(coreSource.id);
    const synchronized = {
      id: String(coreSource.id),
      name: String(coreSource.displayName ?? localSource.name),
      sourcePath: localSource.sourcePath,
    };
    if (
      synchronized.id !== localSource.id
      || synchronized.name !== localSource.name
    ) changed = true;
    nextSources.push(synchronized);
  }

  // A transferred Owner Vault can contain Core Source handles before this
  // computer has chosen its corresponding local folders. Keep those handles
  // visible but never invent a path on behalf of the Host.
  for (const coreSource of knownCoreSources) {
    if (!coreSource?.id || usedCoreIds.has(coreSource.id)) continue;
    nextSources.push({
      id: String(coreSource.id),
      name: String(coreSource.displayName ?? "Workspace Source"),
      sourcePath: "",
    });
    changed = true;
  }

  if (changed) {
    state.profile.workspaceSources = nextSources;
    await persistState();
  }
  return {
    sources: nextSources.map((source) => {
      const coreSource = coreSources.find((candidate) => candidate?.id === source.id) ?? null;
      const grants = new Map(
        (Array.isArray(coreSource?.nodeGrants) ? coreSource.nodeGrants : [])
          .map((grant) => [grant?.nodeId, grant?.status]),
      );
      return {
        ...source,
        routeStatus: coreSource?.routeStatus === "ready" ? "ready" : "unavailable",
        memberNodes: nodes
          .filter((node) => node?.id && node.id !== state.nodeId)
          .map((node) => ({
            id: String(node.id),
            displayName: String(node.displayName ?? "Member Node"),
            status: String(node.status ?? "unknown"),
            keyVerified: Boolean(node.keyVerifiedAt && node.transportPublicKey),
            sourceAccess: grants.get(node.id) === "granted" ? "granted" : "not_granted",
          })),
      };
    }),
    privateTeamAccessEnabled: isTeamAccessEnabled(),
  };
}

async function listHostWorkspaceSources() {
  assertHostWorkspaceSourceAccess();
  return await synchronizeHostWorkspaceSources();
}

async function chooseHostWorkspaceSource() {
  assertHostWorkspaceSourceAccess();
  const selection = await dialog.showOpenDialog(workspaceWindow ?? mainWindow ?? undefined, {
    title: "Choose a source folder on this SPS Host",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return await listHostWorkspaceSources();
  const sourcePath = await requireSpsWorkspaceDirectory(selection.filePaths[0]);
  const companyId = hostWorkspaceSourceCompanyId();
  const created = await ownerHostApi(`/companies/${encodeURIComponent(companyId)}/sps-workspace-sources`, {
    method: "POST",
    ownerBootstrap: true,
    body: { displayName: path.basename(sourcePath) || "Source" },
  });
  if (!created?.id || !created?.displayName) {
    throw new Error("SPS Owner Host did not create a Workspace Source handle.");
  }
  const source = {
    id: String(created.id),
    name: String(created.displayName),
    sourcePath,
  };
  state.profile.workspaceSources = addSpsWorkspaceSource(currentHostWorkspaceSources(), source);
  await persistState();
  return await listHostWorkspaceSources();
}

async function renameHostWorkspaceSource(sourceId, name) {
  assertHostWorkspaceSourceAccess();
  const companyId = hostWorkspaceSourceCompanyId();
  const updated = await ownerHostApi(
    `/companies/${encodeURIComponent(companyId)}/sps-workspace-sources/${encodeURIComponent(String(sourceId ?? ""))}`,
    { method: "PATCH", ownerBootstrap: true, body: { displayName: name } },
  );
  state.profile.workspaceSources = renameSpsWorkspaceSource(
    currentHostWorkspaceSources(),
    sourceId,
    String(updated?.displayName ?? name),
  );
  await persistState();
  return await listHostWorkspaceSources();
}

async function removeHostWorkspaceSource(sourceId) {
  assertHostWorkspaceSourceAccess();
  const normalizedSourceId = String(sourceId ?? "");
  const secrets = currentHostProjectShareSecrets();
  const protectedRecord = secrets.projects[normalizedSourceId];
  if (protectedRecord && Object.keys(protectedRecord.grants ?? {}).length > 0) {
    throw new Error("Revoke every Member Node before removing this Workspace Source.");
  }
  if (protectedRecord?.shareName && protectedRecord?.sourcePath) {
    await updateSpsHostProjectShareWindowsAccess({
      sourcePath: protectedRecord.sourcePath,
      shareName: protectedRecord.shareName,
      accountName: "",
      password: "",
      action: "remove",
    }, { temporaryRoot: app.getPath("temp") });
    delete secrets.projects[normalizedSourceId];
    await saveHostProjectShareSecrets(secrets);
  }
  const companyId = hostWorkspaceSourceCompanyId();
  await ownerHostApi(
    `/companies/${encodeURIComponent(companyId)}/sps-workspace-sources/${encodeURIComponent(normalizedSourceId)}`,
    { method: "DELETE", ownerBootstrap: true },
  );
  state.profile.workspaceSources = removeSpsWorkspaceSource(currentHostWorkspaceSources(), sourceId);
  await persistState();
  return await listHostWorkspaceSources();
}

function assertHostWorkspaceSourceManager() {
  assertHostWorkspaceSourceAccess();
  if (!isTeamAccessEnabled() || !state.teamAccess?.hostname) {
    throw new Error("Enable private team access before sharing a Workspace Source with a Member Node.");
  }
}

function hostWorkspaceSourcePath(sourceId) {
  const normalizedId = String(sourceId ?? "").trim();
  const source = currentHostWorkspaceSources().find((candidate) => candidate.id === normalizedId) ?? null;
  if (!source?.sourcePath) {
    throw new Error("Choose this Workspace Source folder on the SPS Host before granting a Member Node access.");
  }
  return source.sourcePath;
}

async function workspaceSourceStatus(sourceId) {
  assertHostWorkspaceSourceManager();
  const normalizedId = String(sourceId ?? "").trim();
  if (!normalizedId) throw new Error("Workspace Source ID is required.");
  const snapshot = await loadCoreHostWorkspaceSources();
  const source = snapshot.sources.find((candidate) => candidate?.id === normalizedId) ?? null;
  if (!source) throw new Error("This Workspace Source is no longer available on the SPS Host.");
  return { companyId: snapshot.companyId, source, nodes: snapshot.nodes };
}

async function grantHostWorkspaceSourceToNode(sourceId, nodeId) {
  const sourcePath = hostWorkspaceSourcePath(sourceId);
  const status = await workspaceSourceStatus(sourceId);
  const target = status.nodes.find((node) => node?.id === nodeId) ?? null;
  if (!target || target.status !== "active" || !target.keyVerifiedAt || !target.transportPublicKey) {
    throw new Error("Choose an active Member Node with a verified transport key before granting Workspace Source access.");
  }
  const secrets = currentHostProjectShareSecrets();
  const existing = secrets.projects[sourceId] && typeof secrets.projects[sourceId] === "object"
    ? secrets.projects[sourceId]
    : null;
  const shareName = existing?.shareName ?? spsHostProjectShareName(sourceId);
  const sharePath = spsHostProjectSharePath(state.teamAccess.hostname, shareName);
  const grants = existing?.grants && typeof existing.grants === "object" ? { ...existing.grants } : {};
  const credential = grants[nodeId] && typeof grants[nodeId] === "object"
    ? grants[nodeId]
    : createSpsHostProjectShareCredential(nodeId, undefined, sourceId);
  await updateSpsHostProjectShareWindowsAccess({
    sourcePath,
    shareName,
    accountName: credential.username,
    password: credential.password,
    action: "grant",
  }, { temporaryRoot: app.getPath("temp") });
  secrets.projects[sourceId] = {
    shareName,
    sharePath,
    sourcePath,
    grants: { ...grants, [nodeId]: credential },
  };
  await saveHostProjectShareSecrets(secrets);
  try {
    await ownerHostApi(
      `/companies/${encodeURIComponent(status.companyId)}/sps-workspace-sources/${encodeURIComponent(sourceId)}`,
      { method: "PATCH", ownerBootstrap: true, body: { sharePath } },
    );
    const envelope = sealSpsHostProjectShareCredential({
      sharePath,
      hostAccountName: process.env.COMPUTERNAME?.trim() || os.hostname(),
      transportPublicKey: target.transportPublicKey,
      username: credential.username,
      password: credential.password,
    });
    await ownerHostApi(
      `/companies/${encodeURIComponent(status.companyId)}/sps-workspace-sources/${encodeURIComponent(sourceId)}/nodes/${encodeURIComponent(nodeId)}`,
      {
        method: "PUT",
        ownerBootstrap: true,
        body: { credentialAlgorithm: SPS_HOST_SHARE_CREDENTIAL_ALGORITHM, credentialEnvelope: envelope },
      },
    );
  } catch (error) {
    const cleanupErrors = [];
    await updateSpsHostProjectShareWindowsAccess({
      sourcePath,
      shareName,
      accountName: credential.username,
      password: credential.password,
      action: "revoke",
    }, { temporaryRoot: app.getPath("temp") }).catch((cleanupError) => cleanupErrors.push(cleanupError));
    if (Object.keys(grants).length === 0) {
      await updateSpsHostProjectShareWindowsAccess({
        sourcePath,
        shareName,
        accountName: "",
        password: "",
        action: "remove",
      }, { temporaryRoot: app.getPath("temp") }).catch((cleanupError) => cleanupErrors.push(cleanupError));
      await ownerHostApi(
        `/companies/${encodeURIComponent(status.companyId)}/sps-workspace-sources/${encodeURIComponent(sourceId)}`,
        { method: "PATCH", ownerBootstrap: true, body: { sharePath: null } },
      ).catch((cleanupError) => cleanupErrors.push(cleanupError));
    }
    if (existing) secrets.projects[sourceId] = existing;
    else delete secrets.projects[sourceId];
    await saveHostProjectShareSecrets(secrets).catch((cleanupError) => cleanupErrors.push(cleanupError));
    if (cleanupErrors.length > 0) {
      throw new Error(`${error instanceof Error ? error.message : String(error)} SPS could not fully roll back the failed Workspace Source grant: ${cleanupErrors.map((cleanupError) => cleanupError instanceof Error ? cleanupError.message : String(cleanupError)).join("; ")}`);
    }
    throw error;
  }
  return { node: { id: target.id, displayName: target.displayName }, sharePath };
}

async function revokeHostWorkspaceSourceFromNode(sourceId, nodeId) {
  const sourcePath = hostWorkspaceSourcePath(sourceId);
  const status = await workspaceSourceStatus(sourceId);
  const secrets = currentHostProjectShareSecrets();
  const record = secrets.projects[sourceId];
  const credential = record?.grants?.[nodeId] ?? null;
  if (!credential?.username) {
    throw new Error("This Host no longer has the local credential required to revoke the Workspace Source safely. Remove the stale SPS share account manually before regranting.");
  }
  await updateSpsHostProjectShareWindowsAccess({
    sourcePath,
    shareName: record.shareName,
    accountName: credential.username,
    password: credential.password ?? "",
    action: "revoke",
  }, { temporaryRoot: app.getPath("temp") });
  // Remove the local Windows credential first. If the Core request fails,
  // direct SMB access is already closed and a later retry can reconcile it.
  await ownerHostApi(
    `/companies/${encodeURIComponent(status.companyId)}/sps-workspace-sources/${encodeURIComponent(sourceId)}/nodes/${encodeURIComponent(nodeId)}`,
    { method: "DELETE", ownerBootstrap: true },
  );
  const nextGrants = { ...record.grants };
  delete nextGrants[nodeId];
  if (Object.keys(nextGrants).length === 0) {
    await updateSpsHostProjectShareWindowsAccess({
      sourcePath,
      shareName: record.shareName,
      accountName: "",
      password: "",
      action: "remove",
    }, { temporaryRoot: app.getPath("temp") });
    await ownerHostApi(
      `/companies/${encodeURIComponent(status.companyId)}/sps-workspace-sources/${encodeURIComponent(sourceId)}`,
      { method: "PATCH", ownerBootstrap: true, body: { sharePath: null } },
    );
    delete secrets.projects[sourceId];
  } else {
    secrets.projects[sourceId] = { ...record, grants: nextGrants };
  }
  await saveHostProjectShareSecrets(secrets);
  return { nodeId, revoked: true };
}

async function showHostWorkspaceSourceManager(sourceId) {
  const snapshot = await listHostWorkspaceSources();
  const source = snapshot.sources.find((candidate) => candidate.id === sourceId) ?? null;
  if (!source) throw new Error("This Workspace Source is no longer available on the SPS Host.");
  const members = source.memberNodes.filter((node) => node.status === "active" && node.keyVerified).slice(0, 8);
  if (members.length === 0) {
    await dialog.showMessageBox(workspaceWindow ?? mainWindow ?? undefined, {
      type: "info",
      title: "Workspace Source access",
      message: "No active Member Node is ready for Source access.",
      detail: "Ask the Member to connect SPS Desktop, then approve its Node before returning here.",
    });
    return null;
  }
  const buttons = members.map((node) => (
    node.sourceAccess === "granted" ? `Revoke ${node.displayName}` : `Grant ${node.displayName}`
  ));
  buttons.push("Close");
  const choice = await dialog.showMessageBox(workspaceWindow ?? mainWindow ?? undefined, {
    type: "question",
    title: "Workspace Source access",
    message: `Choose a Member Node for ${source.name}.`,
    detail: "SPS encrypts a Windows share credential to that computer. A plugin must still select this Source and an approved Runtime for each execution grant.",
    buttons,
    cancelId: buttons.length - 1,
  });
  const target = members[choice.response] ?? null;
  if (!target) return null;
  const result = target.sourceAccess === "granted"
    ? await revokeHostWorkspaceSourceFromNode(sourceId, target.id)
    : await grantHostWorkspaceSourceToNode(sourceId, target.id);
  await dialog.showMessageBox(workspaceWindow ?? mainWindow ?? undefined, {
    type: "info",
    title: "Workspace Source access updated",
    message: target.sourceAccess === "granted"
      ? `${target.displayName} can no longer use this Workspace Source.`
      : `${target.displayName} can now use this Workspace Source through approved plugin runs.`,
    detail: target.sourceAccess === "granted" ? "The Node's Windows share account was removed." : `Managed route: ${result.sharePath}`,
  });
  return result;
}

function assertHostProjectSourceManager() {
  assertOwnerHostProjectSourceAccess();
  if (!isTeamAccessEnabled() || !state.teamAccess?.hostname) {
    throw new Error("Enable private team access before sharing a project source folder with a Member Node.");
  }
}

function ownerHostProjectSourcePath(projectId) {
  const workspacePath = typeof state.profile?.projectWorkspaces?.[projectId] === "string"
    ? state.profile.projectWorkspaces[projectId].trim()
    : "";
  if (!workspacePath) {
    throw new Error("Choose this project's source folder on the Owner Host before granting a Member Node access.");
  }
  return workspacePath;
}

function normalizedProjectId(value) {
  const projectId = String(value ?? "").trim();
  if (!projectId) throw new Error("Project ID is required");
  return projectId;
}

function assertHostProjectSourceCanChange(projectId) {
  const record = currentHostProjectShareSecrets().projects[projectId];
  const activeGrantCount = Object.keys(record?.grants ?? {}).length;
  if (activeGrantCount > 0) {
    throw new Error("Revoke every Member's source access before changing or clearing this Host project folder.");
  }
}

async function listHostProjectSourcesForWorkspace() {
  assertOwnerHostProjectSourceAccess();
  await refreshProjects();
  const mappings = state.profile?.projectWorkspaces ?? {};
  return {
    privateTeamAccessEnabled: isTeamAccessEnabled(),
    projects: state.projects.map((project) => ({
      id: project.id,
      name: project.name,
      sourcePath: typeof mappings[project.id] === "string" ? mappings[project.id] : "",
    })),
  };
}

async function chooseHostProjectSourceForWorkspace(projectId) {
  assertOwnerHostProjectSourceAccess();
  const normalizedId = normalizedProjectId(projectId);
  await refreshProjects();
  if (!state.projects.some((project) => project.id === normalizedId)) {
    throw new Error("This SPS project is no longer available to the Owner Host.");
  }
  assertHostProjectSourceCanChange(normalizedId);
  const selection = await dialog.showOpenDialog(workspaceWindow ?? mainWindow ?? undefined, {
    title: "Choose source folder on this Owner Host",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return await listHostProjectSourcesForWorkspace();
  const workspacePath = await requireSpsWorkspaceDirectory(selection.filePaths[0]);
  state.profile.projectWorkspaces = {
    ...(state.profile?.projectWorkspaces ?? {}),
    [normalizedId]: workspacePath,
  };
  await persistState();
  return await listHostProjectSourcesForWorkspace();
}

async function clearHostProjectSourceForWorkspace(projectId) {
  assertOwnerHostProjectSourceAccess();
  const normalizedId = normalizedProjectId(projectId);
  assertHostProjectSourceCanChange(normalizedId);
  const projectWorkspaces = { ...(state.profile?.projectWorkspaces ?? {}) };
  delete projectWorkspaces[normalizedId];
  state.profile.projectWorkspaces = projectWorkspaces;
  await persistState();
  return await listHostProjectSourcesForWorkspace();
}

async function getHostProjectShareStatus(projectId) {
  assertHostProjectSourceManager();
  const value = await ownerHostApi(`/projects/${encodeURIComponent(projectId)}/sps-host-share`, {
    ownerBootstrap: true,
  });
  if (!value || typeof value !== "object" || !Array.isArray(value.nodes)) {
    throw new Error("SPS Owner Host returned an invalid project source access status.");
  }
  return value;
}

async function grantHostProjectSourceToNode(projectId, nodeId) {
  assertHostProjectSourceManager();
  const sourcePath = ownerHostProjectSourcePath(projectId);
  const status = await getHostProjectShareStatus(projectId);
  const target = status.nodes.find((node) => node?.id === nodeId) ?? null;
  if (!target || target.status !== "active" || !target.keyVerifiedAt || !target.transportPublicKey) {
    throw new Error("Choose an active SPS Member Node with a current transport key before granting project source access.");
  }
  const secrets = currentHostProjectShareSecrets();
  const existing = secrets.projects[projectId] && typeof secrets.projects[projectId] === "object"
    ? secrets.projects[projectId]
    : null;
  const shareName = existing?.shareName ?? spsHostProjectShareName(projectId);
  const sharePath = spsHostProjectSharePath(state.teamAccess.hostname, shareName);
  if (status.share?.sharePath && String(status.share.sharePath).toLowerCase() !== sharePath.toLowerCase()) {
    throw new Error("This project is already linked to another SPS Host share. Reconfigure it from the original Owner Host before granting more access.");
  }
  const grants = existing?.grants && typeof existing.grants === "object" ? { ...existing.grants } : {};
  const credential = grants[nodeId] && typeof grants[nodeId] === "object"
    ? grants[nodeId]
    : createSpsHostProjectShareCredential(nodeId);
  await updateSpsHostProjectShareWindowsAccess({
    sourcePath,
    shareName,
    accountName: credential.username,
    password: credential.password,
    action: "grant",
  }, { temporaryRoot: app.getPath("temp") });
  secrets.projects[projectId] = {
    shareName,
    sharePath,
    sourcePath,
    grants: { ...grants, [nodeId]: credential },
  };
  // Persist the local credential before contacting Core. If the network call
  // fails, the Owner can safely retry without creating an orphaned password.
  await saveHostProjectShareSecrets(secrets);
  if (!status.share) {
    await ownerHostApi(`/projects/${encodeURIComponent(projectId)}/sps-host-share`, {
      method: "PUT",
      ownerBootstrap: true,
      body: { sharePath },
    });
  }
  const envelope = sealSpsHostProjectShareCredential({
    sharePath,
    hostAccountName: process.env.COMPUTERNAME?.trim() || os.hostname(),
    transportPublicKey: target.transportPublicKey,
    username: credential.username,
    password: credential.password,
  });
  await ownerHostApi(`/projects/${encodeURIComponent(projectId)}/sps-host-share/nodes/${encodeURIComponent(nodeId)}`, {
    method: "PUT",
    ownerBootstrap: true,
    body: { credentialAlgorithm: SPS_HOST_SHARE_CREDENTIAL_ALGORITHM, credentialEnvelope: envelope },
  });
  return { node: { id: target.id, displayName: target.displayName }, sharePath };
}

async function revokeHostProjectSourceFromNode(projectId, nodeId) {
  assertHostProjectSourceManager();
  const sourcePath = ownerHostProjectSourcePath(projectId);
  const status = await getHostProjectShareStatus(projectId);
  if (!status.share) throw new Error("This project does not have an SPS Host source share.");
  // Revoke in Core first. A queued or running Agent then loses its lease even
  // if Windows needs a moment to close the SMB account locally.
  await ownerHostApi(`/projects/${encodeURIComponent(projectId)}/sps-host-share/nodes/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
    ownerBootstrap: true,
  });
  const secrets = currentHostProjectShareSecrets();
  const record = secrets.projects[projectId];
  const credential = record?.grants?.[nodeId] ?? null;
  if (!credential?.username) {
    throw new Error("SPS revoked the Node in Core, but this Owner Host no longer has its local Windows share credential. Disable that local SPS share account manually before regranting.");
  }
  await updateSpsHostProjectShareWindowsAccess({
    sourcePath,
    shareName: record.shareName,
    accountName: credential.username,
    password: credential.password ?? "",
    action: "revoke",
  }, { temporaryRoot: app.getPath("temp") });
  const nextGrants = { ...record.grants };
  delete nextGrants[nodeId];
  secrets.projects[projectId] = { ...record, grants: nextGrants };
  await saveHostProjectShareSecrets(secrets);
  return { nodeId, revoked: true };
}

async function showHostProjectSourceManager(projectId) {
  const status = await getHostProjectShareStatus(projectId);
  const memberState = classifyHostProjectSourceMembers(status.nodes, {
    ownerNodeId: state.nodeId,
    ownerDisplayName: state.profile?.displayName,
  });
  const members = memberState.ready.slice(0, 8);
  if (members.length === 0) {
    const dialogContent = unavailableHostProjectSourceMemberDialog(memberState);
    await dialog.showMessageBox(workspaceWindow ?? mainWindow ?? undefined, {
      type: "info",
      title: "Project source access",
      ...dialogContent,
    });
    return null;
  }
  const buttons = members.map((node) => (
    node.sourceAccess === "granted" ? `Revoke ${node.displayName}` : `Grant ${node.displayName}`
  ));
  buttons.push("Close");
  const choice = await dialog.showMessageBox(workspaceWindow ?? mainWindow ?? undefined, {
    type: "question",
    title: "Project source access",
    message: "Choose a Member Node for this Host project's source folder.",
    detail: "SPS grants the Node a Windows share credential encrypted to that computer. Tasks still also require the normal Node, Agent, and Runner grants.",
    buttons,
    cancelId: buttons.length - 1,
  });
  const target = members[choice.response] ?? null;
  if (!target) return null;
  const result = target.sourceAccess === "granted"
    ? await revokeHostProjectSourceFromNode(projectId, target.id)
    : await grantHostProjectSourceToNode(projectId, target.id);
  await dialog.showMessageBox(workspaceWindow ?? mainWindow ?? undefined, {
    type: "info",
    title: "Project source access updated",
    message: target.sourceAccess === "granted"
      ? `${target.displayName} can no longer run Tasks in this Host source folder.`
      : `${target.displayName} can now run approved Tasks in this Host source folder.`,
    detail: target.sourceAccess === "granted" ? "The Node's Windows share account was disabled." : `Managed path: ${result.sharePath}`,
  });
  return result;
}

function ownerVaultRoot() {
  return developmentMode?.vaultRoot ?? path.join(app.getPath("userData"), "owner-vault");
}

async function materializeCurrentSpsOwnerHostRuntime() {
  if (ownerHostRuntimePromise) return ownerHostRuntimePromise;
  ownerHostRuntimePromise = (async () => {
    const targetRuntimeRoot = path.join(app.getPath("userData"), "owner-host-runtime", app.getVersion());
    if (app.isPackaged) {
      const packageRoot = path.join(process.resourcesPath, "sps-owner-host-runtime-package");
      if (existsSync(path.join(packageRoot, "sps-owner-host-runtime-package.json"))) {
        return await materializeSpsOwnerHostRuntimePackage({ packageRoot, targetRuntimeRoot });
      }
      // Keep in-place update compatibility with pre-archive Desktop packages.
      return await materializeSpsOwnerHostRuntime({
        sourceRuntimeRoot: path.join(process.resourcesPath, "sps-owner-host-runtime"),
        targetRuntimeRoot,
        runInPlace: true,
      });
    }
    return await materializeSpsOwnerHostRuntime({
      sourceRuntimeRoot: path.join(__dirname, "..", ".owner-host-runtime"),
      targetRuntimeRoot,
      runInPlace: false,
    });
  })().catch((error) => {
    ownerHostRuntimePromise = null;
    throw error;
  });
  return ownerHostRuntimePromise;
}

function ownerAgentRuntimePacksRoot() {
  return spsAgentRuntimePacksRoot(app.getPath("userData"));
}

function ownerHostTeamEnvironment() {
  const credentials = state.teamAccess?.enabled ? currentTeamCredentials() : null;
  return spsOwnerHostRuntimeEnvironment({
    identityUrl: configuredDesktopIdentityUrl(),
    teamAccessEnabled: Boolean(state.teamAccess?.enabled),
    authSecret: credentials?.authSecret,
    agentJwtSecret: ownerHostAgentJwtSecret,
  });
}

function isTeamAccessEnabled() {
  return Boolean(state.teamAccess?.enabled && currentTeamCredentials());
}

function isOwnerHostProfile(profile = state.profile) {
  return profile?.connectionKind === "owner-host";
}

function ownerHostIsReady() {
  return ownerHostStatus.state === "running" || ownerHostStatus.state === "running-existing";
}

async function synchronizeReadyTeamWorkplane() {
  const ownerHostUrl = ownerHostStatus.url;
  // A new Host becomes healthy before its signed-in account is activated as
  // the local Owner profile. Plugin configuration is company-scoped, so an
  // earlier attempt can only produce a misleading authorization warning.
  if (!isOwnerHostProfile() || !currentDesktopAccount() || !ownerHostIsReady() || !ownerHostUrl || lastTeamWorkplaneBindingUrl === ownerHostUrl) return;
  if (teamWorkplaneSyncPromise) return teamWorkplaneSyncPromise;
  if (
    lastTeamWorkplaneSyncAttempt?.url === ownerHostUrl
    && Date.now() - lastTeamWorkplaneSyncAttempt.at < TEAM_WORKPLANE_SYNC_RETRY_MS
  ) return;

  lastTeamWorkplaneSyncAttempt = { url: ownerHostUrl, at: Date.now() };
  teamWorkplaneSyncPromise = (async () => {
    try {
      // The Owner Host is authenticated even before private-team access is
      // enabled. Bundled plugins therefore need the same SPS Identity session
      // as every other Host request; otherwise their first config read is
      // rejected and the sidebar can expose a route for an absent plugin.
      const sessionCookie = await establishSpsIdentityCoreSession(ownerHostUrl);
      await synchronizeSpsTeamWorkplaneConfig({
        ownerHostUrl,
        desktopAccessToken: ownerHostDesktopAccessToken,
        sessionCookie,
      });
      lastTeamWorkplaneBindingUrl = ownerHostUrl;
    } catch (error) {
      // Workplane configuration is an optional post-start task. Never make a
      // visible Desktop status refresh wait for it or fail because it retries.
      console.warn("SPS Team Workplane could not bind to the Owner Host yet.", error);
    } finally {
      teamWorkplaneSyncPromise = null;
    }
  })();
  return teamWorkplaneSyncPromise;
}

async function refreshOwnerRuntimeStatus() {
  if (pluginRuntimeStatus.state === "checking") {
    pluginRuntimeStatus = await inspectSpsPluginRuntime();
  }
  if (defaultMemoryManager) {
    const memory = await defaultMemoryManager.inspect();
    defaultMemoryStatus = {
      ...memory,
      vaultPath: defaultMemoryStatus.vaultPath ?? path.join(ownerVaultRoot(), "memory"),
    };
  }
  if (ownerHostManager) {
    const ownerHost = await ownerHostManager.inspect();
    ownerHostStatus = {
      ...ownerHost,
      vaultPath: ownerHostStatus.vaultPath ?? ownerVaultRoot(),
    };
    void synchronizeReadyTeamWorkplane();
  }
  agentRuntimePacks = await listSpsAgentRuntimePacks({ root: ownerAgentRuntimePacksRoot() });
  return ownerHostStatus;
}

async function requireReadyOwnerHost() {
  if (!ownerHostIsReady()) await refreshOwnerRuntimeStatus();
  if (!ownerHostIsReady() || !ownerHostStatus.url) {
    throw new Error(ownerHostStatus.lastError || "SPS Owner Host is not ready.");
  }
  return ownerHostStatus;
}

async function ensureOwnerHostManager() {
  const vaultRoot = ownerVaultRoot();
  const ownerHost = await ensureSpsOwnerHostConfig({ vaultRoot });
  const recovery = await loadCoreRecoverySettings({ userDataPath: app.getPath("userData") });
  const defaultMemoryEnabled = isSpsDefaultMemoryEnabled() && !recovery.pluginsDisabled;
  const pluginDiscoveryEnabled = isSpsPluginDiscoveryEnabled();
  const roomWorkplaneBundled = isSpsRoomWorkplaneBundled();
  const discoveryCatalog = pluginDiscoveryVaultLayout(vaultRoot);
  const defaultMemory = defaultMemoryEnabled
    ? await ensureSpsDefaultMemoryConfig({ ownerVaultRoot: vaultRoot })
    : null;
  pluginRuntimeStatus = await inspectSpsPluginRuntime();
  agentRuntimePacks = await listSpsAgentRuntimePacks({ root: ownerAgentRuntimePacksRoot() });
  const url = spsOwnerHostUrl(ownerHost.config);
  if (ownerHostManager && ownerHostStatus.url === url && (!defaultMemoryEnabled || defaultMemoryManager)) {
    return { ...ownerHost, defaultMemory, url };
  }

  // Desktop verifies the official Registry for Core Marketplace regardless of
  // optional plugin activation. An unavailable refresh leaves the last trusted
  // snapshot in place, so startup never depends on Marketplace availability.
  try {
    const refreshed = await refreshSpsDiscoveryCatalog({ ownerVaultRoot: vaultRoot });
    if (!refreshed.refreshed) {
      console.warn("SPS Marketplace catalog refresh was unavailable", refreshed.errors);
    }
  } catch (error) {
    console.warn("SPS Marketplace catalog refresh failed", error);
  }

  const developmentCoreRoot = path.resolve(__dirname, "..", "..", "..", "external", "sps-core");
  const developmentMemorySidecarEntry = path.resolve(__dirname, "..", "..", "memory-sidecar", "memory-sidecar.mjs");
  const developmentMemoryPluginPath = path.resolve(__dirname, "..", "..", "sps-default-memory");
  const developmentDiscoveryPluginPath = path.resolve(__dirname, "..", "..", "sps-plugin-discovery");
  const developmentRoomPluginPath = path.resolve(__dirname, "..", "..", "sps-room-chat");
  defaultMemoryManager = defaultMemory
    ? createSpsDefaultMemoryManager({
      url: spsDefaultMemoryUrl(defaultMemory.config),
      token: defaultMemory.config.security.token,
      configPath: defaultMemory.layout.configPath,
      nodeCommand: process.execPath,
      resolveEntry: async () => {
        const materializedRuntime = await materializeCurrentSpsOwnerHostRuntime();
        const packagedEntry = materializedRuntime
          ? path.join(materializedRuntime, "memory-sidecar", "memory-sidecar.mjs")
          : null;
        return packagedEntry && existsSync(packagedEntry) ? packagedEntry : developmentMemorySidecarEntry;
      },
      resolveNodeCommand: async () => {
        const materializedRuntime = await materializeCurrentSpsOwnerHostRuntime();
        const bundledNode = materializedRuntime ? spsOwnerHostBundledNodePath(materializedRuntime) : null;
        return bundledNode && existsSync(bundledNode) ? bundledNode : process.execPath;
      },
    })
    : null;
  ownerHostManager = createSpsOwnerHostManager({
    url,
    resolveRuntime: async () => {
      const recovery = await loadCoreRecoverySettings({ userDataPath: app.getPath("userData") });
      ownerHostRecoveryPluginsDisabled = recovery.pluginsDisabled;
      const materializedRuntime = await materializeCurrentSpsOwnerHostRuntime();
      const stableNodeCommand = app.isPackaged && materializedRuntime
        ? await materializeStableSpsOwnerHostNode({
          runtimeRoot: materializedRuntime,
          stableRoot: path.join(app.getPath("userData"), "owner-host-node"),
        }).catch(() => null)
        : null;
      const packagedMemoryPluginPath = materializedRuntime ? path.join(materializedRuntime, "sps-default-memory") : null;
      const packagedDiscoveryPluginPath = materializedRuntime ? path.join(materializedRuntime, "sps-plugin-discovery") : null;
      const packagedRoomPluginPath = materializedRuntime ? path.join(materializedRuntime, "sps-room-chat") : null;
      const memoryPluginPath = app.isPackaged && packagedMemoryPluginPath && existsSync(path.join(packagedMemoryPluginPath, "package.json"))
        ? packagedMemoryPluginPath
        : developmentMemoryPluginPath;
      const roomPluginPath = app.isPackaged && packagedRoomPluginPath && existsSync(path.join(packagedRoomPluginPath, "package.json"))
        ? packagedRoomPluginPath
        : developmentRoomPluginPath;
      const discoveryPluginPath = app.isPackaged && packagedDiscoveryPluginPath && existsSync(path.join(packagedDiscoveryPluginPath, "package.json"))
        ? packagedDiscoveryPluginPath
        : developmentDiscoveryPluginPath;
      const bundledPluginPaths = [
        ...(defaultMemoryEnabled ? [memoryPluginPath] : []),
        ...(pluginDiscoveryEnabled ? [discoveryPluginPath] : []),
        ...(roomWorkplaneBundled ? [roomPluginPath] : []),
      ];
      return resolveSpsOwnerHostRuntime({
        // Development must execute the checked-out Core directly. The local
        // packaged runtime is intentionally a release artifact and otherwise
        // masks source changes during Desktop verification.
        packagedRuntimeRoots: app.isPackaged && materializedRuntime ? [materializedRuntime] : [],
        coreRoots: app.isPackaged ? [] : [developmentCoreRoot],
        packagedNodeCommand: process.execPath,
        stableNodeCommand,
        configPath: ownerHost.layout.configPath,
        environment: {
          ...coreRecoveryEnvironment(recovery),
          ...spsAgentRuntimePackEnvironment({
            root: ownerAgentRuntimePacksRoot(),
            nodeCommand: materializedRuntime
              ? spsOwnerHostBundledNodePath(materializedRuntime)
              : process.execPath,
          }),
          PAPERCLIP_HOME: ownerHost.layout.root,
          PAPERCLIP_DB_BACKUP_DIR: ownerHost.layout.backupDir,
          PAPERCLIP_STORAGE_LOCAL_DIR: ownerHost.layout.storageDir,
          PAPERCLIP_SECRETS_MASTER_KEY_FILE: ownerHost.layout.secretsPath,
          PAPERCLIP_PROJECTS_ROOT: ownerHost.layout.projectsDir,
          // Installed Desktop stays static; the isolated source-development
          // profile opts into Core's in-process Vite middleware and HMR.
          PAPERCLIP_UI_DEV_MIDDLEWARE: developmentMode?.uiMiddleware ?? "false",
          // Core keeps host-version policy product-neutral. Desktop supplies
          // its own release version so plugin minimumHostVersion guards are
          // evaluated against the app that owns this Owner Host.
          PAPERCLIP_HOST_VERSION: app.getVersion(),
          SPS_BASIC_MODE: "true",
          // Fresh Hosts render the plugin-first Core surface. The legacy Room
          // Workplane keeps its own UI only when explicitly bundled.
          SPS_CORE_BASELINE_MODE: roomWorkplaneBundled ? "false" : "true",
          // The neutral Desktop starts with Plugin Builder only. Do not
          // render the Rooms-first shell until the Team Workplane is actually
          // bundled for this Host, otherwise its navigation points at a
          // plugin route that does not exist.
          SPS_WORKPLANE_MODE: roomWorkplaneBundled ? "true" : "false",
          ...(roomWorkplaneBundled
            ? {
              SPS_WORKPLANE_ROOM_ORIGIN_PREFIXES: [
                "plugin:local.room-chat:operation:agent-room",
                "plugin:local.room-chat:agent-room-provisioning",
                "plugin:local.room-chat:project-room-provisioning",
              ].join(","),
              SPS_WORKPLANE_DEFAULT_PROJECT_TAB: "plugin:local.room-chat:project-workplane",
            }
            : {}),
          SPS_BUNDLED_PLUGIN_PATHS: bundledPluginPaths.join(path.delimiter),
          SPS_MARKETPLACE_CATALOG_PATH: discoveryCatalog.catalogPath,
          ...(materializedRuntime
            ? {
              SPS_MARKETPLACE_MCP_ENTRY: path.join(
                materializedRuntime,
                "node_modules",
                "@sps",
                "mcp-server",
                "dist",
                "marketplace-assistant-stdio.js",
              ),
            }
            : {}),
          // Keep the neutral Core free of a preselected workflow or memory
          // strategy. Refresh any already-installed first-party optional
          // package so an earlier Desktop path cannot leave a stale error in
          // the Plugin Manager after an app update.
          SPS_BUNDLED_PLUGIN_REFRESH_PATHS: [memoryPluginPath, roomPluginPath].join(path.delimiter),
          PAPERCLIP_BUNDLED_PLUGIN_PATHS: "",
          // The Room Worker can run without the optional Memory provider, but
          // it still needs the Owner Host address for its own tool calls.
          SPS_ROOM_API_URL: url,
          ...(defaultMemory
            ? {
              SPS_MEMORY_SIDECAR_URL: spsDefaultMemoryUrl(defaultMemory.config),
              SPS_MEMORY_SIDECAR_TOKEN: defaultMemory.config.security.token,
            }
            : {}),
          SPS_DESKTOP_PLUGIN_RUNTIME: pluginRuntimeStatus.state,
          ...(pluginRuntimeStatus.command && pluginRuntimeStatus.npmCli
            ? {
              SPS_PLUGIN_NODE_COMMAND: pluginRuntimeStatus.command,
              SPS_PLUGIN_NPM_CLI: pluginRuntimeStatus.npmCli,
            }
            : {}),
          ...spsDesktopAccessEnvironment(ownerHostDesktopAccessToken),
          ...ownerHostTeamEnvironment(),
        },
      });
    },
  });
  lastTeamWorkplaneBindingUrl = null;
  return { ...ownerHost, defaultMemory, url };
}

async function activateOwnerHostProfile() {
  const account = currentDesktopAccount();
  if (!account) throw new Error("Sign in to SPS before activating this SPS Owner Host.");
  if (state.ownerHostOwnerSubject && state.ownerHostOwnerSubject !== account.subject) {
    throw new Error("This computer already hosts an SPS Server for a different SPS account. Sign in with that Owner account to manage it.");
  }
  if (!ownerHostIsReady() || !ownerHostStatus.url) {
    throw new Error(ownerHostStatus.lastError || "SPS Owner Host is still starting.");
  }
  state.encryptedBoardApiToken = null;
  state.companies = [];
  state.projects = [];
  state.profile = {
    hubUrl: requireSpsOwnerHostOrigin(ownerHostStatus.url),
    connectionKind: "owner-host",
    companyId: "",
    displayName: currentDesktopAccount()?.name ?? `${os.hostname()} Owner Host`,
    defaultWorkspacePath: "",
    projectWorkspaces: {},
    workspaceSources: [],
  };
  state.ownerHostOwnerSubject = account.subject;
  state.legacyOwnerHostAdoptionPending = false;
  await persistState();
  return publicStatus();
}

async function startOwnerHost({ activate = false } = {}) {
  const ownerHost = await ensureOwnerHostManager();
  ownerHostStatus = {
    state: "starting",
    url: ownerHost.url,
    startedAt: ownerHostStatus.startedAt,
    lastError: null,
    vaultPath: ownerHost.layout.root,
  };
  if (ownerHost.defaultMemory && defaultMemoryManager) {
    defaultMemoryStatus = {
      state: "starting",
      url: spsDefaultMemoryUrl(ownerHost.defaultMemory.config),
      startedAt: defaultMemoryStatus.startedAt,
      lastError: null,
      vaultPath: ownerHost.defaultMemory.layout.root,
    };
    const memoryStatus = await defaultMemoryManager.start();
    defaultMemoryStatus = {
      ...memoryStatus,
      vaultPath: ownerHost.defaultMemory.layout.root,
    };
    if (memoryStatus.state !== "running" && memoryStatus.state !== "running-existing") {
      throw new Error(memoryStatus.lastError || "SPS Default Memory is still starting.");
    }
  } else {
    defaultMemoryStatus = disabledSpsExtensionStatus();
  }
  const status = await ownerHostManager.start();
  ownerHostStatus = {
    ...status,
    vaultPath: ownerHost.layout.root,
  };
  if (isTeamAccessEnabled() && state.teamAccess?.hostname && ownerHostStatus.url) {
    try {
      await reconcileSpsTailscaleServe({
        hostname: state.teamAccess.hostname,
        ownerHostUrl: requireSpsOwnerHostOrigin(ownerHostStatus.url),
      });
    } catch (error) {
      // Keep the local Host usable when Tailscale itself is temporarily
      // unavailable. Team actions perform the same narrow repair before use.
      ownerHostStatus = {
        ...ownerHostStatus,
        lastError: error instanceof Error ? error.message : "SPS private team route needs attention.",
      };
    }
  }
  if (activate) {
    if (!ownerHostIsReady()) {
      throw new Error(ownerHostStatus.lastError || "SPS Owner Host did not become ready.");
    }
    await activateOwnerHostProfile();
    await ensureInitialOwnerHostCompany();
    // A previously installed Team Workplane is company-scoped. Bind it only
    // after the local Owner identity and initial company are both available.
    await synchronizeReadyTeamWorkplane();
  }
  return ownerHostStatus;
}

async function bootstrapOwnerHost() {
  if (!state.ownerHostOwnerSubject && state.legacyOwnerHostAdoptionPending && currentDesktopAccount()) {
    try {
      await adoptLegacyOwnerHostIfNeeded();
      await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
      await maybeOpenWorkspaceForCurrentAccount();
      sendDesktopAccountStatus();
      return;
    } catch (error) {
      ownerHostStatus = {
        ...ownerHostStatus,
        state: "stopped",
        lastError: error instanceof Error ? error.message : "Existing SPS Owner Host could not be adopted.",
      };
      sendDesktopAccountStatus();
      return;
    }
  }
  if (!state.ownerHostOwnerSubject) {
    ownerHostStatus = {
      ...ownerHostStatus,
      state: "not-created",
      lastError: null,
    };
    defaultMemoryStatus = disabledSpsExtensionStatus();
    sendDesktopAccountStatus();
    return;
  }
  try {
    await startOwnerHost({ activate: false });
    await ensureInitialOwnerHostCompany();
    await maybeOpenWorkspaceForCurrentAccount();
  } catch (error) {
    ownerHostStatus = {
      ...ownerHostStatus,
      state: "stopped",
      lastError: error instanceof Error ? error.message : "SPS Owner Host could not start.",
    };
  } finally {
    // The local setup window may already have rendered the temporary
    // "starting" state before the Owner Host became healthy.
    sendDesktopAccountStatus();
  }
}

async function ownerHostApi(pathname, { method = "GET", body, ownerBootstrap = false } = {}) {
  await requireReadyOwnerHost();
  if (ownerBootstrap && (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost())) {
    throw new Error("Only this SPS Owner Host can perform this local Host action.");
  }
  const accessToken = currentBoardToken();
  const ownerHostOrigin = requireSpsOwnerHostOrigin(ownerHostStatus.url);
  const headers = body === undefined
    ? { accept: "application/json", origin: ownerHostOrigin }
    : { accept: "application/json", "content-type": "application/json", origin: ownerHostOrigin };
  // A signed-in SPS Identity account is required for every Host request,
  // including a loopback-only Host. The board token remains an optional
  // compatibility credential for established connections.
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  // This method can run while a newly created Host is still becoming the
  // active profile. The launch proof authenticates the local Desktop
  // transport, not the selected profile, so every request to the process this
  // Desktop owns must carry it. User and Host authority are still enforced by
  // the SPS Identity session and the separate bootstrap proof below.
  headers[SPS_DESKTOP_ACCESS_HEADER] = ownerHostDesktopAccessToken;
  if (ownerBootstrap) headers[SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER] = ownerHostDesktopAccessToken;
  if (isOwnerHostProfile()) {
    const identitySession = await establishSpsIdentityCoreSession(requireSpsOwnerHostOrigin(ownerHostStatus.url));
    if (!identitySession) {
      throw new Error("This SPS Owner Host did not accept the signed-in SPS Identity session.");
    }
    headers.cookie = `sps_identity_session=${encodeURIComponent(identitySession)}`;
  }
  let response;
  try {
    response = await fetch(`${ownerHostOrigin}/api${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: spsRequestTimeoutSignal(),
    });
  } catch (error) {
    throw spsRequestError(error, "SPS Owner Host request timed out. Reopen SPS Desktop and try again.");
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // The status and a safe generic error below are enough for Desktop setup.
  }
  if (!response.ok) {
    throw new Error(data?.error || `SPS Owner Host request failed with ${response.status}.`);
  }
  return data;
}

async function listCurrentOwnerIdentityCompanies() {
  const hubUrl = state.teamAccess?.url;
  if (!hubUrl) throw new Error("Private team access is not configured for this SPS Owner Host.");
  const sessionCookie = await establishSpsIdentityCoreSession(hubUrl);
  if (!sessionCookie) throw new Error("SPS Identity could not create a private team session for this Owner.");
  return normalizeCompanyList(await listSpsCompanies({ hubUrl, sessionCookie }));
}

async function ensurePrivateTeamOwnerMembership() {
  if (!isTeamAccessEnabled() || !state.teamAccess?.companyId || !state.teamAccess.url) {
    throw new Error("Enable private team access before managing team invitations.");
  }
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Sign in with this SPS Owner Host account before managing its team.");
  }

  await requireReadyOwnerHost();
  await reconcileSpsTailscaleServe({
    hostname: state.teamAccess.hostname,
    ownerHostUrl: requireSpsOwnerHostOrigin(ownerHostStatus.url),
  });

  const companyId = state.teamAccess.companyId;
  const accessibleCompanies = await listCurrentOwnerIdentityCompanies();
  if (accessibleCompanies.some((company) => company.id === companyId)) {
    return { recovered: false, companies: accessibleCompanies };
  }

  // A Desktop can survive account refreshes and partially completed older
  // hand-offs. Its per-launch local proof may mint exactly one Owner recovery
  // invite, but the invite is accepted through the Tailscale Identity route so
  // the resulting membership belongs to the actual signed-in SPS account.
  const recoveryInvitation = await ownerHostApi(`/companies/${encodeURIComponent(companyId)}/invites`, {
    method: "POST",
    ownerBootstrap: true,
    body: {
      allowedJoinTypes: "human",
      humanRole: "owner",
      expiresInMinutes: 15,
      agentMessage: "SPS Desktop Owner membership recovery.",
    },
  });
  if (typeof recoveryInvitation?.token !== "string") {
    throw new Error("SPS Owner Host did not return a membership recovery invitation.");
  }
  const accepted = await acceptSpsIdentityInvite(state.teamAccess.url, recoveryInvitation.token);
  if (accepted?.status !== "approved") {
    throw new Error("SPS Identity did not approve this Owner membership recovery.");
  }
  const verifiedCompanies = await listCurrentOwnerIdentityCompanies();
  if (!verifiedCompanies.some((company) => company.id === companyId)) {
    throw new Error("SPS could not verify the recovered Owner membership.");
  }
  return { recovered: true, companies: verifiedCompanies };
}

async function stageRegistryPluginFromFilePicker() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Only the signed-in SPS Owner can stage a Registry plugin.");
  }
  await requireReadyOwnerHost();
  const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Choose an SPS plugin package",
    properties: ["openFile"],
    filters: [{ name: "SPS plugin package", extensions: ["spsplugin"] }],
  });
  if (selection.canceled || !selection.filePaths[0]) return null;

  const archivePath = selection.filePaths[0];
  const staged = await stageSpsPluginArchive({
    vaultRoot: ownerVaultRoot(),
    archivePath,
    source: {
      registryId: "sps.desktop.local-file",
      kind: "local",
      // Keep the user-visible source useful without storing the full local path.
      releaseLocator: `file-picker/${path.basename(archivePath)}`,
    },
    registerStage: async (body) => await ownerHostApi("/plugins/registry/stages", {
      method: "POST",
      ownerBootstrap: true,
      body,
    }),
  });
  if (!staged.staged) {
    await dialog.showMessageBox(mainWindow ?? undefined, {
      type: "error",
      title: "Plugin package was not staged",
      message: "SPS did not execute this package.",
      detail: staged.errors.join("\n").slice(0, 2_000),
    });
    return staged;
  }

  const capabilities = Array.isArray(staged.stage?.staticManifest?.capabilities)
    ? staged.stage.staticManifest.capabilities.join(", ") || "None"
    : "Unknown";
  const choice = await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "Plugin staged without execution",
    message: `${staged.stage.pluginId} ${staged.stage.version} is ready for review.`,
    detail: `Source: ${staged.stage.source.registryId}\nCapabilities: ${capabilities}\n\nNo plugin JavaScript, migration, or worker has run yet.`,
    buttons: ["Enable now", "Keep disabled"],
    defaultId: 1,
    cancelId: 1,
  });
  if (choice.response !== 0) return staged;

  const enabled = await ownerHostApi(`/plugins/registry/stages/${encodeURIComponent(staged.stage.stageId)}/enable`, {
    method: "POST",
    ownerBootstrap: true,
    body: {},
  });
  await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "Plugin enabled",
    message: `${enabled.plugin?.pluginKey ?? staged.stage.pluginId} entered the SPS Plugin lifecycle.`,
    detail: `Status: ${enabled.plugin?.status ?? "registered"}`,
  });
  return { ...staged, enabled };
}

function assertRegistryOwner() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Only the signed-in SPS Owner can manage Registry sources.");
  }
}

function assertRegistryWindowEvent(event) {
  if (!registryWindow || registryWindow.isDestroyed() || event.sender.id !== registryWindow.webContents.id) {
    throw new Error("Plugin Registry requests must come from the SPS Plugin Registry window.");
  }
  assertRegistryOwner();
}

function registrySourceView(source) {
  return {
    id: source.id,
    kind: source.kind,
    displayName: source.displayName,
    isBundled: isBundledRegistrySource(source),
    ...(source.indexUrl ? { indexUrl: source.indexUrl } : {}),
    ...(source.localPath ? { localFolderName: path.basename(source.localPath) || source.localPath } : {}),
    ...(source.trustedRoot ? { trustedRootKeyId: source.trustedRoot.keyId } : {}),
  };
}

async function listRegistrySources() {
  assertRegistryOwner();
  const configured = await loadRegistrySources({ vaultRoot: ownerVaultRoot() });
  return configured.sources.map(registrySourceView);
}

async function addDesktopRegistrySource(input) {
  assertRegistryOwner();
  if (!input || typeof input !== "object") throw new Error("Registry source details are required.");
  if (input.kind !== "local") {
    throw new Error("SPS Desktop currently accepts only Owner-selected local development Registries. The signed SPS Official Registry is already available.");
  }
  const source = {
    id: input.id,
    kind: "local",
    displayName: input.displayName,
    localPath: input.localPath,
  };
  const inspection = await inspectRegistrySource(source);
  if (!inspection.valid) throw new Error(inspection.errors.join("\n"));
  const saved = await addRegistrySource({ vaultRoot: ownerVaultRoot(), source });
  return saved.sources.map(registrySourceView);
}

async function chooseDesktopLocalRegistryFolder() {
  assertRegistryOwner();
  const selection = await dialog.showOpenDialog(registryWindow ?? mainWindow ?? undefined, {
    title: "Choose a local SPS Registry folder",
    properties: ["openDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  return { localPath: selection.filePaths[0], localFolderName: path.basename(selection.filePaths[0]) };
}

async function inspectDesktopRegistrySource(sourceId) {
  assertRegistryOwner();
  const configured = await loadRegistrySources({ vaultRoot: ownerVaultRoot() });
  const source = configured.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error("Registry source was not found.");
  const report = await inspectRegistrySource(source);
  return {
    source: registrySourceView(source),
    valid: report.valid,
    errors: report.errors,
    trust: report.trust,
    warning: report.warning,
    releases: report.releases.map((release) => ({
      pluginId: release.pluginId,
      version: release.version,
      visibility: release.visibility,
      ...(release.catalog === undefined ? {} : { catalog: { ...release.catalog } }),
      ...(release.capabilities === undefined ? {} : { capabilities: [...release.capabilities] }),
      compatibility: { ...release.compatibility },
      permissionsDigest: release.permissionsDigest,
      publisherId: release.publisherId,
      ...(release.publisherProfile === undefined ? {} : { publisherProfile: { ...release.publisherProfile } }),
      publisherKeyId: release.publisherKeyId,
      artifact: { ...release.artifact },
    })),
  };
}

async function stageDesktopRegistryRelease({ sourceId, pluginId, version } = {}) {
  assertRegistryOwner();
  await requireReadyOwnerHost();
  const configured = await loadRegistrySources({ vaultRoot: ownerVaultRoot() });
  const source = configured.sources.find((entry) => entry.id === sourceId);
  if (!source) throw new Error("Registry source was not found.");
  const acquired = await acquireRegistryRelease({
    vaultRoot: ownerVaultRoot(),
    source,
    pluginId,
    version,
  });
  const compatibility = assessSpsPluginCompatibility(acquired.release.compatibility, {
    desktopVersion: app.getVersion(),
  });
  if (!compatibility.compatible) {
    throw new Error(`Plugin ${pluginId} ${version} is not compatible with this SPS Desktop. ${compatibility.reason}`);
  }
  try {
    const staged = await stageSpsPluginArchive({
      vaultRoot: ownerVaultRoot(),
      archivePath: acquired.archivePath,
      expectedArtifact: acquired.artifact,
      expectedRelease: acquired.release,
      source: acquired.source,
      registerStage: async (body) => await ownerHostApi("/plugins/registry/stages", {
        method: "POST",
        ownerBootstrap: true,
        body,
      }),
    });
    if (!staged.staged) throw new Error(staged.errors.join("\n"));
    return staged;
  } finally {
    if (acquired.cleanupArchive) await fs.rm(acquired.archivePath, { force: true }).catch(() => {});
  }
}

async function enableDesktopRegistryStage(stageId) {
  assertRegistryOwner();
  if (typeof stageId !== "string" || stageId.length === 0) throw new Error("Registry stage id is required.");
  return await ownerHostApi(`/plugins/registry/stages/${encodeURIComponent(stageId)}/enable`, {
    method: "POST",
    ownerBootstrap: true,
    body: {},
  });
}

async function listDesktopRegistryStages() {
  assertRegistryOwner();
  const stages = await ownerHostApi("/plugins/registry/stages", { ownerBootstrap: true });
  if (!Array.isArray(stages)) throw new Error("Owner Host returned an invalid Registry stage list.");
  return stages.map((stage) => ({
    stageId: stage.stageId,
    pluginId: stage.pluginId,
    version: stage.version,
    packageName: stage.packageName,
    artifactSha256: stage.artifactSha256,
    source: stage.source,
    status: stage.status,
    stagedAt: stage.stagedAt,
    capabilities: Array.isArray(stage.staticManifest?.capabilities) ? stage.staticManifest.capabilities : [],
  }));
}

async function removeDesktopRegistrySource(sourceId) {
  assertRegistryOwner();
  const saved = await removeRegistrySource({ vaultRoot: ownerVaultRoot(), sourceId });
  return saved.sources.map(registrySourceView);
}

async function developerProjectRecord(projectId) {
  if (typeof projectId !== "string" || projectId.length === 0) throw new Error("Developer project id is required.");
  const state = await loadDeveloperProjects({ vaultRoot: ownerVaultRoot() });
  const project = state.projects.find((entry) => entry.id === projectId);
  if (!project) throw new Error("Developer project was not found.");
  return project;
}

async function resolveDesktopDeveloperContext(input) {
  assertRegistryOwner();
  const context = normalizeDeveloperContext(input);
  const company = await ownerHostApi(`/companies/${encodeURIComponent(context.companyId)}`, { ownerBootstrap: true });
  if (company?.id !== context.companyId) throw new Error("Developer context Workspace was not found.");
  const plugins = await ownerHostApi("/plugins", { ownerBootstrap: true });
  const plugin = plugins.find(entry => entry.pluginKey === context.pluginId);
  if (!plugin) throw new Error("Developer context plugin was not found on this Host.");
  return { context, workspaceName: company.name, pluginName: plugin.manifestJson?.displayName || context.pluginId };
}

async function getDesktopDeveloperContext(input) {
  const resolved = await resolveDesktopDeveloperContext(input);
  const binding = await getDeveloperContextLink({ vaultRoot: ownerVaultRoot(), context: resolved.context });
  const projects = binding ? (await loadDeveloperProjects({ vaultRoot: ownerVaultRoot() })).projects : [];
  const project = projects.find(entry => entry.id === binding?.projectId);
  const validationFeedback = project ? buildDeveloperValidationFeedback({
    projectId: project.id,
    events: await listDeveloperDiagnostics({ ownerVault: ownerVaultRoot(), filters: { projectId: project.id, limit: 300 } }),
  }) : null;
  const currentBinding = await getDeveloperContextLink({ vaultRoot: ownerVaultRoot(), context: resolved.context });
  if (currentBinding?.projectId !== binding?.projectId) throw new Error("Developer project changed. Refresh this context.");
  assertRegistryOwner();
  return {
    available: true,
    ...resolved,
    project: project ? {
      id: project.id, displayName: project.displayName,
      sourceLabel: publicDeveloperProject(project).sourceLabel,
      verified: Boolean(project.lastKnownGood),
    } : null,
    missingProject: Boolean(binding && !project),
    validationFeedback,
  };
}

async function checkDesktopDeveloperAgentFolder(input) {
  return await readDeveloperAgentFolder(input, {
    assertOwner: assertRegistryOwner,
    resolveContext: resolveDesktopDeveloperContext,
    getBinding: context => getDeveloperContextLink({ vaultRoot: ownerVaultRoot(), context }),
    loadProjects: async () => (await loadDeveloperProjects({ vaultRoot: ownerVaultRoot() })).projects,
    getAgent: agentId => ownerHostApi(`/agents/${encodeURIComponent(agentId)}`, { ownerBootstrap: true }),
  });
}

async function openDesktopDeveloperContext(input) {
  const resolved = await resolveDesktopDeveloperContext(input);
  await showRegistryWindow({ developerContext: resolved.context });
  return { opened: true };
}

async function getRegistryDeveloperContext() {
  assertRegistryOwner();
  const selection = registryDeveloperContext;
  if (!selection) return null;
  const result = await getDesktopDeveloperContext(selection.context);
  if (registryDeveloperContext !== selection) throw new Error("Developer context changed. Refresh this window.");
  return { ...result, contextToken: selection.token };
}

function selectedRegistryDeveloperContext(token) {
  const selection = registryDeveloperContext;
  if (!selection || typeof token !== "string" || token !== selection.token) {
    throw new Error("Developer context changed. Refresh this window before linking a project.");
  }
  return selection;
}

async function linkRegistryDeveloperContext(input) {
  assertRegistryOwner();
  const selection = selectedRegistryDeveloperContext(input?.contextToken);
  await resolveDesktopDeveloperContext(selection.context);
  const project = await developerProjectRecord(input?.projectId);
  selectedRegistryDeveloperContext(input.contextToken);
  assertRegistryOwner();
  await setDeveloperContextLink({ vaultRoot: ownerVaultRoot(), context: selection.context, projectId: project.id });
  selectedRegistryDeveloperContext(input.contextToken);
  return await getRegistryDeveloperContext();
}

async function clearRegistryDeveloperContext(input) {
  assertRegistryOwner();
  const selection = selectedRegistryDeveloperContext(input?.contextToken);
  await resolveDesktopDeveloperContext(selection.context);
  selectedRegistryDeveloperContext(input.contextToken);
  assertRegistryOwner();
  await clearDeveloperContextLink({ vaultRoot: ownerVaultRoot(), context: selection.context });
  selectedRegistryDeveloperContext(input.contextToken);
  return await getRegistryDeveloperContext();
}

async function withDeveloperProjectOperation(projectId, operation) {
  if (activeDeveloperProjectOperations.has(projectId)) {
    throw new Error("This developer project already has an operation in progress.");
  }
  activeDeveloperProjectOperations.add(projectId);
  try {
    return await operation();
  } finally {
    activeDeveloperProjectOperations.delete(projectId);
  }
}

async function recordDesktopPluginPreviewDiagnostic({
  projectId,
  buildId,
  pluginId,
  phase,
  level = "info",
  code,
  message,
}) {
  try {
    return await appendDeveloperDiagnostic({
      ownerVault: ownerVaultRoot(),
      event: developerDiagnosticFromPreview({
        projectId,
        buildId,
        phase,
        level,
        code,
        message,
        ...(pluginId ? { pluginId } : {}),
      }),
    });
  } catch (error) {
    console.warn("SPS plugin Preview diagnostic could not be persisted:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function listDesktopPluginPreviewDiagnostics(input = {}) {
  assertRegistryOwner();
  try {
    const events = await listDeveloperDiagnostics({
      ownerVault: ownerVaultRoot(),
      filters: {
        ...(input?.projectId ? { projectId: input.projectId } : {}),
        ...(input?.buildId ? { buildId: input.buildId } : {}),
        ...(input?.origin ? { origin: input.origin } : {}),
        ...(input?.category ? { category: input.category } : {}),
        ...(input?.level ? { level: input.level } : {}),
        limit: input?.limit ?? 40,
      },
    });
    return { events, warning: null };
  } catch {
    return {
      events: [],
      warning: "Saved Preview diagnostics are unavailable. Clear the diagnostic ledger or restart SPS before relying on this evidence.",
    };
  }
}

async function clearDesktopPluginPreviewDiagnostics() {
  assertRegistryOwner();
  return await clearDeveloperDiagnostics({ ownerVault: ownerVaultRoot() });
}

async function resolveDesktopDeveloperKit() {
  if (!app.isPackaged) {
    const cliPath = path.join(__dirname, "..", "node_modules", "@sonparkserver", "plugin-sdk", "cli", "sps-plugin.mjs");
    if (!existsSync(cliPath)) throw new Error("SPS Plugin SDK CLI is not installed for Desktop development.");
    return {
      nodeCommand: process.execPath,
      sdkCliPath: cliPath,
      environment: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    };
  }

  const runtimeRoot = await materializeCurrentSpsOwnerHostRuntime();
  if (!runtimeRoot) throw new Error("SPS Owner Host runtime is unavailable.");
  const nodeCommand = spsOwnerHostBundledNodePath(runtimeRoot);
  const sdkCliPath = path.join(
    runtimeRoot,
    "developer-kit",
    "node_modules",
    "@sonparkserver",
    "plugin-sdk",
    "cli",
    "sps-plugin.mjs",
  );
  if (!existsSync(nodeCommand) || !existsSync(sdkCliPath)) {
    throw new Error("SPS Plugin Developer Kit is missing from this Desktop installation.");
  }
  return { nodeCommand, sdkCliPath, environment: process.env };
}

async function listDesktopDeveloperProjects() {
  assertRegistryOwner();
  return publicDeveloperProjectState(await loadDeveloperProjects({ vaultRoot: ownerVaultRoot() })).projects;
}

async function chooseDesktopDeveloperProjectFolder() {
  assertRegistryOwner();
  const selection = await dialog.showOpenDialog(registryWindow ?? mainWindow ?? undefined, {
    title: "Choose an SPS plugin project folder",
    properties: ["openDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  return {
    sourcePath: selection.filePaths[0],
    sourceLabel: path.basename(selection.filePaths[0]),
  };
}

async function connectDesktopDeveloperProject(input) {
  assertRegistryOwner();
  const project = await connectDeveloperProject({
    vaultRoot: ownerVaultRoot(),
    sourcePath: input?.sourcePath,
    displayName: input?.displayName,
    sourceLabel: input?.sourceLabel,
  });
  return publicDeveloperProject(project);
}

async function inspectDesktopDeveloperProject(projectId) {
  assertRegistryOwner();
  const project = await developerProjectRecord(projectId);
  const tuple = await inspectDeveloperSourceTuple(project.sourcePath, { allowMissingOutputs: true });
  return {
    project: publicDeveloperProject(project),
    current: tuple,
    changedSinceCandidate: !project.candidate
      || project.candidate.sourceFingerprint !== tuple.sourceFingerprint
      || project.candidate.outputFingerprint !== tuple.outputFingerprint,
    changedSinceLastKnownGood: !project.lastKnownGood
      || project.lastKnownGood.sourceFingerprint !== tuple.sourceFingerprint
      || project.lastKnownGood.outputFingerprint !== tuple.outputFingerprint,
  };
}

async function runDesktopDeveloperGates(projectId) {
  assertRegistryOwner();
  await requireReadyOwnerHost();
  return await withDeveloperProjectOperation(projectId, async () => {
    const project = await developerProjectRecord(projectId);
    await appendDeveloperDiagnostic({
      ownerVault: ownerVaultRoot(),
      event: { origin: "desktop", category: "compatibility", level: "info",
        code: "DEVELOPER_GATES_STARTED", message: "Host started build, static validation and Worker tests.",
        details: { projectId } },
    });
    const reports = [];
    try {
    const runtime = await resolveDesktopDeveloperKit();
    for (const command of ["build", "validate", "test"]) {
      let report;
      try {
        report = await runSpsDeveloperCommand({
          command,
          sourceDirectory: project.sourcePath,
          nodeCommand: runtime.nodeCommand,
          sdkCliPath: runtime.sdkCliPath,
          environment: runtime.environment,
        });
      } catch {
        await appendDeveloperDiagnostic({
          ownerVault: ownerVaultRoot(),
          event: {
            origin: "desktop",
            category: command === "validate" ? "manifest" : "worker",
            level: "error",
            code: `DEVELOPER_${command.toUpperCase()}_UNAVAILABLE`,
            message: `Plugin ${command} gate could not produce a safe result.`,
            details: { projectId, gate: command },
          },
        });
        throw new Error(`Plugin ${command} gate could not complete. Check Development diagnostics.`);
      }
      reports.push(report);
      await appendDeveloperDiagnostic({
        ownerVault: ownerVaultRoot(),
        event: developerDiagnosticFromGate({ projectId, command, report }),
      });
    }
    const candidate = createDeveloperCandidateFromGateReports(reports);
    const conformance = await createDeveloperConformanceEvidence({ sourceDirectory: project.sourcePath, reports });
    const saved = await recordDeveloperCandidate({
      vaultRoot: ownerVaultRoot(),
      projectId,
      candidate: { ...candidate, conformance },
    });
    await appendDeveloperDiagnostic({
      ownerVault: ownerVaultRoot(),
      event: { origin: "desktop", category: "compatibility", level: "info",
        code: "DEVELOPER_GATES_FINISHED", message: "Host finished the development gates. Preview runtime validation remains separate.",
        details: { projectId, success: reports.every(report => report.success === true) } },
    }).catch(() => console.warn("SPS development gates completed, but their feedback record is unavailable."));
    return {
      project: publicDeveloperProject(saved),
      reports: reports.map((report) => ({
        command: report.command,
        success: report.success,
        durationMs: report.durationMs,
        diagnostics: report.result.diagnostics,
      })),
    };
    } catch (error) {
      await appendDeveloperDiagnostic({
        ownerVault: ownerVaultRoot(),
        event: { origin: "desktop", category: "compatibility", level: "error",
          code: "DEVELOPER_GATES_FINISHED", message: "Host could not complete the development gates. Check Development diagnostics.",
          details: { projectId, success: false } },
      }).catch(() => console.warn("SPS development gate failure feedback could not be recorded."));
      throw error;
    }
  });
}

async function pluginPreviewApi(preview, pathname, { method = "GET", body } = {}) {
  const headers = {
    accept: "application/json",
    origin: preview.url,
    [SPS_DESKTOP_ACCESS_HEADER]: preview.accessToken,
    [SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER]: preview.accessToken,
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  let response;
  try {
    response = await fetch(`${preview.url}/api${pathname}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    throw spsRequestError(error, "The isolated plugin Preview did not respond in time.");
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Preview diagnostics never expose an untrusted HTML response.
  }
  if (!response.ok) {
    throw new Error(data?.error || `Plugin Preview request failed with ${response.status}.`);
  }
  return data;
}

async function resolveDesktopPluginPreviewRuntime(preview) {
  const materializedRuntime = await materializeCurrentSpsOwnerHostRuntime();
  const stableNodeCommand = app.isPackaged && materializedRuntime
    ? await materializeStableSpsOwnerHostNode({
      runtimeRoot: materializedRuntime,
      stableRoot: path.join(app.getPath("userData"), "owner-host-node"),
    }).catch(() => null)
    : null;
  const developmentCoreRoot = path.resolve(__dirname, "..", "..", "..", "external", "sps-core");
  return await resolveSpsOwnerHostRuntime({
    packagedRuntimeRoots: app.isPackaged && materializedRuntime ? [materializedRuntime] : [],
    coreRoots: app.isPackaged ? [] : [developmentCoreRoot],
    packagedNodeCommand: process.execPath,
    stableNodeCommand,
    configPath: preview.configPath,
    instanceId: `sps-preview-${preview.buildId.slice(6)}`,
    environment: {
      PAPERCLIP_HOME: preview.previewVault,
      PAPERCLIP_DB_BACKUP_DIR: preview.config.database.backup.dir,
      PAPERCLIP_STORAGE_LOCAL_DIR: preview.config.storage.localDisk.baseDir,
      PAPERCLIP_SECRETS_MASTER_KEY_FILE: preview.config.secrets.localEncrypted.keyFilePath,
      PAPERCLIP_PROJECTS_ROOT: path.join(preview.previewVault, "projects"),
      PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
      PAPERCLIP_HOST_VERSION: app.getVersion(),
      PAPERCLIP_TELEMETRY_DISABLED: "1",
      SPS_BASIC_MODE: "true",
      SPS_CORE_BASELINE_MODE: "true",
      SPS_WORKPLANE_MODE: "false",
      SPS_BUNDLED_PLUGIN_PATHS: "",
      SPS_BUNDLED_PLUGIN_REFRESH_PATHS: "",
      PAPERCLIP_BUNDLED_PLUGIN_PATHS: "",
      PAPERCLIP_AGENT_RUNTIME_PACKS_DIR: path.join(preview.previewVault, "agent-runtime-packs"),
      SPS_DESKTOP_PLUGIN_RUNTIME: "preview",
      ...spsDesktopAccessEnvironment(preview.accessToken),
    },
  });
}

async function startDesktopPluginPreview({ projectId, buildId }) {
  await stopDesktopPluginPreview({ removeData: false, closeWindow: true });
  const fixtureState = await ensurePluginPreviewFixture({
    ownerVault: ownerVaultRoot(),
    buildId,
  });
  const preview = await createPluginPreviewRuntime({
    ownerVault: ownerVaultRoot(),
    buildId,
    resolveRuntime: resolveDesktopPluginPreviewRuntime,
    fetchImpl: fetch,
    spawn: spawnChildProcess,
    baseEnvironment: createDeveloperCommandEnvironment(process.env),
  });
  const status = await preview.manager.start();
  if (status.state === "running-existing" || status.owned !== true) {
    await preview.manager.stop({ force: false }).catch(() => {});
    await recordDesktopPluginPreviewDiagnostic({
      projectId,
      buildId,
      phase: "runtime",
      level: "error",
      code: "PREVIEW_RUNTIME_FOREIGN_PROCESS",
      message: "SPS rejected a Preview port owned by another process.",
    });
    throw new Error(
      "The isolated Preview port is already owned by another process. Close the stale Preview or restart SPS before retrying.",
    );
  }
  if (status.state !== "running") {
    await preview.manager.stop({ force: true }).catch(() => {});
    await recordDesktopPluginPreviewDiagnostic({
      projectId,
      buildId,
      phase: "runtime",
      level: "error",
      code: "PREVIEW_RUNTIME_START_FAILED",
      message: status.lastError || "The isolated plugin Preview could not start.",
    });
    throw new Error(status.lastError || "The isolated plugin Preview could not start.");
  }
  pluginPreviewRuntime = { ...preview, projectId, fixture: fixtureState.fixture };
  await recordDesktopPluginPreviewDiagnostic({
    projectId,
    buildId,
    phase: "runtime",
    code: "PREVIEW_RUNTIME_STARTED",
    message: "The isolated plugin Preview runtime started.",
  });
  return pluginPreviewRuntime;
}

async function ensurePluginPreviewWorkspace(preview, project) {
  const existing = await pluginPreviewApi(preview, "/companies");
  if (Array.isArray(existing) && existing.length > 0) {
    await recordDesktopPluginPreviewDiagnostic({
      projectId: preview.projectId,
      buildId: preview.buildId,
      phase: "workspace",
      code: "PREVIEW_WORKSPACE_READY",
      message: "The existing isolated Preview Workspace is ready.",
    });
    return existing[0];
  }
  const workspace = await pluginPreviewApi(preview, "/companies", {
    method: "POST",
    body: {
      name: `Preview - ${project.displayName}`.slice(0, 120),
      description: "Isolated SPS plugin development Workspace.",
    },
  });
  await recordDesktopPluginPreviewDiagnostic({
    projectId: preview.projectId,
    buildId: preview.buildId,
    phase: "workspace",
    code: "PREVIEW_WORKSPACE_CREATED",
    message: "A new isolated Preview Workspace was created.",
  });
  return workspace;
}

async function stopDesktopPluginPreview({ removeData = false, closeWindow = true } = {}) {
  const runtime = pluginPreviewRuntime;
  const window = pluginPreviewWindow;
  const stopped = runtime?.manager
    ? await runtime.manager.stop({ force: false }).catch(() => null)
    : null;
  if (removeData && runtime && stopped?.state !== "stopped") {
    throw new Error(
      "SPS kept the Preview data because its isolated process did not stop completely.",
    );
  }
  pluginPreviewRuntime = null;
  if (closeWindow && window && !window.isDestroyed()) {
    pluginPreviewClosing = true;
    pluginPreviewWindow = null;
    window.destroy();
    pluginPreviewClosing = false;
  }
  if (removeData && runtime?.buildId) {
    await cleanupPluginPreview({
      ownerVault: ownerVaultRoot(),
      buildId: runtime.buildId,
    });
    await recordDesktopPluginPreviewDiagnostic({
      projectId: runtime.projectId,
      buildId: runtime.buildId,
      phase: "cleanup",
      code: "PREVIEW_DATA_REMOVED",
      message: "The isolated Preview data was removed after its process stopped.",
    });
  } else if (runtime?.buildId) {
    await recordDesktopPluginPreviewDiagnostic({
      projectId: runtime.projectId,
      buildId: runtime.buildId,
      phase: "cleanup",
      code: "PREVIEW_RUNTIME_STOPPED",
      message: "The isolated Preview runtime stopped and its data was kept.",
    });
  }
}

async function confirmPluginPreviewClose(window) {
  if (pluginPreviewClosing || window.isDestroyed()) return;
  const result = await dialog.showMessageBox(window, {
    type: "question",
    title: "Close plugin Preview",
    message: "Close this isolated Preview?",
    detail: "Keeping its data makes the exact build faster to reproduce. Deleting removes only this Preview database and temporary Workspace.",
    buttons: ["Keep preview data", "Delete preview data", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (result.response === 2) return;
  try {
    await stopDesktopPluginPreview({ removeData: result.response === 1, closeWindow: true });
  } catch (error) {
    await dialog.showMessageBox(window, {
      type: "warning",
      title: "Preview data was kept",
      message: "SPS could not safely delete this Preview.",
      detail: error instanceof Error ? error.message : String(error),
      buttons: ["OK"],
      defaultId: 0,
      noLink: true,
    });
  }
}

async function showPluginPreviewWindow(preview) {
  if (pluginPreviewWindow && !pluginPreviewWindow.isDestroyed()) {
    pluginPreviewWindow.show();
    pluginPreviewWindow.focus();
    return;
  }
  const partition = `sps-plugin-preview-${preview.buildId}`;
  const previewSession = session.fromPartition(partition, { cache: false });
  previewSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    try {
      if (new URL(details.url).origin === preview.url) {
        requestHeaders[SPS_DESKTOP_ACCESS_HEADER] = preview.accessToken;
        requestHeaders[SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER] = preview.accessToken;
      }
    } catch {
      // Navigation policy below rejects malformed and external destinations.
    }
    callback({ requestHeaders });
  });
  const window = new BrowserWindow({
    width: preview.fixture?.viewport === "mobile" ? 430 : 1280,
    height: preview.fixture?.viewport === "mobile" ? 800 : 840,
    minWidth: preview.fixture?.viewport === "mobile" ? 360 : 900,
    minHeight: 640,
    show: false,
    title: "SPS Plugin Preview",
    icon: path.join(__dirname, "..", "assets", "sps-logo.png"),
    webPreferences: {
      ...createSpsWorkspaceWindowPreferences(),
      partition,
      preload: path.join(__dirname, "plugin-preview-preload.cjs"),
    },
  });
  pluginPreviewWindow = window;
  configureWorkspaceNavigation(window, preview.url);
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (isQuitting || pluginPreviewClosing) return;
    event.preventDefault();
    void confirmPluginPreviewClose(window);
  });
  window.on("closed", () => {
    if (pluginPreviewWindow === window) pluginPreviewWindow = null;
  });
  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
    if (!isMainFrame) return;
    void recordDesktopPluginPreviewDiagnostic({
      projectId: preview.projectId,
      buildId: preview.buildId,
      phase: "renderer",
      level: "error",
      code: "PREVIEW_RENDERER_LOAD_FAILED",
      message: `Preview renderer load failed (${errorCode}): ${errorDescription || validatedUrl || "unknown error"}.`,
    });
  });
  window.webContents.on("did-finish-load", () => {
    void recordDesktopPluginPreviewDiagnostic({
      projectId: preview.projectId,
      buildId: preview.buildId,
      phase: "renderer",
      code: "PREVIEW_RENDERER_READY",
      message: "The isolated Preview renderer loaded successfully.",
    });
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    void recordDesktopPluginPreviewDiagnostic({
      projectId: preview.projectId,
      buildId: preview.buildId,
      phase: "renderer",
      level: "error",
      code: "PREVIEW_RENDERER_GONE",
      message: `Preview renderer exited: ${details?.reason || "unknown reason"}.`,
    });
  });
  window.on("unresponsive", () => {
    void recordDesktopPluginPreviewDiagnostic({
      projectId: preview.projectId,
      buildId: preview.buildId,
      phase: "renderer",
      level: "warn",
      code: "PREVIEW_RENDERER_UNRESPONSIVE",
      message: "The isolated Preview renderer became unresponsive.",
    });
  });
  await window.loadURL(`${preview.url}/`);
}

function publicDesktopPluginPreviewState() {
  const runtime = pluginPreviewRuntime;
  if (!runtime) return { active: false };
  return {
    active: true,
    projectId: runtime.projectId,
    buildId: runtime.buildId,
    fixture: runtime.fixture,
    windowOpen: Boolean(pluginPreviewWindow && !pluginPreviewWindow.isDestroyed()),
  };
}

async function updateDesktopPluginPreviewEnvironment(input) {
  assertRegistryOwner();
  const runtime = pluginPreviewRuntime;
  if (!runtime || runtime.projectId !== input?.projectId) {
    throw new Error("Open this developer project's isolated Preview before changing its environment.");
  }
  const updated = await updatePluginPreviewFixture({
    ownerVault: ownerVaultRoot(),
    buildId: runtime.buildId,
    fixture: input?.fixture,
  });
  runtime.fixture = updated.fixture;
  await recordDesktopPluginPreviewDiagnostic({
    projectId: runtime.projectId,
    buildId: runtime.buildId,
    phase: "fixture",
    code: "PREVIEW_FIXTURE_UPDATED",
    message: `Preview fixture changed to ${updated.fixture.role}, ${updated.fixture.viewport}, ${updated.fixture.uiState}.`,
  });
  if (pluginPreviewWindow && !pluginPreviewWindow.isDestroyed()) {
    const mobile = updated.fixture.viewport === "mobile";
    pluginPreviewWindow.setMinimumSize(mobile ? 360 : 900, 640);
    pluginPreviewWindow.setSize(mobile ? 430 : 1280, mobile ? 800 : 840);
    pluginPreviewWindow.webContents.reloadIgnoringCache();
  }
  return publicDesktopPluginPreviewState();
}

async function applyDesktopDeveloperCandidate(projectId) {
  assertRegistryOwner();
  return await withDeveloperProjectOperation(projectId, async () => {
    const project = await developerProjectRecord(projectId);
    if (!project.candidate) throw new Error("Run the development gates before applying this project.");
    const buildId = `build-${randomUUID()}`;
    await recordDesktopPluginPreviewDiagnostic({
      projectId, buildId, phase: "activation", code: "PREVIEW_CANDIDATE_STARTED",
      message: "Host started validation inside isolated Preview.",
    });
    try {
      const preview = await startDesktopPluginPreview({ projectId, buildId });
      await ensurePluginPreviewWorkspace(preview, project);
      const staged = await stageDeveloperCandidate({
        vaultRoot: ownerVaultRoot(),
        projectId,
        sourceDirectory: project.sourcePath,
        candidate: project.candidate,
        stageArchive: async ({ archivePath, source }) => await stageSpsPluginArchive({
          vaultRoot: preview.previewVault,
          archivePath,
          source,
          registerStage: async (body) => await pluginPreviewApi(preview, "/plugins/registry/stages", {
            method: "POST",
            body,
          }),
        }),
      });
      if (!staged.staged || !staged.stage) {
        throw new Error(staged.errors?.join("\n") || "Development build could not be staged.");
      }
      await recordDesktopPluginPreviewDiagnostic({
        projectId,
        buildId,
        pluginId: staged.stage.pluginId,
        phase: "stage",
        code: "PREVIEW_PACKAGE_STAGED",
        message: "The verified development package was staged inside the isolated Preview.",
      });
      const enabled = await pluginPreviewApi(
        preview,
        `/plugins/registry/stages/${encodeURIComponent(staged.stage.stageId)}/enable`,
        { method: "POST", body: {} },
      );
      if (enabled.plugin?.status !== "ready") {
        throw new Error("The development build did not become ready inside the isolated Preview.");
      }
      await recordDesktopPluginPreviewDiagnostic({
        projectId,
        buildId,
        pluginId: staged.stage.pluginId,
        phase: "activation",
        code: "PREVIEW_PLUGIN_READY",
        message: "The development plugin became ready inside the isolated Preview.",
      });
      await showPluginPreviewWindow(preview);
      const lastKnownGood = await promoteDeveloperCandidate({
        vaultRoot: ownerVaultRoot(),
        projectId,
        buildId,
        deployment: {
          stageId: staged.stage.stageId,
          pluginId: staged.stage.pluginId,
          version: staged.stage.version,
          artifactSha256: staged.artifact.sha256,
          archiveRelativePath: staged.developmentArchiveRelativePath,
        },
      });
      await recordDesktopPluginPreviewDiagnostic({
        projectId, buildId, phase: "activation", code: "PREVIEW_CANDIDATE_VERIFIED",
        message: "Host loaded and verified the candidate inside isolated Preview.",
      }).catch(() => console.warn("SPS Preview verified the candidate, but its feedback record is unavailable."));
      return {
        applied: true,
        isolated: true,
        stage: staged.stage,
        plugin: enabled.plugin,
        lastKnownGood,
        project: publicDeveloperProject(await developerProjectRecord(projectId)),
      };
    } catch (error) {
      await recordDesktopPluginPreviewDiagnostic({
        projectId,
        buildId,
        phase: "activation",
        level: "error",
        code: "PREVIEW_CANDIDATE_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
      await stopDesktopPluginPreview({ removeData: true, closeWindow: true });
      throw error;
    }
  });
}

async function revealDesktopDeveloperPackage(projectId) {
  assertRegistryOwner();
  return await withDeveloperProjectOperation(projectId, async () => {
    const project = await developerProjectRecord(projectId);
    if (!project.lastKnownGood) throw new Error("Open a verified build in Preview before locating its package.");
    const artifact = await resolveDeveloperPackageArtifact({ vaultRoot: ownerVaultRoot(), build: project.lastKnownGood });
    shell.showItemInFolder(artifact.archivePath);
    const { archivePath, ...metadata } = artifact;
    return { revealed: true, ...metadata };
  });
}

async function rollbackDesktopDeveloperProject(projectId) {
  assertRegistryOwner();
  return await withDeveloperProjectOperation(projectId, async () => {
    const project = await developerProjectRecord(projectId);
    const build = await rollbackDeveloperProject({ vaultRoot: ownerVaultRoot(), projectId });
    const preview = await startDesktopPluginPreview({ projectId, buildId: build.buildId });
    try {
      await ensurePluginPreviewWorkspace(preview, project);
      const plugins = await pluginPreviewApi(preview, "/plugins");
      let plugin = Array.isArray(plugins)
        ? plugins.find((entry) => entry?.manifestJson?.id === build.deployment.pluginId)
        : null;
      if (plugin?.status !== "ready" || plugin?.version !== build.deployment.version) {
        const stages = await pluginPreviewApi(preview, "/plugins/registry/stages");
        let stage = Array.isArray(stages)
          ? stages.find((entry) => entry?.artifactSha256 === build.deployment.artifactSha256)
          : null;
        if (!stage) {
          const archivePath = path.resolve(ownerVaultRoot(), build.deployment.archiveRelativePath);
          const buildsRoot = path.resolve(ownerVaultRoot(), "developer-mode", "builds");
          const relative = path.relative(buildsRoot, archivePath);
          if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
            throw new Error("The last known good development archive is outside the Owner Vault.");
          }
          const archiveStats = await fs.lstat(archivePath);
          if (!archiveStats.isFile() || archiveStats.isSymbolicLink()) {
            throw new Error("The last known good development archive is unavailable.");
          }
          const staged = await stageSpsPluginArchive({
            vaultRoot: preview.previewVault,
            archivePath,
            source: {
              registryId: "sps.desktop.development",
              kind: "local",
              releaseLocator: `preview/${build.buildId}.spsplugin`,
            },
            registerStage: async (body) => await pluginPreviewApi(preview, "/plugins/registry/stages", {
              method: "POST",
              body,
            }),
          });
          if (!staged.staged || !staged.stage) {
            throw new Error(staged.errors?.join("\n") || "The last known good build could not be restored.");
          }
          stage = staged.stage;
        }
        const enabled = await pluginPreviewApi(
          preview,
          `/plugins/registry/stages/${encodeURIComponent(stage.stageId)}/enable`,
          { method: "POST", body: {} },
        );
        plugin = enabled.plugin;
      }
      if (plugin?.status !== "ready") {
        throw new Error("The last known good development build did not become ready in Preview.");
      }
      await recordDesktopPluginPreviewDiagnostic({
        projectId,
        buildId: build.buildId,
        pluginId: build.deployment.pluginId,
        phase: "activation",
        code: "PREVIEW_LAST_GOOD_READY",
        message: "The last known good plugin build became ready inside the isolated Preview.",
      });
      await showPluginPreviewWindow(preview);
      return {
        restored: true,
        isolated: true,
        build,
        plugin,
        project: publicDeveloperProject(await developerProjectRecord(projectId)),
      };
    } catch (error) {
      await recordDesktopPluginPreviewDiagnostic({
        projectId,
        buildId: build.buildId,
        pluginId: build.deployment.pluginId,
        phase: "activation",
        level: "error",
        code: "PREVIEW_LAST_GOOD_FAILED",
        message: error instanceof Error ? error.message : String(error),
      });
      await stopDesktopPluginPreview({ removeData: false, closeWindow: true });
      throw error;
    }
  });
}

async function reloadDesktopDeveloperUi(projectId) {
  assertRegistryOwner();
  const project = await developerProjectRecord(projectId);
  if (!project.lastKnownGood) {
    throw new Error("Apply a verified development build before reloading its UI.");
  }
  if (
    !pluginPreviewRuntime
    || pluginPreviewRuntime.buildId !== project.lastKnownGood.buildId
    || !pluginPreviewWindow
    || pluginPreviewWindow.isDestroyed()
  ) {
    throw new Error("Open this project's last known good Preview before reloading its UI.");
  }
  pluginPreviewWindow.webContents.reloadIgnoringCache();
  return {
    reloaded: true,
    pluginId: project.lastKnownGood.deployment.pluginId,
  };
}

async function restartDesktopDeveloperWorker(projectId) {
  assertRegistryOwner();
  const project = await developerProjectRecord(projectId);
  const pluginId = project.lastKnownGood?.deployment.pluginId;
  if (!pluginId) {
    throw new Error("Apply a verified development build before restarting its worker.");
  }
  if (!pluginPreviewRuntime || pluginPreviewRuntime.buildId !== project.lastKnownGood.buildId) {
    throw new Error("Open this project's last known good Preview before restarting its worker.");
  }
  try {
    const result = await pluginPreviewApi(pluginPreviewRuntime, `/plugins/${encodeURIComponent(pluginId)}/worker/restart`, {
      method: "POST",
      body: {},
    });
    await recordDesktopPluginPreviewDiagnostic({
      projectId,
      buildId: pluginPreviewRuntime.buildId,
      pluginId,
      phase: "worker",
      code: "PREVIEW_WORKER_RESTARTED",
      message: "The isolated Preview plugin worker restarted.",
    });
    return result;
  } catch (error) {
    await recordDesktopPluginPreviewDiagnostic({
      projectId,
      buildId: pluginPreviewRuntime.buildId,
      pluginId,
      phase: "worker",
      level: "error",
      code: "PREVIEW_WORKER_RESTART_FAILED",
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function removeDesktopDeveloperProject(projectId) {
  assertRegistryOwner();
  if (activeDeveloperProjectOperations.has(projectId)) {
    throw new Error("Wait for the active developer project operation to finish before disconnecting it.");
  }
  const removed = await removeDeveloperProject({ vaultRoot: ownerVaultRoot(), projectId });
  return publicDeveloperProject(removed);
}

async function showRegistryPluginStages() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Only the signed-in SPS Owner can review Registry plugins.");
  }
  const stages = await ownerHostApi("/plugins/registry/stages", { ownerBootstrap: true });
  const detail = stages.length === 0
    ? "No Registry packages are staged on this Owner Host."
    : stages.map((stage) => `${stage.pluginId} ${stage.version} - ${stage.status}`).join("\n");
  await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "Staged Registry plugins",
    message: stages.length === 0 ? "No staged plugins" : `${stages.length} staged Registry plugin(s)`,
    detail,
  });
  return stages;
}

async function exportOwnerVaultTransfer() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Only the signed-in SPS Owner can export this Owner Vault.");
  }
  const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Choose a folder for SPS Server export",
    properties: ["openDirectory", "createDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  const backup = await ownerHostApi("/instance/database-backups", {
    method: "POST",
    ownerBootstrap: true,
    body: {},
  });
  const exported = await exportSpsOwnerVaultTransfer({
    vaultRoot: ownerVaultRoot(),
    backupFile: backup?.backupFile,
    destinationRoot: selection.filePaths[0],
  });
  await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "SPS Server export complete",
    message: "SPS created a portable server transfer bundle.",
    detail: `${exported.bundleRoot}\n\nThe bundle excludes account credentials and encryption keys.`,
  });
  return exported;
}

async function inspectOwnerVaultTransfer() {
  const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Choose an SPS Server transfer folder",
    properties: ["openDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return null;
  const transfer = await inspectSpsOwnerVaultTransfer({ bundleRoot: selection.filePaths[0] });
  await dialog.showMessageBox(mainWindow ?? undefined, {
    type: "info",
    title: "SPS transfer bundle is ready",
    message: "The transfer bundle is structurally valid.",
    detail: `${transfer.manifest.createdAt}\n\nThis bundle can be restored only from the fresh-Host setup screen.`,
  });
  return transfer;
}

function runOwnerHostRestoreProcess({ command, cwd, helperPath, configPath, backupFile, dbModulePath, embeddedPostgresModulePath, environment }) {
  return new Promise((resolve, reject) => {
    const child = spawnChildProcess(command, [
      helperPath,
      configPath,
      backupFile,
      dbModulePath,
      embeddedPostgresModulePath,
    ], {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, ...environment },
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-8_000);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (signal) reject(new Error(`SPS Host restore stopped unexpectedly (${signal}).`));
      else if (code !== 0) reject(new Error(`SPS Host database restore failed${stderr.trim() ? `: ${stderr.trim()}` : "."}`));
      else resolve();
    });
  });
}

async function restoreOwnerServerFromTransfer() {
  const account = currentDesktopAccount();
  if (!account) throw new Error("Sign in to SPS before restoring an SPS Server.");
  if (ownerHostIsReady()) throw new Error("Stop the current SPS Owner Host before restoring a Server.");
  if (state.ownerHostOwnerSubject || isOwnerHostProfile()) {
    throw new Error("SPS Host restore is allowed only on a fresh Host that has never been activated.");
  }

  const targetRoot = ownerVaultRoot();
  await assertSpsOwnerVaultRestoreTarget({ vaultRoot: targetRoot });
  const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
    title: "Choose an SPS Server transfer folder to restore",
    properties: ["openDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return null;

  const inspected = await inspectSpsOwnerVaultTransfer({ bundleRoot: selection.filePaths[0] });
  const stagingRoot = path.join(app.getPath("userData"), `owner-vault.restore-${randomUUID()}`);
  try {
    const stagingConfig = await ensureSpsOwnerHostConfig({ vaultRoot: stagingRoot });
    const imported = await importSpsOwnerVaultTransfer({ bundleRoot: inspected.bundleRoot, vaultRoot: stagingRoot });
    const developmentCoreRoot = path.resolve(__dirname, "..", "..", "..", "external", "sps-core");
    const materializedRuntime = app.isPackaged ? await materializeCurrentSpsOwnerHostRuntime() : null;
    const runtime = await resolveSpsOwnerHostRuntime({
      packagedRuntimeRoots: app.isPackaged && materializedRuntime ? [materializedRuntime] : [],
      coreRoots: app.isPackaged ? [] : [developmentCoreRoot],
      packagedNodeCommand: process.execPath,
      configPath: stagingConfig.layout.configPath,
      environment: {},
    });
    if (!runtime) throw new Error("SPS Owner Host restore runtime is not available on this computer.");

    const runtimeRoot = materializedRuntime ?? developmentCoreRoot;
    const helperPath = app.isPackaged
      ? path.join(runtimeRoot, "sps-owner-host-restore.mjs")
      : path.join(__dirname, "owner-host-restore.mjs");
    const dbModulePath = app.isPackaged
      ? path.join(runtimeRoot, "node_modules", "@paperclipai", "db", "dist", "index.js")
      : path.join(developmentCoreRoot, "packages", "db", "dist", "index.js");
    const embeddedPostgresModulePath = app.isPackaged
      ? path.join(runtimeRoot, "node_modules", "embedded-postgres", "dist", "index.js")
      : path.join(developmentCoreRoot, "packages", "db", "node_modules", "embedded-postgres", "dist", "index.js");
    await runOwnerHostRestoreProcess({
      command: runtime.command,
      cwd: runtime.cwd,
      helperPath,
      configPath: stagingConfig.layout.configPath,
      backupFile: imported.backupFile,
      dbModulePath,
      embeddedPostgresModulePath,
      environment: runtime.environment,
    });

    await updateSpsOwnerHostConfig({
      vaultRoot: stagingRoot,
      update: (config) => rebaseSpsOwnerHostConfigPaths(config, { vaultRoot: targetRoot }),
    });

    const finalTarget = await assertSpsOwnerVaultRestoreTarget({ vaultRoot: targetRoot });
    if (finalTarget.reason === "bootstrap-only") {
      await fs.rm(targetRoot, { recursive: true, force: true });
    }
    await fs.rename(stagingRoot, targetRoot);
    await startOwnerHost({ activate: true });
    await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
    await dialog.showMessageBox(mainWindow ?? undefined, {
      type: "info",
      title: "SPS Server restored",
      message: "The SPS Server was restored into this fresh Owner Host.",
      detail: "External project folders, Google/CLI sessions, API secrets, Tailscale, and Node credentials were not included. Reconnect them from SPS settings.",
    });
    return publicStatus();
  } catch (error) {
    await fs.rm(stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

async function showPluginRuntimeStatus() {
  pluginRuntimeStatus = await inspectSpsPluginRuntime();
  await dialog.showMessageBox(mainWindow ?? undefined, {
    type: pluginRuntimeStatus.state === "ready" ? "info" : "warning",
    title: "SPS plugin runtime",
    message: pluginRuntimeStatus.state === "ready" ? "Plugin installation is ready." : "SPS is in local-folder plugin mode.",
    detail: pluginRuntimeStatus.version
      ? `npm ${pluginRuntimeStatus.version}\n\n${pluginRuntimeStatus.message}`
      : pluginRuntimeStatus.message,
  });
  return pluginRuntimeStatus;
}

function normalizeCompanyList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((company) => company && typeof company.id === "string" && typeof company.name === "string")
    .map((company) => ({ id: company.id, name: company.name }));
}

async function refreshOwnerHostCompanies() {
  if (!isOwnerHostProfile()) return [];
  ownerHostCompanies = normalizeCompanyList(await ownerHostApi("/companies"));
  return ownerHostCompanies;
}

function initialOwnerHostCompanyName() {
  const accountName = String(currentDesktopAccount()?.name ?? "").trim();
  return accountName ? `${accountName} Workspace` : "SPS Workspace";
}

async function recoverInitialOwnerHostMemberships(recoverableCompanies) {
  // A pre-authenticated SPS Vault can already contain companies created by an
  // older Desktop build. Inspecting that local Vault requires both Desktop
  // launch proofs; accepting the short-lived invitation still uses the real
  // signed-in SPS Identity session. This prevents duplicate companies during
  // the pre-identity -> authenticated migration.
  const companies = Array.isArray(recoverableCompanies)
    ? normalizeCompanyList(recoverableCompanies)
    : normalizeCompanyList(await ownerHostApi("/companies", { ownerBootstrap: true }));
  for (const company of companies) {
    const invitation = await ownerHostApi(`/companies/${encodeURIComponent(company.id)}/invites`, {
      method: "POST",
      ownerBootstrap: true,
      body: {
        allowedJoinTypes: "human",
        humanRole: "owner",
        expiresInMinutes: 15,
        agentMessage: "SPS Desktop local Host membership recovery.",
      },
    });
    if (typeof invitation?.token !== "string") {
      throw new Error(`SPS Owner Host could not recover access to ${company.name}.`);
    }
    const accepted = await ownerHostApi(`/invites/${encodeURIComponent(invitation.token)}/accept`, {
      method: "POST",
      body: { requestType: "human" },
    });
    if (accepted?.status !== "approved") {
      throw new Error(`SPS Identity did not approve recovered access to ${company.name}.`);
    }
  }
  return companies;
}

async function ensureInitialOwnerHostCompany() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) return [];

  // This protected local read is also the durable Core-admin bootstrap for
  // the signed-in Host. It is safe to repeat and never replaces a real admin
  // belonging to another SPS account.
  const vaultCompanies = normalizeCompanyList(await ownerHostApi("/companies", {
    ownerBootstrap: true,
  }));
  let companies = await refreshOwnerHostCompanies();
  if (companies.length === 0) {
    await recoverInitialOwnerHostMemberships(vaultCompanies);
    companies = await refreshOwnerHostCompanies();
  }
  if (companies.length === 0) {
    // The two local Desktop proofs plus the real SPS session are required by
    // Core before a first company can be created. The resulting membership
    // belongs to the signed-in Host, never to a local placeholder identity.
    const created = await ownerHostApi("/companies", {
      method: "POST",
      body: { name: initialOwnerHostCompanyName() },
      ownerBootstrap: true,
    });
    companies = normalizeCompanyList([created]);
    ownerHostCompanies = companies;
  }

  const selectedCompanyId = state.profile?.companyId;
  if (state.profile && !companies.some((company) => company.id === selectedCompanyId)) {
    state.profile.companyId = companies[0]?.id ?? "";
  }
  state.companies = companies.map((company) => ({ ...company }));
  await persistState();
  return companies;
}

async function restartOwnerHostForConfiguration() {
  closeWorkspaceWindow();
  if (ownerHostManager) await ownerHostManager.stop({ force: true });
  ownerHostManager = null;
  defaultMemoryManager = null;
  await startOwnerHost({ activate: false });
}

async function enablePrivateTeamAccess(input) {
  if (!isOwnerHostProfile()) {
    throw new Error("Switch this SPS Desktop to its Owner Host before enabling private team access.");
  }
  if (!currentAccountOwnsOwnerHost()) {
    throw new Error("Sign in with this SPS Owner Host account before enabling private team access.");
  }
  await requireReadyOwnerHost();

  const companyId = String(input?.companyId ?? "").trim();
  if (!companyId) throw new Error("Choose the company whose Owner invitation will initialize this private team Host.");

  if (isTeamAccessEnabled()) {
    if (state.teamAccess?.companyId !== companyId) {
      throw new Error("Private team access is already enabled for another company. Disable it before switching companies.");
    }
    const membership = await ensurePrivateTeamOwnerMembership();
    return {
      teamAccess: { ...state.teamAccess },
      initialOwnerInvite: { accepted: true, expiresAt: null },
      membershipRecovered: membership.recovered,
      identityIssuer: configuredDesktopIdentityUrl(),
    };
  }

  const companies = await refreshOwnerHostCompanies();
  if (!companies.some((company) => company.id === companyId)) {
    throw new Error("Choose a company owned by this local SPS Owner Host.");
  }
  const tailnet = await inspectSpsTailscale();
  if (!tailnet.httpsAvailable) {
    throw new Error(
      "Tailscale HTTPS certificates are not enabled for this tailnet. Enable HTTPS in the Tailscale admin console, then detect Tailscale again before enabling private team access.",
    );
  }
  const localConfig = await ensureSpsOwnerHostConfig({ vaultRoot: ownerVaultRoot() });
  const previousConfig = localConfig.config;
  const credentials = {
    authSecret: randomBytes(48).toString("base64url"),
  };
  const nextTeamAccess = {
    enabled: true,
    phase: "preparing",
    mode: "private-tailnet",
    hostname: tailnet.hostname,
    url: spsTailnetPublicUrl(tailnet.hostname),
    companyId,
    configuredAt: new Date().toISOString(),
  };

  state.teamAccess = nextTeamAccess;
  state.encryptedTeamCredentials = encrypt(JSON.stringify(credentials));
  // Keep the exact local target we hand to Tailscale so a failed hand-off can
  // remove only the SPS route it just created.
  let servedOwnerHostUrl = null;
  // Persist credentials before the Core changes mode. If Windows restarts in
  // the middle of the hand-off, the Owner Host can still start securely and
  // the owner can explicitly return to authenticated loopback mode instead of losing the
  // credentials required to recover it.
  await persistState();
  try {
    await updateSpsOwnerHostConfig({
      vaultRoot: ownerVaultRoot(),
      update: (config) => configureSpsOwnerHostPrivateTeamAccess(config, { hostname: tailnet.hostname }),
    });
    await restartOwnerHostForConfiguration();
    servedOwnerHostUrl = ownerHostStatus.url;
    const tailscale = await enableSpsTailscaleServe({ ownerHostUrl: servedOwnerHostUrl });
    if (!tailscale.serve || !tailscale.tailnet) {
      throw new Error("Tailscale Serve did not confirm the SPS private team route.");
    }
    // Most Hosts already own the selected company through the local bootstrap.
    // Verify that membership over the private URL first; the recovery helper
    // creates and accepts a narrowly scoped Owner invite only when it is truly
    // missing. This avoids treating Core's correct "already a member" conflict
    // as a failed team activation.
    await ensurePrivateTeamOwnerMembership();
  } catch (error) {
    if (servedOwnerHostUrl) {
      await disableSpsTailscaleServe({
        hostname: tailnet.hostname,
        ownerHostUrl: servedOwnerHostUrl,
      }).catch(() => undefined);
    }
    state.teamAccess = null;
    state.encryptedTeamCredentials = null;
    await updateSpsOwnerHostConfig({ vaultRoot: ownerVaultRoot(), update: () => previousConfig }).catch(() => undefined);
    await restartOwnerHostForConfiguration().catch(() => undefined);
    await persistState().catch(() => undefined);
    throw error;
  }

  stopNodeScheduling();
  state.identity = null;
  state.nodeId = null;
  state.nodeStatus = null;
  state.encryptedBoardApiToken = null;
  state.companies = [];
  state.projects = [];
  state.teamAccess = { ...nextTeamAccess, phase: "active" };
  // The Owner continues to use the local Desktop-trusted URL. Tailscale is
  // the Member Node route, not a reason to turn the physical Owner Host into
  // a remote client and lose its invitation-management surface.
  await activateOwnerHostProfile();
  return {
    teamAccess: { ...nextTeamAccess },
    initialOwnerInvite: { accepted: true, expiresAt: null },
    identityIssuer: configuredDesktopIdentityUrl(),
  };
}

async function createMemberInvite() {
  if (!isTeamAccessEnabled() || !state.teamAccess?.companyId || !state.teamAccess.url) {
    throw new Error("Enable private team access before creating a member invitation.");
  }
  const membership = await ensurePrivateTeamOwnerMembership();
  const invitation = await ownerHostApi(`/companies/${encodeURIComponent(state.teamAccess.companyId)}/invites`, {
    method: "POST",
    ownerBootstrap: true,
    body: {
      allowedJoinTypes: "human",
      humanRole: "operator",
      expiresInMinutes: 24 * 60,
      agentMessage: null,
    },
  });
  if (typeof invitation?.token !== "string") {
    throw new Error("SPS Owner Host did not return a member invitation.");
  }
  // The Workspace may have rendered before a recovered SPS Identity
  // membership existed. Refresh it only after that one-time repair so the
  // Owner is not left looking at a stale "No company access" screen.
  if (membership.recovered && workspaceWindow && !workspaceWindow.isDestroyed()) {
    workspaceWindow.webContents.reloadIgnoringCache();
  }
  return {
    id: invitation.id,
    code: createSpsRoutedInviteCode(state.teamAccess.url, invitation.token),
    expiresAt: invitation.expiresAt ?? null,
    membershipRecovered: membership.recovered,
  };
}

async function listMemberInvites() {
  if (!isTeamAccessEnabled() || !state.teamAccess?.companyId) {
    throw new Error("Enable private team access before managing member invitations.");
  }
  await ensurePrivateTeamOwnerMembership();
  const response = await ownerHostApi(
    `/companies/${encodeURIComponent(state.teamAccess.companyId)}/invites?state=active&limit=50`,
    { ownerBootstrap: true },
  );
  const invites = Array.isArray(response?.invites) ? response.invites : [];
  return invites
    .filter((invite) => (
      invite
      && invite.allowedJoinTypes === "human"
      && invite.humanRole === "operator"
      && typeof invite.id === "string"
    ))
    .map((invite) => ({
      id: invite.id,
      state: invite.state,
      createdAt: invite.createdAt ?? null,
      expiresAt: invite.expiresAt ?? null,
    }));
}

async function revokeMemberInvite(input) {
  const inviteId = String(input?.inviteId ?? "").trim();
  if (!/^[a-z0-9-]{16,}$/i.test(inviteId)) throw new Error("Choose a valid SPS Desktop member invitation.");
  const activeInvites = await listMemberInvites();
  if (!activeInvites.some((invite) => invite.id === inviteId)) {
    throw new Error("That member invitation is no longer active or was not created by SPS Desktop.");
  }
  const revoked = await ownerHostApi(`/invites/${encodeURIComponent(inviteId)}/revoke`, {
    method: "POST",
    ownerBootstrap: true,
    body: {},
  });
  return { id: inviteId, state: revoked?.revokedAt ? "revoked" : "unknown" };
}

async function saveRemoteProfile(input) {
  const companyId = String(input?.companyId ?? "").trim();
  const displayName = String(input?.displayName ?? "").trim();
  const hubUrl = requireSpsHubOrigin(input?.hubUrl);
  const previousProfile = state.profile;
  const requestedAuthMode = input?.authMode === "sps-identity"
    ? "sps-identity"
    : input?.authMode === "legacy"
      ? "legacy"
      : previousProfile?.hubUrl === hubUrl
        ? previousProfile.authMode ?? "legacy"
        : "legacy";
  const connectionScopeChanged = Boolean(
    previousProfile &&
    (previousProfile.hubUrl !== hubUrl || previousProfile.companyId !== companyId),
  );
  const hubChanged = Boolean(previousProfile && previousProfile.hubUrl !== hubUrl);
  const companyChanged = Boolean(previousProfile && previousProfile.companyId !== companyId);
  if (connectionScopeChanged) {
    await disconnectCurrentNode();
  }
  if (hubChanged) {
    pendingAuth = null;
    state.encryptedBoardApiToken = null;
    state.companies = [];
  }
  if (hubChanged || companyChanged) state.projects = [];
  state.profile = {
    hubUrl,
    connectionKind: "remote",
    authMode: requestedAuthMode,
    companyId,
    displayName: displayName.slice(0, 120),
    defaultWorkspacePath: String(input?.defaultWorkspacePath ?? "").trim(),
    projectWorkspaces: connectionScopeChanged ? {} : state.profile?.projectWorkspaces ?? {},
    workspaceSources: connectionScopeChanged ? [] : state.profile?.workspaceSources ?? [],
  };
  await persistState();
  if (companyId && (currentBoardToken() || isSpsIdentityRemoteProfile(state.profile))) {
    try {
      await refreshProjects();
    } catch {
      // The profile remains usable while a transient Hub error is retried from setup.
    }
  }
  return publicStatus();
}

async function acceptInviteCode(input) {
  if (isOwnerHostProfile()) {
    throw new Error("This SPS Owner Host creates member invitations; it does not join another team.");
  }
  const pasted = String(input?.code ?? "").trim();
  const routed = parseSpsRoutedInviteCode(pasted);
  const explicitHub = input?.hub ? requireSpsHubOrigin(input.hub) : null;
  const hubUrl = routed?.hub ?? explicitHub ?? state.profile?.hubUrl ?? null;
  const inviteCode = routed?.code ?? pasted;
  if (!hubUrl) {
    throw new Error("Paste the full SPS2 invitation code from the Owner. Short SPS codes work only after this computer already knows the team address.");
  }

  if (routed || explicitHub) {
    const accepted = await acceptSpsIdentityInvite(hubUrl, inviteCode);
    await saveRemoteProfile({
      hubUrl,
      companyId: "",
      authMode: accepted ? "sps-identity" : "legacy",
      displayName: state.profile?.displayName ?? "",
      defaultWorkspacePath: state.profile?.defaultWorkspacePath ?? "",
    });
    if (accepted) {
      await refreshSpsIdentityTeamContext();
      // A direct Desktop acceptance has already established membership. Open
      // the workspace now so the normal Member Node registration lifecycle
      // runs instead of leaving the user on the setup screen.
      await maybeOpenWorkspaceForCurrentAccount();
      return { hub: hubUrl, status: accepted.status ?? "approved", direct: true };
    }
    await openSpsExternalUrl(buildInviteUrl(hubUrl, inviteCode));
    return { hub: hubUrl };
  }
  const accepted = await acceptSpsIdentityInvite(hubUrl, inviteCode);
  if (accepted) {
    await saveRemoteProfile({ ...state.profile, hubUrl, authMode: "sps-identity" });
    await refreshSpsIdentityTeamContext();
    await maybeOpenWorkspaceForCurrentAccount();
    return { hub: hubUrl, status: accepted.status ?? "approved", direct: true };
  }
  const url = buildInviteUrl(hubUrl, inviteCode);
  await openSpsExternalUrl(url);
  return { hub: hubUrl };
}

async function disablePrivateTeamAccess() {
  if (!state.teamAccess?.enabled) return publicStatus();
  const activeTeamAccess = { ...state.teamAccess };
  const config = await ensureSpsOwnerHostConfig({ vaultRoot: ownerVaultRoot() });
  await disableSpsTailscaleServe({
    hostname: activeTeamAccess.hostname,
    ownerHostUrl: spsOwnerHostUrl(config.config),
  });
  state.teamAccess = null;
  state.encryptedTeamCredentials = null;
  await updateSpsOwnerHostConfig({
    vaultRoot: ownerVaultRoot(),
    update: (config) => configureSpsOwnerHostAuthenticatedLocal(config),
  });
  await restartOwnerHostForConfiguration();
  await activateOwnerHostProfile();
  await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
  return publicStatus();
}

function normalizeProjectList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((project) => project && typeof project.id === "string" && typeof project.name === "string")
    .map((project) => ({ id: project.id, name: project.name }));
}

async function refreshProjects() {
  if (isOwnerHostProfile()) {
    // The Owner Host is not a Member Node, but it still needs the same
    // project list to choose the one source folder each project exposes.
    if (!state.profile?.companyId && !state.teamAccess?.companyId && ownerHostCompanies.length === 0) {
      await refreshOwnerHostCompanies();
    }
    const companyId = state.profile?.companyId
      || state.teamAccess?.companyId
      || ownerHostCompanies[0]?.id
      || null;
    if (companyId && state.profile && !state.profile.companyId) {
      // Private Owner Hosts already persist the company selected while team
      // access was enabled. Reuse it for Host-only folder management rather
      // than requiring a second, unrelated company picker.
      state.profile.companyId = companyId;
    }
    state.projects = companyId
      ? normalizeProjectList(await ownerHostApi(`/companies/${encodeURIComponent(companyId)}/projects`))
      : [];
    await persistState();
    return state.projects;
  }
  const companyId = state.profile?.companyId;
  if (!state.profile || !companyId) {
    state.projects = [];
    await persistState();
    return state.projects;
  }
  const access = await resolveSpsCoreRequestAccess(state.profile.hubUrl);
  if (!access.accessToken && !access.sessionCookie) {
    state.projects = [];
    await persistState();
    return state.projects;
  }
  const projects = await listSpsProjects({
    hubUrl: state.profile.hubUrl,
    companyId,
    ...access,
  });
  state.projects = normalizeProjectList(projects);
  await persistState();
  return state.projects;
}

function stopNodeScheduling() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  stopCommandPolling();
  resetNodeRuntimeStatus();
}

function stopCommandPolling() {
  if (commandPollTimer) clearInterval(commandPollTimer);
  commandPollTimer = null;
  commandPollInFlight = false;
}

async function applyNodeStatus(value, { persist = true } = {}) {
  const status = normalizeSpsNodeStatus(value);
  const changed = state.nodeStatus !== status;
  state.nodeStatus = status;
  if (canRunSpsNodeCommands(status)) {
    if (!commandPollTimer) scheduleCommandPolling();
  } else {
    stopCommandPolling();
  }
  if (persist && changed) await persistState();
  return status;
}

function nodeWasRevoked(error) {
  return error instanceof SpsHubRequestError
    && error.status === 403
    && error.message === "This SPS Node has been revoked";
}

async function clearRemovedMemberConnection() {
  stopNodeScheduling();
  await cancelSpsNodeCommands("SPS Host removed this computer's Member access, so its local command stopped.");
  state.identity = null;
  state.nodeId = null;
  state.nodeStatus = "revoked";
  state.profile = null;
  state.companies = [];
  nodeRuntimeStatus.heartbeatError = "The SPS Host removed this computer's access. The team connection has been cleared.";
  nodeRuntimeStatus.commandPollError = "Ask the SPS Host for a new Desktop invitation to reconnect.";
  closeWorkspaceWindow();
  await persistState();
  await openSetup();
}

function workspaceHubUrl() {
  if (!state.profile?.hubUrl) return null;
  return isOwnerHostProfile()
    ? requireSpsOwnerHostOrigin(state.profile.hubUrl)
    : requireSpsHubOrigin(state.profile.hubUrl);
}

function isCurrentWorkspaceApiUrl(url) {
  return Boolean(workspaceOrigin && isSpsHubApiUrl(url, workspaceOrigin));
}

async function openSetup() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  setupMode = true;
  rendererReadyForJoinLinks = false;
  // Returning from Workspace is the normal way an Owner changes source
  // folders. Refresh here so a project created during the same session is
  // visible without making the Owner restart the Desktop app.
  if (isOwnerHostProfile() && ownerHostStatus.state === "running") {
    await refreshProjects().catch(() => {});
  }
  await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function closeWorkspaceWindow() {
  const current = workspaceWindow;
  workspaceWindow = null;
  workspaceOrigin = null;
  createApplicationMenu();
  refreshTrayMenu();
  if (current && !current.isDestroyed()) current.close();
}

function configureWorkspaceNavigation(window, hubOrigin) {
  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedSpsWorkspaceNavigation(url, hubOrigin)) return;
    event.preventDefault();
    void openSpsExternalUrl(url).catch(() => {});
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openSpsExternalUrl(url).catch(() => {});
    return { action: "deny" };
  });
}

async function showRegistryWindow({ sourceId = null, developerContext = null } = {}) {
  assertRegistryOwner();
  registryDeveloperContext = developerContext ? { context: normalizeDeveloperContext(developerContext), token: randomUUID() } : null;
  if (registryWindow && !registryWindow.isDestroyed()) {
    await registryWindow.loadFile(path.join(__dirname, "..", "renderer", "registry.html"), { query: sourceId ? { source: sourceId } : {} });
    registryWindow.show();
    registryWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    width: 1_080,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: "SPS Plugin Sources & Review",
    icon: path.join(__dirname, "..", "assets", "sps-logo.png"),
    webPreferences: createSpsSetupWindowPreferences(path.join(__dirname, "registry-preload.cjs")),
  });
  registryWindow = window;
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
    void openSpsExternalUrl(url).catch(() => {});
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openSpsExternalUrl(url).catch(() => {});
    return { action: "deny" };
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (registryWindow === window) { registryWindow = null; registryDeveloperContext = null; }
  });
  await window.loadFile(
    path.join(__dirname, "..", "renderer", "registry.html"),
    sourceId ? { query: { source: sourceId } } : undefined,
  );
}

async function showOfficialExtensionsWindow() {
  if (!currentDesktopAccount()) throw new Error("Sign in to SPS before opening SPS Official Extensions.");
  if (officialExtensionsWindow && !officialExtensionsWindow.isDestroyed()) {
    officialExtensionsWindow.show();
    officialExtensionsWindow.focus();
    return;
  }
  const window = new BrowserWindow({
    width: 1_120,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    show: false,
    title: "SPS Official Extensions",
    icon: path.join(__dirname, "..", "assets", "sps-logo.png"),
    webPreferences: createSpsSetupWindowPreferences(path.join(__dirname, "official-extensions-preload.cjs")),
  });
  officialExtensionsWindow = window;
  window.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
    void openSpsExternalUrl(url).catch(() => {});
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void openSpsExternalUrl(url).catch(() => {});
    return { action: "deny" };
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (officialExtensionsWindow === window) officialExtensionsWindow = null;
  });
  await window.loadFile(path.join(__dirname, "..", "renderer", "official-extensions.html"));
}

async function openWorkspace() {
  if (!currentDesktopAccount()) throw new Error("Sign in to SPS before opening SPS Workspace.");
  if (!state.profile) throw new Error("Save an SPS team connection first");
  if (isOwnerHostProfile() && !currentAccountOwnsOwnerHost()) {
    throw new Error("Sign in with the SPS account that owns this SPS Server before opening its local Workspace.");
  }
  if (!isOwnerHostProfile() && !currentBoardToken() && !currentDesktopAccount()?.accessToken) {
    throw new Error("Continue with SPS sign-in before opening the SPS workspace");
  }
  const hubOrigin = workspaceHubUrl();
  if (!hubOrigin) throw new Error("Save an SPS team connection first");
  setupMode = false;
  // Every SPS Desktop Host and Member has a signed-in SPS Identity account.
  // The Desktop-only header protects the loopback transport as an additional
  // proof, while the Core session identifies the actual user.
  const usesIdentitySession = await establishSpsIdentityCoreSession(hubOrigin);
  if (!currentBoardToken() && !usesIdentitySession) {
    throw new Error("SPS could not establish this Desktop account's Workspace session. Sign in to SPS Desktop again and retry.");
  }
  await ensureJoinedDesktopNode();
  if (workspaceWindow && !workspaceWindow.isDestroyed() && workspaceOrigin === hubOrigin) {
    if (workspaceWindow.isMinimized()) workspaceWindow.restore();
    workspaceWindow.show();
    workspaceWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return;
  }
  closeWorkspaceWindow();
  workspaceOrigin = hubOrigin;
  const currentWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 640,
    show: false,
    icon: path.join(__dirname, "..", "assets", "sps-logo.png"),
    webPreferences: createSpsWorkspaceWindowPreferences(
      isOwnerHostProfile() ? path.join(__dirname, "workspace-preload.cjs") : undefined,
    ),
  });
  workspaceWindow = currentWindow;
  createApplicationMenu();
  refreshTrayMenu();
  configureWorkspaceNavigation(currentWindow, hubOrigin);
  currentWindow.once("ready-to-show", () => {
    currentWindow.show();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });
  currentWindow.on("closed", () => {
    if (workspaceWindow !== currentWindow) return;
    workspaceWindow = null;
    workspaceOrigin = null;
    createApplicationMenu();
    refreshTrayMenu();
  });
  await currentWindow.loadURL(`${hubOrigin}/`);
}

async function maybeOpenWorkspaceForCurrentAccount() {
  if (!currentDesktopAccount() || !state.profile) return false;
  if (isOwnerHostProfile()) {
    if (!currentAccountOwnsOwnerHost() || !ownerHostIsReady()) return false;
  } else if (!currentBoardToken() && !currentDesktopAccount()?.accessToken) {
    return false;
  }
  await openWorkspace();
  return true;
}

async function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) await createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function showWorkspace() {
  await openWorkspace();
}

function ensureCoreSettingsController() {
  if (coreSettingsController) return coreSettingsController;
  coreSettingsController = createCoreSettingsController({
    BrowserWindow,
    globalShortcut,
    rendererFile: path.join(__dirname, "..", "renderer", "core-settings.html"),
    preloadFile: path.join(__dirname, "core-settings-preload.cjs"),
    getStatus: async () => {
      const recovery = await loadCoreRecoverySettings({ userDataPath: app.getPath("userData") });
      const host = ownerHostManager ? await ownerHostManager.inspect().catch(() => ownerHostStatus) : ownerHostStatus;
      return {
        appVersion: app.getVersion(),
        canManageHost: isOwnerHostProfile() && currentAccountOwnsOwnerHost(),
        host: { state: host.state, lastError: host.lastError ? redactLocalDiagnostic(host.lastError) : null },
        recovery: { ...recovery, needsRestart: ownerHostRecoveryPluginsDisabled !== null && recovery.pluginsDisabled !== ownerHostRecoveryPluginsDisabled },
      };
    },
    authorizeMutation: assertRegistryOwner,
    setPluginsDisabled: disabled => saveCoreRecoverySettings({ userDataPath: app.getPath("userData"), disabled }),
    confirmRestart: async parentWindow => {
      const choice = await dialog.showMessageBox(parentWindow, {
        type: "warning", title: "Restart the local SPS Host?",
        message: "Restart the Host with the saved recovery settings?",
        detail: "This stops the local Host and requests cancellation of its managed work across Workspaces. Saved plugin activation and data are kept. Remote process termination may remain pending until its Node responds.",
        buttons: ["Cancel", "Restart Host"], defaultId: 0, cancelId: 0,
      });
      return choice.response === 1;
    },
    restartHost: async () => {
      const current = await ownerHostManager?.inspect();
      if (current?.state === "running-existing") throw new Error("SPS cannot restart a Host process it does not own.");
      closeWorkspaceWindow();
      await cancelSpsNodeCommands("The local Host was explicitly restarted from Core Settings.");
      await defaultMemoryManager?.stop({ force: false });
      await ownerHostManager?.stop({ force: false });
      defaultMemoryManager = null;
      ownerHostManager = null;
      ownerHostRecoveryPluginsDisabled = null;
      await startOwnerHost({ activate: false });
      sendDesktopAccountStatus();
    },
    openWorkspace: showWorkspace,
    checkUpdates: checkForDesktopBetaUpdate,
    exportHost: exportOwnerVaultTransfer,
    inspectTransfer: inspectOwnerVaultTransfer,
  });
  return coreSettingsController;
}

async function showCoreSettings() {
  await ensureCoreSettingsController().show();
}

function canCreateMemberInvite() {
  return Boolean(
    currentDesktopAccount()
    && isOwnerHostProfile()
    && currentAccountOwnsOwnerHost()
    && isTeamAccessEnabled(),
  );
}

function canRegisterCurrentDesktopNode() {
  return Boolean(
    currentDesktopAccount()
    && !isOwnerHostProfile()
    && state.profile?.companyId,
  );
}

async function registerCurrentDesktopNode() {
  if (!canRegisterCurrentDesktopNode()) {
    throw new Error("Join an SPS team and sign in before registering this computer.");
  }
  if (state.nodeStatus === "active") {
    await dialog.showMessageBox(mainWindow ?? workspaceWindow ?? undefined, {
      type: "info",
      title: "SPS Node is ready",
      message: "This computer is already approved for SPS Node work.",
    });
    return null;
  }
  if (state.nodeStatus === "pending") {
    await dialog.showMessageBox(mainWindow ?? workspaceWindow ?? undefined, {
      type: "info",
      title: "Waiting for Owner approval",
      message: "This computer has already requested SPS Node access. An Owner or Admin must approve it in Company settings > Nodes.",
    });
    return null;
  }

  try {
    const result = await connectNode();
    createApplicationMenu();
    refreshTrayMenu();
    await dialog.showMessageBox(mainWindow ?? workspaceWindow ?? undefined, {
      type: "info",
      title: "SPS Node registration requested",
      message: "This computer is waiting for Owner approval.",
      detail: "After approval, the Owner can grant this computer to selected Agents. No CLI command can run before both steps are complete.",
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "SPS could not register this computer.";
    await dialog.showMessageBox(mainWindow ?? workspaceWindow ?? undefined, {
      type: "error",
      title: "SPS Node registration failed",
      message,
    });
    throw error;
  }
}

function runNodeRegistrationFromTray() {
  void registerCurrentDesktopNode().catch(() => {
    // registerCurrentDesktopNode displays the safe, user-facing failure.
  });
}

async function showMemberInvite() {
  if (!canCreateMemberInvite()) {
    throw new Error("Enable private team access before creating a teammate invitation.");
  }
  const invite = await createMemberInvite();
  const expires = invite.expiresAt ? `\n\nExpires: ${new Date(invite.expiresAt).toLocaleString()}` : "";
  const result = await dialog.showMessageBox(workspaceWindow ?? mainWindow ?? undefined, {
    type: "info",
    title: "SPS teammate invitation",
    message: "Share this full SPS2 invitation code with one teammate.",
    detail: `${invite.code}${expires}\n\nA new computer needs the complete SPS2 code so it knows the trusted SPS Server address.`,
    buttons: ["Copy code", "Close"],
    defaultId: 0,
    cancelId: 1,
  });
  if (result.response === 0) clipboard.writeText(invite.code);
  return invite;
}

function configureWorkspaceRequestAuth() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    if (isOwnerHostProfile() && isSpsDesktopWorkspaceRequest({
      url: details.url,
      workspaceOrigin,
    })) {
      requestHeaders[SPS_DESKTOP_ACCESS_HEADER] = ownerHostDesktopAccessToken;
    }
    if (isOwnerHostProfile() && isSpsDesktopTechnicalHostRequest({
      url: details.url,
      workspaceOrigin,
      method: details.method,
    })) {
      requestHeaders[SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER] = ownerHostDesktopAccessToken;
    }
    const accessToken = currentBoardToken();
    if (accessToken && isCurrentWorkspaceApiUrl(details.url)) {
      requestHeaders.Authorization = `Bearer ${accessToken}`;
    }
    callback({ requestHeaders });
  });
}

function createApplicationMenu() {
  const run = (action) => {
    void action().catch(() => {
      // The visible screen explains connection failures without exposing tokens.
    });
  };
  const account = currentDesktopAccount();
  const accountLabel = account
    ? `${account.name}${account.email ? ` (${account.email})` : ""}`
    : "SPS 계정에 로그인";
  const workspaceOpen = Boolean(workspaceWindow && !workspaceWindow.isDestroyed());
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "SPS Desktop",
      submenu: [
        { label: accountLabel, enabled: false },
        { type: "separator" },
        { label: "Core settings...", click: () => run(showCoreSettings) },
        { label: "Open SPS workspace", enabled: Boolean(account && state.profile), click: () => run(showWorkspace) },
        { label: "Connect this computer as an SPS Node...", visible: canRegisterCurrentDesktopNode(), click: () => run(registerCurrentDesktopNode) },
        { label: "Create teammate invitation...", visible: canCreateMemberInvite(), click: () => run(showMemberInvite) },
        { label: "Check for SPS Desktop updates...", click: () => run(checkForDesktopBetaUpdate) },
        {
          label: "Official extensions...",
          accelerator: "CommandOrControl+Alt+E",
          visible: workspaceOpen,
          enabled: Boolean(account && workspaceOpen),
          click: () => run(showOfficialExtensionsWindow),
        },
        { label: "서버 연결 및 계정", click: () => run(async () => { await showMainWindow(); await openSetup(); }) },
        {
          label: "Advanced",
          submenu: [
            { label: "Plugin sources & review...", accelerator: "CommandOrControl+Alt+R", visible: workspaceOpen, enabled: Boolean(account && workspaceOpen && isOwnerHostProfile()), click: () => run(showRegistryWindow) },
            { label: "Stage a plugin file...", visible: workspaceOpen, enabled: Boolean(account && workspaceOpen && isOwnerHostProfile()), click: () => run(stageRegistryPluginFromFilePicker) },
            { label: "Review staged plugins...", visible: workspaceOpen, enabled: Boolean(account && workspaceOpen && isOwnerHostProfile()), click: () => run(showRegistryPluginStages) },
            { type: "separator" },
            { label: "Check plugin runtime...", visible: workspaceOpen, enabled: workspaceOpen, click: () => run(showPluginRuntimeStatus) },
            { label: "Export SPS server data...", enabled: Boolean(account && isOwnerHostProfile()), click: () => run(exportOwnerVaultTransfer) },
            { label: "Check SPS transfer bundle...", click: () => run(inspectOwnerVaultTransfer) },
          ],
        },
        { type: "separator" },
        {
          label: "이 컴퓨터에서 로그아웃",
          enabled: Boolean(account),
          click: () => run(signOutDesktopAccount),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ]));
  coreSettingsController?.hideMenuBar();
}

function refreshTrayMenu() {
  if (!tray) return;
  const account = currentDesktopAccount();
  const accountLabel = account?.email ?? account?.name ?? "SPS 계정에 로그인";
  const workspaceOpen = Boolean(workspaceWindow && !workspaceWindow.isDestroyed());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: accountLabel, enabled: false },
    { type: "separator" },
    { label: "Core settings...", click: () => { void showCoreSettings(); } },
    { label: "Open SPS Desktop", click: () => { void showMainWindow(); } },
    { label: "Open SPS workspace", enabled: Boolean(account && state.profile), click: () => { void showWorkspace(); } },
    { label: "Connect this computer as an SPS Node...", visible: canRegisterCurrentDesktopNode(), click: () => { void runNodeRegistrationFromTray(); } },
    { label: "Create teammate invitation...", visible: canCreateMemberInvite(), click: () => { void showMemberInvite(); } },
    { label: "Check for SPS Desktop updates...", click: () => { void checkForDesktopBetaUpdate(); } },
    {
      label: "Official extensions...",
      accelerator: "CommandOrControl+Alt+E",
      visible: workspaceOpen,
      enabled: Boolean(account && workspaceOpen),
      click: () => { void showOfficialExtensionsWindow(); },
    },
    {
      label: "Advanced",
      submenu: [
        { label: "Plugin sources & review...", accelerator: "CommandOrControl+Alt+R", visible: workspaceOpen, enabled: Boolean(account && workspaceOpen && isOwnerHostProfile()), click: () => { void showRegistryWindow(); } },
        { label: "Stage a plugin file...", visible: workspaceOpen, enabled: Boolean(account && workspaceOpen && isOwnerHostProfile()), click: () => { void stageRegistryPluginFromFilePicker(); } },
        { label: "Review staged plugins...", visible: workspaceOpen, enabled: Boolean(account && workspaceOpen && isOwnerHostProfile()), click: () => { void showRegistryPluginStages(); } },
        { type: "separator" },
        { label: "Check plugin runtime...", visible: workspaceOpen, enabled: workspaceOpen, click: () => { void showPluginRuntimeStatus(); } },
        { label: "Export SPS server data...", enabled: Boolean(account && isOwnerHostProfile()), click: () => { void exportOwnerVaultTransfer(); } },
        { label: "Check SPS transfer bundle...", click: () => { void inspectOwnerVaultTransfer(); } },
      ],
    },
    { label: "서버 연결 및 계정", click: () => { void showMainWindow().then(openSetup); } },
    { type: "separator" },
    { label: "이 컴퓨터에서 로그아웃", enabled: Boolean(account), click: () => { void signOutDesktopAccount(); } },
    { type: "separator" },
    { label: "Quit SPS Desktop", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  if (tray) {
    refreshTrayMenu();
    return;
  }
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "sps-logo.png"));
  tray = new Tray(icon);
  tray.setToolTip("SPS Desktop Node");
  refreshTrayMenu();
  tray.on("double-click", () => { void showMainWindow(); });
}

function publicStatus() {
  const desktopAccount = currentDesktopAccount();
  const accountStatus = desktopAccountController?.getStatus() ?? {
    configured: true,
    provider: "SPS Identity",
    identityUrl: configuredDesktopIdentityUrl(),
    signedIn: Boolean(desktopAccount),
    pending: false,
    error: null,
    name: desktopAccount?.name ?? null,
    email: desktopAccount?.email ?? null,
    picture: desktopAccount?.picture ?? null,
    verifiedAt: desktopAccount?.verifiedAt ?? null,
    lastAttempt: state.desktopAccountLastAttempt ?? null,
  };
  return {
    desktopAccount: {
      ...accountStatus,
    },
    profile: state.profile
      ? {
        hubUrl: state.profile.hubUrl,
        connectionKind: state.profile.connectionKind,
        authMode: state.profile.authMode ?? "legacy",
        companyId: state.profile.companyId,
        displayName: state.profile.displayName,
        defaultWorkspacePath: state.profile.defaultWorkspacePath,
        projectWorkspaces: { ...(state.profile.projectWorkspaces ?? {}) },
        workspaceSources: normalizeSpsWorkspaceSources(state.profile.workspaceSources),
      }
      : null,
    hasIdentity: Boolean(state.identity),
    signedIn: Boolean(currentBoardToken())
      || Boolean(isSpsIdentityRemoteProfile() && desktopAccount)
      || Boolean(isOwnerHostProfile() && currentAccountOwnsOwnerHost()),
    nodeId: state.nodeId,
    nodeStatus: normalizeSpsNodeStatus(state.nodeStatus),
    companies: Array.isArray(state.companies)
      ? state.companies.map((company) => ({ id: company.id, name: company.name }))
      : [],
    projects: Array.isArray(state.projects)
      ? state.projects.map((project) => ({ id: project.id, name: project.name }))
      : [],
    pendingAuth: pendingAuth
      ? { approvalUrl: pendingAuth.approvalUrl, expiresAt: pendingAuth.expiresAt }
      : null,
    commandRunner: {
      active: Boolean(commandPollTimer) && canRunSpsNodeCommands(state.nodeStatus),
      workspaceConfigured: Boolean(state.profile?.defaultWorkspacePath),
      launchAtLogin: launchAtLoginEnabled,
    },
    setupMode,
    nodeConnection: state.nodeId ? { ...nodeRuntimeStatus } : null,
    ownerHost: {
      state: ownerHostStatus.state,
      url: ownerHostStatus.url,
      startedAt: ownerHostStatus.startedAt,
      lastError: ownerHostStatus.lastError,
      vaultPath: ownerHostStatus.vaultPath,
      defaultMemory: {
        state: defaultMemoryStatus.state,
        url: defaultMemoryStatus.url,
        startedAt: defaultMemoryStatus.startedAt,
        lastError: defaultMemoryStatus.lastError,
        vaultPath: defaultMemoryStatus.vaultPath,
      },
      pluginRuntime: { ...pluginRuntimeStatus },
      legacyAdoptionPending: Boolean(state.legacyOwnerHostAdoptionPending),
    },
    agentRuntimePacks: agentRuntimePacks.map((pack) => ({
      id: pack.id,
      label: pack.label,
      version: pack.version,
      commands: [...pack.commands],
      complete: pack.complete,
    })),
    teamAccess: state.teamAccess
      ? {
        enabled: Boolean(state.teamAccess.enabled),
        mode: state.teamAccess.mode,
        hostname: state.teamAccess.hostname,
        url: state.teamAccess.url,
        companyId: state.teamAccess.companyId,
        configuredAt: state.teamAccess.configuredAt,
        phase: state.teamAccess.phase === "preparing" ? "preparing" : "active",
      }
      : null,
    serverAccess: resolveSpsServerAccess({
      profile: state.profile,
      teamAccess: state.teamAccess,
    }),
    ownerHostCompanies: isOwnerHostProfile()
      ? ownerHostCompanies.map((company) => ({ id: company.id, name: company.name }))
      : [],
    update: {
      ...desktopUpdateController.getStatus(),
    },
  };
}

function initializeDesktopAccountController() {
  desktopAccountController = createSpsDesktopAccountController({
    app,
    session,
    state,
    encrypt,
    decrypt,
    persistState,
    loadPersistedState: () => loadState(app.getPath("userData")),
    withRefreshLock: withSpsDesktopRefreshLock,
    refreshIdentity: refreshSpsDesktopIdentity,
    isExpiredRefreshToken: isExpiredSpsDesktopRefreshToken,
    configuredIdentityUrl: configuredDesktopIdentityUrl,
    startIdentitySignIn: startSpsDesktopIdentitySignIn,
    revokeIdentity: revokeSpsDesktopIdentity,
    openExternal: openSpsExternalUrl,
    ensureDesktopDeviceId,
    desktopAccessHeader: SPS_DESKTOP_ACCESS_HEADER,
    requireOwnerHostOrigin: requireSpsOwnerHostOrigin,
    requireHubOrigin: requireSpsHubOrigin,
    normalizeInviteToken: normalizeSpsInviteToken,
    getOwnerHostStatus: () => ownerHostStatus,
    getOwnerHostDesktopAccessToken: () => ownerHostDesktopAccessToken,
    stopNodeScheduling,
    resetNodeRuntimeStatus,
    clearPendingAuth: () => { pendingAuth = null; },
    clearActiveConnectionState,
    disconnectCurrentNode,
    rememberCurrentAccountConnection,
    restoreCurrentAccountConnection,
    adoptLegacyOwnerHostIfNeeded,
    acceptDesktopJoinLink,
    getPendingJoin: () => pendingJoin,
    maybeOpenWorkspaceForCurrentAccount,
    onLegacyOwnerHostAdoptionError: (error) => {
      ownerHostStatus = {
        ...ownerHostStatus,
        state: "stopped",
        lastError: error instanceof Error ? error.message : "Existing SPS Owner Host could not be adopted.",
      };
    },
    showMainWindow,
    openSetup,
    publicStatus,
    onStatusChanged: sendDesktopAccountStatus,
  });
}

async function connectNode() {
  if (isOwnerHostProfile()) {
    throw new Error("Owner Host mode is ready for local work. Enable remote Node grants after authenticated network setup is configured.");
  }
  if (!state.profile) throw new Error("Save an SPS team connection first");
  if (!state.profile.companyId) throw new Error("Choose an SPS company before registering this computer");
  const access = await requireSpsCoreRequestAccess(state.profile.hubUrl);
  const displayName = resolveSpsNodeDisplayName({
    configuredName: state.profile.displayName,
    hostname: os.hostname(),
  });
  if (state.profile.displayName !== displayName) {
    state.profile.displayName = displayName;
    await persistState();
  }
  const identity = await ensureIdentity();
  resetNodeRuntimeStatus();
  const capabilities = await scanLocalCapabilities();
  const runners = await scanLocalRunnerProfiles();
  const node = await registerSpsNode({
    hubUrl: state.profile.hubUrl,
    companyId: state.profile.companyId,
    identity,
    displayName,
    platform: process.platform,
    appVersion: app.getVersion(),
    capabilities,
    runners,
    transportPublicKey: identity.transportPublicKeyPem,
    ...access,
  });
  const verified = await sendSpsNodeHeartbeat({
    hubUrl: state.profile.hubUrl,
    nodeId: node.id,
    identity,
    ...access,
  });
  state.nodeId = node.id;
  state.transportKeyPublishedAt = new Date().toISOString();
  await applyNodeStatus(verified.status ?? node.status, { persist: false });
  nodeRuntimeStatus.lastHeartbeatAt = new Date().toISOString();
  await persistState();
  scheduleHeartbeat({ immediate: false });
  return { node, verified, capabilities, runners };
}

async function ensureJoinedDesktopNode() {
  // Team membership may request a Node registration, but it never authorizes
  // command execution. An Owner still approves the pending Node and grants it
  // to individual Agents before this computer can run any work.
  if (!shouldRefreshJoinedDesktopNode({
    profile: state.profile,
    signedIn: Boolean(currentDesktopAccount()),
    nodeId: state.nodeId,
    nodeStatus: state.nodeStatus,
    hasTransportIdentity: Boolean(
      state.identity?.transportPublicKeyPem
        && state.identity?.encryptedTransportPrivateKey,
    ),
    hasPublishedTransportKey: Boolean(state.transportKeyPublishedAt),
  })) {
    return null;
  }

  try {
    return await connectNode();
  } catch (error) {
    // A transient Hub or local CLI scan failure must not block a teammate from
    // opening the shared Workspace. Registration is retried on the next start.
    nodeRuntimeStatus.heartbeatError = error instanceof Error
      ? `This computer could not register its SPS Node: ${error.message}`
      : "This computer could not register its SPS Node.";
    return null;
  }
}

async function disconnectCurrentNode() {
  const nodeId = state.nodeId;
  const hubUrl = state.profile?.hubUrl;
  let remoteDisconnected = false;
  let remoteError = null;

  stopNodeScheduling();
  await cancelSpsNodeCommands("This SPS Desktop Node was disconnected, so its local command stopped.");
  if (nodeId && hubUrl) {
    try {
      const access = await requireSpsCoreRequestAccess(hubUrl);
      await disconnectSpsNode({ hubUrl, nodeId, ...access });
      remoteDisconnected = true;
    } catch (error) {
      remoteError = error instanceof Error ? error.message : "Could not disconnect this computer from the SPS team Host.";
    }
  } else if (nodeId) {
    remoteError = "This computer could not contact the SPS team Host to disconnect. An owner must revoke it from Company settings > Nodes.";
  }

  state.identity = null;
  state.nodeId = null;
  state.nodeStatus = null;
  resetNodeRuntimeStatus();
  closeWorkspaceWindow();
  await persistState();
  return { nodeId, remoteDisconnected, remoteError };
}

async function sendNodeHeartbeat() {
  try {
    if (!state.nodeId || !state.profile || !state.identity) return null;
    const access = await requireSpsCoreRequestAccess(state.profile.hubUrl);
    const node = await sendSpsNodeHeartbeat({
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      ...access,
    });
    nodeRuntimeStatus.lastHeartbeatAt = new Date().toISOString();
    nodeRuntimeStatus.heartbeatError = null;
    await applyNodeStatus(node.status);
    return node;
  } catch (error) {
    if (isSpsTechnicalMemberAccessRemoved(error)) {
      await clearRemovedMemberConnection();
      return null;
    }
    if (nodeWasRevoked(error)) {
      // Revocation retires this computer's old signing key. A later
      // connection creates a fresh pending Node for owner approval.
      stopNodeScheduling();
      await cancelSpsNodeCommands("An Owner revoked this SPS Desktop Node, so its local command stopped.");
      state.identity = null;
      state.nodeId = null;
      state.nodeStatus = "revoked";
      nodeRuntimeStatus.heartbeatError = "This computer's SPS Node approval was revoked by the Owner. Command execution has stopped.";
      nodeRuntimeStatus.commandPollError = "Reconnect this computer to create a new Node key, then ask an Owner to approve it.";
      await persistState();
      return null;
    }
    nodeRuntimeStatus.heartbeatError = "Could not contact the SPS team Host. Check the team address, network, and Desktop sign-in.";
    return null;
  }
}

function scheduleHeartbeat({ immediate = true } = {}) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => { void sendNodeHeartbeat(); }, 60_000);
  if (immediate) void sendNodeHeartbeat();
}

async function resolveDesktopMarketplaceMcpRuntime() {
  const bundledRuntimeRoot = app.isPackaged
    ? await materializeCurrentSpsOwnerHostRuntime()
    : path.join(__dirname, "..", ".owner-host-runtime");
  const bundledNodeCommand = spsOwnerHostBundledNodePath(bundledRuntimeRoot);
  const bundledEntryPath = path.join(
    bundledRuntimeRoot,
    "node_modules",
    "@sps",
    "mcp-server",
    "dist",
    "marketplace-assistant-stdio.js",
  );
  if (existsSync(bundledNodeCommand) && existsSync(bundledEntryPath)) {
    return { nodeCommand: bundledNodeCommand, entryPath: bundledEntryPath };
  }

  if (!app.isPackaged) {
    const developmentEntryPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "external",
      "sps-core",
      "packages",
      "mcp-server",
      "dist",
      "marketplace-assistant-stdio.js",
    );
    if (existsSync(developmentEntryPath)) {
      return { nodeCommand: process.execPath, entryPath: developmentEntryPath };
    }
  }

  return null;
}

async function pollNodeCommands() {
  if (commandPollInFlight || !canRunSpsNodeCommands(state.nodeStatus) || !state.nodeId || !state.profile || !state.identity) return;
  commandPollInFlight = true;
  let claimedCommand = false;
  try {
    const access = await requireSpsCoreRequestAccess(state.profile.hubUrl);
    const nextWork = await claimNextSpsNodeWork({
      claimAgentCommand: async () => await claimSpsNodeCommand({
        hubUrl: state.profile.hubUrl,
        nodeId: state.nodeId,
        identity: currentIdentity(),
        ...access,
      }),
      claimPluginRun: async () => await claimSpsPluginNodeRun({
        hubUrl: state.profile.hubUrl,
        nodeId: state.nodeId,
        identity: currentIdentity(),
        ...access,
      }),
    });
    nodeRuntimeStatus.lastCommandPollAt = new Date().toISOString();
    nodeRuntimeStatus.commandPollError = null;
    if (!nextWork) return;
    claimedCommand = true;
    await executeSpsNodeCommand({
      command: nextWork.command,
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      ...access,
      profile: state.profile,
      marketplaceMcpRuntime: spsNodeWorkRequiresMarketplaceMcp(nextWork)
        ? await resolveDesktopMarketplaceMcpRuntime()
        : null,
      ...executionTransportForSpsNodeWork(nextWork.kind, {
        appendCommandEvent: appendSpsPluginNodeRunEvent,
        checkCommandLease: checkSpsPluginNodeRunLease,
        completeCommand: completeSpsPluginNodeRun,
      }),
    });
  } catch (error) {
    if (isSpsTechnicalMemberAccessRemoved(error)) {
      await clearRemovedMemberConnection();
      return;
    }
    nodeRuntimeStatus.commandPollError = claimedCommand
      ? safeNodeCommandFailure(error)
      : "Could not poll the SPS team Host for commands. Check the team address, network, and Desktop sign-in.";
  } finally {
    commandPollInFlight = false;
  }
}

function scheduleCommandPolling() {
  if (!canRunSpsNodeCommands(state.nodeStatus)) return;
  if (commandPollTimer) clearInterval(commandPollTimer);
  commandPollTimer = setInterval(() => {
    void pollNodeCommands();
  }, 2_000);
  void pollNodeCommands();
}

function deliverPendingJoinToRenderer() {
  if (!pendingJoin || !mainWindow || !rendererReadyForJoinLinks || mainWindow.isDestroyed()) return false;
  const join = pendingJoin;
  const error = pendingJoinError;
  pendingJoin = null;
  pendingJoinError = null;
  mainWindow.webContents.send("desktop:join-link", error ? { ...join, error } : join);
  return true;
}

async function acceptDesktopJoinLink(join) {
  if (!currentDesktopAccount() || isOwnerHostProfile()) {
    return false;
  }
  try {
    const accepted = await acceptInviteCode({ code: join.code, hub: join.hub });
    if (accepted?.direct !== true) {
      recordDesktopJoinAttempt("failed", "SPS could not complete this invitation in Desktop.");
      await persistState();
      deliverPendingJoinToRenderer();
      return false;
    }
    pendingJoin = null;
    recordDesktopJoinAttempt("succeeded");
    await persistState();
    await maybeOpenWorkspaceForCurrentAccount();
    return true;
  } catch (error) {
    // Preserve the invitation for the setup screen when the direct request
    // cannot complete, such as when a user must finish sign-in first.
    pendingJoinError = error instanceof Error ? error.message : "SPS could not accept this invitation.";
    recordDesktopJoinAttempt("failed", pendingJoinError);
    await persistState();
    deliverPendingJoinToRenderer();
    return false;
  }
}

function sendJoinToRenderer(value) {
  const join = parseSpsJoinUri(value);
  if (!join) return false;
  pendingJoin = join;
  pendingJoinError = null;
  void acceptDesktopJoinLink(join);
  return true;
}

function registerIpc() {
  ensureCoreSettingsController().registerIpc(ipcMain);
  ipcMain.on("desktop:plugin-preview-fixture", (event) => {
    const ownsPreview = Boolean(
      pluginPreviewWindow
      && !pluginPreviewWindow.isDestroyed()
      && event.sender.id === pluginPreviewWindow.webContents.id
      && pluginPreviewRuntime?.fixture,
    );
    event.returnValue = ownsPreview
      ? JSON.parse(JSON.stringify(pluginPreviewRuntime.fixture))
      : null;
  });

  function assertLocalOwnerWorkspace(event, action) {
    if (
      !isOwnerHostProfile()
      || !workspaceWindow
      || workspaceWindow.isDestroyed()
      || event.sender.id !== workspaceWindow.webContents.id
    ) {
      throw new Error(`${action} is available only inside the local Owner Host Workspace.`);
    }
  }

  async function installAgentRuntimePackFromWorkspace(parentWindow) {
    assertRegistryOwner();
    const selection = await dialog.showOpenDialog(parentWindow ?? mainWindow ?? undefined, {
      title: "Install SPS Agent Runtime Pack",
      properties: ["openDirectory"],
    });
    if (selection.canceled || selection.filePaths.length !== 1) return publicStatus();
    await installSpsAgentRuntimePack({
      sourceRoot: selection.filePaths[0],
      root: ownerAgentRuntimePacksRoot(),
    });
    agentRuntimePacks = await listSpsAgentRuntimePacks({ root: ownerAgentRuntimePacksRoot() });
    return publicStatus();
  }

  async function workspaceServerSettings(event) {
    assertLocalOwnerWorkspace(event, "SPS Server settings");
    await refreshOwnerRuntimeStatus();
    await refreshOwnerHostCompanies();
    const status = publicStatus();
    return {
      desktopAccount: {
        signedIn: status.desktopAccount.signedIn,
        name: status.desktopAccount.name,
        email: status.desktopAccount.email,
      },
      ownerHost: {
        state: status.ownerHost.state,
        url: status.ownerHost.url,
        lastError: status.ownerHost.lastError,
      },
      teamAccess: status.teamAccess
        ? {
          enabled: status.teamAccess.enabled,
          url: status.teamAccess.url,
          companyId: status.teamAccess.companyId,
          configuredAt: status.teamAccess.configuredAt,
        }
        : null,
      ownerHostCompanies: status.ownerHostCompanies,
      agentRuntimePacks: status.agentRuntimePacks,
    };
  }

  ipcMain.handle("desktop:status", async () => {
    await refreshOwnerRuntimeStatus();
    return publicStatus();
  });
  ipcMain.handle("desktop:workspace-account", async (event) => {
    if (
      !isOwnerHostProfile()
      || !workspaceWindow
      || workspaceWindow.isDestroyed()
      || event.sender.id !== workspaceWindow.webContents.id
    ) {
      throw new Error("SPS Desktop account details are available only in the local Owner Host Workspace.");
    }
    const account = currentDesktopAccount();
    return account
      ? {
        signedIn: true,
        name: account.name ?? null,
        email: account.email ?? null,
        picture: account.picture ?? null,
      }
      : { signedIn: false, name: null, email: null, picture: null };
  });
  ipcMain.handle("desktop:workspace-sign-out", async (event) => {
    assertLocalOwnerWorkspace(event, "SPS Desktop sign-out");
    return await signOutDesktopAccount();
  });
  ipcMain.handle("desktop:workspace-server-settings", async (event) => await workspaceServerSettings(event));
  ipcMain.handle("desktop:workspace-enable-private-team-access", async (event, input) => {
    assertLocalOwnerWorkspace(event, "Private team access");
    const companyId = String(input?.companyId ?? "").trim();
    if (!companyId) throw new Error("Choose an SPS Workspace before enabling private team access.");
    const companies = await refreshOwnerHostCompanies();
    if (!companies.some((company) => company.id === companyId)) {
      throw new Error("The selected Workspace is not managed by this local SPS Host.");
    }
    await enablePrivateTeamAccess({ companyId });
    return await workspaceServerSettings(event);
  });
  ipcMain.handle("desktop:workspace-disable-private-team-access", async (event) => {
    assertLocalOwnerWorkspace(event, "Private team access");
    await disablePrivateTeamAccess();
    return await workspaceServerSettings(event);
  });
  ipcMain.handle("desktop:workspace-install-agent-runtime-pack", async (event) => {
    assertLocalOwnerWorkspace(event, "Agent runtime pack installation");
    await installAgentRuntimePackFromWorkspace(workspaceWindow);
    return await workspaceServerSettings(event);
  });
  ipcMain.handle("desktop:workspace-create-member-invite", async (event) => {
    assertLocalOwnerWorkspace(event, "Member invitations");
    return await createMemberInvite();
  });
  ipcMain.handle("desktop:workspace-list-member-invites", async (event) => {
    assertLocalOwnerWorkspace(event, "Member invitations");
    return await listMemberInvites();
  });
  ipcMain.handle("desktop:workspace-revoke-member-invite", async (event, input) => {
    assertLocalOwnerWorkspace(event, "Member invitations");
    return await revokeMemberInvite(input);
  });
  ipcMain.handle("desktop:workspace-open-plugin-registries", async (event) => {
    assertLocalOwnerWorkspace(event, "Plugin Registry management");
    // This bridge is opened from Settings > Plugins > Marketplace, so take
    // the Host directly to the bundled trusted source. The generic menu item
    // still opens the source manager without preselecting a Registry.
    await showRegistryWindow({ sourceId: SPS_OFFICIAL_REGISTRY_SOURCE.id });
    return { opened: true };
  });
  registerDesktopDeveloperContextIpc({
    ipcMain, assertLocalOwnerWorkspace, assertRegistryWindowEvent, assertRegistryOwner,
    getDesktopDeveloperContext, openDesktopDeveloperContext, getRegistryDeveloperContext,
    checkDesktopDeveloperAgentFolder,
    linkRegistryDeveloperContext, clearRegistryDeveloperContext,
  });
  registerDesktopAgentDirectoryIpc({
    ipcMain, assertLocalOwnerWorkspace,
    chooseDirectory: () => chooseLocalAgentWorkingDirectory({
      assertOwner: assertRegistryOwner, dialog, parentWindow: workspaceWindow,
    }),
  });
  ipcMain.handle("desktop:official-extensions-load-catalog", async (event) => {
    if (!officialExtensionsWindow || officialExtensionsWindow.isDestroyed() || event.sender.id !== officialExtensionsWindow.webContents.id) {
      throw new Error("Official Extensions catalog requests must come from the SPS Official Extensions window.");
    }
    return await loadSpsOfficialExtensionsCatalog();
  });
  ipcMain.handle("desktop:official-extensions-open-install-review", async (event) => {
    if (!officialExtensionsWindow || officialExtensionsWindow.isDestroyed() || event.sender.id !== officialExtensionsWindow.webContents.id) {
      throw new Error("Official Extensions install review requests must come from the SPS Official Extensions window.");
    }
    assertRegistryOwner();
    await showRegistryWindow({ sourceId: SPS_OFFICIAL_REGISTRY_SOURCE.id });
    return { opened: true };
  });
  registerDesktopRegistryIpc({
    ipcMain,
    assertRegistryWindowEvent,
    assertRegistryOwner,
    listRegistrySources,
    chooseDesktopLocalRegistryFolder,
    addDesktopRegistrySource,
    removeDesktopRegistrySource,
    inspectDesktopRegistrySource,
    stageDesktopRegistryRelease,
    enableDesktopRegistryStage,
    listDesktopRegistryStages,
    listDesktopDeveloperProjects,
    chooseDesktopDeveloperProjectFolder,
    connectDesktopDeveloperProject,
    inspectDesktopDeveloperProject,
    runDesktopDeveloperGates,
    applyDesktopDeveloperCandidate,
    rollbackDesktopDeveloperProject,
    reloadDesktopDeveloperUi,
    restartDesktopDeveloperWorker,
    revealDesktopDeveloperPackage,
    listDesktopPluginPreviewDiagnostics,
    clearDesktopPluginPreviewDiagnostics,
    publicDesktopPluginPreviewState,
    updateDesktopPluginPreviewEnvironment,
    removeDesktopDeveloperProject,
  });
  ipcMain.handle("desktop:start-sps-account", async () => await startDesktopAccountSignIn());
  ipcMain.handle("desktop:sign-out-sps-account", async () => await signOutDesktopAccount());
  ipcMain.handle("desktop:create-owner-server", async () => {
    const account = currentDesktopAccount();
    if (!account) throw new Error("Sign in to SPS before creating an SPS Server.");
    if (state.ownerHostOwnerSubject && state.ownerHostOwnerSubject !== account.subject) {
      throw new Error("This computer already hosts an SPS Server for a different SPS account. Sign in with that Owner account, or join its team with an invitation instead.");
    }
    if (state.profile && !isOwnerHostProfile()) {
      throw new Error("This computer is already joined to another SPS Server. Disconnect it before creating a new local Server.");
    }
    if (ownerCreationInProgress) throw new Error("SPS Server creation is already in progress.");
    ownerCreationInProgress = true;
    try {
      await startOwnerHost({ activate: true });
      await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
      return publicStatus();
    } finally {
      ownerCreationInProgress = false;
    }
  });
  ipcMain.handle("desktop:restore-owner-server", async () => await restoreOwnerServerFromTransfer());
  ipcMain.handle("desktop:join-server", async (_event, input) => {
    if (!currentDesktopAccount()) throw new Error("Sign in to SPS before joining an SPS Server.");
    return await acceptInviteCode(input);
  });
  ipcMain.handle("desktop:check-hub", async (_event, input) => {
    const hubUrl = requireSpsHubOrigin(input?.hubUrl);
    const health = await probeSpsHub({ hubUrl });
    return { hubUrl, health };
  });
  ipcMain.handle("desktop:use-owner-host", async () => {
    if (!currentAccountOwnsOwnerHost() && state.ownerHostOwnerSubject) {
      throw new Error("This SPS Owner Host belongs to a different SPS account. Join it with an invitation instead.");
    }
    if (isTeamAccessEnabled()) {
      throw new Error("This Owner Host is already a private team Host. Finish SPS sign-in for its private address, or return it to authenticated loopback mode first.");
    }
    const wasRemoteProfile = Boolean(state.profile && !isOwnerHostProfile());
    if (wasRemoteProfile) await disconnectCurrentNode();
    await startOwnerHost({ activate: true });
    await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
    return publicStatus();
  });
  ipcMain.handle("desktop:refresh-owner-host-companies", async () => {
    await refreshOwnerHostCompanies();
    return publicStatus();
  });
  ipcMain.handle("desktop:inspect-team-access", async () => {
    if (!isOwnerHostProfile()) throw new Error("Private team access is configured from the SPS Owner Host.");
    const tailnet = await inspectSpsTailscale();
    await refreshOwnerHostCompanies();
    return {
      tailnet,
      companies: [...ownerHostCompanies],
      identityIssuer: configuredDesktopIdentityUrl(),
      teamAccess: state.teamAccess ? { ...state.teamAccess } : null,
    };
  });
  ipcMain.handle("desktop:install-agent-runtime-pack", async () => {
    return await installAgentRuntimePackFromWorkspace(mainWindow);
  });
  ipcMain.handle("desktop:enable-private-team-access", async (_event, input) => await enablePrivateTeamAccess(input));
  ipcMain.handle("desktop:disable-private-team-access", disablePrivateTeamAccess);
  ipcMain.handle("desktop:check-updates", async () => {
    await desktopUpdateController.check();
    return publicStatus();
  });
  ipcMain.handle("desktop:download-update", async () => {
    await desktopUpdateController.download();
    return publicStatus();
  });
  ipcMain.handle("desktop:install-update", async () => {
    await desktopUpdateController.install();
    return publicStatus();
  });
  ipcMain.handle("desktop:ready-for-join-link", () => {
    rendererReadyForJoinLinks = true;
    if (!pendingJoin) return null;
    // Before SPS account sign-in, retain the full routed invitation in the
    // main process. It will resume automatically after identity succeeds.
    if (!currentDesktopAccount() || isOwnerHostProfile()) return null;
    const join = pendingJoin;
    if (pendingJoinError) {
      pendingJoin = null;
      const error = pendingJoinError;
      pendingJoinError = null;
      return error ? { ...join, error } : join;
    }
    return null;
  });
  ipcMain.handle("desktop:save-profile", async (_event, input) => await saveRemoteProfile(input));
  ipcMain.handle("desktop:open-invite", async (_event, input) => {
    if (!state.profile) throw new Error("Save an SPS team connection first");
    if (isOwnerHostProfile()) throw new Error("Create invitations after the Owner Host is configured for private or public team access.");
    const url = buildInviteUrl(state.profile.hubUrl, input.code);
    await openSpsExternalUrl(url);
    return url;
  });
  ipcMain.handle("desktop:accept-invite-code", async (_event, input) => await acceptInviteCode(input));
  ipcMain.handle("desktop:create-member-invite", async () => await createMemberInvite());
  ipcMain.handle("desktop:list-member-invites", async () => await listMemberInvites());
  ipcMain.handle("desktop:revoke-member-invite", async (_event, input) => await revokeMemberInvite(input));
  ipcMain.handle("desktop:copy-text", async (_event, input) => {
    const text = String(input?.text ?? "");
    if (!text || text.length > 2048) throw new Error("Nothing safe to copy.");
    clipboard.writeText(text);
    return true;
  });
  ipcMain.handle("desktop:export-owner-vault-transfer", exportOwnerVaultTransfer);
  ipcMain.handle("desktop:inspect-owner-vault-transfer", inspectOwnerVaultTransfer);
  ipcMain.handle("desktop:open-workspace", openWorkspace);
  ipcMain.handle("desktop:open-setup", openSetup);
  ipcMain.handle("desktop:save-default-workspace", async (_event, input) => {
    if (!isOwnerHostProfile()) throw new Error("Only the Owner Host can choose SPS project folders");
    if (!state.profile) throw new Error("Save an SPS team connection before choosing a local workspace folder");
    state.profile.defaultWorkspacePath = await requireSpsWorkspaceDirectory(input?.workspacePath) ?? "";
    await persistState();
    return publicStatus();
  });
  ipcMain.handle("desktop:save-project-workspace", async (_event, input) => {
    if (!isOwnerHostProfile()) throw new Error("Only the Owner Host can choose SPS project folders");
    if (!state.profile) throw new Error("Save an SPS team connection before mapping a project workspace");
    const projectId = normalizedProjectId(input?.projectId);
    const workspacePath = await requireSpsWorkspaceDirectory(input.workspacePath);
    const currentPath = state.profile.projectWorkspaces?.[projectId] ?? "";
    if (currentPath !== workspacePath) assertHostProjectSourceCanChange(projectId);
    const projectWorkspaces = { ...(state.profile.projectWorkspaces ?? {}) };
    if (workspacePath) projectWorkspaces[projectId] = workspacePath;
    else delete projectWorkspaces[projectId];
    state.profile.projectWorkspaces = projectWorkspaces;
    await persistState();
    return publicStatus();
  });
  ipcMain.handle("desktop:choose-project-workspace", async () => {
    if (!isOwnerHostProfile()) throw new Error("Only the Owner Host can choose SPS project folders");
    const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: "Choose local SPS project folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
  });
  ipcMain.handle("desktop:manage-host-project-source", async (_event, input) => {
    if (!isOwnerHostProfile()) throw new Error("Only the Owner Host can manage project source access");
    const projectId = String(input?.projectId ?? "").trim();
    if (!projectId) throw new Error("Project ID is required");
    return await showHostProjectSourceManager(projectId);
  });
  ipcMain.handle("desktop:workspace-host-project-sources", async (event) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Project source management is available only inside the local Owner Host workspace.");
    }
    return await listHostProjectSourcesForWorkspace();
  });
  ipcMain.handle("desktop:workspace-choose-host-project-source", async (event, input) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Project source management is available only inside the local Owner Host workspace.");
    }
    return await chooseHostProjectSourceForWorkspace(input?.projectId);
  });
  ipcMain.handle("desktop:workspace-clear-host-project-source", async (event, input) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Project source management is available only inside the local Owner Host workspace.");
    }
    return await clearHostProjectSourceForWorkspace(input?.projectId);
  });
  ipcMain.handle("desktop:workspace-manage-host-project-source", async (event, input) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Project source management is available only inside the local Owner Host workspace.");
    }
    return await showHostProjectSourceManager(normalizedProjectId(input?.projectId));
  });
  ipcMain.handle("desktop:workspace-host-workspace-sources", async (event) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Workspace source management is available only inside the local SPS Host workspace.");
    }
    return await listHostWorkspaceSources();
  });
  ipcMain.handle("desktop:workspace-choose-host-workspace-source", async (event) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Workspace source management is available only inside the local SPS Host workspace.");
    }
    return await chooseHostWorkspaceSource();
  });
  ipcMain.handle("desktop:workspace-rename-host-workspace-source", async (event, input) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Workspace source management is available only inside the local SPS Host workspace.");
    }
    return await renameHostWorkspaceSource(input?.sourceId, input?.name);
  });
  ipcMain.handle("desktop:workspace-remove-host-workspace-source", async (event, input) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Workspace source management is available only inside the local SPS Host workspace.");
    }
    return await removeHostWorkspaceSource(input?.sourceId);
  });
  ipcMain.handle("desktop:workspace-manage-host-workspace-source", async (event, input) => {
    if (!workspaceWindow || workspaceWindow.isDestroyed() || event.sender.id !== workspaceWindow.webContents.id) {
      throw new Error("Workspace source management is available only inside the local SPS Host workspace.");
    }
    const sourceId = String(input?.sourceId ?? "").trim();
    if (!sourceId) throw new Error("Workspace Source ID is required.");
    return await showHostWorkspaceSourceManager(sourceId);
  });
  ipcMain.handle("desktop:refresh-projects", async () => {
    await refreshProjects();
    return publicStatus();
  });
  ipcMain.handle("desktop:set-launch-at-login", (_event, input) => {
    const enabled = Boolean(input?.enabled);
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled,
      args: enabled ? [SPS_START_HIDDEN_ARGUMENT] : [],
    });
    launchAtLoginEnabled = enabled;
    return publicStatus();
  });
  ipcMain.handle("desktop:start-auth", async () => {
    if (!state.profile) throw new Error("Save an SPS team connection first");
    if (isOwnerHostProfile()) throw new Error("SPS sign-in is used for remote team access, not local Owner Host mode.");
    if (isSpsIdentityRemoteProfile()) {
      let companyAccess = "unavailable";
      try {
        await refreshSpsIdentityTeamContext();
        companyAccess = state.companies.length === 0
          ? "none"
          : state.profile.companyId
            ? "selected"
            : "choose";
      } catch {
        // The SPS Identity login remains valid while the Owner Host is temporarily unavailable.
      }
      await maybeOpenWorkspaceForCurrentAccount();
      return { ...publicStatus(), auth: { status: "approved", provider: "sps-identity", companyAccess } };
    }
    pendingAuth = await startSpsDesktopAuth({
      hubUrl: state.profile.hubUrl,
      companyId: state.profile.companyId,
    });
    if (pendingAuth.approvalUrl) await openSpsExternalUrl(pendingAuth.approvalUrl);
    return publicStatus();
  });
  ipcMain.handle("desktop:poll-auth", async () => {
    if (isSpsIdentityRemoteProfile() && state.profile) {
      let companyAccess = "unavailable";
      try {
        await refreshSpsIdentityTeamContext();
        companyAccess = state.companies.length === 0
          ? "none"
          : state.profile.companyId
            ? "selected"
            : "choose";
      } catch {
        // The SPS Identity login remains valid while the Owner Host is temporarily unavailable.
      }
      await maybeOpenWorkspaceForCurrentAccount();
      return { ...publicStatus(), auth: { status: "approved", provider: "sps-identity", companyAccess } };
    }
    if (!state.profile || !pendingAuth) throw new Error("No SPS Desktop sign-in is waiting for approval");
    const result = await pollSpsDesktopAuth({
      hubUrl: state.profile.hubUrl,
      challengeId: pendingAuth.id,
      challengeToken: pendingAuth.token,
    });
    let companyAccess = "pending";
    if (result.status === "approved") {
      state.encryptedBoardApiToken = encrypt(pendingAuth.boardApiToken);
      pendingAuth = null;
      await persistState();
      try {
        const account = await getSpsDesktopAccount({
          hubUrl: state.profile.hubUrl,
          accessToken: currentBoardToken(),
        });
        const displayName = resolveSpsNodeDisplayName({
          configuredName: state.profile.displayName,
          accountName: account?.name,
          hostname: os.hostname(),
        });
        if (state.profile.displayName !== displayName) {
          state.profile.displayName = displayName;
          await persistState();
        }
      } catch {
        // Google approval remains valid if the optional account profile request
        // is temporarily unavailable. Registration still receives a safe local fallback.
      }
      try {
        const companies = await listSpsCompanies({
          hubUrl: state.profile.hubUrl,
          accessToken: currentBoardToken(),
        });
        state.companies = Array.isArray(companies)
          ? companies
            .filter((company) => company && typeof company.id === "string" && typeof company.name === "string")
            .map((company) => ({ id: company.id, name: company.name }))
          : [];
        if (!state.profile.companyId && state.companies.length === 1) {
          state.profile.companyId = state.companies[0].id;
        }
        companyAccess = state.companies.length === 0
          ? "none"
          : state.profile.companyId
            ? "selected"
            : "choose";
        await persistState();
        if (state.profile.companyId) {
          try {
            await refreshProjects();
          } catch {
            // A successful sign-in is retained even if the project list is briefly unavailable.
          }
        }
      } catch {
        // Google approval completed. The user can retry after a transient Hub failure.
        companyAccess = "unavailable";
      }
      await maybeOpenWorkspaceForCurrentAccount();
    }
    return { ...publicStatus(), auth: { ...result, companyAccess } };
  });
  ipcMain.handle("desktop:scan-capabilities", async () => await scanLocalCapabilities());
  ipcMain.handle("desktop:connect-node", connectNode);
  ipcMain.handle("desktop:disconnect-node", async () => {
    const nodeDisconnect = await disconnectCurrentNode();
    return { ...publicStatus(), nodeDisconnect };
  });
  ipcMain.handle("desktop:sign-out", async () => await signOutDesktopAccount());
}

async function createWindow({ show = true } = {}) {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    show,
    icon: path.join(__dirname, "..", "assets", "sps-logo.png"),
    webPreferences: createSpsSetupWindowPreferences(path.join(__dirname, "preload.cjs")),
  });
  mainWindow.webContents.on("did-start-loading", () => {
    rendererReadyForJoinLinks = false;
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:")) return;
    event.preventDefault();
    void openSpsExternalUrl(url).catch(() => {});
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openSpsExternalUrl(url).catch(() => {});
    return { action: "deny" };
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

// Production SPS Desktop stays single-instance. Isolated Electron E2E runs
// opt out so they never redirect to, or mutate, a person's live Desktop.
const allowsIsolatedE2eInstance = process.env.SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE === "1";

if (!allowsIsolatedE2eInstance && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const joinArg = findSpsJoinUriArg(argv);
    if (joinArg) sendJoinToRenderer(joinArg);
    if (argv.includes("--sps-core-settings")) void app.whenReady().then(showCoreSettings);
    else void showMainWindow();
  });
  app.whenReady().then(async () => {
    state = await loadState(app.getPath("userData"));
    initializeDesktopAccountController();
    restoreCurrentAccountConnection();
    await persistState();
    registerIpc();
    configureWorkspaceRequestAuth();
    createApplicationMenu();
    if (!developmentMode) app.setAsDefaultProtocolClient("sps");
    await createWindow({ show: !startedHidden && !opensCoreSettingsOnLaunch });
    if (developmentMode) {
      const stopWatching = watchDevelopmentSurfaces({
        desktopRoot: path.resolve(__dirname, ".."),
        windows: () => BrowserWindow.getAllWindows().filter(window =>
          window.webContents.getURL().startsWith("file:") || window === workspaceWindow),
      });
      app.once("will-quit", stopWatching);
    }
    createTray();
    ensureCoreSettingsController().registerShortcut();
    app.once("will-quit", () => coreSettingsController?.dispose());
    if (opensCoreSettingsOnLaunch) await showCoreSettings();
    // Read Windows startup registration once after the first window is ready.
    // It must not run on the frequent status IPC path.
    setTimeout(refreshLaunchAtLoginStatus, 0);
    void bootstrapOwnerHost().finally(() => {
      // A returning Member already has a signed-in account and an accepted
      // team connection. Reopen its Workspace on launch so the Node refreshes
      // its heartbeat and any newly introduced local identity material (such
      // as the project-source transport key) without a second user click.
      // Owner Host startup keeps its existing, separately guarded path.
      if (isOwnerHostProfile()) return;
      void maybeOpenWorkspaceForCurrentAccount().catch((error) => {
        desktopAccountController.setError(error);
        sendDesktopAccountStatus();
      });
    });
    const initialJoinArg = findSpsJoinUriArg(process.argv);
    if (initialJoinArg) sendJoinToRenderer(initialJoinArg);
    scheduleHeartbeat();
    await initializeUpdates();
  });
}

app.on("open-url", (event, value) => {
  event.preventDefault();
  sendJoinToRenderer(value);
});
app.on("window-all-closed", () => {
  // Windows close hides to the tray so the assigned SPS Node keeps working.
});
app.on("activate", () => {
  void showMainWindow();
});
async function stopDesktopRuntimeGracefully() {
  isQuitting = true;
  stopNodeScheduling();
  await cancelSpsNodeCommands("SPS Desktop is closing, so its local command stopped.");
  desktopUpdateController.stop();
  // A forced process-tree kill interrupts embedded PostgreSQL and turns every
  // normal Desktop exit into database crash recovery on the next start. Each
  // manager already escalates after its bounded graceful wait when necessary.
  await Promise.allSettled([
    defaultMemoryManager?.stop({ force: false }),
    ownerHostManager?.stop({ force: false }),
    pluginPreviewRuntime?.manager?.stop({ force: false }),
  ]);
  pluginPreviewRuntime = null;
}

app.on("before-quit", (event) => {
  if (shutdownComplete) return;
  event.preventDefault();
  isQuitting = true;
  if (!shutdownPromise) {
    shutdownPromise = stopDesktopRuntimeGracefully()
      .catch(() => undefined)
      .finally(() => {
        shutdownComplete = true;
        app.quit();
      });
  }
});

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, session, shell, Tray } from "electron";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cancelSpsNodeCommands,
  createNodeIdentity,
  claimSpsNodeCommand,
  disconnectSpsNode,
  executeSpsNodeCommand,
  listSpsCompanies,
  listSpsProjects,
  pollSpsDesktopAuth,
  probeSpsHub,
  registerSpsNode,
  scanLocalCapabilities,
  sendSpsNodeHeartbeat,
  SpsHubRequestError,
  startSpsDesktopAuth,
} from "@sps/desktop-node";
import { buildInviteUrl, findSpsJoinUriArg, parseSpsJoinUri, spsInviteTokenToCode } from "./invite.mjs";
import { emptyState, loadState, saveState } from "./state.mjs";
import { canRunSpsNodeCommands, normalizeSpsNodeStatus } from "./node-activation.mjs";
import { createSpsUpdateService } from "./update-service.mjs";
import { createSpsOwnerHostManager, materializeSpsOwnerHostRuntime, resolveSpsOwnerHostRuntime } from "./owner-host.mjs";
import {
  configureSpsOwnerHostLocalOnly,
  configureSpsOwnerHostPrivateTeamAccess,
  ensureSpsOwnerHostConfig,
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
  disableSpsTailscaleServe,
  enableSpsTailscaleServe,
  inspectSpsTailscale,
  spsTailnetPublicUrl,
} from "./team-access.mjs";
import {
  createSpsSetupWindowPreferences,
  createSpsWorkspaceWindowPreferences,
  isAllowedSpsWorkspaceNavigation,
} from "./window-security.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPS_START_HIDDEN_ARGUMENT = "--sps-start-hidden";
let mainWindow = null;
let workspaceWindow = null;
let state = emptyState();
let pendingAuth = null;
let heartbeatTimer = null;
let commandPollTimer = null;
let commandPollInFlight = false;
let pendingJoin = null;
let rendererReadyForJoinLinks = false;
let workspaceOrigin = null;
let nodeRuntimeStatus = emptyNodeRuntimeStatus();
let tray = null;
let isQuitting = false;
const startedHidden = process.argv.includes(SPS_START_HIDDEN_ARGUMENT);
let updateService = null;
let updateStatus = {
  state: "initializing",
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: null,
  message: "Desktop update service is starting.",
};
let ownerHostManager = null;
let defaultMemoryManager = null;
let defaultMemoryStatus = {
  state: "initializing",
  url: null,
  startedAt: null,
  lastError: null,
  vaultPath: null,
};
let ownerHostStatus = {
  state: "initializing",
  url: null,
  startedAt: null,
  lastError: null,
  vaultPath: null,
};
let ownerHostCompanies = [];

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

async function initializeUpdates() {
  if (!app.isPackaged) {
    updateStatus = {
      state: "disabled",
      currentVersion: app.getVersion(),
      availableVersion: null,
      percent: null,
      message: "Desktop updates are available only in an installed SPS release.",
    };
    return;
  }
  try {
    const { autoUpdater } = await import("electron-updater");
    updateService = createSpsUpdateService({
      app,
      updater: autoUpdater,
      onStatus: (nextStatus) => { updateStatus = nextStatus; },
    });
    updateStatus = updateService.getStatus();
    updateService.start();
  } catch {
    updateStatus = {
      state: "unavailable",
      currentVersion: app.getVersion(),
      availableVersion: null,
      percent: null,
      message: "Desktop update service is unavailable. Your current installation remains unchanged.",
    };
  }
}

function requireUpdateService() {
  if (!updateService) {
    throw new Error("Desktop updates are unavailable in this SPS installation.");
  }
  return updateService;
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

async function persistState() {
  await saveState(app.getPath("userData"), state);
}

function currentIdentity() {
  if (!state.identity?.publicKeyPem || !state.identity?.encryptedPrivateKey) return null;
  return {
    algorithm: "ed25519",
    publicKeyPem: state.identity.publicKeyPem,
    privateKeyPem: decrypt(state.identity.encryptedPrivateKey),
  };
}

async function ensureIdentity() {
  const identity = currentIdentity();
  if (identity) return identity;
  const created = createNodeIdentity();
  state.identity = {
    publicKeyPem: created.publicKeyPem,
    encryptedPrivateKey: encrypt(created.privateKeyPem),
  };
  await persistState();
  return created;
}

function currentBoardToken() {
  return state.encryptedBoardApiToken ? decrypt(state.encryptedBoardApiToken) : null;
}

function currentTeamCredentials() {
  if (!state.encryptedTeamCredentials) return null;
  try {
    const parsed = JSON.parse(decrypt(state.encryptedTeamCredentials));
    if (
      typeof parsed?.authSecret !== "string"
      || typeof parsed?.googleClientId !== "string"
      || typeof parsed?.googleClientSecret !== "string"
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function ownerVaultRoot() {
  return path.join(app.getPath("userData"), "owner-vault");
}

function ownerHostTeamEnvironment() {
  if (!state.teamAccess?.enabled) return {};
  const credentials = currentTeamCredentials();
  if (!credentials) {
    throw new Error("Private team access credentials are unavailable in Windows secure storage.");
  }
  return {
    SPS_AUTH_SECRET: credentials.authSecret,
    // The Core's signed Agent-run protocol has a separate secret input from
    // browser authentication. Keep both in the same encrypted Owner Vault
    // record so a private-team switch cannot leave Task execution unsigned.
    PAPERCLIP_AGENT_JWT_SECRET: credentials.authSecret,
    SPS_GOOGLE_CLIENT_ID: credentials.googleClientId,
    SPS_GOOGLE_CLIENT_SECRET: credentials.googleClientSecret,
    SPS_AUTH_GOOGLE_ONLY: "true",
    // The request reaches Core from the local Tailscale Serve proxy. Core may
    // therefore trust only loopback forwarding headers, never arbitrary LAN.
    TRUST_PROXY: "loopback",
  };
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

async function ensureOwnerHostManager() {
  const vaultRoot = ownerVaultRoot();
  const ownerHost = await ensureSpsOwnerHostConfig({ vaultRoot });
  const defaultMemory = await ensureSpsDefaultMemoryConfig({ ownerVaultRoot: vaultRoot });
  const url = spsOwnerHostUrl(ownerHost.config);
  if (ownerHostManager && defaultMemoryManager && ownerHostStatus.url === url) {
    return { ...ownerHost, defaultMemory, url };
  }

  const sourceRuntimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "sps-owner-host-runtime")
    : path.join(__dirname, "..", ".owner-host-runtime");
  const targetRuntimeRoot = path.join(app.getPath("userData"), "owner-host-runtime", app.getVersion());
  const developmentCoreRoot = path.resolve(__dirname, "..", "..", "..", "external", "sps-core");
  const developmentMemorySidecarEntry = path.resolve(__dirname, "..", "..", "memory-sidecar", "memory-sidecar.mjs");
  const developmentMemoryPluginPath = path.resolve(__dirname, "..", "..", "sps-default-memory");
  defaultMemoryManager = createSpsDefaultMemoryManager({
    url: spsDefaultMemoryUrl(defaultMemory.config),
    token: defaultMemory.config.security.token,
    configPath: defaultMemory.layout.configPath,
    nodeCommand: process.execPath,
    resolveEntry: async () => {
      const materializedRuntime = await materializeSpsOwnerHostRuntime({
        sourceRuntimeRoot,
        targetRuntimeRoot,
      });
      const packagedEntry = materializedRuntime
        ? path.join(materializedRuntime, "memory-sidecar", "memory-sidecar.mjs")
        : null;
      return packagedEntry && existsSync(packagedEntry) ? packagedEntry : developmentMemorySidecarEntry;
    },
  });
  ownerHostManager = createSpsOwnerHostManager({
    url,
    resolveRuntime: async () => {
      const materializedRuntime = await materializeSpsOwnerHostRuntime({
        sourceRuntimeRoot,
        targetRuntimeRoot,
      });
      const packagedMemoryPluginPath = materializedRuntime
        ? path.join(materializedRuntime, "sps-default-memory")
        : null;
      const memoryPluginPath = packagedMemoryPluginPath && existsSync(path.join(packagedMemoryPluginPath, "package.json"))
        ? packagedMemoryPluginPath
        : developmentMemoryPluginPath;
      return resolveSpsOwnerHostRuntime({
        packagedRuntimeRoots: materializedRuntime ? [materializedRuntime] : [],
        coreRoots: app.isPackaged ? [] : [developmentCoreRoot],
        packagedNodeCommand: process.execPath,
        configPath: ownerHost.layout.configPath,
        environment: {
          PAPERCLIP_HOME: ownerHost.layout.root,
          PAPERCLIP_DB_BACKUP_DIR: ownerHost.layout.backupDir,
          PAPERCLIP_STORAGE_LOCAL_DIR: ownerHost.layout.storageDir,
          PAPERCLIP_SECRETS_MASTER_KEY_FILE: ownerHost.layout.secretsPath,
          PAPERCLIP_PROJECTS_ROOT: ownerHost.layout.projectsDir,
          SPS_BUNDLED_PLUGIN_PATHS: memoryPluginPath,
          SPS_MEMORY_SIDECAR_URL: spsDefaultMemoryUrl(defaultMemory.config),
          SPS_MEMORY_SIDECAR_TOKEN: defaultMemory.config.security.token,
          ...ownerHostTeamEnvironment(),
        },
      });
    },
  });
  return { ...ownerHost, defaultMemory, url };
}

async function activateOwnerHostProfile() {
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
    displayName: `${os.hostname()} Owner Host`,
    defaultWorkspacePath: "",
    projectWorkspaces: {},
  };
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
  const status = await ownerHostManager.start();
  ownerHostStatus = {
    ...status,
    vaultPath: ownerHost.layout.root,
  };
  if (activate && ownerHostIsReady()) await activateOwnerHostProfile();
  return ownerHostStatus;
}

async function bootstrapOwnerHost() {
  try {
    await startOwnerHost({ activate: !state.profile });
    if (isOwnerHostProfile()) {
      await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
    }
  } catch (error) {
    ownerHostStatus = {
      ...ownerHostStatus,
      state: "stopped",
      lastError: error instanceof Error ? error.message : "SPS Owner Host could not start.",
    };
  }
}

async function ownerHostApi(pathname, { method = "GET", body } = {}) {
  if (!ownerHostIsReady() || !ownerHostStatus.url) {
    throw new Error(ownerHostStatus.lastError || "SPS Owner Host is not ready.");
  }
  const response = await fetch(`${requireSpsOwnerHostOrigin(ownerHostStatus.url)}/api${pathname}`, {
    method,
    headers: body === undefined ? { accept: "application/json" } : {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  if (!ownerHostIsReady()) throw new Error("Wait for the SPS Owner Host to finish starting.");

  const googleClientId = String(input?.googleClientId ?? "").trim();
  const googleClientSecret = String(input?.googleClientSecret ?? "").trim();
  if (!googleClientId || !googleClientSecret) {
    throw new Error("Google OAuth client ID and client secret are required for private team access.");
  }
  const companyId = String(input?.companyId ?? "").trim();
  if (!companyId) throw new Error("Choose the company whose Owner invitation will initialize this private team Host.");

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
  const invitation = await ownerHostApi(`/companies/${encodeURIComponent(companyId)}/invites`, {
    method: "POST",
    body: {
      allowedJoinTypes: "human",
      humanRole: "owner",
      expiresInMinutes: 60,
      agentMessage: "Initial Owner access for this SPS private team Host.",
    },
  });
  if (typeof invitation?.token !== "string") {
    throw new Error("SPS Owner Host did not return an Owner invitation.");
  }

  const credentials = {
    authSecret: randomBytes(48).toString("base64url"),
    googleClientId,
    googleClientSecret,
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
  // Persist credentials before the Core changes mode. If Windows restarts in
  // the middle of the hand-off, the Owner Host can still start securely and
  // the owner can explicitly return to local-only mode instead of losing the
  // credentials required to recover it.
  await persistState();
  try {
    await updateSpsOwnerHostConfig({
      vaultRoot: ownerVaultRoot(),
      update: (config) => configureSpsOwnerHostPrivateTeamAccess(config, { hostname: tailnet.hostname }),
    });
    await restartOwnerHostForConfiguration();
    const tailscale = await enableSpsTailscaleServe({ ownerHostUrl: ownerHostStatus.url });
    if (!tailscale.serve || !tailscale.tailnet) {
      throw new Error("Tailscale Serve did not confirm the SPS private team route.");
    }
  } catch (error) {
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
  state.profile = {
    hubUrl: nextTeamAccess.url,
    connectionKind: "remote",
    companyId,
    displayName: `${os.hostname()} Owner Host`,
    defaultWorkspacePath: "",
    projectWorkspaces: {},
  };
  state.teamAccess = { ...nextTeamAccess, phase: "active" };
  await persistState();
  const inviteUrl = buildInviteUrl(nextTeamAccess.url, invitation.token);
  await shell.openExternal(inviteUrl);
  return {
    teamAccess: { ...nextTeamAccess },
    invitation: {
      token: invitation.token,
      code: spsInviteTokenToCode(invitation.token),
      url: inviteUrl,
      expiresAt: invitation.expiresAt ?? null,
    },
    googleRedirectUrl: `${nextTeamAccess.url}/api/auth/callback/google`,
  };
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
    update: (config) => configureSpsOwnerHostLocalOnly(config),
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
    state.projects = [];
    await persistState();
    return state.projects;
  }
  const companyId = state.profile?.companyId;
  const accessToken = currentBoardToken();
  if (!state.profile || !companyId || !accessToken) {
    state.projects = [];
    await persistState();
    return state.projects;
  }
  const projects = await listSpsProjects({
    hubUrl: state.profile.hubUrl,
    companyId,
    accessToken,
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
  rendererReadyForJoinLinks = false;
  await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function closeWorkspaceWindow() {
  const current = workspaceWindow;
  workspaceWindow = null;
  workspaceOrigin = null;
  if (current && !current.isDestroyed()) current.close();
}

function configureWorkspaceNavigation(window, hubOrigin) {
  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedSpsWorkspaceNavigation(url, hubOrigin)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
}

async function openWorkspace() {
  if (!state.profile) throw new Error("Save an SPS Hub profile first");
  if (!isOwnerHostProfile() && !currentBoardToken()) {
    throw new Error("Continue with Google before opening the SPS workspace");
  }
  const hubOrigin = workspaceHubUrl();
  if (!hubOrigin) throw new Error("Save an SPS Hub profile first");
  if (workspaceWindow && !workspaceWindow.isDestroyed() && workspaceOrigin === hubOrigin) {
    if (workspaceWindow.isMinimized()) workspaceWindow.restore();
    workspaceWindow.show();
    workspaceWindow.focus();
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
    webPreferences: createSpsWorkspaceWindowPreferences(),
  });
  workspaceWindow = currentWindow;
  configureWorkspaceNavigation(currentWindow, hubOrigin);
  currentWindow.once("ready-to-show", () => currentWindow.show());
  currentWindow.on("closed", () => {
    if (workspaceWindow !== currentWindow) return;
    workspaceWindow = null;
    workspaceOrigin = null;
  });
  await currentWindow.loadURL(`${hubOrigin}/`);
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

function configureWorkspaceRequestAuth() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
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
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "SPS Desktop",
      submenu: [
        { label: "Open SPS workspace", click: () => run(showWorkspace) },
        { label: "Connection setup", click: () => run(async () => { await showMainWindow(); await openSetup(); }) },
        { type: "separator" },
        { label: "Sign out on this computer", click: () => run(async () => {
          await disconnectCurrentNode();
          pendingAuth = null;
          state.encryptedBoardApiToken = null;
          state.companies = [];
          state.projects = [];
          await persistState();
          await openSetup();
        }) },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ]));
}

function createTray() {
  if (tray) return;
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "sps-logo.png"));
  tray = new Tray(icon);
  tray.setToolTip("SPS Desktop Node");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open SPS Desktop", click: () => { void showMainWindow(); } },
    { label: "Open SPS workspace", click: () => { void showWorkspace(); } },
    { label: "Connection setup", click: () => { void showMainWindow().then(openSetup); } },
    { type: "separator" },
    { label: "Quit SPS Desktop", click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on("double-click", () => { void showMainWindow(); });
}

function publicStatus() {
  const loginItemSettings = app.getLoginItemSettings();
  return {
    profile: state.profile,
    hasIdentity: Boolean(state.identity),
    signedIn: Boolean(state.encryptedBoardApiToken),
    nodeId: state.nodeId,
    nodeStatus: normalizeSpsNodeStatus(state.nodeStatus),
    companies: Array.isArray(state.companies) ? state.companies : [],
    projects: Array.isArray(state.projects) ? state.projects : [],
    pendingAuth: pendingAuth
      ? { approvalUrl: pendingAuth.approvalUrl, expiresAt: pendingAuth.expiresAt }
      : null,
    commandRunner: {
      active: Boolean(commandPollTimer) && canRunSpsNodeCommands(state.nodeStatus),
      workspaceConfigured: Boolean(state.profile?.defaultWorkspacePath),
      launchAtLogin: Boolean(loginItemSettings.openAtLogin),
    },
    nodeConnection: state.nodeId ? { ...nodeRuntimeStatus } : null,
    ownerHost: { ...ownerHostStatus, defaultMemory: { ...defaultMemoryStatus } },
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
    ownerHostCompanies: isOwnerHostProfile() ? [...ownerHostCompanies] : [],
    update: { ...updateStatus },
  };
}

async function connectNode() {
  if (isOwnerHostProfile()) {
    throw new Error("Owner Host mode is ready for local work. Enable remote Node grants after authenticated network setup is configured.");
  }
  if (!state.profile) throw new Error("Save an SPS Hub profile first");
  if (!state.profile.companyId) throw new Error("Choose an SPS company before registering this computer");
  const accessToken = currentBoardToken();
  if (!accessToken) throw new Error("Sign in to SPS Desktop before registering this computer");
  const identity = await ensureIdentity();
  resetNodeRuntimeStatus();
  const capabilities = await scanLocalCapabilities();
  const node = await registerSpsNode({
    hubUrl: state.profile.hubUrl,
    companyId: state.profile.companyId,
    identity,
    displayName: state.profile.displayName,
    platform: process.platform,
    appVersion: app.getVersion(),
    capabilities,
    accessToken,
  });
  const verified = await sendSpsNodeHeartbeat({
    hubUrl: state.profile.hubUrl,
    nodeId: node.id,
    identity,
    accessToken,
  });
  state.nodeId = node.id;
  await applyNodeStatus(verified.status ?? node.status, { persist: false });
  nodeRuntimeStatus.lastHeartbeatAt = new Date().toISOString();
  await persistState();
  scheduleHeartbeat({ immediate: false });
  return { node, verified, capabilities };
}

async function disconnectCurrentNode() {
  const nodeId = state.nodeId;
  const hubUrl = state.profile?.hubUrl;
  const accessToken = currentBoardToken();
  let remoteDisconnected = false;
  let remoteError = null;

  stopNodeScheduling();
  await cancelSpsNodeCommands("This SPS Desktop Node was disconnected, so its local command stopped.");
  if (nodeId && hubUrl && accessToken) {
    try {
      await disconnectSpsNode({ hubUrl, nodeId, accessToken });
      remoteDisconnected = true;
    } catch (error) {
      remoteError = error instanceof Error ? error.message : "Could not disconnect this computer from the SPS Hub.";
    }
  } else if (nodeId) {
    remoteError = "This computer could not contact the SPS Hub to disconnect. An owner must revoke it from SPS Hub > Settings > Nodes.";
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
    const node = await sendSpsNodeHeartbeat({
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      accessToken: currentBoardToken() ?? undefined,
    });
    nodeRuntimeStatus.lastHeartbeatAt = new Date().toISOString();
    nodeRuntimeStatus.heartbeatError = null;
    await applyNodeStatus(node.status);
    return node;
  } catch (error) {
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
    nodeRuntimeStatus.heartbeatError = "Could not contact the Hub. Check the SPS Hub address, network, and Desktop sign-in.";
    return null;
  }
}

function scheduleHeartbeat({ immediate = true } = {}) {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => { void sendNodeHeartbeat(); }, 60_000);
  if (immediate) void sendNodeHeartbeat();
}

async function pollNodeCommands() {
  if (commandPollInFlight || !canRunSpsNodeCommands(state.nodeStatus) || !state.nodeId || !state.profile || !state.identity) return;
  const accessToken = currentBoardToken();
  if (!accessToken) return;
  commandPollInFlight = true;
  let claimedCommand = false;
  try {
    const command = await claimSpsNodeCommand({
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      accessToken,
    });
    nodeRuntimeStatus.lastCommandPollAt = new Date().toISOString();
    nodeRuntimeStatus.commandPollError = null;
    if (!command) return;
    claimedCommand = true;
    await executeSpsNodeCommand({
      command,
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      accessToken,
      profile: state.profile,
    });
  } catch {
    nodeRuntimeStatus.commandPollError = claimedCommand
      ? "The latest local command could not complete. Check its Task run for details."
      : "Could not poll the Hub for commands. Check the SPS Hub address, network, and Desktop sign-in.";
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

function sendJoinToRenderer(value) {
  const join = parseSpsJoinUri(value);
  if (!join) return false;
  pendingJoin = join;
  if (mainWindow && rendererReadyForJoinLinks && !mainWindow.isDestroyed()) {
    pendingJoin = null;
    mainWindow.webContents.send("desktop:join-link", join);
  }
  return true;
}

function registerIpc() {
  ipcMain.handle("desktop:status", () => publicStatus());
  ipcMain.handle("desktop:check-hub", async (_event, input) => {
    const hubUrl = requireSpsHubOrigin(input?.hubUrl);
    const health = await probeSpsHub({ hubUrl });
    return { hubUrl, health };
  });
  ipcMain.handle("desktop:use-owner-host", async () => {
    if (isTeamAccessEnabled()) {
      throw new Error("This Owner Host is already a private team Host. Finish Google sign-in for its private SPS address, or return it to local-only mode first.");
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
      googleRedirectUrl: `${tailnet.url}/api/auth/callback/google`,
      teamAccess: state.teamAccess ? { ...state.teamAccess } : null,
    };
  });
  ipcMain.handle("desktop:enable-private-team-access", async (_event, input) => await enablePrivateTeamAccess(input));
  ipcMain.handle("desktop:disable-private-team-access", disablePrivateTeamAccess);
  ipcMain.handle("desktop:check-updates", async () => {
    updateStatus = await requireUpdateService().check();
    return publicStatus();
  });
  ipcMain.handle("desktop:download-update", async () => {
    updateStatus = await requireUpdateService().download();
    return publicStatus();
  });
  ipcMain.handle("desktop:install-update", () => {
    updateStatus = requireUpdateService().install();
    return publicStatus();
  });
  ipcMain.handle("desktop:ready-for-join-link", () => {
    rendererReadyForJoinLinks = true;
    const join = pendingJoin;
    pendingJoin = null;
    return join;
  });
  ipcMain.handle("desktop:save-profile", async (_event, input) => {
    const companyId = String(input.companyId ?? "").trim();
    const displayName = String(input.displayName ?? "").trim();
    if (!displayName) throw new Error("Computer name is required");
    const hubUrl = requireSpsHubOrigin(input.hubUrl);
    const previousProfile = state.profile;
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
      companyId,
      displayName: displayName.slice(0, 120),
      defaultWorkspacePath: String(input.defaultWorkspacePath ?? "").trim(),
      projectWorkspaces: connectionScopeChanged ? {} : state.profile?.projectWorkspaces ?? {},
    };
    await persistState();
    if (companyId && currentBoardToken()) {
      try {
        await refreshProjects();
      } catch {
        // The profile remains usable while a transient Hub error is retried from setup.
      }
    }
    return publicStatus();
  });
  ipcMain.handle("desktop:open-invite", async (_event, input) => {
    if (!state.profile) throw new Error("Save an SPS Hub profile first");
    if (isOwnerHostProfile()) throw new Error("Create invitations after the Owner Host is configured for private or public team access.");
    const url = buildInviteUrl(state.profile.hubUrl, input.code);
    await shell.openExternal(url);
    return url;
  });
  ipcMain.handle("desktop:open-workspace", openWorkspace);
  ipcMain.handle("desktop:open-setup", openSetup);
  ipcMain.handle("desktop:save-project-workspace", async (_event, input) => {
    if (!state.profile) throw new Error("Save an SPS Hub profile before mapping a project workspace");
    const projectId = String(input.projectId ?? "").trim();
    const workspacePath = await requireSpsWorkspaceDirectory(input.workspacePath);
    if (!projectId) throw new Error("Project ID is required");
    const projectWorkspaces = { ...(state.profile.projectWorkspaces ?? {}) };
    if (workspacePath) projectWorkspaces[projectId] = workspacePath;
    else delete projectWorkspaces[projectId];
    state.profile.projectWorkspaces = projectWorkspaces;
    await persistState();
    return publicStatus();
  });
  ipcMain.handle("desktop:choose-project-workspace", async () => {
    const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
      title: "Choose local SPS project folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return selection.canceled ? null : selection.filePaths[0] ?? null;
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
    return publicStatus();
  });
  ipcMain.handle("desktop:start-auth", async () => {
    if (!state.profile) throw new Error("Save an SPS Hub profile first");
    if (isOwnerHostProfile()) throw new Error("Google sign-in is used for remote team access, not local Owner Host mode.");
    pendingAuth = await startSpsDesktopAuth({
      hubUrl: state.profile.hubUrl,
      companyId: state.profile.companyId,
    });
    if (pendingAuth.approvalUrl) await shell.openExternal(pendingAuth.approvalUrl);
    return publicStatus();
  });
  ipcMain.handle("desktop:poll-auth", async () => {
    if (!state.profile || !pendingAuth) throw new Error("No SPS Desktop sign-in is waiting for approval");
    const result = await pollSpsDesktopAuth({
      hubUrl: state.profile.hubUrl,
      challengeId: pendingAuth.id,
      challengeToken: pendingAuth.token,
    });
    if (result.status === "approved") {
      state.encryptedBoardApiToken = encrypt(pendingAuth.boardApiToken);
      pendingAuth = null;
      await persistState();
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
      }
    }
    return { ...publicStatus(), auth: result };
  });
  ipcMain.handle("desktop:scan-capabilities", async () => await scanLocalCapabilities());
  ipcMain.handle("desktop:connect-node", connectNode);
  ipcMain.handle("desktop:disconnect-node", async () => {
    const nodeDisconnect = await disconnectCurrentNode();
    return { ...publicStatus(), nodeDisconnect };
  });
  ipcMain.handle("desktop:sign-out", async () => {
    const nodeDisconnect = await disconnectCurrentNode();
    pendingAuth = null;
    state.encryptedBoardApiToken = null;
    state.companies = [];
    state.projects = [];
    await persistState();
    await openSetup();
    return { ...publicStatus(), nodeDisconnect };
  });
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
    void shell.openExternal(url);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
  });
  await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const joinArg = findSpsJoinUriArg(argv);
    if (joinArg) sendJoinToRenderer(joinArg);
    void showMainWindow();
  });
  app.whenReady().then(async () => {
    state = await loadState(app.getPath("userData"));
    registerIpc();
    configureWorkspaceRequestAuth();
    createApplicationMenu();
    app.setAsDefaultProtocolClient("sps");
    await createWindow({ show: !startedHidden });
    createTray();
    void bootstrapOwnerHost();
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
app.on("before-quit", () => {
  isQuitting = true;
  stopNodeScheduling();
  void cancelSpsNodeCommands("SPS Desktop is closing, so its local command stopped.");
  updateService?.stop();
  void defaultMemoryManager?.stop({ force: true });
  void ownerHostManager?.stop({ force: true });
});

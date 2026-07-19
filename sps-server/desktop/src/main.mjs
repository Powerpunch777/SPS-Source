import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, safeStorage, session, shell, Tray } from "electron";
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
import { buildInviteUrl, findSpsJoinUriArg, parseSpsJoinUri } from "./invite.mjs";
import { emptyState, loadState, saveState } from "./state.mjs";
import { canRunSpsNodeCommands, normalizeSpsNodeStatus } from "./node-activation.mjs";
import { createSpsUpdateService } from "./update-service.mjs";
import { isSpsHubApiUrl, requireSpsHubOrigin } from "./workspace-url.mjs";
import { requireSpsWorkspaceDirectory } from "./workspace-directory.mjs";
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

function normalizeProjectList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((project) => project && typeof project.id === "string" && typeof project.name === "string")
    .map((project) => ({ id: project.id, name: project.name }));
}

async function refreshProjects() {
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
  return requireSpsHubOrigin(state.profile.hubUrl);
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
  if (!currentBoardToken()) throw new Error("Continue with Google before opening the SPS workspace");
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
    update: { ...updateStatus },
  };
}

async function connectNode() {
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
});

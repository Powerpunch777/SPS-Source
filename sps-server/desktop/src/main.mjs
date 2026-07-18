import { app, BrowserWindow, ipcMain, safeStorage, shell } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createNodeIdentity,
  claimSpsNodeCommand,
  executeSpsNodeCommand,
  listSpsCompanies,
  pollSpsDesktopAuth,
  registerSpsNode,
  scanLocalCapabilities,
  sendSpsNodeHeartbeat,
  startSpsDesktopAuth,
} from "@sps/desktop-node";
import { buildInviteUrl, parseSpsJoinUri } from "./invite.mjs";
import { emptyState, loadState, saveState } from "./state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow = null;
let state = emptyState();
let pendingAuth = null;
let heartbeatTimer = null;
let commandPollTimer = null;
let commandPollInFlight = false;

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

function publicStatus() {
  return {
    profile: state.profile,
    hasIdentity: Boolean(state.identity),
    signedIn: Boolean(state.encryptedBoardApiToken),
    nodeId: state.nodeId,
    companies: Array.isArray(state.companies) ? state.companies : [],
    pendingAuth: pendingAuth
      ? { approvalUrl: pendingAuth.approvalUrl, expiresAt: pendingAuth.expiresAt }
      : null,
    commandRunner: {
      active: Boolean(commandPollTimer),
      workspaceConfigured: Boolean(state.profile?.defaultWorkspacePath),
    },
  };
}

async function connectNode() {
  if (!state.profile) throw new Error("Save an SPS Hub profile first");
  if (!state.profile.companyId) throw new Error("Choose an SPS company before registering this computer");
  const accessToken = currentBoardToken();
  if (!accessToken) throw new Error("Sign in to SPS Desktop before registering this computer");
  const identity = await ensureIdentity();
  const capabilities = scanLocalCapabilities();
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
  await persistState();
  scheduleHeartbeat();
  scheduleCommandPolling();
  return { node, verified, capabilities };
}

function scheduleHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    try {
      if (!state.nodeId || !state.profile || !state.identity) return;
      await sendSpsNodeHeartbeat({
        hubUrl: state.profile.hubUrl,
        nodeId: state.nodeId,
        identity: currentIdentity(),
        accessToken: currentBoardToken() ?? undefined,
      });
    } catch {
      // A background retry never logs credentials or CLI details.
    }
  }, 60_000);
}

async function pollNodeCommands() {
  if (commandPollInFlight || !state.nodeId || !state.profile || !state.identity) return;
  const accessToken = currentBoardToken();
  if (!accessToken) return;
  commandPollInFlight = true;
  try {
    const command = await claimSpsNodeCommand({
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      accessToken,
    });
    if (!command) return;
    await executeSpsNodeCommand({
      command,
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      accessToken,
      profile: state.profile,
    });
  } catch {
    // The Hub receives the command failure when a command was claimed. Polling
    // failures are intentionally quiet to avoid exposing runtime details.
  } finally {
    commandPollInFlight = false;
  }
}

function scheduleCommandPolling() {
  if (commandPollTimer) clearInterval(commandPollTimer);
  commandPollTimer = setInterval(() => {
    void pollNodeCommands();
  }, 2_000);
  void pollNodeCommands();
}

function sendJoinToRenderer(value) {
  const join = parseSpsJoinUri(value);
  if (join && mainWindow) mainWindow.webContents.send("desktop:join-link", join);
}

function registerIpc() {
  ipcMain.handle("desktop:status", () => publicStatus());
  ipcMain.handle("desktop:save-profile", async (_event, input) => {
    const hub = new URL(input.hubUrl);
    if (hub.protocol !== "http:" && hub.protocol !== "https:") {
      throw new Error("SPS Hub URL must use HTTP or HTTPS");
    }
    const companyId = String(input.companyId ?? "").trim();
    const displayName = String(input.displayName ?? "").trim();
    if (!displayName) throw new Error("Computer name is required");
    state.profile = {
      hubUrl: hub.toString().replace(/\/$/, ""),
      companyId,
      displayName: displayName.slice(0, 120),
      defaultWorkspacePath: String(input.defaultWorkspacePath ?? "").trim(),
      projectWorkspaces: state.profile?.projectWorkspaces ?? {},
    };
    await persistState();
    return publicStatus();
  });
  ipcMain.handle("desktop:open-invite", async (_event, input) => {
    if (!state.profile) throw new Error("Save an SPS Hub profile first");
    const url = buildInviteUrl(state.profile.hubUrl, input.code);
    await shell.openExternal(url);
    return url;
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
      } catch {
        // Google approval completed. The user can retry after a transient Hub failure.
      }
    }
    return { ...publicStatus(), auth: result };
  });
  ipcMain.handle("desktop:scan-capabilities", () => scanLocalCapabilities());
  ipcMain.handle("desktop:connect-node", connectNode);
  ipcMain.handle("desktop:sign-out", async () => {
    pendingAuth = null;
    state.encryptedBoardApiToken = null;
    await persistState();
    return publicStatus();
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 760,
    minWidth: 760,
    minHeight: 600,
    icon: path.join(__dirname, "..", "assets", "sps-logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const joinArg = argv.find((value) => value.startsWith("sps://join"));
    if (joinArg) sendJoinToRenderer(joinArg);
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app.whenReady().then(async () => {
    state = await loadState(app.getPath("userData"));
    registerIpc();
    app.setAsDefaultProtocolClient("sps");
    await createWindow();
    scheduleHeartbeat();
    scheduleCommandPolling();
  });
}

app.on("open-url", (event, value) => {
  event.preventDefault();
  sendJoinToRenderer(value);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (commandPollTimer) clearInterval(commandPollTimer);
});

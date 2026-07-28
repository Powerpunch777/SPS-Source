import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, safeStorage, session, shell, Tray } from "electron";
import { randomBytes } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cancelSpsNodeCommands,
  createNodeIdentity,
  claimSpsNodeCommand,
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
  buildInviteUrl,
  createSpsRoutedInviteCode,
  findSpsJoinUriArg,
  parseSpsJoinUri,
  parseSpsRoutedInviteCode,
} from "./invite.mjs";
import { resolveSpsNodeDisplayName } from "./node-display-name.mjs";
import { emptyState, loadState, saveState } from "./state.mjs";
import {
  getSpsAccountConnection,
  normalizeSpsAccountConnection,
  setSpsAccountConnection,
} from "./account-connections.mjs";
import { canRunSpsNodeCommands, normalizeSpsNodeStatus } from "./node-activation.mjs";
import { createSpsUpdateService, resolveSpsDesktopUpdatePolicy } from "./update-service.mjs";
import {
  createSpsDesktopAccessToken,
  isSpsDesktopWorkspaceRequest,
  SPS_DESKTOP_ACCESS_HEADER,
  SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER,
  spsDesktopAccessEnvironment,
} from "./desktop-local-access.mjs";
import {
  createSpsOwnerHostManager,
  materializeSpsOwnerHostRuntime,
  resolveSpsOwnerHostRuntime,
  spsOwnerHostBundledNodePath,
} from "./owner-host.mjs";
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
import { exportSpsOwnerVaultTransfer, inspectSpsOwnerVaultTransfer } from "./owner-vault-transfer.mjs";
import { inspectSpsPluginRuntime } from "./plugin-runtime.mjs";
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
import { loadSpsOfficialExtensionsCatalog } from "./official-extensions-catalog.mjs";
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
import {
  configuredSpsIdentityUrl,
  refreshSpsDesktopIdentity,
  revokeSpsDesktopIdentity,
  startSpsDesktopIdentitySignIn,
} from "./sps-identity-account.mjs";
import { resolveSpsServerAccess } from "./server-access-model.mjs";
import {
  disabledSpsExtensionStatus,
  isSpsDefaultMemoryEnabled,
  isSpsRoomWorkplaneBundled,
} from "./bundled-extensions.mjs";
import { synchronizeSpsTeamWorkplaneConfig } from "./bundled-workplane-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPS_START_HIDDEN_ARGUMENT = "--sps-start-hidden";
let mainWindow = null;
let workspaceWindow = null;
let registryWindow = null;
let officialExtensionsWindow = null;
let state = emptyState();
let pendingAuth = null;
let pendingDesktopAccount = null;
let desktopAccountError = null;
let heartbeatTimer = null;
let commandPollTimer = null;
let commandPollInFlight = false;
let pendingJoin = null;
let rendererReadyForJoinLinks = false;
let workspaceOrigin = null;
let nodeRuntimeStatus = emptyNodeRuntimeStatus();
let tray = null;
let isQuitting = false;
let shutdownPromise = null;
let shutdownComplete = false;
const startedHidden = process.argv.includes(SPS_START_HIDDEN_ARGUMENT);
let updateService = null;
let lastPromptedUpdateVersion = null;
// Status is rendered often by the setup screen. Do not synchronously ask
// Windows for login-item settings on that hot IPC path: some Windows builds
// can stall the call while their startup registration is being refreshed.
let launchAtLoginEnabled = false;
let updateStatus = {
  state: "initializing",
  channel: "latest",
  trust: "official-release",
  mandatory: false,
  currentVersion: app.getVersion(),
  availableVersion: null,
  percent: null,
  message: "Desktop update service is starting.",
};
let ownerHostManager = null;
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
let ownerHostCompanies = [];
let pluginRuntimeStatus = {
  state: "checking",
  command: null,
  npmCli: null,
  version: null,
  message: "Checking SPS plugin runtime.",
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
  if (!app.isPackaged) {
    updateStatus = {
      state: "disabled",
      channel: "latest",
      trust: "official-release",
      mandatory: false,
      currentVersion: app.getVersion(),
      availableVersion: null,
      percent: null,
      message: "Desktop updates are available only in an installed SPS release.",
    };
    return;
  }
  try {
    const updaterModule = await import("electron-updater");
    // electron-updater is CommonJS. Dynamic ESM import exposes it under default.
    const autoUpdater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater;
    if (!autoUpdater) throw new Error("electron-updater did not expose autoUpdater");
    updateService = createSpsUpdateService({
      app,
      updater: autoUpdater,
      policy: resolveSpsDesktopUpdatePolicy(),
      onStatus: (nextStatus) => {
        updateStatus = nextStatus;
        if (nextStatus.state === "ready") void promptDesktopBetaUpdate(nextStatus);
      },
    });
    updateStatus = updateService.getStatus();
    updateService.start();
  } catch {
    updateStatus = {
      state: "unavailable",
      channel: "latest",
      trust: "official-release",
      mandatory: false,
      currentVersion: app.getVersion(),
      availableVersion: null,
      percent: null,
      message: "Desktop update service is unavailable. Your current installation remains unchanged.",
    };
  }
}

async function promptDesktopBetaUpdate(status = updateStatus, { force = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const version = status.availableVersion ?? "a newer version";
  const promptKey = `${status.state}:${version}`;
  if (!force && lastPromptedUpdateVersion === promptKey) return;
  lastPromptedUpdateVersion = promptKey;

  if (status.state === "ready") {
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "SPS Desktop update ready",
      message: `SPS Desktop ${version} has been downloaded.`,
      detail: "It will install automatically the next time SPS Desktop closes. You can also restart now.",
      buttons: ["Restart and install", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0 && updateService) {
      updateStatus = updateService.install();
    }
  }
}

async function checkForDesktopBetaUpdate() {
  const status = await requireUpdateService().check();
  updateStatus = status;
  if (status.state === "current") {
    await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "SPS Desktop Beta",
      message: "This SPS Desktop installation is up to date.",
      buttons: ["OK"],
    });
  } else if (status.state === "ready") {
    await promptDesktopBetaUpdate(status, { force: true });
  }
  return status;
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

function currentDesktopAccount() {
  if (!state.encryptedDesktopAccount) return null;
  try {
    const parsed = JSON.parse(decrypt(state.encryptedDesktopAccount));
    if (typeof parsed?.subject !== "string" || typeof parsed?.name !== "string") return null;
    return {
      subject: parsed.subject,
      name: parsed.name,
      email: typeof parsed.email === "string" ? parsed.email : null,
      picture: typeof parsed.picture === "string" ? parsed.picture : null,
      verifiedAt: typeof parsed.verifiedAt === "string" ? parsed.verifiedAt : null,
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      accessTokenExpiresAt: typeof parsed.accessTokenExpiresAt === "string" ? parsed.accessTokenExpiresAt : null,
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : null,
      identityUrl: typeof parsed.identityUrl === "string" ? parsed.identityUrl : null,
    };
  } catch {
    return null;
  }
}

function currentDesktopAccountSubject() {
  return currentDesktopAccount()?.subject ?? null;
}

async function ensureDesktopIdentityAccessToken() {
  const account = currentDesktopAccount();
  if (!account?.accessToken || !account?.refreshToken || !account?.deviceId) return null;
  const expiresAt = Date.parse(account.accessTokenExpiresAt ?? "");
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 2 * 60 * 1000) {
    return account.accessToken;
  }
  const refreshed = await refreshSpsDesktopIdentity({
    identityUrl: account.identityUrl || configuredDesktopIdentityUrl(),
    refreshToken: account.refreshToken,
    deviceId: account.deviceId,
  });
  state.encryptedDesktopAccount = encrypt(JSON.stringify({
    ...account,
    ...refreshed,
    identityUrl: account.identityUrl || configuredDesktopIdentityUrl(),
    verifiedAt: account.verifiedAt || new Date().toISOString(),
  }));
  await persistState();
  return refreshed.accessToken;
}

function spsIdentitySessionCookieValue(response) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const header of setCookies) {
    const match = String(header).match(/(?:^|,)\s*sps_identity_session=([^;]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

async function establishSpsIdentityCoreSession(hubOrigin) {
  const accessToken = await ensureDesktopIdentityAccessToken();
  if (!accessToken) return null;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    origin: new URL(hubOrigin).origin,
  };
  // During the private-team hand-off, the Owner exchanges its SPS Identity
  // session with the same loopback Core. That protected local request needs
  // the launch-scoped Desktop token; remote Member Hubs never receive it.
  if (
    isOwnerHostProfile()
    && ownerHostStatus.url
    && new URL(hubOrigin).origin === requireSpsOwnerHostOrigin(ownerHostStatus.url)
  ) {
    headers[SPS_DESKTOP_ACCESS_HEADER] = ownerHostDesktopAccessToken;
  }
  const response = await fetch(new URL("/api/sps-identity/session", `${hubOrigin}/`), {
    method: "POST",
    headers,
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "SPS Server could not accept the SPS Identity session.");
  }
  const token = spsIdentitySessionCookieValue(response);
  if (!token) throw new Error("SPS Server did not create a secure SPS Identity session.");
  const target = new URL(hubOrigin);
  await session.defaultSession.cookies.set({
    url: target.origin,
    name: "sps_identity_session",
    value: token,
    httpOnly: true,
    secure: target.protocol === "https:",
    sameSite: "lax",
    expirationDate: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  });
  return token;
}

async function clearSpsIdentityCoreSessions() {
  const cookies = await session.defaultSession.cookies.get({ name: "sps_identity_session" });
  await Promise.all(cookies.map(async (cookie) => {
    const hostname = String(cookie.domain ?? "").replace(/^\./, "");
    if (!hostname) return;
    const protocol = cookie.secure ? "https:" : "http:";
    const pathname = String(cookie.path ?? "/").startsWith("/") ? cookie.path : `/${cookie.path}`;
    await session.defaultSession.cookies.remove(`${protocol}//${hostname}${pathname}`, "sps_identity_session").catch(() => undefined);
  }));
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
  const sessionCookie = await establishSpsIdentityCoreSession(hubUrl);
  if (!sessionCookie) return null;
  const origin = requireSpsHubOrigin(hubUrl);
  const response = await fetch(new URL(`/api/invites/${encodeURIComponent(inviteToken)}/accept`, `${hubUrl}/`), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      origin,
      cookie: `sps_identity_session=${encodeURIComponent(sessionCookie)}`,
    },
    body: JSON.stringify({ requestType: "human" }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || "SPS Server could not accept this team invitation.");
  }
  return payload;
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
    clearActiveConnectionState();
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

function recordDesktopAccountAttempt(status, error = null) {
  state.desktopAccountLastAttempt = {
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

async function startDesktopAccountSignIn() {
  if (pendingDesktopAccount) return publicStatus();
  const identityUrl = configuredDesktopIdentityUrl();
  const deviceId = ensureDesktopDeviceId();
  desktopAccountError = null;
  recordDesktopAccountAttempt("pending");
  await persistState();
  let signIn;
  try {
    signIn = await startSpsDesktopIdentitySignIn({
      identityUrl,
      deviceId,
      openExternal: (url) => shell.openExternal(url),
    });
  } catch (error) {
    desktopAccountError = safeDesktopAccountError(error);
    recordDesktopAccountAttempt("failed", error);
    await persistState();
    sendDesktopAccountStatus();
    throw error;
  }
  pendingDesktopAccount = signIn;
  sendDesktopAccountStatus();
  void signIn.result.then(async (account) => {
    state.encryptedDesktopAccount = encrypt(JSON.stringify({
      ...account,
      identityUrl,
      verifiedAt: new Date().toISOString(),
    }));
    if (pendingDesktopAccount === signIn) desktopAccountError = null;
    restoreCurrentAccountConnection();
    recordDesktopAccountAttempt("succeeded");
    await persistState();
    // The first SPS Desktop stored a fully local Owner Host but had no central
    // account subject. Adopt only the explicitly detected legacy Host after a
    // successful SPS Identity sign-in on the same physical computer.
    if (state.legacyOwnerHostAdoptionPending && !state.ownerHostOwnerSubject) {
      try {
        await adoptLegacyOwnerHostIfNeeded();
      } catch (error) {
        ownerHostStatus = {
          ...ownerHostStatus,
          state: "stopped",
          lastError: error instanceof Error ? error.message : "Existing SPS Owner Host could not be adopted.",
        };
      }
    }
    await maybeOpenWorkspaceForCurrentAccount();
  }).catch(async (error) => {
    if (pendingDesktopAccount === signIn) {
      desktopAccountError = safeDesktopAccountError(error);
    }
    recordDesktopAccountAttempt("failed", error);
    await persistState().catch(() => {});
  }).finally(() => {
    if (pendingDesktopAccount === signIn) pendingDesktopAccount = null;
    sendDesktopAccountStatus();
  });
  return publicStatus();
}

async function signOutDesktopAccount() {
  const signIn = pendingDesktopAccount;
  pendingDesktopAccount = null;
  signIn?.cancel();
  desktopAccountError = null;
  const account = currentDesktopAccount();
  if (account?.refreshToken) {
    await revokeSpsDesktopIdentity({
      identityUrl: account.identityUrl || configuredDesktopIdentityUrl(),
      refreshToken: account.refreshToken,
    });
  }
  let nodeDisconnect = null;
  if (account && state.profile) {
    nodeDisconnect = await disconnectCurrentNode();
    rememberCurrentAccountConnection();
  }
  await clearSpsIdentityCoreSessions();
  clearActiveConnectionState();
  state.encryptedDesktopAccount = null;
  await persistState({ rememberActiveConnection: false });
  await showMainWindow();
  await openSetup();
  sendDesktopAccountStatus();
  return { ...publicStatus(), nodeDisconnect };
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
    SPS_AUTH_IDENTITY_ENABLED: "true",
    SPS_IDENTITY_ISSUER: configuredDesktopIdentityUrl(),
    SPS_IDENTITY_AUDIENCE: "sps-core",
    SPS_IDENTITY_JWKS_URL: `${configuredDesktopIdentityUrl()}/.well-known/jwks.json`,
    SPS_AUTH_GOOGLE_ONLY: "false",
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

async function synchronizeReadyTeamWorkplane() {
  const ownerHostUrl = ownerHostStatus.url;
  if (!ownerHostIsReady() || !ownerHostUrl || lastTeamWorkplaneBindingUrl === ownerHostUrl) return;
  if (teamWorkplaneSyncPromise) return teamWorkplaneSyncPromise;
  if (
    lastTeamWorkplaneSyncAttempt?.url === ownerHostUrl
    && Date.now() - lastTeamWorkplaneSyncAttempt.at < TEAM_WORKPLANE_SYNC_RETRY_MS
  ) return;

  lastTeamWorkplaneSyncAttempt = { url: ownerHostUrl, at: Date.now() };
  teamWorkplaneSyncPromise = (async () => {
    try {
      const sessionCookie = isTeamAccessEnabled()
        ? await establishSpsIdentityCoreSession(ownerHostUrl)
        : null;
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
  const defaultMemoryEnabled = isSpsDefaultMemoryEnabled();
  const roomWorkplaneBundled = isSpsRoomWorkplaneBundled();
  const defaultMemory = defaultMemoryEnabled
    ? await ensureSpsDefaultMemoryConfig({ ownerVaultRoot: vaultRoot })
    : null;
  pluginRuntimeStatus = await inspectSpsPluginRuntime();
  const url = spsOwnerHostUrl(ownerHost.config);
  if (ownerHostManager && ownerHostStatus.url === url && (!defaultMemoryEnabled || defaultMemoryManager)) {
    return { ...ownerHost, defaultMemory, url };
  }

  const sourceRuntimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "sps-owner-host-runtime")
    : path.join(__dirname, "..", ".owner-host-runtime");
  const targetRuntimeRoot = path.join(app.getPath("userData"), "owner-host-runtime", app.getVersion());
  const developmentCoreRoot = path.resolve(__dirname, "..", "..", "..", "external", "sps-core");
  const developmentMemorySidecarEntry = path.resolve(__dirname, "..", "..", "memory-sidecar", "memory-sidecar.mjs");
  const developmentMemoryPluginPath = path.resolve(__dirname, "..", "..", "sps-default-memory");
  const developmentRoomPluginPath = path.resolve(__dirname, "..", "..", "sps-room-chat");
  defaultMemoryManager = defaultMemory
    ? createSpsDefaultMemoryManager({
      url: spsDefaultMemoryUrl(defaultMemory.config),
      token: defaultMemory.config.security.token,
      configPath: defaultMemory.layout.configPath,
      nodeCommand: process.execPath,
      resolveEntry: async () => {
        const materializedRuntime = await materializeSpsOwnerHostRuntime({
          sourceRuntimeRoot,
          targetRuntimeRoot,
          runInPlace: app.isPackaged,
        });
        const packagedEntry = materializedRuntime
          ? path.join(materializedRuntime, "memory-sidecar", "memory-sidecar.mjs")
          : null;
        return packagedEntry && existsSync(packagedEntry) ? packagedEntry : developmentMemorySidecarEntry;
      },
      resolveNodeCommand: async () => {
        const materializedRuntime = await materializeSpsOwnerHostRuntime({
          sourceRuntimeRoot,
          targetRuntimeRoot,
          runInPlace: app.isPackaged,
        });
        const bundledNode = materializedRuntime ? spsOwnerHostBundledNodePath(materializedRuntime) : null;
        return bundledNode && existsSync(bundledNode) ? bundledNode : process.execPath;
      },
    })
    : null;
  ownerHostManager = createSpsOwnerHostManager({
    url,
    resolveRuntime: async () => {
      const materializedRuntime = await materializeSpsOwnerHostRuntime({
        sourceRuntimeRoot,
        targetRuntimeRoot,
        runInPlace: app.isPackaged,
      });
      const packagedMemoryPluginPath = materializedRuntime ? path.join(materializedRuntime, "sps-default-memory") : null;
      const packagedRoomPluginPath = materializedRuntime ? path.join(materializedRuntime, "sps-room-chat") : null;
      const memoryPluginPath = packagedMemoryPluginPath && existsSync(path.join(packagedMemoryPluginPath, "package.json"))
        ? packagedMemoryPluginPath
        : developmentMemoryPluginPath;
      const roomPluginPath = packagedRoomPluginPath && existsSync(path.join(packagedRoomPluginPath, "package.json"))
        ? packagedRoomPluginPath
        : developmentRoomPluginPath;
      const bundledPluginPaths = [
        ...(defaultMemoryEnabled ? [memoryPluginPath] : []),
        ...(roomWorkplaneBundled ? [roomPluginPath] : []),
      ];
      return resolveSpsOwnerHostRuntime({
        // Development must execute the checked-out Core directly. The local
        // packaged runtime is intentionally a release artifact and otherwise
        // masks source changes during Desktop verification.
        packagedRuntimeRoots: app.isPackaged && materializedRuntime ? [materializedRuntime] : [],
        coreRoots: app.isPackaged ? [] : [developmentCoreRoot],
        packagedNodeCommand: process.execPath,
        configPath: ownerHost.layout.configPath,
        environment: {
          PAPERCLIP_HOME: ownerHost.layout.root,
          PAPERCLIP_DB_BACKUP_DIR: ownerHost.layout.backupDir,
          PAPERCLIP_STORAGE_LOCAL_DIR: ownerHost.layout.storageDir,
          PAPERCLIP_SECRETS_MASTER_KEY_FILE: ownerHost.layout.secretsPath,
          PAPERCLIP_PROJECTS_ROOT: ownerHost.layout.projectsDir,
          // The Core CLI enables Vite middleware when it sees a source-tree
          // entrypoint. Desktop must always render the bundled static UI so
          // opening SPS never depends on a separate development web server.
          PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
          SPS_BASIC_MODE: "true",
          SPS_WORKPLANE_MODE: "true",
          SPS_WORKPLANE_ROOM_ORIGIN_PREFIXES: [
            "plugin:local.room-chat:operation:agent-room",
            "plugin:local.room-chat:agent-room-provisioning",
            "plugin:local.room-chat:project-room-provisioning",
          ].join(","),
          SPS_WORKPLANE_DEFAULT_PROJECT_TAB: "plugin:local.room-chat:project-workplane",
          SPS_BUNDLED_PLUGIN_PATHS: bundledPluginPaths.join(path.delimiter),
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
  // A previously installed SPS Team Workplane may still be active after an
  // app update or after bundled extensions were toggled. Bind it whenever the
  // Owner Host becomes healthy; absent plugins are a harmless no-op.
  await synchronizeReadyTeamWorkplane();
  if (activate && ownerHostIsReady()) await activateOwnerHostProfile();
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
    await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
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
    throw new Error("Only this SPS Owner Host can repair its private team membership.");
  }
  const accessToken = currentBoardToken();
  const ownerHostOrigin = requireSpsOwnerHostOrigin(ownerHostStatus.url);
  const headers = body === undefined
    ? { accept: "application/json", origin: ownerHostOrigin }
    : { accept: "application/json", "content-type": "application/json", origin: ownerHostOrigin };
  // Private team Hosts require the same protected Board session as their
  // remote address. Local-only bootstrap still works without this header.
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (isOwnerHostProfile()) headers[SPS_DESKTOP_ACCESS_HEADER] = ownerHostDesktopAccessToken;
  if (ownerBootstrap) headers[SPS_DESKTOP_OWNER_BOOTSTRAP_HEADER] = ownerHostDesktopAccessToken;
  if (state.teamAccess?.enabled) {
    const identitySession = await establishSpsIdentityCoreSession(requireSpsOwnerHostOrigin(ownerHostStatus.url));
    if (!identitySession) {
      throw new Error("This private SPS Owner Host did not accept the SPS Identity session.");
    }
    headers.cookie = `sps_identity_session=${encodeURIComponent(identitySession)}`;
  }
  const response = await fetch(`${ownerHostOrigin}/api${pathname}`, {
    method,
    headers,
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
  const source = input.kind === "local"
    ? {
      id: input.id,
      kind: "local",
      displayName: input.displayName,
      localPath: input.localPath,
    }
    : {
      id: input.id,
      kind: input.kind,
      displayName: input.displayName,
      indexUrl: input.indexUrl,
      trustedRoot: {
        keyId: input.trustedRootKeyId,
        publicKey: input.trustedRootPublicKey,
      },
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
  try {
    const staged = await stageSpsPluginArchive({
      vaultRoot: ownerVaultRoot(),
      archivePath: acquired.archivePath,
      expectedArtifact: acquired.artifact,
      expectedRelease: acquired.release,
      source: acquired.source,
      registerStage: async (body) => await ownerHostApi("/plugins/registry/stages", {
        method: "POST",
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
    body: {},
  });
}

async function listDesktopRegistryStages() {
  assertRegistryOwner();
  const stages = await ownerHostApi("/plugins/registry/stages");
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

async function showRegistryPluginStages() {
  if (!isOwnerHostProfile() || !currentAccountOwnsOwnerHost()) {
    throw new Error("Only the signed-in SPS Owner can review Registry plugins.");
  }
  const stages = await ownerHostApi("/plugins/registry/stages");
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
  const backup = await ownerHostApi("/instance/database-backups", { method: "POST", body: {} });
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
    detail: `${transfer.manifest.createdAt}\n\nImport will be enabled when the destination Owner Vault is created.`,
  });
  return transfer;
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
  // the owner can explicitly return to local-only mode instead of losing the
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
    const accepted = await acceptSpsIdentityInvite(nextTeamAccess.url, invitation.token);
    if (accepted?.status !== "approved") {
      throw new Error("SPS Owner Host did not grant the Owner's SPS account access.");
    }
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
    initialOwnerInvite: { accepted: true, expiresAt: invitation.expiresAt ?? null },
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
    body: {
      allowedJoinTypes: "human",
      humanRole: "operator",
      expiresInMinutes: 24 * 60,
      agentMessage: "SPS Desktop member invitation.",
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
  );
  const invites = Array.isArray(response?.invites) ? response.invites : [];
  return invites
    .filter((invite) => (
      invite
      && invite.inviteMessage === "SPS Desktop member invitation."
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
  const revoked = await ownerHostApi(`/invites/${encodeURIComponent(inviteId)}/revoke`, { method: "POST", body: {} });
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
  if (routed) {
    const accepted = await acceptSpsIdentityInvite(routed.hub, routed.code);
    await saveRemoteProfile({
      hubUrl: routed.hub,
      companyId: "",
      authMode: accepted ? "sps-identity" : "legacy",
      displayName: state.profile?.displayName ?? "",
      defaultWorkspacePath: state.profile?.defaultWorkspacePath ?? "",
    });
    if (accepted) {
      await refreshSpsIdentityTeamContext();
      return { hub: routed.hub, status: accepted.status ?? "approved", direct: true };
    }
    await shell.openExternal(buildInviteUrl(routed.hub, routed.code));
    return routed;
  }
  if (!state.profile?.hubUrl) {
    throw new Error("Paste the full SPS2 invitation code from the Owner. Short SPS codes work only after this computer already knows the team address.");
  }
  const accepted = await acceptSpsIdentityInvite(state.profile.hubUrl, pasted);
  if (accepted) {
    await saveRemoteProfile({ ...state.profile, authMode: "sps-identity" });
    await refreshSpsIdentityTeamContext();
    return { hub: state.profile.hubUrl, status: accepted.status ?? "approved", direct: true };
  }
  const url = buildInviteUrl(state.profile.hubUrl, pasted);
  await shell.openExternal(url);
  return { hub: state.profile.hubUrl };
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
  createApplicationMenu();
  refreshTrayMenu();
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

async function showRegistryWindow({ sourceId = null } = {}) {
  assertRegistryOwner();
  if (registryWindow && !registryWindow.isDestroyed()) {
    if (sourceId) {
      await registryWindow.loadFile(path.join(__dirname, "..", "renderer", "registry.html"), { query: { source: sourceId } });
    }
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
    void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    if (registryWindow === window) registryWindow = null;
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
    void shell.openExternal(url);
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
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
  // The local Owner Host is protected by the launch-scoped Desktop header.
  // Central Identity sessions are for remote/private team access only.
  const usesIdentitySession = isOwnerHostProfile()
    ? false
    : await establishSpsIdentityCoreSession(hubOrigin);
  if (!isOwnerHostProfile() && !currentBoardToken() && !usesIdentitySession) {
    throw new Error("This SPS Server still requires its existing browser sign-in. Complete its server access step first.");
  }
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

function canCreateMemberInvite() {
  return Boolean(
    currentDesktopAccount()
    && isOwnerHostProfile()
    && currentAccountOwnsOwnerHost()
    && isTeamAccessEnabled(),
  );
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
        { label: "Open SPS workspace", enabled: Boolean(account && state.profile), click: () => run(showWorkspace) },
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
}

function refreshTrayMenu() {
  if (!tray) return;
  const account = currentDesktopAccount();
  const accountLabel = account?.email ?? account?.name ?? "SPS 계정에 로그인";
  const workspaceOpen = Boolean(workspaceWindow && !workspaceWindow.isDestroyed());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: accountLabel, enabled: false },
    { type: "separator" },
    { label: "Open SPS Desktop", click: () => { void showMainWindow(); } },
    { label: "Open SPS workspace", enabled: Boolean(account && state.profile), click: () => { void showWorkspace(); } },
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
  return {
    desktopAccount: {
      configured: true,
      provider: "SPS Identity",
      identityUrl: configuredDesktopIdentityUrl(),
        signedIn: Boolean(desktopAccount),
      pending: Boolean(pendingDesktopAccount),
      error: desktopAccountError,
      name: desktopAccount?.name ?? null,
      email: desktopAccount?.email ?? null,
      picture: desktopAccount?.picture ?? null,
      verifiedAt: desktopAccount?.verifiedAt ?? null,
      lastAttempt: state.desktopAccountLastAttempt
        ? {
          status: state.desktopAccountLastAttempt.status,
          at: state.desktopAccountLastAttempt.at,
          error: state.desktopAccountLastAttempt.error,
        }
        : null,
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
      state: updateStatus.state,
      channel: updateStatus.channel,
      trust: updateStatus.trust,
      mandatory: updateStatus.mandatory,
      currentVersion: updateStatus.currentVersion,
      availableVersion: updateStatus.availableVersion,
      percent: updateStatus.percent,
      message: updateStatus.message,
    },
  };
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
    ...access,
  });
  const verified = await sendSpsNodeHeartbeat({
    hubUrl: state.profile.hubUrl,
    nodeId: node.id,
    identity,
    ...access,
  });
  state.nodeId = node.id;
  await applyNodeStatus(verified.status ?? node.status, { persist: false });
  nodeRuntimeStatus.lastHeartbeatAt = new Date().toISOString();
  await persistState();
  scheduleHeartbeat({ immediate: false });
  return { node, verified, capabilities, runners };
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

async function pollNodeCommands() {
  if (commandPollInFlight || !canRunSpsNodeCommands(state.nodeStatus) || !state.nodeId || !state.profile || !state.identity) return;
  commandPollInFlight = true;
  let claimedCommand = false;
  try {
    const access = await requireSpsCoreRequestAccess(state.profile.hubUrl);
    const command = await claimSpsNodeCommand({
      hubUrl: state.profile.hubUrl,
      nodeId: state.nodeId,
      identity: currentIdentity(),
      ...access,
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
      ...access,
      profile: state.profile,
    });
  } catch (error) {
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
    if (
      !isOwnerHostProfile()
      || !workspaceWindow
      || workspaceWindow.isDestroyed()
      || event.sender.id !== workspaceWindow.webContents.id
    ) {
      throw new Error("SPS Desktop sign-out is available only in the local Owner Host Workspace.");
    }
    return await signOutDesktopAccount();
  });
  ipcMain.handle("desktop:workspace-open-plugin-registries", async (event) => {
    if (
      !isOwnerHostProfile()
      || !workspaceWindow
      || workspaceWindow.isDestroyed()
      || event.sender.id !== workspaceWindow.webContents.id
    ) {
      throw new Error("Plugin Registry management is available only in the local Owner Host Workspace.");
    }
    await showRegistryWindow();
    return { opened: true };
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
  ipcMain.handle("desktop:registry-list-sources", async () => await listRegistrySources());
  ipcMain.handle("desktop:registry-choose-local-source", async () => await chooseDesktopLocalRegistryFolder());
  ipcMain.handle("desktop:registry-add-source", async (_event, input) => await addDesktopRegistrySource(input));
  ipcMain.handle("desktop:registry-remove-source", async (_event, input) => await removeDesktopRegistrySource(input?.sourceId));
  ipcMain.handle("desktop:registry-inspect-source", async (_event, input) => await inspectDesktopRegistrySource(input?.sourceId));
  ipcMain.handle("desktop:registry-stage-release", async (_event, input) => await stageDesktopRegistryRelease(input));
  ipcMain.handle("desktop:registry-enable-stage", async (_event, input) => await enableDesktopRegistryStage(input?.stageId));
  ipcMain.handle("desktop:registry-list-stages", async () => await listDesktopRegistryStages());
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
    await startOwnerHost({ activate: true });
    await refreshOwnerHostCompanies().catch(() => { ownerHostCompanies = []; });
    return publicStatus();
  });
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
      throw new Error("This Owner Host is already a private team Host. Finish SPS sign-in for its private address, or return it to local-only mode first.");
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
  ipcMain.handle("desktop:save-profile", async (_event, input) => await saveRemoteProfile(input));
  ipcMain.handle("desktop:open-invite", async (_event, input) => {
    if (!state.profile) throw new Error("Save an SPS team connection first");
    if (isOwnerHostProfile()) throw new Error("Create invitations after the Owner Host is configured for private or public team access.");
    const url = buildInviteUrl(state.profile.hubUrl, input.code);
    await shell.openExternal(url);
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
  ipcMain.handle("desktop:save-project-workspace", async (_event, input) => {
    if (!state.profile) throw new Error("Save an SPS team connection before mapping a project workspace");
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
        // The SPS Identity login remains valid even if the Owner Host is offline.
      }
      await maybeOpenWorkspaceForCurrentAccount();
      return { ...publicStatus(), auth: { status: "approved", provider: "sps-identity", companyAccess } };
    }
    pendingAuth = await startSpsDesktopAuth({
      hubUrl: state.profile.hubUrl,
      companyId: state.profile.companyId,
    });
    if (pendingAuth.approvalUrl) await shell.openExternal(pendingAuth.approvalUrl);
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
        // The SPS Identity login remains valid even if the Owner Host is offline.
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
    restoreCurrentAccountConnection();
    await persistState();
    registerIpc();
    configureWorkspaceRequestAuth();
    createApplicationMenu();
    app.setAsDefaultProtocolClient("sps");
    await createWindow({ show: !startedHidden });
    createTray();
    // Read Windows startup registration once after the first window is ready.
    // It must not run on the frequent status IPC path.
    setTimeout(refreshLaunchAtLoginStatus, 0);
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
async function stopDesktopRuntimeGracefully() {
  isQuitting = true;
  stopNodeScheduling();
  await cancelSpsNodeCommands("SPS Desktop is closing, so its local command stopped.");
  updateService?.stop();
  // A forced process-tree kill interrupts embedded PostgreSQL and turns every
  // normal Desktop exit into database crash recovery on the next start. Each
  // manager already escalates after its bounded graceful wait when necessary.
  await Promise.allSettled([
    defaultMemoryManager?.stop({ force: false }),
    ownerHostManager?.stop({ force: false }),
  ]);
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

const byId = (id) => document.getElementById(id);
const actionButtons = [...document.querySelectorAll("button[data-action]")];
const pluginToggle = byId("plugins-disabled");
const retryButton = byId("retry-status");
const actionNotice = byId("action-notice");
const nativePrepareButton = byId("prepare-native-identity");
const nativeAddressInput = byId("native-certificate-address");
const nativeDevicesRefreshButton = byId("refresh-native-devices");
const nativeDevicesList = byId("native-devices-list");
const nativeInvitationsRefreshButton = byId("refresh-native-invitations");
const nativeInvitationsList = byId("native-invitations-list");
const quitDesktopButton = byId("quit-desktop");
const pending = new Set();

let currentStatus = null;
let nativeConnectivity = null;
let statusLoading = false;
let nativeDevices = null;
let nativeDevicesLoading = false;
let nativeInvitations = null;
let nativeInvitationsLoading = false;
let quitPending = false;
let nativeDeviceButtons = [];
let nativeDevicesRequest = 0;
let nativeInvitationsRequest = 0;
let nativeRegistrationRequest = 0;
let nativeRegistrationButtons = [];
let nativeWorkspaceResults = [];
let nativeInvitationButtons = [];

const nativeDeviceStates = new Map([
  ["available", "Device management available"],
  ["host_required", "Local Host required"],
  ["identity_required", "Prepare Host identity first"],
  ["host_restart_required", "Restart Host to manage devices"],
  ["unavailable", "Native device management unavailable"],
]);
const nativeDeviceStatuses = new Map([
  ["pending", "Pending approval"],
  ["approved", "Approved"],
  ["revoked", "Revoked"],
]);
const nativeDeviceIdPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
const nativeDeviceFingerprintPattern = /^[0-9a-f]{64}$/;
const maxNativeDevices = 200;
const nativeInvitationStates = new Map([
  ["available", "Invitation management available"],
  ["host_required", "Local Host required"],
  ["identity_required", "Prepare Host identity first"],
  ["host_restart_required", "Restart Host to manage invitations"],
  ["unavailable", "Native invitation management unavailable"],
]);
const nativeInvitationStatuses = new Map([
  ["pending", "Pending"], ["expired", "Expired"], ["identity_changed", "Identity changed"],
  ["consumed", "Used"], ["revoked", "Revoked"], ["exhausted", "Attempts exhausted"],
]);
const nativeInvitationTargets = new Map([["any_verified_user", "Any verified SPS account"], ["verified_email", "Verified email"]]);
const nativeInvitationStatusesSet = new Set(nativeInvitationStatuses.keys());
const nativeInvitationTargetsSet = new Set(nativeInvitationTargets.keys());
const maxNativeInvitations = 200;

const nativeIdentityStates = new Map([
  ["not_prepared", "Not prepared"],
  ["identity_prepared", "Identity prepared"],
  ["identity_not_current", "Identity not current"],
  ["recovery_required", "Recovery required"],
  ["unavailable", "Unavailable"],
  ["host_required", "Host required"],
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactDataRecord(value, keys) {
  if (!isRecord(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== null && Object.getPrototypeOf(prototype) !== null) return null;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => typeof key !== "string" || !keys.includes(key))) return null;
  const result = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function isNativeDevicesSnapshot(value) {
  try {
    const snapshot = exactDataRecord(value, ["state", "lanEnabled", "devices"]);
    if (!snapshot || !nativeDeviceStates.has(snapshot.state) || snapshot.lanEnabled !== false
      || !Array.isArray(snapshot.devices) || snapshot.devices.length > maxNativeDevices
      || snapshot.state !== "available" && snapshot.devices.length !== 0) return false;
    const ids = new Set();
    for (const candidate of snapshot.devices) {
      const device = exactDataRecord(candidate, ["id", "displayName", "status", "certificateSha256", "certificateNotAfter", "revision"]);
      if (!device || typeof device.id !== "string" || !nativeDeviceIdPattern.test(device.id) || ids.has(device.id)
        || typeof device.displayName !== "string" || device.displayName.length > 120
        || !device.displayName.trim() || /[\u0000-\u001f\u007f]/.test(device.displayName)
        || !nativeDeviceStatuses.has(device.status)
        || typeof device.certificateSha256 !== "string" || !nativeDeviceFingerprintPattern.test(device.certificateSha256)
        || typeof device.certificateNotAfter !== "string" || device.certificateNotAfter.length !== 24
        || !Number.isSafeInteger(device.revision) || device.revision <= 0 || device.revision > 2_147_483_647) return false;
      const expiry = new Date(device.certificateNotAfter);
      if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== device.certificateNotAfter) return false;
      ids.add(device.id);
    }
    return true;
  } catch {
    return false;
  }
}

function isNativeInvitationsSnapshot(value) {
  try {
    const snapshot = exactDataRecord(value, ["state", "invitations"]);
    if (!snapshot || !nativeInvitationStates.has(snapshot.state) || !Array.isArray(snapshot.invitations)
      || snapshot.invitations.length > maxNativeInvitations
      || snapshot.state !== "available" && snapshot.invitations.length !== 0) return false;
    const ids = new Set();
    for (const candidate of snapshot.invitations) {
      const invitation = exactDataRecord(candidate, ["id", "status", "createdAt", "expiresAt", "failedAttempts", "maxAttempts", "target"]);
      if (!invitation || typeof invitation.id !== "string" || !nativeDeviceIdPattern.test(invitation.id) || ids.has(invitation.id)
        || !nativeInvitationStatusesSet.has(invitation.status)
        || typeof invitation.createdAt !== "string" || typeof invitation.expiresAt !== "string"
        || !Number.isFinite(Date.parse(invitation.createdAt)) || !Number.isFinite(Date.parse(invitation.expiresAt))
        || new Date(invitation.createdAt).toISOString() !== invitation.createdAt
        || new Date(invitation.expiresAt).toISOString() !== invitation.expiresAt
        || Date.parse(invitation.expiresAt) <= Date.parse(invitation.createdAt)
        || !Number.isSafeInteger(invitation.failedAttempts) || invitation.failedAttempts < 0 || invitation.failedAttempts > 20
        || !Number.isSafeInteger(invitation.maxAttempts) || invitation.maxAttempts < 1 || invitation.maxAttempts > 20
        || invitation.failedAttempts > invitation.maxAttempts || !nativeInvitationTargetsSet.has(invitation.target)) return false;
      ids.add(invitation.id);
    }
    return true;
  } catch { return false; }
}

function isCoreStatus(value) {
  return isRecord(value) && isRecord(value.host) && isRecord(value.recovery);
}

function nativeListenerStatus(value) {
  try {
    const off = exactDataRecord(value, ["state"]);
    if (off?.state === "off") return off;
    const active = exactDataRecord(value, ["state", "bindAddress", "port", "hostId"]);
    if (!active || active.state !== "listening" || typeof active.bindAddress !== "string"
      || !/^[0-9a-fA-F:.]{2,45}$/.test(active.bindAddress)
      || !Number.isSafeInteger(active.port) || active.port < 1024 || active.port > 65535
      || typeof active.hostId !== "string" || !nativeDeviceIdPattern.test(active.hostId)) return null;
    return active;
  } catch { return null; }
}

function isEpochMilliseconds(value) {
  return Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
}

function isNativeConnectivity(value) {
  if (!isRecord(value) || !nativeIdentityStates.has(value.state) || value.lanEnabled !== false || typeof value.canPrepare !== "boolean") {
    return false;
  }
  if (Object.hasOwn(value, "serverSpkiSha256") && (typeof value.serverSpkiSha256 !== "string" || value.serverSpkiSha256.length !== 64 || !/^[0-9a-f]{64}$/.test(value.serverSpkiSha256))) {
    return false;
  }
  if (Object.hasOwn(value, "serverNotAfter") && !isEpochMilliseconds(value.serverNotAfter)) return false;
  if (Object.hasOwn(value, "memberIssuerNotAfter") && !isEpochMilliseconds(value.memberIssuerNotAfter)) return false;
  if (value.canPrepare !== (value.state === "not_prepared")) return false;
  const hasCertificate = ["identity_prepared", "identity_not_current"].includes(value.state);
  if (hasCertificate && (!Object.hasOwn(value, "serverSpkiSha256") || !isEpochMilliseconds(value.serverNotAfter)
    || !isEpochMilliseconds(value.memberIssuerNotAfter))) return false;
  if (!hasCertificate && ["serverSpkiSha256", "serverNotAfter", "memberIssuerNotAfter"].some(key => Object.hasOwn(value, key))) return false;
  return true;
}

function safeText(value, fallback = "Unknown", maxLength = 100) {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
  return text || fallback;
}

function hasReportedError(value) {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined && value !== false;
}

function setNotice(message = "", isError = false) {
  if (quitPending && message !== "Closing SPS Desktop...") return;
  actionNotice.textContent = message;
  actionNotice.classList.toggle("error", isError);
}

function syncControls() {
  const memberBusy = statusLoading || pending.size > 0 || quitPending || currentStatus?.canManageNativeMember !== true;
  byId("register-native-member").disabled = memberBusy || !byId("native-member-invitation").value.trim() || !byId("native-member-name").value.trim();
  byId("refresh-native-registrations").disabled = memberBusy;
  byId("native-member-invitation").disabled = memberBusy;
  byId("native-member-name").disabled = memberBusy;
  for (const button of nativeRegistrationButtons) button.disabled = memberBusy;
  const busy = statusLoading || nativeDevicesLoading || nativeInvitationsLoading || pending.size > 0 || quitPending;
  const listenerReady = currentStatus?.canManageHost === true && nativeConnectivity?.state === "identity_prepared";
  const listenerActive = nativeListenerStatus(currentStatus?.nativeListener)?.state === "listening";
  const listenerPort = Number(byId("native-listener-port").value);
  byId("native-listener-form").hidden = !listenerReady && !listenerActive;
  byId("start-native-listener").disabled = busy || !listenerReady || listenerActive || !byId("native-listener-address").value.trim()
    || !Number.isSafeInteger(listenerPort) || listenerPort < 1024 || listenerPort > 65535;
  byId("native-listener-address").disabled = busy || !listenerReady || listenerActive;
  byId("native-listener-port").disabled = busy || !listenerReady || listenerActive;
  byId("stop-native-listener").disabled = busy || !listenerActive || currentStatus?.canManageHost !== true;
  byId("copy-native-invitation").disabled = busy || !listenerActive || currentStatus?.canManageHost !== true;
  quitDesktopButton.disabled = pending.size > 0 || quitPending;
  byId("native-identity-form").hidden = nativeConnectivity?.canPrepare !== true || currentStatus?.canManageHost !== true;
  for (const button of actionButtons) {
    const ownerAction = ["restart-host", "export-host"].includes(button.dataset.action);
    button.disabled = busy || !currentStatus || (ownerAction && currentStatus.canManageHost === false)
      || (button.dataset.action === "open-workspace" && currentStatus.desktopStateAvailable === false);
  }
  pluginToggle.disabled = busy || currentStatus?.canManageHost === false || typeof currentStatus?.recovery?.pluginsDisabled !== "boolean";
  nativePrepareButton.disabled = busy
    || !nativeConnectivity
    || nativeConnectivity.canPrepare !== true
    || currentStatus?.canManageHost !== true
    || !nativeAddressInput.value.trim();
  nativeDevicesRefreshButton.disabled = busy || currentStatus?.canManageHost !== true;
  for (const button of nativeDeviceButtons) {
    button.disabled = busy || currentStatus?.canManageHost !== true || nativeDevices?.state !== "available";
  }
  nativeInvitationsRefreshButton.disabled = busy || nativeInvitationsLoading || currentStatus?.canManageHost !== true;
  for (const button of nativeInvitationButtons) {
    button.disabled = busy || nativeInvitationsLoading || currentStatus?.canManageHost !== true || nativeInvitations?.state !== "available";
  }
  retryButton.disabled = busy;
}

function clearNativeDevices({ loading = false, invalidateRequest = false } = {}) {
  if (invalidateRequest) {
    nativeDevicesRequest += 1;
    nativeDevicesLoading = false;
  }
  nativeDevices = null;
  nativeDeviceButtons = [];
  nativeDevicesList.textContent = "";
  byId("native-devices-empty").hidden = true;
  byId("native-devices-error").hidden = loading;
  const status = byId("native-devices-status");
  status.setAttribute("aria-busy", String(loading));
  status.textContent = loading ? "Loading native devices..." : "Unavailable";
}

function clearNativeInvitations({ loading = false, invalidateRequest = false } = {}) {
  if (invalidateRequest) {
    nativeInvitationsRequest += 1;
    nativeInvitationsLoading = false;
  }
  nativeInvitations = null;
  nativeInvitationButtons = [];
  nativeInvitationsList.textContent = "";
  byId("native-invitations-empty").hidden = true;
  byId("native-invitations-error").hidden = loading;
  const status = byId("native-invitations-status");
  status.setAttribute("aria-busy", String(loading));
  status.textContent = loading ? "Loading Host invitations..." : "Select Refresh to review Host invitations.";
  syncControls();
}

function renderNativeInvitations(value) {
  nativeInvitations = isNativeInvitationsSnapshot(value) ? value : null;
  nativeInvitationButtons = [];
  nativeInvitationsList.textContent = "";
  const status = byId("native-invitations-status");
  status.setAttribute("aria-busy", "false");
  status.textContent = nativeInvitations ? nativeInvitationStates.get(nativeInvitations.state) : "Unavailable";
  byId("native-invitations-error").hidden = nativeInvitations !== null;
  byId("native-invitations-empty").hidden = !nativeInvitations || nativeInvitations.state !== "available"
    || nativeInvitations.invitations.length !== 0;
  if (!nativeInvitations) { syncControls(); return; }

  for (const invitation of nativeInvitations.invitations) {
    const row = document.createElement("div");
    row.className = "action-row native-invitation-row";
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = safeText(nativeInvitationStatuses.get(invitation.status), "Unavailable", 40);
    const identifier = document.createElement("p");
    identifier.className = "help-text";
    identifier.textContent = `Invitation ${invitation.id}`;
    const metadata = document.createElement("p");
    metadata.className = "help-text";
    metadata.textContent = `${nativeInvitationTargets.get(invitation.target)} · ${invitation.failedAttempts}/${invitation.maxAttempts} failed attempts`;
    const dates = document.createElement("p");
    dates.className = "help-text";
    dates.textContent = `Created ${invitation.createdAt} · Expires ${invitation.expiresAt}`;
    details.append(title, identifier, metadata, dates);
    row.append(details);
    if (invitation.status === "pending" && Date.parse(invitation.expiresAt) > Date.now()) {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "button secondary";
      revoke.textContent = "Revoke";
      revoke.addEventListener("click", () => void revokeNativeInvitation(invitation.id));
      nativeInvitationButtons.push(revoke);
      row.append(revoke);
    }
    nativeInvitationsList.append(row);
  }
  syncControls();
}

async function loadNativeInvitations() {
  if (nativeInvitationsLoading || pending.size > 0 || quitPending || currentStatus?.canManageHost !== true) return;
  nativeInvitationsLoading = true;
  const request = ++nativeInvitationsRequest;
  clearNativeInvitations({ loading: true });
  syncControls();
  try {
    const api = window.spsCoreSettings;
    if (typeof api?.listNativeInvitations !== "function") throw new Error("Unavailable");
    const result = await api.listNativeInvitations();
    if (!isNativeInvitationsSnapshot(result)) throw new Error("Invalid snapshot");
    if (request !== nativeInvitationsRequest) return;
    renderNativeInvitations(result);
  } catch {
    if (request === nativeInvitationsRequest) renderNativeInvitations(null);
  } finally {
    if (request === nativeInvitationsRequest) nativeInvitationsLoading = false;
    syncControls();
  }
}

async function revokeNativeInvitation(invitationId) {
  if (statusLoading || nativeInvitationsLoading || pending.size > 0 || quitPending || !currentStatus
    || currentStatus.canManageHost !== true || nativeInvitations?.state !== "available") return;
  const invitation = nativeInvitations.invitations.find(item => item.id === invitationId);
  if (!invitation || invitation.status !== "pending" || Date.parse(invitation.expiresAt) <= Date.now()) return;
  if (typeof window.spsCoreSettings?.revokeNativeInvitation !== "function") {
    setNotice("Native invitation management is unavailable.", true);
    return;
  }
  pending.add("native-invitation-revoke");
  const request = nativeInvitationsRequest;
  setNotice();
  syncControls();
  try {
    const result = await window.spsCoreSettings.revokeNativeInvitation({ invitationId });
    if (request !== nativeInvitationsRequest || currentStatus?.canManageHost !== true) return;
    if (result?.cancelled === true) return;
    if (!isNativeInvitationsSnapshot(result)) throw new Error("Invalid snapshot");
    renderNativeInvitations(result);
    setNotice("Host invitation list updated.");
  } catch {
    if (request === nativeInvitationsRequest) setNotice("The Native invitation action could not complete. Diagnostic details are hidden.", true);
  } finally {
    pending.delete("native-invitation-revoke");
    syncControls();
  }
}

function renderNativeDevices(value) {
  nativeDevices = isNativeDevicesSnapshot(value) ? value : null;
  nativeDeviceButtons = [];
  nativeDevicesList.textContent = "";
  const status = byId("native-devices-status");
  status.setAttribute("aria-busy", "false");
  status.textContent = nativeDevices ? nativeDeviceStates.get(nativeDevices.state) : "Unavailable";
  byId("native-devices-error").hidden = nativeDevices !== null;
  byId("native-devices-empty").hidden = !nativeDevices || nativeDevices.state !== "available" || nativeDevices.devices.length !== 0;

  if (!nativeDevices) {
    syncControls();
    return;
  }

  for (const device of nativeDevices.devices) {
    const row = document.createElement("div");
    row.className = "action-row";
    const details = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = safeText(device.displayName, "Unnamed device", 120);
    const state = document.createElement("p");
    state.className = "help-text";
    state.textContent = `${nativeDeviceStatuses.get(device.status)} · Revision ${device.revision}`;
    const fingerprint = document.createElement("p");
    fingerprint.className = "help-text";
    fingerprint.textContent = `Certificate SHA-256: ${device.certificateSha256}`;
    const expiry = document.createElement("p");
    expiry.className = "help-text";
    expiry.textContent = `Certificate expires: ${device.certificateNotAfter}`;
    details.append(title, state, fingerprint, expiry);
    row.append(details);

    if (device.status === "pending") {
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "button secondary";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => void runNativeDeviceAction("approve", device.id));
      nativeDeviceButtons.push(approve);
      row.append(approve);
    }
    if (device.status !== "revoked") {
      const revoke = document.createElement("button");
      revoke.type = "button";
      revoke.className = "button secondary";
      revoke.textContent = "Revoke";
      revoke.addEventListener("click", () => void runNativeDeviceAction("revoke", device.id));
      nativeDeviceButtons.push(revoke);
      row.append(revoke);
    }
    nativeDevicesList.append(row);
  }
  syncControls();
}

async function loadNativeDevices() {
  if (nativeDevicesLoading || pending.size > 0 || quitPending) return;
  nativeDevicesLoading = true;
  const request = ++nativeDevicesRequest;
  clearNativeDevices({ loading: true });
  syncControls();
  try {
    const api = window.spsCoreSettings;
    if (typeof api?.listNativeDevices !== "function") throw new Error("Unavailable");
    const snapshot = await api.listNativeDevices();
    if (!isNativeDevicesSnapshot(snapshot)) throw new Error("Invalid snapshot");
    if (request !== nativeDevicesRequest) return;
    renderNativeDevices(snapshot);
  } catch {
    if (request === nativeDevicesRequest) renderNativeDevices(null);
  } finally {
    if (request === nativeDevicesRequest) nativeDevicesLoading = false;
    syncControls();
  }
}

async function runNativeDeviceAction(action, deviceId) {
  if (statusLoading || nativeDevicesLoading || pending.size > 0 || quitPending || !currentStatus
    || currentStatus.canManageHost !== true || nativeDevices?.state !== "available") return;
  const device = nativeDevices.devices.find(item => item.id === deviceId);
  if (!device || (action === "approve" && device.status !== "pending")
    || (action === "revoke" && device.status === "revoked")) return;
  const method = action === "approve" ? "approveNativeDevice" : action === "revoke" ? "revokeNativeDevice" : null;
  if (!method || typeof window.spsCoreSettings?.[method] !== "function") {
    setNotice("Native device management is unavailable.", true);
    return;
  }

  const operation = `native-device-${action}`;
  pending.add(operation);
  setNotice();
  syncControls();
  try {
    const snapshot = await window.spsCoreSettings[method]({ deviceId });
    if (!isNativeDevicesSnapshot(snapshot)) throw new Error("Invalid snapshot");
    renderNativeDevices(snapshot);
    setNotice("Native device list updated.");
  } catch {
    setNotice("The Native device action could not complete. Diagnostic details are hidden.", true);
  } finally {
    pending.delete(operation);
    syncControls();
  }
}

function renderNativeConnectivity(value) {
  nativeConnectivity = isNativeConnectivity(value) ? value : null;
  byId("native-identity-state").textContent = nativeConnectivity
    ? nativeIdentityStates.get(nativeConnectivity.state)
    : "Unavailable";

  const details = [
    ["native-fingerprint-row", "native-fingerprint", nativeConnectivity?.serverSpkiSha256],
    ["native-server-expiry-row", "native-server-expiry", isEpochMilliseconds(nativeConnectivity?.serverNotAfter)
      ? new Date(nativeConnectivity.serverNotAfter).toISOString()
      : null],
    ["native-issuer-expiry-row", "native-issuer-expiry", isEpochMilliseconds(nativeConnectivity?.memberIssuerNotAfter)
      ? new Date(nativeConnectivity.memberIssuerNotAfter).toISOString()
      : null],
  ];
  for (const [rowId, valueId, text] of details) {
    const row = byId(rowId);
    row.hidden = typeof text !== "string";
    byId(valueId).textContent = typeof text === "string" ? text : "";
  }
}

function renderStatus(status) {
  currentStatus = status;
  if (status.canManageHost !== true) clearNativeInvitations({ invalidateRequest: true });
  const { host, recovery } = status;
  renderNativeConnectivity(status.nativeConnectivity);
  byId("host-state").textContent = host.startupDeferred ? "Startup deferred (recovery)" : safeText(host.state);
  byId("desktop-state-error").hidden = status.desktopStateAvailable !== false;
  byId("app-version").textContent = safeText(status.appVersion);
  const listener = nativeListenerStatus(status.nativeListener);
  byId("native-listener-state").textContent = listener?.state === "listening"
    ? `Registration listening · ${listener.bindAddress}:${listener.port}` : listener?.state === "off" ? "Off · not active" : "Unavailable";
  if (status.canManageNativeMember !== true) byId("native-member-result").textContent = "Sign in to manage this computer's registration.";

  const shortcut = status.shortcut;
  if (isRecord(shortcut) && typeof shortcut.registered === "boolean") {
    byId("shortcut-state").textContent = shortcut.registered
      ? `Registered${typeof shortcut.accelerator === "string" && shortcut.accelerator.trim() ? ` · ${safeText(shortcut.accelerator).replace("CommandOrControl", "Ctrl")}` : ""}`
      : "Not registered";
  } else {
    byId("shortcut-state").textContent = "Unavailable";
  }

  const pluginsDisabled = recovery.pluginsDisabled;
  pluginToggle.checked = pluginsDisabled === true;
  byId("plugin-state").textContent = typeof pluginsDisabled === "boolean"
    ? `${pluginsDisabled ? "Disabled" : "Enabled"}${recovery.needsRestart ? " (restart pending)" : " at startup"}`
    : "Unavailable";

  const storageError = hasReportedError(recovery.storageError);
  byId("storage-state").textContent = storageError || status.desktopStateAvailable === false ? "Error reported" : "No error reported";
  byId("host-error").hidden = !hasReportedError(host.lastError);
  byId("storage-error").hidden = !storageError;
  byId("status-details").hidden = false;
  byId("status-region").setAttribute("aria-busy", "false");
  byId("status-message").textContent = "Current local desktop status.";
  retryButton.textContent = "Refresh";
  retryButton.hidden = false;
  syncControls();
}

function showStatusLoading() {
  nativeRegistrationRequest++;
  nativeRegistrationButtons = [];
  clearNativeWorkspaceResults();
  byId("native-registrations-list").textContent = "";
  byId("native-member-invitation").value = "";
  byId("native-member-result").textContent = "Saved credentials are kept. Select a registration to check its current status.";
  currentStatus = null;
  clearNativeInvitations({ invalidateRequest: true });
  renderNativeConnectivity(null);
  statusLoading = true;
  clearNativeDevices({ loading: true, invalidateRequest: true });
  byId("status-region").setAttribute("aria-busy", "true");
  byId("status-details").hidden = true;
  byId("host-error").hidden = true;
  byId("storage-error").hidden = true;
  byId("status-message").textContent = "Loading local host status...";
  retryButton.hidden = true;
  syncControls();
}

async function loadStatus() {
  if (statusLoading || pending.size > 0 || quitPending) return;
  showStatusLoading();
  try {
    const status = await window.spsCoreSettings.getStatus();
    if (!isCoreStatus(status)) throw new Error("Invalid status response");
    renderStatus(status);
    void loadNativeDevices();
    setNotice();
  } catch {
    currentStatus = null;
    renderNativeConnectivity(null);
    clearNativeDevices({ invalidateRequest: true });
    byId("status-region").setAttribute("aria-busy", "false");
    byId("status-message").textContent = "Host status is unavailable. Try again.";
    retryButton.textContent = "Retry";
    retryButton.hidden = false;
    setNotice("Status could not be loaded. Diagnostic details are hidden.", true);
  } finally {
    statusLoading = false;
    syncControls();
  }
}

async function prepareNativeIdentity() {
  if (!currentStatus || statusLoading || pending.size > 0 || quitPending || !nativeConnectivity
    || nativeConnectivity.canPrepare !== true || currentStatus.canManageHost !== true || !nativeAddressInput.value.trim()) return;

  pending.add("prepare-native-identity");
  setNotice();
  syncControls();
  try {
    const status = await window.spsCoreSettings.prepareNativeIdentity({ serverAddress: nativeAddressInput.value.trim() });
    if (!isCoreStatus(status)) throw new Error("Invalid status response");
    renderStatus(status);
    setNotice("Preparation request completed.");
  } catch {
    setNotice("The action failed. Diagnostic details are hidden to protect credentials.", true);
  } finally {
    pending.delete("prepare-native-identity");
    syncControls();
  }
}

async function runAction(name, task, successMessage, { restorePluginToggle = false } = {}) {
  if (!currentStatus || statusLoading || pending.size > 0 || quitPending) return;
  pending.add(name);
  setNotice();
  syncControls();
  try {
    const result = await task();
    if (isCoreStatus(result)) renderStatus(result);
    setNotice(successMessage);
  } catch {
    if (restorePluginToggle && currentStatus) {
      pluginToggle.checked = currentStatus.recovery.pluginsDisabled === true;
    }
    setNotice("The action failed. Diagnostic details are hidden to protect credentials.", true);
  } finally {
    pending.delete(name);
    syncControls();
  }
}

pluginToggle.addEventListener("change", () => {
  const disabled = pluginToggle.checked;
  void runAction(
    "plugins-disabled",
    async () => {
      const status = await window.spsCoreSettings.setPluginsDisabled({ disabled });
      if (!isCoreStatus(status)) throw new Error("Invalid status response");
      return status;
    },
    "Startup setting saved. It applies next time the host starts; restart remains a separate action.",
    { restorePluginToggle: true },
  );
});

for (const button of actionButtons) {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "open-workspace") {
      void runAction(action, () => window.spsCoreSettings.openWorkspace(), "Workspace action completed.");
    } else if (action === "check-updates") {
      void runAction(action, () => window.spsCoreSettings.checkUpdates(), "Update check completed.");
    } else if (action === "restart-host") {
      void runAction(action, () => window.spsCoreSettings.restartHost(), "Host restart request completed.");
    } else if (action === "export-host") {
      void runAction(action, () => window.spsCoreSettings.exportHost(), "Host export action completed.");
    } else if (action === "inspect-transfer") {
      void runAction(action, () => window.spsCoreSettings.inspectTransfer(), "Transfer inspection completed.");
    }
  });
}

retryButton.addEventListener("click", () => void loadStatus());
nativeDevicesRefreshButton.addEventListener("click", () => void loadNativeDevices());
nativeInvitationsRefreshButton.addEventListener("click", () => void loadNativeInvitations());
nativeAddressInput.addEventListener("input", () => syncControls());
nativePrepareButton.addEventListener("click", () => void prepareNativeIdentity());
quitDesktopButton.addEventListener("click", () => void quitDesktop());
byId("native-member-invitation").addEventListener("input", syncControls);
byId("native-member-name").addEventListener("input", syncControls);
byId("register-native-member").addEventListener("click", () => void registerNativeMember());
byId("refresh-native-registrations").addEventListener("click", () => void loadNativeRegistrations());
byId("native-listener-address").addEventListener("input", syncControls);
byId("native-listener-port").addEventListener("input", syncControls);
byId("start-native-listener").addEventListener("click", () => {
  if (byId("start-native-listener").disabled) return;
  void runAction("native-host-listener", () => window.spsCoreSettings.startNativeHostListener({
    bindAddress: byId("native-listener-address").value.trim(), port: Number(byId("native-listener-port").value),
  }), "Registration listener request completed.");
});
byId("stop-native-listener").addEventListener("click", () => {
  if (byId("stop-native-listener").disabled) return;
  void runAction("native-host-listener", () => window.spsCoreSettings.stopNativeHostListener(), "Registration listener stopped.");
});
byId("copy-native-invitation").addEventListener("click", () => {
  if (byId("copy-native-invitation").disabled) return;
  void runAction("native-host-invitation", async () => {
    const result = await window.spsCoreSettings.copyNativeHostInvitation();
    if (result?.cancelled === true) return;
    const value = exactDataRecord(result, ["copied", "expiresAt"]);
    if (!value || value.copied !== true || typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) throw new Error("Invalid invitation result");
    byId("native-member-result").textContent = `Invitation copied. It expires at ${new Date(value.expiresAt).toLocaleString()}. Share it only through a trusted channel.`;
  }, "Invitation request completed.");
});
window.addEventListener("focus", () => {
  // Returning to Settings retires invitation observations even while a local
  // mutation prevents the normal status refresh from starting immediately.
  clearNativeInvitations({ invalidateRequest: true });
  void loadStatus();
});
void loadStatus();

function showNativeMemberObservation(value) {
  const result = exactDataRecord(value, ["hostId", "deviceId", "status"]);
  if (!result || !nativeDeviceIdPattern.test(result.hostId) || !nativeDeviceIdPattern.test(result.deviceId)
    || !nativeDeviceStatuses.has(result.status)) throw new Error("Invalid registration response");
  byId("native-member-result").textContent = `${nativeDeviceStatuses.get(result.status)}. This status does not grant Workspace or execution access.`;
}

async function registerNativeMember() {
  if (byId("register-native-member").disabled) return;
  const input = { invitationCode: byId("native-member-invitation").value.trim(), displayName: byId("native-member-name").value.trim() };
  // Invitations contain a one-use secret; never retain it in the rendered form.
  byId("native-member-invitation").value = "";
  pending.add("native-member");
  syncControls();
  try {
    const value = await window.spsCoreSettings.enrollNativeMember(input);
    if (value?.cancelled === true) byId("native-member-result").textContent = "Registration cancelled.";
    else showNativeMemberObservation(value);
  } catch {
    byId("native-member-result").textContent = "Registration could not complete. Existing credentials were kept. If registration reached the Host, check the saved registration before trying another invitation.";
  } finally {
    input.invitationCode = "";
    pending.delete("native-member");
    syncControls();
  }
}

async function loadNativeRegistrations() {
  if (byId("refresh-native-registrations").disabled) return;
  const request = ++nativeRegistrationRequest;
  clearNativeWorkspaceResults();
  nativeWorkspaceResults = [];
  pending.add("native-member-list");
  syncControls();
  try {
    const entries = await window.spsCoreSettings.listNativeRegistrations();
    if (request !== nativeRegistrationRequest) return;
    if (!Array.isArray(entries) || entries.length > 128) throw new Error("Invalid registrations");
    const ids = new Set();
    for (const entry of entries) {
      const value = exactDataRecord(entry, ["hostId"]);
      if (!value || !nativeDeviceIdPattern.test(value.hostId) || ids.has(value.hostId)) throw new Error("Invalid registration");
      ids.add(value.hostId);
    }
    byId("native-registrations-list").textContent = "";
    nativeRegistrationButtons = [];
    for (const { hostId } of entries) {
      const row = document.createElement("div");
      row.className = "action-row native-registration-row";
      const label = document.createElement("p");
      label.className = "help-text";
      label.textContent = `Host ${hostId}`;
      const button = document.createElement("button");
      button.className = "button secondary";
      button.type = "button";
      button.textContent = "Check registration";
      button.addEventListener("click", () => void checkNativeRegistration(hostId));
      nativeRegistrationButtons.push(button);
      const repair = document.createElement("button");
      repair.className = "button secondary";
      repair.type = "button";
      repair.textContent = "Recover saved credentials";
      repair.addEventListener("click", () => void repairNativeRegistration(hostId));
      nativeRegistrationButtons.push(repair);
      const showWorkspaces = document.createElement("button");
      showWorkspaces.className = "button secondary";
      showWorkspaces.type = "button";
      showWorkspaces.textContent = "Show Workspaces";
      showWorkspaces.addEventListener("click", () => void showNativeMemberWorkspaces(hostId, workspaceResults));
      nativeRegistrationButtons.push(showWorkspaces);
      const actions = document.createElement("div");
      actions.className = "native-registration-actions";
      actions.append(button, repair, showWorkspaces);
      const workspaceResults = document.createElement("div");
      workspaceResults.className = "native-workspace-results";
      workspaceResults.setAttribute("role", "status");
      workspaceResults.setAttribute("aria-live", "polite");
      workspaceResults.setAttribute("aria-busy", "false");
      nativeWorkspaceResults.push(workspaceResults);
      row.append(label, actions, workspaceResults);
      byId("native-registrations-list").append(row);
    }
    byId("native-member-result").textContent = entries.length ? "Select a Host to check its existing registration." : "No saved registrations for this account.";
  } catch {
    if (request === nativeRegistrationRequest) {
      nativeRegistrationButtons = [];
      byId("native-registrations-list").textContent = "";
      byId("native-member-result").textContent = "Saved registrations are unavailable. Existing credentials were kept.";
    }
  } finally { pending.delete("native-member-list"); syncControls(); }
}

function clearNativeWorkspaceResults() {
  for (const result of nativeWorkspaceResults) {
    result.textContent = "";
    result.setAttribute("aria-busy", "false");
  }
}

async function showNativeMemberWorkspaces(hostId, resultRegion) {
  if (pending.size || statusLoading || quitPending || currentStatus?.canManageNativeMember !== true
    || !nativeDeviceIdPattern.test(hostId)) return;
  const request = ++nativeRegistrationRequest;
  const pendingKey = `native-member-workspace-list:${request}`;
  clearNativeWorkspaceResults();
  resultRegion.setAttribute("aria-busy", "true");
  resultRegion.textContent = "Checking saved Workspace membership...";
  pending.add(pendingKey);
  syncControls();
  try {
    const entries = await window.spsCoreSettings.listNativeMemberWorkspaces({ hostId });
    if (request !== nativeRegistrationRequest) return;
    if (!Array.isArray(entries) || entries.length > 200) throw new Error("Invalid Workspaces");
    const ids = new Set();
    const values = entries.map(candidate => {
      const entry = exactDataRecord(candidate, ["id", "name"]);
      if (!entry || typeof entry.id !== "string" || !nativeDeviceIdPattern.test(entry.id) || ids.has(entry.id)
        || typeof entry.name !== "string" || entry.name.length === 0) throw new Error("Invalid Workspace");
      ids.add(entry.id);
      return entry;
    });
    resultRegion.textContent = "";
    if (values.length === 0) {
      resultRegion.textContent = "No available Workspaces for this Host.";
      return;
    }
    for (const value of values) {
      const workspace = document.createElement("p");
      workspace.className = "help-text";
      workspace.textContent = `${value.name} · ${value.id}`;
      resultRegion.append(workspace);
    }
  } catch {
    if (request === nativeRegistrationRequest) resultRegion.textContent = "Saved Workspaces are unavailable. Check the connection and retry.";
  } finally {
    resultRegion.setAttribute("aria-busy", "false");
    pending.delete(pendingKey);
    syncControls();
  }
}

async function checkNativeRegistration(hostId) {
  if (pending.size || statusLoading || quitPending || currentStatus?.canManageNativeMember !== true) return;
  pending.add("native-member");
  syncControls();
  try { showNativeMemberObservation(await window.spsCoreSettings.recoverNativeMember({ hostId })); }
  catch { byId("native-member-result").textContent = "Registration status could not be checked. Existing credentials were kept; no registration was repeated."; }
  finally { pending.delete("native-member"); syncControls(); }
}

async function repairNativeRegistration(hostId) {
  if (pending.size || statusLoading || quitPending || currentStatus?.canManageNativeMember !== true) return;
  pending.add("native-member");
  syncControls();
  try {
    const value = await window.spsCoreSettings.repairNativeMemberStorage({ hostId });
    if (value?.cancelled === true) { byId("native-member-result").textContent = "Local recovery cancelled."; return; }
    const result = exactDataRecord(value, ["hostId", "recovered"]);
    if (!result || result.hostId !== hostId || !Array.isArray(result.recovered) || result.recovered.length > 3
      || result.recovered.some(kind => !["pending", "issued", "target"].includes(kind))) throw new Error("Invalid recovery response");
    byId("native-member-result").textContent = result.recovered.length
      ? "Local recovery completed using the original credentials. Check registration to contact the Host."
      : "No interrupted credential write was found. Existing credentials were kept.";
  } catch { byId("native-member-result").textContent = "Local recovery could not finish. Some interrupted writes may already be repaired. Existing credentials were kept; no new keys were created. You can explicitly retry recovery."; }
  finally { pending.delete("native-member"); syncControls(); }
}

async function quitDesktop() {
  if (pending.size > 0 || quitPending) return;
  quitPending = true;
  setNotice("Closing SPS Desktop...");
  syncControls();
  try {
    await window.spsCoreSettings.quitDesktop();
  } catch {
    quitPending = false;
    setNotice("Could not close SPS Desktop. Try again.", true);
    syncControls();
  }
}

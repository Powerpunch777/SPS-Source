const byId = (id) => document.getElementById(id);
const actionButtons = [...document.querySelectorAll("button[data-action]")];
const pluginToggle = byId("plugins-disabled");
const retryButton = byId("retry-status");
const actionNotice = byId("action-notice");
const nativePrepareButton = byId("prepare-native-identity");
const nativeAddressInput = byId("native-certificate-address");
const pending = new Set();

let currentStatus = null;
let nativeConnectivity = null;
let statusLoading = false;

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

function isCoreStatus(value) {
  return isRecord(value) && isRecord(value.host) && isRecord(value.recovery);
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
  actionNotice.textContent = message;
  actionNotice.classList.toggle("error", isError);
}

function syncControls() {
  const busy = statusLoading || pending.size > 0;
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
  retryButton.disabled = busy;
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
  const { host, recovery } = status;
  renderNativeConnectivity(status.nativeConnectivity);
  byId("host-state").textContent = host.startupDeferred ? "Startup deferred (recovery)" : safeText(host.state);
  byId("desktop-state-error").hidden = status.desktopStateAvailable !== false;
  byId("app-version").textContent = safeText(status.appVersion);

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
  currentStatus = null;
  renderNativeConnectivity(null);
  statusLoading = true;
  byId("status-region").setAttribute("aria-busy", "true");
  byId("status-details").hidden = true;
  byId("host-error").hidden = true;
  byId("storage-error").hidden = true;
  byId("status-message").textContent = "Loading local host status...";
  retryButton.hidden = true;
  syncControls();
}

async function loadStatus() {
  if (statusLoading || pending.size > 0) return;
  showStatusLoading();
  try {
    const status = await window.spsCoreSettings.getStatus();
    if (!isCoreStatus(status)) throw new Error("Invalid status response");
    renderStatus(status);
    setNotice();
  } catch {
    currentStatus = null;
    renderNativeConnectivity(null);
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
  if (!currentStatus || statusLoading || pending.size > 0 || !nativeConnectivity
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
  if (!currentStatus || statusLoading || pending.size > 0) return;
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
nativeAddressInput.addEventListener("input", () => syncControls());
nativePrepareButton.addEventListener("click", () => void prepareNativeIdentity());
window.addEventListener("focus", () => void loadStatus());
void loadStatus();

const byId = (id) => document.getElementById(id);
const actionButtons = [...document.querySelectorAll("button[data-action]")];
const pluginToggle = byId("plugins-disabled");
const retryButton = byId("retry-status");
const actionNotice = byId("action-notice");
const pending = new Set();

let currentStatus = null;
let statusLoading = false;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCoreStatus(value) {
  return isRecord(value) && isRecord(value.host) && isRecord(value.recovery);
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
  for (const button of actionButtons) {
    const ownerAction = ["restart-host", "export-host"].includes(button.dataset.action);
    button.disabled = busy || !currentStatus || (ownerAction && currentStatus.canManageHost === false)
      || (button.dataset.action === "open-workspace" && currentStatus.desktopStateAvailable === false);
  }
  pluginToggle.disabled = busy || currentStatus?.canManageHost === false || typeof currentStatus?.recovery?.pluginsDisabled !== "boolean";
  retryButton.disabled = busy;
}

function renderStatus(status) {
  currentStatus = status;
  const { host, recovery } = status;
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
window.addEventListener("focus", () => void loadStatus());
void loadStatus();

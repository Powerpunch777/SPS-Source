const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;

function versionOf(info) {
  return typeof info?.version === "string" && info.version.trim() ? info.version.trim() : null;
}

function safeErrorMessage() {
  return "SPS could not check for a Desktop update. Your current installation remains unchanged.";
}

export function createSpsUpdateService({
  app,
  updater,
  enabled = app.isPackaged,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  onStatus = () => {},
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let checkTimer = null;
  let status = {
    state: enabled ? "idle" : "disabled",
    currentVersion: app.getVersion(),
    availableVersion: null,
    percent: null,
    message: enabled
      ? "Desktop updates are ready to check."
      : "Desktop updates are available only in an installed SPS release.",
  };

  const publish = (patch) => {
    status = { ...status, ...patch };
    onStatus({ ...status });
    return { ...status };
  };

  const unavailable = () => {
    if (enabled) return null;
    return { ...status };
  };

  if (enabled) {
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on("checking-for-update", () => publish({
      state: "checking",
      availableVersion: null,
      percent: null,
      message: "Checking for an SPS Desktop update...",
    }));
    updater.on("update-available", (info) => publish({
      state: "available",
      availableVersion: versionOf(info),
      percent: null,
      message: "An SPS Desktop update is ready to download.",
    }));
    updater.on("update-not-available", () => publish({
      state: "current",
      availableVersion: null,
      percent: null,
      message: "This SPS Desktop installation is up to date.",
    }));
    updater.on("download-progress", (progress) => publish({
      state: "downloading",
      percent: Number.isFinite(progress?.percent) ? Math.round(progress.percent) : null,
      message: "Downloading the signed SPS Desktop update...",
    }));
    updater.on("update-downloaded", (info) => publish({
      state: "ready",
      availableVersion: versionOf(info) ?? status.availableVersion,
      percent: 100,
      message: "The update is ready. Restart SPS Desktop to install it.",
    }));
    updater.on("error", () => publish({
      state: "error",
      percent: null,
      message: safeErrorMessage(),
    }));
  }

  async function check() {
    if (unavailable()) return unavailable();
    try {
      await updater.checkForUpdates();
    } catch {
      return publish({ state: "error", percent: null, message: safeErrorMessage() });
    }
    return { ...status };
  }

  async function download() {
    if (unavailable()) return unavailable();
    if (status.state !== "available") {
      throw new Error("No SPS Desktop update is ready to download.");
    }
    publish({ state: "downloading", percent: 0, message: "Downloading the signed SPS Desktop update..." });
    try {
      await updater.downloadUpdate();
    } catch {
      return publish({ state: "error", percent: null, message: safeErrorMessage() });
    }
    return { ...status };
  }

  function install() {
    if (unavailable()) return unavailable();
    if (status.state !== "ready") {
      throw new Error("An SPS Desktop update must finish downloading before installation.");
    }
    updater.quitAndInstall();
    return { ...status };
  }

  function start() {
    if (unavailable() || checkTimer) return;
    void check();
    checkTimer = setIntervalFn(() => { void check(); }, checkIntervalMs);
  }

  function stop() {
    if (!checkTimer) return;
    clearIntervalFn(checkTimer);
    checkTimer = null;
  }

  return {
    check,
    download,
    getStatus: () => ({ ...status }),
    install,
    start,
    stop,
  };
}

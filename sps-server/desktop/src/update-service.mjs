const DEFAULT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000;
export const SPS_DESKTOP_UPDATE_POLICY = Object.freeze({
  channel: "latest",
  trust: "official-release",
  automaticDownload: true,
  automaticInstall: true,
  mandatory: false,
});

export function resolveSpsDesktopUpdatePolicy() {
  return { ...SPS_DESKTOP_UPDATE_POLICY };
}

function versionOf(info) {
  return typeof info?.version === "string" && info.version.trim() ? info.version.trim() : null;
}

function versionParts(value) {
  const match = String(value ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return match.slice(1, 4).map((part) => Number.parseInt(part, 10));
}

// Do not delegate this policy decision solely to electron-updater. A stale
// cached release must never be able to replace a newer installed SPS Desktop.
export function isStrictlyNewerSpsDesktopVersion(candidate, current) {
  const candidateParts = versionParts(candidate);
  const currentParts = versionParts(current);
  if (!candidateParts || !currentParts) return false;
  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] !== currentParts[index]) {
      return candidateParts[index] > currentParts[index];
    }
  }
  return false;
}

function safeErrorMessage() {
  return "SPS could not check for a Desktop update. Your current installation remains unchanged.";
}

export function createSpsUpdateService({
  app,
  updater,
  enabled = app.isPackaged,
  policy = SPS_DESKTOP_UPDATE_POLICY,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  onStatus = () => {},
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}) {
  let checkTimer = null;
  let acceptedVersion = null;
  let status = {
    state: enabled ? "idle" : "disabled",
    channel: policy.channel,
    trust: policy.trust,
    mandatory: policy.mandatory,
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
    updater.channel = policy.channel;
    // SPS explicitly accepts a candidate before downloading it. This prevents
    // the updater cache from silently applying an older release on app quit.
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.on("checking-for-update", () => publish({
      state: "checking",
      availableVersion: null,
      percent: null,
      message: "Checking for an SPS Desktop update...",
    }));
    updater.on("update-available", (info) => {
      const candidateVersion = versionOf(info);
      if (!isStrictlyNewerSpsDesktopVersion(candidateVersion, status.currentVersion)) {
        acceptedVersion = null;
        updater.autoInstallOnAppQuit = false;
        publish({
          state: "current",
          availableVersion: null,
          percent: null,
          message: "This SPS Desktop installation is up to date.",
        });
        return;
      }
      acceptedVersion = candidateVersion;
      publish({
        state: "available",
        availableVersion: candidateVersion,
        percent: null,
        message: "A new SPS Desktop update is downloading automatically.",
      });
      if (policy.automaticDownload) void download();
    });
    updater.on("update-not-available", () => {
      acceptedVersion = null;
      updater.autoInstallOnAppQuit = false;
      publish({
        state: "current",
        availableVersion: null,
        percent: null,
        message: "This SPS Desktop installation is up to date.",
      });
    });
    updater.on("download-progress", (progress) => {
      if (!acceptedVersion) return;
      publish({
        state: "downloading",
        percent: Number.isFinite(progress?.percent) ? Math.round(progress.percent) : null,
        message: "Downloading the SPS Desktop update...",
      });
    });
    updater.on("update-downloaded", (info) => {
      const downloadedVersion = versionOf(info) ?? acceptedVersion;
      if (
        !acceptedVersion
        || downloadedVersion !== acceptedVersion
        || !isStrictlyNewerSpsDesktopVersion(downloadedVersion, status.currentVersion)
      ) {
        acceptedVersion = null;
        updater.autoInstallOnAppQuit = false;
        publish({
          state: "current",
          availableVersion: null,
          percent: null,
          message: "This SPS Desktop installation is up to date.",
        });
        return;
      }
      updater.autoInstallOnAppQuit = policy.automaticInstall;
      publish({
        state: "ready",
        availableVersion: downloadedVersion,
        percent: 100,
        message: "The SPS Desktop update is ready and will install automatically when the app closes.",
      });
    });
    updater.on("error", () => publish({
      state: "error",
      percent: null,
      message: safeErrorMessage(),
    }));
  }

  async function check() {
    if (unavailable()) return unavailable();
    if (status.state === "ready" || status.state === "downloading") return { ...status };
    try {
      await updater.checkForUpdates();
    } catch {
      return publish({ state: "error", percent: null, message: safeErrorMessage() });
    }
    return { ...status };
  }

  async function download() {
    if (unavailable()) return unavailable();
    if (
      status.state !== "available"
      || !acceptedVersion
      || !isStrictlyNewerSpsDesktopVersion(acceptedVersion, status.currentVersion)
    ) {
      throw new Error("No SPS Desktop update is ready to download.");
    }
    publish({ state: "downloading", percent: 0, message: "Downloading the SPS Desktop update..." });
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

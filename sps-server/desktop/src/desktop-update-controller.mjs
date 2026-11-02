import { createSpsUpdateService, resolveSpsDesktopUpdatePolicy } from "./update-service.mjs";

function initialStatus(app, message = "Desktop update service is starting.") {
  return {
    state: "initializing",
    channel: "latest",
    trust: "official-release",
    mandatory: false,
    currentVersion: app.getVersion(),
    availableVersion: null,
    percent: null,
    message,
  };
}

export function createSpsDesktopUpdateController({
  app,
  isolatedE2e = false,
  updateQuitEvents = null,
  dialog,
  getMainWindow,
  stopDesktopRuntimeGracefully,
  setQuitting = () => {},
  setShutdownComplete = () => {},
  canInstall = () => true,
  importUpdater = () => import("electron-updater"),
  resolvePolicy = resolveSpsDesktopUpdatePolicy,
}) {
  let updateService = null;
  let desktopAutoUpdater = null;
  let updateInstallPromise = null;
  let suppressInstallFailurePrompt = false;
  let lastPromptedUpdateVersion = null;
  let updateStatus = initialStatus(app);
  let installAttempt = null;
  let pendingUpdateQuitAttempt = null;
  let nativeQuitAttempt = null;

  function failInstallAttempt(attempt) {
    if (!attempt || attempt.recovered) return;
    attempt.failed = true;
    suppressInstallFailurePrompt = true;
    // A provider error cannot prove the concurrent runtime drain has ended.
    if (attempt.draining) return;
    attempt.recovered = true;
    if (attempt.invoking && pendingUpdateQuitAttempt === attempt) pendingUpdateQuitAttempt = null;
    if (installAttempt !== attempt) return;
    if (attempt.ownsShutdown) {
      setShutdownComplete(false);
      setQuitting(false);
      attempt.ownsShutdown = false;
    }
    if (updateInstallPromise === attempt.promise) updateInstallPromise = null;
    installAttempt = null;
  }

  function consumeFailedUpdateQuit() {
    const attempt = nativeQuitAttempt;
    nativeQuitAttempt = null;
    return attempt?.failed === true;
  }

  const publishStatus = (nextStatus) => {
    updateStatus = { ...nextStatus };
    return updateStatus;
  };

  async function initialize() {
    if (updateService) return getStatus();
    if (!app.isPackaged || isolatedE2e) {
      return publishStatus({
        state: "disabled",
        channel: "latest",
        trust: "official-release",
        mandatory: false,
        currentVersion: app.getVersion(),
        availableVersion: null,
        percent: null,
        message: isolatedE2e
          ? "Desktop updates are disabled for this isolated session."
          : "Desktop updates are available only in an installed SPS release.",
      });
    }

    try {
      const updaterModule = await importUpdater();
      // electron-updater is CommonJS. Dynamic ESM import exposes it under default.
      const autoUpdater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater;
      if (!autoUpdater) throw new Error("electron-updater did not expose autoUpdater");
      desktopAutoUpdater = autoUpdater;
      // Recover before the service publishes readiness, without prompting a
      // second install. The native event identifies only updater-owned quits.
      autoUpdater.on("error", () => failInstallAttempt(installAttempt));
      updateQuitEvents?.on("before-quit-for-update", () => {
        nativeQuitAttempt = pendingUpdateQuitAttempt;
        pendingUpdateQuitAttempt = null;
      });
      updateService = createSpsUpdateService({
        app,
        updater: autoUpdater,
        policy: resolvePolicy(),
        onInstallRequested: installDownloaded,
        onStatus: (nextStatus) => {
          publishStatus(nextStatus);
          if (nextStatus.state === "ready") {
            if (suppressInstallFailurePrompt) suppressInstallFailurePrompt = false;
            else void prompt(nextStatus);
          }
        },
      });
      publishStatus(updateService.getStatus());
      updateService.start();
    } catch {
      publishStatus({
        state: "unavailable",
        channel: "latest",
        trust: "official-release",
        mandatory: false,
        currentVersion: app.getVersion(),
        availableVersion: null,
        percent: null,
        message: "Desktop update service is unavailable. Your current installation remains unchanged.",
      });
    }
    return getStatus();
  }

  async function prompt(status = updateStatus, { force = false } = {}) {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const version = status.availableVersion ?? "a newer version";
    const promptKey = `${status.state}:${version}`;
    if (!force && lastPromptedUpdateVersion === promptKey) return;
    lastPromptedUpdateVersion = promptKey;

    if (status.state !== "ready") return;
    const result = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "SPS Desktop update ready",
      message: `SPS Desktop ${version} has been downloaded.`,
      detail: "The update will remain downloaded until you choose Restart and install.",
      buttons: ["Restart and install", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (result.response === 0 && updateService) {
      publishStatus(await updateService.install());
    }
  }

  async function check() {
    const status = await requireService().check();
    publishStatus(status);
    if (status.state === "current") {
      await dialog.showMessageBox(getMainWindow(), {
        type: "info",
        title: "SPS Desktop update",
        message: "This SPS Desktop installation is up to date.",
        buttons: ["OK"],
      });
    } else if (status.state === "ready") {
      await prompt(status, { force: true });
    }
    return getStatus();
  }

  function requireService() {
    if (!updateService) {
      throw new Error("Desktop updates are unavailable in this SPS installation.");
    }
    return updateService;
  }

  async function installDownloaded() {
    if (updateInstallPromise) return updateInstallPromise;
    const updater = desktopAutoUpdater;
    if (!updater) throw new Error("Desktop updates are unavailable in this SPS installation.");
    if (pendingUpdateQuitAttempt?.failed) {
      suppressInstallFailurePrompt = true;
      throw new Error("SPS is finishing a failed update handoff. Retry when it has settled.");
    }

    const attempt = { ownsShutdown: false, failed: false, recovered: false, draining: false, invoking: false, promise: null };
    installAttempt = attempt;
    const installPromise = Promise.resolve().then(async () => {
      // electron-updater launches the NSIS installer before it schedules app.quit().
      // Stop the embedded Owner Host first so the installer never races the
      // asynchronous before-quit shutdown hook.
      try {
        if (attempt.failed || installAttempt !== attempt) throw new Error("Update attempt was superseded.");
        if (!canInstall()) throw new Error("Desktop is already closing.");
        attempt.ownsShutdown = true;
        setQuitting(true);
        attempt.draining = true;
        try { await stopDesktopRuntimeGracefully(); }
        finally { attempt.draining = false; }
        if (attempt.failed || installAttempt !== attempt) throw new Error("Update shutdown was superseded.");
        setShutdownComplete(true);
        // NSIS can report immediate handoff failure as an event while its
        // void quitAndInstall() returns normally. Preserve the retry path.
        pendingUpdateQuitAttempt = attempt;
        attempt.invoking = true;
        try {
          updater.quitAndInstall();
          if (attempt.failed) throw new Error("Update handoff failed.");
        } catch (error) {
          if (pendingUpdateQuitAttempt === attempt) pendingUpdateQuitAttempt = null;
          throw error;
        } finally {
          attempt.invoking = false;
        }
      } catch {
        // A failed drain or updater handoff must leave quit/install retryable.
        // Main owns making these setters reversible; no failure detail crosses
        // this boundary because shutdown errors may contain local paths/tokens.
        failInstallAttempt(attempt);
        suppressInstallFailurePrompt = true;
        throw new Error("SPS could not close safely for the update. The update remains downloaded; retry Restart and install when ready.");
      }
    });
    attempt.promise = installPromise;
    updateInstallPromise = installPromise;
    return installPromise;
  }

  function stop() {
    updateService?.stop();
  }

  function getStatus() {
    return { ...updateStatus };
  }

  return {
    check,
    download: async () => {
      const status = await requireService().download();
      return publishStatus(status);
    },
    getStatus,
    isInstalling: () => updateInstallPromise !== null,
    consumeFailedUpdateQuit,
    initialize,
    install: async () => {
      const status = await requireService().install();
      return publishStatus(status);
    },
    installDownloaded,
    prompt,
    requireService,
    stop,
  };
}

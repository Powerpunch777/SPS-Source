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

  const publishStatus = (nextStatus) => {
    updateStatus = { ...nextStatus };
    return updateStatus;
  };

  async function initialize() {
    if (!app.isPackaged) {
      return publishStatus({
        state: "disabled",
        channel: "latest",
        trust: "official-release",
        mandatory: false,
        currentVersion: app.getVersion(),
        availableVersion: null,
        percent: null,
        message: "Desktop updates are available only in an installed SPS release.",
      });
    }

    try {
      const updaterModule = await importUpdater();
      // electron-updater is CommonJS. Dynamic ESM import exposes it under default.
      const autoUpdater = updaterModule.autoUpdater ?? updaterModule.default?.autoUpdater;
      if (!autoUpdater) throw new Error("electron-updater did not expose autoUpdater");
      desktopAutoUpdater = autoUpdater;
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

    const installPromise = Promise.resolve().then(async () => {
      // electron-updater launches the NSIS installer before it schedules app.quit().
      // Stop the embedded Owner Host first so the installer never races the
      // asynchronous before-quit shutdown hook.
      let ownsShutdown = false;
      try {
        if (!canInstall()) throw new Error("Desktop is already closing.");
        ownsShutdown = true;
        setQuitting(true);
        await stopDesktopRuntimeGracefully();
        setShutdownComplete(true);
        updater.quitAndInstall();
      } catch {
        // A failed drain or updater handoff must leave quit/install retryable.
        // Main owns making these setters reversible; no failure detail crosses
        // this boundary because shutdown errors may contain local paths/tokens.
        if (ownsShutdown) {
          setShutdownComplete(false);
          setQuitting(false);
        }
        if (updateInstallPromise === installPromise) updateInstallPromise = null;
        suppressInstallFailurePrompt = true;
        throw new Error("SPS could not close safely for the update. The update remains downloaded; retry Restart and install when ready.");
      }
    });
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

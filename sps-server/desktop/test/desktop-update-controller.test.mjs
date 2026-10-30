import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createSpsDesktopUpdateController } from "../src/desktop-update-controller.mjs";

function app({ packaged = true } = {}) {
  return {
    isPackaged: packaged,
    getVersion: () => "0.4.112",
  };
}

function updater() {
  const value = new EventEmitter();
  value.channel = null;
  value.autoDownload = null;
  value.autoInstallOnAppQuit = null;
  value.allowDowngrade = null;
  value.allowPrerelease = null;
  value.checkForUpdates = async () => {};
  value.downloadUpdate = async () => {};
  value.quitAndInstallCalls = 0;
  value.quitAndInstall = () => { value.quitAndInstallCalls += 1; };
  return value;
}

test("disables updates before the app is packaged", async () => {
  const controller = createSpsDesktopUpdateController({
    app: app({ packaged: false }),
    dialog: { showMessageBox: async () => ({ response: 1 }) },
    getMainWindow: () => null,
    stopDesktopRuntimeGracefully: async () => {},
    setQuitting: () => {},
    setShutdownComplete: () => {},
  });

  await controller.initialize();

  assert.equal(controller.getStatus().state, "disabled");
  assert.throws(() => controller.requireService(), /updates are unavailable/);
});

test("disables packaged updates for isolated E2E without importing or invoking the updater", async () => {
  const events = [];
  let importCalls = 0;
  const controller = createSpsDesktopUpdateController({
    app: app(),
    isolatedE2e: true,
    dialog: { showMessageBox: async () => { events.push("dialog"); return { response: 0 }; } },
    getMainWindow: () => null,
    stopDesktopRuntimeGracefully: async () => { events.push("stop-runtime"); },
    setQuitting: () => { events.push("set-quitting"); },
    setShutdownComplete: () => { events.push("set-shutdown-complete"); },
    importUpdater: async () => {
      importCalls += 1;
      throw new Error("isolated E2E must not import electron-updater");
    },
  });

  const status = await controller.initialize();
  assert.equal(status.state, "disabled");
  assert.equal(status.currentVersion, "0.4.112");
  assert.equal(status.availableVersion, null);
  assert.match(status.message, /isolated session/);
  assert.deepEqual(controller.getStatus(), status);
  assert.throws(() => controller.requireService(), /updates are unavailable/);
  await assert.rejects(controller.check(), /updates are unavailable/);
  await assert.rejects(controller.download(), /updates are unavailable/);
  await assert.rejects(controller.install(), /updates are unavailable/);
  await assert.rejects(controller.installDownloaded(), /updates are unavailable/);
  await controller.prompt({ state: "disabled", availableVersion: "0.4.113" }, { force: true });

  assert.equal(importCalls, 0);
  assert.equal(controller.isInstalling(), false);
  assert.deepEqual(events, []);
});

test("owns update status and preserves safe install shutdown order", async () => {
  const autoUpdater = updater();
  const events = [];
  let promptResponse = 1;
  let promptOptions = null;
  let mainWindow = { isDestroyed: () => false };
  const controller = createSpsDesktopUpdateController({
    app: app(),
    dialog: {
      showMessageBox: async (_window, options) => {
        promptOptions = options;
        return { response: promptResponse };
      },
    },
    getMainWindow: () => mainWindow,
    stopDesktopRuntimeGracefully: async () => { events.push("stop-runtime"); },
    setQuitting: () => { events.push("set-quitting"); },
    setShutdownComplete: () => { events.push("set-shutdown-complete"); },
    importUpdater: async () => ({ autoUpdater }),
  });

  await controller.initialize();
  autoUpdater.emit("update-available", { version: "0.4.113" });
  autoUpdater.emit("update-downloaded", { version: "0.4.113" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(controller.getStatus().state, "ready");
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  assert.equal(autoUpdater.quitAndInstallCalls, 0);
  assert.deepEqual(events, []);
  assert.deepEqual(promptOptions.buttons, ["Restart and install", "Later"]);
  assert.match(promptOptions.detail, /remain downloaded until you choose Restart and install/);

  promptResponse = 0;
  await controller.prompt(controller.getStatus(), { force: true });
  assert.deepEqual(events, ["set-quitting", "stop-runtime", "set-shutdown-complete"]);
  assert.equal(autoUpdater.quitAndInstallCalls, 1);

  mainWindow = null;
  controller.stop();
});

test("fails closed on shutdown rejection, coalesces concurrent installs, and permits one explicit retry", async () => {
  const autoUpdater = updater();
  const events = [];
  let stopCalls = 0;
  let dialogCalls = 0;
  const controller = createSpsDesktopUpdateController({
    app: app(),
    dialog: {
      showMessageBox: async () => {
        dialogCalls += 1;
        return { response: 1 };
      },
    },
    getMainWindow: () => ({ isDestroyed: () => false }),
    stopDesktopRuntimeGracefully: async () => {
      stopCalls += 1;
      events.push(`stop-${stopCalls}`);
      if (stopCalls === 1) throw new Error("private path or token detail");
    },
    setQuitting: (value = true) => events.push(`quitting-${value}`),
    setShutdownComplete: (value = true) => events.push(`shutdown-${value}`),
    importUpdater: async () => ({ autoUpdater }),
  });

  await controller.initialize();
  autoUpdater.emit("update-available", { version: "0.4.113" });
  autoUpdater.emit("update-downloaded", { version: "0.4.113" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(dialogCalls, 1);

  const firstInstall = controller.install();
  const concurrentInstall = controller.installDownloaded();
  const [failedStatus, concurrentFailure] = await Promise.all([
    firstInstall,
    concurrentInstall.then(() => null, (error) => error),
  ]);
  assert.equal(failedStatus.state, "ready");
  assert.match(failedStatus.message, /update remains downloaded; retry Restart and install/);
  assert.doesNotMatch(failedStatus.message, /private path|token detail/);
  assert.match(concurrentFailure.message, /update remains downloaded; retry Restart and install/);
  assert.doesNotMatch(concurrentFailure.message, /private path|token detail/);
  assert.equal(stopCalls, 1);
  assert.equal(autoUpdater.quitAndInstallCalls, 0);
  assert.deepEqual(events, ["quitting-true", "stop-1", "shutdown-false", "quitting-false"]);

  // A failure must not automatically show the ready prompt again. Retrying is
  // an explicit call and clears the singleflight guard only after rejection.
  await controller.install();
  assert.equal(stopCalls, 2);
  assert.equal(autoUpdater.quitAndInstallCalls, 1);
  assert.deepEqual(events.slice(-3), ["quitting-true", "stop-2", "shutdown-true"]);
  assert.equal(dialogCalls, 1);
  controller.stop();
});

test("exposes the in-flight update drain and never resets shutdown state when admission is denied", async () => {
  const autoUpdater = updater();
  let quitting = false;
  let shutdownComplete = false;
  let stopCalls = 0;
  let rejectStop;
  let dialogCalls = 0;
  const controller = createSpsDesktopUpdateController({
    app: app(),
    dialog: { showMessageBox: async () => { dialogCalls += 1; return { response: 1 }; } },
    getMainWindow: () => null,
    stopDesktopRuntimeGracefully: () => {
      stopCalls += 1;
      return new Promise((_resolve, reject) => { rejectStop = reject; });
    },
    setQuitting: (value = true) => { quitting = value; },
    setShutdownComplete: (value = true) => { shutdownComplete = value; },
    canInstall: () => !quitting,
    importUpdater: async () => ({ autoUpdater }),
  });

  await controller.initialize();
  autoUpdater.emit("update-available", { version: "0.4.113" });
  autoUpdater.emit("update-downloaded", { version: "0.4.113" });
  await new Promise((resolve) => setImmediate(resolve));

  const pendingInstall = controller.install();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(controller.isInstalling(), true);
  assert.equal(quitting, true);
  assert.equal(stopCalls, 1);
  // Main's before-quit guard consults this state and leaves the update-owned
  // drain as the sole cleanup/installer handoff.
  assert.equal(controller.isInstalling(), true);

  rejectStop(new Error("private drain failure"));
  const failed = await pendingInstall;
  assert.equal(failed.state, "ready");
  assert.equal(controller.isInstalling(), false);
  assert.equal(quitting, false);
  assert.equal(shutdownComplete, false);
  assert.equal(autoUpdater.quitAndInstallCalls, 0);

  // If normal quit takes ownership after the update drain failed, a denied
  // update request cannot clear the normal quit's flags or start a second drain.
  quitting = true;
  const denied = await controller.install();
  assert.equal(denied.state, "ready");
  assert.equal(controller.isInstalling(), false);
  assert.equal(stopCalls, 1);
  assert.equal(quitting, true);
  assert.equal(shutdownComplete, false);
  assert.equal(autoUpdater.quitAndInstallCalls, 0);
  assert.equal(dialogCalls, 0);
  controller.stop();
});

test("recovers from a synchronous updater error event and permits an explicit retry", async () => {
  const autoUpdater = updater();
  let quitting = false;
  let shutdownComplete = false;
  let promptCalls = 0;
  autoUpdater.quitAndInstall = () => {
    autoUpdater.quitAndInstallCalls += 1;
    if (autoUpdater.quitAndInstallCalls === 1) {
      autoUpdater.emit("error", new Error("private token/path"));
    }
  };
  const controller = createSpsDesktopUpdateController({
    app: app(),
    dialog: { showMessageBox: async () => { promptCalls++; return { response: 1 }; } },
    getMainWindow: () => ({ isDestroyed: () => false }),
    stopDesktopRuntimeGracefully: async () => {},
    setQuitting: (value) => { quitting = value; },
    setShutdownComplete: (value) => { shutdownComplete = value; },
    importUpdater: async () => ({ autoUpdater }),
  });

  try {
    await controller.initialize();
    autoUpdater.emit("update-available", { version: "0.4.113" });
    autoUpdater.emit("update-downloaded", { version: "0.4.113" });
    await new Promise((resolve) => setImmediate(resolve));

    const failed = await controller.install();
    assert.equal(failed.state, "ready");
    assert.match(failed.message, /update remains downloaded; retry Restart and install/);
    assert.doesNotMatch(failed.message, /private token\/path/);
    assert.equal(controller.isInstalling(), false);
    assert.equal(quitting, false);
    assert.equal(shutdownComplete, false);
    assert.equal(autoUpdater.quitAndInstallCalls, 1);
    assert.equal(promptCalls, 1, "Only the initial downloaded-update prompt may open automatically.");

    const retried = await controller.install();
    assert.equal(retried.state, "installing");
    assert.equal(autoUpdater.quitAndInstallCalls, 2);
    assert.equal(quitting, true);
    assert.equal(shutdownComplete, true);
  } finally {
    controller.stop();
  }
});

test("a later handoff error cancels only its native update quit and permits retry after that quit settles", async () => {
  const autoUpdater = updater();
  const updateQuitEvents = new EventEmitter();
  let quitting = false, shutdownComplete = false, promptCalls = 0;
  const controller = createSpsDesktopUpdateController({
    app: app(), updateQuitEvents,
    dialog: { showMessageBox: async () => { promptCalls++; return { response: 1 }; } },
    getMainWindow: () => ({ isDestroyed: () => false }),
    stopDesktopRuntimeGracefully: async () => {},
    setQuitting: value => { quitting = value; },
    setShutdownComplete: value => { shutdownComplete = value; },
    importUpdater: async () => ({ autoUpdater }),
  });
  try {
    await controller.initialize();
    autoUpdater.emit("update-available", { version: "0.4.113" });
    autoUpdater.emit("update-downloaded", { version: "0.4.113" });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(promptCalls, 1);
    assert.equal((await controller.install()).state, "installing");
    await new Promise(resolve => setImmediate(resolve));
    autoUpdater.emit("error", new Error("private asynchronous installer path"));
    assert.equal(controller.getStatus().state, "ready");
    assert.equal(controller.isInstalling(), false);
    assert.equal(quitting, false);
    assert.equal(shutdownComplete, false);
    assert.equal(promptCalls, 1, "Failure must not prompt another automatic install.");
    assert.equal(controller.consumeFailedUpdateQuit(), false, "An ordinary quit has not been identified as an update quit.");
    await assert.rejects(controller.installDownloaded(), /finishing a failed update handoff/);
    updateQuitEvents.emit("before-quit-for-update");
    assert.equal(controller.consumeFailedUpdateQuit(), true);
    assert.equal(controller.consumeFailedUpdateQuit(), false, "The failed update's quit fence is one-use.");
    assert.equal((await controller.install()).state, "installing");
    updateQuitEvents.emit("before-quit-for-update");
    assert.equal(controller.consumeFailedUpdateQuit(), false, "A later successful attempt can quit.");
    assert.equal(quitting, true);
    assert.equal(shutdownComplete, true);
  } finally { controller.stop(); }
});

test("an error during an awaited drain cannot revive the old installer continuation", async () => {
  const autoUpdater = updater();
  let release;
  const controller = createSpsDesktopUpdateController({
    app: app(), getMainWindow: () => null, dialog: {},
    stopDesktopRuntimeGracefully: () => new Promise(resolve => { release = resolve; }),
    importUpdater: async () => ({ autoUpdater }),
  });
  try {
    await controller.initialize();
    autoUpdater.emit("update-available", { version: "0.4.113" });
    autoUpdater.emit("update-downloaded", { version: "0.4.113" });
    const install = controller.install();
    await new Promise(resolve => setImmediate(resolve));
    autoUpdater.emit("error", new Error("private updater failure"));
    assert.equal(controller.isInstalling(), true, "The in-flight runtime drain still owns shutdown.");
    const duplicate = controller.installDownloaded().then(() => null, error => error);
    release();
    assert.equal((await install).state, "ready");
    assert.match((await duplicate).message, /could not close safely/);
    assert.equal(autoUpdater.quitAndInstallCalls, 0);
    assert.equal(controller.isInstalling(), false);
  } finally { controller.stop(); }
});

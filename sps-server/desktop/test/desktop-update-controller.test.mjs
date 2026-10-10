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

test("owns update status and preserves safe install shutdown order", async () => {
  const autoUpdater = updater();
  const events = [];
  let mainWindow = { isDestroyed: () => false };
  const controller = createSpsDesktopUpdateController({
    app: app(),
    dialog: { showMessageBox: async () => ({ response: 1 }) },
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
  await controller.installDownloaded();
  assert.deepEqual(events, ["set-quitting", "stop-runtime", "set-shutdown-complete"]);
  assert.equal(autoUpdater.quitAndInstallCalls, 1);

  mainWindow = null;
  controller.stop();
});

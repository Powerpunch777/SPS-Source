import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";
import { createSpsDesktopUpdateController } from "../src/desktop-update-controller.mjs";

const require = createRequire(import.meta.url);
const { NsisUpdater } = require("electron-updater/out/NsisUpdater.js");

test("the pinned NSIS updater's event-only missing-cache failure does not strand Desktop shutdown", async () => {
  const native = new NsisUpdater(null, { version: "0.4.137", isPackaged: true,
    quit() { throw new Error("This fixture must not quit or execute an installer."); } });
  native.logger = null;
  // Readiness is simulated, but the actual quitAndInstall/install failure path
  // is untouched. No provider, network, filesystem or executable is involved.
  native.checkForUpdates = async () => null;
  native.downloadUpdate = async () => [];
  let errors = 0, quitting = false, complete = false;
  native.on("error", () => { errors++; });
  const controller = createSpsDesktopUpdateController({
    app: { isPackaged: true, getVersion: () => "0.4.137" },
    updateQuitEvents: new EventEmitter(),
    dialog: {}, getMainWindow: () => null,
    importUpdater: async () => ({ autoUpdater: native }),
    stopDesktopRuntimeGracefully: async () => {},
    setQuitting: value => { quitting = value; },
    setShutdownComplete: value => { complete = value; },
  });
  try {
    await controller.initialize();
    const listeners = native.listenerCount("error");
    native.emit("update-available", { version: "0.4.138" });
    await new Promise(resolve => setImmediate(resolve));
    native.emit("update-downloaded", { version: "0.4.138" });
    for (let attempt = 1; attempt <= 2; attempt++) {
      const status = await controller.install();
      assert.equal(status.state, "ready");
      assert.equal(errors, attempt);
      assert.equal(controller.isInstalling(), false);
      assert.equal(quitting, false);
      assert.equal(complete, false);
      assert.equal(native.listenerCount("error"), listeners);
      assert.doesNotMatch(status.message, /No update filepath|can't quit and install/);
    }
  } finally { controller.stop(); }
});

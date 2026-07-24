import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import { createSpsUpdateService } from "../src/update-service.mjs";

function createUpdater() {
  const updater = new EventEmitter();
  updater.checkCalls = 0;
  updater.downloadCalls = 0;
  updater.installCalls = 0;
  updater.checkForUpdates = async () => { updater.checkCalls += 1; };
  updater.downloadUpdate = async () => { updater.downloadCalls += 1; };
  updater.quitAndInstall = () => { updater.installCalls += 1; };
  return updater;
}

test("disables updates for an unpackaged SPS Desktop development run", async () => {
  const updater = createUpdater();
  const service = createSpsUpdateService({
    app: { isPackaged: false, getVersion: () => "0.1.0" },
    updater,
  });

  assert.equal(service.getStatus().state, "disabled");
  await service.check();
  assert.equal(updater.checkCalls, 0);
});

test("discovers a Beta update automatically but requires the user to download and install it", async () => {
  const updater = createUpdater();
  const service = createSpsUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    updater,
  });
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowPrerelease, true);

  await service.check();
  assert.equal(updater.checkCalls, 1);
  assert.equal(service.getStatus().state, "idle");

  updater.emit("update-available", { version: "0.2.0" });
  assert.deepEqual(service.getStatus(), {
    state: "available",
    channel: "beta",
    trust: "unsigned-beta",
    mandatory: false,
    currentVersion: "0.1.0",
    availableVersion: "0.2.0",
    percent: null,
    message: "A new SPS Desktop Beta update is ready to download.",
  });

  await service.download();
  updater.emit("download-progress", { percent: 53.8 });
  assert.equal(service.getStatus().percent, 54);
  updater.emit("update-downloaded", { version: "0.2.0" });
  assert.equal(service.getStatus().state, "ready");
  assert.equal(service.getStatus().message, "The Beta update is ready. Restart SPS Desktop when you are ready to install it.");

  service.install();
  assert.equal(updater.installCalls, 1);
});

test("does not expose updater errors and does not install before a download completes", async () => {
  const updater = createUpdater();
  const service = createSpsUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    updater,
  });

  assert.throws(() => service.install(), /must finish downloading/);
  updater.emit("error", new Error("https://token.example.invalid/private"));
  assert.equal(service.getStatus().state, "error");
  assert.doesNotMatch(service.getStatus().message, /token|private/i);
});

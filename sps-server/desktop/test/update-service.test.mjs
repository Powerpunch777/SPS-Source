import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createSpsUpdateService,
  isStrictlyNewerSpsDesktopVersion,
  resolveSpsDesktopUpdatePolicy,
} from "../src/update-service.mjs";

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

test("downloads an SPS Desktop update automatically but installs only on explicit request", async () => {
  const updater = createUpdater();
  const service = createSpsUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    updater,
  });
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.allowDowngrade, false);
  assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.channel, "latest");

  await service.check();
  assert.equal(updater.checkCalls, 1);
  assert.equal(service.getStatus().state, "idle");

  updater.emit("update-available", { version: "0.2.0" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(service.getStatus(), {
    state: "downloading",
    channel: "latest",
    trust: "official-release",
    mandatory: false,
    currentVersion: "0.1.0",
    availableVersion: "0.2.0",
    percent: 0,
    message: "Downloading the SPS Desktop update...",
  });
  assert.equal(updater.downloadCalls, 1);

  updater.emit("download-progress", { percent: 53.8 });
  assert.equal(service.getStatus().percent, 54);
  updater.emit("update-downloaded", { version: "0.2.0" });
  assert.equal(service.getStatus().state, "ready");
  assert.equal(service.getStatus().message, "The SPS Desktop update is ready to install when you choose to restart.");
  assert.equal(updater.autoInstallOnAppQuit, false);

  // Quitting the app must not arm installation; installation remains an explicit action.
  await service.install();
  assert.equal(updater.installCalls, 1);
});

test("delegates a restart install to the Desktop shutdown coordinator", async () => {
  const updater = createUpdater();
  let coordinatedInstallCalls = 0;
  const service = createSpsUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    updater,
    onInstallRequested: async () => { coordinatedInstallCalls += 1; },
  });

  updater.emit("update-available", { version: "0.2.0" });
  await new Promise((resolve) => setImmediate(resolve));
  updater.emit("update-downloaded", { version: "0.2.0" });

  await service.install();
  assert.equal(coordinatedInstallCalls, 1);
  assert.equal(updater.installCalls, 0);
  assert.equal(service.getStatus().state, "installing");
});

test("uses the same stable update channel for every SPS Desktop role", () => {
  const updater = createUpdater();
  const policy = resolveSpsDesktopUpdatePolicy();
  const service = createSpsUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    updater,
    policy,
  });

  assert.equal(policy.automaticDownload, true);
  assert.equal(policy.automaticInstall, false);
  assert.equal(updater.channel, "latest");
  assert.equal(updater.allowPrerelease, false);
  assert.equal(service.getStatus().channel, "latest");
  assert.equal(service.getStatus().trust, "official-release");
});

test("rejects stale or malformed releases before download and auto-install", async () => {
  const updater = createUpdater();
  const service = createSpsUpdateService({
    app: { isPackaged: true, getVersion: () => "0.4.80" },
    updater,
  });

  updater.emit("update-available", { version: "0.4.49" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.getStatus().state, "current");
  assert.equal(updater.downloadCalls, 0);
  assert.equal(updater.autoInstallOnAppQuit, false);

  updater.emit("update-downloaded", { version: "0.4.49" });
  assert.equal(service.getStatus().state, "current");
  assert.equal(updater.autoInstallOnAppQuit, false);

  updater.emit("update-available", { version: "not-a-version" });
  assert.equal(service.getStatus().state, "current");
  assert.equal(updater.downloadCalls, 0);
});

test("compares SPS release versions strictly", () => {
  assert.equal(isStrictlyNewerSpsDesktopVersion("0.4.80", "0.4.79"), true);
  assert.equal(isStrictlyNewerSpsDesktopVersion("0.4.80", "0.4.80"), false);
  assert.equal(isStrictlyNewerSpsDesktopVersion("0.4.49", "0.4.80"), false);
  assert.equal(isStrictlyNewerSpsDesktopVersion("invalid", "0.4.80"), false);
});

test("does not expose updater errors and does not install before a download completes", async () => {
  const updater = createUpdater();
  const service = createSpsUpdateService({
    app: { isPackaged: true, getVersion: () => "0.1.0" },
    updater,
  });

  await assert.rejects(() => service.install(), /must finish downloading/);
  updater.emit("error", new Error("https://token.example.invalid/private"));
  assert.equal(service.getStatus().state, "error");
  assert.doesNotMatch(service.getStatus().message, /token|private/i);
});

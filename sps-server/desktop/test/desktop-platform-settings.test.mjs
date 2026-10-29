import assert from "node:assert/strict";
import test from "node:test";
import { createSpsDesktopPlatformSettings } from "../src/desktop-platform-settings.mjs";

function createMockElectronApp(overrides = {}) {
  const calls = { protocol: [], readLogin: 0, setLogin: [] };
  const app = {
    setAsDefaultProtocolClient: (...args) => {
      calls.protocol.push(args);
      return "protocol-result";
    },
    getLoginItemSettings: () => {
      calls.readLogin += 1;
      return { openAtLogin: true };
    },
    setLoginItemSettings: (...args) => {
      calls.setLogin.push(args);
    },
    ...overrides,
  };
  return { app, calls };
}

test("isolated E2E settings avoid OS reads and writes", () => {
  const { app, calls } = createMockElectronApp();
  const settings = createSpsDesktopPlatformSettings({ app, isolatedE2e: true });

  assert.equal(settings.registerProtocol(), false);
  assert.equal(settings.readLaunchAtLogin(), false);
  assert.throws(() => settings.setLaunchAtLogin(true), /unavailable in this isolated session/i);
  assert.throws(() => settings.setLaunchAtLogin(false), /unavailable in this isolated session/i);
  assert.deepEqual(calls, { protocol: [], readLogin: 0, setLogin: [] });
});

test("normal settings preserve protocol and launch-at-login behavior", () => {
  const { app, calls } = createMockElectronApp();
  const settings = createSpsDesktopPlatformSettings({ app });

  assert.equal(settings.registerProtocol(), "protocol-result");
  assert.deepEqual(calls.protocol, [["sps"]]);
  assert.equal(settings.readLaunchAtLogin(), true);
  assert.equal(calls.readLogin, 1);

  assert.equal(settings.setLaunchAtLogin(true), true);
  assert.equal(settings.setLaunchAtLogin(false), false);
  assert.deepEqual(calls.setLogin, [
    [{ openAtLogin: true, openAsHidden: true, args: ["--sps-start-hidden"] }],
    [{ openAtLogin: false, openAsHidden: false, args: [] }],
  ]);
});

test("reports an OS launch-at-login setter failure instead of success", () => {
  const setterError = new Error("platform settings unavailable");
  const { app, calls } = createMockElectronApp({
    setLoginItemSettings() {
      calls.setLogin.push(["attempted"]);
      throw setterError;
    },
  });
  const settings = createSpsDesktopPlatformSettings({ app });

  assert.throws(() => settings.setLaunchAtLogin(true), error => error === setterError);
  assert.deepEqual(calls.setLogin, [["attempted"]]);
});

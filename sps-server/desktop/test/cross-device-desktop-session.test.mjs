import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertCrossDeviceBrowserOwnership,
  createCrossDeviceDesktopSession,
  requireCrossDeviceDebugEndpoint,
  requireCrossDeviceIdentityOrigin,
} from "../scripts/cross-device-desktop-session.mjs";

const candidateExecutable = "C:\\fixture\\candidate\\SPS Desktop.exe";
const freshProfile = "C:\\fixture\\host-profile";
const debugPort = 45123;

function ownedCommandLine(overrides = []) {
  return { arguments: [candidateExecutable, `--user-data-dir=${freshProfile}`,
    `--remote-debugging-port=${debugPort}`, "--enable-automation", ...overrides] };
}

test("cross-device Identity is a single explicit fixture loopback origin", () => {
  assert.equal(requireCrossDeviceIdentityOrigin("http://127.0.0.1:45123"), "http://127.0.0.1:45123");
  for (const value of ["https://example.test", "http://localhost:45123", "http://127.0.0.1",
    "http://user:secret@127.0.0.1:45123", "http://127.0.0.1:45123/other", "http://127.0.0.1:45123/?token=secret",
    "http://127.0.0.1:45123/#secret", "not-an-origin"]) {
    assert.throws(() => requireCrossDeviceIdentityOrigin(value));
  }
});

test("cross-device CDP is confined to the exact owned loopback port and target kind", () => {
  const page = "ws://127.0.0.1:45123/devtools/page/0123ABCD-4567";
  const browser = "ws://127.0.0.1:45123/devtools/browser/0123-4567";
  assert.equal(requireCrossDeviceDebugEndpoint(page, 45123, "page"), page);
  assert.equal(requireCrossDeviceDebugEndpoint(browser, 45123, "browser"), browser);
  for (const args of [[page, 45124, "page"], [page, 45123, "browser"], [page, 45123, "unknown"],
    [page, Infinity, "page"], [page.replace("127.0.0.1", "example.test"), 45123, "page"],
    [page.replace("ws:", "wss:"), 45123, "page"], [`${page}?token=secret`, 45123, "page"],
    [page.replace("127.0.0.1", "user:secret@127.0.0.1"), 45123, "page"]]) {
    assert.throws(() => requireCrossDeviceDebugEndpoint(...args));
  }
});

test("CDP browser ownership requires the candidate, fresh profile, and actual debug port", () => {
  assert.equal(assertCrossDeviceBrowserOwnership(ownedCommandLine(), candidateExecutable, freshProfile, debugPort), true);
  for (const args of [
    ownedCommandLine().arguments.map((arg, index) => index === 0 ? "C:\\other\\SPS Desktop.exe" : arg),
    ownedCommandLine(["--user-data-dir=C:\\other\\profile"]).arguments,
    ownedCommandLine(["--remote-debugging-port=45124"]).arguments,
    ownedCommandLine([`--user-data-dir=${freshProfile}`]).arguments,
    ownedCommandLine([`--remote-debugging-port=${debugPort}`]).arguments,
    ownedCommandLine(["--profile-directory=Default"]).arguments,
    ownedCommandLine(["--disk-cache-dir=C:\\other\\cache"]).arguments,
  ]) {
    assert.throws(() => assertCrossDeviceBrowserOwnership({ arguments: args }, candidateExecutable, freshProfile, debugPort), /Cross-device CDP browser/);
  }
  assert.throws(() => assertCrossDeviceBrowserOwnership({ arguments: [candidateExecutable, `--user-data-dir=${freshProfile}`,
    "--remote-debugging-port=45124", "--enable-automation"] }, candidateExecutable, freshProfile, debugPort), /profile or debug port/);
  assert.throws(() => assertCrossDeviceBrowserOwnership({ arguments: [candidateExecutable, `--user-data-dir=${freshProfile}`,
    `--remote-debugging-port=${debugPort}`, "--user-data-dir=C:\\other\\profile"] }, candidateExecutable, freshProfile, debugPort), /profile or debug port/);
});

test("cross-device session rejects a missing role and a non-fixture Identity before candidate I/O", async () => {
  await assert.rejects(createCrossDeviceDesktopSession({ role: "unknown" }), /explicit Windows Host or Runner/);
  if (process.platform === "win32") {
    await assert.rejects(createCrossDeviceDesktopSession({ role: "host", identityOrigin: "https://production.invalid" }),
      /loopback origin/);
  }
});

test("cross-device session keeps native ownership and requires natural zero-exit closure", async () => {
  const source = await readFile(new URL("../scripts/cross-device-desktop-session.mjs", import.meta.url), "utf8");
  assert.match(source, /spawnWindowsJobSupervisor\(/);
  assert.match(source, /await mkdir\(profile\)/);
  assert.match(source, /row\.url === setupUrl/);
  assert.match(source, /Browser\.getBrowserCommandLine/);
  assert.match(source, /assertCrossDeviceBrowserOwnership\(commandLine, executable, profile, port\)/);
  assert.match(source, /"--enable-automation"/);
  assert.match(source, /"--sps-core-settings"/);
  assert.match(source, /document\.readyState === 'complete'[\s\S]*?start-sps-account/);
  assert.match(source, /row\.url === settingsUrl/);
  assert.match(source, /document\.querySelector\('#quit-desktop'\)/);
  assert.doesNotMatch(source, /command\("Browser\.close"/);
  assert.match(source, /assert\.deepEqual\(terminal, \{ type: "exit", activeProcesses: 0, code: 0 \}\)/);
  assert.match(source, /if \(terminationConfirmed\) child = undefined/);
  assert.match(source, /failedChild\.terminateOwnedJob\(\)/);
  assert.match(source, /SPS_DESKTOP_E2E_USER_DATA_DIR: profile/);
  assert.match(source, /assert\.deepEqual\(actual, candidate\.baseline\)/);
  assert.doesNotMatch(source, /taskkill|Stop-Process|Remove-Item|rm\(|unlink\(|GITHUB_ACTIONS|RUNNER_ENVIRONMENT/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertWorkspaceNavigationRetry, isOwnedSocketFailureCode } from "../scripts/workspace-navigation-retry-acceptance.mjs";

const directory = "C:/fixtures/navigation-retry";
const origin = "http://127.0.0.1:4317";

test("owned socket failure accepts only the observed Chromium connection error variants", () => {
  for (const value of [-15, -101, -324]) assert.equal(isOwnedSocketFailureCode(value), true);
  for (const value of [undefined, null, false, 0, 15, -3, -20, -104, -102, NaN, Infinity, "-15", {}, [-15]]) {
    assert.equal(isOwnedSocketFailureCode(value), false);
  }
});

for (const scenario of [
  { name: "absent E2E", e2e: undefined },
  { name: "invalid E2E", e2e: "true" },
  { name: "other actual profile", e2e: "1", actual: "C:/fixtures/other" },
  { name: "other environment profile", e2e: "1", environment: "C:/fixtures/other" },
  { name: "another acceptance owns the control", e2e: "1", active: true },
]) {
  test(`native retry acceptance refuses ${scenario.name} without window or session mutation`, async () => {
    const saved = [process.env.SPS_DESKTOP_E2E, process.env.SPS_DESKTOP_E2E_USER_DATA_DIR,
      globalThis.__spsNavigationRetryAcceptance];
    const touched = [];
    const foreign = { token: "other-acceptance", retained: true };
    if (scenario.e2e === undefined) delete process.env.SPS_DESKTOP_E2E;
    else process.env.SPS_DESKTOP_E2E = scenario.e2e;
    process.env.SPS_DESKTOP_E2E_USER_DATA_DIR = scenario.environment ?? directory;
    if (scenario.active) globalThis.__spsNavigationRetryAcceptance = foreign;
    const app = { async evaluate(callback, argument) {
      return callback({ app: { getPath: () => scenario.actual ?? directory,
        on: () => touched.push("on"), off: () => touched.push("off") },
      BrowserWindow: { getAllWindows: () => { touched.push("windows"); throw new Error("Unexpected window access."); } },
      session: { get defaultSession() { touched.push("session"); throw new Error("Unexpected session access."); } } }, argument);
    } };
    try {
      await assert.rejects(assertWorkspaceNavigationRetry({ app,
        setup: { evaluate: async () => ({ desktopAccount: { signedIn: true, pending: false }, profile: { hubUrl: origin } }) },
        expectedUserData: directory, expectedWorkspaceOrigin: origin,
      }), scenario.active ? /already active/ : /requires its exact isolated Main profile/);
      assert.deepEqual(touched, []);
      if (scenario.active) assert.equal(globalThis.__spsNavigationRetryAcceptance, foreign);
    } finally {
      for (const [name, value] of [["SPS_DESKTOP_E2E", saved[0]], ["SPS_DESKTOP_E2E_USER_DATA_DIR", saved[1]]]) {
        if (value === undefined) delete process.env[name]; else process.env[name] = value;
      }
      if (saved[2] === undefined) delete globalThis.__spsNavigationRetryAcceptance;
      else globalThis.__spsNavigationRetryAcceptance = saved[2];
    }
  });
}

test("native retry retains the real loadURL promise and socket failure rather than inventing a rejection", async () => {
  const helper = await readFile(new URL("../scripts/workspace-navigation-retry-acceptance.mjs", import.meta.url), "utf8");
  assert.match(helper, /createServer\(socket => socket\.destroy\(\)\)/);
  assert.match(helper, /failingServer\.listen\(0, "127\.0\.0\.1", resolve\)/);
  assert.match(helper, /return control\.original\.call\(this, failingUrl, \.\.\.args\)/);
  assert.match(helper, /on\("did-fail-load", listener\)/);
  assert.match(helper, /control\.token !== token/);
  assert.match(helper, /failingServer\.close\(/);
  assert.doesNotMatch(helper, /Promise\.reject|throw new Error\("(?:mock|fake|navigation failed)/i);
});

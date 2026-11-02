import assert from "node:assert/strict";
import { test } from "node:test";

import { assertWorkspaceOpenAccountFence } from "../scripts/workspace-open-account-fence-acceptance.mjs";

const expectedUserData = "C:/fixtures/sps-main-profile";
const expectedWorkspaceOrigin = "http://127.0.0.1:4317";

const rejected = "Account fence acceptance requires its exact isolated Main profile.";

for (const scenario of [
  { name: "SPS_DESKTOP_E2E is absent", e2e: undefined },
  { name: "SPS_DESKTOP_E2E is not 1", e2e: "true" },
  { name: "actual app userData differs from the fixture", e2e: "1", actualUserData: "C:/fixtures/other-profile" },
  { name: "E2E userData environment path differs from the fixture", e2e: "1", e2eUserData: "C:/fixtures/other-profile" },
]) {
  test(`rejects before touching BrowserWindow when ${scenario.name}`, async () => {
    const previousE2e = process.env.SPS_DESKTOP_E2E;
    const previousUserData = process.env.SPS_DESKTOP_E2E_USER_DATA_DIR;
    const browserWindowAccesses = [];
    const dialogListeners = new Set();
    const fixtureStatus = {
      desktopAccount: { signedIn: true, pending: false, email: "fixture@example.test" },
      profile: { hubUrl: `${expectedWorkspaceOrigin}/` },
    };
    const app = {
      context() {
        return {
          on(event, listener) {
            assert.equal(event, "dialog");
            dialogListeners.add(listener);
          },
          off(event, listener) {
            assert.equal(event, "dialog");
            dialogListeners.delete(listener);
          },
        };
      },
      async evaluate(callback, argument) {
        const fakeApp = { getPath: name => {
          assert.equal(name, "userData");
          return scenario.actualUserData ?? expectedUserData;
        } };
        const BrowserWindow = {
          getAllWindows() {
            browserWindowAccesses.push("getAllWindows");
            throw new Error("BrowserWindow must not be accessed before the account fence passes.");
          },
        };
        if (argument === undefined) return callback({ BrowserWindow });
        return callback({ app: fakeApp, BrowserWindow }, argument);
      },
    };
    const setup = {
      async evaluate() {
        return fixtureStatus;
      },
    };

    if (scenario.e2e === undefined) delete process.env.SPS_DESKTOP_E2E;
    else process.env.SPS_DESKTOP_E2E = scenario.e2e;
    process.env.SPS_DESKTOP_E2E_USER_DATA_DIR = scenario.e2eUserData ?? expectedUserData;

    try {
      await assert.rejects(assertWorkspaceOpenAccountFence({
        app,
        setup,
        identityOrigin: "http://127.0.0.1:4318",
        signIn: async () => assert.fail("sign-in must not run after setup rejection"),
        waitFor: async () => assert.fail("waitFor must not run after setup rejection"),
        api: async () => assert.fail("API must not run after setup rejection"),
        company: { id: "company" },
        project: { id: "project", name: "Fixture project" },
        expectedUserData,
        expectedWorkspaceOrigin,
      }), error => error.message === rejected);
      assert.deepEqual(browserWindowAccesses, []);
      assert.equal(dialogListeners.size, 0, "failed setup removes its dialog listener");
    } finally {
      if (previousE2e === undefined) delete process.env.SPS_DESKTOP_E2E;
      else process.env.SPS_DESKTOP_E2E = previousE2e;
      if (previousUserData === undefined) delete process.env.SPS_DESKTOP_E2E_USER_DATA_DIR;
      else process.env.SPS_DESKTOP_E2E_USER_DATA_DIR = previousUserData;
    }
  });
}

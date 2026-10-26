import test from "node:test";
import assert from "node:assert/strict";

import { createSpsDesktopAccountController } from "../src/desktop-account-controller.mjs";

function accountValue(overrides = {}) {
  return JSON.stringify({
    subject: "account-1",
    name: "SPS User",
    email: "user@example.test",
    accessToken: "access-old",
    refreshToken: "refresh-old",
    accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    deviceId: "desktop-device-123456",
    identityUrl: "https://identity.example.test",
    ...overrides,
  });
}

function createHarness(overrides = {}) {
  const state = overrides.state ?? {
    encryptedDesktopAccount: null,
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  const calls = {
    persisted: [],
    statusChanges: 0,
    cookieSets: [],
    cookieRemovals: [],
  };
  const cookies = overrides.cookies ?? [];
  let controller;
  const dependencies = {
    app: { getPath: () => "C:\\sps-test" },
    session: {
      defaultSession: {
        cookies: {
          get: async () => cookies,
          set: async (value) => { calls.cookieSets.push(value); },
          remove: async (...value) => { calls.cookieRemovals.push(value); },
        },
      },
    },
    state,
    encrypt: (value) => value,
    decrypt: (value) => value,
    persistState: async (options) => { calls.persisted.push(options ?? null); },
    loadPersistedState: async () => ({ ...state }),
    withRefreshLock: async ({ action }) => await action(),
    refreshIdentity: async () => ({
      accessToken: "access-new",
      refreshToken: "refresh-new",
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    isExpiredRefreshToken: () => false,
    configuredIdentityUrl: () => "https://identity.example.test",
    startIdentitySignIn: async () => ({
      result: Promise.resolve(JSON.parse(accountValue())),
      cancel() {},
    }),
    revokeIdentity: async () => {},
    openExternal: async () => {},
    ensureDesktopDeviceId: () => "desktop-device-123456",
    requireOwnerHostOrigin: (value) => new URL(value).origin,
    requireHubOrigin: (value) => new URL(value).origin,
    normalizeInviteToken: (value) => String(value ?? "").trim().toLowerCase() || null,
    getOwnerHostStatus: () => ({ url: "http://127.0.0.1:31310" }),
    getOwnerHostDesktopAccessToken: () => "desktop-only-token",
    stopNodeScheduling: () => {},
    resetNodeRuntimeStatus: () => {},
    clearActiveConnectionState: () => {},
    disconnectCurrentNode: async () => null,
    rememberCurrentAccountConnection: () => {},
    restoreCurrentAccountConnection: () => {},
    adoptLegacyOwnerHostIfNeeded: async () => {},
    acceptDesktopJoinLink: async () => {},
    getPendingJoin: () => null,
    maybeOpenWorkspaceForCurrentAccount: async () => {},
    showMainWindow: async () => {},
    openSetup: async () => {},
    publicStatus: () => ({ desktopAccount: controller?.getStatus() ?? null }),
    onStatusChanged: () => { calls.statusChanges += 1; },
    ...overrides.dependencies,
  };
  controller = createSpsDesktopAccountController(dependencies);
  return { controller, state, calls };
}

async function flushAccountWork(controller) {
  for (let attempt = 0; attempt < 10 && controller.getStatus().pending; attempt += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test("coalesces concurrent token refreshes and persists the rotated account", async () => {
  let refreshCalls = 0;
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  const { controller, calls } = createHarness({
    state,
    dependencies: {
      refreshIdentity: async () => {
        refreshCalls += 1;
        await refreshGate;
        return {
          accessToken: "access-new",
          refreshToken: "refresh-new",
          accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
      },
    },
  });

  const first = controller.ensureAccessToken();
  const second = controller.ensureAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(refreshCalls, 1);
  releaseRefresh();

  assert.deepEqual(await Promise.all([first, second]), ["access-new", "access-new"]);
  assert.equal(JSON.parse(state.encryptedDesktopAccount).refreshToken, "refresh-new");
  assert.equal(calls.persisted.length, 1);
});

test("adopts a token rotation completed by another Desktop process", async () => {
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  const persistedAccount = accountValue({
    accessToken: "access-from-other-process",
    refreshToken: "refresh-from-other-process",
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  let refreshCalls = 0;
  const { controller } = createHarness({
    state,
    dependencies: {
      loadPersistedState: async () => ({ ...state, encryptedDesktopAccount: persistedAccount }),
      refreshIdentity: async () => {
        refreshCalls += 1;
        return {};
      },
    },
  });

  assert.equal(await controller.ensureAccessToken(), "access-from-other-process");
  assert.equal(refreshCalls, 0);
  assert.equal(state.encryptedDesktopAccount, persistedAccount);
});

test("does not adopt a persisted token rotation from another account", async () => {
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  const otherAccount = accountValue({
    subject: "account-2",
    accessToken: "other-access",
    refreshToken: "other-refresh",
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  let refreshCalls = 0;
  const { controller } = createHarness({
    state,
    dependencies: {
      loadPersistedState: async () => ({ ...state, encryptedDesktopAccount: otherAccount }),
      refreshIdentity: async () => {
        refreshCalls += 1;
        return {
          accessToken: "access-for-current-account",
          refreshToken: "refresh-for-current-account",
          accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
      },
    },
  });

  assert.equal(await controller.ensureAccessToken(), "access-for-current-account");
  assert.equal(refreshCalls, 1);
  assert.equal(JSON.parse(state.encryptedDesktopAccount).subject, "account-1");
});

test("does not let an old refresh overwrite an account signed in after it started", async () => {
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  let releaseRefresh;
  const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
  const { controller, calls } = createHarness({
    state,
    dependencies: {
      refreshIdentity: async () => {
        await refreshGate;
        return {
          accessToken: "stale-refresh-token",
          refreshToken: "stale-rotated-refresh-token",
          accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
      },
    },
  });

  const staleRefresh = controller.ensureAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  await controller.signOut();
  const signIn = await controller.signIn();
  assert.equal(signIn.desktopAccount.pending, true);
  await flushAccountWork(controller);
  const signedInAccount = JSON.parse(state.encryptedDesktopAccount);

  releaseRefresh();
  await assert.rejects(staleRefresh, /account changed during token refresh/);
  assert.deepEqual(JSON.parse(state.encryptedDesktopAccount), signedInAccount);
  assert.equal(JSON.parse(state.encryptedDesktopAccount).accessToken, "access-old");
  assert.equal(calls.persisted.at(-1).rememberActiveConnection, undefined);
  assert.equal(typeof calls.persisted.at(-1).beforeCommit, "function");
});

test("starts a new refresh for a new account session while the old refresh is pending", async () => {
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  let releaseOldRefresh;
  const oldRefreshGate = new Promise((resolve) => { releaseOldRefresh = resolve; });
  let refreshCalls = 0;
  const { controller } = createHarness({
    state,
    dependencies: {
      refreshIdentity: async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) {
          await oldRefreshGate;
          return {
            accessToken: "stale-access",
            refreshToken: "stale-refresh",
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          };
        }
        return {
          accessToken: "new-session-access",
          refreshToken: "new-session-refresh",
          accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        };
      },
    },
  });

  const oldRefresh = controller.ensureAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  await controller.signOut();
  await controller.signIn();
  await flushAccountWork(controller);
  const newRefresh = controller.ensureAccessToken();
  assert.equal(await newRefresh, "new-session-access");
  assert.equal(refreshCalls, 2);
  releaseOldRefresh();
  await assert.rejects(oldRefresh, /account changed during token refresh/);
  assert.equal(JSON.parse(state.encryptedDesktopAccount).accessToken, "new-session-access");
});

test("does not expire a new account when an old refresh reports an expired credential", async () => {
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  let rejectRefresh;
  const refreshGate = new Promise((_, reject) => { rejectRefresh = reject; });
  const { controller } = createHarness({
    state,
    dependencies: {
      refreshIdentity: async () => await refreshGate,
      isExpiredRefreshToken: (error) => error?.message === "expired old credential",
    },
  });

  const staleRefresh = controller.ensureAccessToken();
  await new Promise((resolve) => setImmediate(resolve));
  await controller.signOut();
  await controller.signIn();
  await flushAccountWork(controller);
  const signedInAccount = JSON.parse(state.encryptedDesktopAccount);

  rejectRefresh(new Error("expired old credential"));
  await assert.rejects(staleRefresh, /account changed during token refresh/);
  assert.deepEqual(JSON.parse(state.encryptedDesktopAccount), signedInAccount);
  assert.equal(controller.getStatus().lastAttempt.status, "succeeded");
});

test("expires only the central account while preserving the Member connection", async () => {
  const profile = { connectionKind: "remote", hubUrl: "https://host.example.test" };
  const accountConnections = [{ subject: "account-1", profile }];
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [{ id: "company-1" }],
    projects: [{ id: "project-1" }],
    profile,
    accountConnections,
  };
  const events = [];
  const { controller, calls } = createHarness({
    state,
    dependencies: {
      refreshIdentity: async () => { throw new Error("expired"); },
      isExpiredRefreshToken: () => true,
      clearPendingAuth: () => events.push("clear-auth"),
      stopNodeScheduling: () => events.push("stop-node"),
      resetNodeRuntimeStatus: () => events.push("reset-node"),
    },
  });

  await assert.rejects(controller.ensureAccessToken(), /SPS sign-in expired/);
  assert.equal(state.encryptedDesktopAccount, null);
  assert.deepEqual(state.companies, []);
  assert.deepEqual(state.projects, []);
  assert.equal(state.profile, profile);
  assert.equal(state.accountConnections, accountConnections);
  assert.deepEqual(events, ["clear-auth", "stop-node", "reset-node"]);
  assert.equal(calls.persisted.at(-1).rememberActiveConnection, false);
  assert.equal(typeof calls.persisted.at(-1).beforeCommit, "function");
  assert.equal(controller.getStatus().lastAttempt.status, "failed");
});

test("adds the Desktop access header only for the local Owner Host session", async () => {
  const state = {
    encryptedDesktopAccount: accountValue({
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(null, {
      status: 200,
      headers: { "set-cookie": "sps_identity_session=session%20value; Path=/; HttpOnly" },
    });
  };
  try {
    const { controller, calls } = createHarness({ state });
    await controller.establishCoreSession("http://127.0.0.1:31310");
    await controller.establishCoreSession("https://member.example.test");

    assert.equal(requests[0].options.headers["X-SPS-Desktop-Access"], "desktop-only-token");
    assert.equal(requests[1].options.headers["X-SPS-Desktop-Access"], undefined);
    assert.equal(requests[0].options.headers.origin, "http://127.0.0.1:31310");
    assert.equal(requests[1].options.headers.origin, "https://member.example.test");
    assert.equal(calls.cookieSets[0].value, "session value");
    assert.equal(calls.cookieSets[1].secure, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("finishes sign-in, reports legacy Host adoption errors, and resumes a pending invite", async () => {
  const pendingJoin = { code: "SPS2-code", hub: "https://host.example.test" };
  const events = [];
  const state = {
    encryptedDesktopAccount: null,
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
    legacyOwnerHostAdoptionPending: true,
    ownerHostOwnerSubject: null,
  };
  const { controller } = createHarness({
    state,
    dependencies: {
      restoreCurrentAccountConnection: () => events.push("restore"),
      adoptLegacyOwnerHostIfNeeded: async () => { throw new Error("legacy Host failed"); },
      onLegacyOwnerHostAdoptionError: (error) => events.push(error.message),
      getPendingJoin: () => pendingJoin,
      acceptDesktopJoinLink: async (join) => events.push(join),
      maybeOpenWorkspaceForCurrentAccount: async () => events.push("open-workspace"),
    },
  });

  const initial = await controller.signIn();
  assert.equal(initial.desktopAccount.pending, true);
  await flushAccountWork(controller);

  assert.equal(controller.getStatus().signedIn, true);
  assert.equal(controller.getStatus().lastAttempt.status, "succeeded");
  assert.deepEqual(events, ["restore", "legacy Host failed", pendingJoin]);
  assert.equal(events.includes("open-workspace"), false);
});

test("sign-out revokes the account, disconnects the Node, and clears SPS sessions", async () => {
  const state = {
    encryptedDesktopAccount: accountValue(),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: { connectionKind: "remote" },
  };
  const events = [];
  const { controller, calls } = createHarness({
    state,
    cookies: [{ domain: "host.example.test", path: "/", secure: true }],
    dependencies: {
      revokeIdentity: async () => events.push("revoke"),
      disconnectCurrentNode: async () => {
        events.push("disconnect");
        return { disconnected: true };
      },
      rememberCurrentAccountConnection: () => events.push("remember"),
      clearActiveConnectionState: () => events.push("clear-active"),
      showMainWindow: async () => events.push("show"),
      openSetup: async () => events.push("setup"),
    },
  });

  const result = await controller.signOut();
  assert.equal(state.encryptedDesktopAccount, null);
  assert.deepEqual(result.nodeDisconnect, { disconnected: true });
  assert.deepEqual(events, ["revoke", "disconnect", "remember", "clear-active", "show", "setup"]);
  assert.deepEqual(calls.persisted.at(-1), { rememberActiveConnection: false });
  assert.deepEqual(calls.cookieRemovals, [["https://host.example.test/", "sps_identity_session"]]);
});

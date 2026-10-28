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

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function activeAccountState(overrides = {}) {
  return {
    encryptedDesktopAccount: accountValue({
      accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      ...overrides,
    }),
    desktopAccountLastAttempt: null,
    companies: [],
    projects: [],
    profile: null,
  };
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
          remove: async (...value) => {
            calls.cookieRemovals.push(value);
            const target = new URL(value[0]);
            for (let index = cookies.length - 1; index >= 0; index -= 1) {
              const cookie = cookies[index];
              if (String(cookie.domain ?? "").replace(/^\./, "") === target.hostname
                && (cookie.path ?? "/") === (target.pathname || "/")) cookies.splice(index, 1);
            }
          },
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

test("exposes a private session epoch that ignores token rotation and advances on sign-out", async () => {
  const { controller } = createHarness({ state: { ...activeAccountState(), encryptedDesktopAccount: accountValue() } });
  const initialEpoch = controller.currentSessionEpoch();
  assert.equal(typeof initialEpoch, "number");
  assert.equal(Object.hasOwn(controller.getStatus(), "currentSessionEpoch"), false);
  assert.equal(await controller.ensureAccessToken(), "access-new");
  assert.equal(controller.currentSessionEpoch(), initialEpoch);
  await controller.signOut();
  assert.equal(controller.currentSessionEpoch(), initialEpoch + 1);
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

test("does not post an invite when its session response arrives after the account changed", async () => {
  const state = activeAccountState();
  const sessionRequestStarted = deferred();
  const releaseSessionResponse = deferred();
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    sessionRequestStarted.resolve();
    await releaseSessionResponse.promise;
    return new Response(null, {
      status: 200,
      headers: { "set-cookie": "sps_identity_session=stale-session; Path=/; HttpOnly" },
    });
  };
  try {
    const { controller, calls } = createHarness({
      state,
      dependencies: {
        startIdentitySignIn: async () => ({
          result: Promise.resolve(JSON.parse(accountValue({ subject: "account-2", accessToken: "access-new-account" }))),
          cancel() {},
        }),
      },
    });
    const acceptance = controller.acceptIdentityInvite("https://host.example.test", "SPS2-code");
    const rejected = assert.rejects(acceptance, /account changed while accepting the invitation/);
    await sessionRequestStarted.promise;
    await controller.signIn();
    await flushAccountWork(controller);
    releaseSessionResponse.resolve();
    await rejected;
    assert.equal(requests.length, 1);
    assert.match(requests[0], /\/api\/sps-identity\/session$/);
    assert.deepEqual(calls.cookieSets, []);
    assert.equal(JSON.parse(state.encryptedDesktopAccount).subject, "account-2");
  } finally {
    releaseSessionResponse.resolve();
    globalThis.fetch = originalFetch;
  }
});

test("does not return a late invite result to a replacement account", async () => {
  const state = activeAccountState();
  const inviteRequestStarted = deferred();
  const releaseInviteResponse = deferred();
  let inviteRequests = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/sps-identity/session")) {
      return new Response(null, {
        status: 200,
        headers: { "set-cookie": "sps_identity_session=session-old; Path=/; HttpOnly" },
      });
    }
    inviteRequests += 1;
    inviteRequestStarted.resolve();
    await releaseInviteResponse.promise;
    return new Response(JSON.stringify({ status: "approved", account: "account-1" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  try {
    const { controller } = createHarness({
      state,
      dependencies: {
        startIdentitySignIn: async () => ({
          result: Promise.resolve(JSON.parse(accountValue({ subject: "account-2", accessToken: "access-new-account" }))),
          cancel() {},
        }),
      },
    });
    const acceptance = controller.acceptIdentityInvite("https://host.example.test", "SPS2-code");
    const rejected = assert.rejects(acceptance, /account changed while accepting the invitation/);
    await inviteRequestStarted.promise;
    await controller.signIn();
    await flushAccountWork(controller);
    releaseInviteResponse.resolve();
    await rejected;
    assert.equal(inviteRequests, 1, "an already-started server acceptance is not retried");
    assert.equal(JSON.parse(state.encryptedDesktopAccount).subject, "account-2");
  } finally {
    releaseInviteResponse.resolve();
    globalThis.fetch = originalFetch;
  }
});

test("serializes a stale cookie set, removes only its exact value, then preserves the new account cookie", async () => {
  const state = activeAccountState();
  const firstSetStarted = deferred();
  const releaseFirstSet = deferred();
  const secondSetStarted = deferred();
  const cookieWrites = [];
  const cookieRemovals = [];
  let currentCookies = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Response(null, {
    status: 200,
    headers: { "set-cookie": `sps_identity_session=${options.headers.authorization.includes("access-new-account") ? "session-new" : "session-old"}; Path=/; HttpOnly` },
  });
  try {
    const { controller } = createHarness({
      state,
      dependencies: {
        startIdentitySignIn: async () => ({
          result: Promise.resolve(JSON.parse(accountValue({
            subject: "account-2",
            name: "Second User",
            accessToken: "access-new-account",
            refreshToken: "refresh-new-account",
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          }))),
          cancel() {},
        }),
        session: { defaultSession: { cookies: {
          get: async ({ url } = {}) => url
            ? currentCookies.filter((cookie) => new URL(url).hostname === cookie.domain)
            : [...currentCookies],
          set: async (input) => {
            cookieWrites.push(input);
            if (input.value === "session-old") {
              firstSetStarted.resolve();
              await releaseFirstSet.promise;
            } else if (input.value === "session-new") secondSetStarted.resolve();
            const origin = new URL(input.url);
            currentCookies = [{ domain: origin.hostname, path: "/", secure: origin.protocol === "https:", value: input.value }];
          },
          remove: async (url, name) => {
            cookieRemovals.push([url, name]);
            currentCookies = currentCookies.filter((cookie) => cookie.value !== "session-old");
          },
        } } },
      },
    });
    const oldSession = controller.establishCoreSession("https://host.example.test");
    const oldSessionRejected = assert.rejects(oldSession, /account changed while establishing the server session/);
    await firstSetStarted.promise;

    const staleSignOut = controller.signOut();
    await controller.signIn();
    await flushAccountWork(controller);
    assert.equal(JSON.parse(state.encryptedDesktopAccount).subject, "account-2");
    const newSession = controller.establishCoreSession("https://host.example.test");
    const newSessionResolved = assert.doesNotReject(newSession);

    releaseFirstSet.resolve();
    await oldSessionRejected;
    await staleSignOut;
    await secondSetStarted.promise;
    await newSessionResolved;
    assert.deepEqual(cookieWrites.map((cookie) => cookie.value), ["session-old", "session-new"]);
    assert.deepEqual(cookieRemovals, [["https://host.example.test", "sps_identity_session"]]);
    assert.deepEqual(currentCookies.map((cookie) => cookie.value), ["session-new"]);
    assert.equal(controller.getStatus().signedIn, true);
  } finally {
    releaseFirstSet.resolve();
    globalThis.fetch = originalFetch;
  }
});

test("reports unconfirmed stale-cookie cleanup and still queues the replacement account cookie", async () => {
  const state = activeAccountState();
  const firstSetStarted = deferred();
  const releaseFirstSet = deferred();
  const secondSetStarted = deferred();
  let currentCookies = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => new Response(null, {
    status: 200,
    headers: { "set-cookie": `sps_identity_session=${options.headers.authorization.includes("access-new-account") ? "session-new" : "session-old"}; Path=/; HttpOnly` },
  });
  try {
    const { controller } = createHarness({
      state,
      dependencies: {
        startIdentitySignIn: async () => ({
          result: Promise.resolve(JSON.parse(accountValue({
            subject: "account-2",
            accessToken: "access-new-account",
            refreshToken: "refresh-new-account",
            accessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          }))),
          cancel() {},
        }),
        session: { defaultSession: { cookies: {
          get: async ({ url } = {}) => url
            ? currentCookies.filter((cookie) => new URL(url).hostname === cookie.domain)
            : [...currentCookies],
          set: async (input) => {
            if (input.value === "session-old") {
              firstSetStarted.resolve();
              await releaseFirstSet.promise;
            } else if (input.value === "session-new") secondSetStarted.resolve();
            const origin = new URL(input.url);
            currentCookies = [{ domain: origin.hostname, path: "/", secure: true, value: input.value }];
          },
          remove: async () => { throw new Error("simulated cookie removal failure"); },
        } } },
      },
    });
    const oldSession = controller.establishCoreSession("https://host.example.test");
    const oldSessionRejected = assert.rejects(oldSession, /could not clear a stale server session cookie/);
    await firstSetStarted.promise;
    const staleSignOut = controller.signOut();
    await controller.signIn();
    await flushAccountWork(controller);
    const newSession = controller.establishCoreSession("https://host.example.test");
    const newSessionResolved = assert.doesNotReject(newSession);

    releaseFirstSet.resolve();
    await oldSessionRejected;
    await staleSignOut;
    await secondSetStarted.promise;
    await newSessionResolved;
    assert.deepEqual(currentCookies.map((cookie) => cookie.value), ["session-new"]);
    assert.equal(controller.getStatus().signedIn, true);
  } finally {
    releaseFirstSet.resolve();
    globalThis.fetch = originalFetch;
  }
});

test("does not remove a new session when old sign-out cookie enumeration finishes late", async () => {
  const state = activeAccountState();
  const cookieReadStarted = deferred();
  const releaseCookieRead = deferred();
  const cookieRemovals = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, {
    status: 200,
    headers: { "set-cookie": "sps_identity_session=session-new; Path=/; HttpOnly" },
  });
  try {
    const { controller } = createHarness({
      state,
      cookies: [{ domain: "host.example.test", path: "/", secure: true, value: "session-old" }],
      dependencies: {
        startIdentitySignIn: async () => ({
          result: Promise.resolve(JSON.parse(accountValue({ subject: "account-2", accessToken: "access-new-account" }))),
          cancel() {},
        }),
        session: { defaultSession: { cookies: {
          get: async () => {
            cookieReadStarted.resolve();
            await releaseCookieRead.promise;
            return [{ domain: "host.example.test", path: "/", secure: true, value: "session-old" }];
          },
          set: async () => {},
          remove: async (...args) => { cookieRemovals.push(args); },
        } } },
      },
    });
    const oldSignOut = controller.signOut();
    await cookieReadStarted.promise;
    await controller.signIn();
    await flushAccountWork(controller);
    releaseCookieRead.resolve();
    await oldSignOut;
    assert.deepEqual(cookieRemovals, []);
    assert.equal(JSON.parse(state.encryptedDesktopAccount).subject, "account-2");
    await assert.doesNotReject(controller.establishCoreSession("https://host.example.test"));
  } finally {
    releaseCookieRead.resolve();
    globalThis.fetch = originalFetch;
  }
});

test("a delayed revoke from an old sign-out cannot disconnect or clear a new sign-in", async () => {
  const state = { ...activeAccountState(), profile: { connectionKind: "remote", hubUrl: "https://host.example.test" } };
  const revokeStarted = deferred();
  const releaseRevoke = deferred();
  const events = [];
  const { controller } = createHarness({
    state,
    dependencies: {
      revokeIdentity: async () => { revokeStarted.resolve(); await releaseRevoke.promise; },
      disconnectCurrentNode: async () => { events.push("disconnect"); },
      clearActiveConnectionState: () => events.push("clear-active"),
      startIdentitySignIn: async () => ({
        result: Promise.resolve(JSON.parse(accountValue({ subject: "account-2", accessToken: "access-new-account" }))),
        cancel() {},
      }),
    },
  });
  const oldSignOut = controller.signOut();
  await revokeStarted.promise;
  await controller.signIn();
  await flushAccountWork(controller);
  releaseRevoke.resolve();
  await oldSignOut;
  assert.equal(JSON.parse(state.encryptedDesktopAccount).subject, "account-2");
  assert.deepEqual(events, []);
});

test("a delayed old-node disconnect cannot clear the replacement account", async () => {
  const state = { ...activeAccountState(), profile: { connectionKind: "remote", hubUrl: "https://host.example.test" } };
  const disconnectStarted = deferred();
  const releaseDisconnect = deferred();
  const events = [];
  const { controller } = createHarness({
    state,
    dependencies: {
      disconnectCurrentNode: async ({ assertCurrent }) => {
        assertCurrent();
        disconnectStarted.resolve();
        await releaseDisconnect.promise;
        assertCurrent();
        return { disconnected: true };
      },
      clearActiveConnectionState: () => events.push("clear-active"),
      startIdentitySignIn: async () => ({
        result: Promise.resolve(JSON.parse(accountValue({ subject: "account-2", accessToken: "access-new-account" }))),
        cancel() {},
      }),
    },
  });
  const oldSignOut = controller.signOut();
  await disconnectStarted.promise;
  await controller.signIn();
  await flushAccountWork(controller);
  releaseDisconnect.resolve();
  await oldSignOut;
  assert.equal(JSON.parse(state.encryptedDesktopAccount).subject, "account-2");
  assert.deepEqual(events, []);
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
    cookies: [{ domain: "host.example.test", path: "/", secure: true, value: "existing-session" }],
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
  assert.equal(calls.persisted.at(-1).rememberActiveConnection, false);
  assert.equal(typeof calls.persisted.at(-1).beforeCommit, "function");
  assert.deepEqual(calls.cookieRemovals, [["https://host.example.test/", "sps_identity_session"]]);
});

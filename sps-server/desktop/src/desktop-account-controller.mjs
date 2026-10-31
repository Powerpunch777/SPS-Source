import { spsRequestError, spsRequestTimeoutSignal } from "./desktop-request.mjs";

const ACCOUNT_REFRESH_SKEW_MS = 2 * 60 * 1000;
const ACCOUNT_SESSION_COOKIE = "sps_identity_session";

class StaleAccountSessionError extends Error {
  constructor(message) {
    super(message);
    this.name = "StaleAccountSessionError";
  }
}

function safeAccountError(error) {
  const message = error instanceof Error ? error.message.trim() : String(error ?? "").trim();
  return (message || "SPS sign-in could not finish.").slice(0, 360);
}

function parseEncryptedAccount(encryptedValue, decrypt) {
  if (!encryptedValue) return null;
  try {
    const parsed = JSON.parse(decrypt(encryptedValue));
    if (typeof parsed?.subject !== "string" || typeof parsed?.name !== "string") return null;
    return {
      subject: parsed.subject,
      name: parsed.name,
      email: typeof parsed.email === "string" ? parsed.email : null,
      picture: typeof parsed.picture === "string" ? parsed.picture : null,
      verifiedAt: typeof parsed.verifiedAt === "string" ? parsed.verifiedAt : null,
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      accessTokenExpiresAt: typeof parsed.accessTokenExpiresAt === "string" ? parsed.accessTokenExpiresAt : null,
      deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : null,
      identityUrl: typeof parsed.identityUrl === "string" ? parsed.identityUrl : null,
    };
  } catch {
    return null;
  }
}

function readSetCookieValue(response, cookieName) {
  const setCookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  for (const header of setCookies) {
    const match = String(header).match(new RegExp(`(?:^|,)\\s*${cookieName}=([^;]+)`, "i"));
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

export function createSpsDesktopAccountController({
  app,
  session,
  state,
  encrypt,
  decrypt,
  persistState,
  loadPersistedState,
  withRefreshLock,
  refreshIdentity,
  isExpiredRefreshToken,
  configuredIdentityUrl,
  startIdentitySignIn,
  revokeIdentity,
  openExternal,
  ensureDesktopDeviceId,
  desktopAccessHeader = "X-SPS-Desktop-Access",
  requireOwnerHostOrigin,
  requireHubOrigin,
  normalizeInviteToken,
  getOwnerHostStatus,
  getOwnerHostDesktopAccessToken,
  requestTimeoutMs = 15_000,
  stopNodeScheduling,
  resetNodeRuntimeStatus,
  clearPendingAuth = () => {},
  clearActiveConnectionState,
  disconnectCurrentNode,
  rememberCurrentAccountConnection,
  restoreCurrentAccountConnection,
  adoptLegacyOwnerHostIfNeeded,
  acceptDesktopJoinLink,
  getPendingJoin,
  maybeOpenWorkspaceForCurrentAccount,
  onLegacyOwnerHostAdoptionError = () => {},
  showMainWindow,
  openSetup,
  publicStatus,
  onStatusChanged = () => {},
}) {
  let refreshPromise = null;
  let pendingSignIn = null;
  let accountError = null;
  let cookieMutationQueue = Promise.resolve();
  // Fences asynchronous Identity work when the local account lifecycle moves
  // on, including sign-out/sign-in back to the same account (an ABA change).
  let accountSessionEpoch = 0;

  function currentAccount() {
    return parseEncryptedAccount(state.encryptedDesktopAccount, decrypt);
  }

  function currentAccountSubject() {
    return currentAccount()?.subject ?? null;
  }

  function sameAccountSession(left, right) {
    if (!left || !right) return left === right;
    return Boolean(left && right
      && left.subject === right.subject
      && left.deviceId === right.deviceId
      && (left.identityUrl || configuredIdentityUrl()) === (right.identityUrl || configuredIdentityUrl()));
  }

  function assertAccountSessionCurrent(epoch, account, message = "The SPS account changed during this operation.") {
    if (epoch !== accountSessionEpoch || !sameAccountSession(currentAccount(), account)) throw new StaleAccountSessionError(message);
  }

  function enqueueCookieMutation(action) {
    const operation = cookieMutationQueue.then(action);
    cookieMutationQueue = operation.catch(() => undefined);
    return operation;
  }

  function recordAttempt(status, error = null) {
    state.desktopAccountLastAttempt = {
      status,
      at: new Date().toISOString(),
      error: error ? safeAccountError(error) : null,
    };
  }

  function status() {
    const account = currentAccount();
    return {
      configured: true,
      provider: "SPS Identity",
      identityUrl: configuredIdentityUrl(),
      signedIn: Boolean(account),
      pending: Boolean(pendingSignIn),
      error: accountError,
      name: account?.name ?? null,
      email: account?.email ?? null,
      picture: account?.picture ?? null,
      verifiedAt: account?.verifiedAt ?? null,
      lastAttempt: state.desktopAccountLastAttempt
        ? { ...state.desktopAccountLastAttempt }
        : null,
    };
  }

  function notifyStatus() {
    onStatusChanged();
  }

  async function ensureAccessToken() {
    const account = currentAccount();
    if (!account?.accessToken || !account?.refreshToken || !account?.deviceId) return null;
    const expiresAt = Date.parse(account.accessTokenExpiresAt ?? "");
    if (Number.isFinite(expiresAt) && expiresAt > Date.now() + ACCOUNT_REFRESH_SKEW_MS) {
      return account.accessToken;
    }
    const epoch = accountSessionEpoch;
    if (!refreshPromise || refreshPromise.epoch !== epoch) {
      const isSameAccount = (candidate) => Boolean(candidate
        && candidate.subject === account.subject
        && candidate.deviceId === account.deviceId
        && (candidate.identityUrl || configuredIdentityUrl()) === (account.identityUrl || configuredIdentityUrl()));
      const assertCurrent = () => {
        if (epoch !== accountSessionEpoch || !isSameAccount(currentAccount())) {
          throw new Error("The SPS account changed during token refresh.");
        }
      };
      const pending = { epoch, promise: null };
      pending.promise = (async () => withRefreshLock({
        directory: app.getPath("userData"),
        action: async () => {
          const persistedState = await loadPersistedState();
          assertCurrent();
          const persistedAccount = parseEncryptedAccount(persistedState.encryptedDesktopAccount, decrypt);
          const current = isSameAccount(persistedAccount) && persistedAccount.refreshToken
            && persistedAccount.refreshToken !== account.refreshToken
            ? persistedAccount
            : account;
          const persistedExpiry = Date.parse(current.accessTokenExpiresAt ?? "");
          if (Number.isFinite(persistedExpiry) && persistedExpiry > Date.now() + ACCOUNT_REFRESH_SKEW_MS) {
            assertCurrent();
            state.encryptedDesktopAccount = persistedState.encryptedDesktopAccount;
            return current.accessToken;
          }

          let refreshed;
          try {
            refreshed = await refreshIdentity({
              identityUrl: current.identityUrl || configuredIdentityUrl(),
              refreshToken: current.refreshToken,
              deviceId: current.deviceId,
            });
          } catch (error) {
            // An obsolete refresh must never sign out a newer account or leak
            // its stale provider error to the caller.
            assertCurrent();
            if (isExpiredRefreshToken(error)) {
              accountSessionEpoch += 1;
              state.encryptedDesktopAccount = null;
              state.companies = [];
              state.projects = [];
              clearPendingAuth();
              stopNodeScheduling();
              resetNodeRuntimeStatus();
              recordAttempt("failed", "SPS sign-in expired. Sign in again to continue.");
              const expiryEpoch = accountSessionEpoch;
              await persistState({ rememberActiveConnection: false, beforeCommit: () => {
                if (expiryEpoch !== accountSessionEpoch || currentAccount()) {
                  throw new Error("The SPS account changed during token refresh.");
                }
              } });
              notifyStatus();
              throw new Error("SPS sign-in expired. Sign in again to continue.");
            }
            throw error;
          }
          assertCurrent();
          state.encryptedDesktopAccount = encrypt(JSON.stringify({
            ...current,
            ...refreshed,
            identityUrl: current.identityUrl || configuredIdentityUrl(),
            verifiedAt: current.verifiedAt || new Date().toISOString(),
          }));
          await persistState({ beforeCommit: assertCurrent });
          assertCurrent();
          return refreshed.accessToken;
        },
      }))().finally(() => {
        if (refreshPromise === pending) refreshPromise = null;
      });
      refreshPromise = pending;
    }
    return await refreshPromise.promise;
  }

  async function establishCoreSession(hubOrigin) {
    const epoch = accountSessionEpoch;
    const account = currentAccount();
    const assertCurrent = () => assertAccountSessionCurrent(epoch, account, "The SPS account changed while establishing the server session.");
    const accessToken = await ensureAccessToken();
    assertCurrent();
    if (!accessToken) return null;
    const headers = {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      origin: new URL(hubOrigin).origin,
    };
    const ownerHostStatus = getOwnerHostStatus();
    if (
      ownerHostStatus.url
      && new URL(hubOrigin).origin === requireOwnerHostOrigin(ownerHostStatus.url)
    ) {
      headers[desktopAccessHeader] = getOwnerHostDesktopAccessToken();
    }
    let response;
    try {
      response = await fetch(new URL("/api/sps-identity/session", `${hubOrigin}/`), {
        method: "POST",
        headers,
        signal: spsRequestTimeoutSignal(requestTimeoutMs),
      });
    } catch (error) {
      assertCurrent();
      throw spsRequestError(error, "SPS sign-in session timed out. Sign in again and retry.");
    }
    assertCurrent();
    if (response.status === 404) return null;
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      assertCurrent();
      throw new Error(payload?.error || "SPS Server could not accept the SPS Identity session.");
    }
    const token = readSetCookieValue(response, ACCOUNT_SESSION_COOKIE);
    if (!token) throw new Error("SPS Server did not create a secure SPS Identity session.");
    const target = new URL(hubOrigin);
    return enqueueCookieMutation(async () => {
      assertCurrent();
      const cookieUrl = target.origin;
      try {
        await session.defaultSession.cookies.set({
          url: cookieUrl,
          name: ACCOUNT_SESSION_COOKIE,
          value: token,
          httpOnly: true,
          secure: target.protocol === "https:",
          sameSite: "lax",
          expirationDate: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
        });
      } catch (error) {
        try { assertCurrent(); }
        catch (staleError) {
          await removeOwnedSessionCookie(cookieUrl, token);
          throw staleError;
        }
        throw error;
      }
      try { assertCurrent(); }
      catch (error) {
        // Cookie writes are not cancellable. Remove only this exact value at
        // its origin before a queued newer account session can be written.
        await removeOwnedSessionCookie(cookieUrl, token);
        throw error;
      }
      return token;
    });
  }

  async function removeOwnedSessionCookie(url, value) {
    const cookies = await session.defaultSession.cookies.get({ url, name: ACCOUNT_SESSION_COOKIE });
    const target = new URL(url);
    const ownsCookie = (cookie) => cookie.value === value
      && String(cookie.domain ?? "").replace(/^\./, "") === target.hostname
      && cookie.path === "/"
      && Boolean(cookie.secure) === (target.protocol === "https:");
    if (!cookies.some(ownsCookie)) return;
    try {
      await session.defaultSession.cookies.remove(url, ACCOUNT_SESSION_COOKIE);
    } catch {
      throw new Error("SPS Desktop could not clear a stale server session cookie.");
    }
    const remaining = await session.defaultSession.cookies.get({ url, name: ACCOUNT_SESSION_COOKIE });
    if (remaining.some(ownsCookie)) throw new Error("SPS Desktop could not clear a stale server session cookie.");
  }

  async function clearCoreSessions({ assertCurrent: assertCurrentInput } = {}) {
    const epoch = accountSessionEpoch;
    const account = currentAccount();
    const assertCurrent = () => {
      assertAccountSessionCurrent(epoch, account, "The SPS account changed while clearing server sessions.");
      assertCurrentInput?.();
    };
    return enqueueCookieMutation(async () => {
      assertCurrent();
      const cookies = await session.defaultSession.cookies.get({ name: ACCOUNT_SESSION_COOKIE });
      assertCurrent();
      for (const cookie of cookies) {
        assertCurrent();
        const hostname = String(cookie.domain ?? "").replace(/^\./, "");
        if (!hostname) continue;
        const protocol = cookie.secure ? "https:" : "http:";
        const pathname = String(cookie.path ?? "/").startsWith("/") ? cookie.path : `/${cookie.path}`;
        const url = `${protocol}//${hostname}${pathname}`;
        if (typeof cookie.value !== "string") continue;
        const currentCookies = await session.defaultSession.cookies.get({ url, name: ACCOUNT_SESSION_COOKIE });
        assertCurrent();
        const ownsCookie = (current) => current.value === cookie.value
          && String(current.domain ?? "").replace(/^\./, "") === hostname
          && current.path === cookie.path
          && Boolean(current.secure) === Boolean(cookie.secure);
        if (!currentCookies.some(ownsCookie)) continue;
        try {
          await session.defaultSession.cookies.remove(url, ACCOUNT_SESSION_COOKIE);
        } catch {
          throw new Error("SPS Desktop could not clear a server session cookie.");
        }
        const remaining = await session.defaultSession.cookies.get({ url, name: ACCOUNT_SESSION_COOKIE });
        if (remaining.some(ownsCookie)) throw new Error("SPS Desktop could not clear a server session cookie.");
        assertCurrent();
      }
    });
  }

  async function acceptIdentityInvite(hubUrl, inviteToken) {
    const epoch = accountSessionEpoch;
    const account = currentAccount();
    const assertCurrent = () => assertAccountSessionCurrent(
      epoch,
      account,
      "The SPS account changed while accepting the invitation.",
    );
    let sessionCookie;
    try {
      sessionCookie = await establishCoreSession(hubUrl);
    } catch (error) {
      assertCurrent();
      throw error;
    }
    assertCurrent();
    if (!sessionCookie) return null;
    const normalizedInviteToken = normalizeInviteToken(inviteToken);
    if (!normalizedInviteToken) throw new Error("Enter a valid SPS invitation code.");
    const origin = requireHubOrigin(hubUrl);
    let response;
    try {
      assertCurrent();
      response = await fetch(new URL(`/api/invites/${encodeURIComponent(normalizedInviteToken)}/accept`, `${hubUrl}/`), {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          origin,
          cookie: `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(sessionCookie)}`,
        },
        body: JSON.stringify({ requestType: "human" }),
      });
    } catch (error) {
      assertCurrent();
      throw error;
    }
    assertCurrent();
    const payload = await response.json().catch(() => null);
    assertCurrent();
    if (!response.ok) throw Object.assign(new Error(payload?.error || "SPS Server could not accept this team invitation."), { status: response.status });
    return payload;
  }

  async function startSignIn() {
    if (pendingSignIn) return publicStatus();
    const epoch = ++accountSessionEpoch;
    const identityUrl = configuredIdentityUrl();
    accountError = null;
    recordAttempt("pending");
    await persistState({ beforeCommit: () => {
      if (epoch !== accountSessionEpoch) throw new Error("The SPS account changed during sign-in.");
    } });
    if (epoch !== accountSessionEpoch) return publicStatus();
    let signIn;
    try {
      signIn = await startIdentitySignIn({
        identityUrl,
        deviceId: ensureDesktopDeviceId(),
        openExternal,
      });
    } catch (error) {
      if (epoch !== accountSessionEpoch) return publicStatus();
      accountError = safeAccountError(error);
      recordAttempt("failed", error);
      await persistState();
      notifyStatus();
      throw error;
    }
    if (epoch !== accountSessionEpoch) {
      signIn?.cancel();
      return publicStatus();
    }
    pendingSignIn = signIn;
    notifyStatus();
    void signIn.result.then(async (account) => {
      if (epoch !== accountSessionEpoch || pendingSignIn !== signIn) return;
      state.encryptedDesktopAccount = encrypt(JSON.stringify({
        ...account,
        identityUrl,
        verifiedAt: new Date().toISOString(),
      }));
      if (pendingSignIn === signIn) accountError = null;
      restoreCurrentAccountConnection();
      recordAttempt("succeeded");
      await persistState({ beforeCommit: () => {
        if (epoch !== accountSessionEpoch || pendingSignIn !== signIn) {
          throw new Error("The SPS account changed during sign-in.");
        }
      } });
      if (epoch !== accountSessionEpoch) return;
      if (state.legacyOwnerHostAdoptionPending && !state.ownerHostOwnerSubject) {
        try {
          await adoptLegacyOwnerHostIfNeeded();
        } catch (error) {
          if (epoch !== accountSessionEpoch) return;
          onLegacyOwnerHostAdoptionError(error);
        }
      }
      if (epoch !== accountSessionEpoch) return;
      const pendingJoin = getPendingJoin();
      if (pendingJoin) {
        await acceptDesktopJoinLink(pendingJoin);
        if (epoch !== accountSessionEpoch) return;
      } else {
        await maybeOpenWorkspaceForCurrentAccount();
      }
    }).catch(async (error) => {
      if (epoch !== accountSessionEpoch || pendingSignIn !== signIn) return;
      if (pendingSignIn === signIn) accountError = safeAccountError(error);
      recordAttempt("failed", error);
      await persistState().catch(() => {});
    }).finally(() => {
      if (pendingSignIn === signIn) pendingSignIn = null;
      notifyStatus();
    });
    return publicStatus();
  }

  async function signOut() {
    const epoch = ++accountSessionEpoch;
    const assertCurrent = () => {
      if (epoch !== accountSessionEpoch) throw new Error("The SPS account changed during sign-out.");
    };
    const isStale = () => epoch !== accountSessionEpoch;
    const signIn = pendingSignIn;
    pendingSignIn = null;
    signIn?.cancel();
    accountError = null;
    const account = currentAccount();
    if (account?.refreshToken) {
      try {
        await revokeIdentity({
          identityUrl: account.identityUrl || configuredIdentityUrl(),
          refreshToken: account.refreshToken,
        });
      } catch (error) {
        if (isStale()) return publicStatus();
        throw error;
      }
    }
    if (isStale()) return publicStatus();
    let nodeDisconnect = null;
    if (account && state.profile) {
      try {
        nodeDisconnect = await disconnectCurrentNode({ assertCurrent });
      } catch (error) {
        if (error instanceof StaleAccountSessionError || isStale()) return publicStatus();
        throw error;
      }
      if (isStale()) return publicStatus();
      rememberCurrentAccountConnection();
    }
    try {
      await clearCoreSessions({ assertCurrent });
    } catch (error) {
      if (error instanceof StaleAccountSessionError) return { ...publicStatus(), nodeDisconnect };
      throw error;
    }
    if (isStale()) return { ...publicStatus(), nodeDisconnect };
    clearActiveConnectionState();
    state.encryptedDesktopAccount = null;
    try {
      await persistState({ rememberActiveConnection: false, beforeCommit: assertCurrent });
    } catch (error) {
      if (error instanceof StaleAccountSessionError) return { ...publicStatus(), nodeDisconnect };
      throw error;
    }
    if (isStale()) return { ...publicStatus(), nodeDisconnect };
    await showMainWindow();
    if (isStale()) return { ...publicStatus(), nodeDisconnect };
    await openSetup();
    if (isStale()) return { ...publicStatus(), nodeDisconnect };
    notifyStatus();
    return { ...publicStatus(), nodeDisconnect };
  }

  return {
    clearCoreSessions,
    acceptIdentityInvite,
    currentAccount,
    currentAccountSubject,
    currentSessionEpoch: () => accountSessionEpoch,
    ensureAccessToken,
    establishCoreSession,
    getStatus: status,
    setError: (error) => {
      accountError = safeAccountError(error);
      notifyStatus();
    },
    signIn: startSignIn,
    signOut,
  };
}

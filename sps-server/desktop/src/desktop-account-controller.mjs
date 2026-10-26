import { spsRequestError, spsRequestTimeoutSignal } from "./desktop-request.mjs";

const ACCOUNT_REFRESH_SKEW_MS = 2 * 60 * 1000;
const ACCOUNT_SESSION_COOKIE = "sps_identity_session";

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
  // Fences asynchronous Identity work when the local account lifecycle moves
  // on, including sign-out/sign-in back to the same account (an ABA change).
  let accountSessionEpoch = 0;

  function currentAccount() {
    return parseEncryptedAccount(state.encryptedDesktopAccount, decrypt);
  }

  function currentAccountSubject() {
    return currentAccount()?.subject ?? null;
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
    const accessToken = await ensureAccessToken();
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
      throw spsRequestError(error, "SPS sign-in session timed out. Sign in again and retry.");
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "SPS Server could not accept the SPS Identity session.");
    }
    const token = readSetCookieValue(response, ACCOUNT_SESSION_COOKIE);
    if (!token) throw new Error("SPS Server did not create a secure SPS Identity session.");
    const target = new URL(hubOrigin);
    await session.defaultSession.cookies.set({
      url: target.origin,
      name: ACCOUNT_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: target.protocol === "https:",
      sameSite: "lax",
      expirationDate: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    });
    return token;
  }

  async function clearCoreSessions() {
    const cookies = await session.defaultSession.cookies.get({ name: ACCOUNT_SESSION_COOKIE });
    await Promise.all(cookies.map(async (cookie) => {
      const hostname = String(cookie.domain ?? "").replace(/^\./, "");
      if (!hostname) return;
      const protocol = cookie.secure ? "https:" : "http:";
      const pathname = String(cookie.path ?? "/").startsWith("/") ? cookie.path : `/${cookie.path}`;
      await session.defaultSession.cookies.remove(`${protocol}//${hostname}${pathname}`, ACCOUNT_SESSION_COOKIE).catch(() => undefined);
    }));
  }

  async function acceptIdentityInvite(hubUrl, inviteToken) {
    const sessionCookie = await establishCoreSession(hubUrl);
    if (!sessionCookie) return null;
    const normalizedInviteToken = normalizeInviteToken(inviteToken);
    if (!normalizedInviteToken) throw new Error("Enter a valid SPS invitation code.");
    const origin = requireHubOrigin(hubUrl);
    const response = await fetch(new URL(`/api/invites/${encodeURIComponent(normalizedInviteToken)}/accept`, `${hubUrl}/`), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        origin,
        cookie: `${ACCOUNT_SESSION_COOKIE}=${encodeURIComponent(sessionCookie)}`,
      },
      body: JSON.stringify({ requestType: "human" }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || "SPS Server could not accept this team invitation.");
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
    accountSessionEpoch += 1;
    const signIn = pendingSignIn;
    pendingSignIn = null;
    signIn?.cancel();
    accountError = null;
    const account = currentAccount();
    if (account?.refreshToken) {
      await revokeIdentity({
        identityUrl: account.identityUrl || configuredIdentityUrl(),
        refreshToken: account.refreshToken,
      });
    }
    let nodeDisconnect = null;
    if (account && state.profile) {
      nodeDisconnect = await disconnectCurrentNode();
      rememberCurrentAccountConnection();
    }
    await clearCoreSessions();
    clearActiveConnectionState();
    state.encryptedDesktopAccount = null;
    await persistState({ rememberActiveConnection: false });
    await showMainWindow();
    await openSetup();
    notifyStatus();
    return { ...publicStatus(), nodeDisconnect };
  }

  return {
    clearCoreSessions,
    acceptIdentityInvite,
    currentAccount,
    currentAccountSubject,
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

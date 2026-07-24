import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { createServer } from "node:http";

const DEFAULT_SPS_IDENTITY_URL = "https://auth.redongames.com";

function value(input) {
  return typeof input === "string" ? input.trim() : "";
}

function requiredText(input, message) {
  const normalized = value(input);
  if (!normalized) throw new Error(message);
  return normalized;
}

function localCallbackPage({ success }) {
  const title = success ? "SPS sign-in complete" : "SPS sign-in could not finish";
  const body = success
    ? "You can return to SPS Desktop. This page can be closed."
    : "Return to SPS Desktop and try again.";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
}

export function isSpsIdentityUrl(input) {
  try {
    const url = new URL(input);
    const isLoopback = url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1";
    return (url.protocol === "https:" || (url.protocol === "http:" && isLoopback)) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function configuredSpsIdentityUrl(input) {
  const candidate = value(input) || DEFAULT_SPS_IDENTITY_URL;
  if (!isSpsIdentityUrl(candidate)) throw new Error("SPS Identity URL is invalid.");
  return candidate.replace(/\/$/, "");
}

export function createSpsIdentityPkce(randomBytes = nodeRandomBytes) {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildSpsIdentityAuthorizationUrl({ identityUrl, redirectUri, state, challenge, deviceId }) {
  const identity = configuredSpsIdentityUrl(identityUrl);
  const url = new URL("/v1/desktop/authorize", identity);
  url.search = new URLSearchParams({
    redirect_uri: requiredText(redirectUri, "SPS Desktop callback is missing."),
    state: requiredText(state, "SPS sign-in state is missing."),
    code_challenge: requiredText(challenge, "SPS PKCE challenge is missing."),
    code_challenge_method: "S256",
    device_id: requiredText(deviceId, "SPS Desktop device ID is missing."),
  }).toString();
  return url.toString();
}

function normalizeIdentityTokenPayload(payload) {
  const account = payload?.account;
  const accessToken = value(payload?.access_token);
  const refreshToken = value(payload?.refresh_token);
  const expiresIn = Number(payload?.expires_in);
  const subject = value(account?.subject);
  const email = value(account?.email);
  if (!accessToken || !refreshToken || !subject || !email || !Number.isFinite(expiresIn) || expiresIn < 60) {
    throw new Error("SPS Identity returned an invalid sign-in response.");
  }
  return {
    subject,
    email,
    name: value(account?.name) || email,
    picture: value(account?.picture) || null,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

async function requestIdentityToken({ fetchImpl, identityUrl, path, body }) {
  const response = await fetchImpl(new URL(path, `${configuredSpsIdentityUrl(identityUrl)}/`), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = value(payload?.error);
    throw new Error(reason ? `SPS sign-in could not finish: ${reason}` : "SPS sign-in could not finish.");
  }
  return normalizeIdentityTokenPayload(payload);
}

export async function refreshSpsDesktopIdentity({ identityUrl, refreshToken, fetchImpl = fetch, deviceId }) {
  const account = await requestIdentityToken({
    fetchImpl,
    identityUrl,
    path: "/v1/desktop/refresh",
    body: { refresh_token: requiredText(refreshToken, "SPS refresh token is missing."), device_id: requiredText(deviceId, "SPS Desktop device ID is missing.") },
  });
  return { ...account, deviceId };
}

export async function revokeSpsDesktopIdentity({ identityUrl, refreshToken, fetchImpl = fetch }) {
  if (!value(refreshToken)) return;
  await fetchImpl(new URL("/v1/desktop/revoke", `${configuredSpsIdentityUrl(identityUrl)}/`), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  }).catch(() => undefined);
}

export async function startSpsDesktopIdentitySignIn({
  identityUrl = DEFAULT_SPS_IDENTITY_URL,
  deviceId,
  openExternal,
  fetchImpl = fetch,
  randomBytes = nodeRandomBytes,
  timeoutMs = 5 * 60 * 1000,
} = {}) {
  if (typeof openExternal !== "function") throw new Error("SPS Desktop cannot open the SPS sign-in browser.");
  const normalizedIdentityUrl = configuredSpsIdentityUrl(identityUrl);
  const normalizedDeviceId = requiredText(deviceId, "SPS Desktop device ID is missing.");
  const state = randomBytes(32).toString("base64url");
  const { verifier, challenge } = createSpsIdentityPkce(randomBytes);
  let settled = false;
  let resolveResult;
  let rejectResult;
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    if (requestUrl.pathname !== "/oauth2/callback") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    const fail = (error) => {
      if (settled) return;
      settled = true;
      response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
      response.end(localCallbackPage({ success: false }));
      server.close();
      rejectResult(error instanceof Error ? error : new Error(String(error)));
    };
    const code = value(requestUrl.searchParams.get("code"));
    if (value(requestUrl.searchParams.get("state")) !== state) {
      fail(new Error("SPS sign-in did not match this Desktop request."));
      return;
    }
    if (!code) {
      fail(new Error(value(requestUrl.searchParams.get("error")) || "SPS sign-in was cancelled."));
      return;
    }
    void (async () => {
      try {
        const account = await requestIdentityToken({
          fetchImpl,
          identityUrl: normalizedIdentityUrl,
          path: "/v1/desktop/token",
          body: { code, code_verifier: verifier, device_id: normalizedDeviceId },
        });
        if (settled) return;
        settled = true;
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(localCallbackPage({ success: true }));
        server.close();
        resolveResult({ ...account, deviceId: normalizedDeviceId });
      } catch (error) {
        fail(error);
      }
    })();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
  const authorizationUrl = buildSpsIdentityAuthorizationUrl({
    identityUrl: normalizedIdentityUrl,
    redirectUri,
    state,
    challenge,
    deviceId: normalizedDeviceId,
  });
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    server.close();
    rejectResult(new Error("SPS sign-in timed out. Try again."));
  }, timeoutMs);
  result.finally(() => clearTimeout(timeout)).catch(() => {});
  try {
    await openExternal(authorizationUrl);
  } catch (error) {
    if (!settled) {
      settled = true;
      server.close();
      rejectResult(error);
    }
    throw error;
  }
  return {
    authorizationUrl,
    result,
    cancel() {
      if (settled) return;
      settled = true;
      server.close();
      rejectResult(new Error("SPS sign-in was cancelled."));
    },
  };
}

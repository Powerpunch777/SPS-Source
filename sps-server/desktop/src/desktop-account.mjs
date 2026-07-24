import { createHash, createPublicKey, randomBytes as nodeRandomBytes, verify } from "node:crypto";
import { createServer } from "node:http";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_SCOPES = "openid email profile";

function value(value) {
  return typeof value === "string" ? value.trim() : "";
}

function base64UrlJson(segment) {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new Error("Google returned an invalid identity token.");
  }
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

function claimNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function isSpsDesktopGoogleClientId(clientId) {
  return /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value(clientId));
}

export function createGooglePkce(randomBytes = nodeRandomBytes) {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildSpsDesktopGoogleAuthorizationUrl({ clientId, redirectUri, state, nonce, challenge }) {
  const normalizedClientId = requiredText(clientId, "SPS Desktop Google login is not configured.");
  if (!isSpsDesktopGoogleClientId(normalizedClientId)) {
    throw new Error("The SPS Desktop Google client ID is invalid.");
  }
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: normalizedClientId,
    redirect_uri: requiredText(redirectUri, "Google redirect URI is missing."),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state: requiredText(state, "Google sign-in state is missing."),
    nonce: requiredText(nonce, "Google sign-in nonce is missing."),
    code_challenge: requiredText(challenge, "Google PKCE challenge is missing."),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export function validateSpsDesktopGoogleClaims(claims, { clientId, nonce, now = Date.now() } = {}) {
  const subject = requiredText(claims?.sub, "Google did not return an account identifier.");
  const audience = value(claims?.aud);
  const issuer = value(claims?.iss);
  const expectedNonce = requiredText(nonce, "Google sign-in nonce is missing.");
  const expiresAt = claimNumber(claims?.exp);
  if (audience !== requiredText(clientId, "SPS Desktop Google login is not configured.")) {
    throw new Error("Google identity token was issued for another application.");
  }
  if (!GOOGLE_ISSUERS.has(issuer)) throw new Error("Google identity token has an invalid issuer.");
  if (!expiresAt || expiresAt <= Math.floor(now / 1000)) throw new Error("Google identity token has expired.");
  if (value(claims?.nonce) !== expectedNonce) throw new Error("Google identity token did not match this sign-in request.");
  if (claims?.email_verified !== true) throw new Error("Use a Google account with a verified email address.");
  return {
    subject,
    email: value(claims.email) || null,
    name: value(claims.name) || value(claims.email) || "Google account",
    picture: value(claims.picture) || null,
    verifiedAt: new Date(now).toISOString(),
  };
}

async function exchangeGoogleCode({ fetchImpl, clientId, clientSecret, redirectUri, verifier, code }) {
  const body = new URLSearchParams({
    client_id: clientId,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  // Native desktop OAuth clients use PKCE. A client secret is optional and must
  // never be required for a fresh SPS Desktop installation.
  const normalizedClientSecret = value(clientSecret);
  if (normalizedClientSecret) body.set("client_secret", normalizedClientSecret);
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !value(payload?.id_token)) {
    const reason = value(payload?.error_description) || value(payload?.error);
    throw new Error(reason
      ? `Google could not complete SPS Desktop sign-in: ${reason}`
      : "Google could not complete SPS Desktop sign-in.");
  }
  return payload.id_token;
}

async function verifyGoogleIdToken({ fetchImpl, idToken, clientId, nonce, now }) {
  const parts = value(idToken).split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid identity token.");
  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]);
  if (header?.alg !== "RS256" || !value(header?.kid)) {
    throw new Error("Google identity token uses an unsupported signature.");
  }
  const response = await fetchImpl(GOOGLE_JWKS_URI);
  const jwks = await response.json().catch(() => null);
  const key = Array.isArray(jwks?.keys)
    ? jwks.keys.find((candidate) => candidate?.kid === header.kid && candidate?.kty === "RSA")
    : null;
  if (!response.ok || !key) throw new Error("Google identity signing key is unavailable. Try again.");
  const publicKey = createPublicKey({ key, format: "jwk" });
  const signature = Buffer.from(parts[2], "base64url");
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  if (!verify("RSA-SHA256", signed, publicKey, signature)) {
    throw new Error("Google identity token signature could not be verified.");
  }
  return validateSpsDesktopGoogleClaims(claims, { clientId, nonce, now });
}

export async function startSpsDesktopGoogleSignIn({
  clientId,
  clientSecret,
  openExternal,
  fetchImpl = fetch,
  randomBytes = nodeRandomBytes,
  now = () => Date.now(),
  timeoutMs = 5 * 60 * 1000,
} = {}) {
  if (typeof openExternal !== "function") throw new Error("SPS Desktop cannot open the Google sign-in browser.");
  if (!isSpsDesktopGoogleClientId(clientId)) {
    throw new Error("Google login is not configured for this SPS Desktop build.");
  }
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const { verifier, challenge } = createGooglePkce(randomBytes);
  let settled = false;
  let settle = null;
  let reject = null;
  const result = new Promise((resolve, rejectResult) => {
    settle = resolve;
    reject = rejectResult;
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
      if (!response.writableEnded) {
        response.writeHead(400, { "content-type": "text/html; charset=utf-8" });
        response.end(localCallbackPage({ success: false }));
      }
      server.close();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const code = value(requestUrl.searchParams.get("code"));
    if (value(requestUrl.searchParams.get("state")) !== state) {
      fail(new Error("Google sign-in did not match this SPS Desktop request."));
      return;
    }
    if (!code) {
      fail(new Error(value(requestUrl.searchParams.get("error")) || "Google sign-in was cancelled."));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(localCallbackPage({ success: true }));
    const address = server.address();
    const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
    void (async () => {
      try {
        const idToken = await exchangeGoogleCode({ fetchImpl, clientId, clientSecret, redirectUri, verifier, code });
        const account = await verifyGoogleIdToken({ fetchImpl, idToken, clientId, nonce, now: now() });
        if (settled) return;
        settled = true;
        server.close();
        settle(account);
      } catch (error) {
        fail(error);
      }
    })();
  });
  await new Promise((resolve, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolve();
    });
  });
  const address = server.address();
  const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
  const authorizationUrl = buildSpsDesktopGoogleAuthorizationUrl({ clientId, redirectUri, state, nonce, challenge });
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    server.close();
    reject(new Error("Google sign-in timed out. Try again."));
  }, timeoutMs);
  result.finally(() => clearTimeout(timeout)).catch(() => {});
  try {
    await openExternal(authorizationUrl);
  } catch (error) {
    if (!settled) {
      settled = true;
      server.close();
      reject(error);
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
      reject(new Error("Google sign-in was cancelled."));
    },
  };
}

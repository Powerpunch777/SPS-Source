const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const GOOGLE_SCOPES = "openid email profile";
const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
// This covers the human Google sign-in round trip. It must stay aligned with
// SPS Desktop's loopback callback timeout so a slow account switch or MFA
// cannot leave Desktop waiting for an authorization request that the service
// has already discarded.
export const SPS_DESKTOP_SIGN_IN_TTL_MS = 15 * 60 * 1000;
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

function redirect(location) {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = text(value).replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(`${normalized}${padding}`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlJson(value) {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(value)));
  } catch {
    throw new Error("Invalid JWT payload.");
  }
}

function randomUrlValue(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function sha256Base64Url(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function validPkceChallenge(value) {
  return /^[A-Za-z0-9_-]{43,128}$/.test(text(value));
}

function validDeviceId(value) {
  return /^[A-Za-z0-9._:-]{16,160}$/.test(text(value));
}

export function isLoopbackRedirectUri(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "http:"
      && (url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1")
      && Boolean(url.port)
      && url.pathname === "/oauth2/callback"
      && !url.username
      && !url.password
      && !url.hash
    );
  } catch {
    return false;
  }
}

function authCallbackUrl(issuer) {
  return `${issuer.replace(/\/$/, "")}/v1/oauth/google/callback`;
}

function requireEnv(env, key) {
  const configured = text(env?.[key]);
  if (!configured) throw new Error(`SPS Identity is missing ${key}.`);
  return configured;
}

function pemToBytes(pem) {
  const body = text(pem)
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  if (!body) throw new Error("SPS Identity signing key is invalid.");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importSigningKey(env) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(requireEnv(env, "SPS_IDENTITY_PRIVATE_KEY_PEM")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function publicJwk(env) {
  const privateKey = await importSigningKey(env);
  const exported = await crypto.subtle.exportKey("jwk", privateKey).catch(() => null);
  // Private keys imported as non-extractable cannot be exported. The public JWK
  // is therefore supplied once as a non-secret Worker variable at deployment.
  if (exported?.n && exported?.e) return { kty: "RSA", n: exported.n, e: exported.e };
  const configured = text(env.SPS_IDENTITY_PUBLIC_JWK);
  if (!configured) throw new Error("SPS Identity is missing SPS_IDENTITY_PUBLIC_JWK.");
  const parsed = JSON.parse(configured);
  if (parsed?.kty !== "RSA" || !text(parsed.n) || !text(parsed.e)) {
    throw new Error("SPS Identity public JWK is invalid.");
  }
  return { kty: "RSA", n: parsed.n, e: parsed.e };
}

async function signAccessToken(env, claims) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: requireEnv(env, "SPS_IDENTITY_KEY_ID") };
  const payload = {
    iss: requireEnv(env, "SPS_IDENTITY_ISSUER").replace(/\/$/, ""),
    aud: text(env.SPS_IDENTITY_AUDIENCE) || "sps-core",
    iat: now,
    nbf: now - 5,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    jti: randomUrlValue(20),
    scope: "sps.core.session",
    ...claims,
  };
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signed = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await importSigningKey(env),
    new TextEncoder().encode(signed),
  );
  return `${signed}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function googleJwks(fetchImpl) {
  const response = await fetchImpl(GOOGLE_JWKS_URI);
  const value = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(value?.keys)) throw new Error("Google signing keys are unavailable.");
  return value.keys;
}

export async function verifyGoogleIdToken({ fetchImpl, idToken, clientId, nonce }) {
  const parts = text(idToken).split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid identity token.");
  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]);
  if (header?.alg !== "RS256" || !text(header.kid)) throw new Error("Google returned an unsupported identity token.");
  const key = (await googleJwks(fetchImpl)).find((candidate) => candidate?.kid === header.kid && candidate?.kty === "RSA");
  if (!key) throw new Error("Google identity signing key is unavailable.");
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, base64UrlDecode(parts[2]), signed);
  if (!valid) throw new Error("Google identity token signature is invalid.");
  if (text(claims.aud) !== clientId || !GOOGLE_ISSUERS.has(text(claims.iss))) {
    throw new Error("Google identity token was issued for another application.");
  }
  if (!Number.isFinite(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("Google identity token has expired.");
  }
  if (!nonce || text(claims.nonce) !== nonce) {
    throw new Error("Google identity token does not match this SPS sign-in request.");
  }
  if (claims.email_verified !== true || !text(claims.sub) || !text(claims.email)) {
    throw new Error("Use a Google account with a verified email address.");
  }
  return {
    subject: text(claims.sub),
    email: text(claims.email),
    name: text(claims.name) || text(claims.email),
    picture: text(claims.picture) || null,
  };
}

async function exchangeGoogleCode({ env, fetchImpl, code, verifier, nonce }) {
  const issuer = requireEnv(env, "SPS_IDENTITY_ISSUER").replace(/\/$/, "");
  const body = new URLSearchParams({
    code,
    client_id: requireEnv(env, "GOOGLE_CLIENT_ID"),
    client_secret: requireEnv(env, "GOOGLE_CLIENT_SECRET"),
    redirect_uri: authCallbackUrl(issuer),
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !text(payload?.id_token)) {
    throw new Error(text(payload?.error_description) || "Google could not complete SPS sign-in.");
  }
  return verifyGoogleIdToken({
    fetchImpl,
    idToken: payload.id_token,
    clientId: requireEnv(env, "GOOGLE_CLIENT_ID"),
    nonce,
  });
}

async function issueTokenPair(env, profile, deviceId) {
  const accessToken = await signAccessToken(env, {
    sub: profile.subject,
    email: profile.email,
    name: profile.name,
    ...(profile.picture ? { picture: profile.picture } : {}),
    device_id: deviceId,
  });
  const refreshToken = randomUrlValue(48);
  const refreshHash = await sha256Base64Url(refreshToken);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO refresh_tokens (token_hash, subject, device_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(refreshHash, profile.subject, deviceId, now + REFRESH_TOKEN_TTL_MS, now).run();
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    account: {
      subject: profile.subject,
      email: profile.email,
      name: profile.name,
      picture: profile.picture ?? null,
    },
  };
}

async function readJson(request) {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function cleanupExpiredIdentityRecords(env) {
  const now = Date.now();
  await Promise.all([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(now).run(),
    env.DB.prepare("DELETE FROM authorization_codes WHERE expires_at <= ?").bind(now).run(),
    env.DB.prepare("DELETE FROM refresh_tokens WHERE expires_at <= ?").bind(now).run(),
  ]).catch((reason) => {
    // Cleanup is opportunistic: a transient D1 failure must not block sign-in.
    console.warn("SPS Identity cleanup failed", reason);
  });
}

async function authorize(request, env) {
  const url = new URL(request.url);
  const redirectUri = text(url.searchParams.get("redirect_uri"));
  const state = text(url.searchParams.get("state"));
  const desktopChallenge = text(url.searchParams.get("code_challenge"));
  const deviceId = text(url.searchParams.get("device_id"));
  if (!isLoopbackRedirectUri(redirectUri)) return error("SPS Desktop callback must be a loopback URI.");
  if (!state || state.length > 512 || !validPkceChallenge(desktopChallenge) || !validDeviceId(deviceId)) {
    return error("Invalid SPS Desktop authorization request.");
  }
  await cleanupExpiredIdentityRecords(env);
  const stateId = randomUrlValue(30);
  const googleVerifier = randomUrlValue(48);
  const googleChallenge = await sha256Base64Url(googleVerifier);
  const googleNonce = randomUrlValue(30);
  await env.DB.prepare(
    "INSERT INTO oauth_states (id, desktop_redirect_uri, desktop_state, desktop_code_challenge, google_code_verifier, google_nonce, device_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(stateId, redirectUri, state, desktopChallenge, googleVerifier, googleNonce, deviceId, Date.now() + SPS_DESKTOP_SIGN_IN_TTL_MS).run();
  const googleUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  googleUrl.search = new URLSearchParams({
    client_id: requireEnv(env, "GOOGLE_CLIENT_ID"),
    redirect_uri: authCallbackUrl(requireEnv(env, "SPS_IDENTITY_ISSUER")),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state: stateId,
    code_challenge: googleChallenge,
    code_challenge_method: "S256",
    nonce: googleNonce,
    prompt: "select_account",
  }).toString();
  return redirect(googleUrl.toString());
}

async function googleCallback(request, env, fetchImpl) {
  const url = new URL(request.url);
  const stateId = text(url.searchParams.get("state"));
  const googleCode = text(url.searchParams.get("code"));
  if (!stateId || !googleCode) return error(text(url.searchParams.get("error")) || "Google sign-in was cancelled.");
  const state = await env.DB.prepare("SELECT * FROM oauth_states WHERE id = ?").bind(stateId).first();
  await env.DB.prepare("DELETE FROM oauth_states WHERE id = ?").bind(stateId).run();
  if (!state || Number(state.expires_at) <= Date.now()) return error("This SPS sign-in request has expired.");
  let profile;
  try {
    profile = await exchangeGoogleCode({
      env,
      fetchImpl,
      code: googleCode,
      verifier: state.google_code_verifier,
      nonce: state.google_nonce,
    });
  } catch (reason) {
    return error(reason instanceof Error ? reason.message : "Google could not complete SPS sign-in.", 401);
  }
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO identity_users (subject, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(subject) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture, updated_at = excluded.updated_at",
  ).bind(profile.subject, profile.email, profile.name, profile.picture, now, now).run();
  const code = randomUrlValue(36);
  await env.DB.prepare(
    "INSERT INTO authorization_codes (code_hash, subject, email, name, picture, device_id, code_challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).bind(
    await sha256Base64Url(code),
    profile.subject,
    profile.email,
    profile.name,
    profile.picture,
    state.device_id,
    state.desktop_code_challenge,
    now + AUTHORIZATION_CODE_TTL_MS,
  ).run();
  const desktopRedirect = new URL(state.desktop_redirect_uri);
  desktopRedirect.searchParams.set("code", code);
  desktopRedirect.searchParams.set("state", state.desktop_state);
  return redirect(desktopRedirect.toString());
}

async function token(request, env) {
  const body = await readJson(request);
  const code = text(body.code);
  const verifier = text(body.code_verifier);
  const deviceId = text(body.device_id);
  if (!code || !verifier || !validDeviceId(deviceId)) {
    return error("Authorization code, PKCE verifier, and device ID are required.");
  }
  await cleanupExpiredIdentityRecords(env);
  const codeHash = await sha256Base64Url(code);
  const record = await env.DB.prepare("SELECT * FROM authorization_codes WHERE code_hash = ?").bind(codeHash).first();
  if (!record) return error("SPS authorization code is invalid or expired.", 401);
  if (Number(record.expires_at) <= Date.now()) {
    await env.DB.prepare("DELETE FROM authorization_codes WHERE code_hash = ?").bind(codeHash).run();
    return error("SPS authorization code is invalid or expired.", 401);
  }
  if ((await sha256Base64Url(verifier)) !== record.code_challenge) return error("SPS PKCE verification failed.", 401);
  if (record.device_id !== deviceId) return error("SPS authorization code belongs to another device.", 401);
  const consumed = await env.DB.prepare(
    "DELETE FROM authorization_codes WHERE code_hash = ? AND device_id = ? AND expires_at = ?",
  ).bind(codeHash, deviceId, record.expires_at).run();
  if (Number(consumed.meta?.changes ?? 0) !== 1) return error("SPS authorization code was already used.", 401);
  return json(await issueTokenPair(env, {
    subject: record.subject,
    email: record.email,
    name: record.name,
    picture: record.picture || null,
  }, record.device_id));
}

async function refresh(request, env) {
  const body = await readJson(request);
  const refreshToken = text(body.refresh_token);
  const deviceId = text(body.device_id);
  if (!refreshToken || !validDeviceId(deviceId)) return error("Refresh token and device ID are required.");
  await cleanupExpiredIdentityRecords(env);
  const hash = await sha256Base64Url(refreshToken);
  const record = await env.DB.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?").bind(hash).first();
  if (!record) return error("SPS refresh token is invalid or expired.", 401);
  if (Number(record.expires_at) <= Date.now()) {
    await env.DB.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").bind(hash).run();
    return error("SPS refresh token is invalid or expired.", 401);
  }
  if (record.device_id !== deviceId) return error("SPS refresh token belongs to another device.", 401);
  const rotated = await env.DB.prepare(
    "DELETE FROM refresh_tokens WHERE token_hash = ? AND device_id = ? AND expires_at = ?",
  ).bind(hash, deviceId, record.expires_at).run();
  if (Number(rotated.meta?.changes ?? 0) !== 1) return error("SPS refresh token was already used.", 401);
  const profile = await env.DB.prepare("SELECT * FROM identity_users WHERE subject = ?").bind(record.subject).first();
  if (!profile) return error("SPS account is unavailable.", 401);
  return json(await issueTokenPair(env, {
    subject: profile.subject,
    email: profile.email,
    name: profile.name,
    picture: profile.picture || null,
  }, record.device_id));
}

async function revoke(request, env) {
  const body = await readJson(request);
  const refreshToken = text(body.refresh_token);
  if (refreshToken) {
    await env.DB.prepare("DELETE FROM refresh_tokens WHERE token_hash = ?").bind(await sha256Base64Url(refreshToken)).run();
  }
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

export function createSpsIdentityWorker({ fetchImpl = fetch } = {}) {
  return {
    async fetch(request, env) {
      try {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
          return json({ status: "ok", service: "sps-identity" });
        }
        if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") {
          const jwk = await publicJwk(env);
          return json({ keys: [{ ...jwk, use: "sig", alg: "RS256", kid: requireEnv(env, "SPS_IDENTITY_KEY_ID") }] });
        }
        if (request.method === "GET" && url.pathname === "/v1/desktop/authorize") return await authorize(request, env);
        if (request.method === "GET" && url.pathname === "/v1/oauth/google/callback") return await googleCallback(request, env, fetchImpl);
        if (request.method === "POST" && url.pathname === "/v1/desktop/token") return await token(request, env);
        if (request.method === "POST" && url.pathname === "/v1/desktop/refresh") return await refresh(request, env);
        if (request.method === "POST" && url.pathname === "/v1/desktop/revoke") return await revoke(request, env);
        return error("Not found.", 404);
      } catch (reason) {
        console.error("SPS Identity request failed", reason);
        return error("SPS Identity could not complete this request.", 500);
      }
    },
  };
}

export default createSpsIdentityWorker();

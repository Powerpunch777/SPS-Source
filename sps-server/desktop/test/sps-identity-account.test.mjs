import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpsIdentityAuthorizationUrl,
  createSpsIdentityPkce,
  DEFAULT_SPS_DESKTOP_SIGN_IN_TIMEOUT_MS,
  isExpiredSpsDesktopRefreshToken,
  isSpsIdentityUrl,
  refreshSpsDesktopIdentity,
  startSpsDesktopIdentitySignIn,
} from "../src/sps-identity-account.mjs";

test("keeps the human Desktop sign-in callback alive for fifteen minutes", () => {
  assert.equal(DEFAULT_SPS_DESKTOP_SIGN_IN_TIMEOUT_MS, 15 * 60 * 1000);
});

test("builds a central SPS Identity authorization request with Desktop PKCE", () => {
  const pkce = createSpsIdentityPkce((size) => Buffer.alloc(size, 4));
  const url = new URL(buildSpsIdentityAuthorizationUrl({
    identityUrl: "https://auth.redongames.com",
    redirectUri: "http://127.0.0.1:43129/oauth2/callback",
    state: "state",
    challenge: pkce.challenge,
    deviceId: "desktop-device-1234",
  }));
  assert.equal(url.origin, "https://auth.redongames.com");
  assert.equal(url.pathname, "/v1/desktop/authorize");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("device_id"), "desktop-device-1234");
});

test("permits HTTPS identity services and loopback-only HTTP for development", () => {
  assert.equal(isSpsIdentityUrl("https://auth.redongames.com"), true);
  assert.equal(isSpsIdentityUrl("http://127.0.0.1:8787"), true);
  assert.equal(isSpsIdentityUrl("http://example.com"), false);
});

test("recognizes an expired SPS Desktop refresh token without treating unrelated failures as sign-out", () => {
  assert.equal(isExpiredSpsDesktopRefreshToken(new Error("SPS sign-in could not finish: SPS refresh token is invalid or expired.")), true);
  assert.equal(isExpiredSpsDesktopRefreshToken(new Error("SPS Identity is temporarily unavailable.")), false);
});

test("exchanges a one-time SPS code with its PKCE verifier", async () => {
  let opened = null;
  let requestBody = null;
  const pending = await startSpsDesktopIdentitySignIn({
    identityUrl: "https://auth.redongames.com",
    deviceId: "desktop-device-1234",
    randomBytes: (size) => Buffer.alloc(size, 7),
    openExternal: async (url) => { opened = url; },
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 900,
        account: { subject: "sps-user", email: "person@example.com", name: "SPS Person" },
      }), { status: 200 });
    },
  });
  const authorization = new URL(opened);
  const callback = authorization.searchParams.get("redirect_uri");
  const response = await fetch(`${callback}?code=sps-code&state=${authorization.searchParams.get("state")}`);
  assert.equal(response.status, 200);
  const account = await pending.result;
  assert.equal(account.subject, "sps-user");
  assert.equal(requestBody.code, "sps-code");
  assert.equal(requestBody.device_id, "desktop-device-1234");
  assert.match(requestBody.code_verifier, /^[A-Za-z0-9_-]+$/);
});

test("bounds a stalled SPS Identity refresh request", async () => {
  await assert.rejects(
    refreshSpsDesktopIdentity({
      identityUrl: "https://auth.redongames.com",
      refreshToken: "refresh-token",
      deviceId: "desktop-device-1234",
      timeoutMs: 1,
      fetchImpl: async (_url, options) => {
        assert.ok(options.signal instanceof AbortSignal);
        throw new DOMException("timed out", "TimeoutError");
      },
    }),
    /SPS Identity request timed out/,
  );
});

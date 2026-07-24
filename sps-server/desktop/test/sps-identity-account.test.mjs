import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSpsIdentityAuthorizationUrl,
  createSpsIdentityPkce,
  isSpsIdentityUrl,
  startSpsDesktopIdentitySignIn,
} from "../src/sps-identity-account.mjs";

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

import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  buildSpsDesktopGoogleAuthorizationUrl,
  createGooglePkce,
  isSpsDesktopGoogleClientId,
  validateSpsDesktopGoogleClaims,
  startSpsDesktopGoogleSignIn,
} from "../src/desktop-account.mjs";

const clientId = "1234567890-spsdesktopabcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com";

test("creates a high-entropy PKCE verifier and S256 challenge", () => {
  const pkce = createGooglePkce((size) => Buffer.alloc(size, 7));
  assert.match(pkce.verifier, /^[A-Za-z0-9_-]+$/);
  assert.match(pkce.challenge, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(pkce.verifier, pkce.challenge);
});

test("builds a Google Desktop authorization URL with PKCE and OIDC state", () => {
  const url = new URL(buildSpsDesktopGoogleAuthorizationUrl({
    clientId,
    redirectUri: "http://127.0.0.1:42815/oauth2/callback",
    state: "request-state",
    nonce: "request-nonce",
    challenge: "request-challenge",
  }));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("client_id"), clientId);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("nonce"), "request-nonce");
});

test("accepts only valid SPS Desktop Google identity claims", () => {
  const account = validateSpsDesktopGoogleClaims({
    sub: "google-subject",
    aud: clientId,
    iss: "https://accounts.google.com",
    exp: 2_000_000_000,
    nonce: "request-nonce",
    email: "member@example.com",
    email_verified: true,
    name: "SPS Member",
  }, { clientId, nonce: "request-nonce", now: 1_700_000_000_000 });
  assert.equal(account.subject, "google-subject");
  assert.equal(account.email, "member@example.com");
  assert.throws(() => validateSpsDesktopGoogleClaims({
    sub: "google-subject", aud: "other-client", iss: "https://accounts.google.com", exp: 2_000_000_000, nonce: "request-nonce", email_verified: true,
  }, { clientId, nonce: "request-nonce", now: 1_700_000_000_000 }), /another application/);
});

test("recognizes only Google OAuth client IDs", () => {
  assert.equal(isSpsDesktopGoogleClientId(clientId), true);
  assert.equal(isSpsDesktopGoogleClientId("not-a-google-client"), false);
});

test("returns from the loopback callback only after PKCE token exchange and ID token verification", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const encode = (payload) => Buffer.from(JSON.stringify(payload)).toString("base64url");
  const header = encode({ alg: "RS256", kid: "test-google-key" });
  let idToken = null;
  let openedUrl = null;
  const randomBytes = (size) => Buffer.alloc(size, 9);
  const pending = await startSpsDesktopGoogleSignIn({
    clientId,
    randomBytes,
    now: () => 1_700_000_000_000,
    openExternal: async (url) => { openedUrl = url; },
    fetchImpl: async (url) => {
      if (String(url).includes("/token")) return new Response(JSON.stringify({ id_token: idToken }), { status: 200 });
      return new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: "test-google-key", kty: "RSA" }] }), { status: 200 });
    },
  });
  const authorization = new URL(openedUrl);
  const callback = authorization.searchParams.get("redirect_uri");
  const claims = encode({
    sub: "google-subject",
    aud: clientId,
    iss: "https://accounts.google.com",
    exp: 2_000_000_000,
    nonce: authorization.searchParams.get("nonce"),
    email: "member@example.com",
    email_verified: true,
    name: "SPS Member",
  });
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), privateKey).toString("base64url");
  idToken = `${header}.${claims}.${signature}`;
  const response = await fetch(`${callback}?code=google-code&state=${authorization.searchParams.get("state")}`);
  assert.equal(response.status, 200);
  const account = await pending.result;
  assert.equal(account.subject, "google-subject");
  assert.equal(account.name, "SPS Member");
});

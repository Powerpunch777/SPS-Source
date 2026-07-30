import assert from "node:assert/strict";
import { generateKeyPairSync, createSign } from "node:crypto";
import test from "node:test";
import {
  createSpsIdentityWorker,
  isLoopbackRedirectUri,
  SPS_DESKTOP_SIGN_IN_TTL_MS,
  verifyGoogleIdToken,
} from "../src/worker.mjs";

test("keeps the central SPS Desktop sign-in request valid for fifteen minutes", () => {
  assert.equal(SPS_DESKTOP_SIGN_IN_TTL_MS, 15 * 60 * 1000);
});

test("accepts only SPS Desktop loopback callbacks", () => {
  assert.equal(isLoopbackRedirectUri("http://127.0.0.1:43129/oauth2/callback"), true);
  assert.equal(isLoopbackRedirectUri("http://localhost:43129/oauth2/callback"), true);
  assert.equal(isLoopbackRedirectUri("https://localhost:43129/oauth2/callback"), false);
  assert.equal(isLoopbackRedirectUri("http://example.com:43129/oauth2/callback"), false);
  assert.equal(isLoopbackRedirectUri("http://127.0.0.1:43129/other"), false);
  assert.equal(isLoopbackRedirectUri("http://127.0.0.1/oauth2/callback"), false);
});

test("rejects malformed desktop device requests before touching identity storage", async () => {
  const worker = createSpsIdentityWorker();
  const response = await worker.fetch(new Request("https://auth.example/v1/desktop/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "one-time-code", code_verifier: "verifier", device_id: "short" }),
  }), {});
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /device ID/i);
});

test("cleans expired identity records when a new Desktop sign-in starts", async () => {
  const statements = [];
  const worker = createSpsIdentityWorker();
  const response = await worker.fetch(new Request(
    "https://auth.example/v1/desktop/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A43129%2Foauth2%2Fcallback&state=desktop-state&code_challenge=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa&code_challenge_method=S256&device_id=sps-desktop-device-1234",
  ), {
    GOOGLE_CLIENT_ID: "google-client",
    SPS_IDENTITY_ISSUER: "https://auth.example",
    DB: {
      prepare(sql) {
        statements.push(sql);
        return {
          bind() {
            return { run: async () => ({ success: true }) };
          },
        };
      },
    },
  });

  assert.equal(response.status, 302);
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM oauth_states")), true);
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM authorization_codes")), true);
  assert.equal(statements.some((sql) => sql.includes("DELETE FROM refresh_tokens")), true);
});

test("binds a Google ID token to the central sign-in nonce", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "google-test" })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: "google-client",
    exp: Math.floor(Date.now() / 1000) + 300,
    nonce: "request-nonce",
    sub: "google-subject",
    email: "person@example.com",
    email_verified: true,
  })).toString("base64url");
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const token = `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
  const fetchImpl = async () => new Response(JSON.stringify({
    keys: [{ ...publicKey.export({ format: "jwk" }), kid: "google-test" }],
  }), { status: 200 });

  const profile = await verifyGoogleIdToken({
    fetchImpl,
    idToken: token,
    clientId: "google-client",
    nonce: "request-nonce",
  });
  assert.equal(profile.subject, "google-subject");
  await assert.rejects(
    () => verifyGoogleIdToken({ fetchImpl, idToken: token, clientId: "google-client", nonce: "another-request" }),
    /does not match/i,
  );
});

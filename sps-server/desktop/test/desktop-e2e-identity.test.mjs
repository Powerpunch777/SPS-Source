import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createMockIdentityServer } from "../scripts/desktop-e2e-identity.mjs";
import { createSpsIdentityExternalOpener } from "../src/sps-identity-external-opener.mjs";
import { startSpsDesktopIdentitySignIn } from "../src/sps-identity-account.mjs";

test("shared Desktop Identity fixture follows the real PKCE callback and publishes its signing key", async () => {
  const identity = createMockIdentityServer();
  const { origin } = await identity.start();
  let pending;
  try {
    pending = await startSpsDesktopIdentitySignIn({ identityUrl: origin, deviceId: "fixture-device-0123456789",
      timeoutMs: 5000,
      openExternal: createSpsIdentityExternalOpener({ identityUrl: origin, sourceE2e: true,
        allowLoopbackIdentity: true, openExternal: () => { throw new Error("Real browser must not open."); } }),
    });
    assert.equal(identity.capturedAuthorizationUrls.length, 1);
    const response = await fetch(identity.capturedAuthorizationUrls.shift(), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    await response.text();
    const account = await pending.result;
    assert.equal(account.subject, "sps-desktop-e2e-owner");
    const jwks = await fetch(`${origin}/.well-known/jwks.json`).then(response => response.json());
    assert.equal(jwks.keys.length, 1);
    assert.equal(jwks.keys[0].alg, "RS256");
  } finally {
    pending?.cancel();
    await identity.close();
  }
});

test("shared Desktop Identity fixture refuses authorization-code replay", async () => {
  const identity = createMockIdentityServer();
  const { origin } = await identity.start();
  try {
    const verifier = "x".repeat(43);
    const authorize = new URL(`${origin}/v1/desktop/authorize`);
    authorize.search = new URLSearchParams({ redirect_uri: "http://127.0.0.1:12345/oauth2/callback",
      state: "s".repeat(43), code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256", device_id: "fixture-device-0123456789" }).toString();
    const redirect = await fetch(authorize, { redirect: "manual" });
    assert.equal(redirect.status, 302);
    await redirect.text();
    const code = new URL(redirect.headers.get("location")).searchParams.get("code");
    const redeem = () => fetch(`${origin}/v1/desktop/token`, { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, device_id: "fixture-device-0123456789" }) });
    const first = await redeem();
    assert.equal(first.status, 200);
    await first.json();
    const replay = await redeem();
    assert.equal(replay.status, 400);
    await replay.text();
  } finally { await identity.close(); }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSpsIdentityExternalOpener } from "../src/sps-identity-external-opener.mjs";

const identityUrl = "http://127.0.0.1:31310";
const authUrl = new URL("/v1/desktop/authorize", identityUrl);
authUrl.search = new URLSearchParams({
  redirect_uri: "http://127.0.0.1:49152/oauth2/callback",
  state: "s".repeat(43), code_challenge: "c".repeat(43), code_challenge_method: "S256", device_id: "device_0123456789abcdef",
}).toString();

test("production or non-loopback identity always uses the provided system browser opener", async () => {
  let opened = null;
  const openExternal = async url => { opened = url; };
  const production = createSpsIdentityExternalOpener({ openExternal, identityUrl: "https://identity.example.test",
    sourceE2e: true, allowLoopbackIdentity: true });
  await production(authUrl.href);
  assert.equal(opened, authUrl.href);
  opened = null;
  const nonE2e = createSpsIdentityExternalOpener({ openExternal, identityUrl, sourceE2e: false,
    allowLoopbackIdentity: true });
  await nonE2e(authUrl.href);
  assert.equal(opened, authUrl.href);
});

test("only source E2E loopback authorization capture replaces the browser", async () => {
  const requests = [];
  const opener = createSpsIdentityExternalOpener({ openExternal: async () => assert.fail("Browser must not launch in source E2E"),
    identityUrl, sourceE2e: true, allowLoopbackIdentity: true,
    async fetchImpl(url, options) {
      requests.push({ url: String(url), options });
      return { ok: true };
    } });
  await opener(authUrl.href);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, `${identityUrl}/__e2e/capture-authorization`);
  assert.equal(requests[0].options.method, "POST");
  assert.equal(requests[0].options.redirect, "error");
  assert.deepEqual(JSON.parse(requests[0].options.body), { authorizationUrl: authUrl.href });
});

test("invalid or cross-origin authorization requests never reach capture or the system browser", async () => {
  let captures = 0, opened = 0;
  const opener = createSpsIdentityExternalOpener({ identityUrl, sourceE2e: true, allowLoopbackIdentity: true,
    openExternal: async () => { opened++; },
    async fetchImpl() { captures++; return { ok: true }; } });
  const invalid = [
    "https://evil.example/v1/desktop/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%2Foauth2%2Fcallback",
    authUrl.href.replace("127.0.0.1:31310", "127.0.0.1:31311"),
    authUrl.href.replace("device_id=device_0123456789abcdef", "device_id=x&device_id=y"),
    authUrl.href.replace("redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Foauth2%2Fcallback", "redirect_uri=https%3A%2F%2Fevil.example%2Foauth2%2Fcallback"),
    authUrl.href.replace("code_challenge_method=S256", "code_challenge_method=plain"),
  ];
  for (const value of invalid) await assert.rejects(opener(value));
  assert.equal(captures, 0);
  assert.equal(opened, 0);
});

test("capture destination must be the exact loopback Identity origin", async () => {
  let fetches = 0;
  const opener = createSpsIdentityExternalOpener({ identityUrl: "http://evil.example", sourceE2e: true,
    allowLoopbackIdentity: true, openExternal: async () => {}, async fetchImpl() { fetches++; return { ok: true }; } });
  await opener(authUrl.href);
  assert.equal(fetches, 0);
});

test("Main scopes the capture opener to SPS Identity sign-in and keeps general external URLs on shell", async () => {
  const source = await readFile(new URL("../src/main.mjs", import.meta.url), "utf8");
  assert.match(source, /function openSpsExternalUrl\(value\)\s*\{\s*return shell\.openExternal\(requireSpsExternalUrl\(value\)\);\s*\}/);
  assert.match(source, /openExternal:\s*createSpsIdentityExternalOpener\(\{\s*openExternal:\s*openSpsExternalUrl,/);
  assert.match(source, /sourceE2e:\s*process\.env\.SPS_DESKTOP_E2E === "1"/);
  assert.match(source, /allowLoopbackIdentity:\s*process\.env\.SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY === "1"/);
  assert.equal((source.match(/createSpsIdentityExternalOpener\(/g) ?? []).length, 1,
    "Main imports and uses the scoped Identity sign-in opener only once.");
});

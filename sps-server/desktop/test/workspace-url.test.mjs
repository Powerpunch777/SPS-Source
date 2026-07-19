import test from "node:test";
import assert from "node:assert/strict";
import { isSpsHubApiUrl, isSpsLoopbackHubOrigin, normalizeSpsHubOrigin, requireSpsHubOrigin } from "../src/workspace-url.mjs";

test("normalizes only HTTP(S) SPS Hub origins", () => {
  assert.equal(normalizeSpsHubOrigin("https://hub.example.test/path?old=1"), "https://hub.example.test");
  assert.equal(normalizeSpsHubOrigin("http://hub.example.test:3100"), "http://hub.example.test:3100");
  assert.equal(normalizeSpsHubOrigin("file:///not-a-hub"), null);
});

test("adds Desktop authentication only to the selected Hub API", () => {
  const hub = "https://hub.example.test";
  assert.equal(isSpsHubApiUrl("https://hub.example.test/api/companies", hub), true);
  assert.equal(isSpsHubApiUrl("https://hub.example.test/api", hub), true);
  assert.equal(isSpsHubApiUrl("https://hub.example.test/assets/app.js", hub), false);
  assert.equal(isSpsHubApiUrl("https://other.example.test/api/companies", hub), false);
});

test("requires HTTPS for a non-local SPS Hub profile", () => {
  assert.equal(requireSpsHubOrigin("https://hub.example.test/path"), "https://hub.example.test");
  assert.equal(requireSpsHubOrigin("http://localhost:3100"), "http://localhost:3100");
  assert.throws(() => requireSpsHubOrigin("http://192.168.0.10:3100"), /must use HTTPS outside this computer/);
  assert.throws(() => requireSpsHubOrigin("https://user:secret@hub.example.test"), /must not include a username or password/);
});

test("recognizes only loopback SPS Hosts as local Desktop hosts", () => {
  assert.equal(isSpsLoopbackHubOrigin("http://127.0.0.1:3100"), true);
  assert.equal(isSpsLoopbackHubOrigin("http://localhost:3100"), true);
  assert.equal(isSpsLoopbackHubOrigin("https://app.redongames.com"), false);
  assert.equal(isSpsLoopbackHubOrigin("http://192.168.0.10:3100"), false);
});

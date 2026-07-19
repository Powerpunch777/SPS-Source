import test from "node:test";
import assert from "node:assert/strict";
import { isSpsHubApiUrl, normalizeSpsHubOrigin, requireSpsHubOrigin, requireSpsOwnerHostOrigin } from "../src/workspace-url.mjs";

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

test("requires HTTPS for every SPS Desktop Hub profile", () => {
  assert.equal(requireSpsHubOrigin("https://hub.example.test/path"), "https://hub.example.test");
  assert.throws(() => requireSpsHubOrigin("http://localhost:3100"), /must use HTTPS/);
  assert.throws(() => requireSpsHubOrigin("http://192.168.0.10:3100"), /must use HTTPS/);
  assert.throws(() => requireSpsHubOrigin("https://user:secret@hub.example.test"), /must not include a username or password/);
});

test("allows HTTP only for the internal loopback Owner Host", () => {
  assert.equal(requireSpsOwnerHostOrigin("http://127.0.0.1:31310/path"), "http://127.0.0.1:31310");
  assert.equal(requireSpsOwnerHostOrigin("http://localhost:31310"), "http://localhost:31310");
  assert.throws(() => requireSpsOwnerHostOrigin("https://app.redongames.com"), /loopback HTTP/);
  assert.throws(() => requireSpsOwnerHostOrigin("http://192.168.0.10:31310"), /loopback HTTP/);
});

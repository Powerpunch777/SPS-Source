import test from "node:test";
import assert from "node:assert/strict";
import { isSpsHubApiUrl, normalizeSpsHubOrigin } from "../src/workspace-url.mjs";

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

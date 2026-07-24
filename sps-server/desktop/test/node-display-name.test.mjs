import test from "node:test";
import assert from "node:assert/strict";
import { resolveSpsNodeDisplayName } from "../src/node-display-name.mjs";

test("keeps a custom computer name ahead of the SPS account name", () => {
  assert.equal(resolveSpsNodeDisplayName({
    configuredName: "Jimin's laptop",
    accountName: "Jimin Park",
    hostname: "DESKTOP-123",
  }), "Jimin's laptop");
});

test("uses the SPS account name when setup did not name the computer", () => {
  assert.equal(resolveSpsNodeDisplayName({
    configuredName: " ",
    accountName: "Jimin Park",
    hostname: "DESKTOP-123",
  }), "Jimin Park");
});

test("uses the local host name only when the account does not provide a name", () => {
  assert.equal(resolveSpsNodeDisplayName({
    configuredName: "",
    accountName: null,
    hostname: "DESKTOP-123",
  }), "DESKTOP-123");
});

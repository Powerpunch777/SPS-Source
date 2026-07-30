import test from "node:test";
import assert from "node:assert/strict";
import {
  spsOwnerHostIdentityEnvironment,
  spsOwnerHostRuntimeEnvironment,
} from "../src/owner-host-identity.mjs";

test("enables the SPS Identity bridge for every Owner Host", () => {
  assert.deepEqual(spsOwnerHostIdentityEnvironment("https://app.redongames.com/"), {
    SPS_AUTH_IDENTITY_ENABLED: "true",
    SPS_IDENTITY_ISSUER: "https://app.redongames.com",
    SPS_IDENTITY_AUDIENCE: "sps-core",
    SPS_IDENTITY_JWKS_URL: "https://app.redongames.com/.well-known/jwks.json",
    SPS_AUTH_GOOGLE_ONLY: "false",
  });
  const local = spsOwnerHostRuntimeEnvironment({
    identityUrl: "https://app.redongames.com",
    teamAccessEnabled: false,
  });
  assert.equal(local.SPS_AUTH_IDENTITY_ENABLED, "true");
  assert.equal(local.SPS_AUTH_SECRET, undefined);
});

test("adds private-team runtime credentials only when team access is enabled", () => {
  const environment = spsOwnerHostRuntimeEnvironment({
    identityUrl: "https://app.redongames.com",
    teamAccessEnabled: true,
    authSecret: "team-secret",
  });
  assert.equal(environment.SPS_AUTH_SECRET, "team-secret");
  assert.equal(environment.PAPERCLIP_AGENT_JWT_SECRET, "team-secret");
  assert.equal(environment.TRUST_PROXY, "loopback");
  assert.throws(() => spsOwnerHostRuntimeEnvironment({
    identityUrl: "https://app.redongames.com",
    teamAccessEnabled: true,
  }), /Private team access credentials/);
});

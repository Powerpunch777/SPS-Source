import test from "node:test";
import assert from "node:assert/strict";
import {
  allowsSpsDesktopE2ELoopbackIdentity,
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
    agentJwtSecret: "agent-secret",
  });
  assert.equal(local.SPS_AUTH_IDENTITY_ENABLED, "true");
  assert.equal(local.SPS_AUTH_SECRET, undefined);
  assert.equal(local.PAPERCLIP_AGENT_JWT_SECRET, "agent-secret");
  assert.throws(() => spsOwnerHostRuntimeEnvironment({
    identityUrl: "https://app.redongames.com",
    teamAccessEnabled: false,
  }), /Agent runtime credentials/);
});

test("allows loopback HTTP Identity only for an explicit isolated Desktop E2E", () => {
  const none = {};
  const singleFlag = { SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1" };
  const isolated = {
    SPS_DESKTOP_E2E_ALLOW_MULTI_INSTANCE: "1",
    SPS_DESKTOP_E2E_ALLOW_LOOPBACK_IDENTITY: "1",
  };

  assert.equal(allowsSpsDesktopE2ELoopbackIdentity(none), false);
  assert.equal(allowsSpsDesktopE2ELoopbackIdentity(singleFlag), false);
  assert.equal(allowsSpsDesktopE2ELoopbackIdentity(isolated), true);
  assert.throws(
    () => spsOwnerHostIdentityEnvironment("http://127.0.0.1:43100", none),
    /requires an HTTPS SPS Identity URL/,
  );
  assert.throws(
    () => spsOwnerHostIdentityEnvironment("http://identity.example.test", isolated),
    /requires an HTTPS SPS Identity URL/,
  );
  assert.equal(
    spsOwnerHostIdentityEnvironment("http://127.0.0.1:43100/", isolated).SPS_IDENTITY_ISSUER,
    "http://127.0.0.1:43100",
  );
});

test("adds private-team runtime credentials only when team access is enabled", () => {
  const environment = spsOwnerHostRuntimeEnvironment({
    identityUrl: "https://app.redongames.com",
    teamAccessEnabled: true,
    authSecret: "team-secret",
    agentJwtSecret: "agent-secret",
  });
  assert.equal(environment.SPS_AUTH_SECRET, "team-secret");
  assert.equal(environment.PAPERCLIP_AGENT_JWT_SECRET, "agent-secret");
  assert.equal(environment.TRUST_PROXY, "loopback");
  assert.throws(() => spsOwnerHostRuntimeEnvironment({
    identityUrl: "https://app.redongames.com",
    teamAccessEnabled: true,
    agentJwtSecret: "agent-secret",
  }), /Private team access credentials/);
});

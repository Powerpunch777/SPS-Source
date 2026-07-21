import test from "node:test";
import assert from "node:assert/strict";
import { SPS_SERVER_ACCESS_MODE, resolveSpsServerAccess } from "../src/server-access-model.mjs";

test("keeps local-only Owner Hosts offline and computer-trusted", () => {
  const access = resolveSpsServerAccess({
    profile: { connectionKind: "owner-host" },
    teamAccess: null,
  });

  assert.deepEqual(access, {
    mode: SPS_SERVER_ACCESS_MODE.LOCAL_TRUSTED,
    dataOwner: "server",
    requiresMembership: false,
    offlineCapable: true,
    serverRole: "host",
  });
});

test("uses authenticated company membership for private teams and joined servers", () => {
  const owner = resolveSpsServerAccess({
    profile: { connectionKind: "owner-host" },
    teamAccess: { enabled: true, phase: "active" },
  });
  const member = resolveSpsServerAccess({
    profile: { connectionKind: "remote" },
    teamAccess: null,
  });

  assert.equal(owner.mode, SPS_SERVER_ACCESS_MODE.AUTHENTICATED_MEMBERSHIP);
  assert.equal(owner.serverRole, "host");
  assert.equal(owner.requiresMembership, true);
  assert.equal(member.mode, SPS_SERVER_ACCESS_MODE.AUTHENTICATED_MEMBERSHIP);
  assert.equal(member.serverRole, "member");
  assert.equal(member.dataOwner, "server");
});

test("does not assign account ownership before a server is created or joined", () => {
  const access = resolveSpsServerAccess();
  assert.equal(access.mode, SPS_SERVER_ACCESS_MODE.UNCONFIGURED);
  assert.equal(access.dataOwner, "server");
  assert.equal(access.serverRole, "none");
});

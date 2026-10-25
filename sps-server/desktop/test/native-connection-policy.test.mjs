import assert from "node:assert/strict";
import test from "node:test";
import { defaultSpsNativePairingIssue, SPS_NATIVE_PAIRING_DEFAULT_TTL_MS } from "../src/native-connection-policy.mjs";

test("uses the approved one-hour any-verified-user Native invitation defaults", () => {
  const issue = defaultSpsNativePairingIssue("host-user-fixture");
  assert.equal(SPS_NATIVE_PAIRING_DEFAULT_TTL_MS, 3_600_000);
  assert.deepEqual(issue, { actorUserId: "host-user-fixture", target: { kind: "any_verified_user" }, ttlMs: 3_600_000 });
  assert.equal(Object.isFrozen(issue), true);
  assert.equal(Object.isFrozen(issue.target), true);
});

test("does not invent a Host identity or accept unbounded user labels", () => {
  for (const value of [undefined, null, "", "  ", "user\n", "x".repeat(201), { actorUserId: "host" }]) {
    assert.throws(() => defaultSpsNativePairingIssue(value), TypeError);
  }
});

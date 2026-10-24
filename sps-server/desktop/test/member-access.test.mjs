import test from "node:test";
import assert from "node:assert/strict";
import { isSpsTechnicalMemberAccessRemoved, SPS_TECHNICAL_MEMBER_REMOVED_CODE } from "../src/member-access.mjs";

test("distinguishes a removed technical Member from an ordinary Node revocation", () => {
  assert.equal(isSpsTechnicalMemberAccessRemoved({ status: 403, code: SPS_TECHNICAL_MEMBER_REMOVED_CODE }), true);
  assert.equal(isSpsTechnicalMemberAccessRemoved({ status: 403, code: "sps_node_revoked" }), false);
  assert.equal(isSpsTechnicalMemberAccessRemoved({ status: 401, code: SPS_TECHNICAL_MEMBER_REMOVED_CODE }), false);
});

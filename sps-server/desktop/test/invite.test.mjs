import test from "node:test";
import assert from "node:assert/strict";
import { buildInviteUrl, parseSpsJoinUri, spsCodeToInviteToken } from "../src/invite.mjs";

test("converts a human SPS code to the Hub invite token", () => {
  assert.equal(spsCodeToInviteToken("sps-ab12-cd34"), "pcp_invite_ab12cd34");
  assert.equal(spsCodeToInviteToken("not a code"), null);
});

test("builds the browser invite URL without preserving unsafe path fragments", () => {
  assert.equal(
    buildInviteUrl("https://hub.example.test/anything?old=1", "SPS-AB12-CD34"),
    "https://hub.example.test/invite/pcp_invite_ab12cd34",
  );
});

test("accepts only a valid SPS desktop join link", () => {
  assert.deepEqual(
    parseSpsJoinUri("sps://join?hub=https%3A%2F%2Fhub.example.test&code=SPS-AB12-CD34"),
    { hub: "https://hub.example.test", code: "SPS-AB12-CD34" },
  );
  assert.equal(parseSpsJoinUri("sps://other?hub=https%3A%2F%2Fhub.example.test&code=SPS-AB12-CD34"), null);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInviteUrl,
  createSpsRoutedInviteCode,
  findSpsJoinUriArg,
  normalizeSpsInviteToken,
  parseSpsJoinUri,
  parseSpsRoutedInviteCode,
  spsCodeToInviteToken,
  spsInviteTokenToCode,
} from "../src/invite.mjs";

test("converts a human SPS code to the team invitation token", () => {
  assert.equal(spsCodeToInviteToken("sps-ab12-cd34"), "sps_invite_ab12cd34");
  assert.equal(spsCodeToInviteToken("sps-ab12-cd34-ef56-gh78"), "sps_invite_ab12cd34ef56gh78");
  assert.equal(spsCodeToInviteToken("not a code"), null);
});

test("builds the browser invite URL without preserving unsafe path fragments", () => {
  assert.equal(
    buildInviteUrl("https://hub.example.test/anything?old=1", "SPS-AB12-CD34-EF56-GH78"),
    "https://hub.example.test/invite/sps_invite_ab12cd34ef56gh78",
  );
  assert.equal(
    buildInviteUrl("https://hub.example.test", "sps_invite_ab12cd34ef56gh78"),
    "https://hub.example.test/invite/sps_invite_ab12cd34ef56gh78",
  );
  assert.equal(normalizeSpsInviteToken("sps_invite_ab12cd34ef56gh78"), "sps_invite_ab12cd34ef56gh78");
  assert.equal(spsInviteTokenToCode("sps_invite_ab12cd34ef56gh78"), "SPS-AB12-CD34-EF56-GH78");
});

test("does not build an invite link for an insecure Hub", () => {
  assert.throws(() => buildInviteUrl("http://hub.example.test", "SPS-AB12-CD34-EF56-GH78"), /must use HTTPS/);
  assert.equal(parseSpsJoinUri("sps://join?hub=http%3A%2F%2Fhub.example.test&code=SPS-AB12-CD34-EF56-GH78"), null);
});

test("routes a member invitation to a fresh Desktop without exposing an Owner invite", () => {
  const routed = createSpsRoutedInviteCode("https://owner-pc.example.ts.net/old-path", "SPS-AB12-CD34-EF56-GH78");
  assert.match(routed, /^SPS2-[A-Za-z0-9_-]+$/);
  assert.deepEqual(parseSpsRoutedInviteCode(routed), {
    hub: "https://owner-pc.example.ts.net",
    code: "SPS-AB12-CD34-EF56-GH78",
  });
  assert.equal(parseSpsRoutedInviteCode("SPS2-not-valid-base64"), null);
  assert.equal(parseSpsRoutedInviteCode(`SPS2-${"a".repeat(1024)}`), null);
  const unsafePayload = Buffer.from(JSON.stringify({ v: 1, hub: "http://owner-pc.example.ts.net", code: "SPS-AB12-CD34" })).toString("base64url");
  assert.equal(parseSpsRoutedInviteCode(`SPS2-${unsafePayload}`), null);
});

test("accepts only a valid SPS desktop join link", () => {
  assert.deepEqual(
    parseSpsJoinUri("sps://join?hub=https%3A%2F%2Fhub.example.test%2Fstale-path&code=SPS-AB12-CD34-EF56-GH78"),
    { hub: "https://hub.example.test", code: "SPS-AB12-CD34-EF56-GH78" },
  );
  assert.equal(parseSpsJoinUri("sps://other?hub=https%3A%2F%2Fhub.example.test&code=SPS-AB12-CD34-EF56-GH78"), null);
  assert.equal(parseSpsJoinUri("sps://join?hub=file%3A%2F%2F%2Fnot-a-hub&code=SPS-AB12-CD34-EF56-GH78"), null);
  assert.equal(parseSpsJoinUri("not a uri"), null);
});

test("finds a valid invitation in the initial Windows command line", () => {
  const joinArg = "sps://join?hub=https%3A%2F%2Fhub.example.test&code=SPS-AB12-CD34-EF56-GH78";
  assert.equal(findSpsJoinUriArg(["SPS Desktop.exe", "--other", joinArg]), joinArg);
  assert.equal(findSpsJoinUriArg(["SPS Desktop.exe", "sps://join?hub=file%3A%2F%2F%2Fbad&code=SPS-AB12-CD34-EF56-GH78"]), null);
});
